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
- **Kirjoita:** lyhyet työviestit englanniksi (sähköposti, pikaviesti). Palaute tulee heti laitteella, ilman verkkoa: sääntötarkistus löytää tyypillisiä virheitä (prepositiot, päivämäärä- ja lukumuodot, amerikkalainen oikeinkirjoitus, kohteliaisuus, suomenkieliset sanat), näyttää puuttuvat asiat ja harjoiteltavat ilmaukset sekä antaa kuunneltavan mallivastauksen. Katso [Kirjoita](#kirjoita).
- **Sanasto, edistyminen, asetukset** sekä JSON-varmuuskopion vienti ja tuonti.
- **Offline:** koko sovellus välimuistitetaan (service worker) ja toimii ilman verkkoa.
- **Laitetesti:** vaiheen 0 mittaussivu on tallessa osoitteessa `/laitetesti/`.

Sisältö on tällä hetkellä 12 aihetta, 126 ilmausta ja 12 kirjoitustehtävää. Katso [CONTENT.md](CONTENT.md).

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

## Kirjoita

Kirjoitustehtävä on lyhyt työtilanne ("kirjoita seurantaviesti asiakkaalle"), joka sisältää tilanteen, tarvittaessa saadun
englanninkielisen viestin, 2–5 sisältökohtaa ja 2–4 harjoiteltavaa ilmausta oppitunneilta. Tehtävät ovat tiedostossa
[`data/writing.js`](data/writing.js).

**Palaute (sääntötarkistus, `js/writing.js` ja `js/writing-rules.js`):** puhdas JavaScript-moduuli, ei verkkoa eikä tekoälyä.
Se tarkistaa sanamäärän, tervehdyksen ja päätöksen (viestityypin mukaan), tunnistaa sisältökohdat ja harjoiteltavat ilmaukset ja
huomauttaa tyypillisistä virheistä suomalaisen oppijan kannalta: prepositiot (*discuss about*, *depend from*), aikamuodot
(*since two years*), päivämäärät, kellonajat ja luvut suomalaisessa muodossa (`3.11.2026`, `14.30`, `1 000,50`), brittiläinen
oikeinkirjoitus, yleiset kirjoitusvirheet, kohteliaisuus (*I want*, käskylauseet, vain kohteliaissa tehtävissä), suomenkieliset
sanat sekä isot kirjaimet. Virheet korostetaan käyttäjän omassa tekstissä ja jokaisesta on suomenkielinen selitys ja korjausehdotus.

**Rajat (kerrotaan myös käyttöliittymässä):** tarkistus ei löydä kaikkea (esimerkiksi puuttuvia artikkeleita) eikä arvioi tekstin
sujuvuutta kokonaisuutena. Säännöt on valittu niin, että oikea englanti ei saa huomautusta: yksikkötestit ajavat kaikki
sovelluksen esimerkkilauseet ja mallivastaukset sääntöjen läpi ja vaativat nollan huomautusta.

**Tallennus:** keskeneräinen teksti (`writeDrafts`) ja yritysloki (`writeLog`: sanamäärä, virheiden määrä, valmis/ei) säilyvät vain
tällä laitteella. Ne eivät ole mukana varmuuskopiossa. Kirjoittamiseen käytetty aika kirjautuu päivän harjoitteluaikaan
(tauot katkaistaan 45 sekuntiin).

**Äänet:** mallivastausten ja saatujen viestien lauseet äänitetään samalla Kokoro-äänellä kuin muu sisältö
(`tools/tts/texts.mjs` käyttää samaa lauseisiin jakoa kuin sovellus, `speechParts`).

## Kehitys

Ei koontivaihetta: sovellus on pelkkiä ES-moduuleja, joten tiedostoja voi muokata suoraan.

```bash
# Yksikkötestit (FSRS, tallennus, sisältö, täsmäys, service workerin tuoreus)
node --test tests/*.test.mjs

# Selaintesti oikeassa Chromiumissa (tarvitsee Playwrightin). Kokoro-osio tarvitsee lisäksi python3:n, numpyn ja ffmpegin
# (muuten se ohitetaan); se generoi testiäänet ja säilyttää ne kansiossa $E2E_AUDIO_DIR (oletus /tmp/e2e-fake-audio).
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
  writing.js      kirjoitustehtävien tarkistus (puhdas moduuli): sanamäärä, sisältökohdat, ilmaukset, rakenne, lauseisiin jako
  writing-rules.js  virhesäännöt (taulukko; jokaisella tunniste, luokka, vakavuus, selitys ja korjaus)
  views/          näkymät (Tänään, sessio, kertaus, oppitunti, puhu, kirjoita, sanasto, edistyminen, asetukset)
data/units.js     sisältö (aiheet ja ilmaukset)
data/writing.js   kirjoitustehtävät (tilanne, sisältökohdat, harjoiteltavat ilmaukset, mallivastaus)
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
   aukkolause, kirjoitustehtävän mallivastauksen ja saadun viestin lauseet, asetusten testilause) ja erikseen ne, joilla on "Hitaasti"-painike. Tekstit ovat `speakable()`-muodossa.
2. `tools/tts/generate.py` tekee jokaisesta tekstistä leikkeen (Kokoron nopeus normaali 0,76 ≈ 155 sanaa minuutissa, hidas 0,55
   ≈ 110; ensimmäinen ajo 0,9 oli noin 190 sanaa minuutissa eli liian nopea), leikkaa hiljaisuudet,
   tasaa voimakkuuden, pakkaa Opus-muotoon ja kirjoittaa `audio/manifest.json`in (teksti → tiedoston tunniste).
   Tiedoston nimi on tiiviste tekstistä, äänestä, nopeudesta ja putken versiosta, joten valmiita leikkeitä ei tehdä
   uudelleen eikä vanha leike voi jäädä käyttöön. Tarpeettomat tiedostot poistetaan.
3. `.github/workflows/kokoro-audio.yml` ajaa tämän GitHub Actionsissa, kun `data/`, `js/speakable.js`, `js/content.js`, `js/writing.js` tai `tools/tts/`
   muuttuu (tai käsin: Actions → Kokoro audio → Run workflow, valinta "force" tekee kaiken uudelleen), ja tallentaa
   tuloksen `main`-haaraan. Aja ennen omaa pushia `git pull --rebase`, jos botti on ehtinyt tallentaa äänet.
4. Sovellus (`js/clips.js`, `js/speech.js`) hakee leikkeen manifestista. Jos leikettä ei ole tai sitä ei saada ladattua,
   teksti luetaan laitteen äänellä. Asetuksista voi valita pelkän laitteen äänen ja ladata kaikki äänet laitteelle
   offline-käyttöä varten. Service worker säilyttää ne omassa välimuistissaan (`englanti-audio-v1`), joten
   sovelluspäivitys ei tyhjennä niitä.

**Virheenjäljitys:** työnkulun loki tallentuu aina haaraan `kokoro-log` (`build.log`, `manifest.json`, `status.txt`) sekä
`phonemes.tsv`, joka kertoo, miten Kokoro lukee jokaisen tekstin (foneemit) ja mitkä sanat eivät löytyneet sanakirjasta
kultaisella luokituksella. Ääntämisvirheet löytyvät sieltä kuuntelematta: lue vaikeat sanat (lyhenteet, summat, päivämäärät).

**Paikallinen putkitesti ilman mallia:** `python3 tools/tts/generate.py --texts texts.json --out /tmp/audio --fake`
tekee samat tiedostot testiäänellä (tarvitsee python3:n, numpyn ja ffmpegin). E2E-testit käyttävät tätä.

**Uusi sisältö:** lisää ilmauksia `data/units.js`iin. Työnkulku tekee puuttuvat leikkeet itse. Jos jokin sana luetaan
väärin, siitä kannattaa ilmoittaa ("Ilmoita virheestä" -linkki harjoituksessa). Korjaus tehdään tiedostoon
`tools/tts/respell.json` (`{ "säännöllinen lauseke": "korvaus" }`): se koskee vain äänitystä, ja muuttuneet leikkeet
tehdään automaattisesti uudelleen. Korvaukseksi kelpaa myös oma ääntämys muodossa `[sana](/foneemit/)`, esim.
`{ "\\bPO\\b": "[PO](/pˌiˈO/)" }`. Foneemit kirjoitetaan misakin amerikanenglannin merkinnällä: `A` = eɪ, `I` = aɪ,
`O` = oʊ, `W` = aʊ, `Y` = ɔɪ, `ʤ` = dʒ, `ʧ` = tʃ, `T` = r-äänteinen t (flap); `ˈ` on pääpaino ja `ˌ` sivupaino.
Mallin lukutapa selviää ajon jälkeen tiedostosta `phonemes.tsv` (haara `kokoro-log`).

## Julkaisu

GitHub Pages palvelee `main`-haaran juurta. Push `main`-haaraan julkaisee muutokset noin minuutissa.
Pagesin välimuisti voi tarjota vanhoja tiedostoja vielä jonkin aikaa; service worker hakee tiedostot versiokohtaisella
kyselyparametrilla, jotta uusi versio ei jää vanhojen tiedostojen sekaan.

Ennen pushia: `node --test tests/*.test.mjs` ja `node tools/stamp.mjs`.

## Yksityisyys ja turvallisuus

- Oppimisdata (kortit, kertaushistoria, asetukset, kirjoitusluonnokset ja -yritysloki) tallentuu vain selaimen IndexedDB-tietokantaan.
  Varmuuskopio on käyttäjän oma JSON-tiedosto (kortit, kertaushistoria, asetukset), eikä se sisällä API-avaimia eikä kirjoitusluonnoksia.
- Kirjoita-näkymän sääntötarkistus toimii kokonaan laitteella: kirjoittamaasi tekstiä ei lähetetä minnekään.
- Puheentunnistus käyttää selaimen omaa tunnistusta. Kun laite on verkossa, Chrome voi lähettää äänen
  tunnistuspalveluunsa. Äänitallenteita ei tallenneta. Asetuksista voi valita kirjoittamisen mikrofonin sijaan.
- Kaikki `juukal-ctrl.github.io`-osoitteen sivut jakavat saman selainympäristön (origin). Siksi mitään salaista ei
  tallenneta pysyvästi selaimeen.
- Tulossa oleva tekoälypalaute lähettää vain käyttäjän kirjoittaman tekstin valitulle palveluntarjoajalle käyttäjän omalla
  API-avaimella. Avainta ei tallenneta koodiin, varmuuskopioon eikä GitHubiin.

## Lähteet

- FSRS-algoritmi: [open-spaced-repetition](https://github.com/open-spaced-repetition) (FSRS-6, oletuspainot).
- Kuvakkeet: Material Design Icons, Apache-lisenssi 2.0.
- Äänet: [Kokoro-82M](https://huggingface.co/hexgrad/Kokoro-82M) (Apache-lisenssi 2.0; mallin kuvauksen mukaan koulutettu pelkästään
  sallitulla tai tekijänoikeudettomalla äänidatalla). Generointi käyttää Actionsissa kirjastoja kokoro ja misaki (Apache 2.0),
  espeak-ng:tä (GPL, vain työkaluna ääntämisen varasanakirjana) ja ffmpegiä (Opus-koodaus). Sovelluksen mukana jaetaan vain
  valmiit äänitiedostot, ei näiden työkalujen koodia.
