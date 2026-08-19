/* Set to false to ship. The SIMULATE controls stay in the code and in the
   DOM; the unlock gesture simply stops being wired up, so there is nothing
   to delete and nothing to put back later. */
var DEV_UNLOCK = true;
var DEV_HOLD_MS = 3000;

/* Sounds is meant to be assigned by the diagnostic, not browsed — that is
   why data.js marks it browse:false. There is no diagnostic yet, so it is
   shown during development. Flip to false the day the diagnostic lands. */
var SHOW_SOUNDS_IN_BROWSE = true;

var $=function(id){return document.getElementById(id);};

/* SIMULATE 버튼은 더 이상 채점에 관여하지 않는다. 점수가 Azure 실측이 된
   순간부터 레벨을 골라 난수 대역을 바꾸는 일이 없어졌다. 버튼과 .sim 행은
   그대로 둔다 — 빌드번호가 그 안에 있고 잠금 제스처가 걸려 있다. */
var level='native', idx=0, busy=false, browseCol='everyday', L1='en';

/* 잔여 횟수의 권위는 서버다(18절). 화면에는 마지막으로 받은 값을 그린다.
   서버가 -1을 주면 세지 않는다는 뜻이므로 숫자 대신 ∞를 그린다. */
function paintCredits(){
  $('credits').textContent = Identity.unlimited() ? '∞' : Identity.credits();
}

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

/* 참조 텍스트를 그대로 공백으로만 나눈다. 서버도 이 글자 그대로 Azure에
   보내므로(8.8 — 띄어쓰기가 채점 파라미터다) 여기서 손대면 화면과 채점이
   다른 것을 가리키게 된다. */
function wordsOf(k){
  return k.split(/\s+/).filter(function(w){ return w.length; });
}

function paint(){
  var s=S[idx];
  paintCard();

  /* 15.9 — 첫 버전 타일은 단어(어절) 단위다. 16.2대로 타일 하나가 곧
     "구간"이고, 음절 표시가 열리는 날 이 배열만 음절로 바뀐다.
     문장부호는 어절에 붙은 채로 둔다 — Azure Words도 그렇게 온다. */
  var wrap=$('tiles'); wrap.innerHTML='';
  wordsOf(s.k).forEach(function(w){
    var el=document.createElement('div');
    el.className='tile word';
    el.setAttribute('data-w',w);
    el.innerHTML=w+'<span class="num"></span>';
    wrap.appendChild(el);
  });
  $('result').classList.remove('show');
  $('result').classList.remove('noscore');
  $('l1box').classList.remove('show');
  $('intoNote').classList.remove('show');
  if($('askCard')) $('askCard').hidden = true;
  lastRes = null;
  setHint('hintTap',false);
  $('audioNote').classList.remove('show');
  paintNav();
  savePos();
}

/* 타일 색과 글자 반전 임계는 css의 :root에만 산다. 여기서 읽어 쓰는 이유는
   나중에 결과 카드 이미지를 그릴 때 같은 값을 써야 하기 때문이다 — 두 곳에
   숫자를 적으면 카드와 화면이 갈라진다. 지금 share는 아직 alert 자리표시자라
   색을 쓰지 않는다(15.10 보류 항목). */
var TILE = (function(){
  var cs = window.getComputedStyle ? getComputedStyle(document.documentElement) : null;
  function v(name, fallback){
    var s = cs ? (cs.getPropertyValue(name)||'').trim() : '';
    return s || fallback;
  }
  var flip = parseFloat(v('--tile-flip','66'));
  return { rgb: v('--tile-rgb','30,58,138'), flip: isNaN(flip) ? 66 : flip };
})();

function inkTile(el,sc){
  /* 0.12 바닥은 0점 타일도 흰 종이와 구분되게 하고, 0.84 폭이 점수를 싣는다.
     최대 0.96은 예전 먹물과 같다 — 어두워지는 정도가 아니라 색이 바뀐 것이다. */
  var a=0.12+(sc/100)*0.84;
  el.style.backgroundColor='rgba('+TILE.rgb+','+a.toFixed(3)+')';
  /* 테두리를 채움과 같은 알파로 둔다. 예전에는 +0.14 로 진하게 그렸는데
     옅은 칸(낮은 점수)에서 테두리만 도드라져 점수가 아니라 윤곽이 먼저 보였다.
     같은 색이면 칸의 크기는 유지되면서 테두리가 사라진다. 점수를 못 낸 칸의
     var(--rule) 테두리는 resetTiles 가 그대로 준다 — 그건 "아직"의 표시다. */
  el.style.borderColor='rgba('+TILE.rgb+','+a.toFixed(3)+')';
  el.style.color=sc>=TILE.flip?'var(--paper)':'var(--ink)';
  /* B변형이 잡을 자리. 채움은 건드리지 않고 css가 테두리만 덧칠한다. */
  if(sc<LOW_WORD) el.classList.add('low');
  if(sc<80){
    el.classList.add('flag');
    var n=el.querySelector('.num');
    n.textContent=sc;
    /* the number rides on the tile's own fill, so it flips at the same
       threshold the glyph does. ink-faint disappeared into a pale tile. */
    n.style.color=sc>=TILE.flip?'var(--paper)':'var(--ink-soft)';
  }
}
/* miscue로 빠진 단어. 회색 빈 타일로 두고 숫자를 넣지 않는다 —
   "못 들었다"와 "0점"은 다른 말이다. */
function omitTile(el){
  el.classList.add('omit');
  el.classList.add('flag');
  el.style.backgroundColor='transparent';
  el.style.borderColor='var(--rule)';
  el.style.color='var(--ink-faint)';
  var n=el.querySelector('.num');
  if(n){ n.textContent='—'; n.style.color='var(--ink-faint)'; }
}
function resetTiles(){
  var all=document.querySelectorAll('.tile');
  for(var i=0;i<all.length;i++){var el=all[i];
    el.style.backgroundColor='transparent';
    el.style.borderColor=(el.classList.contains('punct')||el.classList.contains('space'))?'transparent':'var(--rule)';
    el.style.color=el.classList.contains('punct')?'var(--ink-faint)':'var(--ink)';
    el.classList.remove('flag');
    el.classList.remove('omit');
    el.classList.remove('low');
    var n=el.querySelector('.num'); if(n) n.textContent='';}
}

/* Judges the attempt, not the person. 15.10 — 첫 버전 문구는 세 단계다.
   LOW_WORD 아래로 떨어진 단어만 (2)번 줄에 이름이 오른다. */
var VERDICT_HIGH=85, VERDICT_MID=70, LOW_WORD=60;
function verdictFor(tt){
  if(tt>=VERDICT_HIGH) return t('verdictHigh');
  if(tt>=VERDICT_MID) return t('verdictMid');
  return t('verdictLow');
}

/* ---- A-3·A-4: 컬렉션 안에서 좌우로 움직이고, 마지막 자리를 기억한다 ---- */

var POS_KEY = 'naruve.pos';

function poolOf(){
  var cur=S[idx].c, pool=[];
  S.forEach(function(x,i){ if(x.c===cur) pool.push(i); });
  return pool;
}

/* 문장 배열의 인덱스는 data.js 가 바뀌면 밀린다. 그래서 문장 본문도 같이
   적어 두고 복원할 때 그것을 먼저 찾는다. 인덱스는 폴백이다. */
function savePos(){
  try {
    localStorage.setItem(POS_KEY, JSON.stringify({
      c: S[idx].c, i: poolOf().indexOf(idx), k: S[idx].k
    }));
  } catch(e){}
}
function restorePos(){
  var raw=null;
  try { raw = localStorage.getItem(POS_KEY); } catch(e){}
  if(!raw) return false;
  var p; try { p = JSON.parse(raw); } catch(e){ return false; }
  if(!p || !p.c) return false;
  var pool=[]; S.forEach(function(x,i){ if(x.c===p.c) pool.push(i); });
  if(!pool.length) return false;
  for(var j=0;j<pool.length;j++) if(S[pool[j]].k === p.k){ idx=pool[j]; return true; }
  var i = (typeof p.i === 'number' && p.i>=0 && p.i<pool.length) ? p.i : 0;
  idx = pool[i];
  return true;
}

/* 끝에서는 멈춘다. 다음 컬렉션으로 넘기지 않는다 — 컬렉션 이동은 Browse 다. */
function moveBy(d, autoplay){
  var pool=poolOf(), at=pool.indexOf(idx), n=at+d;
  if(n<0 || n>=pool.length) return false;
  idx=pool[n]; paint();
  if(autoplay) playExample();
  return true;
}
function paintNav(){
  var pool=poolOf(), at=pool.indexOf(idx);
  if($('navPos')) $('navPos').textContent = (at+1)+' / '+pool.length;
  if($('prevSent')) $('prevSent').disabled = at<=0;
  if($('nextSent')) $('nextSent').disabled = at>=pool.length-1;
}

/* Tap starts a real take; tap again ends it early. The take also ends
   itself on silence or at the 10s ceiling — see mic.js. */
function run(){
  if(Mic.isLive()){ Mic.stop(); return; }
  if(busy) return; busy=true;
  /* B-3: 예시가 울리는 중에도 녹음 버튼은 살아 있고, 누르면 재생이 즉시 멈춘다.
     stop()은 'ended'를 내지 않으므로 버튼 표시는 손으로 되돌린다. */
  Example.stop(); resetListenBtn();
  $('result').classList.remove('show'); resetTiles();
  $('audioNote').classList.remove('show');

  Mic.record({
    onstart:function(){
      $('rec').classList.add('rec'); setHint('hintListening',true); devMicOpen();
    },
    onlevel:devMicLevel,
    ondone:function(cap){
      /* B-7: 서버를 기다리는 동안 버튼을 잠근다. 두 번 눌러 두 번 과금되는
         일이 없어야 한다. busy 플래그만으로는 화면에 표시가 안 난다. */
      $('rec').classList.remove('rec'); $('rec').classList.add('waiting');
      $('rec').disabled = true;
      setHint('hintScoring',false); devMicDone(cap);
      Score.evaluate(S[idx], cap, function(res, fromCache){
        $('rec').classList.remove('waiting'); $('rec').disabled = false;
        devMicResult(res, fromCache);
        paintCredits();
        paintScore(res);
      });
    },
    onerror:function(kind){
      $('rec').classList.remove('rec'); $('rec').classList.remove('waiting');
      $('rec').disabled = false; devMicOff();
      var note=$('audioNote');
      note.textContent = kind==='denied' ? t('micDenied')
                       : kind==='nospeech' ? t('micNoSpeech')
                       : kind==='nomic' ? t('micNoMic')
                       : kind==='unsupported' ? t('micUnsupported')
                       : t('micFailed');
      note.classList.add('show');
      setHint('hintTap',false); busy=false;
    }
  });
}

/* 채점이 못 끝난 경우들. 총점도 타일도 그리지 않고, 억양만 남긴다 —
   억양은 단말에서 잰 것이라 서버와 무관하게 유효하다(18절 소진 상태 포함). */
function paintNoScore(res){
  var note=$('audioNote');
  note.textContent = res.error==='exhausted' ? t('creditsGone')
                   : res.error==='nothing'   ? t('scoreNothing')
                   : t('scoreServer');
  /* 소진은 잘못이 아니라 상태다(18절). 빨강을 쓰지 않는다. */
  note.classList.toggle('calm', res.error==='exhausted');
  note.classList.add('show');

  $('result').classList.add('noscore');
  $('result').classList.add('show');
  revealResult();
  showIntoNote();
  $('note').textContent='';
  $('l1box').classList.remove('show');
  setHint('hintAgain',false); busy=false;
}

/* .stage가 유일한 스크롤러다. 결과가 마이크·탭바 뒤로 들어가지 않게 올려준다. */
function revealResult(){
  var el=$('result');
  if(!el || !el.scrollIntoView) return;
  try { el.scrollIntoView({ behavior:'smooth', block:'nearest' }); }
  catch(e){ el.scrollIntoView(false); }
}

function paintScore(res){
  lastRes = res;
  if(res.error || !res.azure){ paintNoScore(res); return; }

  /* 타일과 Azure Words를 순서대로 맞춘다. Insertion은 참조에 없는 단어라
     타일을 소비하지 않고, Omission은 타일을 소비하되 회색으로 남는다. */
  var tiles=Array.prototype.slice.call(document.querySelectorAll('.tile.word'));
  var words=res.azure.words||[], ti=0, painted=0;

  /* B: 억양은 문장 끝에서 재므로 감점도 끝 어절이 진다. Omission은 점수가
     없는 칸이라 건너뛰고, 점수가 매겨진 마지막 어절 하나만 골라 둔다.
     깎는 것은 **표시뿐이다** — res.azure.words의 값은 그대로 두고 여기서만
     뺀다. R2의 .azure.json과 dev 로그의 pron이 원본이다 (16절). */
  var lastScored = -1;
  words.forEach(function(w,i){
    if(w.errorType!=='Insertion' && w.errorType!=='Omission') lastScored = i;
  });

  words.forEach(function(w,i){
    if(w.errorType==='Insertion') return;
    var el=tiles[ti++]; if(!el) return;
    if(w.errorType==='Omission'){ setTimeout(function(){ omitTile(el); }, painted*80); }
    else {
      var sc = w.accuracyScore;
      if (res.penalty > 0 && i === lastScored) sc = Math.max(0, sc - res.penalty);
      (function(e,s,d){ setTimeout(function(){ inkTile(e, s); }, d*80); })(el, sc, painted);
    }
    painted++;
  });
  if(ti !== tiles.length){
    console.warn('타일 '+tiles.length+'개 · Azure 구간 '+ti+'개 — 개수가 다르다', words);
  }

  var tt=res.total;
  setTimeout(function(){
    $('result').classList.remove('noscore');
    $('result').classList.add('show');
    var n=0;(function step(){n+=Math.max(1,Math.ceil((tt-n)/6));if(n>=tt)n=tt;
      $('scoreNum').textContent=n; if(n<tt) requestAnimationFrame(step);})();
    bestPut(S[idx].k, tt);
    maybeAskConsent(tt);
    showResult(tt);
    revealResult();
    setHint('hintAgain',false); busy=false;
  }, tiles.length*80+200);
}

/* everything about the result that has words in it, so a language switch
   can replay it without re-running the check */
var lastTotal = 0, lastRes = null;

/* 15.10 (2) — 이름을 부를 수 있는 것은 측정된 단어 점수뿐이다.
   60 미만이 하나도 없으면 이 줄은 아예 뜨지 않는다. */
function lowWords(res){
  if(!res || !res.azure) return [];
  return (res.azure.words||[])
    .filter(function(w){ return w.errorType!=='Insertion'
      && typeof w.accuracyScore==='number' && w.accuracyScore < LOW_WORD; })
    .sort(function(a,b){ return a.accuracyScore-b.accuracyScore; })
    .slice(0,2);
}

/* 15.10 (3) — 억양 방향. 잴 수 없었으면 줄 자체를 넣지 않는다.
   "데이터 부족" 같은 안내를 채워 넣지 않는다. */
function showIntoNote(){
  var box=$('intoNote'), pen=$('intoPenalty');
  if(lastRes && lastRes.feedback){
    box.textContent = t(lastRes.feedback);
    box.classList.add('show');
    if(lastRes.intonation.ok) box.classList.remove('miss'); else box.classList.add('miss');
  } else box.classList.remove('show');

  /* 감점이 있었으면 얼마를 깎았는지 밝힌다. 숫자가 왜 낮은지 모르는 채로
     두면 채점이 임의로 보인다. 감점이 없으면 줄 자체를 넣지 않는다. */
  if(pen){
    if(lastRes && lastRes.penalty > 0){
      pen.textContent = t('intoPenalty').replace('{n}', lastRes.penalty);
      pen.classList.add('show');
    } else pen.classList.remove('show');
  }
}

function showResult(tt){
  lastTotal = tt;

  /* 점수가 없던 회차를 언어 전환으로 다시 그릴 때, 옛 총점의 문구가
     되살아나면 안 된다. 억양 줄만 다시 그린다. */
  if(lastRes && lastRes.error){ showIntoNote(); $('note').textContent=''; return; }

  /* (1) 총점과 한 줄 판정 */
  $('verdict').textContent = verdictFor(tt);

  /* (2) 낮은 단어. 하드코딩된 오류 설명(구 S[].tip)은 쓰지 않는다 —
     15절이 확정 오류 설명을 첫 버전에서 뺐다. */
  var low = lowWords(lastRes);
  if(low.length){
    var names = low.map(function(w){ return '‘'+w.word+'’'; }).join(', ');
    $('note').textContent = t('lowWord').replace('{w}', names);
  } else {
    $('note').textContent = tt>=VERDICT_HIGH ? t('notePerfect') : '';
  }

  /* (3) 억양 */
  showIntoNote();

  /* 15.10 — 첫 버전 오류 설명은 위 세 겹뿐이다. renderL1은 s.w에 박힌
     확정 설명이라 조건부로도 켜지 않는다. 65% 문턱을 넘은 L1부터 켠다. */
  $('l1box').classList.remove('show');
}

/* The button only drives its own state. Which source actually makes the
   sound — recorded file, native TTS, Web Speech — is audio.js's problem. */
function resetListenBtn(){
  $('listen').classList.remove('playing');
  $('listenLabel').textContent = t('listen');
}
/* 듣기 버튼과 "다음 문장"이 같은 함수를 쓴다. 자동 재생은 사용자 동작 직후에만
   일어나야 하므로(브라우저 autoplay 정책과도 같다) paint()가 아니라 클릭
   처리기에서만 부른다. 첫 진입·컬렉션 전환·새로고침은 paint()만 지나간다. */
function playExample(){
  var b=$('listen'), lab=$('listenLabel'), note=$('audioNote');
  note.classList.remove('show');
  /* 여기서 따로 멈추지 않는다. Example.play()가 언제나 stop()을 먼저 지나가고,
     정지 경로가 하나여야 이전 재생이 새 재생 위에 겹치지 않는다 (0.1.18). */
  Example.play(S[idx], {
    onstart:function(){ b.classList.add('playing'); lab.textContent=t('listenPlaying'); },
    onend:resetListenBtn,
    onerror:function(kind){
      resetListenBtn();
      note.textContent = kind==='inapp' ? t('audioInApp')
                       : kind==='unsupported' ? t('audioUnavailable')
                       : t('audioFailed');
      note.classList.add('show');
    }
  });
}
$('listen').addEventListener('click', playExample);

$('pairLink').addEventListener('click',function(){
  idx=parseInt(this.getAttribute('data-i'),10); paint();
});

/* --- L1 explanation: pulled from the phoneme library, not written per sentence --- */
function renderL1(low){
  var box=$('l1box');
  /* 측정으로 낮게 나온 단어가 있을 때만 연다. 예전에는 총점만 보고 늘 열렸고,
     그러면 무엇이 틀렸는지 재지도 않은 채 원인을 단정하는 셈이 된다. */
  if (!low || !low.length){ box.classList.remove('show'); return; }
  var lowText = low.map(function(w){ return w.word; }).join('');
  var s=S[idx], txt=s.k, keys=[], seen={};
  s.w.filter(function(syl){ return lowText.indexOf(syl) >= 0; }).forEach(function(syl){
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
/* 설정 화면과 헤더 버튼이 같은 문을 쓴다. 고른 언어는 기억한다 —
   설정에서 고른 것이 새로고침에 사라지면 설정이 아니다. */
var LANG_KEY = 'naruve.lang';
function setLang(l){
  if(LANGS.indexOf(l) < 0) return;
  L1 = l;
  try { localStorage.setItem(LANG_KEY, l); } catch(e){}
  applyLang();
}
$('l1Btn').addEventListener('click',function(){
  setLang(LANGS[(LANGS.indexOf(L1)+1) % LANGS.length]);
});

function browsable(c){ return c.browse || (c.id==='sounds' && SHOW_SOUNDS_IN_BROWSE); }
function renderCols(){
  var h='';
  COLLECTIONS.forEach(function(c){
    if(!browsable(c)) return;
    var have=S.filter(function(x){return x.c===c.id;}).length;
    h+='<button class="b-col'+(c.id===browseCol?' on':'')+'" data-col="'+c.id+'">'
      +'<span>'+colName(c.id)+'</span><span class="n">'+have+'/'+c.target+'</span></button>';
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
    h+='<button class="b-item" data-i="'+o.i+'"><div class="k">'+o.x.k+'</div><div class="r">'+o.x.r+'</div>'
      +'<div class="g">'+o.x.g+'</div><div class="t">'+tg+'</div></button>';
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
  /* 이 버튼만 컬렉션 안에서 돈다. 끝에서 멈추는 것은 화살표의 몫이다 —
     "다음 문장"은 계속 연습하겠다는 뜻이라 끝에서 막히면 흐름이 끊긴다. */
  var cur=S[idx].c,pool=[];
  S.forEach(function(x,i){if(x.c===cur) pool.push(i);});
  var p=pool.indexOf(idx); idx=pool[(p+1)%pool.length]; paint();
  /* 다음 문장이 뜨자마자 들려준다. 누르고 또 눌러야 들리는 것은 한 동작이 남는다. */
  playExample();
});

if($('prevSent')) $('prevSent').addEventListener('click',function(){ moveBy(-1, true); });
if($('nextSent')) $('nextSent').addEventListener('click',function(){ moveBy(1, true); });

/* 수평 스와이프. **자동 재생하지 않는다** — 세로로 훑다가 손가락이 비스듬히
   나가면 문장이 바뀌는데, 거기에 소리까지 나면 놀란다. 버튼은 의도가 분명하므로
   재생하고 스와이프는 조용히 넘긴다. */
(function(){
  var stage=$('stage'); if(!stage) return;
  var x0=0, y0=0, on=false;
  stage.addEventListener('touchstart', function(e){
    if(e.touches.length!==1){ on=false; return; }
    on=true; x0=e.touches[0].clientX; y0=e.touches[0].clientY;
  }, {passive:true});
  stage.addEventListener('touchend', function(e){
    if(!on) return; on=false;
    var t=e.changedTouches && e.changedTouches[0]; if(!t) return;
    var dx=t.clientX-x0, dy=t.clientY-y0;
    /* 세로 스크롤과 다투지 않도록 가로가 세로보다 확실히 커야 한다 */
    if(Math.abs(dx) < 55 || Math.abs(dx) < Math.abs(dy)*1.6) return;
    moveBy(dx<0 ? 1 : -1, false);
  }, {passive:true});
})();
$('share').addEventListener('click',function(){ alert(t('shareAlert')); });

/* ---------------- 설정 화면 (16.6) ---------------- */

function isNativeShell(){
  var C = window.Capacitor;
  return !!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform());
}

/* 문장별 최고점. **클라이언트에만 있다** — 서버를 부르지 않는다.
   18절의 "진행 기록"은 유료 항목이지만, 이건 원가 0이라 채점 개선에
   참여한 무료 사용자에게 열어 주는 혜택이다. */
var BEST_KEY = 'naruve.best';
function bestAll(){
  try { return JSON.parse(localStorage.getItem(BEST_KEY) || '{}') || {}; } catch(e){ return {}; }
}
function bestPut(k, score){
  if(typeof score !== 'number') return;
  var b = bestAll();
  if(!(k in b) || score > b[k]){ b[k] = score;
    try { localStorage.setItem(BEST_KEY, JSON.stringify(b)); } catch(e){} }
}

function paintSettings(){
  var v = Example.voice();
  ['m','f'].forEach(function(g){
    var b=$('voice'+g.toUpperCase()); if(b) b.classList.toggle('on', v===g);
  });
  ['ko','en'].forEach(function(l){
    var b=$('lang'+l.charAt(0).toUpperCase()+l.slice(1)); if(b) b.classList.toggle('on', L1===l);
  });

  var c = Identity.consent();
  if($('consentState')) $('consentState').textContent = t(c.extended ? 'setConsentOn' : 'setConsentOff');
  if($('consentToggle')) $('consentToggle').textContent = t(c.extended ? 'setLeave' : 'setJoin');

  /* 기록은 참여자에게만. 미참여자에게는 무엇을 하면 열리는지 한 줄. */
  var best = bestAll(), keys = Object.keys(best);
  if($('bestNote')) $('bestNote').textContent =
    !c.extended ? t('setBestLocked') : (keys.length ? '' : t('setBestEmpty'));
  if($('bestList')){
    if(!c.extended || !keys.length){ $('bestList').innerHTML=''; }
    else {
      var byK = {}; S.forEach(function(s){ byK[s.k]=1; });
      var rows = keys.filter(function(k){ return byK[k]; })
        .sort(function(a,b){ return best[b]-best[a]; }).slice(0,12);
      $('bestList').innerHTML = rows.map(function(k){
        return '<div>' + k.replace(/</g,'&lt;') + ' — <b>' + best[k] + '</b></div>';
      }).join('');
    }
  }

  if($('myUuid')) $('myUuid').textContent = Identity.uuid();
  if($('uuidMail')){
    $('uuidMail').href = 'mailto:support@naruve.app'
      + '?subject=' + encodeURIComponent('삭제 요청')
      + '&body=' + encodeURIComponent('식별자: ' + Identity.uuid());
  }
  if($('setVer')) $('setVer').textContent = ($('buildTag') && $('buildTag').textContent) || '—';
  if($('setPolicy')) $('setPolicy').href = (L1==='ko') ? './privacy/' : './privacy/en/';
  if($('setDevRow')) $('setDevRow').hidden = !isNativeShell();
}

if($('tabSettings') && $('settings')){
  $('tabSettings').addEventListener('click',function(){
    var s=$('settings');
    s.hidden = !s.hidden;
    if(!s.hidden){ paintSettings(); $('stage').scrollTop = 0; }
  });
  if($('setClose')) $('setClose').addEventListener('click',function(){ $('settings').hidden = true; });

  ['m','f'].forEach(function(g){
    var b=$('voice'+g.toUpperCase()); if(!b) return;
    b.addEventListener('click',function(){
      Example.setVoice(g); Example.stop(); resetListenBtn(); paintSettings();
    });
  });
  ['ko','en'].forEach(function(l){
    var b=$('lang'+l.charAt(0).toUpperCase()+l.slice(1)); if(!b) return;
    b.addEventListener('click',function(){ setLang(l); paintSettings(); });
  });

  if($('consentToggle')) $('consentToggle').addEventListener('click',function(){
    var c = Identity.consent();
    var next = !c.extended;
    Identity.setConsent(true, next);
    Identity.event(next ? 'consent_prompt' : 'consent_revoke',
                   next ? { accepted:true, from:'settings' } : { from:'settings' });
    paintSettings();
  });

  if($('uuidCopy')) $('uuidCopy').addEventListener('click',function(){
    copyText(Identity.uuid(), $('uuidStat'));
  });

  if($('reloadBtn')) $('reloadBtn').addEventListener('click',function(){ location.reload(); });
}

/* 클립보드는 막힐 수 있다. 막히면 막혔다고 말한다. */
function copyText(s, statEl){
  function done(okc){ if(statEl) statEl.textContent = t(okc ? 'copied' : 'logCopyFail'); }
  if(navigator.clipboard && navigator.clipboard.writeText){
    navigator.clipboard.writeText(s).then(function(){ done(true); }, function(){ done(legacy(s)); });
  } else done(legacy(s));
  function legacy(x){
    try {
      var ta=document.createElement('textarea');
      ta.value=x; ta.setAttribute('readonly','');
      ta.style.position='fixed'; ta.style.top='-1000px';
      document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0,x.length);
      var r=document.execCommand('copy'); ta.remove(); return r;
    } catch(e){ return false; }
  }
}

/* ---------------- 온보딩 (16.4 + 방침 2절) ---------------- */

var obPick = { l1:null, level:null, voice:'f', l1Set:false, levelSet:false };

function obSelect(groupId, v, key){
  var g=$(groupId); if(!g) return;
  Array.prototype.slice.call(g.querySelectorAll('.ob-opt')).forEach(function(b){
    b.classList.toggle('on', b.getAttribute('data-v') === v);
  });
  obPick[key] = v || null;
}
function obRefresh(){
  /* 필수 동의가 없으면 시작할 수 없다. 방침이 "앱을 이용하면 적용됩니다"라고
     적은 기본 처리가 바로 이것이라, 체크 없이 들여보내면 근거가 사라진다. */
  var ok = $('obBase') && $('obBase').checked;
  if($('obStart')) $('obStart').disabled = !ok;
  if($('obWarn')) $('obWarn').hidden = !!ok;
}
function openOnboarding(){
  var o=$('onboard'); if(!o) return;
  obPick.voice = Example.voice();
  obSelect('obVoice', obPick.voice, 'voice');
  if($('obPolicy')) $('obPolicy').href = (L1==='ko') ? './privacy/' : './privacy/en/';
  o.hidden = false;
  obRefresh();
}
if($('onboard')){
  ['obL1','obLevel'].forEach(function(id){
    var g=$(id); if(!g) return;
    g.addEventListener('click',function(e){
      var b=e.target.closest && e.target.closest('.ob-opt'); if(!b) return;
      obSelect(id, b.getAttribute('data-v'), id==='obL1'?'l1':'level');
    });
  });
  var vg=$('obVoice');
  if(vg) vg.addEventListener('click',function(e){
    var b=e.target.closest && e.target.closest('.ob-opt, .ob-play'); if(!b) return;
    var v=b.getAttribute('data-v');
    if(b.classList.contains('ob-play')){
      /* 고르기 전에 들어볼 수 있어야 고르는 뜻이 있다. */
      Example.setVoice(v); obSelect('obVoice', v, 'voice'); playExample();
      return;
    }
    Example.setVoice(v); obSelect('obVoice', v, 'voice');
  });
  if($('obBase')) $('obBase').addEventListener('change', obRefresh);
  if($('obStart')) $('obStart').addEventListener('click',function(){
    if(!$('obBase').checked){ obRefresh(); return; }
    var ext = !!($('obExt') && $('obExt').checked);
    Identity.setConsent(true, ext);
    Identity.finishOnboarding(obPick.l1, obPick.level);
    Identity.event('consent_onboarding', { extended: ext });
    Identity.event('onboarding_done', { l1: obPick.l1, level: obPick.level, voice: Example.voice() });
    $('onboard').hidden = true;
    Example.stop(); resetListenBtn();
  });
}

/* ---------------- 후속 제안 ---------------- */

/* 온보딩에서 선택 동의를 하지 않은 사람에게, **잘 나온 회차에서 한 번만** 묻는다.
   못 나온 회차에 물으면 "이런 걸 왜 가져가나" 싶고, 매번 물으면 성가시다. */
var ASK_MIN = 85;
function maybeAskConsent(total){
  var card=$('askCard'); if(!card) return;
  if(Identity.consent().extended || Identity.consentAsked()){ card.hidden = true; return; }
  if(typeof total !== 'number' || total < ASK_MIN){ card.hidden = true; return; }
  card.hidden = false;
}
if($('askYes')) $('askYes').addEventListener('click',function(){
  Identity.setConsent(true, true);
  Identity.markConsentAsked();
  Identity.event('consent_prompt', { accepted:true, from:'result' });
  $('askCard').hidden = true;
  var n=$('audioNote'); n.textContent=t('askThanks'); n.classList.add('calm'); n.classList.add('show');
});
if($('askNo')) $('askNo').addEventListener('click',function(){
  Identity.markConsentAsked();
  Identity.event('consent_prompt', { accepted:false, from:'result' });
  $('askCard').hidden = true;
});

/* 타일은 A안으로 확정했다 (2026-08-19). 토글이 남긴 키만 치운다 —
   읽지 않으므로 남아 있어도 해는 없지만, 다음 사람이 이걸 보고 아직
   변형이 있는 줄 알면 안 된다. */
try { localStorage.removeItem('naruve.tiles'); } catch(e){}

/* D: 폰에는 콘솔이 없다. 먹먹할 때와 깨끗할 때의 [example] 줄을 눈으로
   비교하려면 화면에 띄울 수단이 있어야 한다. 원인을 가른 뒤 지운다. */
if($('logBtn') && $('logView')){
  $('logBtn').addEventListener('click',function(){
    var v = $('logView');
    if(v.hidden){
      var lines = (window.Example && Example._log) ? Example._log(20) : [];
      $('logText').textContent = lines.length ? lines.join('\n') : t('logEmpty');
      $('logStat').textContent = lines.length ? lines.length + '줄' : '';
      v.hidden = false;
      $('stage').scrollTop = 0;
    } else v.hidden = true;
  });

  /* 사람이 이 줄을 대화창에 붙여넣어야 원인을 가릴 수 있다. 폰에서 긴 <pre>를
     손으로 긁는 것은 사실상 불가능하다. */
  if($('logCopy')) $('logCopy').addEventListener('click',function(){
    var txt = $('logText').textContent || '';
    function done(okc){ $('logStat').textContent = t(okc ? 'logCopied' : 'logCopyFail'); }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(txt).then(function(){ done(true); }, function(){ done(legacy(txt)); });
    } else done(legacy(txt));
    function legacy(s){
      try {
        var ta=document.createElement('textarea');
        ta.value=s; ta.setAttribute('readonly','');
        ta.style.position='fixed'; ta.style.top='-1000px';
        document.body.appendChild(ta); ta.select(); ta.setSelectionRange(0,s.length);
        var r=document.execCommand('copy'); ta.remove(); return r;
      } catch(e){ return false; }
    }
  });
}

/* --- A-4: proof that the microphone is actually receiving sound.
   The panel is hidden by CSS unless body.dev, so these can run always. --- */
function devMicOpen(){
  if(!$('micDev')) return;
  $('micLevel').style.width='0%';
  $('micStat').textContent='0.0s · rms 0.000';
  $('micOut').textContent='';
}
function devMicLevel(rms, ms){
  if(!$('micDev')) return;
  var pct=Math.min(100, Math.round(rms/0.25*100));
  var bar=$('micLevel');
  bar.style.width=pct+'%';
  bar.style.background = rms>=MIC.onsetRms ? 'var(--seal)' : 'var(--rule)';
  $('micStat').textContent=(ms/1000).toFixed(1)+'s · rms '+rms.toFixed(3)
    + (rms>=MIC.onsetRms ? ' · 소리 감지' : '');
}
function devMicDone(cap){
  if(!$('micDev')) return;
  $('micLevel').style.width='0%';
  $('micStat').textContent='held '+(cap.ms/1000).toFixed(1)+'s · audio '
    +(cap.rawMs/1000).toFixed(1)+'s · speech '+(cap.speechMs/1000).toFixed(1)+'s';
  $('micOut').textContent='kept '+(cap.keptMs/1000).toFixed(1)+'s (−'
    +(cap.trimmedMs/1000).toFixed(1)+'s) · peak '+cap.peak.toFixed(3)
    +' · wav '+Math.round(cap.wav.size/1024)+'KB';
}
/* B-4 dev half, and B-5: the blended number cannot show whether the F0
   half works while the other half is Math.random(), so both are printed
   with the raw evidence behind the intonation verdict. */
function devMicResult(res, fromCache){
  if(!$('micOut')) return;
  var i = res.intonation, L = [];
  L.push('engine ' + res.engine + (fromCache ? ' · 캐시 재사용' : '')
    + ' · credits ' + res.credits);
  if(res.error){
    L.push('채점 실패 — ' + res.error);
  } else if(res.azure){
    L.push('total ' + res.total + ' (= Azure PronScore)  acc ' + res.azure.accuracyScore
      + ' · flu ' + res.azure.fluencyScore + ' · comp ' + res.azure.completenessScore);
    L.push('words ' + res.azure.words.map(function(w){
      return w.word + ' ' + w.accuracyScore + (w.errorType!=='None' ? '/'+w.errorType : '');
    }).join('  '));
    L.push('r2 ' + (res.r2Key || '—'));
  }
  if(i.ok === null){
    L.push('F0 판정 불가 — ' + i.reason);
  } else {
    L.push('ΔF0 ' + (i.deltaSt>=0?'+':'') + i.deltaSt + 'st / ' + i.windowMs + 'ms'
      + '  (' + (i.slopeSt>=0?'+':'') + i.slopeSt + ' st/s)  '
      + i.startHz + '→' + i.endHz + 'Hz');
    L.push('expect ' + i.expect + ' · got ' + i.got + ' · ' + (i.ok ? '맞음' : '틀림')
      + '   [flat<' + i.thresholds.clearSt + 'st · full=' + i.thresholds.targetSt
      + 'st · tail=' + i.thresholds.tailMs + 'ms]');
    L.push('voiced ' + i.voiced + '/' + i.total + ' · tail ' + i.frames + 'f · Hz ' + i.hz.join(' '));
  }
  $('micOut').textContent += '\n' + L.join('\n');
}
function devMicOff(){
  if(!$('micDev')) return;
  $('micLevel').style.width='0%';
  $('micStat').textContent='—';
}

/* B-5: tap the readout to put the whole calibration trail on the
   clipboard. Two people reading numbers off a phone screen and typing
   them into a spreadsheet is how calibration sessions die. */
if($('micDev')){
  $('micDev').addEventListener('click', function(){
    var n = Score.log().length;
    if(!n){ $('micStat').textContent = '기록 없음'; return; }
    if(navigator.clipboard && navigator.clipboard.writeText){
      navigator.clipboard.writeText(Score.dump()).then(
        function(){ $('micStat').textContent = '캘리브레이션 로그 ' + n + '건 복사됨'; },
        function(){ $('micStat').textContent = '복사 실패 — 로그 ' + n + '건'; });
    } else $('micStat').textContent = '클립보드 미지원 — 로그 ' + n + '건';
  });
}

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

/* 마지막으로 보던 문장으로 돌아간다. 저장된 것이 없으면 Drama 로 연다 —
   첫인상이 가장 재미있는 컬렉션이어야 한다.
   결과 화면은 복원하지 않는다. 점수는 다시 녹음해서 받는 것이다. */
if(!restorePos()){
  for(var i=0;i<S.length;i++){ if(S[i].c==='drama'){ idx=i; break; } }
}
(function(){
  var saved=null;
  try { saved = localStorage.getItem(LANG_KEY); } catch(e){}
  if(saved && LANGS.indexOf(saved) >= 0) L1 = saved;
})();
applyLang();
paintCredits();
paint();

/* 첫 실행이면 온보딩. 이미 마쳤으면 아무 일도 없다. */
if(!Identity.onboarded()) openOnboarding();
Identity.event('app_start', { onboarded: Identity.onboarded(),
                              consent: Identity.consentTier() });
