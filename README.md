# Englanti

Henkilökohtainen, ei-kaupallinen amerikanenglannin harjoitussovellus (taso B2+, ammatillinen viestintä ja sujuva puhe).
Toimii selaimessa ja asentuu tarvittaessa puhelimen aloitusnäytölle. Ei tiliä, ei seurantaa, ei palvelinta:
kaikki oppimisdata pysyy omalla laitteella.

Sovellus, sisältö ja koodi on tehty Clauden avulla.

**Osoite:** https://juukal-ctrl.github.io/englanti-testi/

## Mitä sovelluksessa on

- **Päivän sessio (aikarajattu, oletus 15 min):** kertaus, uudet ilmaukset ja puheharjoitus. Katso [Päivän sessio](#päivän-sessio).
- **Kertaus FSRS-6-ajastuksella:** ilmaukset palaavat juuri ennen unohtamista. Tavoitesäilyvyys 90 % (säädettävä).
- **Harjoitustyypit:** opetus (kuuntele, lue, sano ääneen), aukkotehtävä, merkityksen muistaminen, englanniksi sanominen tai kirjoittaminen sekä kuuntele ja sano perässä (shadowing).
- **Puhe:** esiäänitetty Kokoro-ääni (luonnollinen painotus, myös hitaasti; toimii ilman verkkoa, kun äänet on ladattu laitteelle), laitteen oma puhesynteesi varana sekä puheentunnistus (sano). Tunnistus on apuväline, ei arvosana. Numerot hyväksytään kaikissa muodoissa (`3`, `third`, `three`). Katso [Äänet](#äänet-kokoro).
- **Sanasto, edistyminen, asetukset** sekä JSON-varmuuskopion vienti ja tuonti.
- **Offline:** koko sovellus välimuistitetaan (service worker) ja toimii ilman verkkoa.
- **Laitetesti:** vaiheen 0 mittaussivu on tallessa osoitteessa `/laitetesti/`.

Sisältö on tällä hetkellä 12 aihetta ja 126 ilmausta. Katso [CONTENT.md](CONTENT.md).

## Päivän sessio

Sessio on aikarajattu (asetus `sessionMinutes`, oletus 15 min) ja koostuu kolmesta osasta:

1. **Kertaus** (enintään 45 % ajasta): erääntyneet kortit.
2. **Uudet ilmaukset** ryhmissä (3 kerrallaan), kunnes aika tai päiväraja (`newMax`, oletus 12) tulee vastaan:
   aiheen esittely (jos aiheesta ei ole vielä opittu mitään) → opetus ×3 (kuuntele, lue, sano ääneen) → testi ×3
   (ensimmäinen arvosana ajastukselle) → tuottaminen ×3 (suomesta englanniksi, ei arvosanaa).
   "Osaan tämän jo" kirjaa ilmauksen helpoksi (Easy) eikä kuluta päivän rajaa.
3. **Puhe** (loppuaika, 3–8 lausetta): kuuntele ja sano perässä.

Ryhmää ei aloiteta, ellei sille jää aikaa, eikä ryhmää keskeytetä kesken. Jos oppija etenee nopeasti, sessio päättyy
suunnitelman loppuun; "15 min lisää" jatkaa uusilla ilmauksilla. Tänään-näkymä näyttää todellisen harjoitteluajan
(yksittäinen tehtävä lasketaan enintään 90 sekuntia, jotta tauko ei kerrytä aikaa).

Ensimmäisinä kertoina ilmaus ei voi saada arvosanaa "Helppo", koska juuri nähty ei ole varmasti pitkäkestoista muistia.

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
  speech.js       puhesynteesi (myös jono: ilmaus ja esimerkki) ja puheentunnistus; esiäänitetty leike ensin, laitteen ääni varana
  clips.js        esiäänitetyt Kokoro-leikkeet: manifesti, haku, ennakkolataus ja toisto
  speakable.js    tekstin muokkaus äänentoistoa varten (päivämäärät järjestyslukuina, aukon merkit pois)
  match.js        puheen ja kirjoituksen täsmäys (numerot yhtenäistetään: 3 = third = three)
  stats.js        edistymisluvut
  views/          näkymät (Tänään, sessio, kertaus, oppitunti, puhu, sanasto, edistyminen, asetukset)
data/units.js     sisältö (aiheet ja ilmaukset)
audio/            esiäänitetyt leikkeet (.ogg) ja manifest.json; GitHub Actions generoi ja tallentaa nämä
tests/            yksikkötestit ja tests/e2e (Playwright)
tools/            stamp.mjs, kuvakkeiden luonti, FSRS-vertailutoteutus
tools/tts/        äänten generointi: texts.mjs (tekstit), generate.py (Kokoro), requirements.txt
.github/workflows/kokoro-audio.yml   generointi GitHub Actionsissa
laitetesti/       vaiheen 0 laitetesti (oma service worker ja oma välimuisti)
```

### Periaatteet

- Suhteelliset polut kaikkialla: sivusto palvelee alipolusta `/englanti-testi/`.
- Ei `innerHTML`:ää: DOM rakennetaan `h()`-apufunktiolla ja teksti asetetaan tekstisolmuna.
- Tiukka Content-Security-Policy (`index.html`): vain oma lähdekoodi, ei kolmannen osapuolen skriptejä, ei sisäisiä tyylejä.
- Ei ulkoisia riippuvuuksia ajon aikana. Kuvakkeet ovat Material Design Icons (Apache-lisenssi 2.0).

## Äänet (Kokoro)

Laitteen oma puhesynteesi lukee lyhyet ilmaukset nopeasti ja ilman painotuksia. Siksi sovelluksen kaikki luettavat
tekstit äänitetään valmiiksi avoimen [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M)-mallin amerikanenglannin
äänellä (`af_heart`, Apache-lisenssi). Äänet ovat tiedostoja (`audio/*.ogg`, Opus, yhteensä noin 5 Mt), jotka Pages
julkaisee sovelluksen mukana. Mallia ei ajeta laitteella.

**Toimintaperiaate**

1. `tools/tts/texts.mjs` luettelee kaikki tekstit, jotka sovellus voi lukea (ilmaus, esimerkkilause, malli, täytetty
   aukkolause, asetusten testilause) ja erikseen ne, joilla on "Hitaasti"-painike. Tekstit ovat `speakable()`-muodossa.
2. `tools/tts/generate.py` tekee jokaisesta tekstistä leikkeen (normaali nopeus 0,9, hidas 0,65), leikkaa hiljaisuudet,
   tasaa voimakkuuden, pakkaa Opus-muotoon ja kirjoittaa `audio/manifest.json`in (teksti → tiedoston tunniste).
   Tiedoston nimi on tiiviste tekstistä, äänestä, nopeudesta ja putken versiosta, joten valmiita leikkeitä ei tehdä
   uudelleen eikä vanha leike voi jäädä käyttöön. Tarpeettomat tiedostot poistetaan.
3. `.github/workflows/kokoro-audio.yml` ajaa tämän GitHub Actionsissa, kun `data/`, `js/speakable.js` tai `tools/tts/`
   muuttuu (tai käsin: Actions → Kokoro audio → Run workflow, valinta "force" tekee kaiken uudelleen), ja tallentaa
   tuloksen `main`-haaraan. Aja ennen omaa pushia `git pull --rebase`, jos botti on ehtinyt tallentaa äänet.
4. Sovellus (`js/clips.js`, `js/speech.js`) hakee leikkeen manifestista. Jos leikettä ei ole tai sitä ei saada ladattua,
   teksti luetaan laitteen äänellä. Asetuksista voi valita pelkän laitteen äänen ja ladata kaikki äänet laitteelle
   offline-käyttöä varten. Service worker säilyttää ne omassa välimuistissaan (`englanti-audio-v1`), joten
   sovelluspäivitys ei tyhjennä niitä.

**Virheenjäljitys:** työnkulun loki tallentuu aina haaraan `kokoro-log` (`build.log`, `manifest.json`, `status.txt`).

**Paikallinen putkitesti ilman mallia:** `python3 tools/tts/generate.py --texts texts.json --out /tmp/audio --fake`
tekee samat tiedostot testiäänellä (tarvitsee python3:n, numpyn ja ffmpegin). E2E-testit käyttävät tätä.

**Uusi sisältö:** lisää ilmauksia `data/units.js`iin. Työnkulku tekee puuttuvat leikkeet itse. Jos jokin sana luetaan
väärin, siitä kannattaa ilmoittaa ("Ilmoita virheestä" -linkki harjoituksessa). Korjaus tehdään tiedostoon
`tools/tts/respell.json` (`{ "säännöllinen lauseke": "korvaus" }`, esim. `{ "\\bPO\\b": "P O" }`): se koskee vain äänitystä, ja
muuttuneet leikkeet tehdään automaattisesti uudelleen.

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
