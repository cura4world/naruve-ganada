/* =====================================================================
   SCORING BOUNDARY

   Everything that turns a recording into numbers goes through
   Score.evaluate(sentence, capture, cb). app.js does not know which
   engine answered, so swapping the engine is a change in this file only.

   Engines, in the order they are meant to arrive:
     placeholder  ← now. Random within bands. Marked as such everywhere.
     intonation   ← next. F0 slope on the final syllable, on-device, free.
     recognition  ← native speech recognition, syllable accuracy.
     cloud        ← paid precision mode. Never the default.

   A-3, the repeat guard: a result is cached against the sentence AND a
   fingerprint of the audio. Pressing retry after actually speaking again
   is a new take and scores again; re-submitting the same audio does not
   pay twice. That matters the moment an engine costs money per call.
   ===================================================================== */

var Score = (function(){
  var cache = {};
  var log = [];          /* B-5 calibration trail, read in dev mode */

  function syllables(k){
    return k.split('').filter(function(ch){ return ch!==' ' && !/[,.?!？]/.test(ch); });
  }

  /* cheap but take-specific: length, peak, and a scatter of samples */
  function fingerprint(sentence, cap){
    var h = 0x811c9dc5;
    function mix(n){ h ^= n|0; h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0; }
    for (var i=0;i<sentence.k.length;i++) mix(sentence.k.charCodeAt(i));
    mix(cap.pcm.length); mix(Math.round(cap.peak*10000)); mix(cap.speechMs);
    var step = Math.max(1, Math.floor(cap.pcm.length/64));
    for (var j=0;j<cap.pcm.length;j+=step) mix(Math.round(cap.pcm[j]*10000));
    return h.toString(16);
  }

  /* NOT a measurement. Random inside the SIMULATE bands, exactly as the
     prototype did, kept only so the result UI has something to render
     until the real engines land. Everything it returns is labelled. */
  function placeholder(sentence){
    var L = LEVELS[level], out = [];
    syllables(sentence.k).forEach(function(ch){
      var band = sentence.w.indexOf(ch) >= 0 ? L.weak : L.ok;
      out.push({ ch:ch, score: band[0] + Math.floor(Math.random()*(band[1]-band[0]+1)) });
    });
    var sum = 0;
    out.forEach(function(o){ sum += o.score; });
    return {
      engine: 'placeholder',
      measured: false,          /* nothing here came from the audio */
      total: Math.round(sum / Math.max(1,out.length)),
      syllables: out
    };
  }

  return {
    evaluate: function(sentence, cap, cb){
      var key = fingerprint(sentence, cap);
      if (cache[key]){ cb(cache[key], true); return; }
      var r = placeholder(sentence, cap);
      r.capture = { ms:cap.ms, speechMs:cap.speechMs, keptMs:cap.keptMs,
                    trimmedMs:cap.trimmedMs, peak:cap.peak, bytes:cap.wav.size };
      cache[key] = r;
      log.push({ k:sentence.k, t:sentence.t, engine:r.engine, total:r.total,
                 speechMs:cap.speechMs, keptMs:cap.keptMs, peak:+cap.peak.toFixed(4) });
      if (log.length > 50) log.shift();
      cb(r, false);
    },
    cached: function(){ return Object.keys(cache).length; },
    log: function(){ return log.slice(); },
    reset: function(){ cache = {}; log = []; }
  };
})();
