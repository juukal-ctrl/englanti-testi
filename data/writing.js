// Kirjoitustehtävät: lyhyet työviestit, joihin saa heti sääntöpohjaisen palautteen (ja halutessaan tekoälypalautteen).
// Kaikki nimet ja yritykset ovat keksittyjä. Tarkistuslista uudelle tehtävälle on tiedostossa CONTENT.md.
//
// Kenttien merkitys:
//   id        pysyvä tunniste (w-…); edistyminen on sidottu siihen, joten sitä ei muuteta
//   unit      aihe (data/units.js), johon tehtävä liittyy
//   title     tehtävän nimi suomeksi
//   format    email (tervehdys ja päätös vaaditaan) | message (tervehdys) | chat (ei vaatimuksia)
//   tone      'polite' = kohteliaisuussäännöt päälle (käskylauseet, "I want", "you must")
//   scenario  tilanne suomeksi: kenelle, mistä ja mitä viestissä pitää olla
//   incoming  saatu englanninkielinen viesti, johon vastataan (valinnainen): { from, text }
//   points    sisältökohdat: { fi, any: [säännöllisiä lausekkeita] }; kohta täyttyy, kun jokin lauseke osuu
//   use       harjoiteltavat ilmaukset (ilmauksen id tai { id, re }, kun ilmaus vaihtelee); 2–4 kpl
//   words     sopiva sanamäärä [vähintään, enintään]
//   model     mallivastaus kappaleittain (amerikanenglantia); lauseet äänitetään Kokoro-äänellä
//   tip       yksi suomenkielinen vinkki, jonka näkee palautteen yhteydessä
//
// Testit (tests/writing.test.mjs) varmistavat, että jokainen mallivastaus täyttää omat sääntönsä:
// sopiva pituus, kaikki sisältökohdat, kaikki ilmaukset, tervehdys ja päätös, ei yhtään sääntöhuomautusta.

export const WRITING_TASKS = [
  {
    id: 'w-followup',
    unit: 'mail',
    title: 'Seurantaviesti asiakkaalle',
    format: 'email',
    tone: 'polite',
    scenario:
      'Lähetit viime viikolla asiakkaalle, David Carterille (Harbor Logistics), ohjeet verkkolaskutuksen käyttöönotosta. Hän ei ole vastannut. Kirjoita lyhyt seurantaviesti: viittaa aiempaan viestiisi, kysy, onko hänellä kysymyksiä tai tarvitseeko hän apua, ja pyydä vastausta perjantaihin mennessä.',
    points: [
      { fi: 'Viittaa aiempaan viestiisi', any: ['follow(?:ing)? up', '(?:my|our) (?:last|previous|earlier) (?:e-?mail|message)', 'last week', 'sent (?:you|last)'] },
      { fi: 'Kysy, onko hänellä kysymyksiä tai tarvitseeko hän apua', any: ['questions?', 'need (?:any )?(?:help|assistance|support)', '\\bhelp\\b'] },
      { fi: 'Pyydä vastausta perjantaihin mennessä', any: ['friday'] },
    ],
    use: ['mail-01', 'ask-10', 'mail-12'],
    words: [45, 110],
    model: [
      'Hi David,',
      "I hope you're doing well. I'm writing to follow up on the e-invoicing setup guide I sent you last week.",
      "Please let me know if you have any questions or if you need help with the first steps. I'm happy to walk you through the process on a short call.",
      'If possible, could you reply by Friday? Looking forward to hearing from you.',
      'Best regards,\nAlex',
    ],
    tip: 'Kerro heti ensimmäisessä virkkeessä, miksi kirjoitat. Englanninkielinen työviesti menee asiaan suoraan eikä aloita pitkällä johdannolla.',
  },
  {
    id: 'w-request',
    unit: 'ask',
    title: 'Kohtelias pyyntö kollegalle',
    format: 'email',
    tone: 'polite',
    scenario:
      'Tarvitset talousosaston Sarah Mitchellin kuukausiraportin torstaihin kello 12 mennessä ja haluaisit hänen käyvän luvut läpi lyhyessä puhelussa. Kirjoita kohtelias pyyntö ja kiitä lopuksi.',
    points: [
      { fi: 'Pyydä raporttia', any: ['report'] },
      { fi: 'Mainitse päivä: torstai', any: ['thursday'] },
      { fi: 'Mainitse kellonaika: kello 12', any: ['noon', '\\b12\\b', 'midday'] },
      { fi: 'Pyydä lyhyttä puhelua, jossa käytte luvut läpi', any: ['walk (?:me )?through', '\\bcall\\b', 'go (?:over|through)', 'quick (?:chat|meeting)'] },
    ],
    use: ['ask-02', 'ask-03', 'ask-07'],
    words: [40, 100],
    model: [
      'Hi Sarah,',
      'Would it be possible to send me the monthly report by noon on Thursday? I need the numbers for a meeting that afternoon.',
      "Could you walk me through the main changes on a quick call? I'd appreciate it if you could find 15 minutes tomorrow or Wednesday.",
      'Thanks so much for your help!',
      'Best,\nAlex',
    ],
    tip: 'Pyyntö pehmenee, kun muotoilet sen kysymykseksi (Could you …? Would it be possible to …?). Käskymuoto ilman "please"-sanaa kuulostaa vaativalta.',
  },
  {
    id: 'w-deadline',
    unit: 'time',
    title: 'Määräajan siirto asiakkaalle',
    format: 'email',
    tone: 'polite',
    incoming: {
      from: 'Emily Johnson, Delta Retail',
      text: "Hi Alex, our CFO is asking when the new invoicing integration will go live. Last time you said October 15, but I haven't heard anything since. Can you give me an update? Thanks, Emily",
    },
    scenario:
      'Käyttöönoton määräaikaa on siirretty 15. lokakuuta 1. marraskuuta, koska testaus vie odotettua pidempään. Muuten ollaan aikataulussa. Vastaa Emilylle: kerro uusi päivämäärä amerikkalaisessa muodossa (kuukausi ensin), kerro syy, pahoittele viivettä ja lupaa palata asiaan perjantaihin mennessä.',
    points: [
      { fi: 'Kerro uusi päivämäärä: 1. marraskuuta', any: ['november', 'nov\\b'] },
      { fi: 'Kerro syy: testaus vie odotettua pidempään', any: ['test'] },
      { fi: 'Pahoittele viivettä', any: ['sorry', 'apolog', 'regret'] },
      { fi: 'Lupaa palata asiaan perjantaihin mennessä', any: ['friday'] },
    ],
    use: ['time-03', 'time-04', 'time-06'],
    words: [40, 100],
    model: [
      'Hi Emily,',
      "Thanks for checking in. The deadline has been moved to November 1 because the testing is taking longer than expected. I'm sorry for the delay.",
      "We're on track to go live on that date. I'll get back to you by Friday with a detailed schedule.",
      'Best regards,\nAlex',
    ],
    tip: 'Päivämäärä kirjoitetaan englanniksi kuukausi ensin: November 1 (ei 1.11. eikä 1 November). Näin viesti ymmärretään oikein myös Yhdysvalloissa.',
  },
  {
    id: 'w-issue',
    unit: 'issue',
    title: 'Vastaus virheilmoitukseen',
    format: 'email',
    tone: 'polite',
    incoming: {
      from: 'Michael Reyes, Orion Supplies',
      text: 'Hello, since this morning our outgoing invoices are not reaching our customers. We have 40 invoices waiting. This is urgent. Please help. Michael',
    },
    scenario:
      'Asiakas ilmoittaa, ettei hänen lähtevien laskujensa toimitus toimi. Vastaa: kiitä ilmoituksesta ja kerro tutkivasi asiaa, pahoittele haittaa, pyydä kuvakaappaus virheilmoituksesta ja ehdota väliaikaista ratkaisua (kiireellisimmät laskut käsin verkkoportaalin kautta).',
    points: [
      { fi: 'Kiitä ilmoituksesta ja kerro tutkivasi asiaa', any: ['thanks? for (?:reporting|letting|flagging|bringing|contacting)', 'looking into', 'investigat'] },
      { fi: 'Pahoittele haittaa', any: ['apolog', 'sorry', 'inconvenience'] },
      { fi: 'Pyydä kuvakaappaus virheilmoituksesta', any: ['screenshot', 'screen shot', 'error message'] },
      { fi: 'Ehdota väliaikaista ratkaisua', any: ['workaround', 'in the meantime', 'temporar', 'manually'] },
    ],
    use: ['issue-07', 'issue-04', 'issue-05', 'issue-03'],
    words: [45, 110],
    model: [
      'Hi Michael,',
      "Thanks for reporting this. We're looking into it right now, and I apologize for the inconvenience.",
      'Could you share a screenshot of the error message? That will help us find the cause faster.',
      "As a workaround, you can send the most urgent invoices manually through the web portal. I'll update you as soon as I know more.",
      'Best regards,\nAlex',
    ],
    tip: 'Kolmen osan kaava toimii hyvin: kiitos ja ote asiaan, pahoittelu, seuraava askel. Asiakas haluaa tietää ennen kaikkea, mitä tapahtuu seuraavaksi.',
  },
  {
    id: 'w-reminder',
    unit: 'inv',
    title: 'Maksumuistutus',
    format: 'email',
    tone: 'polite',
    scenario:
      'Rachel Bennettin yrityksen lasku 10234 (2 400 euroa, päivätty 15. syyskuuta, maksuehto 30 päivää netto) on erääntynyt. Kirjoita kohtelias muistutus: mainitse laskun numero, summa ja päivämäärä, kerro että maksua ei ole vielä saatu ja pyydä maksuilmoitusta, jos lasku on jo maksettu.',
    points: [
      { fi: 'Mainitse laskun numero 10234', any: ['10234'] },
      { fi: 'Mainitse summa: 2 400 euroa', any: ['2[ ,.]?400'] },
      { fi: 'Kerro, ettei maksua ole vielä saatu tai että se on erääntynyt', any: ['past due', 'overdue', 'outstanding', "(?:haven'?t|have not|not yet) received", 'not received'] },
      { fi: 'Pyydä maksuilmoitusta, jos lasku on jo maksettu', any: ['remittance', 'proof of payment', 'payment (?:date|confirmation)', 'confirm'] },
    ],
    use: ['inv-03', 'inv-10', 'inv-04'],
    words: [45, 110],
    model: [
      'Hello Ms. Bennett,',
      "I hope you're doing well. I'm writing about invoice 10234 for €2,400, dated September 15. Our payment terms are net 30, so the payment is past due.",
      "We haven't received the payment yet. If you have already paid it, could you send us the remittance advice?",
      'Thank you for your help.',
      'Kind regards,\nAlex',
    ],
    tip: 'Summa kirjoitetaan englanniksi valuuttamerkin kanssa edessä ja tuhaterotin pilkulla: €2,400 (ei 2 400 €). Maksumuistutus pysyy ystävällisenä, kun kysyt ennen kuin vaadit.',
  },
  {
    id: 'w-apology',
    unit: 'thanks',
    title: 'Anteeksipyyntö viivästyksestä',
    format: 'email',
    tone: 'polite',
    scenario:
      'Asiakas Grace odotti vastausta viikon, koska hänen pyyntönsä jäi huomaamatta. Kirjoita anteeksipyyntö: pahoittele viivästystä, ota vastuu virheestä, kiitä kärsivällisyydestä ja kerro, että hoidat asian tänään.',
    points: [
      { fi: 'Pahoittele viivästystä', any: ['sorry', 'apolog'] },
      { fi: 'Ota vastuu virheestä', any: ['responsib', 'my (?:mistake|fault|error)', 'on us', 'on our side'] },
      { fi: 'Kiitä kärsivällisyydestä', any: ['patience', 'thank'] },
      { fi: 'Kerro, että hoidat asian tänään', any: ['today', 'right away', 'end of (?:the )?day'] },
    ],
    use: ['thanks-02', 'thanks-10', 'issue-10', 'thanks-08'],
    words: [40, 100],
    model: [
      'Hi Grace,',
      'Sorry for the delay in getting back to you. Your request was overlooked on our side, and I take full responsibility for that.',
      "Thank you for your patience. I'll take care of it today and send you a confirmation by the end of the day.",
      'Best regards,\nAlex',
    ],
    tip: 'Hyvä anteeksipyyntö on lyhyt: yksi lause pahoittelua, yksi vastuun ottamista ja sitten ratkaisu. Pitkä selittely saa virheen näyttämään suuremmalta.',
  },
  {
    id: 'w-vendor',
    unit: 'trap',
    title: 'Esittely uudelle yhteyshenkilölle',
    format: 'email',
    scenario:
      'Aloitat yhteistyön uuden toimittajan kanssa. Kirjoita lyhyt esittelyviesti yhteyshenkilölle Priya Shahille: kerro ammattinimikkeesi (application specialist) ja mistä olet vastuussa, kerro mistä olet kiinnostunut ja pyydä häntä selittämään prosessi sinulle.',
    points: [
      { fi: 'Kerro ammattisi (application specialist)', any: ['application specialist'] },
      { fi: 'Kerro, mistä olet vastuussa', any: ['responsible for', 'in charge of'] },
      { fi: 'Kerro, mistä olet kiinnostunut', any: ['interested in'] },
      { fi: 'Pyydä häntä selittämään prosessi sinulle', any: ['explain'] },
    ],
    use: ['trap-07', 'trap-05', 'trap-03', 'trap-01'],
    words: [40, 100],
    model: [
      'Hi Priya,',
      "I work as an application specialist in the invoicing team, and I'm responsible for our customer integrations. I'm interested in learning more about how your onboarding works.",
      'Could you explain the process to me? I would be happy to set up a short call next week.',
      'Thanks,\nAlex',
    ],
    tip: 'Tässä tehtävässä kannattaa varoa suomalaisia kompastuskiviä: explain TO me, interested IN, responsible FOR. Kolme prepositiota, jotka tulevat suomen sijapäätteistä.',
  },
  {
    id: 'w-meeting',
    unit: 'meet',
    title: 'Palaverin yhteenveto',
    format: 'email',
    scenario:
      'Pidit palaverin integraatioprojektin tilasta. Kirjoita osallistujille lyhyt yhteenveto: kiitä ajasta, kerro kaksi päätöstä (go-live siirtyy 1. marraskuuta ja testataan vielä yksi kierros), kerro että Laura vastaa testauksesta ja sinä päivität aikataulun, ja kysy lopuksi kysymyksiä tai huolia.',
    points: [
      { fi: 'Kiitä ajasta', any: ['thank', 'appreciate'] },
      { fi: 'Tee yhteenveto päätöksistä', any: ['to sum up', 'in summary', 'summary', 'agreed', 'decided'] },
      { fi: 'Kerro, että Laura vastaa testauksesta', any: ['laura'] },
      { fi: 'Kerro oma tehtäväsi: aikataulun päivitys', any: ['schedule', 'timeline', 'plan'] },
      { fi: 'Kysy kysymyksiä tai huolia', any: ['questions', 'concerns'] },
    ],
    use: ['meet-11', 'meet-05', 'meet-10'],
    words: [45, 110],
    model: [
      'Hi everyone,',
      'Thanks for your time today. To sum up, we agreed to move the go-live date to November 1 and to run one more round of testing.',
      "Laura will take ownership of the testing, and I'll update the project schedule by Wednesday.",
      'Does anyone have any questions or concerns? Please reply to this email and let me know.',
      'Best,\nAlex',
    ],
    tip: 'Yhteenvedossa jokaisella asialla on vastuuhenkilö ja päivä. Kun kirjoitat "Laura will take ownership of …", kukaan ei jää miettimään, kenen vuoro on.',
  },
  {
    id: 'w-disagree',
    unit: 'view',
    title: 'Eri mieltä kohteliaasti (chat)',
    format: 'chat',
    incoming: {
      from: 'Tom, kollega (Slack)',
      text: "I think we should skip the second test round and go live on Monday. We're already behind schedule.",
    },
    scenario:
      'Kollega Tom ehdottaa, että toinen testauskierros jätetään väliin. Olet eri mieltä, koska aiemmat virheet olivat kaikki samassa osassa järjestelmää. Vastaa Slackissa lyhyesti ja kohteliaasti: osoita ymmärtäväsi hänen pointtinsa, kerro erimielisyytesi pehmeästi ja ehdota vaihtoehtoa (lyhyempi testikierros perjantaina).',
    points: [
      { fi: 'Osoita ymmärtäväsi hänen pointtinsa', any: ['see your point', 'fair point', 'understand', 'makes sense'] },
      { fi: 'Kerro erimielisyytesi pehmeästi', any: ['different view', "not sure (?:i|we) agree", "(?:don'?t|do not) (?:fully )?agree", 'different (?:opinion|perspective)', 'concerned', 'worried'] },
      { fi: 'Perustele: aiemmat virheet olivat samassa osassa', any: ['same (?:part|area|module|component)', 'earlier', 'previous'] },
      { fi: 'Ehdota vaihtoehtoa: lyhyempi testikierros', any: ['suggest', 'shorter', 'short', 'quick'] },
    ],
    use: ['view-01', 'view-07', 'view-09'],
    words: [30, 90],
    model: [
      "I see your point, but I have a slightly different view. The earlier errors were all in the same part of the system, so I'm worried they could come back.",
      "I'd suggest we run a shorter test round on Friday and still go live on Monday. What do you think?",
    ],
    tip: 'Eri mieltä ollaan kolmessa vaiheessa: ensin ymmärrys, sitten oma näkemys, lopuksi ehdotus. Kun tarjoat vaihtoehdon, vastaväite kuulostaa yhteistyöltä eikä kiistalta.',
  },
  {
    id: 'w-negotiate',
    unit: 'deal',
    title: 'Maksuehtoneuvottelu',
    format: 'email',
    tone: 'polite',
    incoming: {
      from: 'Henry Walsh, Brightside Foods',
      text: "Hi Alex, we'd like to extend our payment terms from 30 to 60 days. Would that be possible? We are growing quickly and cash flow is tight. Best, Henry",
    },
    scenario:
      'Asiakas pyytää maksuehdon pidentämistä 30 päivästä 60 päivään. Et voi hyväksyä sitä, mutta voit tarjota kompromissina 45 päivää. Sinun täytyy vielä tarkistaa asia esihenkilöltäsi. Vastaa kohteliaasti ja kysy, sopiiko ehdotus.',
    points: [
      { fi: 'Kerro, ettet voi hyväksyä 60 päivää', any: ['unfortunately', 'unable', "can'?t", 'cannot', 'not able'] },
      { fi: 'Tarjoa kompromissina 45 päivää', any: ['45'] },
      { fi: 'Kerro tarkistavasi asian esihenkilöltäsi', any: ['manager', 'supervisor', 'check with'] },
      { fi: 'Kysy, sopiiko ehdotus', any: ['acceptable', 'work for you', 'does that work', 'would that work', 'what do you think'] },
    ],
    use: ['deal-02', 'deal-03', 'deal-07', 'deal-10'],
    words: [40, 100],
    model: [
      'Hi Henry,',
      "Thanks for your message. Unfortunately, we're unable to extend the payment terms to 60 days.",
      "As a compromise, we could offer 45 days. I'll need to check with my manager first, but I wanted to ask: is that acceptable to you?",
      'Best regards,\nAlex',
    ],
    tip: 'Kieltäytyminen on helpompi ottaa vastaan, kun mukana on vaihtoehto. "Unfortunately … As a compromise …" on tuttu ja toimiva kaksiosainen rakenne.',
  },
  {
    id: 'w-call',
    unit: 'call',
    title: 'Jatkoviesti pätkivän puhelun jälkeen (chat)',
    format: 'chat',
    scenario:
      'Videopuhelu asiakkaan Mark Wilsonin kanssa pätki, eikä sinulle jäänyt selväksi hänen kollegansa nimi. Kirjoita lyhyt chat-viesti: kerro, että yhteys pätki, ettet saanut nimeä selville, pyydä häntä tavaamaan kollegan sähköpostiosoite ja kerro, että lähetät kalenterikutsun torstaille kello 14.',
    points: [
      { fi: 'Kerro, että yhteys pätki', any: ['breaking up', 'connection', 'cut out', 'audio', 'lost you'] },
      { fi: 'Kerro, ettet saanut nimeä selville', any: ["didn'?t catch", 'did not catch', "couldn'?t (?:hear|catch|get)", 'missed'] },
      { fi: 'Pyydä tavaamaan sähköpostiosoite', any: ['spell', 'e-?mail address'] },
      { fi: 'Kerro kalenterikutsusta torstaille kello 14', any: ['calendar invite', 'invitation', 'invite'] },
    ],
    use: [{ id: 'call-03', re: 'breaking up' }, { id: 'call-09', re: "didn'?t catch" }, { id: 'call-07', re: 'could you spell' }, 'call-08'],
    words: [30, 90],
    model: [
      "Hi Mark, sorry about that. You were breaking up a few times during our call, and I didn't catch your colleague's name.",
      "Could you spell your colleague's email address for me? I'll send you a calendar invite for Thursday at 2 p.m.",
    ],
    tip: 'Puhelun jälkeen on täysin luontevaa pyytää tavaamaan nimi tai osoite uudelleen. Kirjallisesti virhe ei tule takaisin, kun asia on kirjoitettu auki.',
  },
  {
    id: 'w-networking',
    unit: 'small',
    title: 'Viesti konferenssissa tavatulle',
    format: 'message',
    scenario:
      'Tapasit konferenssissa eilen ammattilaisen, Daniel Cohenin, ja haluat pitää yhteyttä. Kirjoita lyhyt LinkedIn-viesti: sano, että oli mukava tavata, kerro että olet alun perin Suomesta ja työskentelet verkkolaskutuspalveluja tarjoavassa yrityksessä, ja ehdota yhteydenpitoa.',
    points: [
      { fi: 'Kerro, että oli mukava tavata', any: ['nice (?:to meet|meeting)', 'great (?:to meet|meeting)', 'pleasure', 'enjoyed meeting'] },
      { fi: 'Kerro, että olet alun perin Suomesta', any: ['finland', 'finnish'] },
      { fi: 'Kerro yrityksestäsi: verkkolaskutus', any: ['e-?invoic'] },
      { fi: 'Ehdota yhteydenpitoa', any: ['stay in touch', 'keep in touch', 'connect'] },
    ],
    use: ['small-08', 'small-06', 'small-07', 'small-09'],
    words: [35, 100],
    model: [
      'Hi Daniel,',
      'It was nice meeting you at the conference yesterday. I enjoyed our conversation about automation.',
      "As I mentioned, I'm originally from Finland, and I work for a company that provides e-invoicing services. Let's stay in touch, and feel free to reach out if you ever want to compare notes.",
      'Best,\nAlex',
    ],
    tip: 'Verkostoitumisviesti on lyhyt ja konkreettinen: viittaa yhteen asiaan, josta puhuitte, ja jätä ovi auki. Pitkä esittely ei kuulu ensimmäiseen viestiin.',
  },
];

export const WRITING_IDS = WRITING_TASKS.map((t) => t.id);
