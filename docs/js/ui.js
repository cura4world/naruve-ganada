/* =====================================================================
   UI STRINGS
   한국어가 마스터본이다. 문구를 바꾸거나 새로 만들 때 ko를 먼저 쓰고,
   나머지 언어는 그 뜻을 옮긴다. 영어를 먼저 쓰고 한국어로 옮기면
   번역투가 남는다.

   언어를 추가하면 열 하나를 더한다. 빠진 키는 en으로 폴백하므로
   부분만 채워도 화면이 비지 않는다.

   id는 지금 UI 열이 없다 — 의도된 상태다. 인도네시아어는 음소 설명
   (phonemes.js)에만 있고 UI는 영어로 떨어진다. 인도네시아어 UI 문구가
   준비되면 여기에 id: { ... } 를 추가하기만 하면 된다.
   ===================================================================== */

var UI = {
  ko: {
    brand:'발음',
    /* 앞의 공백 여부가 문자열에 딸려 있다. 한국어는 27회, 영어는 27 checks. */
    checksLeft:'회 남음',
    browse:'문장 보기',
    browseTitle:'문장 보기',
    close:'닫기',
    recordAria:'내 목소리 녹음',

    toneRising:'올림',
    toneExclam:'올렸다 내림',
    toneLevel:'평탄',

    formHamnida:'합니다체 · 격식',
    formHaeyo:'해요체 · 높임',
    formBanmal:'반말 · 낮춤',

    pairEveryday:'실제로는 이렇게 말해요 →',
    pairStandard:'교과서 표현 보기 →',

    listen:'예시 듣기',
    listenPlaying:'재생 중',

    hintTap:'눌러서 소리 내어 읽으세요',
    hintListening:'듣는 중…',
    hintScoring:'채점 중…',
    hintAgain:'다시 하려면 누르세요',

    scoreLabel:'점수',
    notePerfect:'모든 음절이 제자리에 놓였어요. 다음 문장으로 가세요.',
    shareBtn:'결과 카드',
    nextBtn:'다음 문장',

    /* 이번 발음이 어땠는지를 말한다. 사람의 실력을 규정하지 않는다. */
    verdict90:'원어민이 듣기에 자연스러움',
    verdict75:'알아듣는 데 무리 없음',
    verdict60:'두세 곳만 고치면 됩니다',
    verdict0:'받침과 끝음절부터',
    /* 15.10 첫 버전 세 단계 — 85 / 70 / 그 아래 */
    verdictHigh:'또렷하고 자연스러워요',
    verdictMid:'잘 들려요 — 낮은 단어를 다시 들어보세요',
    verdictLow:'조금 더 — 아래 단어들에 집중해 보세요',
    lowWord:'{w}이(가) 낮아요. 예시를 다시 들어보세요.',
    creditsGone:'정밀 채점 30회를 모두 사용하셨어요. 듣기·따라 말하기·억양 확인은 계속 할 수 있어요.',
    scoreNothing:'소리가 잘 안 들렸어요. 조용한 곳에서 다시 해보세요.',
    scoreServer:'채점 서버가 잠시 응답하지 않아요. 잠시 후 다시 해보세요.',

    col:{
      standard:{ n:'표준', b:'교과서와 TOPIK에 나오는 한국어. 생략 없는 완전한 문장.' },
      everyday:{ n:'일상', b:'같은 상황을 실제로 말하는 방식. 더 짧고 빠르고, 조사가 빠져요.' },
      drama:{    n:'드라마', b:'드라마에서 계속 들리는 말 — 반응, 감정, 다툼.' },
      sounds:{   n:'소리', b:'약한 소리를 골라 만든 연습 문장.' }
    },
    tagFormal:'격식',
    tagPolite:'높임',
    tagCasual:'낮춤',
    lvPrefix:'레벨 ',
    emptyList:'아직 없어요',

    tabPractice:'연습',
    tabHonorifics:'높임말',
    tabYou:'나',
    tabSettings:'설정',
    settingsSoon:'설정 화면은 준비 중입니다.',
    /* 임시 예시 음성 토글. 온보딩(P6-B)이 생기면 이 세 키와 함께 사라진다. */
    voicePick:'예시 음성',
    voiceMale:'남자',
    voiceFemale:'여자',

    simLabel:'시뮬레이션',
    simNative:'원어민',
    simAdvanced:'상급',
    simIntermediate:'중급',
    simBeginner:'초급',

    /* "크롬에서 열어라"는 인앱 브라우저에서만 옳다. 설치된 앱 안에서는
       열 크롬이 없다. audio.js가 상황을 가려 셋 중 하나만 보낸다. */
    /* 억양 피드백은 무엇이 틀렸는지까지 말한다. "틀렸습니다"로 끝내지 않는다. */
    intoRiseGood:'끝을 올렸습니다 — 좋습니다.',
    intoRiseFlat:'의문문인데 끝이 평평합니다. 마지막 음절을 올리세요.',
    intoRiseFell:'의문문인데 끝을 내렸습니다. 마지막 음절을 올리세요.',
    intoFallGood:'끝을 내렸습니다 — 좋습니다.',
    intoFallFlat:'끝이 평평합니다. 마지막 음절을 내리세요.',
    intoFallRose:'평서문인데 끝을 올렸습니다. 마지막 음절을 내리세요.',

    micDenied:'마이크 권한이 필요해요. 설정에서 허용해 주세요.',
    micNoSpeech:'소리가 들리지 않았어요. 다시 눌러서 읽어 주세요.',
    micNoMic:'마이크를 찾지 못했어요.',
    micUnsupported:'이 환경에서는 녹음할 수 없어요.',
    micFailed:'녹음에 실패했어요. 다시 시도해 주세요.',

    audioInApp:'인앱 브라우저에서는 소리가 막혀요. 브라우저로 열어 주세요.',
    audioUnavailable:'이 기기에서는 예시 음성을 재생할 수 없어요.',
    audioFailed:'재생에 실패했어요. 미디어 음량을 확인해 주세요.',

    shareAlert:'결과 카드 → 사진에 저장 / 인스타그램 공유\n\n(프로토타입 자리표시자 — 공유 이미지가 여기서 만들어집니다.)'
  },

  en: {
    brand:'Pronunciation',
    checksLeft:' checks left',
    browse:'Browse',
    browseTitle:'Browse',
    close:'Close',
    recordAria:'Record your voice',

    toneRising:'Rising',
    toneExclam:'Peak then fall',
    toneLevel:'Level',

    formHamnida:'합니다체 · formal',
    formHaeyo:'해요체 · polite',
    formBanmal:'반말 · casual',

    pairEveryday:'How people actually say it →',
    pairStandard:'The textbook version →',

    listen:'Hear it spoken',
    listenPlaying:'Playing',

    hintTap:'Tap and read it aloud',
    hintListening:'Listening…',
    hintScoring:'Scoring…',
    hintAgain:'Tap to try again',

    scoreLabel:'Your score',
    notePerfect:'Every syllable landed. Try the next one.',
    shareBtn:'Share card',
    nextBtn:'Next sentence',

    verdict90:'Sounds natural to a Korean ear',
    verdict75:'Understood without effort',
    verdict60:'Two or three spots to fix',
    verdict0:'Start with final consonants and syllable endings',
    verdictHigh:'Clear and natural',
    verdictMid:'Easy to follow — listen to the low words again',
    verdictLow:'Nearly there — focus on the words below',
    lowWord:'{w} came out low. Listen to the example again.',
    creditsGone:'You have used all 30 detailed checks. Listening, speaking and the intonation check still work.',
    scoreNothing:'That did not come through clearly. Try again somewhere quieter.',
    scoreServer:'The scoring server is not answering right now. Please try again in a moment.',

    col:{
      standard:{ n:'Standard', b:'The Korean in your textbook and on TOPIK. Complete sentences, nothing dropped.' },
      everyday:{ n:'Everyday', b:'The same situations, the way people actually say them. Shorter, faster, particles gone.' },
      drama:{    n:'Drama',    b:'The lines you keep hearing in K-dramas — reactions, feelings, arguments.' },
      sounds:{   n:'Sounds',   b:'Drills assigned from your weak sounds.' }
    },
    tagFormal:'formal',
    tagPolite:'polite',
    tagCasual:'casual',
    lvPrefix:'lv ',
    emptyList:'Nothing here yet',

    tabPractice:'Practice',
    tabHonorifics:'Honorifics',
    tabYou:'You',
    tabSettings:'Settings',
    settingsSoon:'Settings are on the way.',
    voicePick:'Example voice',
    voiceMale:'Male',
    voiceFemale:'Female',

    simLabel:'Simulate',
    simNative:'Native',
    simAdvanced:'Advanced',
    simIntermediate:'Intermediate',
    simBeginner:'Beginner',

    intoRiseGood:'You lifted the ending — good.',
    intoRiseFlat:'This is a question, but the ending stayed flat. Lift the last syllable.',
    intoRiseFell:'This is a question, but you dropped the ending. Lift the last syllable.',
    intoFallGood:'You let the ending fall — good.',
    intoFallFlat:'The ending stayed flat. Let the last syllable fall.',
    intoFallRose:'This is a statement, but you lifted the ending. Let the last syllable fall.',

    micDenied:'Microphone access is needed. Allow it in settings.',
    micNoSpeech:'Nothing was heard. Tap and read it aloud again.',
    micNoMic:'No microphone found.',
    micUnsupported:'Recording is not available here.',
    micFailed:'Recording failed. Try again.',

    audioInApp:'In-app browsers block audio. Open this in your browser.',
    audioUnavailable:'Example audio is not available on this device.',
    audioFailed:'Playback failed. Check your media volume.',

    shareAlert:'Result card → saved to photos / shared to Instagram.\n\n(Prototype placeholder — the shareable image gets built here.)'
  }
};

/* The partial column the header promised. Indonesian has no UI chrome
   yet, but the intonation feedback is the one thing a learner must read
   in their own language to act on it, so those keys are filled and the
   rest falls through to en. Adding more Indonesian is adding more keys
   here — nothing else has to change. */
UI.id = {
  intoRiseGood:'Akhirnya Anda naikkan — bagus.',
  intoRiseFlat:'Ini kalimat tanya, tetapi akhirnya datar. Naikkan suku kata terakhir.',
  intoRiseFell:'Ini kalimat tanya, tetapi akhirnya Anda turunkan. Naikkan suku kata terakhir.',
  intoFallGood:'Akhirnya Anda turunkan — bagus.',
  intoFallFlat:'Akhirnya datar. Turunkan suku kata terakhir.',
  intoFallRose:'Ini kalimat berita, tetapi akhirnya Anda naikkan. Turunkan suku kata terakhir.'
};

/* toggle order */
var LANGS = ['en','id','ko'];
