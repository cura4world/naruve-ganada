/* Set to false to ship. The SIMULATE controls stay in the code and in the
   DOM; the unlock gesture simply stops being wired up, so there is nothing
   to delete and nothing to put back later. */
var DEV_UNLOCK = true;
var DEV_HOLD_MS = 3000;

var LEVELS={native:{ok:[95,99],weak:[88,95]},advanced:{ok:[88,97],weak:[74,84]},
  intermediate:{ok:[78,92],weak:[58,70]},beginner:{ok:[62,80],weak:[40,55]}};

var $=function(id){return document.getElementById(id);};
var level='native', idx=0, credits=27, busy=false, koVoice=null, browseCol='everyday', L1='en';
function rand(r){return r[0]+Math.floor(Math.random()*(r[1]-r[0]+1));}

/* --- strings. t() falls back to en, so a language may fill in the table
   a little at a time without leaving blanks on screen. --- */
function t(k){ var d=UI[L1]||{}; return (k in d) ? d[k] : UI.en[k]; }
function tcol(id){
  var c=(UI[L1]&&UI[L1].col)||{};
  return c[id] || (UI.en.col&&UI.en.col[id]) || {n:id,b:''};
}
function colName(id){ return tcol(id).n; }

/* the hint line is remembered by key, not by text, so a language switch
   mid-recording still says the right thing */
var hintKey='hintTap';
function setHint(k,live){
  hintKey=k; $('hint').textContent=t(k);
  if(live) $('hint').classList.add('live'); else $('hint').classList.remove('live');
}

function pickVoice(){
  if(!window.speechSynthesis) return;
  var vs=speechSynthesis.getVoices()||[];
  for(var i=0;i<vs.length;i++){var lg=(vs[i].lang||'').toLowerCase().replace('_','-');
    if(lg.indexOf('ko')===0){koVoice=vs[i];return;}}
}
if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice;setTimeout(pickVoice,600);}

function toneSvg(t_){
  if(t_==='question') return '<svg width="26" height="14" viewBox="0 0 26 14"><path d="M2 11 H14 C19 11 20 9 23.5 3" fill="none" stroke="#C0392F" stroke-width="2.1" stroke-linecap="round"/><path d="M20.5 3 H23.8 V6.3" fill="none" stroke="#C0392F" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if(t_==='exclam') return '<svg width="26" height="14" viewBox="0 0 26 14"><path d="M2 3 C6 3 7 11 12 11 H24" fill="none" stroke="#4A5561" stroke-width="2.1" stroke-linecap="round"/></svg>';
  return '<svg width="26" height="14" viewBox="0 0 26 14"><path d="M2 7 H24" fill="none" stroke="#4A5561" stroke-width="2.1" stroke-linecap="round"/></svg>';
}
function toneWord(x){return x==='question'?t('toneRising'):(x==='exclam'?t('toneExclam'):t('toneLevel'));}
function formWord(f){return f==='hamnida'?t('formHamnida'):(f==='banmal'?t('formBanmal'):t('formHaeyo'));}
function findPair(i){
  var cur=S[i]; if(!cur.p) return -1;
  for(var j=0;j<S.length;j++) if(j!==i && S[j].p===cur.p) return j;
  return -1;
}

/* the parts of the card whose wording depends on the language.
   Kept apart from paint() so switching language never wipes a result. */
function paintCard(){
  var s=S[idx];
  $('curCol').textContent=colName(s.c);
  $('curSet').textContent=s.s;
  $('roman').textContent=s.r;
  $('gloss').textContent=s.g;
  $('toneHint').innerHTML='<b>'+toneWord(s.t)+'</b> — '+s.tn;
  $('metaRow').innerHTML='<span class="chip'+(s.t==='question'?' q':'')+'">'+toneSvg(s.t)+toneWord(s.t)+'</span>'
    +'<span class="chip">'+formWord(s.f)+'</span>';

  var pi=findPair(idx);
  if(pi>=0){
    $('pairLink').classList.add('show');
    $('plLab').textContent = s.c==='standard' ? t('pairEveryday') : t('pairStandard');
    $('plTxt').textContent = S[pi].k;
    $('pairLink').setAttribute('data-i',pi);
  } else $('pairLink').classList.remove('show');
}

function paint(){
  var s=S[idx];
  paintCard();

  var wrap=$('tiles'); wrap.innerHTML='';
  s.k.split('').forEach(function(ch){
    var el=document.createElement('div');
    if(ch===' ') el.className='tile space';
    else if(/[,.?!]/.test(ch)) el.className='tile punct';
    else el.className='tile';
    el.setAttribute('data-ch',ch);
    if(ch!==' ') el.innerHTML=ch+(/[,.?!]/.test(ch)?'':'<span class="num"></span>');
    wrap.appendChild(el);
  });
  $('result').classList.remove('show');
  $('l1box').classList.remove('show');
  setHint('hintTap',false);
  $('audioNote').classList.remove('show');
}

function scoreFor(ch){var L=LEVELS[level];return S[idx].w.indexOf(ch)>=0?rand(L.weak):rand(L.ok);}
function inkTile(el,sc){
  var a=0.10+(sc/100)*0.86;
  el.style.backgroundColor='rgba(17,26,34,'+a.toFixed(3)+')';
  el.style.borderColor='rgba(17,26,34,'+Math.min(a+0.14,1).toFixed(3)+')';
  el.style.color=sc>=52?'var(--paper)':'var(--ink)';
  if(sc<80){el.classList.add('flag');var n=el.querySelector('.num');n.textContent=sc;
    n.style.color=sc>=52?'var(--paper)':'var(--ink-faint)';}
}
function resetTiles(){
  var all=document.querySelectorAll('.tile');
  for(var i=0;i<all.length;i++){var el=all[i];
    el.style.backgroundColor='transparent';
    el.style.borderColor=(el.classList.contains('punct')||el.classList.contains('space'))?'transparent':'var(--rule)';
    el.style.color=el.classList.contains('punct')?'var(--ink-faint)':'var(--ink)';
    el.classList.remove('flag');}
}

/* Judges the attempt, not the person. Bands are 90 / 75 / 60. */
var NATURAL=90;
function verdictFor(tt){
  if(tt>=NATURAL) return t('verdict90');
  if(tt>=75) return t('verdict75');
  if(tt>=60) return t('verdict60');
  return t('verdict0');
}

function run(){
  if(busy) return; busy=true;
  if(window.speechSynthesis) speechSynthesis.cancel();
  $('result').classList.remove('show'); resetTiles();
  $('rec').classList.add('rec'); setHint('hintListening',true);
  setTimeout(function(){
    $('rec').classList.remove('rec'); setHint('hintScoring',false);
    setTimeout(function(){
      var tiles=Array.prototype.slice.call(document.querySelectorAll('.tile:not(.punct):not(.space)'));
      var sc=[];
      tiles.forEach(function(el,i){var v=scoreFor(el.getAttribute('data-ch'));sc.push(v);
        setTimeout(function(){inkTile(el,v);},i*80);});
      var sum=0; for(var k=0;k<sc.length;k++) sum+=sc[k];
      var tt=Math.round(sum/sc.length);
      setTimeout(function(){
        $('result').classList.add('show');
        var n=0;(function step(){n+=Math.max(1,Math.ceil((tt-n)/6));if(n>=tt)n=tt;
          $('scoreNum').textContent=n; if(n<tt) requestAnimationFrame(step);})();
        showResult(tt);
        credits=Math.max(0,credits-1); $('credits').textContent=credits;
        setHint('hintAgain',false); busy=false;
      }, tiles.length*80+200);
    },500);
  },2100);
}

/* everything about the result that has words in it, so a language switch
   can replay it without re-running the check */
var lastTotal = 0;
function showResult(tt){
  lastTotal = tt;
  $('verdict').textContent = verdictFor(tt);
  $('note').innerHTML = tt>=NATURAL ? t('notePerfect') : S[idx].tip;
  renderL1(tt);
}

$('listen').addEventListener('click',function(){
  var b=$('listen'),lab=$('listenLabel'),note=$('audioNote');
  note.classList.remove('show');
  if(!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined'){
    note.textContent=t('audioBlocked');note.classList.add('show');return;}
  speechSynthesis.cancel(); pickVoice();
  var s=S[idx], u=new SpeechSynthesisUtterance(s.k);
  u.lang='ko-KR'; u.rate=0.82; u.volume=1;
  u.pitch = s.t==='question'?1.25:(s.t==='exclam'?1.15:0.95);
  if(koVoice) u.voice=koVoice;
  var started=false;
  b.classList.add('playing'); lab.textContent=t('listenPlaying');
  function done(){b.classList.remove('playing');lab.textContent=t('listen');}
  u.onstart=function(){started=true;}; u.onend=done;
  u.onerror=function(){done();note.textContent=t('audioFailed');note.classList.add('show');};
  speechSynthesis.speak(u);
  setTimeout(function(){if(!started){done();
    var vs=(speechSynthesis.getVoices()||[]).length;
    note.textContent= vs===0 ? t('audioNoVoices') : t('audioSilent');
    note.classList.add('show');}},1200);
  setTimeout(function(){if(b.classList.contains('playing')) done();},8000);
});

$('pairLink').addEventListener('click',function(){
  idx=parseInt(this.getAttribute('data-i'),10); paint();
});

/* --- L1 explanation: pulled from the phoneme library, not written per sentence --- */
function renderL1(total){
  var box=$('l1box');
  if (total >= NATURAL){ box.classList.remove('show'); return; }
  var s=S[idx], txt=s.k, keys=[], seen={};
  s.w.forEach(function(syl){
    var pos=txt.indexOf(syl);
    var nxt = pos>=0 ? txt.charAt(pos+1) : '';
    phonemesFor(syl, nxt).forEach(function(p){
      if(!seen[p] && PHONEMES[p]){ seen[p]=1; keys.push(p); }
    });
  });
  keys = keys.slice(0,2);
  if(!keys.length){ box.classList.remove('show'); return; }
  $('l1Lab').textContent = L1_HEAD[L1] || L1_HEAD.en;
  var h='';
  keys.forEach(function(k){
    h += '<div class="l1-txt">' + (PHONEMES[k][L1] || PHONEMES[k].en) + '</div>';
  });
  $('l1Body').innerHTML=h;
  box.classList.add('show');
}

/* --- language switch: repaints wording in place, never resets state --- */
function applyLang(){
  Array.prototype.slice.call(document.querySelectorAll('[data-i18n]')).forEach(function(el){
    var v=t(el.getAttribute('data-i18n')); if(v!=null) el.textContent=v;
  });
  Array.prototype.slice.call(document.querySelectorAll('[data-i18n-aria]')).forEach(function(el){
    var v=t(el.getAttribute('data-i18n-aria')); if(v!=null) el.setAttribute('aria-label',v);
  });
  $('l1Btn').textContent = L1_LABEL[L1] || L1.toUpperCase();
  document.documentElement.setAttribute('lang', L1);

  if(!$('listen').classList.contains('playing')) $('listenLabel').textContent=t('listen');
  $('hint').textContent=t(hintKey);
  paintCard();
  if ($('result').classList.contains('show')) showResult(lastTotal);
  if ($('browse').classList.contains('open')) { renderCols(); renderList(); }
}
$('l1Btn').addEventListener('click',function(){
  L1 = LANGS[(LANGS.indexOf(L1)+1) % LANGS.length];
  applyLang();
});

function renderCols(){
  var h='';
  COLLECTIONS.forEach(function(c){
    if(!c.browse) return;
    var have=S.filter(function(x){return x.c===c.id;}).length;
    h+='<button class="b-col'+(c.id===browseCol?' on':'')+'" data-col="'+c.id+'">'+colName(c.id)+'<span class="n">'+have+'/'+c.target+'</span></button>';
  });
  $('bCols').innerHTML=h;
  Array.prototype.slice.call(document.querySelectorAll('.b-col')).forEach(function(b){
    b.addEventListener('click',function(){browseCol=b.getAttribute('data-col');renderCols();renderList();});
  });
}
function renderList(){
  $('bBlurb').textContent=tcol(browseCol).b;
  var items=[],seen={},h='';
  S.forEach(function(x,i){if(x.c===browseCol) items.push({x:x,i:i});});
  items.forEach(function(o){
    if(!seen[o.x.s]){seen[o.x.s]=1;h+='<div class="b-set">'+o.x.s+'</div>';}
    var form = o.x.f==='hamnida'?t('tagFormal'):(o.x.f==='banmal'?t('tagCasual'):t('tagPolite'));
    var tg='<span'+(o.x.t==='question'?' class="q"':'')+'>'+toneWord(o.x.t)+'</span>'
      +'<span>'+form+'</span>'
      +'<span>'+t('lvPrefix')+o.x.lv+'</span>';
    h+='<button class="b-item" data-i="'+o.i+'"><div class="k">'+o.x.k+'</div><div class="r">'+o.x.r+'</div><div class="t">'+tg+'</div></button>';
  });
  if(!items.length) h='<div class="b-set">'+t('emptyList')+'</div>';
  $('bList').innerHTML=h;
  Array.prototype.slice.call(document.querySelectorAll('.b-item')).forEach(function(b){
    b.addEventListener('click',function(){idx=parseInt(b.getAttribute('data-i'),10);paint();closeBrowse();});
  });
}
function openBrowse(){
  browseCol = S[idx].c==='sounds' ? 'everyday' : S[idx].c;
  renderCols(); renderList();
  $('browse').classList.add('open'); $('browse').setAttribute('aria-hidden','false'); $('bList').scrollTop=0;
}
function closeBrowse(){$('browse').classList.remove('open');$('browse').setAttribute('aria-hidden','true');}
$('openBrowse').addEventListener('click',openBrowse);
$('closeBrowse').addEventListener('click',closeBrowse);

Array.prototype.slice.call(document.querySelectorAll('.sim-btn')).forEach(function(b){
  b.addEventListener('click',function(){
    document.querySelectorAll('.sim-btn').forEach(function(x){x.classList.remove('on');});
    b.classList.add('on'); level=b.getAttribute('data-lv');
    resetTiles(); $('result').classList.remove('show'); setHint('hintTap',false);
  });
});

$('rec').addEventListener('click',run);
$('next').addEventListener('click',function(){
  var cur=S[idx].c,pool=[];
  S.forEach(function(x,i){if(x.c===cur) pool.push(i);});
  var p=pool.indexOf(idx); idx=pool[(p+1)%pool.length]; paint();
});
$('share').addEventListener('click',function(){ alert(t('shareAlert')); });

/* --- dev mode: hold the 말 seal for 3s to show/hide SIMULATE.
   Deliberately not persisted — a reload always comes back clean, so a
   phone can never be left in dev mode by accident.                    --- */
(function(){
  if(!DEV_UNLOCK) return;
  var seal=document.querySelector('.seal-mark'), timer=null;
  if(!seal) return;
  function cancel(){ if(timer){clearTimeout(timer); timer=null;} }
  function begin(){
    cancel();
    timer=setTimeout(function(){
      timer=null;
      document.body.classList.toggle('dev');
      if(navigator.vibrate) navigator.vibrate(18);
    }, DEV_HOLD_MS);
  }
  seal.addEventListener('pointerdown', begin);
  ['pointerup','pointerleave','pointercancel'].forEach(function(ev){
    seal.addEventListener(ev, cancel);
  });
  seal.addEventListener('contextmenu', function(e){ e.preventDefault(); });
})();

/* open on Drama — the hook */
for(var i=0;i<S.length;i++){ if(S[i].c==='drama'){ idx=i; break; } }
applyLang();
paint();
