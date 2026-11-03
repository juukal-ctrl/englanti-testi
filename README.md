# Englanti

Henkilökohtainen, ei-kaupallinen amerikanenglannin harjoitussovellus (taso B2+, ammatillinen viestintä ja sujuva puhe).
Toimii selaimessa ja asentuu tarvittaessa puhelimen aloitusnäytölle. Ei tiliä, ei seurantaa, ei palvelinta:
kaikki oppimisdata pysyy omalla laitteella.

Sovellus, sisältö ja koodi on tehty Clauden avulla.

**Osoite:** https://juukal-ctrl.github.io/englanti-testi/

## Mitä sovelluksessa on

- **Päivän sessio (noin 15 min):** kertaus, uudet ilmaukset ja puheharjoitus peräkkäin.
- **Kertaus FSRS-6-ajastuksella:** ilmaukset palaavat juuri ennen unohtamista. Tavoitesäilyvyys 90 % (säädettävä).
- **Harjoitustyypit:** aukkotehtävä, merkityksen muistaminen, englanniksi sanominen tai kirjoittaminen, kuuntele ja toista.
- **Puhe:** selaimen oma puhesynteesi (kuuntele) ja puheentunnistus (sano). Tunnistus on apuväline, ei arvosana.
- **Sanasto, edistyminen, asetukset** sekä JSON-varmuuskopion vienti ja tuonti.
- **Offline:** koko sovellus välimuistitetaan (service worker) ja toimii ilman verkkoa.
- **Laitetesti:** vaiheen 0 mittaussivu on tallessa osoitteessa `/laitetesti/`.

Sisältö on tällä hetkellä 12 aihetta ja 126 ilmausta. Katso [CONTENT.md](CONTENT.md).

## Kehitys

Ei koontivaihetta: sovellus on pelkkiä ES-moduuleja, joten tiedostoja voi muokata suoraan.

```bash
# Yksikkötestit (FSRS, tallennus, sisältö, täsmäys, service workerin tuoreus)
node --test tests/*.test.mjs

# Selaintesti oikeassa Chromiumissa (tarvitsee Playwrightin)
NODE_PATH=/usr/local/lib/node_modules_global E2E_OUT=/tmp/e2e-out node tests/e2e/app.cjs

# Päivitä service workerin versio ja tiedostolista – AJA AINA, kun sovellustiedostoja muuttuu
node tools/stamp.mjs
```

`tools/stamp.mjs` laskee sisältötiivisteen kaikista sovellustiedostoista (`css/`, `js/`, `data/`, `icons/`,
`index.html`, `manifest.webmanifest`) ja kirjoittaa sen `sw.js`:ään. Ilman sitä käyttäjä saattaisi jäädä vanhan version
varaan. Yksikkötesti `tests/stamp.test.mjs` epäonnistuu, jos leimaus on jäänyt tekemättä.

### Rakenne

```
index.html, manifest.webmanifest, sw.js   sovelluskuori ja offline-välimuisti
css/app.css                               ulkoasu (vaalea ja tumma teema, mobiili ensin)
js/
  app.js          käynnistys, reititin (#/today, #/review, …), asetusten käyttöönotto
  fsrs.js         FSRS-6 (21 painoa, Anki-oletukset), verrattu riippumattomaan Python-toteutukseen
  srs.js          kortit, kirjaus, erääntyvien jono
  db.js           IndexedDB (muistivaraus), varmuuskopion vienti ja tuonti
  runner.js       tehtäväjono, aikaraja, virheiden palautus jonoon
  exercises.js    harjoitustyypit
  speech.js       puhesynteesi ja puheentunnistus
  match.js        puheen ja kirjoituksen täsmäys
  stats.js        edistymisluvut
  views/          näkymät (Tänään, sessio, kertaus, oppitunti, puhu, sanasto, edistyminen, asetukset)
data/units.js     sisältö (aiheet ja ilmaukset)
tests/            yksikkötestit ja tests/e2e (Playwright)
tools/            stamp.mjs, kuvakkeiden luonti, FSRS-vertailutoteutus
laitetesti/       vaiheen 0 laitetesti (oma service worker ja oma välimuisti)
```

### Periaatteet

- Suhteelliset polut kaikkialla: sivusto palvelee alipolusta `/englanti-testi/`.
- Ei `innerHTML`:ää: DOM rakennetaan `h()`-apufunktiolla ja teksti asetetaan tekstisolmuna.
- Tiukka Content-Security-Policy (`index.html`): vain oma lähdekoodi, ei kolmannen osapuolen skriptejä, ei sisäisiä tyylejä.
- Ei ulkoisia riippuvuuksia ajon aikana. Kuvakkeet ovat Material Design Icons (Apache-lisenssi 2.0).

## Julkaisu

GitHub Pages palvelee `main`-haaran juurta. Push `main`-haaraan julkaisee muutokset noin minuutissa.
Pagesin välimuisti voi tarjota vanhoja tiedostoja vielä jonkin aikaa; service worker hakee tiedostot versiokohtaisella
kyselyparametrilla, jotta uusi versio ei jää vanhojen tiedostojen sekaan.

Ennen pushia: `node --test tests/*.test.mjs` ja `node tools/stamp.mjs`.

## Yksityisyys ja turvallisuus

- Oppimisdata (kortit, kertaushistoria, asetukset) tallentuu vain selaimen IndexedDB-tietokantaan. Varmuuskopio on käyttäjän
  oma JSON-tiedosto, eikä se sisällä API-avaimia.
- Puheentunnistus käyttää selaimen omaa tunnistusta. Kun laite on verkossa, Chrome voi lähettää äänen
  tunnistuspalveluunsa. Äänitallenteita ei tallenneta. Asetuksista voi valita kirjoittamisen mikrofonin sijaan.
- Kaikki `juukal-ctrl.github.io`-osoitteen sivut jakavat saman selainympäristön (origin). Siksi mitään salaista ei
  tallenneta pysyvästi selaimeen.
- Tulossa oleva tekoälypalaute lähettää vain käyttäjän kirjoittaman tekstin valitulle palveluntarjoajalle käyttäjän omalla
  API-avaimella. Avainta ei tallenneta koodiin, varmuuskopioon eikä GitHubiin.

## Lähteet

- FSRS-algoritmi: [open-spaced-repetition](https://github.com/open-spaced-repetition) (FSRS-6, oletuspainot).
- Kuvakkeet: Material Design Icons, Apache-lisenssi 2.0.
