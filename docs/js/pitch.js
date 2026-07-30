/* =====================================================================
   F0 TRACKING

   Autocorrelation pitch tracking, on-device, no plugin, no cost.
   Two things come out of here:

     Pitch.track(pcm, rate)   → an F0 value per 10 ms frame, 0 = unvoiced
     Pitch.finalContour(trk)  → the slope over the last voiced stretch

   Only the sentence-final contour is used for scoring. Mid-sentence
   prominence and finer nuance are deliberately out of scope — see
   CLAUDE.md. A learner can hear and fix a final rise or fall; telling
   them their phrase-medial pitch accent drifted is not actionable.

   Analysis runs at 8 kHz. Speech F0 tops out around 400 Hz, so the extra
   bandwidth buys nothing and costs four times the autocorrelation work.
   ===================================================================== */

var PITCH = {
  rate: 8000,        /* analysis rate, downsampled from the capture */
  minHz: 70,
  maxHz: 400,
  frameMs: 40,
  hopMs: 10,
  voicedNc: 0.35,    /* normalised autocorrelation floor for "voiced" */
  voicedRms: 0.008   /* and it has to actually have energy */
};

var Pitch = (function(){

  function downsample(pcm, from, to){
    if(from === to) return pcm;
    var ratio = from/to, out = new Float32Array(Math.floor(pcm.length/ratio));
    for(var i=0;i<out.length;i++){
      var a = Math.floor(i*ratio), b = Math.min(pcm.length, Math.floor((i+1)*ratio)), s=0, n=0;
      for(var j=a;j<b;j++){ s+=pcm[j]; n++; }
      out[i] = n ? s/n : 0;
    }
    return out;
  }

  /* One frame. Returns Hz, or 0 when the frame is not voiced. */
  function frameF0(x, off, len, rate){
    var minLag = Math.floor(rate/PITCH.maxHz);
    var maxLag = Math.floor(rate/PITCH.minHz);
    if(off+maxLag+len > x.length) maxLag = x.length-off-len;
    if(maxLag <= minLag) return 0;

    var mean=0, i, j;
    for(i=0;i<len;i++) mean += x[off+i];
    mean /= len;

    var e0=0;
    for(i=0;i<len;i++){ var v=x[off+i]-mean; e0 += v*v; }
    var rms = Math.sqrt(e0/len);
    if(rms < PITCH.voicedRms) return 0;

    var best=0, bestLag=-1, ncs=new Float32Array(maxLag+2);
    for(var lag=minLag; lag<=maxLag; lag++){
      var s=0, e1=0, e2=0;
      for(i=0;i<len;i++){
        var a=x[off+i]-mean, b=x[off+i+lag]-mean;
        s+=a*b; e1+=a*a; e2+=b*b;
      }
      var nc = s/Math.sqrt(e1*e2 + 1e-12);
      ncs[lag]=nc;
      if(nc>best){ best=nc; bestLag=lag; }
    }
    if(best < PITCH.voicedNc || bestLag<0) return 0;

    /* Octave guard. Autocorrelation's classic failure is locking onto a
       multiple of the true period and reporting an octave or a fifth too
       low, so test the actual submultiples and nothing else. Sweeping
       every shorter lag instead drags the estimate onto whatever noise
       peak happens to clear the threshold — that turned a 150 Hz tone
       into 160 Hz. */
    for(var d=2; d<=3; d++){
      var cand = Math.round(bestLag/d);
      if(cand < minLag) break;
      var lb=0, ll=-1;
      for(var c=cand-1;c<=cand+1;c++){
        if(c>=minLag && c<=maxLag && ncs[c]>lb){ lb=ncs[c]; ll=c; }
      }
      if(ll>0 && lb >= best*0.90){ bestLag=ll; best=lb; }
    }

    /* Sub-sample peak. One lag step at 8 kHz is already ~3 Hz near
       150 Hz, and the whole measurement is a slope in semitones, so
       that quantisation would show up as slope noise. */
    var shift = 0;
    if(bestLag>minLag && bestLag<maxLag){
      var y0=ncs[bestLag-1], y1=ncs[bestLag], y2=ncs[bestLag+1];
      var den = y0 - 2*y1 + y2;
      if(den !== 0){
        shift = 0.5*(y0-y2)/den;
        if(shift>1 || shift<-1) shift = 0;
      }
    }
    return rate/(bestLag + shift);
  }

  function median3(a){
    var out = new Float32Array(a.length);
    for(var i=0;i<a.length;i++){
      var p = a[i-1]||0, c = a[i], n = a[i+1]||0;
      var v = [p,c,n].sort(function(x,y){return x-y;})[1];
      /* never invent voicing where there was none */
      out[i] = c === 0 ? 0 : v;
    }
    return out;
  }

  function track(pcm, rate){
    var x = downsample(pcm, rate, PITCH.rate);
    var r = PITCH.rate;
    var len = Math.round(r*PITCH.frameMs/1000);
    var hop = Math.round(r*PITCH.hopMs/1000);
    var n = Math.max(0, Math.floor((x.length - len - Math.floor(r/PITCH.minHz))/hop));
    var f0 = new Float32Array(n);
    for(var i=0;i<n;i++) f0[i] = frameF0(x, i*hop, len, r);
    return { f0: median3(f0), hopMs: PITCH.hopMs, frames: n };
  }

  /* Least-squares slope of log2(F0) over the final voiced stretch.
     Working in log space is the point: pitch is heard in ratios, so a
     rise from 120 to 160 Hz and one from 180 to 240 Hz are the same
     gesture and must score the same. */
  function finalContour(trk, tailMs, minFrames){
    var f0 = trk.f0, hop = trk.hopMs;
    var last = -1, i;
    for(i=f0.length-1;i>=0;i--){ if(f0[i]>0){ last=i; break; } }
    if(last < 0) return null;

    var span = Math.round(tailMs/hop);
    var from = Math.max(0, last-span+1);
    var xs=[], ys=[];
    for(i=from;i<=last;i++){
      if(f0[i]>0){ xs.push(i*hop/1000); ys.push(Math.log(f0[i])/Math.LN2); }
    }
    if(xs.length < minFrames) return null;

    var mx=0,my=0,k;
    for(k=0;k<xs.length;k++){ mx+=xs[k]; my+=ys[k]; }
    mx/=xs.length; my/=xs.length;
    var num=0, den=0;
    for(k=0;k<xs.length;k++){ num += (xs[k]-mx)*(ys[k]-my); den += (xs[k]-mx)*(xs[k]-mx); }
    if(den <= 0) return null;

    var slopeOct = num/den;                       /* octaves per second */
    var windowSec = xs[xs.length-1]-xs[0];
    return {
      slopeSt: slopeOct*12,                       /* semitones per second */
      deltaSt: slopeOct*12*windowSec,             /* semitones across the tail */
      windowMs: Math.round(windowSec*1000),
      frames: xs.length,
      startHz: Math.round(f0[from>0?from:0] || f0[last]),
      endHz: Math.round(f0[last]),
      hz: Array.prototype.slice.call(f0.subarray(from, last+1)).map(function(v){ return Math.round(v); })
    };
  }

  return { track:track, finalContour:finalContour, _frameF0:frameF0, _downsample:downsample };
})();
