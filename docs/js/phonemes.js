/* =====================================================================
   L1 EXPLANATION LIBRARY
   Keyed by PHONEME, not by sentence. 10 entries cover all 50 sentences,
   and they keep covering them when the library grows to 3,000.
   Adding a language = one new column, not a rewrite.
   ===================================================================== */
var PHONEMES = {
  tense: { name:'Tense consonants ㄲ ㄸ ㅃ ㅆ ㅉ',
    en:'English has no tense consonants, so you are substituting the plain one — <span class="syl">짜</span> comes out as <span class="syl">자</span>. Tighten your throat as if you were about to lift something heavy, then release. <b>No puff of air at all</b> — that is what separates it from ㅊ.',
    id:'Bahasa Indonesia tidak punya konsonan tegang, jadi Anda menggantinya dengan bunyi biasa — <span class="syl">짜</span> terdengar seperti <span class="syl">자</span>. Tegangkan tenggorokan seperti akan mengangkat benda berat, lalu lepaskan. <b>Tanpa hembusan udara sama sekali.</b>' },

  aspirated: { name:'Aspirated consonants ㅋ ㅌ ㅍ ㅊ',
    en:'English already aspirates these at the start of a word, so this one is in your favour — but you may be dropping the puff mid-word. Hold a hand in front of your mouth: <b>you should feel the air hit it</b>.',
    id:'Bahasa Indonesia mengucapkan /p, t, k/ <b>tanpa</b> hembusan, jadi <span class="syl">파</span> Anda mudah terdengar seperti <span class="syl">바</span>. Letakkan tangan di depan mulut — Anda harus merasakan hembusan udara.' },

  eo: { name:'The vowel ㅓ',
    en:'English has no ㅓ, so most learners round it into "aw" or "oh". It sits closer to the vowel in <b>"sun"</b> — lips completely relaxed, never pushed forward.',
    id:'Bahasa Indonesia tidak punya ㅓ, jadi Anda kemungkinan besar menggantinya dengan <b>/o/</b>. Bunyinya lebih dekat ke "e" pada <b>"beli"</b>, tetapi mulut lebih terbuka. Bibir tidak boleh membulat.' },

  eu: { name:'The vowel ㅡ',
    en:'English has no ㅡ either, and it usually becomes "oo". Spread your lips slightly as if starting a smile, then say "uh" <b>without moving them</b>.',
    id:'Mirip "e" pada <b>"sekolah"</b>, tetapi lidah ditarik ke belakang. Jangan bulatkan bibir — begitu bibir membulat, bunyinya menjadi ㅜ.' },

  glide: { name:'Glide vowels ㅘ ㅙ ㅚ ㅝ ㅞ ㅟ',
    en:'This is <b>one</b> sound, not two. English speakers split it into "dwe-ae". Start in the w position and slide straight through with no break in the middle.',
    id:'Ini <b>satu</b> bunyi, bukan dua. Penutur Indonesia sering memecahnya menjadi dua suku kata. Mulai dari posisi "w" lalu luncur langsung tanpa jeda.' },

  batchim: { name:'Stopped final consonants',
    en:'English <b>releases</b> final consonants — "cat" ends with a small puff. Korean does not. Put your tongue or lips in position, stop, and leave them there. The syllable ends in silence.',
    id:'Kabar baik: bahasa Indonesia <b>sudah punya</b> penutup tak dilepas — seperti <b>"anak"</b> atau <b>"sebab"</b>. Pakai kebiasaan itu di sini. Berhenti di posisi dan jangan dilepaskan.' },

  ng: { name:'Final ㅇ',
    en:'The same sound as "ng" in <b>"sing"</b>. Let it resonate in your nose — do not cut it short into an "n".',
    id:'Sama seperti "ng" pada <b>"uang"</b>. Ini mudah bagi Anda — biarkan bergema di hidung, jangan diubah menjadi "n".' },

  linking: { name:'Linking across syllables',
    en:'The final consonant jumps into the next syllable. <span class="syl">한국어</span> is said <b>한구거</b>. Do not stop between them — Korean runs straight across the boundary.',
    id:'Konsonan akhir berpindah ke suku kata berikutnya. <span class="syl">한국어</span> dibaca <b>한구거</b>. Jangan berhenti di antara keduanya.' },

  lateral: { name:'ㄴ turning into ㄹ',
    en:'ㄴ followed by ㄹ becomes ㄹㄹ. <span class="syl">신라면</span> is said <b>실라면</b>. Write it one way, say it another.',
    id:'ㄴ diikuti ㄹ berubah menjadi ㄹㄹ. <span class="syl">신라면</span> dibaca <b>실라면</b>. Ditulis begini, diucapkan begitu.' },

  hdrop: { name:'ㅎ disappearing',
    en:'ㅎ vanishes before a vowel. <span class="syl">좋아</span> is said <b>조아</b>. Do not try to pronounce the h — pronouncing it is the mistake.',
    id:'ㅎ hilang sebelum vokal. <span class="syl">좋아</span> dibaca <b>조아</b>. Jangan berusaha melafalkan h — justru itu kesalahannya.' }
};

var L1_LABEL = { en:'EN', id:'ID' };
var L1_HEAD  = { en:'Why this happens', id:'Kenapa ini terjadi' };

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
