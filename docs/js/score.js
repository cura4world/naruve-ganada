/* =====================================================================
   SCORING BOUNDARY

   Everything that turns a recording into numbers goes through
   Score.evaluate(sentence, capture, cb). app.js does not know which
   engine answered, so swapping an engine is a change in this file only.

   Layer 1 — intonation — is REAL and free. F0 is measured on-device
   (pitch.js) and the sentence-final contour is compared with the
   sentence's own t: 'question' / 'statement' tag. That tag already drives
   the "Rising — Lift it" instruction on screen; this is what makes the
   instruction and the result agree. Costs nothing, so it runs even when
   the paid layer cannot (DECISIONS.md 18 — the exhausted state still
   shows intonation).

   Layer 2 — pronunciation — is now REAL. Azure via our own Worker
   (DECISIONS.md 17.1). Math.random is gone.

   The headline number is Azure's PronScore. DECISIONS.md 15.10 puts
   intonation on its own line instead of inside the headline, so the two
   layers are no longer blended. SCORE_MIX below is kept for the record
   and is NOT applied — revisiting the blend is a DECISIONS.md item.
   ===================================================================== */

/* Kept, not applied. It was the 30/70 split from the days when layer 2
   was Math.random(). The headline is now PronScore alone (15.10). Do not
   re-wire this without changing DECISIONS.md — the two move together. */
var SCORE_MIX = { intonation: 0.30, pronunciation: 0.70 };

/* 15.10 변경 (2026-08-19, 사용자 결정) — 억양 불일치를 총점에 반영한다.
   그전에는 억양이 자기 줄에만 있었고 큰 숫자는 PronScore 하나였다. 방향을
   틀리게 읽어도 숫자가 그대로면 "억양은 점수가 아니다"로 읽힌다.

   15는 실측 전 잠정값이다. INTO의 임계와 같은 처지라 캘리브레이션에서 같이
   정한다. 원값은 지우지 않는다 — R2의 .azure.json과 로그의 pron이 원본이고
   깎인 값은 화면에만 있다(16절). */
var INTONATION_PENALTY = 15;

/* Provisional. Nobody has measured a real speaker against these yet —
   that is what the calibration log is for. */
var INTO = {
  tailMs: 320,      /* how much of the end counts as "the final syllable" */
  minFrames: 5,     /* fewer voiced frames than this and we do not judge */
  targetSt: 4.0,    /* semitones of movement that count as a full contour */
  clearSt: 1.5      /* below this in magnitude the tail reads as flat */
};

var Score = (function(){
  var cache = {};
  var log = [];

  /* 서버가 이번 실행에서 402를 준 뒤에는 다시 묻지 않는다 (17.3).
     **메모리에만 둔다.** localStorage 에 두면 0.1.18 처럼 새로고침으로도
     풀리지 않는 고착이 된다 — 테스터를 예외 목록에 올려도 서버에 닿지 못했다.
     새로고침·재실행이면 이 값이 사라지고 한 번은 다시 묻는다. */
  var exhausted = false;

  function fingerprint(sentence, cap){
    var h = 0x811c9dc5;
    function mix(n){ h ^= n|0; h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0; }
    for (var i=0;i<sentence.k.length;i++) mix(sentence.k.charCodeAt(i));
    mix(cap.pcm.length); mix(Math.round(cap.peak*10000)); mix(cap.speechMs);
    var step = Math.max(1, Math.floor(cap.pcm.length/64));
    for (var j=0;j<cap.pcm.length;j+=step) mix(Math.round(cap.pcm[j]*10000));
    return h.toString(16);
  }

  /* ---- layer 1: measured, on-device, free ---- */
  function intonation(sentence, cap){
    var trk = Pitch.track(cap.pcm, cap.sampleRate);
    var c = Pitch.finalContour(trk, INTO.tailMs, INTO.minFrames);
    if(!c) return { ok:null, reason:'no-pitch', frames:0, voiced:0 };

    var expect = sentence.t === 'question' ? 'rise' : 'fall';
    var got = c.deltaSt >= INTO.clearSt ? 'rise'
            : c.deltaSt <= -INTO.clearSt ? 'fall' : 'flat';
    var sign = expect === 'rise' ? 1 : -1;
    var ratio = Math.max(-1, Math.min(1, sign * c.deltaSt / INTO.targetSt));

    var voiced = 0;
    for(var i=0;i<trk.f0.length;i++) if(trk.f0[i]>0) voiced++;

    return {
      measured: true,
      score: Math.round(50 + 50*ratio),
      expect: expect, got: got, ok: got === expect,
      deltaSt: +c.deltaSt.toFixed(2),
      slopeSt: +c.slopeSt.toFixed(2),
      startHz: c.startHz, endHz: c.endHz,
      windowMs: c.windowMs, frames: c.frames,
      voiced: voiced, total: trk.frames,
      hz: c.hz,
      thresholds: { clearSt: INTO.clearSt, targetSt: INTO.targetSt, tailMs: INTO.tailMs }
    };
  }

  /* 감점은 방향이 규범인 두 유형에만 건다. intonation()은 t가 'question'이면
     상승, 그 밖이면 하강을 기대하는데 'exclam'이 그 "그 밖"에 싸잡혀 있다.
     감탄문의 끝이 반드시 내려가야 하는 것은 아니므로 판정은 보여주되 점수는
     깎지 않는다. 지금 data.js의 exclam은 둘("대박!" "말도 안 돼!")이다. */
  function penaltyFor(sentence, into){
    if (!into || into.measured !== true || into.ok !== false) return 0;
    if (sentence.t !== 'question' && sentence.t !== 'statement') return 0;
    return INTONATION_PENALTY;
  }

  /* the phrase to put under the score — it says what went wrong, not
     that something did */
  function feedbackKey(into){
    if(!into || into.ok === null) return null;
    if(into.expect === 'rise')
      return into.got === 'rise' ? 'intoRiseGood'
           : into.got === 'flat' ? 'intoRiseFlat' : 'intoRiseFell';
    return into.got === 'fall' ? 'intoFallGood'
         : into.got === 'flat' ? 'intoFallFlat' : 'intoFallRose';
  }

  function record(sentence, r, cap){
    log.push({
      k: sentence.k, t: sentence.t,
      total: r.total,
      rawTotal: r.rawTotal == null ? null : r.rawTotal,
      penalty: r.penalty || 0,
      /* 원값. 감점은 화면에만 있고 여기와 R2에는 남지 않는다 (16절) */
      pron: r.azure ? r.azure.pronScore : null,
      acc: r.azure ? r.azure.accuracyScore : null,
      /* words가 비어 올 일은 서버 규격상 없다(summarize가 항상 배열을 준다).
         그래도 || [] 를 두는 이유는, 여기서 던지면 예외가 프라미스 안에서
         삼켜져 콜백이 아예 오지 않고 — app.js가 콜백에서 녹음 버튼 잠금을
         푸는 탓에 — 버튼이 영영 잠긴 채로 남기 때문이다. */
      words: r.azure ? (r.azure.words || []).map(function(w){
        return { w: w.word, a: w.accuracyScore, e: w.errorType };
      }) : null,
      err: r.error || null,
      into: r.intonation.score == null ? null : r.intonation.score,
      expect: r.intonation.expect || null, got: r.intonation.got || null,
      deltaSt: r.intonation.deltaSt == null ? null : r.intonation.deltaSt,
      slopeSt: r.intonation.slopeSt == null ? null : r.intonation.slopeSt,
      startHz: r.intonation.startHz || null, endHz: r.intonation.endHz || null,
      frames: r.intonation.frames || 0, voiced: r.intonation.voiced || 0,
      windowMs: r.intonation.windowMs || 0,
      reason: r.intonation.reason || null,
      hz: r.intonation.hz || [],
      thresholds: r.intonation.thresholds || null,
      speechMs: cap.speechMs, keptMs: cap.keptMs, peak: +cap.peak.toFixed(4)
    });
    if (log.length > 60) log.shift();
  }

  function base(sentence, cap, into){
    return {
      engine: 'azure+intonation',
      total: null,          /* headline. null means "no number this time" */
      azure: null,
      intonation: into,
      feedback: feedbackKey(into),
      error: null,          /* 'exhausted' | 'nothing' | 'server' | 'network' */
      rawTotal: null,       /* 감점 전 PronScore */
      penalty: 0,           /* 억양 불일치로 깎은 점수 */
      credits: Identity.credits(),
      capture: { ms:cap.ms, rawMs:cap.rawMs, speechMs:cap.speechMs,
                 keptMs:cap.keptMs, trimmedMs:cap.trimmedMs,
                 peak:+cap.peak.toFixed(4), bytes:cap.wav.size }
    };
  }

  return {
    evaluate: function(sentence, cap, cb){
      var key = fingerprint(sentence, cap);
      /* the very same audio must not be billed twice — 10절 재시도 캐시.
         Azure ko-KR is deterministic (8.8 확정 1), so a cached answer is
         the same answer, not a stale one. */
      if (cache[key]){ cb(cache[key], true); return; }

      var into = intonation(sentence, cap);
      var res = base(sentence, cap, into);

      /* 소진 판정의 권위는 서버다(18절). 캐시된 잔여는 화면에 그릴 숫자일 뿐이고
         호출을 막지 않는다 — 막으면 서버가 무슨 말을 하든 들을 기회가 없다.

         0.1.18에서 실제로 그렇게 막혔다. 테스터를 DEV_UUIDS에 올렸는데도 폰의
         localStorage에 굳은 credits=0 때문에 /score를 한 번도 부르지 않았고,
         그래서 credits:-1을 받을 길이 없었다. 새로고침해도 캐시라 그대로였다.
         여기에 있던 사전 차단이 그 원인이었다.

         소진일 때 이 호출이 비싸지도 않다 — worker는 KV만 읽고 Azure·R2보다
         **앞에서** 402를 돌려준다(2026-08-19 실측 0.41초. Azure 경로는 1~3초).
         값이 나가는 것은 WAV 업로드뿐이고, 그것도 정말 소진한 사람이 계속
         녹음할 때만이다. 억양은 이 호출과 무관하게 이미 위에서 재어 두었다. */
      /* 이번 실행에서 이미 402를 받았다. WAV 를 또 올려 같은 답을 받을 이유가 없다.
         억양은 위에서 이미 재었으므로 그 줄은 그대로 나간다. */
      if (exhausted){
        res.error = 'exhausted';
        res.credits = 0;
        record(sentence, res, cap);
        cb(res, false);
        return;
      }

      Api.score(sentence.k, cap.wav, {
        uuid: Identity.uuid(),
        session: Identity.session(),
        recording: Identity.newRecordingId(),
        consent: Identity.consentTier()
      }, function(err, data){
        if (err){
          res.error = err.kind;
          if (err.kind === 'exhausted'){
            Identity.setCredits(0); res.credits = 0;
            exhausted = true;
          }
          record(sentence, res, cap);
          cb(res, false);
          return;
        }

        res.azure = data.azure;
        var raw = data.azure ? data.azure.pronScore : null;
        res.rawTotal = raw;
        res.penalty = (typeof raw === 'number') ? penaltyFor(sentence, into) : 0;
        res.total = (typeof raw === 'number') ? Math.max(0, raw - res.penalty) : null;
        res.r2Key = data.r2Key;
        if (typeof data.credits === 'number'){
          Identity.setCredits(data.credits);
          res.credits = data.credits;
          exhausted = false;
        }
        /* only a real, billed answer is worth caching */
        cache[key] = res;
        record(sentence, res, cap);
        cb(res, false);
      });
    },
    /* 서버가 다시 세어 준 회차가 오면 고착을 푼다 */
    cached: function(){ return Object.keys(cache).length; },
    exhausted: function(){ return exhausted; },
    log: function(){ return log.slice(); },
    dump: function(){ return JSON.stringify({ into:INTO, takes:log }, null, 1); },
    reset: function(){ cache = {}; log = []; exhausted = false; }
  };
})();
