/* =====================================================================
   SCORING BOUNDARY

   Everything that turns a recording into numbers goes through
   Score.evaluate(sentence, capture, cb). app.js does not know which
   engine answered, so swapping an engine is a change in this file only.

   Layer 1 — intonation — is REAL. F0 is measured on-device (pitch.js)
   and the sentence-final contour is compared with the sentence's own
   t: 'question' / 'statement' tag. That tag already drives the "Rising —
   Lift it" instruction on screen; this is what makes the instruction and
   the result agree.

   Layer 2 — pronunciation — is still the placeholder. Random inside the
   SIMULATE bands. It is labelled as such everywhere it surfaces.

   The user sees one number. Dev mode sees both, because a single blended
   number cannot tell you whether the F0 half is working when the other
   half is Math.random().
   ===================================================================== */

/* Blend, revisited when the real pronunciation engine lands — see the
   pending list in CLAUDE.md.

   30/70 because: intonation here is a single feature on the final
   syllable, while pronunciation covers every syllable in the sentence,
   so segmental accuracy carries more information about whether a Korean
   listener understands. But a question read with a falling tail is
   genuinely misheard, so the feature has to cost real points — at 30%
   a fully wrong contour takes about 15 points off the headline, which
   is visible without being catastrophic. */
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

  function syllables(k){
    return k.split('').filter(function(ch){ return ch!==' ' && !/[,.?!？]/.test(ch); });
  }

  function fingerprint(sentence, cap){
    var h = 0x811c9dc5;
    function mix(n){ h ^= n|0; h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0; }
    for (var i=0;i<sentence.k.length;i++) mix(sentence.k.charCodeAt(i));
    mix(cap.pcm.length); mix(Math.round(cap.peak*10000)); mix(cap.speechMs);
    var step = Math.max(1, Math.floor(cap.pcm.length/64));
    for (var j=0;j<cap.pcm.length;j+=step) mix(Math.round(cap.pcm[j]*10000));
    return h.toString(16);
  }

  /* ---- layer 1: measured ---- */
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

  /* the phrase to put under the score — the point of B-3 is that it says
     what went wrong, not that something did */
  function feedbackKey(into){
    if(!into || into.ok === null) return null;
    if(into.expect === 'rise')
      return into.got === 'rise' ? 'intoRiseGood'
           : into.got === 'flat' ? 'intoRiseFlat' : 'intoRiseFell';
    return into.got === 'fall' ? 'intoFallGood'
         : into.got === 'flat' ? 'intoFallFlat' : 'intoFallRose';
  }

  /* ---- layer 2: NOT a measurement ---- */
  function pronunciation(sentence){
    var L = LEVELS[level], out = [];
    syllables(sentence.k).forEach(function(ch){
      var band = sentence.w.indexOf(ch) >= 0 ? L.weak : L.ok;
      out.push({ ch:ch, score: band[0] + Math.floor(Math.random()*(band[1]-band[0]+1)) });
    });
    var sum = 0;
    out.forEach(function(o){ sum += o.score; });
    return { measured:false, score: Math.round(sum/Math.max(1,out.length)), syllables: out };
  }

  function run(sentence, cap){
    var into = intonation(sentence, cap);
    var pron = pronunciation(sentence);
    var usable = into.ok !== null;
    var total = usable
      ? Math.round(SCORE_MIX.intonation*into.score + SCORE_MIX.pronunciation*pron.score)
      : pron.score;

    return {
      engine: usable ? 'intonation+placeholder' : 'placeholder',
      measured: usable,           /* at least one layer came from the audio */
      total: total,
      intonation: into,
      pronunciation: pron,
      feedback: feedbackKey(into),
      mix: SCORE_MIX,
      syllables: pron.syllables
    };
  }

  return {
    evaluate: function(sentence, cap, cb){
      var key = fingerprint(sentence, cap);
      if (cache[key]){ cb(cache[key], true); return; }
      var r = run(sentence, cap);
      r.capture = { ms:cap.ms, rawMs:cap.rawMs, speechMs:cap.speechMs,
                    keptMs:cap.keptMs, trimmedMs:cap.trimmedMs,
                    peak:+cap.peak.toFixed(4), bytes:cap.wav.size };
      cache[key] = r;
      /* B-5: enough to re-derive the verdict later and move the
         thresholds without recording everyone again */
      log.push({
        k: sentence.k, t: sentence.t,
        total: r.total, into: r.intonation.score == null ? null : r.intonation.score,
        pron: r.pronunciation.score, mix: SCORE_MIX.intonation,
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
      cb(r, false);
    },
    cached: function(){ return Object.keys(cache).length; },
    log: function(){ return log.slice(); },
    dump: function(){ return JSON.stringify({ mix:SCORE_MIX, into:INTO, takes:log }, null, 1); },
    reset: function(){ cache = {}; log = []; }
  };
})();
