// Käynnistysvahti. Tavallinen (ei moduuli) skripti, joka ei riipu sovelluksen muista tiedostoista.
// Jos sovellus ei ole käynnistynyt kymmenessä sekunnissa (rikkoutunut välimuisti, moduulin latausvirhe tms.),
// näytetään korjausnappi: se poistaa service workerin ja sovelluskuoren välimuistin ja lataa sivun uudelleen.
// Oppimisdataa (IndexedDB) ja äänivälimuistia ei poisteta. Sovellus merkitsee itsensä valmiiksi (html[data-ready]).
(function () {
  var limit = Number(window.__bootGuardMs) > 0 ? Number(window.__bootGuardMs) : 10000;
  var ready = function () {
    return document.documentElement.getAttribute('data-ready') === '1';
  };

  async function repair() {
    try {
      var regs = (navigator.serviceWorker && (await navigator.serviceWorker.getRegistrations())) || [];
      for (var i = 0; i < regs.length; i++) await regs[i].unregister();
    } catch (e) {
      /* ei service workeria */
    }
    try {
      var keys = (window.caches && (await caches.keys())) || [];
      for (var j = 0; j < keys.length; j++) {
        if (keys[j].indexOf('englanti-') === 0 && keys[j] !== 'englanti-audio-v1') await caches.delete(keys[j]);
      }
    } catch (e) {
      /* ei välimuistia */
    }
    location.reload();
  }

  function show() {
    if (ready() || document.getElementById('boot-guard')) return;
    var box = document.createElement('div');
    box.id = 'boot-guard';
    box.className = 'banner warn';
    box.setAttribute('role', 'alert');
    var text = document.createElement('p');
    text.textContent = 'Sovellus ei käynnistynyt kunnolla. Korjaus tyhjentää sovelluksen välimuistin ja lataa sen uudelleen. Oppimisdataasi ei poisteta.';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'btn primary';
    btn.id = 'boot-guard-fix';
    btn.textContent = 'Korjaa ja yritä uudelleen';
    btn.addEventListener('click', function () {
      btn.disabled = true;
      repair();
    });
    box.appendChild(text);
    box.appendChild(btn);
    (document.getElementById('banner') || document.body).prepend(box);
    // Jos sovellus käynnistyy hitaasti myöhemmin, vahti poistuu itsestään.
    var poll = setInterval(function () {
      if (ready()) {
        box.remove();
        clearInterval(poll);
      }
    }, 500);
  }

  setTimeout(show, limit);
})();
