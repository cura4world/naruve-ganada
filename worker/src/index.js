/**
 * Naruve 가나다 — 채점 프록시 (P4: Azure 실호출)
 *
 * DECISIONS.md 17.1  앱은 우리 Worker로 보내고 Worker가 Azure를 부른다.
 *                    구독키는 Secret에만 있고 앱 배포물에는 들어가지 않는다.
 * DECISIONS.md 17.2  **Workers는 전달만 한다.** 음성을 디코딩·리샘플·변환하지
 *                    않는다. 요청당 CPU 10ms 제한이 있어 손대면 넘는다.
 *                    받은 WAV 바이트를 그대로 Azure로 넘긴다.
 * DECISIONS.md 8.8   **참조 텍스트의 띄어쓰기는 채점 파라미터다.** 같은 발화가
 *                    66 ~ 97.6점으로 움직인다. 서버가 참조 텍스트를 고치지 않는다 —
 *                    클라이언트가 보낸 글자 그대로 보낸다.
 * DECISIONS.md 8.10  EnableMiscue는 삽입·누락을 잡는 설정이다. true로 보낸다.
 *                    어절이 참조와 일대일로 맞으면 false와 표면 점수가 같다(32건 실측).
 * DECISIONS.md 16.6  저장 키는 UUID가 앞이다. "이 UUID로 시작하는 것 전부"로
 *                    삭제가 한 줄이 되어야 한다. 나중에 못 바꾼다.
 * DECISIONS.md 16.1  채점결과 페이로드는 Azure 응답 전체를 포함한다 →
 *                    응답 원본을 R2에 .azure.json으로 같이 남긴다.
 * DECISIONS.md 18    무료는 30회 총량. 서버가 세야 실제 제한이다(17.1).
 *
 * 요청 규격은 scripts/adapters/azure.py(2026-08-10 실호출로 확정)를 그대로 옮긴 것이다.
 * 엔드포인트·쿼리·헤더 이름·PA 헤더의 Base64 JSON 구성이 같다.
 */

// 첫 버전은 웹 origin 하나뿐이다. capacitor://localhost 와 http://localhost 는
// APK에서 실제로 무엇이 오는지 실측한 뒤 추가한다. 추측으로 넣지 않는다.
const ALLOWED_ORIGIN = "https://naruve.app";

// mic.js가 16kHz/16bit/mono로 만들고 상한이 10초다 → 320KB. 여유를 두고 400KB.
const MAX_BODY = 400 * 1024;

// 18절 — 설치당 1회 지급되는 총량.
const FREE_CREDITS = 30;

// 개발자·테스터는 총량을 세지 않는다. 응답 credits를 이 값으로 주고
// 클라이언트가 "∞"로 표시한다. 0 이상으로 두면 남은 회수와 구별되지 않는다.
const DEV_CREDITS = -1;

/**
 * DEV_UUIDS — 콤마로 구분한 UUID 목록. wrangler.toml [vars]가 아니라 Secret이다.
 * 값 자체는 익명 식별자라 비밀이 아니지만, 이 목록에 오르는 것은 "과금 없이
 * 무제한"이라는 권한이므로 코드·저장소에 남기지 않는다. 등록 절차는 worker/README.md.
 *
 * 예외는 차감과 402에만 적용된다. R2 저장과 로그는 그대로다 — 테스터 음성도
 * 데이터이고, 16.1이 채점결과 페이로드를 남기라고 한 대상에서 빠질 이유가 없다.
 */
function isDevUuid(env, uuid) {
  const raw = env.DEV_UUIDS;
  if (!raw) return false;
  const want = uuid.toLowerCase();
  return String(raw)
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .some((s) => s && s === want);
}

// Azure 응답을 8초까지 기다린다. 넘으면 실패로 보고 크레딧을 깎지 않는다.
const AZURE_TIMEOUT_MS = 8000;

// 참조 텍스트 상한. data.js의 최장 문장이 19자다(50문장 평균 10.8자).
// 120자는 그 6배이고, R2 customMetadata 총량 한도(약 2KB) 안에 최악의 인코딩
// (문자당 12바이트)으로도 들어간다. 상한이 없으면 긴 헤더 하나가 Azure 호출을
// 태우고 R2 put에서 터진다 — 실제로 그렇게 터졌다.
const MAX_REF_CHARS = 120;

// 8-4-4-4-12 hex. 버전·variant 자리는 묶지 않는다 — 클라이언트가 어떤 UUID
// 생성기를 쓰든 형식만 맞으면 받는다. 지금은 crypto.randomUUID()(v4)다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// R2 키 조각으로 그대로 들어가므로 경로 구분자·상위 이동을 막는다.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-Naruve-UUID, X-Naruve-Session, X-Naruve-Recording, X-Naruve-Ref",
  "Access-Control-Max-Age": "86400",
  Vary: "Origin",
};

function json(body, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...CORS },
  });
}

/** UTC 기준 YYYY-MM-DD. 엣지마다 지역시가 다르므로 UTC로 고정한다. */
function today() {
  return new Date().toISOString().slice(0, 10);
}

/**
 * REST 응답은 점수를 평평하게 준다(2026-08-10 실측: NBest[0].PronScore).
 * 스키마 문서에는 PronunciationAssessment 밑에 있다. 둘 다 본다.
 */
function field(node, name) {
  if (!node) return null;
  if (node[name] !== undefined) return node[name];
  const pa = node.PronunciationAssessment;
  return pa && pa[name] !== undefined ? pa[name] : null;
}

/** Azure 요청 — azure.py의 pa_config / _endpoint / assess와 같은 구성. */
function azureRequest(env, ref, body) {
  const endpoint =
    `https://${env.AZURE_REGION}.stt.speech.microsoft.com` +
    `/speech/recognition/conversation/cognitiveservices/v1` +
    `?language=ko-KR&format=detailed`;

  const cfg = {
    ReferenceText: ref,
    GradingSystem: "HundredMark",
    Granularity: "Phoneme",
    Dimension: "Comprehensive",
    // 8.10 — 삽입·누락 감지. 참조와 어절이 일대일이면 false와 표면 점수가 같다.
    EnableMiscue: true,
    // 8.7 — 이름은 빈 문자열로 오지만 Score에는 값이 있다. 요청해야 온다.
    // 지금 클라이언트 응답에는 싣지 않고 .azure.json에만 남는다.
    NBestPhonemeCount: 5,
  };
  // ko-KR에는 ProsodyScore가 오지 않는다(8절 실측). 켜지 않는다.

  // 헤더는 ASCII만 담을 수 있다. JSON을 UTF-8로 만들고 Base64로 싼다.
  const raw = new TextEncoder().encode(JSON.stringify(cfg));
  let bin = "";
  for (const b of raw) bin += String.fromCharCode(b);
  const paHeader = btoa(bin);

  return fetch(endpoint, {
    method: "POST",
    body,
    headers: {
      "Ocp-Apim-Subscription-Key": env.AZURE_SPEECH_KEY,
      "Content-Type": "audio/wav; codecs=audio/pcm; samplerate=16000",
      "Pronunciation-Assessment": paHeader,
      Accept: "application/json",
      "User-Agent": "naruve-ganada-score",
    },
    signal: AbortSignal.timeout(AZURE_TIMEOUT_MS),
  });
}

/** 클라이언트에 돌려줄 요약. 음소 배열은 넣지 않는다 — 원본은 R2에 있다. */
function summarize(resp) {
  const n = (resp.NBest || [])[0] || null;
  return {
    pronScore: field(n, "PronScore"),
    accuracyScore: field(n, "AccuracyScore"),
    fluencyScore: field(n, "FluencyScore"),
    completenessScore: field(n, "CompletenessScore"),
    words: ((n && n.Words) || []).map((w) => ({
      word: w.Word,
      accuracyScore: field(w, "AccuracyScore"),
      errorType: field(w, "ErrorType"),
      // 100ns 단위 그대로 넘긴다. 변환은 클라이언트가 한다.
      offset: w.Offset,
      duration: w.Duration,
    })),
  };
}

async function handleScore(request, env) {
  const uuid = request.headers.get("X-Naruve-UUID");
  const session = request.headers.get("X-Naruve-Session");
  const recording = request.headers.get("X-Naruve-Recording");
  const refRaw = request.headers.get("X-Naruve-Ref");

  if (!uuid || !UUID_RE.test(uuid)) {
    return json({ error: "bad_uuid" }, 400);
  }
  if (!session || !ID_RE.test(session)) {
    return json({ error: "bad_session" }, 400);
  }
  if (!recording || !ID_RE.test(recording)) {
    return json({ error: "bad_recording" }, 400);
  }

  // 참조 텍스트는 URL-encoded UTF-8로 온다. 헤더에 한글을 그대로 담을 수 없다.
  let ref = null;
  if (refRaw) {
    try {
      ref = decodeURIComponent(refRaw);
    } catch {
      return json({ error: "bad_ref" }, 400);
    }
  }
  // 8.8 — 띄어쓰기가 채점 파라미터다. trim·정규화를 하지 않는다.
  // 빈 문자열과 상한 초과만 거른다.
  if (!ref) {
    return json({ error: "bad_ref" }, 400);
  }
  if (ref.length > MAX_REF_CHARS) {
    return json({ error: "ref_too_long", max: MAX_REF_CHARS, got: ref.length }, 400);
  }

  // audio/wav 만 받는다. 파라미터가 붙어 올 수 있으므로 세미콜론 앞만 본다.
  const ctype = (request.headers.get("Content-Type") || "")
    .split(";")[0]
    .trim()
    .toLowerCase();
  if (ctype !== "audio/wav") {
    return json({ error: "bad_content_type", got: ctype || null }, 415);
  }

  // 헤더로 먼저 거른다. 본문을 다 읽고 나서 재기 전에 끊는 쪽이 싸다.
  const declared = Number(request.headers.get("Content-Length"));
  if (Number.isFinite(declared) && declared > MAX_BODY) {
    return json({ error: "too_large", max: MAX_BODY, got: declared }, 413);
  }

  const body = await request.arrayBuffer();
  if (body.byteLength === 0) {
    return json({ error: "empty_body" }, 400);
  }
  // Content-Length가 없거나 거짓말일 수 있으므로 실제 바이트로 한 번 더 본다.
  if (body.byteLength > MAX_BODY) {
    return json({ error: "too_large", max: MAX_BODY, got: body.byteLength }, 413);
  }

  // 크레딧. 키가 없으면 이번이 첫 요청이므로 30에서 시작한다.
  // 개발자·테스터는 KV를 읽지도 쓰지도 않고 402도 맞지 않는다.
  const dev = isDevUuid(env, uuid);
  const creditKey = `${uuid}:credits`;
  let credits = DEV_CREDITS;

  if (!dev) {
    const stored = await env.KV.get(creditKey);
    credits = stored === null ? FREE_CREDITS : Number(stored);
    if (!Number.isFinite(credits) || credits < 0) credits = 0;

    if (credits <= 0) {
      return json({ reason: "credits_exhausted", credits: 0 }, 402);
    }
  }

  // --- Azure. 실패하면 여기서 끝난다. 저장도 차감도 하지 않는다. ---
  let azureResp;
  let azureText;
  try {
    azureResp = await azureRequest(env, ref, body);
    azureText = await azureResp.text();
  } catch (e) {
    // AbortSignal.timeout → TimeoutError. 그 외 네트워크 오류도 같이 잡힌다.
    const kind = e && e.name === "TimeoutError" ? "timeout" : "network_error";
    return json({ reason: "azure_failed", status: kind }, 502);
  }

  if (!azureResp.ok) {
    return json({ reason: "azure_failed", status: azureResp.status }, 502);
  }

  let parsed;
  try {
    parsed = JSON.parse(azureText);
  } catch {
    return json({ reason: "azure_failed", status: "bad_json" }, 502);
  }

  if (parsed.RecognitionStatus !== "Success") {
    return json(
      { reason: "azure_failed", status: parsed.RecognitionStatus || "no_status" },
      502
    );
  }

  // 무음·잡음도 RecognitionStatus는 Success로 온다(2026-08-18 실측: 무음 WAV와
  // 무작위 바이트 둘 다 200 / 점수 0 / ErrorType Omission). 상태 코드로는 갈리지
  // 않으므로 Words를 직접 본다. 하나도 못 알아들은 시도에 크레딧을 깎지 않는다.
  const words = ((parsed.NBest || [])[0] || {}).Words || [];
  const heard = words.filter((w) => field(w, "ErrorType") !== "Omission");
  if (heard.length === 0) {
    return json({ reason: "nothing_recognized" }, 422);
  }

  // --- 성공했을 때만 저장하고 깎는다. ---
  const base = `${uuid}/${today()}/${session}/${recording}`;
  const r2Key = `${base}.wav`;

  // 참조 텍스트는 한글이라 customMetadata에 그대로 넣으면 헤더 인코딩에 걸린다.
  // URL-encoded로 저장한다 — 꺼낼 때 decodeURIComponent 하면 원문이다.
  const meta = {
    ref: encodeURIComponent(ref),
    sessionId: session,
    recordingId: recording,
  };

  // 저장이 실패하면 차감하지 않는다. 예외를 그냥 두면 Workers가 1101을 던져
  // 클라이언트가 이유를 알 수 없다 — Azure는 이미 불린 뒤다.
  try {
    await env.AUDIO.put(r2Key, body, {
      httpMetadata: { contentType: "audio/wav" },
      customMetadata: meta,
    });
    // 16.1 — 채점결과 페이로드에 Azure 응답 전체. 음소 점수도 여기에만 남는다.
    await env.AUDIO.put(`${base}.azure.json`, azureText, {
      httpMetadata: { contentType: "application/json; charset=utf-8" },
      customMetadata: meta,
    });
  } catch {
    return json({ error: "storage_failed" }, 500);
  }

  // 저장까지 끝난 뒤에만 깎는다. 테스터는 깎을 것이 없다.
  if (!dev) {
    credits -= 1;
    await env.KV.put(creditKey, String(credits));
  }

  return json({ credits, r2Key, azure: summarize(parsed) });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: CORS });
    }

    if (pathname === "/health") {
      if (request.method !== "GET") return json({ error: "method_not_allowed" }, 405);
      // 키 값은 절대 돌려주지 않는다. Secret이 꽂혔는지만 boolean으로 알린다.
      // DEV_UUIDS도 값이 아니라 몇 개 들어 있는지만 — 목록을 흘리면 아무나
      // 그 UUID를 헤더에 넣어 무제한으로 쓸 수 있다.
      const devCount = env.DEV_UUIDS
        ? String(env.DEV_UUIDS).split(",").map((s) => s.trim()).filter(Boolean).length
        : 0;
      return json({
        ok: true,
        region: env.AZURE_REGION,
        hasKey: !!env.AZURE_SPEECH_KEY,
        devUuids: devCount,
      });
    }

    if (pathname === "/score") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return handleScore(request, env);
    }

    return json({ error: "not_found" }, 404);
  },
};
