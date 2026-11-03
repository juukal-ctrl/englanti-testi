// Sisältöpaketti 1: ammatillista amerikanenglantia (B2+), suomenkielisille selityksille.
//
// Kenttien merkitys:
//   id    pysyvä tunniste (ei saa koskaan muuttaa tai käyttää uudelleen, koska edistyminen on sidottu siihen)
//   en    opittava ilmaus (… = kohta, johon tulee oma sisältö)
//   fi    ilmauksen merkitys luontevalla suomella
//   ex    esimerkkilause työtilanteesta
//   note  suomenkielinen kontrastiivinen huomautus (valinnainen)
//   cz    aukkotehtävä [lause, jossa ___, oikea vastaus, [väärät vaihtoehdot]] (valinnainen)
//   say   ääneen sanottava versio, jos se poikkeaa en-kentästä (valinnainen)
//
// Tarkistuslista uudelle sisällölle on tiedostossa CONTENT.md. Automaattiset tarkistukset: tests/content.test.mjs.

export const UNITS = [
  {
    id: 'mail',
    title: 'Sähköpostin avaus',
    situation: 'Aloitat viestin asiakkaalle tai kollegalle ja haluat kuulostaa luontevalta.',
    intro:
      'Englanninkielisessä sähköpostissa tarkoitus kerrotaan heti ensimmäisessä virkkeessä. Suomessa viesti usein aloitetaan neutraalisti, mutta englanniksi suora, kohtelias aloitus kuulostaa ammattimaiselta.',
    items: [
      { id: 'mail-01', en: "I'm writing to follow up on …", fi: 'Palaan …-asiaan (seurantaviesti)', ex: "I'm writing to follow up on the invoice we sent on October 3.", note: "'Follow up on' = palata asiaan ja selvittää, miten se on edennyt.", cz: ["I'm writing to follow ___ on the invoice we sent on October 3.", 'up', ['out', 'off']] },
      { id: 'mail-02', en: "I'm reaching out regarding …", fi: 'Otan yhteyttä koskien …', ex: "I'm reaching out regarding the payment terms in our agreement.", note: "'Regarding' ei tarvitse prepositiota perässään. Täsmälleen sama merkitys: 'with regard to'.", cz: ["I'm reaching out ___ the payment terms in our agreement.", 'regarding', ['regards', 'regard of']] },
      { id: 'mail-03', en: 'Thank you for getting back to me.', fi: 'Kiitos vastauksestasi.', ex: 'Thank you for getting back to me so quickly.', note: "'Get back to someone' = vastata sille, joka on kysynyt tai ottanut yhteyttä.", cz: ['Thank you for getting ___ to me so quickly.', 'back', ['again', 'over']] },
      { id: 'mail-04', en: "I hope you're doing well.", fi: 'Toivottavasti sinulla menee hyvin.', ex: "I hope you're doing well. I wanted to check in on the integration.", note: 'Luonteva avaus ensimmäiseen viestiin tai pitkän tauon jälkeen. Pelkkä kohtelias fraasi, ei kysymys.' },
      { id: 'mail-05', en: 'I wanted to check in on …', fi: 'Halusin kysyä, miten … etenee', ex: 'I wanted to check in on the onboarding of your new customers.', note: "'Check in on' on kevyt tapa tiedustella tilannetta ilman painostusta.", cz: ['I wanted to check ___ on the onboarding of your new customers.', 'in', ['out', 'off']] },
      { id: 'mail-06', en: 'Per our conversation yesterday, …', fi: 'Eilisen keskustelumme mukaisesti …', ex: "Per our conversation yesterday, I've attached the updated price list.", note: "'Per' = mukaan, mukaisesti. Hieman muodollinen, mutta hyvin yleinen työelämässä." },
      { id: 'mail-07', en: 'As discussed, …', fi: 'Kuten sovimme / keskustelimme, …', ex: 'As discussed, we will send the corrected invoice by Friday.', note: "'Discuss' ei tarvitse prepositiota: ei 'discuss about'." },
      { id: 'mail-08', en: 'Just a quick reminder that …', fi: 'Pikainen muistutus siitä, että …', ex: 'Just a quick reminder that the system will be down for maintenance on Saturday.' },
      { id: 'mail-09', en: "I'm writing in response to your inquiry.", fi: 'Vastaan kyselyysi.', ex: "I'm writing in response to your inquiry about e-invoicing.", note: "'In response to' + substantiivi. Amerikanenglannissa 'inquiry' (brittiläisessä 'enquiry').", cz: ["I'm writing in response ___ your inquiry about e-invoicing.", 'to', ['of', 'for']] },
      { id: 'mail-10', en: 'Please find attached …', fi: 'Liitteenä …', ex: 'Please find attached the corrected credit memo.', note: "Muodollinen. Arkisempi vaihtoehto: 'I've attached …'." },
      { id: 'mail-11', en: 'I wanted to let you know that …', fi: 'Halusin kertoa, että …', ex: 'I wanted to let you know that the issue has been resolved.', note: "'Let you know' on pehmeämpi ja luontevampi kuin 'inform you'.", cz: ['I wanted to let you ___ that the issue has been resolved.', 'know', ['say', 'tell']] },
      { id: 'mail-12', en: 'Looking forward to hearing from you.', fi: 'Odotan vastaustasi.', ex: 'Thanks again for your time. Looking forward to hearing from you.', note: "Looking forward TO + -ing-muoto (ei 'to hear'), koska 'to' on tässä prepositio.", cz: ['Looking forward to ___ from you.', 'hearing', ['hear', 'heard']] },
    ],
  },
  {
    id: 'ask',
    title: 'Pyynnöt ja pehmennys',
    situation: 'Pyydät jotakuta tekemään jotakin tai kysyt epävarmaa asiaa.',
    intro:
      "Suomessa pyyntö voi olla suora ('Lähetä raportti'). Englanniksi suora käsky kuulostaa helposti töykeältä. Pehmentimet (could, would, possibly, I was wondering) ovat normaalia kohteliaisuutta, eivät ylimielisyyttä.",
    items: [
      { id: 'ask-01', en: 'Could you possibly …?', fi: 'Voisitko mahdollisesti …?', ex: 'Could you possibly send me the updated report by noon?', note: "'Could' on kohteliaampi kuin 'can', ja 'possibly' pehmentää pyyntöä vielä lisää." },
      { id: 'ask-02', en: 'Would it be possible to …?', fi: 'Olisiko mahdollista …?', ex: 'Would it be possible to move the call to Thursday?', cz: ['Would it be possible ___ move the call to Thursday?', 'to', ['for to', 'of']] },
      { id: 'ask-03', en: "I'd appreciate it if you could …", fi: 'Olisin kiitollinen, jos voisit …', ex: "I'd appreciate it if you could confirm the delivery address.", note: "Tarvitaan 'it': 'appreciate IT if'.", cz: ["I'd appreciate ___ if you could confirm the delivery address.", 'it', ['that', 'this']] },
      { id: 'ask-04', en: 'Would you mind …-ing?', fi: 'Haittaisiko, jos … ?', ex: 'Would you mind sending me the PO number again?', note: "'Would you mind' + -ing. Myöntävä vastaus 'ei haittaa' on 'Not at all'.", say: 'Would you mind sending me the PO number again?', cz: ['Would you mind ___ me the PO number again?', 'sending', ['to send', 'send']] },
      { id: 'ask-05', en: 'Is there any chance you could …?', fi: 'Onko mitenkään mahdollista, että voisit …?', ex: 'Is there any chance you could review this before the meeting?', note: 'Rento mutta kohtelias. Sopii kollegoille.' },
      { id: 'ask-06', en: 'I was wondering if you could …', fi: 'Mietin, voisitko …', ex: 'I was wondering if you could take a look at the attached file.', note: "Mennyt aikamuoto ('was wondering') pehmentää: se on kohteliaampi kuin 'I wonder if'." },
      { id: 'ask-07', en: 'Could you walk me through …?', fi: 'Voisitko käydä kanssani läpi …?', ex: 'Could you walk me through the approval process?', note: "'Walk someone through' = opastaa askel askeleelta." },
      { id: 'ask-08', en: 'Just to be clear, …', fi: 'Varmuuden vuoksi: …', ex: 'Just to be clear, the deadline is Friday, not Monday.' },
      { id: 'ask-09', en: 'Feel free to …', fi: 'Voit vapaasti …', ex: 'Feel free to reach out if you have any questions.', note: "Älä käännä sanasta sanaan. 'Feel free to' tarkoittaa 'ole hyvä ja' tai 'voit rohkeasti'." },
      { id: 'ask-10', en: 'Please let me know if …', fi: 'Kerro, jos …', ex: 'Please let me know if anything is unclear.', note: "If-lauseessa ei käytetä 'will': suomen 'jos jokin on epäselvää' on englanniksi 'if anything IS unclear'.", cz: ['Please let me know if anything ___ unclear.', 'is', ['will be', 'would be']] },
    ],
  },
  {
    id: 'time',
    title: 'Aikataulut ja määräajat',
    situation: 'Sovit päivämääristä, ilmoitat tilanteen tai kysyt määräaikaa.',
    intro:
      "Aikaan liittyvät prepositiot ovat yksi suomalaisten tyypillisimmistä virhelähteistä. Muista: 'on' + päivä, 'in' + kuukausi tai vuosi, 'at' + kellonaika; 'by' tarkoittaa viimeistään, 'until' tarkoittaa saakka.",
    items: [
      { id: 'time-01', en: 'by the end of the day', fi: 'päivän loppuun mennessä', ex: "I'll send the revised file by the end of the day.", note: "'By' = viimeistään (määräaika). 'Until' = koko ajan siihen asti. 'By Friday' tarkoittaa perjantaihin mennessä.", cz: ["I'll send the revised file ___ the end of the day.", 'by', ['until', 'since']] },
      { id: 'time-02', en: 'on Monday, in March, at 3 p.m.', fi: 'maanantaina, maaliskuussa, klo 15', ex: 'The workshop is on Tuesday at 10 a.m., and the report is due in March.', note: "On + viikonpäivä tai päivämäärä, in + kuukausi tai vuosi, at + kellonaika. Viikonpäivät ja kuukaudet kirjoitetaan isolla alkukirjaimella.", cz: ['The workshop is ___ Tuesday.', 'on', ['in', 'at']] },
      { id: 'time-03', en: 'The deadline has been moved to …', fi: 'Määräaikaa on siirretty …', ex: 'The deadline has been moved to next Thursday.', note: "Viikonpäivät kirjoitetaan isolla: 'Thursday', ei 'thursday'. Passiivi 'has been moved' vastaa suomen passiivia." },
      { id: 'time-04', en: "We're on track to …", fi: 'Olemme aikataulussa …', ex: "We're on track to finish the migration by the end of the month." },
      { id: 'time-05', en: "We're running behind schedule.", fi: 'Olemme jäljessä aikataulusta.', ex: "We're running about two days behind schedule because of the system outage.", note: "Behind schedule = jäljessä, ahead of schedule = edellä aikataulua." },
      { id: 'time-06', en: "I'll get back to you by …", fi: 'Palaan asiaan viimeistään …', ex: "I'll get back to you by Wednesday with an update." },
      { id: 'time-07', en: 'as soon as possible', fi: 'mahdollisimman pian', ex: 'Could you reply as soon as possible?', note: "Lyhenne 'ASAP' voi kuulostaa painostavalta. Pehmeämpi: 'at your earliest convenience'." },
      { id: 'time-08', en: 'at your earliest convenience', fi: 'sopivimmalla hetkellä, mahdollisimman pian', ex: 'Please send us the signed agreement at your earliest convenience.', note: 'Kohtelias ja muodollinen tapa pyytää nopeaa vastausta.' },
      { id: 'time-09', en: 'in the next couple of days', fi: 'parin seuraavan päivän kuluessa', ex: 'You should receive the new credentials in the next couple of days.', note: "'A couple of' + monikko. Tarkoittaa suunnilleen kahta, usein 'muutamaa'." },
      { id: 'time-10', en: "We've worked with them for two years.", fi: 'Olemme tehneet heidän kanssaan yhteistyötä kaksi vuotta.', ex: 'We have worked with this customer since 2021.', note: "Suomi käyttää preesensiä ('olemme tehneet yhteistyötä'), mutta englanti vaatii present perfectin: have worked + for/since. Ei 'we work with them since 2021'.", cz: ['We ___ with this customer since 2021.', 'have worked', ['work', 'worked']] },
    ],
  },
  {
    id: 'trap',
    title: 'Suomalaisten kompastuskivet',
    situation: 'Tavallisia virheitä, jotka johtuvat suomen kielestä: prepositiot, artikkelit ja sanajärjestys.',
    intro:
      "Suomessa ei ole artikkeleita, ja prepositioiden tehtävää hoitavat sijapäätteet. Siksi englannin 'the/a/an' ja prepositiot kannattaa opetella valmiina ilmauksina eikä sääntöinä.",
    items: [
      { id: 'trap-01', en: 'Could you explain the process to me?', fi: 'Voisitko selittää minulle prosessin?', ex: 'Could you explain the process to me?', note: "Explain + asia + TO + henkilö. Ei 'explain me'. Sama rakenne: say to, describe to, suggest to.", cz: ['Could you explain the process ___ me?', 'to', ['for', 'at']] },
      { id: 'trap-02', en: 'We need to discuss the issue with the vendor.', fi: 'Meidän täytyy keskustella asiasta toimittajan kanssa.', ex: 'We need to discuss the issue with the vendor.', note: "Discuss + suora objekti, ei prepositiota: ei 'discuss about'. 'Talk about' ja 'discuss' ovat siis erilaisia rakenteita.", cz: ['We need to ___ the issue with the vendor.', 'discuss', ['talk', 'speak']] },
      { id: 'trap-03', en: "I'm interested in …", fi: 'Olen kiinnostunut …sta', ex: "I'm interested in learning more about your API.", note: "Interested IN (ei 'interested of' eikä 'interested about').", cz: ["I'm interested ___ learning more about your API.", 'in', ['of', 'on']] },
      { id: 'trap-04', en: 'It depends on …', fi: 'Se riippuu …sta', ex: 'It depends on the file format.', note: "Depend ON (ei 'depend of' eikä 'depend from').", cz: ['It depends ___ the file format.', 'on', ['of', 'from']] },
      { id: 'trap-05', en: "I'm responsible for …", fi: 'Olen vastuussa …sta', ex: "I'm responsible for customer onboarding.", note: "Responsible FOR + asia. Henkilölle ollaan vastuussa 'to'-sanalla: 'responsible to my manager'.", cz: ["I'm responsible ___ customer onboarding.", 'for', ['of', 'to']] },
      { id: 'trap-06', en: '… is different from …', fi: '… on erilainen kuin …', ex: 'The new process is different from the old one.', note: "Different FROM. Amerikanenglannissa myös 'different than' on mahdollinen, mutta ei koskaan 'different with' eikä 'different as'.", cz: ['The new process is different ___ the old one.', 'from', ['with', 'of']] },
      { id: 'trap-07', en: 'I work as an application specialist.', fi: 'Työskentelen sovellusasiantuntijana.', ex: 'I work as an application specialist.', note: "Ammatti ilmaistaan 'as a/an' -rakenteella. Artikkeli 'an' tulee, koska seuraava sana alkaa vokaaliäänteellä.", cz: ['I work as ___ application specialist.', 'an', ['a', 'the']] },
      { id: 'trap-08', en: 'The information is in the attachment.', fi: 'Tiedot ovat liitteessä.', ex: 'The information in the attachment is incorrect.', note: "Information on epälaskettava: ei 'informations' eikä 'an information'. Samoin: advice, feedback, equipment, news, progress.", cz: ['The ___ in the attachment is incorrect.', 'information', ['informations', 'an information']] },
      { id: 'trap-09', en: 'We need to make a decision.', fi: 'Meidän täytyy tehdä päätös.', ex: 'We need to make a decision by Friday.', note: "Suomen 'tehdä' vastaa kahta verbiä: 'make' (tuottaa: decision, mistake, plan, suggestion) ja 'do' (suorittaa: job, task, research, homework).", cz: ['We need to ___ a decision by Friday.', 'make', ['do', 'have']] },
      { id: 'trap-10', en: 'I spoke with Anna from accounting. She said …', fi: 'Puhuin Annan kanssa taloushallinnosta. Hän sanoi …', ex: 'I spoke with Anna from accounting. She said the payment was sent on Monday.', note: "Suomen 'hän' ei erota sukupuolta, englannissa aina he, she tai they. Kysy tai tarkista, jos et tiedä.", cz: ['I spoke with Anna from accounting. ___ said the payment was sent on Monday.', 'She', ['He', 'It']] },
      { id: 'trap-11', en: 'Could you tell me where the file is?', fi: 'Voisitko kertoa, missä tiedosto on?', ex: 'Could you tell me where the file is?', note: "Epäsuorassa kysymyksessä sanajärjestys on lauseen järjestys: 'where the file is', ei 'where is the file'.", cz: ['Could you tell me ___?', 'where the file is', ['where is the file', 'where does the file']] },
    ],
  },
  {
    id: 'issue',
    title: 'Ongelmat ja vianselvitys',
    situation: 'Asiakas kertoo virheestä tai sinä selvität ja kerrot ongelman ratkaisusta.',
    intro:
      'Asiakaspalvelussa tärkeintä on kolme asiaa: kuittaa ongelma, kerro mitä teet seuraavaksi ja kiitä kärsivällisyydestä. Näihin on omat vakioilmauksensa.',
    items: [
      { id: 'issue-01', en: "We've identified the issue.", fi: 'Olemme tunnistaneet ongelman.', ex: "We've identified the issue and are working on a fix.", note: 'Present perfect: ongelman löytyminen vaikuttaa nyt.' },
      { id: 'issue-02', en: 'The root cause is …', fi: 'Perimmäinen syy on …', ex: 'The root cause is an incorrect receiver address in the invoice.' },
      { id: 'issue-03', en: 'As a workaround, …', fi: 'Väliaikaisena ratkaisuna …', ex: 'As a workaround, you can upload the file manually.', note: "'Workaround' = kiertotie, ei lopullinen korjaus." },
      { id: 'issue-04', en: 'I apologize for the inconvenience.', fi: 'Pahoittelen aiheutunutta haittaa.', ex: 'I apologize for the inconvenience this has caused.', note: "Apologize FOR + asia, apologize TO + henkilö. Arkisempi: 'Sorry for the inconvenience'.", cz: ['I apologize ___ the inconvenience.', 'for', ['of', 'about']] },
      { id: 'issue-05', en: 'Could you share a screenshot of the error message?', fi: 'Voisitko jakaa kuvakaappauksen virheilmoituksesta?', ex: 'Could you share a screenshot of the error message?', note: "'Error message' = virheilmoitus. Kysy aina myös tarkka kellonaika, jolloin virhe tuli." },
      { id: 'issue-06', en: 'The issue has been resolved.', fi: 'Ongelma on ratkaistu.', ex: 'The issue has been resolved, and the invoices are going through.' },
      { id: 'issue-07', en: "Thanks for reporting this. We're looking into it.", fi: 'Kiitos ilmoituksesta. Selvitämme asiaa.', ex: "Thanks for reporting this. We're looking into it and will update you shortly.", say: "Thanks for reporting this. We're looking into it.", note: "'Look into' = selvittää, tutkia." },
      { id: 'issue-08', en: "I'll escalate this to …", fi: 'Eskaloin tämän …lle', ex: "I'll escalate this to our development team.", cz: ["I'll escalate this ___ our development team.", 'to', ['for', 'at']] },
      { id: 'issue-09', en: 'Does this happen every time, or only occasionally?', fi: 'Tapahtuuko tämä joka kerta vai vain toisinaan?', ex: 'Does this happen every time, or only occasionally?', note: 'Hyvä tarkentava kysymys vianselvityksessä.' },
      { id: 'issue-10', en: 'Thank you for your patience.', fi: 'Kiitos kärsivällisyydestäsi.', ex: 'Thank you for your patience while we investigate.', note: "'Patience' on epälaskettava. Yleinen pidempi muoto: 'Thank you for your patience and understanding'." },
    ],
  },
  {
    id: 'meet',
    title: 'Kokoukset',
    situation: 'Johdat tai osallistut kokoukseen ja haluat osata vakioilmaukset.',
    intro:
      'Kokouksissa käytetään paljon valmiita lauseita: aloitus, asian siirtäminen, yhteenveto, vastuun jako. Opettele ne sellaisenaan.',
    items: [
      { id: 'meet-01', en: "Let's get started.", fi: 'Aloitetaan.', ex: "Thanks, everyone, for joining. Let's get started." },
      { id: 'meet-02', en: 'First on the agenda is …', fi: 'Asialistan ensimmäisenä kohtana on …', ex: 'First on the agenda is the new onboarding process.', note: 'Agenda = asialista (yksikkö).' },
      { id: 'meet-03', en: "Let's circle back to that later.", fi: 'Palataan siihen myöhemmin.', ex: "That's a good point. Let's circle back to that later.", note: "'Circle back' on yleinen liike-elämän ilmaus Yhdysvalloissa." },
      { id: 'meet-04', en: "Let's take this offline.", fi: 'Käsitellään tämä erikseen kokouksen jälkeen.', ex: "This is a detail for the technical team. Let's take this offline.", note: "'Offline' = ei tässä kokouksessa, vaan kahden kesken tai pienemmällä porukalla." },
      { id: 'meet-05', en: 'To sum up, …', fi: 'Yhteenvetona: …', ex: 'To sum up, we agreed to move the launch to November.' },
      { id: 'meet-06', en: 'Who will take ownership of this?', fi: 'Kuka ottaa tämän vastuulleen?', ex: 'Who will take ownership of the follow-up?', note: "'Take ownership' = ottaa vastuu asian hoitamisesta." },
      { id: 'meet-07', en: "We're running out of time.", fi: 'Aika on loppumassa.', ex: "We're running out of time, so let's move on to the next item.", cz: ["We're running ___ of time.", 'out', ['down', 'away']] },
      { id: 'meet-08', en: 'Let me share my screen.', fi: 'Jaan näyttöni.', ex: 'Let me share my screen so you can see the dashboard.' },
      { id: 'meet-09', en: "I'd like to add something.", fi: 'Haluaisin lisätä jotakin.', ex: "Before we move on, I'd like to add something about the timeline." },
      { id: 'meet-10', en: 'Does anyone have any questions or concerns?', fi: 'Onko kenelläkään kysymyksiä tai huolia?', ex: 'Does anyone have any questions or concerns?' },
      { id: 'meet-11', en: 'Thanks for your time today.', fi: 'Kiitos ajastanne tänään.', ex: "Thanks for your time today. I'll send out the notes this afternoon.", note: "'Notes' = muistio. 'Minutes' on virallinen pöytäkirja." },
    ],
  },
  {
    id: 'view',
    title: 'Eri mieltä oleminen ja tarkentaminen',
    situation: 'Et ole samaa mieltä tai et ymmärtänyt, ja haluat sanoa sen kohteliaasti.',
    intro:
      "Suomalainen suoruus voi kuulostaa englanniksi töykeältä. 'I disagree' on vahva; 'I'm not sure I agree' tai 'I see your point, but …' pitää keskustelun avoimena.",
    items: [
      { id: 'view-01', en: 'I see your point, but …', fi: 'Ymmärrän pointtisi, mutta …', ex: 'I see your point, but I think we should wait for the test results.' },
      { id: 'view-02', en: "I'm not sure I agree.", fi: 'En ole varma, olenko samaa mieltä.', ex: "I'm not sure I agree. Can we look at the numbers again?", note: "Pehmeämpi kuin 'I disagree'. Sopii hyvin ensimmäiseksi vastaukseksi." },
      { id: 'view-03', en: 'Could you clarify what you mean by …?', fi: 'Voisitko tarkentaa, mitä tarkoitat …lla?', ex: "Could you clarify what you mean by 'compliant'?", cz: ["Could you clarify what you mean ___ 'compliant'?", 'by', ['with', 'of']] },
      { id: 'view-04', en: 'If I understand correctly, …', fi: 'Jos ymmärrän oikein, …', ex: 'If I understand correctly, you want to cancel the whole batch.', note: "If-lauseessa nykyaikaa: 'if I understand', ei 'if I will understand'." },
      { id: 'view-05', en: 'Let me rephrase that.', fi: 'Sanon sen toisin.', ex: 'Let me rephrase that. What I meant was that we need more time.' },
      { id: 'view-06', en: "That's a fair point.", fi: 'Se on aiheellinen huomio.', ex: "That's a fair point. We hadn't considered the tax implications." },
      { id: 'view-07', en: 'I have a slightly different view.', fi: 'Minulla on hieman erilainen näkemys.', ex: 'I have a slightly different view on the pricing.', note: "Kohtelias tapa olla eri mieltä. 'Slightly' tekee siitä vielä pehmeämmän." },
      { id: 'view-08', en: 'With all due respect, …', fi: 'Kaikella kunnioituksella, …', ex: 'With all due respect, I think this approach carries a lot of risk.', note: 'Voimakas: ilmaisee selvää erimielisyyttä. Käytä harvoin.' },
      { id: 'view-09', en: "I'd suggest we …", fi: 'Ehdottaisin, että …', ex: "I'd suggest we test it with one customer first.", note: "Suggest-verbin jälkeen ei tule 'to'-infinitiiviä: ei 'suggest to test'.", cz: ["I'd suggest we ___ it with one customer first.", 'test', ['to test', 'testing']] },
      { id: 'view-10', en: 'There may be a misunderstanding here.', fi: 'Tässä saattaa olla väärinkäsitys.', ex: 'There may be a misunderstanding here. I thought the deadline was Friday.' },
    ],
  },
  {
    id: 'inv',
    title: 'Laskutus ja maksut',
    situation: 'Keskustelet laskuista, maksuista ja virheistä asiakkaan tai kollegan kanssa.',
    intro:
      "Laskutuksen sanasto eroaa maittain. Amerikanenglannissa: 'past due' (ei overdue), 'credit memo' (ei credit note), 'check' (ei cheque) ja 'wire transfer'. Summat kirjoitetaan $1,250.50 (pilkku tuhaterottimena).",
    items: [
      { id: 'inv-01', en: 'The invoice was rejected because …', fi: 'Lasku hylättiin, koska …', ex: 'The invoice was rejected because of the missing PO number.', note: "'Because' + lause ('because the buyer reference was missing'), mutta 'because of' + substantiivi ('because of the missing PO number').", cz: ['The invoice was rejected ___ the missing PO number.', 'because of', ['because', 'due']] },
      { id: 'inv-02', en: 'The payment is past due.', fi: 'Maksu on erääntynyt.', ex: 'According to our records, the payment is 15 days past due.', note: "Amerikanenglannissa 'past due', brittiläisessä 'overdue'." },
      { id: 'inv-03', en: 'Our payment terms are net 30.', fi: 'Maksuehtomme on 30 päivää netto.', ex: 'Our standard payment terms are net 30.', note: "'Net 30' = lasku maksetaan 30 päivän kuluessa laskun päiväyksestä." },
      { id: 'inv-04', en: 'Could you send us the remittance advice?', fi: 'Voisitko lähettää meille maksuilmoituksen?', ex: 'Could you send us the remittance advice once the payment has been made?', note: "'Remittance advice' = maksuilmoitus, jossa kerrotaan mitkä laskut maksu kattaa." },
      { id: 'inv-05', en: "We'll issue a credit memo.", fi: 'Annamme hyvityslaskun.', ex: "We'll issue a credit memo for the duplicate charge.", note: "Yhdysvalloissa 'credit memo', brittiläisessä 'credit note'." },
      { id: 'inv-06', en: "The amount doesn't match the purchase order.", fi: 'Summa ei vastaa ostotilausta.', ex: "The amount on the invoice doesn't match the purchase order.", note: "'Match' on transitiivinen verbi: suora objekti ilman prepositiota." },
      { id: 'inv-07', en: 'Please make sure the buyer reference is included.', fi: 'Varmista, että ostajan viite on mukana.', ex: 'Please make sure the buyer reference is included on every invoice.' },
      { id: 'inv-08', en: 'We switched to e-invoicing.', fi: 'Siirryimme verkkolaskutukseen.', ex: 'We switched to e-invoicing to reduce manual work.', note: "Verkkolasku = e-invoice, verkkolaskutus = e-invoicing. 'Switch to' + substantiivi." },
      { id: 'inv-09', en: 'Our records show an outstanding balance.', fi: 'Kirjanpitomme mukaan maksamatonta saldoa on jäljellä.', ex: 'Our records show an outstanding balance of $1,250.50.', note: "Summat: $1,250.50 luetaan 'one thousand two hundred fifty dollars and fifty cents'. Pilkku on tuhaterotin, piste desimaalierotin." },
      { id: 'inv-10', en: "We haven't received the payment yet.", fi: 'Emme ole vielä saaneet maksua.', ex: "We haven't received the payment yet. Could you check the status on your side?", note: "Present perfect + yet kertoo, ettei jotain ole vielä tapahtunut. Työviestissä se on vakiintunut valinta; arkipuheessa kuulee myös 'we didn't receive it yet'.", cz: ["We ___ received the payment yet.", "haven't", ["didn't", "don't"]] },
      { id: 'inv-11', en: 'Please allow three to five business days.', fi: 'Varaa kolmesta viiteen arkipäivää.', ex: 'Please allow three to five business days for processing.', note: "'Business days' = arkipäivät (ma–pe, ei pyhiä)." },
      { id: 'inv-12', en: 'We need to reconcile the accounts.', fi: 'Meidän täytyy täsmäyttää tilit.', ex: 'We need to reconcile the accounts before the month-end close.', note: "'Reconcile' = täsmäyttää kaksi kirjausta tai tiliä keskenään." },
    ],
  },
  {
    id: 'call',
    title: 'Puhelut ja videopuhelut',
    situation: 'Yhteys pätkii, et saanut selvää tai yhdistät puhelun eteenpäin.',
    intro:
      'Puhelinkeskustelussa pienet vakiolauseet auttavat paljon: pyydä toistamaan, vahvista kuuluvuus ja kerro, mitä aiot tehdä seuraavaksi.',
    items: [
      { id: 'call-01', en: 'Can you hear me okay?', fi: 'Kuuluuko ääneni?', ex: 'Hi, can you hear me okay? I can see you, but I cannot hear anything.' },
      { id: 'call-02', en: "You're on mute.", fi: 'Mikrofoni on mykistetty.', ex: "Sorry, you're on mute. We can't hear you." },
      { id: 'call-03', en: "You're breaking up.", fi: 'Ääni pätkii.', ex: "You're breaking up a little. Could you repeat that?" },
      { id: 'call-04', en: 'Could you repeat that, please?', fi: 'Voisitko toistaa tuon?', ex: 'Sorry, I missed that. Could you repeat that, please?', note: "Lyhyesti riittää 'Sorry?' tai 'Pardon?'. Pelkkä 'What?' kuulostaa töykeältä." },
      { id: 'call-05', en: 'Let me put you on hold for a moment.', fi: 'Laitan sinut hetkeksi odottamaan.', ex: 'Let me put you on hold for a moment while I check.' },
      { id: 'call-06', en: "I'll transfer you to …", fi: 'Yhdistän sinut …lle', ex: "I'll transfer you to our billing team." },
      { id: 'call-07', en: 'Could you spell that for me?', fi: 'Voisitko tavata sen?', ex: 'Could you spell your last name for me, please?', note: "Kirjaimet kannattaa harjoitella: englannin 'a' [ei], 'e' [ii], 'i' [ai], 'g' [dzii], 'j' [dzei]." },
      { id: 'call-08', en: "I'll send you a calendar invite.", fi: 'Lähetän sinulle kalenterikutsun.', ex: "I'll send you a calendar invite right after this call." },
      { id: 'call-09', en: "Sorry, I didn't catch your name.", fi: 'Anteeksi, en saanut nimeäsi selville.', ex: "Sorry, I didn't catch your name. Could you say it again?", note: "'Catch' = kuulla, saada selvää." },
      { id: 'call-10', en: 'Is there anything else I can help you with?', fi: 'Voinko auttaa jossakin muussa?', ex: 'Is there anything else I can help you with today?', note: "Help someone WITH something.", cz: ['Is there anything else I can help you ___?', 'with', ['for', 'in']] },
    ],
  },
  {
    id: 'thanks',
    title: 'Kiitokset, anteeksipyynnöt ja palaute',
    situation: 'Kiität, pyydät anteeksi viivettä tai annat ja pyydät palautetta.',
    intro:
      'Englanninkielisessä työkulttuurissa kiitetään ja kehutaan useammin kuin Suomessa. Pienet kehut ja kiitokset ovat normaalia kohteliaisuutta, eivät imartelua.',
    items: [
      { id: 'thanks-01', en: 'I really appreciate your help.', fi: 'Arvostan apuasi todella paljon.', ex: 'I really appreciate your quick response.' },
      { id: 'thanks-02', en: 'Sorry for the delay.', fi: 'Pahoittelen viivästystä.', ex: 'Sorry for the delay in getting back to you.', note: 'Sorry FOR + asia.' },
      { id: 'thanks-03', en: 'My apologies for the confusion.', fi: 'Pahoittelen sekaannusta.', ex: 'My apologies for the confusion. I attached the wrong file.' },
      { id: 'thanks-04', en: 'Good catch!', fi: 'Hyvin huomattu!', ex: "Good catch! I'll fix the invoice number right away." },
      { id: 'thanks-05', en: "I'd love to hear your feedback.", fi: 'Kuulisin mielelläni palautteesi.', ex: "I'd love to hear your feedback on the new onboarding guide.", note: "Feedback on epälaskettava: ei 'feedbacks'." },
      { id: 'thanks-06', en: 'Great job on the presentation.', fi: 'Hyvää työtä esityksessä.', ex: 'Great job on the presentation today!', note: "Luonteva kehu. Vastaus kehuun: 'Thanks, I appreciate that.'" },
      { id: 'thanks-07', en: 'No worries.', fi: 'Ei huolta.', ex: "Sorry I'm late. No worries, we just started.", note: "Rento vastaus anteeksipyyntöön. Muodollisemmin: 'That's perfectly fine.'" },
      { id: 'thanks-08', en: "I'll take care of it.", fi: 'Hoidan sen.', ex: "I'll take care of it and let you know when it's done." },
      { id: 'thanks-09', en: 'Thanks in advance.', fi: 'Kiitos jo etukäteen.', ex: 'Could you send the files by Friday? Thanks in advance.', note: 'Voi kuulostaa vaativalta. Usein riittää pelkkä Thank you.' },
      { id: 'thanks-10', en: 'I take full responsibility.', fi: 'Otan täyden vastuun.', ex: 'I take full responsibility for the mistake, and I will make sure it does not happen again.' },
    ],
  },
  {
    id: 'small',
    title: 'Rento keskustelu',
    situation: 'Juttelet kollegan tai asiakkaan kanssa ennen kokousta tai tapaamisessa.',
    intro:
      "Englanniksi 'small talk' on osa ammatillista suhdetta. Kysymyksiin kuten 'How's it going?' odotetaan lyhyt, ystävällinen vastaus ja vastakysymys, ei yksityiskohtaista selostusta.",
    items: [
      { id: 'small-01', en: 'How was your weekend?', fi: 'Millainen viikonloppu oli?', ex: 'Hi Mark! How was your weekend?', note: 'Tyypillinen maanantaiaamun avaus.' },
      { id: 'small-02', en: "How's it going?", fi: 'Mitä kuuluu?', ex: "Hi Sarah! How's it going?", note: "Tervehdys, ei tiedustelu. Vastaa lyhyesti: 'Pretty good, thanks. How about you?'" },
      { id: 'small-03', en: 'What have you been up to?', fi: 'Mitä olet puuhaillut?', ex: "I haven't seen you in a while. What have you been up to?", note: "Present perfect continuous: aika on epämääräinen, mutta tilanne jatkuu." },
      { id: 'small-04', en: 'Not bad, thanks. And you?', fi: 'Ihan hyvin, kiitos. Entä sinä?', ex: 'How are you doing? Not bad, thanks. And you?', note: "'Not bad' tarkoittaa yleensä positiivista, ei neutraalia." },
      { id: 'small-05', en: 'That sounds great!', fi: 'Kuulostaa hyvältä!', ex: "You're moving to a new office? That sounds great!", note: "Sounds + adjektiivi (ei adverbi): 'sounds great', ei 'sounds greatly'.", cz: ['That sounds ___!', 'great', ['greatly', 'a great']] },
      { id: 'small-06', en: "I'm originally from Finland.", fi: 'Olen alun perin kotoisin Suomesta.', ex: "I'm originally from Finland, but I've lived in Turku for ten years.", note: "'Originally' = alun perin. Present perfect + for: olen asunut ja asun yhä." },
      { id: 'small-07', en: 'I work for a company that provides e-invoicing services.', fi: 'Työskentelen yrityksessä, joka tarjoaa verkkolaskutuspalveluita.', ex: 'I work for a company that provides e-invoicing services.', note: "Work FOR a company, work IN a field (in finance), work ON a project.", cz: ['I work ___ a company that provides e-invoicing services.', 'for', ['to', 'of']] },
      { id: 'small-08', en: 'It was nice meeting you.', fi: 'Oli mukava tavata.', ex: "It was nice meeting you. Let's stay in touch.", note: "Tavatessa: 'Nice to meet you'. Erotessa: 'It was nice meeting you'." },
      { id: 'small-09', en: "Let's stay in touch.", fi: 'Pidetään yhteyttä.', ex: "It was great talking with you. Let's stay in touch." },
      { id: 'small-10', en: 'Have a great rest of your day.', fi: 'Hyvää päivänjatkoa.', ex: 'Thanks again, and have a great rest of your day!' },
    ],
  },
  {
    id: 'deal',
    title: 'Neuvottelu ja sopiminen',
    situation: 'Sovit ehdoista, tulet vastaan tai kieltäydyt kohteliaasti.',
    intro:
      "Kieltäytyminen kuulostaa englanniksi kohteliaammalta, kun siihen liittyy syy ja vaihtoehto: 'Unfortunately we can't …, but we could …'.",
    items: [
      { id: 'deal-01', en: 'We can accommodate that.', fi: 'Voimme joustaa siinä.', ex: 'We can accommodate a later delivery date.', note: "'Accommodate' = järjestää tilaa tai joustoa jollekin pyynnölle." },
      { id: 'deal-02', en: "Unfortunately, we're unable to …", fi: 'Valitettavasti emme voi …', ex: "Unfortunately, we're unable to offer a refund after 30 days.", note: "'Unable to' on muodollisempi ja pehmeämpi kuin 'can't'." },
      { id: 'deal-03', en: 'As a compromise, …', fi: 'Kompromissina …', ex: 'As a compromise, we could split the cost.' },
      { id: 'deal-04', en: 'Would you be open to …?', fi: 'Voisitko harkita …?', ex: 'Would you be open to a monthly payment plan?' },
      { id: 'deal-05', en: 'That works for me.', fi: 'Se sopii minulle.', ex: 'Tuesday at 10 works for me.', cz: ['Tuesday at 10 works ___ me.', 'for', ['to', 'at']] },
      { id: 'deal-06', en: 'We have a deal.', fi: 'Sovittu.', ex: 'Net 45 and a two percent discount? We have a deal.' },
      { id: 'deal-07', en: "I'll need to check with my manager.", fi: 'Minun täytyy tarkistaa asia esihenkilöltäni.', ex: "I'll need to check with my manager and get back to you.", cz: ["I'll need to check ___ my manager.", 'with', ['from', 'to']] },
      { id: 'deal-08', en: "Let's put that in writing.", fi: 'Laitetaan se kirjallisesti.', ex: "Let's put that in writing so there's no confusion later." },
      { id: 'deal-09', en: 'Let me confirm the details.', fi: 'Vahvistan yksityiskohdat.', ex: 'Let me confirm the details in an email after the call.' },
      { id: 'deal-10', en: 'Is that acceptable to you?', fi: 'Onko se sinulle hyväksyttävää?', ex: 'We could deliver on the 15th. Is that acceptable to you?' },
    ],
  },
];

// Oletusjärjestys, jossa uudet ilmaukset otetaan käyttöön.
export const UNIT_ORDER = ['mail', 'ask', 'time', 'trap', 'issue', 'meet', 'view', 'inv', 'call', 'thanks', 'small', 'deal'];
