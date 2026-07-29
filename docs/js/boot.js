/* Naruve — boot
   Two jobs:
     1. show which build this phone is actually running
     2. register the service worker and react when a newer one appears        */

(function () {
  var tag = document.getElementById('buildTag');

  /* ---- 1. build number on screen ---- */
  fetch('./version.json?t=' + Date.now(), { cache: 'no-store' })
    .then(function (r) { return r.json(); })
    .then(function (v) {
      if (tag) tag.textContent = 'v' + v.build + ' · ' + v.date;
    })
    .catch(function () {
      if (tag) tag.textContent = 'v— offline';
    });

  /* ---- 2. service worker ---- */
  if (!('serviceWorker' in navigator)) return;

  window.addEventListener('load', function () {
    navigator.serviceWorker.register('./sw.js', { scope: './' })
      .then(function (reg) {

        // a new worker showed up while the app was open
        reg.addEventListener('updatefound', function () {
          var sw = reg.installing;
          if (!sw) return;
          sw.addEventListener('statechange', function () {
            if (sw.state === 'installed' && navigator.serviceWorker.controller) {
              showUpdateBar(reg);
            }
          });
        });

        // check for a new build every time the app comes back to the front
        document.addEventListener('visibilitychange', function () {
          if (!document.hidden) reg.update();
        });
      })
      .catch(function (err) { console.warn('SW registration failed', err); });

    var reloading = false;
    navigator.serviceWorker.addEventListener('controllerchange', function () {
      if (reloading) return;
      reloading = true;
      window.location.reload();
    });
  });

  function showUpdateBar(reg) {
    if (document.getElementById('updateBar')) return;
    var bar = document.createElement('button');
    bar.id = 'updateBar';
    bar.className = 'update-bar';
    bar.textContent = 'New build ready — tap to load';
    bar.addEventListener('click', function () {
      if (reg.waiting) reg.waiting.postMessage('SKIP_WAITING');
    });
    document.body.appendChild(bar);
  }
})();
