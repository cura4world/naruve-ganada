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
      pron: r.azure ? r.azure.pronScore : null,
      acc: r.azure ? r.azure.accuracyScore : null,
      words: r.azure ? r.azure.words.map(function(w){
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

      /* 18절 — 소진 상태에서는 서버를 부르지 않는다. 억양만 보여준다. */
      if (Identity.credits() <= 0){
        res.error = 'exhausted';
        res.credits = 0;
        record(sentence, res, cap);
        cb(res, false);
        return;
      }

      Api.score(sentence.k, cap.wav, {
        uuid: Identity.uuid(),
        session: Identity.session(),
        recording: Identity.newRecordingId()
      }, function(err, data){
        if (err){
          res.error = err.kind;
          if (err.kind === 'exhausted'){ Identity.setCredits(0); res.credits = 0; }
          record(sentence, res, cap);
          cb(res, false);
          return;
        }

        res.azure = data.azure;
        res.total = data.azure ? data.azure.pronScore : null;
        res.r2Key = data.r2Key;
        if (typeof data.credits === 'number'){
          Identity.setCredits(data.credits);
          res.credits = data.credits;
        }
        /* only a real, billed answer is worth caching */
        cache[key] = res;
        record(sentence, res, cap);
        cb(res, false);
      });
    },
    cached: function(){ return Object.keys(cache).length; },
    log: function(){ return log.slice(); },
    dump: function(){ return JSON.stringify({ into:INTO, takes:log }, null, 1); },
    reset: function(){ cache = {}; log = []; }
  };
})();
