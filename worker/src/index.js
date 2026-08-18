/**
 * Naruve 가나다 — 채점 프록시 (P3: 뼈대. Azure는 아직 부르지 않는다)
 *
 * DECISIONS.md 17.1  앱은 우리 Worker로 보내고 Worker가 Azure를 부른다.
 *                    구독키는 Secret에만 있고 앱 배포물에는 들어가지 않는다.
 * DECISIONS.md 17.2  **Workers는 전달만 한다.** 음성을 디코딩·리샘플·변환하지
 *                    않는다. 요청당 CPU 10ms 제한이 있어 손대면 넘는다.
 *                    여기서 보는 것은 Content-Type과 크기뿐이다.
 * DECISIONS.md 16.6  저장 키는 UUID가 앞이다. "이 UUID로 시작하는 것 전부"로
 *                    삭제가 한 줄이 되어야 한다. 나중에 못 바꾼다.
 * DECISIONS.md 18    무료는 30회 총량. 서버가 세야 실제 제한이다(17.1).
 *
 * 이번 단계에서 /score는 Azure를 부르지 않고 { stub: true }를 돌려준다.
 * 검사·저장·차감까지의 경로를 먼저 세우는 것이 목적이고, P4에서 stub 자리가
 * Azure 응답으로 바뀐다.
 */

// 첫 버전은 웹 origin 하나뿐이다. capacitor://localhost 와 http://localhost 는
// APK에서 실제로 무엇이 오는지 P4에서 실측한 뒤 추가한다. 추측으로 넣지 않는다.
const ALLOWED_ORIGIN = "https://naruve.app";

// mic.js가 16kHz/16bit/mono로 만들고 상한이 10초다 → 320KB. 여유를 두고 400KB.
const MAX_BODY = 400 * 1024;

// 18절 — 설치당 1회 지급되는 총량.
const FREE_CREDITS = 30;

// 8-4-4-4-12 hex. 버전·variant 자리는 묶지 않는다 — 클라이언트가 어떤 UUID
// 생성기를 쓰든 형식만 맞으면 받는다. 지금은 crypto.randomUUID()(v4)다.
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// R2 키 조각으로 그대로 들어가므로 경로 구분자·상위 이동을 막는다.
const ID_RE = /^[A-Za-z0-9_-]{1,64}$/;

const CORS = {
  "Access-Control-Allow-Origin": ALLOWED_ORIGIN,
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, X-Naruve-UUID, X-Naruve-Session, X-Naruve-Recording",
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

async function handleScore(request, env) {
  const uuid = request.headers.get("X-Naruve-UUID");
  const session = request.headers.get("X-Naruve-Session");
  const recording = request.headers.get("X-Naruve-Recording");

  if (!uuid || !UUID_RE.test(uuid)) {
    return json({ error: "bad_uuid" }, 400);
  }
  if (!session || !ID_RE.test(session)) {
    return json({ error: "bad_session" }, 400);
  }
  if (!recording || !ID_RE.test(recording)) {
    return json({ error: "bad_recording" }, 400);
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
  const creditKey = `${uuid}:credits`;
  const stored = await env.KV.get(creditKey);
  let credits = stored === null ? FREE_CREDITS : Number(stored);
  if (!Number.isFinite(credits) || credits < 0) credits = 0;

  if (credits <= 0) {
    return json({ reason: "credits_exhausted", credits: 0 }, 402);
  }

  // 저장 → 차감 순서다. 저장이 실패하면 차감하지 않는다.
  const r2Key = `${uuid}/${today()}/${session}/${recording}.wav`;
  await env.AUDIO.put(r2Key, body, {
    httpMetadata: { contentType: "audio/wav" },
  });

  credits -= 1;
  await env.KV.put(creditKey, String(credits));

  // stub은 P4에서 Azure 응답으로 대체된다.
  return json({ stub: true, credits, r2Key });
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
      return json({
        ok: true,
        region: env.AZURE_REGION,
        hasKey: !!env.AZURE_SPEECH_KEY,
      });
    }

    if (pathname === "/score") {
      if (request.method !== "POST") return json({ error: "method_not_allowed" }, 405);
      return handleScore(request, env);
    }

    return json({ error: "not_found" }, 404);
  },
};
