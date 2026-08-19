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

   ---------------------------------------------------------------------
   ONE ELEMENT, ONE OWNER  (fixed 2026-08-19, build 0.1.18)

   0.1.17 built a fresh `new Audio(url)` per play and hung on to it through
   a closure. On a phone that stacked into a reverb that could not be
   stopped. The mechanism was not "we forgot to pause" — the pause was
   there — it was the *late* rejection of the previous play() promise:

     · tap 2 arrives before tap 1's play() promise settles
     · stop() pauses element 1, which makes its play() reject (AbortError)
     · that rejection handler then cleared the handle to element 2 and
       started device TTS on top of it
     · with the handle gone, every later stop() was a no-op, so tap 3, 4, 5
       each layered another copy that nothing could pause

   So there is now exactly one <audio> for the life of the page, and every
   callback checks that it still owns the speakers (`live === mine`) before
   touching shared state. A stale callback is normal — it must be silent,
   not destructive.
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
  var el   = null;      /* THE audio element. Never a second one. */
  var live = null;      /* the take that currently owns the speakers, or null */

  /* D (2026-08-19) — 예시 음성이 어떨 때는 가깝고 어떨 때는 멀고 작게 들린다.
     가설은 마이크 스트림이 살아 있는 동안 안드로이드가 오디오 경로를 통신
     모드로 돌린다는 것이다. 그것을 가르려면 "재생할 때 마이크가 어떤 상태였나"가
     같은 줄에 있어야 한다. 상태를 읽기만 하고 바꾸지 않는다. */
  function micInfo(){
    try {
      if (typeof Mic === 'undefined' || !Mic.diag) return 'mic=?';
      var d = Mic.diag();
      return 'mic=' + d.states + (d.tracks > 1 ? '(' + d.tracks + ')' : '')
           + ' ctx=' + d.ctx + (d.recording ? ' REC' : '');
    } catch(e){ return 'mic=err'; }
  }

  /* 폰에는 콘솔이 없다. 최근 줄을 들고 있어야 설정 탭에서 꺼내 볼 수 있다. */
  var LOG = [];
  function log(what, detail){
    var line = '[example] ' + what + (detail === undefined ? '' : ' ' + detail);
    if (what === 'play') line += ' ' + micInfo();
    var now = new Date();
    function p2(n){ return (n<10?'0':'') + n; }
    LOG.push(p2(now.getHours()) + ':' + p2(now.getMinutes()) + ':' + p2(now.getSeconds()) + ' ' + line);
    if (LOG.length > 40) LOG.shift();
    try { console.log(line); } catch(e){}
  }

  /* Ask once. A missing manifest used to be the normal state; now it means
     the clips did not ship, so say so rather than silently going quiet. */
  (function loadManifest(){
    if (typeof fetch !== 'function') { have = {}; return; }
    fetch(AUDIO.base + AUDIO.manifest, { cache:'no-store' })
      .then(function(r){ return r.ok ? r.json() : []; })
      .then(function(list){
        have = {};
        (Array.isArray(list) ? list : (list.files || [])).forEach(function(n){ have[n]=1; });
        if (!Object.keys(have).length) console.warn('[example] index.json is empty — every sentence will use device TTS');
      })
      .catch(function(){ have = {}; console.warn('[example] index.json missing — every sentence will use device TTS'); });
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

  /* The single element. Its listeners are attached once and stay for the
     life of the page; they read `live` rather than closing over one take. */
  function element(){
    if (el) return el;
    el = new Audio();
    el.preload = 'auto';

    el.addEventListener('playing', function(){
      if (!live || live.kind !== 'file') return;
      live.started = true;
      live.h.onstart();
    });
    el.addEventListener('ended', function(){
      if (!live || live.kind !== 'file') return;
      log('ended', live.name);
      var h = live.h; live = null; h.onend();
    });
    el.addEventListener('error', function(){
      if (!live || live.kind !== 'file') return;
      var take = live; live = null;
      console.warn('[example] clip failed:', take.url);
      if (!take.started) speak(take.s, take.h);
      else take.h.onerror('failed');
    });
    return el;
  }

  /* Silence everything, whatever is making noise. Safe to call at any time,
     including when nothing is playing. */
  function stop(){
    if (live) log('stop', live.name || live.kind);
    live = null;
    if (el){
      try { el.pause(); } catch(e){}
      try { el.currentTime = 0; } catch(e){}
    }
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch(e){}
    var tts = nativeTTS();
    if (tts){ try { tts.stop(); } catch(e){} }
  }

  function playFile(s, h){
    var a   = element();
    var rel = audioRel(s);
    var url = AUDIO.base + rel;
    var mine = { kind:'file', s:s, h:h, url:url, name:rel, started:false };

    /* pause → rewind → swap src → play, in that order. Swapping src on a
       still-playing element leaves the old decode running on some phones. */
    try { a.pause(); } catch(e){}
    try { a.currentTime = 0; } catch(e){}
    a.src = url;
    live = mine;
    log('play', rel);

    var p;
    try { p = a.play(); } catch(e){ p = null; }
    if (p && p.catch) {
      p.catch(function(err){
        /* A rejection here is usually AbortError: a newer take already took
           the element. That is not an error and must not touch anything —
           `live` no longer points at us. Reacting anyway is exactly what
           stacked the reverb in 0.1.17. */
        if (live !== mine) return;
        live = null;
        console.warn('[example] play() rejected:', (err && err.name) || err, url);
        speak(s, h);
      });
    }
  }

  function speak(s, h){
    var mine = { kind:'tts', s:s, h:h, name:null, started:false };

    /* the file element and any previous utterance both have to go quiet
       before a new voice starts */
    if (el){ try { el.pause(); } catch(e){} }
    try { if (window.speechSynthesis) speechSynthesis.cancel(); } catch(e){}

    var tts = nativeTTS();
    if (tts){
      try { tts.stop(); } catch(e){}
      live = mine;
      log('play', 'native-tts');
      h.onstart();
      tts.speak({
        text: textFor(s), lang:'ko-KR',
        rate: 0.85, pitch: pitchFor(s), volume: 1.0, category:'ambient'
      }).then(function(){ if (live!==mine) return; live=null; log('ended','native-tts'); h.onend(); },
              function(){ if (live!==mine) return; live=null; h.onerror('failed'); });
      return;
    }

    if (webSpeech()){
      pickVoice();
      var u = new SpeechSynthesisUtterance(textFor(s));
      u.lang='ko-KR'; u.rate=0.82; u.volume=1; u.pitch=pitchFor(s);
      if (koVoice) u.voice = koVoice;
      live = mine;
      log('play', 'web-speech');
      h.onstart();
      u.onstart=function(){ if (live===mine) mine.started=true; };
      u.onend=function(){ if (live!==mine) return; live=null; log('ended','web-speech'); h.onend(); };
      u.onerror=function(){ if (live!==mine) return; live=null; h.onerror('failed'); };
      speechSynthesis.speak(u);
      /* some browsers accept the utterance and stay silent */
      setTimeout(function(){
        if (live===mine && !mine.started){ live=null; h.onerror('failed'); }
      }, 1400);
      setTimeout(function(){ if (live===mine){ live=null; h.onend(); } }, 9000);
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
      if (have === null || have[rel]) { playFile(s, h); return; }
      console.warn('[example] no clip listed for', rel, '— using device TTS');
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
    /* D: 설정 탭의 "로그 보기"가 읽는다. P6-B에서 함께 지운다. */
    _log: function(n){ return LOG.slice(-(n || 20)); },
    /* for diagnostics and tests */
    _state: function(){
      return { native:isNative(), tts:!!nativeTTS(), web:webSpeech(),
               inApp:inAppBrowser(), voice:audioVoice(),
               playing: live ? live.kind : null,
               elements: el ? 1 : 0,
               files: have ? Object.keys(have).length : null };
    }
  };
})();
