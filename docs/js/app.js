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

/* 잔여 횟수의 권위는 서버다(18절). 화면에는 마지막으로 받은 값을 그린다. */
function paintCredits(){ $('credits').textContent = Identity.credits(); }

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
  lastRes = null;
  setHint('hintTap',false);
  $('audioNote').classList.remove('show');
}

function inkTile(el,sc){
  var a=0.10+(sc/100)*0.86;
  el.style.backgroundColor='rgba(17,26,34,'+a.toFixed(3)+')';
  el.style.borderColor='rgba(17,26,34,'+Math.min(a+0.14,1).toFixed(3)+')';
  el.style.color=sc>=52?'var(--paper)':'var(--ink)';
  if(sc<80){el.classList.add('flag');var n=el.querySelector('.num');n.textContent=sc;
    n.style.color=sc>=52?'var(--paper)':'var(--ink-faint)';}
}
/* miscue로 빠진 단어. 회색 빈 타일로 두고 숫자를 넣지 않는다 —
   "못 들었다"와 "0점"은 다른 말이다. */
function omitTile(el){
  el.classList.add('omit');
  el.style.backgroundColor='transparent';
  el.style.borderColor='var(--rule)';
  el.style.color='var(--ink-faint)';
}
function resetTiles(){
  var all=document.querySelectorAll('.tile');
  for(var i=0;i<all.length;i++){var el=all[i];
    el.style.backgroundColor='transparent';
    el.style.borderColor=(el.classList.contains('punct')||el.classList.contains('space'))?'transparent':'var(--rule)';
    el.style.color=el.classList.contains('punct')?'var(--ink-faint)':'var(--ink)';
    el.classList.remove('flag');
    el.classList.remove('omit');
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

/* Tap starts a real take; tap again ends it early. The take also ends
   itself on silence or at the 10s ceiling — see mic.js. */
function run(){
  if(Mic.isLive()){ Mic.stop(); return; }
  if(busy) return; busy=true;
  Example.stop();
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
  note.classList.add('show');

  $('result').classList.add('noscore');
  $('result').classList.add('show');
  showIntoNote();
  $('note').textContent='';
  $('l1box').classList.remove('show');
  setHint('hintAgain',false); busy=false;
}

function paintScore(res){
  lastRes = res;
  if(res.error || !res.azure){ paintNoScore(res); return; }

  /* 타일과 Azure Words를 순서대로 맞춘다. Insertion은 참조에 없는 단어라
     타일을 소비하지 않고, Omission은 타일을 소비하되 회색으로 남는다. */
  var tiles=Array.prototype.slice.call(document.querySelectorAll('.tile.word'));
  var words=res.azure.words||[], ti=0, painted=0;
  words.forEach(function(w){
    if(w.errorType==='Insertion') return;
    var el=tiles[ti++]; if(!el) return;
    if(w.errorType==='Omission'){ setTimeout(function(){ omitTile(el); }, painted*80); }
    else { (function(e,sc,d){ setTimeout(function(){ inkTile(e, sc); }, d*80); })(el, w.accuracyScore, painted); }
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
    showResult(tt);
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
  var box=$('intoNote');
  if(lastRes && lastRes.feedback){
    box.textContent = t(lastRes.feedback);
    box.classList.add('show');
    if(lastRes.intonation.ok) box.classList.remove('miss'); else box.classList.add('miss');
  } else box.classList.remove('show');
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

  renderL1(low);
}

/* The button only drives its own state. Which source actually makes the
   sound — recorded file, native TTS, Web Speech — is audio.js's problem. */
$('listen').addEventListener('click',function(){
  var b=$('listen'), lab=$('listenLabel'), note=$('audioNote');
  note.classList.remove('show');
  if(b.classList.contains('playing')){ Example.stop(); }
  function done(){ b.classList.remove('playing'); lab.textContent=t('listen'); }
  Example.play(S[idx], {
    onstart:function(){ b.classList.add('playing'); lab.textContent=t('listenPlaying'); },
    onend:done,
    onerror:function(kind){
      done();
      note.textContent = kind==='inapp' ? t('audioInApp')
                       : kind==='unsupported' ? t('audioUnavailable')
                       : t('audioFailed');
      note.classList.add('show');
    }
  });
});

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
$('l1Btn').addEventListener('click',function(){
  L1 = LANGS[(LANGS.indexOf(L1)+1) % LANGS.length];
  applyLang();
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
  var cur=S[idx].c,pool=[];
  S.forEach(function(x,i){if(x.c===cur) pool.push(i);});
  var p=pool.indexOf(idx); idx=pool[(p+1)%pool.length]; paint();
});
$('share').addEventListener('click',function(){ alert(t('shareAlert')); });

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

/* open on Drama — the hook */
for(var i=0;i<S.length;i++){ if(S[i].c==='drama'){ idx=i; break; } }
applyLang();
paintCredits();
paint();
