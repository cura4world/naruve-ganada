/* =====================================================================
   API — 채점 서버 한 곳으로만 나간다

   DECISIONS.md 17.1 앱은 Azure를 직접 부르지 않는다. 우리 Worker가 부른다.
   구독키가 배포물에 들어가지 않고, 무료 30회를 서버가 세며, 로그 저장이
   채점과 같은 경로에서 끝난다.

   서버 규격은 worker/README.md에 있다. 여기서 지켜야 하는 것 셋:
   - 참조 텍스트는 URL-encoded UTF-8로 헤더에 담는다. 헤더에 한글을 그대로 못 넣는다
   - **참조 텍스트를 손대지 않는다.** 띄어쓰기가 채점 파라미터다(8.8) —
     같은 발화가 66 ↔ 97.6점으로 움직인다. trim·정규화 금지
   - WAV 바이트를 그대로 보낸다. 변환은 이미 mic.js가 끝냈다(17.2)
   ===================================================================== */

var Api = (function(){
  var BASE = 'https://naruve-ganada-score.cura4world.workers.dev';

  /* 서버는 8초에 Azure를 끊는다. 그보다 넉넉히 잡아 서버가 스스로 502를
     돌려줄 여유를 준다 — 클라이언트가 먼저 끊으면 이유를 알 수 없다. */
  var TIMEOUT_MS = 12000;

  /* cb(err, data)
     err 는 null 이거나 { kind, credits }
       'exhausted'  402 — 무료 30회 소진 (18절)
       'nothing'    422 — 한 단어도 못 알아들음
       'server'     그 외 비200
       'network'    fetch 실패·타임아웃 */
  function score(refText, wavBlob, ids, cb){
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = setTimeout(function(){ if(ctl) ctl.abort(); }, TIMEOUT_MS);
    var done = false;
    function finish(err, data){
      if(done) return; done = true;
      clearTimeout(timer);
      cb(err, data);
    }

    fetch(BASE + '/score', {
      method: 'POST',
      headers: {
        'Content-Type': 'audio/wav',
        'X-Naruve-UUID': ids.uuid,
        'X-Naruve-Session': ids.session,
        'X-Naruve-Recording': ids.recording,
        'X-Naruve-Ref': encodeURIComponent(refText)
      },
      body: wavBlob,
      signal: ctl ? ctl.signal : undefined
    }).then(function(res){
      return res.text().then(function(txt){
        var body = null;
        try { body = JSON.parse(txt); } catch(e){}
        if (res.ok){ finish(null, body); return; }
        if (res.status === 402){ finish({ kind:'exhausted', credits:0 }); return; }
        if (res.status === 422){ finish({ kind:'nothing' }); return; }
        finish({ kind:'server', status: res.status, body: body });
      });
    }).catch(function(){
      /* 타임아웃(abort)과 네트워크 오류를 같은 자리에서 다룬다.
         사용자에게는 둘 다 "잠시 후 다시"다. */
      finish({ kind:'network' });
    });
  }

  return { base: BASE, score: score, timeoutMs: TIMEOUT_MS };
})();
