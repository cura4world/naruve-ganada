/* =====================================================================
   L1 EXPLANATION LIBRARY
   Keyed by PHONEME, not by sentence. 10 entries cover all 50 sentences,
   and they keep covering them when the library grows to 3,000.
   Adding a language = one new column, not a rewrite.
   ko는 마스터본이다. 새 항목은 ko를 먼저 쓰고 나머지를 옮긴다.
   ===================================================================== */
var PHONEMES = {
  tense: { name:'Tense consonants ㄲ ㄸ ㅃ ㅆ ㅉ',
    ko:'된소리는 거센소리도 예사소리도 아니다. 배우는 사람은 대개 예사소리로 바꿔서 <span class="syl">짜</span>가 <span class="syl">자</span>로 들린다. 무거운 것을 들기 직전처럼 목을 조인 뒤 터뜨린다. <b>바람은 전혀 새지 않아야 한다</b> — 그게 ㅊ과 갈리는 지점이다.',
    en:'English has no tense consonants, so you are substituting the plain one — <span class="syl">짜</span> comes out as <span class="syl">자</span>. Tighten your throat as if you were about to lift something heavy, then release. <b>No puff of air at all</b> — that is what separates it from ㅊ.',
    id:'Bahasa Indonesia tidak punya konsonan tegang, jadi Anda menggantinya dengan bunyi biasa — <span class="syl">짜</span> terdengar seperti <span class="syl">자</span>. Tegangkan tenggorokan seperti akan mengangkat benda berat, lalu lepaskan. <b>Tanpa hembusan udara sama sekali.</b>' },

  aspirated: { name:'Aspirated consonants ㅋ ㅌ ㅍ ㅊ',
    ko:'거센소리는 바람이 함께 나가야 한다. 단어 첫머리에서는 대체로 되는데 가운데로 들어가면 바람이 빠진다. 입 앞에 손을 대고 소리 내 본다 — <b>손바닥에 바람이 닿아야 한다</b>.',
    en:'English already aspirates these at the start of a word, so this one is in your favour — but you may be dropping the puff mid-word. Hold a hand in front of your mouth: <b>you should feel the air hit it</b>.',
    id:'Bahasa Indonesia mengucapkan /p, t, k/ <b>tanpa</b> hembusan, jadi <span class="syl">파</span> Anda mudah terdengar seperti <span class="syl">바</span>. Letakkan tangan di depan mulut — Anda harus merasakan hembusan udara.' },

  eo: { name:'The vowel ㅓ',
    ko:'ㅓ는 ㅗ가 아니다. 입술을 둥글게 말면 그 순간 ㅗ로 넘어간다. <b>입술에 힘을 완전히 빼고</b> 앞으로 내밀지 않은 채 턱만 살짝 내린다.',
    en:'English has no ㅓ, so most learners round it into "aw" or "oh". It sits closer to the vowel in <b>"sun"</b> — lips completely relaxed, never pushed forward.',
    id:'Bahasa Indonesia tidak punya ㅓ, jadi Anda kemungkinan besar menggantinya dengan <b>/o/</b>. Bunyinya lebih dekat ke "e" pada <b>"beli"</b>, tetapi mulut lebih terbuka. Bibir tidak boleh membulat.' },

  eu: { name:'The vowel ㅡ',
    ko:'ㅡ는 ㅜ로 미끄러지기 쉽다. 입술을 옆으로 살짝 펴서 웃기 직전 모양을 만든 다음, <b>그 모양을 유지한 채</b> 소리를 낸다. 입술이 둥글어지는 순간 ㅜ가 된다.',
    en:'English has no ㅡ either, and it usually becomes "oo". Spread your lips slightly as if starting a smile, then say "uh" <b>without moving them</b>.',
    id:'Mirip "e" pada <b>"sekolah"</b>, tetapi lidah ditarik ke belakang. Jangan bulatkan bibir — begitu bibir membulat, bunyinya menjadi ㅜ.' },

  glide: { name:'Glide vowels ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ',
    ko:'이건 <b>한 소리</b>지 두 소리가 아니다. 두 음절로 끊어 읽으면 바로 어색해진다. w 자리에서 시작해 중간에 멈추지 말고 그대로 미끄러진다.',
    en:'This is <b>one</b> sound, not two. English speakers split it into "dwe-ae". Start in the w position and slide straight through with no break in the middle.',
    id:'Ini <b>satu</b> bunyi, bukan dua. Penutur Indonesia sering memecahnya menjadi dua suku kata. Mulai dari posisi "w" lalu luncur langsung tanpa jeda.' },

  batchim: { name:'Stopped final consonants',
    ko:'받침은 <b>터뜨리지 않는다</b>. 혀나 입술을 자리에 갖다 대고 멈춘 뒤 그대로 둔다. 음절은 소리가 아니라 침묵으로 끝난다. 끝에서 바람이 새면 그 순간 외국인 발음이 된다.',
    en:'English <b>releases</b> final consonants — "cat" ends with a small puff. Korean does not. Put your tongue or lips in position, stop, and leave them there. The syllable ends in silence.',
    id:'Kabar baik: bahasa Indonesia <b>sudah punya</b> penutup tak dilepas — seperti <b>"anak"</b> atau <b>"sebab"</b>. Pakai kebiasaan itu di sini. Berhenti di posisi dan jangan dilepaskan.' },

  ng: { name:'Final ㅇ',
    ko:'받침 ㅇ은 코로 울리는 소리다. 끝을 짧게 끊어 ㄴ으로 만들지 않는다. <b>코에 울림이 남아야</b> 한다.',
    en:'The same sound as "ng" in <b>"sing"</b>. Let it resonate in your nose — do not cut it short into an "n".',
    id:'Sama seperti "ng" pada <b>"uang"</b>. Ini mudah bagi Anda — biarkan bergema di hidung, jangan diubah menjadi "n".' },

  linking: { name:'Linking across syllables',
    ko:'받침이 다음 음절로 넘어간다. <span class="syl">한국어</span>는 <b>한구거</b>로 소리 난다. 사이에서 멈추지 않는다 — 한국어는 경계를 그대로 타고 넘어간다.',
    en:'The final consonant jumps into the next syllable. <span class="syl">한국어</span> is said <b>한구거</b>. Do not stop between them — Korean runs straight across the boundary.',
    id:'Konsonan akhir berpindah ke suku kata berikutnya. <span class="syl">한국어</span> dibaca <b>한구거</b>. Jangan berhenti di antara keduanya.' },

  lateral: { name:'ㄴ turning into ㄹ',
    ko:'ㄴ 뒤에 ㄹ이 오면 ㄹㄹ이 된다. <span class="syl">신라면</span>은 <b>실라면</b>으로 소리 난다. 쓰는 대로 읽지 않는다.',
    en:'ㄴ followed by ㄹ becomes ㄹㄹ. <span class="syl">신라면</span> is said <b>실라면</b>. Write it one way, say it another.',
    id:'ㄴ diikuti ㄹ berubah menjadi ㄹㄹ. <span class="syl">신라면</span> dibaca <b>실라면</b>. Ditulis begini, diucapkan begitu.' },

  hdrop: { name:'ㅎ disappearing',
    ko:'ㅎ은 모음 앞에서 사라진다. <span class="syl">좋아</span>는 <b>조아</b>로 소리 난다. ㅎ을 살려 발음하려는 것 자체가 틀린 습관이다.',
    en:'ㅎ vanishes before a vowel. <span class="syl">좋아</span> is said <b>조아</b>. Do not try to pronounce the h — pronouncing it is the mistake.',
    id:'ㅎ hilang sebelum vokal. <span class="syl">좋아</span> dibaca <b>조아</b>. Jangan berusaha melafalkan h — justru itu kesalahannya.' }
};

var L1_LABEL = { en:'EN', id:'ID', ko:'KO' };
var L1_HEAD  = { en:'Why this happens', id:'Kenapa ini terjadi', ko:'왜 이렇게 되나요' };

/* --- Hangul decomposition: derive phonemes automatically, no manual tagging --- */
var CHO_TENSE = [1,4,8,10,13];        /* ㄲㄸㅃㅆㅉ */
var CHO_ASP   = [16,17,18,14];        /* ㅋㅌㅍㅊ  */
var JUNG_GLIDE= [9,10,11,14,15,16];   /* ㅘㅙㅚㅝㅞㅟ */
var JONG_STOP = [1,2,7,17,19,20,22,23,24,25,26];
function decomp(ch){
  var c = ch.charCodeAt(0) - 0xAC00;
  if (c < 0 || c > 11171) return null;
  return { cho:Math.floor(c/588), jung:Math.floor((c%588)/28), jong:c%28 };
}
function phonemesFor(syl, nextSyl){
  var d = decomp(syl); if(!d) return [];
  var out = [];
  if (CHO_TENSE.indexOf(d.cho) >= 0) out.push('tense');
  if (CHO_ASP.indexOf(d.cho)   >= 0) out.push('aspirated');
  if (JUNG_GLIDE.indexOf(d.jung)>= 0) out.push('glide');
  if (d.jung === 4)  out.push('eo');
  if (d.jung === 18) out.push('eu');
  var nd = nextSyl ? decomp(nextSyl) : null;
  if (d.jong === 27) out.push('hdrop');
  else if (d.jong === 4 && nd && nd.cho === 5) out.push('lateral');
  else if (d.jong !== 0 && nd && nd.cho === 11) out.push('linking');
  else if (JONG_STOP.indexOf(d.jong) >= 0) out.push('batchim');
  else if (d.jong === 21) out.push('ng');
  return out;
}
