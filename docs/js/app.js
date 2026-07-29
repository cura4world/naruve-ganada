var LEVELS={native:{ok:[95,99],weak:[88,95]},advanced:{ok:[88,97],weak:[74,84]},
  intermediate:{ok:[78,92],weak:[58,70]},beginner:{ok:[62,80],weak:[40,55]}};

var $=function(id){return document.getElementById(id);};
var level='native', idx=0, credits=27, busy=false, koVoice=null, browseCol='everyday', L1='en';
function rand(r){return r[0]+Math.floor(Math.random()*(r[1]-r[0]+1));}
function colName(id){for(var i=0;i<COLLECTIONS.length;i++) if(COLLECTIONS[i].id===id) return COLLECTIONS[i].name; return id;}

function pickVoice(){
  if(!window.speechSynthesis) return;
  var vs=speechSynthesis.getVoices()||[];
  for(var i=0;i<vs.length;i++){var lg=(vs[i].lang||'').toLowerCase().replace('_','-');
    if(lg.indexOf('ko')===0){koVoice=vs[i];return;}}
}
if(window.speechSynthesis){pickVoice();speechSynthesis.onvoiceschanged=pickVoice;setTimeout(pickVoice,600);}

function toneSvg(t){
  if(t==='question') return '<svg width="26" height="14" viewBox="0 0 26 14"><path d="M2 11 H14 C19 11 20 9 23.5 3" fill="none" stroke="#C0392F" stroke-width="2.1" stroke-linecap="round"/><path d="M20.5 3 H23.8 V6.3" fill="none" stroke="#C0392F" stroke-width="2.1" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  if(t==='exclam') return '<svg width="26" height="14" viewBox="0 0 26 14"><path d="M2 3 C6 3 7 11 12 11 H24" fill="none" stroke="#4A5561" stroke-width="2.1" stroke-linecap="round"/></svg>';
  return '<svg width="26" height="14" viewBox="0 0 26 14"><path d="M2 7 H24" fill="none" stroke="#4A5561" stroke-width="2.1" stroke-linecap="round"/></svg>';
}
function toneWord(t){return t==='question'?'Rising':(t==='exclam'?'Peak then fall':'Level');}
function formWord(f){return f==='hamnida'?'합니다체 · formal':(f==='banmal'?'반말 · casual':'해요체 · polite');}
function findPair(i){
  var cur=S[i]; if(!cur.p) return -1;
  for(var j=0;j<S.length;j++) if(j!==i && S[j].p===cur.p) return j;
  return -1;
}

function paint(){
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
    $('plLab').textContent = s.c==='standard' ? 'How people actually say it →' : 'The textbook version →';
    $('plTxt').textContent = S[pi].k;
    $('pairLink').setAttribute('data-i',pi);
  } else $('pairLink').classList.remove('show');

  var wrap=$('tiles'); wrap.innerHTML='';
  s.k.split('').forEach(function(ch){
    var t=document.createElement('div');
    if(ch===' ') t.className='tile space';
    else if(/[,.?!]/.test(ch)) t.className='tile punct';
    else t.className='tile';
    t.setAttribute('data-ch',ch);
    if(ch!==' ') t.innerHTML=ch+(/[,.?!]/.test(ch)?'':'<span class="num"></span>');
    wrap.appendChild(t);
  });
  $('result').classList.remove('show');
  $('l1box').classList.remove('show');
  $('hint').textContent='Tap and read it aloud';
  $('hint').classList.remove('live');
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
  for(var i=0;i<all.length;i++){var t=all[i];
    t.style.backgroundColor='transparent';
    t.style.borderColor=(t.classList.contains('punct')||t.classList.contains('space'))?'transparent':'var(--rule)';
    t.style.color=t.classList.contains('punct')?'var(--ink-faint)':'var(--ink)';
    t.classList.remove('flag');}
}
function verdictFor(tt,wc){
  if(tt>=93) return 'Native-level — nothing to fix';
  if(tt>=85) return 'Clear and natural';
  if(tt>=75) return wc===1?'Easy to understand — one spot to polish':'Easy to understand — a couple of spots';
  if(tt>=65) return 'Understandable — work on the marked syllables';
  return 'Keep going — focus on the marked syllables';
}

function run(){
  if(busy) return; busy=true;
  if(window.speechSynthesis) speechSynthesis.cancel();
  $('result').classList.remove('show'); resetTiles();
  $('rec').classList.add('rec'); $('hint').textContent='Listening…'; $('hint').classList.add('live');
  setTimeout(function(){
    $('rec').classList.remove('rec'); $('hint').classList.remove('live'); $('hint').textContent='Scoring…';
    setTimeout(function(){
      var tiles=Array.prototype.slice.call(document.querySelectorAll('.tile:not(.punct):not(.space)'));
      var sc=[],wc=0;
      tiles.forEach(function(t,i){var v=scoreFor(t.getAttribute('data-ch'));sc.push(v);
        if(v<80) wc++; setTimeout(function(){inkTile(t,v);},i*80);});
      var sum=0; for(var k=0;k<sc.length;k++) sum+=sc[k];
      var tt=Math.round(sum/sc.length);
      setTimeout(function(){
        $('result').classList.add('show');
        var n=0;(function step(){n+=Math.max(1,Math.ceil((tt-n)/6));if(n>=tt)n=tt;
          $('scoreNum').textContent=n; if(n<tt) requestAnimationFrame(step);})();
        $('verdict').textContent=verdictFor(tt,wc);
        $('note').innerHTML= tt>=93 ? 'Every syllable landed. Try the next one.' : S[idx].tip;
        renderL1(tt);
        credits=Math.max(0,credits-1); $('credits').textContent=credits;
        $('hint').textContent='Tap to try again'; busy=false;
      }, tiles.length*80+200);
    },500);
  },2100);
}

$('listen').addEventListener('click',function(){
  var b=$('listen'),lab=$('listenLabel'),note=$('audioNote');
  note.classList.remove('show');
  if(!window.speechSynthesis||typeof SpeechSynthesisUtterance==='undefined'){
    note.textContent='This viewer blocks audio. Open the file in Chrome instead.';note.classList.add('show');return;}
  speechSynthesis.cancel(); pickVoice();
  var s=S[idx], u=new SpeechSynthesisUtterance(s.k);
  u.lang='ko-KR'; u.rate=0.82; u.volume=1;
  u.pitch = s.t==='question'?1.25:(s.t==='exclam'?1.15:0.95);
  if(koVoice) u.voice=koVoice;
  var started=false;
  b.classList.add('playing'); lab.textContent='Playing';
  function done(){b.classList.remove('playing');lab.textContent='Hear it spoken';}
  u.onstart=function(){started=true;}; u.onend=done;
  u.onerror=function(){done();note.textContent='Speech failed here. Open in Chrome, and check media volume.';note.classList.add('show');};
  speechSynthesis.speak(u);
  setTimeout(function(){if(!started){done();
    var vs=(speechSynthesis.getVoices()||[]).length;
    note.textContent= vs===0?'No speech voices in this viewer. Open the file in Chrome.'
      :'Voice found but nothing played. Check media volume, or open in Chrome.';
    note.classList.add('show');}},1200);
  setTimeout(function(){if(b.classList.contains('playing')) done();},8000);
});

$('pairLink').addEventListener('click',function(){
  idx=parseInt(this.getAttribute('data-i'),10); paint();
});

/* --- L1 explanation: pulled from the phoneme library, not written per sentence --- */
var lastTotal = 0;
function renderL1(total){
  lastTotal = total;
  var box=$('l1box');
  if (total >= 93){ box.classList.remove('show'); return; }
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
  $('l1Lab').textContent = L1_HEAD[L1];
  var h='';
  keys.forEach(function(k){
    h += '<div class="l1-txt">' + PHONEMES[k][L1] + '</div>';
  });
  $('l1Body').innerHTML=h;
  box.classList.add('show');
}
$('l1Btn').addEventListener('click',function(){
  L1 = (L1==='en') ? 'id' : 'en';
  this.textContent = L1_LABEL[L1];
  if ($('result').classList.contains('show')) renderL1(lastTotal);
});

function renderCols(){
  var h='';
  COLLECTIONS.forEach(function(c){
    if(!c.browse) return;
    var have=S.filter(function(x){return x.c===c.id;}).length;
    h+='<button class="b-col'+(c.id===browseCol?' on':'')+'" data-col="'+c.id+'">'+c.name+'<span class="n">'+have+'/'+c.target+'</span></button>';
  });
  $('bCols').innerHTML=h;
  Array.prototype.slice.call(document.querySelectorAll('.b-col')).forEach(function(b){
    b.addEventListener('click',function(){browseCol=b.getAttribute('data-col');renderCols();renderList();});
  });
}
function renderList(){
  var c=null; for(var i=0;i<COLLECTIONS.length;i++) if(COLLECTIONS[i].id===browseCol) c=COLLECTIONS[i];
  $('bBlurb').textContent=c?c.blurb:'';
  var items=[],seen={},h='';
  S.forEach(function(x,i){if(x.c===browseCol) items.push({x:x,i:i});});
  items.forEach(function(o){
    if(!seen[o.x.s]){seen[o.x.s]=1;h+='<div class="b-set">'+o.x.s+'</div>';}
    var tg='<span'+(o.x.t==='question'?' class="q"':'')+'>'+toneWord(o.x.t)+'</span>'
      +'<span>'+(o.x.f==='hamnida'?'formal':(o.x.f==='banmal'?'casual':'polite'))+'</span>'
      +'<span>lv '+o.x.lv+'</span>';
    h+='<button class="b-item" data-i="'+o.i+'"><div class="k">'+o.x.k+'</div><div class="r">'+o.x.r+'</div><div class="t">'+tg+'</div></button>';
  });
  if(!items.length) h='<div class="b-set">Nothing here yet</div>';
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
    resetTiles(); $('result').classList.remove('show'); $('hint').textContent='Tap and read it aloud';
  });
});

$('rec').addEventListener('click',run);
$('next').addEventListener('click',function(){
  var cur=S[idx].c,pool=[];
  S.forEach(function(x,i){if(x.c===cur) pool.push(i);});
  var p=pool.indexOf(idx); idx=pool[(p+1)%pool.length]; paint();
});
$('share').addEventListener('click',function(){
  alert('Result card → saved to photos / shared to Instagram.\n\n(Prototype placeholder — the shareable image gets built here.)');
});

/* open on Drama — the hook */
for(var i=0;i<S.length;i++){ if(S[i].c==='drama'){ idx=i; break; } }
paint();
