# Sisältö

Sisältö on tiedostossa [`data/units.js`](data/units.js): aiheita (`units`), joissa on ilmauksia (`items`).
Sisällön on kirjoittanut Claude. **Äidinkielisen puhujan tarkistus puuttuu vielä**, joten ilmauksia kannattaa lukea
kriittisesti. Jokaisessa harjoituksessa on "Ilmoita virheestä" -linkki, joka avaa valmiiksi täytetyn GitHub-issuen.

## Nykyiset aiheet (12 kpl, 126 ilmausta)

| Tunniste | Aihe | Ilmauksia | Aukkotehtäviä |
| --- | --- | ---: | ---: |
| `mail` | Sähköpostin avaus | 12 | 7 |
| `ask` | Pyynnöt ja pehmennys | 10 | 4 |
| `time` | Aikataulut ja määräajat | 10 | 3 |
| `trap` | Suomalaisten kompastuskivet | 11 | 11 |
| `issue` | Ongelmat ja vianselvitys | 10 | 2 |
| `meet` | Kokoukset | 11 | 1 |
| `view` | Eri mieltä oleminen ja tarkentaminen | 10 | 2 |
| `inv` | Laskutus ja maksut | 12 | 2 |
| `call` | Puhelut ja videopuhelut | 10 | 1 |
| `thanks` | Kiitokset, anteeksipyynnöt ja palaute | 10 | 0 |
| `small` | Rento keskustelu | 10 | 2 |
| `deal` | Neuvottelu ja sopiminen | 10 | 2 |

Opetusjärjestys on `UNIT_ORDER`-listassa.

## Kentät

| Kenttä | Pakollinen | Merkitys |
| --- | --- | --- |
| `id` | kyllä | Pysyvä tunniste muodossa `<aihe>-NN`. **Ei saa koskaan muuttaa, numeroida uudelleen tai käyttää uudelleen**, koska edistyminen on sidottu siihen. |
| `en` | kyllä | Opittava ilmaus. `…` merkitsee kohtaa, johon oppija sanoo oman sisältönsä. |
| `fi` | kyllä | Merkitys luontevalla suomella (ei sanasta sanaan -käännös). |
| `ex` | kyllä | Esimerkkilause työtilanteesta. Aukkoa sisältävän ilmauksen esimerkin on sisällettävä ilmauksen alku. |
| `note` | ei | Suomenkielinen kontrastiivinen huomautus (enintään 360 merkkiä), mieluiten suomalaisen tyypillisestä virheestä. |
| `cz` | ei | Aukkotehtävä: `[lause, jossa ___, oikea vastaus, [2–3 väärää vaihtoehtoa]]`. |
| `say` | ei | Ääneen luettava versio, jos se poikkeaa `en`-kentästä. Oletuksena `en`, tai `ex`, jos `en` sisältää aukon. Puhetehtävässä (kuuntele ja sano perässä) käytetään tätä. |

### Äänentoisto ja numerot

- Kaiutinpainike lukee aina sen tekstin, joka on painikkeen vieressä (ilmaus tai esimerkkilause). Automaattinen toisto lukee ilmauksen ja sen jälkeen esimerkkilauseen.
- Kirjoita päivämäärät ja numerot numeroina (`October 3`, `at 3 p.m.`). Äänentoisto muuttaa päivämäärän järjestysluvuksi (*October third*), ja täsmäys hyväksyy numeron kaikissa muodoissa (`3`, `third`, `three`), joten oppijaa ei rangaista siitä, että hän sanoo päivämäärän oikein.
- `…` (aukko) ja `…-ing` jätetään lukematta. Aukon sisältävän ilmauksen esimerkin pitää sisältää ilmauksen alku, jotta se voidaan kuunnella kokonaisena.
- Kaikki luettavat tekstit äänitetään valmiiksi Kokoro-äänellä (ks. README: Äänet). Kun `data/units.js` muuttuu, GitHub Actions tekee puuttuvat äänet itse noin 5–10 minuutissa; siihen asti uusi teksti luetaan laitteen äänellä. Teksti, jota Actions ei tunne (esim. uudenlainen harjoitus, joka lukee jotakin muuta), pitää lisätä luetteloon `tools/tts/texts.mjs`; selaintesti huomauttaa, jos istunnossa luetaan teksti, jolle ei ole leikettä.
- Kun lisäät sisältöä, tarkista ajon jälkeen haarasta `kokoro-log` tiedosto `phonemes.tsv`: se näyttää, miten Kokoro lukee jokaisen tekstin (foneemit), joten ääntämisvirheet (lyhenteet kuten *PO*, summat, päivämäärät, vieraat nimet) löytyvät kuuntelematta. Jos ääni lukee sanan väärin, lisää korjaus tiedostoon `tools/tts/respell.json` (se koskee vain äänitystä; ohje README:n kohdassa Äänet) tai ilmoita virheestä.

## Laatulista uudelle sisällölle

Kieli
- [ ] Amerikanenglantia (esim. *inquiry*, *schedule*, *fall*, *vacation*, *check*), ei brittiläisiä muotoja.
- [ ] Taso B2+ ja ammatillisessa viestinnässä oikeasti käytössä oleva. Ei kirjakieltä, jota kukaan ei sano.
- [ ] Rekisteri on selvä: muodollinen, neutraali tai rento. Jos ilmaus on rekisteriltään rajattu, kerro se huomautuksessa.
- [ ] Suomen kielen vaikutus huomioitu: tyypilliset virheet (prepositiot, *discuss about*, *I am agree*, aikamuodot) ovat mukana.
- [ ] Esimerkkilause on luonteva ja lyhyt. Mieluiten kokonainen, ääneen sanottava virke.

Muoto (testit tarkistavat nämä automaattisesti: `node --test tests/content.test.mjs`)
- [ ] `id` on muotoa `<aihe>-NN` ja yksilöllinen.
- [ ] Ei ajatusviivoja (— –) eikä kaarevia lainausmerkkejä (’ “ ”): äänentoisto lukee ne huonosti. Käytä suoria merkkejä.
- [ ] Ei ylimääräisiä välilyöntejä.
- [ ] Aukkotehtävässä täsmälleen yksi `___`, oikea vastaus ja 2–3 yksilöllistä väärää vaihtoehtoa, ja täytetty lause esiintyy ilmauksessa tai esimerkissä.
- [ ] Väärien vaihtoehtojen pitää olla uskottavia mutta selvästi vääriä (ei kahta oikeaa vastausta).

Sisältö
- [ ] Ilmaus ei ole jo jossain toisessa aiheessa (hae `data/units.js`:stä).
- [ ] Huomautus ei toista suomennosta vaan kertoo jotain uutta (käyttö, rekisteri, yleinen virhe).
- [ ] Ääntämiseltään vaikeat ilmaukset kannattaa lisätä myöhemmin puheharjoituksiin (v/w, *th*, sana-aksentti).

## Uuden aiheen lisääminen

1. Lisää aihe `UNITS`-listaan (`id` pieniä kirjaimia, `title`, `situation`, `intro`, vähintään 5 ilmausta).
2. Lisää aiheen tunniste `UNIT_ORDER`-listaan haluamaasi kohtaan.
3. Aja `node --test tests/*.test.mjs` ja `node tools/stamp.mjs`.

Uusia ilmauksia voi lisätä aiheen loppuun. Älä poista tai uudelleennumeroi vanhoja: poistetun ilmauksen kortti jää
tietokantaan, mutta sitä ei enää kerrata.

## Shadowing-kappaleet

Kappaleet ovat tiedostossa [`data/shadow.js`](data/shadow.js) (`SHADOW_PASSAGES`, 24 kpl: Työ, Arki, Kokoukset ja Mielipiteet
kuusi kutakin). Ne ovat keksittyjä, helppoja ja arkisia B2-tason työ- ja arkipuheen tilanteita, joita toistetaan ääneen
mallin kanssa (ks. README: Shadowing). Äidinkielisen puhujan tarkistus puuttuu, kuten muunkin sisällön kohdalta.

| Kenttä | Merkitys |
| --- | --- |
| `id` | Pysyvä tunniste `sh-NN`. **Ei saa muuttaa, numeroida uudelleen eikä käyttää uudelleen**, koska edistyminen (`shadowLog`) on sidottu siihen. Lisää uudet kappaleet loppuun. Poistetun kappaleen tila pudotetaan lokista itsestään. |
| `title` | Englanninkielinen otsikko, joka näkyy harjoituksessa. |
| `topic` | `Työ`, `Arki`, `Kokoukset` tai `Mielipiteet`. |
| `lines` | Kappale lauseittain (5–7 lausetta). Jokainen lause äänitetään omaksi leikkeekseen, ja äänessä oleva lause korostetaan. |
| `fi` | Suomennos jokaiselle lauseelle samassa järjestyksessä (luonteva suomi, ei sanasta sanaan). |
| `words` | Kolme avainsanaa tai -ilmausta `[englanniksi, suomeksi]`. |
| `tip` | Yksi suomenkielinen ääntämis- tai rytmivinkki, jossa isot kirjaimet osoittavat painon (*FOLlow up*). |

Testit (`node --test tests/shadow.test.mjs`) vaativat: tunnisteet `sh-01`, `sh-02` … peräkkäin, täydellisen rakenteen (suomennos
jokaiselle lauseelle, kolme avainsanaa, vinkki), 45–70 sanan pituuden, enintään 18 sanan lauseet, päätemerkin jokaisen lauseen
lopussa, ettei samaa lausetta ole kahdesti missään kappaleessa, nollan huomautusta kirjoitustarkistimesta ja että neljä
ensimmäistä kappaletta ovat eri aiheista. Lauseet kuuluvat `tools/tts/texts.mjs`:n esiäänitettäviin teksteihin
(normaalinopeus), joten GitHub Actions äänittää ne itse, kun tiedosto muuttuu; siihen asti kappale luetaan laitteen äänellä.

Laatulista uudelle kappaleelle
- [ ] Luonnollista amerikanenglantia, jonka työkaveri sanoisi ääneen. Ei kirjakieltä.
- [ ] Lyhyet, rytmikkäät lauseet, joihin on helppo tulla mukaan; kappale on noin 25 sekuntia kerralla luettuna.
- [ ] Sisältö on helppoa ja tuttua: shadowingissa harjoitellaan ääntä ja rytmiä, ei uutta sanastoa (vain 3 avainsanaa).
- [ ] Sopivaa vaihtelua: kysymyksiä, supistuksia (*I'd*, *we're*), painotettavia sanoja ja luontevia taukokohtia.
- [ ] Ei oikeita henkilö- tai yritysnimiä, ei numeroita tai lyhenteitä, jotka äänitys voisi lukea huonosti.

## Kirjoitustehtävät

Tehtävät ovat tiedostossa [`data/writing.js`](data/writing.js) (`WRITING_TASKS`). Jokaisella aiheella on tällä hetkellä yksi
tehtävä (12 kpl). Tehtävien nimet ja yritykset ovat keksittyjä, mallivastauksen allekirjoitus on "Alex".
Äidinkielisen puhujan tarkistus puuttuu, kuten ilmauksistakin.

| Kenttä | Merkitys |
| --- | --- |
| `id` | Pysyvä tunniste `w-…` (edistyminen on sidottu siihen; ei saa muuttaa). |
| `unit` | Aihe (`data/units.js`), johon tehtävä liittyy. |
| `title`, `scenario`, `tip` | Suomenkielinen nimi, tilanne (kenelle, mistä ja mitä viestissä pitää olla) ja yksi vinkki palautteen yhteyteen. |
| `format` | `email` (tervehdys ja päätös vaaditaan), `message` (tervehdys) tai `chat` (ei vaatimuksia). |
| `tone` | `polite` kytkee kohteliaisuussäännöt (käskylauseet, *I want*, *you must*) päälle. |
| `incoming` | Valinnainen saatu viesti `{ from, text }`, johon vastataan. Sen lauseet voi kuunnella. |
| `points` | 2–5 sisältökohtaa `{ fi, any: [säännöllisiä lausekkeita] }`; kohta täyttyy, kun jokin lauseke osuu (isoja ja pieniä kirjaimia ei erotella). |
| `use` | 2–4 harjoiteltavaa ilmausta oppitunneilta: ilmauksen `id` tai `{ id, re }`, kun ilmaus vaihtelee eikä sitä voi tunnistaa kiinteästä osasta. |
| `words` | Sopiva sanamäärä `[min, max]`. |
| `model` | Mallivastaus kappaleittain (amerikanenglantia). Viimeinen kappale on tervehdys ja allekirjoitus, esim. `'Best regards,\nAlex'`. |

Testit (`node --test tests/writing.test.mjs`) vaativat, että jokainen mallivastaus läpäisee omat sääntönsä: sopiva pituus,
kaikki sisältökohdat, kaikki harjoiteltavat ilmaukset, tervehdys ja päätös sekä nolla sääntöhuomautusta. Lisäksi ne varmistavat,
ettei tehtävissä ole ajatusviivoja ja että viittaukset aiheisiin ja ilmauksiin ovat olemassa.

Laatulista uudelle tehtävälle
- [ ] Tilanne on realistinen työtilanne ja pyyntö on tehtävissä 40–110 sanalla.
- [ ] Sisältökohdat kuvaavat asioita, jotka viestissä on pakko olla; `any`-lausekkeet hyväksyvät useita luontevia muotoja.
- [ ] Harjoiteltavat ilmaukset sopivat tilanteeseen luontevasti (ei väkisin).
- [ ] Mallivastaus kuulostaa siltä, mitä amerikkalainen työkaveri kirjoittaisi, ja sen lauseet ovat ääneen luettavia.
- [ ] Ei oikeita henkilö- tai yritysnimiä.

### Sääntötarkistuksen säännöt

Säännöt ovat tiedostossa [`js/writing-rules.js`](js/writing-rules.js). Jokaisella säännöllä on `id`, `cat` (luokka), `sev`
(`error` = korjaa, `tip` = vinkki), säännöllinen lauseke `re`, suomenkielinen selitys `fi` ja valinnainen korjausehdotus `fix`.
Käsin kirjoitetuille säännöille pitää lisätä testitapaus (`tests/writing.test.mjs`, taulukko `CASES`: väärät esimerkit, oikeat
esimerkit ja odotettu korjaus); testi epäonnistuu, jos sääntö puuttuu taulukosta tai osuu oikeaan englantiin. Brittiläisen ja
amerikkalaisen oikeinkirjoituksen taulukko (`UK_US`) ja yleisten kirjoitusvirheiden taulukko (`MISSPELLINGS`) ovat samassa tiedostossa.

Periaate: **mieluummin huomauttamatta kuin väärä hälytys.** Säännön pitää osua vain silloin, kun virhe on varma tai kun
vinkki on perusteltu (`tip`). Kaikki sovelluksen esimerkkilauseet, aukkolauseet ja saadut viestit ajetaan sääntöjen läpi, eikä
yksikään saa huomautusta.
