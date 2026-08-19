/* =====================================================================
   IDENTITY — 익명 UUID · 세션 · 녹음 ID · 크레딧 캐시

   DECISIONS.md 17.3 로그인 없음. 첫 실행에 UUID 하나를 만들어 두고 서버가
   그 ID로 횟수를 센다. 재설치하면 새 ID가 나오고 30회가 초기화된다 —
   알고 감수하는 한계다(우회 비용 약 120~150원).

   DECISIONS.md 16.1 세션 ID는 "같은 문장을 연달아 시도한 묶음"이다.
   재시도 이력이 이 ID로 묶인다. 앱을 열 때 하나 만들고 그 실행 동안 유지한다.

   DECISIONS.md 18   무료 30회는 총량이다. **권위는 서버에 있다.**
   여기 저장하는 값은 화면에 바로 그릴 숫자일 뿐이고, 응답이 올 때마다
   서버 값으로 덮어쓴다. localStorage를 지워도 서버 카운터는 그대로다.
   ===================================================================== */

var Identity = (function(){
  var K_UUID = 'naruve.uuid';
  var K_CREDITS = 'naruve.credits';
  var FREE = 30;
  /* 서버가 이 값을 주면 총량을 세지 않는다는 뜻이다. worker의 DEV_CREDITS와 같은 값. */
  var UNLIMITED = -1;

  /* Safari 프라이빗 모드 등에서 localStorage 접근 자체가 던진다.
     저장이 안 되는 것이 앱이 죽을 이유는 아니므로 메모리로 떨어진다. */
  var mem = {};
  function get(k){
    try { var v = localStorage.getItem(k); return v === null ? (k in mem ? mem[k] : null) : v; }
    catch(e){ return (k in mem) ? mem[k] : null; }
  }
  function set(k, v){
    mem[k] = v;
    try { localStorage.setItem(k, v); } catch(e){}
  }

  function uuidv4(){
    if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
    /* 아주 오래된 웹뷰용 폴백. 서버의 8-4-4-4-12 검사를 통과하는 형식이면 된다. */
    var b = new Uint8Array(16);
    (window.crypto && crypto.getRandomValues)
      ? crypto.getRandomValues(b)
      : (function(){ for(var i=0;i<16;i++) b[i] = Math.floor(Math.random()*256); })();
    b[6] = (b[6] & 0x0f) | 0x40;
    b[8] = (b[8] & 0x3f) | 0x80;
    var h = [];
    for (var i=0;i<16;i++) h.push((b[i]+0x100).toString(16).slice(1));
    return h.slice(0,4).join('') + '-' + h.slice(4,6).join('') + '-'
         + h.slice(6,8).join('') + '-' + h.slice(8,10).join('') + '-'
         + h.slice(10,16).join('');
  }

  /* 개발 셸 APK 는 UUID 를 고정한다.

     WebView 는 크롬과 별도 저장소를 쓰므로 앱을 지웠다 깔 때마다 새 UUID 가
     나오고, 그때마다 테스터 예외 목록(18.2)에 다시 등록해야 했다.

     개발 셸을 알아보는 법 — 네이티브이면서 원격 오리진을 띄우고 있으면 그것이다.
     17.10 대로 개발용만 server.url 로 https://naruve.app/ 를 띄우고 출시본은
     번들이라 localhost 다. 그래서 이 조건은 출시본에서 저절로 거짓이 된다.

     값은 평범한 UUID 꼴이어야 한다. worker 의 UUID_RE 가 8-4-4-4-12 hex 만
     받으므로 'dev-apk-' 같은 접두어를 붙이면 400 bad_uuid 로 막힌다. */
  var DEV_SHELL_UUID = '00000000-0000-4000-8000-000000000001';
  function isDevShell(){
    try {
      var C = window.Capacitor;
      if (!(C && typeof C.isNativePlatform === 'function' && C.isNativePlatform())) return false;
      return location.hostname === 'naruve.app';
    } catch(e){ return false; }
  }

  var deviceId = isDevShell() ? DEV_SHELL_UUID : get(K_UUID);
  if (!deviceId){ deviceId = uuidv4(); set(K_UUID, deviceId); }
  if (isDevShell()) set(K_UUID, deviceId);

  /* 이 실행 하나가 한 세션이다. 새로고침하면 새 세션이 된다. */
  var sessionId = uuidv4();

  return {
    /* 설정 화면(P6 예정)이 "내 식별자 보기"에 쓴다 — 16.6 삭제 요청 경로 */
    uuid: function(){ return deviceId; },
    session: function(){ return sessionId; },
    newRecordingId: function(){ return uuidv4(); },

    /* 마지막으로 서버가 알려준 잔여. 아직 한 번도 못 받았으면 30으로 그린다.
       서버가 -1을 주면 "세지 않는다"는 뜻이다(개발자·테스터). 0으로 깎아 버리면
       소진과 구별되지 않아 채점이 통째로 막힌다 — 그래서 -1만 예외로 통과시킨다. */
    credits: function(){
      var v = get(K_CREDITS);
      if (v === null) return FREE;
      var n = parseInt(v, 10);
      if (isNaN(n)) return FREE;
      return n === UNLIMITED ? UNLIMITED : Math.max(0, n);
    },
    unlimited: function(){
      var v = get(K_CREDITS);
      return v !== null && parseInt(v, 10) === UNLIMITED;
    },
    setCredits: function(n){
      if (typeof n !== 'number' || isNaN(n)) return;
      var r = Math.round(n);
      set(K_CREDITS, String(r === UNLIMITED ? UNLIMITED : Math.max(0, r)));
    },
    free: FREE,
    UNLIMITED: UNLIMITED
  };
})();
