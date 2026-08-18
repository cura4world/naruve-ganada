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

   ## The stream is kept between takes (2026-08-18)

   getUserMedia used to be called once per take and every track was
   stopped when the take ended. In-app browsers (KakaoTalk on Android)
   treat each new getUserMedia as a fresh request and pop the permission
   dialog **every time the sentence changes**. Unusable.

   So the MediaStream now lives at module scope and is reused. A take
   stops the recorder, not the microphone. The track is released only
   when the app goes to the background or after IDLE_RELEASE_MS of not
   recording — leaving the OS mic indicator lit forever is not acceptable
   either. If the track has since died, the next take asks again.
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

/* how long an unused microphone may stay open before we let it go */
var MIC_IDLE_RELEASE_MS = 5 * 60 * 1000;

var Mic = (function(){
  var stream=null, rec=null, ctx=null, analyser=null, ticker=null;
  var chunks=[], levels=[], t0=0, live=false;
  var idleTimer=null;

  function streamAlive(){
    if(!stream) return false;
    var tracks = stream.getAudioTracks();
    if(!tracks.length) return false;
    for(var i=0;i<tracks.length;i++) if(tracks[i].readyState !== 'live') return false;
    return true;
  }

  /* The only place tracks are stopped. Not called when a take ends. */
  function release(){
    if(idleTimer){ clearTimeout(idleTimer); idleTimer=null; }
    if(stream){
      stream.getTracks().forEach(function(t){ try{t.stop();}catch(e){} });
      stream=null;
    }
  }

  function armIdleRelease(){
    if(idleTimer) clearTimeout(idleTimer);
    idleTimer = setTimeout(function(){ idleTimer=null; if(!live) release(); },
                           MIC_IDLE_RELEASE_MS);
  }

  /* Going to the background must not leave the indicator on. */
  if(typeof document !== 'undefined'){
    document.addEventListener('visibilitychange', function(){
      if(document.visibilityState === 'hidden' && !live) release();
    });
    window.addEventListener('pagehide', function(){ if(!live) release(); });
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

  /* Ends a take. **Does not touch the tracks** — that is release()'s job
     and doing it here is what caused the repeated permission dialog. */
  function teardown(){
    if(ticker){ clearInterval(ticker); ticker=null; }
    if(rec && rec.state!=='inactive'){ try{ rec.stop(); }catch(e){} }
    if(ctx){ try{ ctx.close(); }catch(e){} ctx=null; }
    rec=null; analyser=null; live=false;
    armIdleRelease();
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

    /* Reuse the open microphone. getUserMedia is called from here and
       nowhere else, and only when there is nothing live to reuse. */
    if(idleTimer){ clearTimeout(idleTimer); idleTimer=null; }
    var got = streamAlive()
      ? Promise.resolve(stream)
      : navigator.mediaDevices.getUserMedia({
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

  return { supported:supported, record:record, stop:stop,
           release:release,
           held:function(){ return streamAlive(); },
           isLive:function(){ return live; } };
})();
