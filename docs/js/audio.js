/* =====================================================================
   EXAMPLE AUDIO

   One entry point — Example.play(sentence, handlers) — behind which the
   sound source can change without app.js knowing:

     1. recorded file   AUDIO.base + <voice>/<hash>.mp3   ← paid TTS
     2. native TTS      Capacitor TextToSpeech            ← the APK, offline
     3. Web Speech      SpeechSynthesis ko-KR             ← browser and PWA
     4. nothing playable → the caller shows a notice

   Since 2026-08-19 step 1 covers every sentence in data.js: 50 sentences ×
   two voices, generated with the Typecast API (ssfm-v30, Lite plan) and
   shipped in docs/audio/. Steps 2 and 3 stay because a file can still fail
   to load — a half-written cache entry, a sentence edited after the clip
   was made — and because the fallback costs nothing to keep.

   Which voice: localStorage 'naruve.voice', "m" or "f", default "f".
   Onboarding (P6-B) will set it; until then the Settings tab has a
   temporary switch.

   Android System WebView — which is what Capacitor runs — does not
   implement Web Speech synthesis. That is why step 2 exists at all, and
   why "no Web Speech" must never be reported as "this viewer blocks
   audio, open it in Chrome": inside the APK there is no Chrome to open.
   ===================================================================== */

/* A-4: moving to external storage is this one line. Keep the trailing
   slash. Relative while it lives in docs/ — see CLAUDE.md on paths. */
var AUDIO = {
  base: './audio/',
  manifest: 'index.json',
  ext: '.mp3',
  voices: ['m', 'f'],
  defVoice: 'f',
  voiceKey: 'naruve.voice'
};

/* Filename is a hash of the Korean text, so it is stable across edits to
   anything else and it changes exactly when the sentence changes — which
   is precisely when the recording is stale too. scripts/tts/build_final.py
   computes the same value; if the two ever disagree every clip goes silent
   and falls back to TTS, so neither side may be "improved" alone. */
function audioName(s){
  var h = 0x811c9dc5, str = s.k;
  for (var i=0;i<str.length;i++){
    h ^= str.charCodeAt(i);
    h = (h + ((h<<1)+(h<<4)+(h<<7)+(h<<8)+(h<<24))) >>> 0;
  }
  return ('0000000' + h.toString(16)).slice(-8) + AUDIO.ext;
}
function audioVoice(){
  try {
    var v = localStorage.getItem(AUDIO.voiceKey);
    if (AUDIO.voices.indexOf(v) >= 0) return v;
  } catch(e){}
  return AUDIO.defVoice;
}
/* path inside docs/audio/ — this is also the key used in index.json */
function audioRel(s, voice){ return (voice || audioVoice()) + '/' + audioName(s); }
function audioUrl(s, voice){ return AUDIO.base + audioRel(s, voice); }

var Example = (function(){
  var have = null;      /* rel path -> 1, once the manifest is known */
  var cur = null;       /* the thing currently making noise */

  /* Ask once. A missing manifest used to be the normal state; now it means
     the clips did not ship, so say so rather than silently going quiet. */
  (function loadManifest(){
    if (typeof fetch !== 'function') { have = {}; return; }
    fetch(AUDIO.base + AUDIO.manifest, { cache:'no-store' })
      .then(function(r){ return r.ok ? r.json() : []; })
      .then(function(list){
        have = {};
        (Array.isArray(list) ? list : (list.files || [])).forEach(function(n){ have[n]=1; });
        if (!Object.keys(have).length) console.warn('[audio] index.json is empty — every sentence will use device TTS');
      })
      .catch(function(){ have = {}; console.warn('[audio] index.json missing — every sentence will use device TTS'); });
  })();

  function isNative(){
    var C = window.Capacitor;
    return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
  }
  function nativeTTS(){
    if (!isNative()) return null;
    var P = window.Capacitor.Plugins;
    return (P && P.TextToSpeech) ? P.TextToSpeech : null;
  }
  function webSpeech(){
    return !!(window.speechSynthesis && typeof SpeechSynthesisUtterance !== 'undefined');
  }
  /* Only asked when nothing can play AND we are not native, so the
     Android WebView token cannot land here by mistake. */
  function inAppBrowser(){
    return /KAKAOTALK|NAVER\(inapp|Instagram|FBAN|FBAV|Line\/|DaumApps|everytimeApp/i
      .test(navigator.userAgent || '');
  }

  function pitchFor(s){ return s.t==='question' ? 1.25 : (s.t==='exclam' ? 1.15 : 0.95); }
  /* A-6: a question read without its question mark comes out flat. */
  function textFor(s){
    var txt = s.k;
    if (s.t==='question' && !/[?？]\s*$/.test(txt)) txt += '?';
    return txt;
  }

  var koVoice = null;
  function pickVoice(){
    if(!window.speechSynthesis) return;
    var vs = speechSynthesis.getVoices() || [];
    for (var i=0;i<vs.length;i++){
      var lg = (vs[i].lang||'').toLowerCase().replace('_','-');
      if (lg.indexOf('ko')===0){ koVoice = vs[i]; return; }
    }
  }
  if (window.speechSynthesis){
    pickVoice();
    speechSynthesis.onvoiceschanged = pickVoice;
    setTimeout(pickVoice, 600);
  }

  function stop(){
    if (!cur) return;
    try { cur.stop(); } catch(e){}
    cur = null;
  }

  function playFile(url, s, h){
    var a = new Audio(url);
    var started = false;
    a.addEventListener('playing', function(){ started = true; h.onstart(); });
    a.addEventListener('ended', function(){ cur=null; h.onend(); });
    a.addEventListener('error', function(){
      cur = null;
      /* the clip should exist — say which one did not, then fall through
         rather than leaving the learner with nothing */
      if (!started){ console.warn('[audio] clip failed, falling back to TTS:', url); speak(s, h); }
      else h.onerror('failed');
    });
    cur = { stop: function(){ a.pause(); } };
    a.play().catch(function(){
      cur=null;
      if(!started){ console.warn('[audio] play() rejected, falling back to TTS:', url); speak(s,h); }
    });
  }

  function speak(s, h){
    var tts = nativeTTS();
    if (tts){
      h.onstart();
      cur = { stop: function(){ try{ tts.stop(); }catch(e){} } };
      tts.speak({
        text: textFor(s), lang:'ko-KR',
        rate: 0.85, pitch: pitchFor(s), volume: 1.0, category:'ambient'
      }).then(function(){ cur=null; h.onend(); },
              function(){ cur=null; h.onerror('failed'); });
      return;
    }

    if (webSpeech()){
      speechSynthesis.cancel(); pickVoice();
      var u = new SpeechSynthesisUtterance(textFor(s));
      u.lang='ko-KR'; u.rate=0.82; u.volume=1; u.pitch=pitchFor(s);
      if (koVoice) u.voice = koVoice;
      var started=false;
      h.onstart();
      u.onstart=function(){ started=true; };
      u.onend=function(){ cur=null; h.onend(); };
      u.onerror=function(){ cur=null; h.onerror('failed'); };
      cur = { stop: function(){ speechSynthesis.cancel(); } };
      speechSynthesis.speak(u);
      /* some browsers accept the utterance and stay silent */
      setTimeout(function(){
        if (!started && cur){ cur=null; h.onerror('failed'); }
      }, 1400);
      setTimeout(function(){ if (cur){ cur=null; h.onend(); } }, 9000);
      return;
    }

    h.onerror(inAppBrowser() ? 'inapp' : 'unsupported');
  }

  return {
    play: function(s, h){
      stop();
      var rel = audioRel(s);
      /* have === null means the manifest has not landed yet. Try the file
         anyway: this call is inside a user gesture and deferring it through
         a promise can cost the gesture, which is what browsers check before
         letting audio start. A wrong guess costs one failed request and
         lands in the same fallback. */
      if (have === null || have[rel]) { playFile(AUDIO.base + rel, s, h); return; }
      console.warn('[audio] no clip listed for', rel, '— using device TTS');
      speak(s, h);
    },
    stop: stop,
    /* which recorded voice the clips come from — "m" or "f" */
    voice: audioVoice,
    setVoice: function(v){
      if (AUDIO.voices.indexOf(v) < 0) return audioVoice();
      try { localStorage.setItem(AUDIO.voiceKey, v); } catch(e){}
      return v;
    },
    /* for diagnostics and tests */
    _state: function(){
      return { native:isNative(), tts:!!nativeTTS(), web:webSpeech(),
               inApp:inAppBrowser(), voice:audioVoice(),
               files: have ? Object.keys(have).length : null };
    }
  };
})();
