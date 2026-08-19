/* =====================================================================
   MICROPHONE CAPTURE

   Mic.record(handlers) opens the microphone, watches the level, stops
   itself, and hands back a trimmed mono 16 kHz capture.

   No native plugin is needed for this. Capacitor's BridgeWebChromeClient
   answers the WebView's AUDIO_CAPTURE request by asking Android for
   RECORD_AUDIO at runtime, so plain getUserMedia() raises the normal
   permission dialog inside the APK. The page is served over https, so
   the secure-context requirement is met too.

   Cost defences are here rather than bolted on later:
     · hard 10 s ceiling on a take
     · a take ends itself after ~0.9 s of silence
     · leading and trailing silence are cut from the PCM before anything
       leaves the device, so an upload carries speech and nothing else
     · a take with no speech in it never reaches the scorer at all

   What comes back is what a scorer needs: pcm for pitch and timing work
   on-device, wav for anything that later goes over the network.

   ## 녹음이 끝나면 마이크를 놓는다 (2026-08-19, 2026-08-18을 되돌림)

   ~~스트림을 take 사이에 유지한다~~ — 카카오톡 인앱 브라우저가 문장을 바꿀
   때마다 권한 다이얼로그를 띄워서 그렇게 했었다. 그 대가가 컸다.

   **트랙이 live인 동안 예시 음성이 먹먹하고 작게 들린다.** 크롬과 APK 양쪽에서
   같았고, 녹음을 한 번 한 뒤부터 시작해 지속됐다. 안드로이드가 마이크가 열려
   있는 동안 오디오 경로를 통신 모드로 돌려 미디어 재생이 통화 스트림처럼 나가는
   것으로 본다. 듣기가 망가지면 따라 할 표본이 망가진다 — 발음 앱에서 그건
   권한 다이얼로그보다 큰 손해다.

   그래서 take가 끝나면 트랙을 stop하고 스트림을 버린다. 다음 take는
   getUserMedia를 다시 부른다. 크롬과 WebView는 같은 오리진의 권한을 기억하므로
   다이얼로그가 다시 뜨지 않을 것으로 보지만 **인앱 브라우저는 실기로 확인해야
   한다** — 이 되돌림이 그 문제를 되살릴 수 있는 유일한 자리다.

   트랙을 놓는 곳은 teardown() 하나다. idle 타이머와 visibilitychange 해제는
   지웠다 — 유지하는 스트림이 없으면 놓을 것도 없다.
   ===================================================================== */

var MIC = {
  maxMs: 10000,        /* A-3: hard ceiling on one take */
  silenceMs: 900,      /* trailing quiet that ends a take */
  leadPadMs: 120,      /* keep a little air before the first sound */
  tailPadMs: 180,
  onsetRms: 0.014,     /* speech onset, tuned by ear — see CALIBRATION */
  minSpeechMs: 220,    /* shorter than this is a cough, not an attempt */
  outRate: 16000       /* what speech engines want */
};

var Mic = (function(){
  var stream=null, rec=null, ctx=null, analyser=null, ticker=null;
  var chunks=[], levels=[], t0=0, live=false;

  function streamAlive(){
    if(!stream) return false;
    var tracks = stream.getAudioTracks();
    if(!tracks.length) return false;
    for(var i=0;i<tracks.length;i++) if(tracks[i].readyState !== 'live') return false;
    return true;
  }

  /* 트랙을 놓는 유일한 곳. teardown()이 매 take마다 부르고, 예시 재생 직전에
     혹시 열려 있으면 audio.js가 부른다. */
  function release(){
    if(stream){
      stream.getTracks().forEach(function(t){ try{t.stop();}catch(e){} });
      stream=null;
    }
  }

  function supported(){
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia &&
              typeof MediaRecorder !== 'undefined');
  }

  function pickMime(){
    var want=['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
    for(var i=0;i<want.length;i++){
      if(MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(want[i])) return want[i];
    }
    return '';
  }

  /* take를 끝낸다. **트랙까지 놓는다** — 열어 둔 마이크가 예시 재생을
     먹먹하게 만든다(머리말). AudioContext도 여기서 닫는다. */
  function teardown(){
    if(ticker){ clearInterval(ticker); ticker=null; }
    if(rec && rec.state!=='inactive'){ try{ rec.stop(); }catch(e){} }
    if(ctx){ try{ ctx.close(); }catch(e){} ctx=null; }
    rec=null; analyser=null; live=false;
    release();
  }

  /* ---- PCM helpers: decode, find the speech, cut, resample, wrap ---- */

  function resample(input, from, to){
    if(from===to) return input;
    var ratio=from/to, out=new Float32Array(Math.floor(input.length/ratio));
    for(var i=0;i<out.length;i++){
      var start=Math.floor(i*ratio), end=Math.min(input.length, Math.floor((i+1)*ratio)), sum=0, n=0;
      for(var j=start;j<end;j++){ sum+=input[j]; n++; }
      out[i]= n ? sum/n : 0;
    }
    return out;
  }

  /* window-RMS envelope, then first and last window above the threshold */
  function speechBounds(pcm, rate){
    var win=Math.max(1, Math.round(rate*0.02));      /* 20 ms */
    var first=-1, last=-1, peak=0;
    for(var i=0;i+win<=pcm.length;i+=win){
      var sum=0;
      for(var j=i;j<i+win;j++) sum+=pcm[j]*pcm[j];
      var rms=Math.sqrt(sum/win);
      if(rms>peak) peak=rms;
      if(rms>=MIC.onsetRms){ if(first<0) first=i; last=i+win; }
    }
    return { first:first, last:last, peak:peak };
  }

  function encodeWav(pcm, rate){
    var buf=new ArrayBuffer(44+pcm.length*2), v=new DataView(buf);
    function str(o,s){ for(var i=0;i<s.length;i++) v.setUint8(o+i, s.charCodeAt(i)); }
    str(0,'RIFF'); v.setUint32(4, 36+pcm.length*2, true); str(8,'WAVE');
    str(12,'fmt '); v.setUint32(16,16,true); v.setUint16(20,1,true); v.setUint16(22,1,true);
    v.setUint32(24,rate,true); v.setUint32(28,rate*2,true); v.setUint16(32,2,true); v.setUint16(34,16,true);
    str(36,'data'); v.setUint32(40, pcm.length*2, true);
    for(var i=0;i<pcm.length;i++){
      var s=Math.max(-1, Math.min(1, pcm[i]));
      v.setInt16(44+i*2, s<0 ? s*0x8000 : s*0x7fff, true);
    }
    return new Blob([buf], {type:'audio/wav'});
  }

  function build(blob, mime, ms, cb, fail){
    var AC = window.AudioContext || window.webkitAudioContext;
    if(!AC || !blob || !blob.size){ fail('failed'); return; }
    var ac=new AC();
    blob.arrayBuffer().then(function(ab){ return ac.decodeAudioData(ab); }).then(function(audio){
      var raw=audio.getChannelData(0);
      var pcm=resample(raw, audio.sampleRate, MIC.outRate);
      var b=speechBounds(pcm, MIC.outRate);
      try{ ac.close(); }catch(e){}
      if(b.first<0){ fail('nospeech'); return; }

      var pad=Math.round(MIC.outRate*MIC.leadPadMs/1000);
      var tail=Math.round(MIC.outRate*MIC.tailPadMs/1000);
      var s=Math.max(0, b.first-pad), e=Math.min(pcm.length, b.last+tail);
      var cut=pcm.subarray(s,e);
      var speechMs=Math.round((b.last-b.first)/MIC.outRate*1000);
      if(speechMs < MIC.minSpeechMs){ fail('nospeech'); return; }

      /* Trim is measured against the decoded audio, not the wall clock.
         Holding the button and the recorded stream are two different
         clocks and subtracting one from the other can go negative. */
      var rawMs = Math.round(pcm.length/MIC.outRate*1000);
      var keptMs = Math.round(cut.length/MIC.outRate*1000);
      cb({
        pcm: cut, sampleRate: MIC.outRate,
        wav: encodeWav(cut, MIC.outRate),
        raw: blob, mime: mime,
        ms: ms,                    /* how long the button was held */
        rawMs: rawMs,              /* how much audio came back */
        speechMs: speechMs,        /* how much of it was speech */
        keptMs: keptMs,            /* what survives the trim */
        trimmedMs: Math.max(0, rawMs - keptMs),
        peak: b.peak,
        levels: levels.slice()
      });
    }).catch(function(){ try{ ac.close(); }catch(e){} fail('failed'); });
  }

  /* ---- public ---- */

  function record(h){
    if(live) return;
    if(!supported()){ h.onerror('unsupported'); return; }
    chunks=[]; levels=[]; live=true;

    /* take마다 새로 연다. getUserMedia를 부르는 곳은 여기 하나뿐이다.
       앞 take가 남긴 것이 있으면(있으면 안 되지만) 먼저 놓는다. */
    release();
    var got = navigator.mediaDevices.getUserMedia({
      audio:{ channelCount:1, echoCancellation:true, noiseSuppression:true, autoGainControl:true }
    });

    got.then(function(st){
      stream=st;
      var mime=pickMime();
      try { rec = mime ? new MediaRecorder(st,{mimeType:mime}) : new MediaRecorder(st); }
      catch(e){ teardown(); h.onerror('failed'); return; }

      var AC = window.AudioContext || window.webkitAudioContext;
      if(AC){
        ctx=new AC();
        if(ctx.state==='suspended' && ctx.resume) ctx.resume();
        analyser=ctx.createAnalyser();
        analyser.fftSize=1024;
        ctx.createMediaStreamSource(st).connect(analyser);
      }

      var buf = analyser ? new Float32Array(analyser.fftSize) : null;
      var lastLoud=0, sawSpeech=false;
      t0=Date.now();

      rec.ondataavailable=function(e){ if(e.data && e.data.size) chunks.push(e.data); };
      rec.onstop=function(){
        var ms=Date.now()-t0;
        var blob=new Blob(chunks,{type:rec && rec.mimeType ? rec.mimeType : 'audio/webm'});
        var mimeUsed = rec && rec.mimeType;
        teardown();
        build(blob, mimeUsed, ms, h.ondone, h.onerror);
      };
      rec.start();
      h.onstart();

      ticker=setInterval(function(){
        var ms=Date.now()-t0, rms=0;
        if(analyser && buf){
          analyser.getFloatTimeDomainData(buf);
          var sum=0;
          for(var i=0;i<buf.length;i++) sum+=buf[i]*buf[i];
          rms=Math.sqrt(sum/buf.length);
        }
        levels.push(rms);
        if(h.onlevel) h.onlevel(rms, ms);

        if(rms>=MIC.onsetRms){ sawSpeech=true; lastLoud=ms; }
        /* end the take once the speaker has clearly stopped */
        if(sawSpeech && ms-lastLoud>=MIC.silenceMs) stop();
        /* A-3: never let a take run away */
        else if(ms>=MIC.maxMs) stop();
      }, 50);
    }).catch(function(err){
      teardown();
      /* a refusal or a dead device means the handle is worthless — drop it
         so the next take asks again instead of reusing a corpse */
      release();
      var n = err && err.name;
      h.onerror(n==='NotAllowedError'||n==='SecurityError' ? 'denied'
              : n==='NotFoundError' ? 'nomic' : 'failed');
    });
  }

  function stop(){
    if(ticker){ clearInterval(ticker); ticker=null; }
    if(rec && rec.state==='recording'){ try{ rec.stop(); }catch(e){ teardown(); } }
    else teardown();
  }

  /* D: 예시 재생이 먹먹해지는 조건을 가르려고 상태만 읽는다. 아무것도 바꾸지
     않는다 — 계측이 대상을 건드리면 그 계측은 못 믿는다. */
  function diag(){
    var ts = stream ? stream.getAudioTracks() : [];
    var states = [];
    for (var i=0;i<ts.length;i++) states.push(ts[i].readyState);
    return {
      tracks: ts.length,
      states: states.join('/') || 'none',
      held: streamAlive(),
      ctx: ctx ? ctx.state : 'none',
      recording: live
    };
  }

  return { supported:supported, record:record, stop:stop,
           release:release, diag:diag,
           held:function(){ return streamAlive(); },
           isLive:function(){ return live; } };
})();
