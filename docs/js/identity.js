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

  var deviceId = get(K_UUID);
  if (!deviceId){ deviceId = uuidv4(); set(K_UUID, deviceId); }

  /* 이 실행 하나가 한 세션이다. 새로고침하면 새 세션이 된다. */
  var sessionId = uuidv4();

  return {
    /* 설정 화면(P6 예정)이 "내 식별자 보기"에 쓴다 — 16.6 삭제 요청 경로 */
    uuid: function(){ return deviceId; },
    session: function(){ return sessionId; },
    newRecordingId: function(){ return uuidv4(); },

    /* 마지막으로 서버가 알려준 잔여. 아직 한 번도 못 받았으면 30으로 그린다. */
    credits: function(){
      var v = get(K_CREDITS);
      if (v === null) return FREE;
      var n = parseInt(v, 10);
      return isNaN(n) ? FREE : Math.max(0, n);
    },
    setCredits: function(n){
      if (typeof n !== 'number' || isNaN(n)) return;
      set(K_CREDITS, String(Math.max(0, Math.round(n))));
    },
    free: FREE
  };
})();
