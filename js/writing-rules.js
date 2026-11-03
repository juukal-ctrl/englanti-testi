// Kirjoitustehtävien sääntöpohjaiset tarkistukset: suomenkielisen oppijan tyypillisiä virheitä ja amerikanenglannin
// käytäntöjä. Periaate: mieluummin jätetään virhe huomaamatta kuin huomautetaan oikeasta englannista. Jokaisella
// säännöllä on positiiviset ja negatiiviset testit (tests/writing.test.mjs), ja kaikkien tehtävien mallivastaukset
// läpäisevät säännöt ilman huomautuksia.
//
// Sääntö: { id, cat, sev, re, fi, fix?, tone?, skip? }
//   cat   luokka (CATEGORY_LABELS)
//   sev   'error' (todennäköisesti väärin) tai 'tip' (kannattaa harkita)
//   re    RegExp (g-lippu lisätään tarvittaessa); osuman teksti näytetään lainauksena
//   fi    selitys suomeksi (merkkijono tai funktio osuman perusteella)
//   fix   ehdotus englanniksi (merkkijono tai funktio osuman perusteella)
//   tone  true = vain kohteliaisuutta vaativissa tehtävissä (task.tone === 'polite')
//   skip  (osuma, teksti) => true, jos osuma ohitetaan

export const CATEGORY_LABELS = {
  preposition: 'Prepositiot ja rakenteet',
  grammar: 'Kielioppi',
  word: 'Sananvalinta',
  spelling: 'Oikeinkirjoitus',
  us: 'Amerikanenglanti',
  format: 'Päivämäärät, ajat ja luvut',
  article: 'Artikkelit',
  register: 'Sävy ja kohteliaisuus',
  caps: 'Isot kirjaimet ja toistot',
  finnish: 'Suomenkieliset sanat',
};

const WEEKDAYS = 'monday|tuesday|wednesday|thursday|friday|saturday|sunday';
const MONTHS_LONG = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTH_RE = MONTHS_LONG.join('|');

/** Muuntaa korjauksen alkukirjaimen samaksi kuin alkuperäisessä tekstissä (Colour → Color). */
export function capLike(original, replacement) {
  if (!original || !replacement) return replacement;
  return /^[A-Z]/.test(original) ? replacement[0].toUpperCase() + replacement.slice(1) : replacement;
}

const lastWordTo = (m, word) => m[0].replace(/\S+$/, word);

const ING = {
  hear: 'hearing', see: 'seeing', meet: 'meeting', receive: 'receiving', get: 'getting', have: 'having', work: 'working',
  speak: 'speaking', talk: 'talking', discuss: 'discussing', be: 'being', read: 'reading', start: 'starting',
  continue: 'continuing', collaborate: 'collaborating', cooperate: 'cooperating',
};

const UNCOUNTABLE = {
  informations: 'information', feedbacks: 'feedback', advices: 'advice', equipments: 'equipment', furnitures: 'furniture',
  knowledges: 'knowledge', softwares: 'software', hardwares: 'hardware', homeworks: 'homework', luggages: 'luggage', progresses: 'progress',
};

const CONTRACTIONS = {
  dont: "don't", doesnt: "doesn't", didnt: "didn't", cant: "can't", wasnt: "wasn't", isnt: "isn't", arent: "aren't",
  havent: "haven't", hasnt: "hasn't", wouldnt: "wouldn't", couldnt: "couldn't", shouldnt: "shouldn't", werent: "weren't",
  youre: "you're", theyre: "they're", thats: "that's", ive: "I've",
};

/* ---------- Taulukkopohjaiset säännöt ---------- */

// [brittiläinen vartalo, amerikkalainen vartalo, sallitut päätteet, pääte pakollinen?]
const UK_US = [
  ['colour', 'color', 's|ed|ing|ful'],
  ['favour', 'favor', 's|ed|ing|able|ite|ites'],
  ['behaviour', 'behavior', 's|al'],
  ['neighbour', 'neighbor', 's|ing|hood'],
  ['honour', 'honor', 's|ed|ing|able'],
  ['labour', 'labor', 's'],
  ['humour', 'humor', ''],
  ['organis', 'organiz', 'e|es|ed|ing|ation|ations|er|ers'],
  ['recognis', 'recogniz', 'e|es|ed|ing|ation'],
  ['apologis', 'apologiz', 'e|es|ed|ing'],
  ['realis', 'realiz', 'e|es|ed|ing|ation'],
  ['finalis', 'finaliz', 'e|es|ed|ing'],
  ['prioritis', 'prioritiz', 'e|es|ed|ing|ation'],
  ['customis', 'customiz', 'e|es|ed|ing|ation'],
  ['summaris', 'summariz', 'e|es|ed|ing'],
  ['utilis', 'utiliz', 'e|es|ed|ing|ation'],
  ['minimis', 'minimiz', 'e|es|ed|ing'],
  ['maximis', 'maximiz', 'e|es|ed|ing'],
  ['optimis', 'optimiz', 'e|es|ed|ing|ation'],
  ['standardis', 'standardiz', 'e|es|ed|ing|ation'],
  ['categoris', 'categoriz', 'e|es|ed|ing|ation'],
  ['authoris', 'authoriz', 'e|es|ed|ing|ation'],
  ['analys', 'analyz', 'e|ed|ing'], // ei "analyses" (monikko sanasta analysis)
  ['emphasis', 'emphasiz', 'e|ed|ing', true], // pääte pakollinen: "emphasis" on itsekin sana
  ['centre', 'center', 's'],
  ['metre', 'meter', 's'],
  ['litre', 'liter', 's'],
  ['theatre', 'theater', 's'],
  ['fibre', 'fiber', 's'],
  ['cheque', 'check', 's'],
  ['licenc', 'licens', 'e|es'],
  ['defenc', 'defens', 'e|es'],
  ['offenc', 'offens', 'e|es'],
  ['programme', 'program', 's'],
  ['catalogue', 'catalog', 's'],
  ['analogue', 'analog', 's'],
  ['enquir', 'inquir', 'y|ies|e|es|ed|ing'],
  ['ageing', 'aging', ''],
  ['fulfil', 'fulfill', 's|ment'],
  ['enrol', 'enroll', 's|ment'],
  ['instalment', 'installment', 's'],
  ['skilful', 'skillful', ''],
  ['practis', 'practic', 'e|es|ed|ing'],
  ['travell', 'travel', 'ed|ing|er|ers'],
  ['whilst', 'while', ''],
  ['amongst', 'among', ''],
  ['learnt', 'learned', ''],
  ['spelt', 'spelled', ''],
  ['sceptic', 'skeptic', 'al|s'],
];

const ukRule = ([uk, us, suffixes, required]) => ({
  id: `us-${uk}`,
  cat: 'us',
  sev: 'tip',
  re: new RegExp(`\\b${uk}(${suffixes ? `(?:${suffixes})${required ? '' : '?'}` : ''})\\b`, 'gi'),
  fi: (m) => `Amerikanenglannissa kirjoitetaan ”${capLike(m[0], us + m[1])}” (brittiläinen: ”${m[0]}”). Sovelluksen tavoite on amerikanenglanti.`,
  fix: (m) => capLike(m[0], us + m[1]),
});

const MISSPELLINGS = {
  recieve: 'receive', recieved: 'received', reciept: 'receipt', definately: 'definitely', definatly: 'definitely',
  seperate: 'separate', seperately: 'separately', occured: 'occurred', occurence: 'occurrence', occuring: 'occurring',
  untill: 'until', wich: 'which', adress: 'address', begining: 'beginning', beleive: 'believe', comming: 'coming',
  commited: 'committed', enviroment: 'environment', existance: 'existence', foward: 'forward', goverment: 'government',
  immediatly: 'immediately', independant: 'independent', neccessary: 'necessary', necesary: 'necessary', neccesary: 'necessary',
  occassion: 'occasion', posible: 'possible', prefered: 'preferred', reccomend: 'recommend', recomend: 'recommend',
  recomendation: 'recommendation', refered: 'referred', relevent: 'relevant', sucessful: 'successful', successfull: 'successful',
  tommorow: 'tomorrow', tomorow: 'tomorrow', truely: 'truly', writting: 'writing', accomodate: 'accommodate',
  apparant: 'apparent', buisness: 'business', bussiness: 'business', calender: 'calendar', collegue: 'colleague',
  colleauge: 'colleague', completly: 'completely', concensus: 'consensus', embarass: 'embarrass', enought: 'enough',
  excellant: 'excellent', familar: 'familiar', finaly: 'finally', freind: 'friend', guarentee: 'guarantee',
  happend: 'happened', intresting: 'interesting', interresting: 'interesting', knowlege: 'knowledge', lenght: 'length',
  maintainance: 'maintenance', noticable: 'noticeable', personel: 'personnel', priviledge: 'privilege',
  publically: 'publicly', questionaire: 'questionnaire', realy: 'really', shedule: 'schedule', sheduled: 'scheduled',
  sincerly: 'sincerely', suprise: 'surprise', thier: 'their', wether: 'whether', attatchment: 'attachment',
  attachement: 'attachment', atachment: 'attachment', attatched: 'attached', invoise: 'invoice', invioce: 'invoice',
  inconvinience: 'inconvenience', inconveniance: 'inconvenience', payed: 'paid',
};

const spellingRules = Object.entries(MISSPELLINGS).map(([wrong, right]) => ({
  id: `typo-${wrong}`,
  cat: 'spelling',
  sev: 'error',
  re: new RegExp(`\\b${wrong}\\b`, 'gi'),
  fi: (m) => (m[0].toLowerCase() === 'payed' ? '”Payed” on vain merenkulun termi. Maksamisen muoto on ”paid”.' : `Kirjoitusvirhe: oikea muoto on ”${right}”.`),
  fix: (m) => capLike(m[0], right),
}));
const contractionRule = {
  id: 'apostrophe',
  cat: 'spelling',
  sev: 'error',
  re: new RegExp(`\\b(${Object.keys(CONTRACTIONS).join('|')})\\b`, 'gi'),
  fi: (m) => `Heittomerkki puuttuu: ”${CONTRACTIONS[m[1].toLowerCase()]}”.`,
  fix: (m) => capLike(m[0], CONTRACTIONS[m[1].toLowerCase()]),
};

const COMPOUNDS = { everytime: 'every time', infront: 'in front', incase: 'in case', aswell: 'as well', atleast: 'at least', eachother: 'each other', inorder: 'in order', noone: 'no one', thankyou: 'thank you', alot: 'a lot' };
const compoundRule = {
  id: 'compound',
  cat: 'spelling',
  sev: 'error',
  re: new RegExp(`\\b(${Object.keys(COMPOUNDS).join('|')})\\b`, 'gi'),
  fi: (m) => `Kaksi sanaa, ei yhtä: ”${COMPOUNDS[m[1].toLowerCase()]}”.`,
  fix: (m) => capLike(m[0], COMPOUNDS[m[1].toLowerCase()]),
};

const FINNISH_WORDS = 'kiitos|terveisin|ystävällisin|liitteenä|liite|lasku|laskun|laskut|maksu|maksun|että|mutta|voisitko|asiakas|asiakkaan|kyllä|viesti|hei|moi|toimittaja|sopimus';
const finnishRule = {
  id: 'finnish-word',
  cat: 'finnish',
  sev: 'error',
  re: new RegExp(`(?<![\\p{L}])(${FINNISH_WORDS})(?![\\p{L}])`, 'giu'),
  fi: (m) => `Suomenkielinen sana ”${m[0]}”. Jos englanninkielinen sana ei tullut mieleen, hae se Sanastosta tai pyydä tekoälypalautetta.`,
};

/* ---------- Käsin kirjoitetut säännöt ---------- */

const RULES_HAND = [
  // --- Prepositiot ja rakenteet ---
  {
    id: 'discuss-about', cat: 'preposition', sev: 'error', re: /\bdiscuss(?:es|ed|ing)? about\b/gi,
    fi: '”Discuss” ei tarvitse prepositiota, vaikka suomessa keskustellaan ”jostakin”: discuss the issue.',
    fix: (m) => m[0].replace(/ about$/i, ''),
  },
  {
    id: 'explain-me', cat: 'preposition', sev: 'error', re: /\bexplain(?:s|ed|ing)? (me|us|him|her|them|you)\b/gi,
    fi: '”Explain” vaatii henkilön eteen ”to”: explain the process to me.',
    fix: (m) => m[0].replace(/ (me|us|him|her|them|you)$/i, ' to $1'),
  },
  {
    id: 'say-me', cat: 'preposition', sev: 'error', re: /\b(?:say|says|said|saying) (?:me|him|her|them|us) (?:that|about|what|when|how|why|where|if|whether)\b/gi,
    fi: '”Say” ei ota henkilöä suoraan objektikseen. Käytä ”tell”: tell me that … (tai ”say to me”).',
    fix: (m) => m[0].replace(/^(?:say|says|said|saying)/i, (v) => ({ say: 'tell', says: 'tells', said: 'told', saying: 'telling' })[v.toLowerCase()]),
  },
  {
    id: 'inform-that', cat: 'preposition', sev: 'error', re: /\b(?:inform|informs|informed|informing|remind|reminds|reminded|reminding|notify|notifies|notified|notifying) that\b/gi,
    fi: 'Verbin jälkeen tarvitaan vastaanottaja: inform you that, remind you that, notify you that.',
    fix: (m) => m[0].replace(/ that$/i, ' you that'),
  },
  {
    id: 'depend', cat: 'preposition', sev: 'error', re: /\bdepend(?:s|ed|ing)? (?:of|from|in|about)\b/gi,
    fi: 'Oikea prepositio on ”on”: it depends on …',
    fix: (m) => lastWordTo(m, 'on'),
  },
  {
    id: 'interested', cat: 'preposition', sev: 'error', re: /\binterested (?:of|about|on|for)\b/gi,
    fi: 'Oikea prepositio on ”in”: I’m interested in …',
    fix: (m) => lastWordTo(m, 'in'),
  },
  {
    id: 'responsible', cat: 'preposition', sev: 'error', re: /\bresponsible (?:of|from|about)\b/gi,
    fi: 'Oikea prepositio on ”for”: I’m responsible for …',
    fix: (m) => lastWordTo(m, 'for'),
  },
  {
    id: 'participate', cat: 'preposition', sev: 'error', re: /\bparticipat(?:e|es|ed|ing) (?:to|at)\b/gi,
    fi: 'Oikea prepositio on ”in”: participate in the meeting.',
    fix: (m) => lastWordTo(m, 'in'),
  },
  {
    id: 'reply-for', cat: 'preposition', sev: 'error', re: /\b(?:reply|replies|replied|replying|respond|responds|responded|responding) for\b/gi,
    fi: 'Oikea prepositio on ”to”: reply to your email.',
    fix: (m) => lastWordTo(m, 'to'),
  },
  {
    id: 'wait-obj', cat: 'preposition', sev: 'error',
    re: /\b(?:wait|waits|waited|waiting) (?:your|the|an?) (?:reply|response|answer|feedback|confirmation|decision|e-?mail|message|payment|call)\b/gi,
    fi: '”Wait” tarvitsee preposition ”for”: I’m waiting for your reply. Suomen ”odottaa vastaustasi” ei käänny suoraan.',
    fix: (m) => m[0].replace(/^(\S+) /, '$1 for '),
  },
  {
    id: 'attachment-on', cat: 'preposition', sev: 'error', re: /\b(?:on|at) (?:the |this |my |your )?attachment\b/gi,
    fi: 'Liitteessä on englanniksi ”in the attachment”. Sujuvampi tapa: ”The details are attached.”',
    fix: 'in the attachment',
  },
  {
    id: 'end-beginning-of', cat: 'preposition', sev: 'error', re: /\bin the (end|beginning) of\b/gi,
    fi: 'Aika-ilmauksissa käytetään ”at”: at the end of the month. (”In the end” tarkoittaa ”lopulta”.)',
    fix: (m) => `${m[0][0] === 'I' ? 'At' : 'at'} the ${m[1].toLowerCase()} of`,
  },
  {
    id: 'this-moment', cat: 'preposition', sev: 'error', re: /\bin this moment\b/gi,
    fi: '”Tällä hetkellä” on ”at the moment” tai ”right now”.',
    fix: 'at the moment',
  },
  {
    id: 'my-opinion', cat: 'preposition', sev: 'error', re: /\b(?:on|to|by) my opinion\b/gi,
    fi: '”Minun mielestäni” on ”in my opinion”.',
    fix: 'in my opinion',
  },
  {
    id: 'according-to-me', cat: 'word', sev: 'tip', re: /\baccording to me\b/gi,
    fi: '”According to me” kuulostaa oudolta. Oman näkemyksen kertomiseen sopii ”in my opinion” tai ”I think”.',
    fix: 'in my opinion',
  },
  {
    id: 'since-duration', cat: 'grammar', sev: 'error',
    re: /\bsince (?:\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|twelve|several|few|many) (?:seconds?|minutes?|hours?|days?|weeks?|months?|years?)\b(?! ago)/gi,
    fi: 'Keston kanssa käytetään ”for”, ei ”since”: for two years. (”Since” kertoo alkamishetken: since 2022.)',
    fix: (m) => m[0].replace(/^since/i, 'for'),
  },
  {
    id: 'weekday-in', cat: 'preposition', sev: 'error', re: new RegExp(`\\bin (${WEEKDAYS})s?\\b(?!['’]s)`, 'gi'),
    fi: 'Viikonpäivän kanssa käytetään ”on”: on Monday.',
    fix: (m) => m[0].replace(/^in/i, 'on'),
  },
  {
    id: 'month-on', cat: 'preposition', sev: 'error', re: new RegExp(`\\bon (${MONTH_RE.replace('|May', '')})\\b(?!\\s+\\d)`, 'gi'),
    fi: 'Pelkän kuukauden kanssa käytetään ”in”: in March. (Tarkan päivän kanssa ”on”: on March 5.)',
    fix: (m) => m[0].replace(/^on/i, 'in'),
  },
  {
    id: 'clock-in', cat: 'preposition', sev: 'error', re: /\bin \d{1,2}(?::\d{2})?\s?(?:a\.?m\.?|p\.?m\.?)(?!\w)/gi,
    fi: 'Kellonajan kanssa käytetään ”at”: at 3 p.m.',
    fix: (m) => m[0].replace(/^in/i, 'at'),
  },
  {
    id: 'looking-forward', cat: 'grammar', sev: 'error',
    re: /\b(?:look|looks|looked|looking) forward to (hear|see|meet|receive|get|have|work|speak|talk|discuss|be|read|start|continue|collaborate|cooperate)\b/gi,
    fi: '”Look forward to” on prepositio, joten perään tulee -ing-muoto: looking forward to hearing from you.',
    fix: (m) => m[0].replace(/\S+$/, ING[m[1].toLowerCase()]),
  },
  {
    id: 'regarding-to', cat: 'preposition', sev: 'error', re: /\bregarding to\b/gi,
    fi: '”Regarding” ei tarvitse prepositiota: regarding the payment terms.',
    fix: 'regarding',
  },
  {
    id: 'according-the', cat: 'preposition', sev: 'error', re: /\baccording (?:the|our|your|my|this|that|these|those)\b/gi,
    fi: '”According” tarvitsee ”to”: according to the agreement.',
    fix: (m) => m[0].replace(/^according/i, (w) => `${w} to`),
  },
  {
    id: 'suggest-to', cat: 'grammar', sev: 'error',
    re: /\b(?:suggest|suggests|suggested|suggesting|recommend|recommends|recommended|recommending) (?:(?:you|us|him|her|them) )?to (?!(?:the|a|an|my|our|your|his|her|their|this|that|all|everyone|him|them|us|me|you|management|customers?)\b)[a-z]+/gi,
    fi: '”Suggest” ja ”recommend” eivät ota to-infinitiiviä. Sano: I suggest sending … / I suggest that we send …',
  },
  {
    id: 'make-obj-to', cat: 'grammar', sev: 'error', re: /\b(?:make|makes|made|making|let|lets) (?:me|us|him|her|them|you) to [a-z]+/gi,
    fi: '”Make” ja ”let” + henkilö saavat perässään verbin perusmuodon ilman ”to”-sanaa: let me know, made us wait.',
    fix: (m) => m[0].replace(/ to ([a-z]+)$/i, ' $1'),
  },
  {
    id: 'enjoy-avoid-to', cat: 'grammar', sev: 'error', re: /\b(?:enjoy|enjoys|enjoyed|avoid|avoids|avoided) to [a-z]+/gi,
    fi: '”Enjoy” ja ”avoid” saavat perään -ing-muodon: avoid sending, enjoy working.',
  },
  {
    id: 'same-like', cat: 'grammar', sev: 'error', re: /\bthe same like\b/gi,
    fi: '”Sama kuin” on ”the same as”.',
    fix: 'the same as',
  },
  {
    id: 'then-than', cat: 'grammar', sev: 'error',
    re: /\b(?:more|less|better|worse|bigger|smaller|faster|slower|higher|lower|earlier|later|rather|greater|fewer|longer|shorter|easier|harder) then\b/gi,
    fi: 'Vertailussa käytetään ”than”, ei ”then”.',
    fix: (m) => lastWordTo(m, 'than'),
  },
  {
    id: 'agree-am', cat: 'grammar', sev: 'error', re: /\b(?:i am|i'm|im|we are|we're|you are|you're|they are|they're|he is|he's|she is|she's) agree(?:d)?\b/gi,
    fi: 'Suomen ”olen samaa mieltä” ei ole ”I am agree”. Verbi on ”agree”: I agree.',
    fix: (m) => {
      const subj = /^(?:i|im)/i.test(m[0]) ? 'I' : m[0].split(/[\s']/)[0];
      return `${subj}${/^(?:he|she)/i.test(subj) ? ' agrees' : ' agree'}`;
    },
  },
  {
    id: 'will-can', cat: 'grammar', sev: 'error', re: /\b(will|would|shall|should|must|might) can\b/gi,
    fi: 'Kaksi apuverbiä ei mahdu peräkkäin. ”Voin tulevaisuudessa” on ”will be able to”.',
    fix: (m) => `${m[1]} be able to`,
  },
  {
    id: 'modal-to', cat: 'grammar', sev: 'error', re: /\b(?:can|could|should|would|must|might|shall) to [a-z]+/gi,
    fi: 'Apuverbin (can, could, should …) jälkeen verbi on perusmuodossa ilman ”to”-sanaa.',
    fix: (m) => m[0].replace(/ to /, ' '),
  },
  {
    id: 'since-present', cat: 'grammar', sev: 'error',
    re: new RegExp(`(?:\\b(?:I|we|you|they) (?:work|live|study|use)|\\b(?:he|she|it) (?:works|lives|studies|uses)|\\b(?:am|is|are|'m|'re) \\w+ing)\\b[^.!?]{0,40}\\bsince (?:(?:19|20)\\d\\d|${WEEKDAYS}|yesterday|last (?:week|month|year))\\b`, 'gi'),
    fi: '”Since” + aloitushetki vaatii perfektin: I have been working here since 2019 (ei ”I work / I am working … since”).',
  },
  {
    id: 'perfect-past-time', cat: 'grammar', sev: 'error',
    re: new RegExp(`\\b(?:have|has|'ve) (?:\\w+ed|sent|done|made|written|seen|gone|had|got|given|taken|told|spoken|received)(?: [\\w'’-]+){0,3} (?:yesterday|last (?:week|month|year|night|${WEEKDAYS})|(?:\\d+|an?|one|two|three|four|five|six|seven|eight|nine|ten|few|several) (?:minutes?|hours?|days?|weeks?|months?|years?) ago)\\b`, 'gi'),
    fi: 'Kun kerrot tarkasta menneestä ajankohdasta (yesterday, last week, two days ago), käytä imperfektiä: I sent it yesterday (ei ”I have sent it yesterday”).',
  },
  {
    id: 'hope-fine', cat: 'word', sev: 'error', re: /\bhope (?:that )?(?:you are|you're|u r) fine\b/gi,
    fi: '”Toivottavasti voit hyvin” on englanniksi ”I hope you’re doing well”. ”Fine” kuulostaa kysymykseltä terveydestä.',
    fix: 'hope you’re doing well',
  },
  {
    id: 'make-question', cat: 'word', sev: 'error', re: /\b(?:make|makes|made|making) (?:a |the |some |any )?questions?\b/gi,
    fi: 'Kysymys esitetään verbillä ”ask”: ask a question.',
    fix: 'ask a question',
  },
  {
    id: 'do-decision', cat: 'word', sev: 'error',
    re: /\b(?:do|does|did|doing|done) (?:(?:a|an) (?:decision|mistake|suggestion|offer|proposal|appointment)|(?:decisions|mistakes))\b(?!-)/gi,
    fi: 'Päätös, virhe, ehdotus ja tarjous tehdään verbillä ”make”: make a decision, make a mistake.',
  },
  {
    id: 'uncountable-a', cat: 'grammar', sev: 'error',
    re: /\b(?:a|an) (?:feedback|information|advice|equipment|furniture|knowledge|homework|luggage|news|progress)(?=\s*(?:[.,;:!?)]|$)|\s+(?:about|on|of|for|from|regarding|to|that|which|and|or|is|was|would|could|can|will|so|but|if|when|because|by|with|in|at)\b)/gi,
    fi: 'Tämä sana ei ole laskettava, joten sillä ei ole artikkelia ”a/an”. Sano: some feedback, a piece of advice.',
  },
  {
    id: 'uncountable-plural', cat: 'grammar', sev: 'error', re: new RegExp(`\\b(${Object.keys(UNCOUNTABLE).join('|')})\\b`, 'gi'),
    fi: (m) => `”${UNCOUNTABLE[m[1].toLowerCase()]}” on epälaskettava sana, eikä sillä ole monikkoa.`,
    fix: (m) => capLike(m[0], UNCOUNTABLE[m[1].toLowerCase()]),
  },

  {
    id: 'relative-what', cat: 'grammar', sev: 'error',
    re: /\b(?:the|this|that|these|those|a|an|my|our|your)\s+[a-z]+\s+what\s+(?:I|we|you|they|he|she|is|was|are|were|has|have|had|can|will|would)\b/gi,
    fi: 'Suhdelauseessa ”joka” on englanniksi ”that” tai ”which”, ei ”what”: the guide that I sent.',
  },
  {
    id: 'a-help', cat: 'grammar', sev: 'error', re: /\b(?:need|needs|needed|want|wants|ask for|get|give|provide|offer) (?:a|an) help\b/gi,
    fi: '”Help” ei ole laskettava sana, joten sillä ei ole artikkelia ”a”. Sano: need help, some help.',
    fix: (m) => m[0].replace(/ (?:a|an) help$/i, ' help'),
  },
  {
    id: 'follow-up-on', cat: 'preposition', sev: 'tip', re: /\bfollow(?:s|ed|ing)? up (?:the|my|our|your|this|that)(?= )/gi,
    fi: 'Amerikanenglannissa asiaan palataan ilmauksella ”follow up on …”: I’m writing to follow up on the guide.',
    fix: (m) => m[0].replace(/ up /i, ' up on '),
  },
  {
    id: 'looking-forward-for', cat: 'preposition', sev: 'error', re: /\b(?:look|looks|looked|looking) forward (?:for|your|the|a|an|our)\b/gi,
    fi: '”Look forward” tarvitsee preposition ”to”: looking forward to your reply.',
    fix: (m) => m[0].replace(/ forward (?:for)?/i, ' forward to').replace(/(forward to)(\s+)?$/i, '$1'),
  },
  {
    id: 'do-modal', cat: 'grammar', sev: 'error', re: /\b(?:do|does|did) (?:you|he|she|they|we|I) (?:can|could|must|should|would|will)\b/gi,
    fi: 'Apuverbi ei tarvitse ”do”-apuverbiä kysymyksessä: Can you help? (ei ”Do you can help?”).',
  },
  {
    id: 'much-many', cat: 'grammar', sev: 'error',
    re: /\bmuch (?:customers|clients|invoices|payments|people|questions|e-?mails|messages|files|errors|mistakes|users|orders|items|cases|tickets|problems|issues)\b/gi,
    fi: 'Laskettavien sanojen kanssa käytetään ”many”, ei ”much”: many customers.',
    fix: (m) => m[0].replace(/^much/i, 'many'),
  },
  {
    id: 'less-fewer', cat: 'grammar', sev: 'tip',
    re: /\bless (?:customers|invoices|errors|mistakes|people|users|orders|cases|tickets|problems|issues)\b/gi,
    fi: 'Laskettavien sanojen kanssa käytetään vertailussa ”fewer”: fewer errors.',
    fix: (m) => m[0].replace(/^less/i, 'fewer'),
  },
  {
    id: 'this-morning', cat: 'word', sev: 'error', re: /\btoday (?:morning|afternoon|evening)\b/gi,
    fi: '”Tänä aamuna / iltapäivänä / iltana” on englanniksi ”this morning / afternoon / evening”.',
    fix: (m) => m[0].replace(/^today/i, 'this'),
  },
  {
    id: 'come-back-to', cat: 'word', sev: 'tip', re: /\b(?:come|coming|came) back to you\b/gi,
    fi: '”Palaan asiaan” on luontevimmin ”I’ll get back to you”. ”Come back to you” kuulostaa outolta.',
    fix: (m) => m[0].replace(/^(?:come|coming|came)/i, 'get'),
  },
  {
    id: 'quick-reply', cat: 'word', sev: 'tip', re: /\bfast (?:reply|response|answer|feedback|action|turnaround)\b/gi,
    fi: 'Vastauksesta ja palautteesta sanotaan ”quick” tai ”prompt”, ei ”fast”: thanks for your quick reply.',
    fix: (m) => m[0].replace(/^fast/i, 'quick'),
  },
  {
    id: 'open-for', cat: 'preposition', sev: 'error', re: /\bopen for (?:any|your|further|more|questions|feedback|suggestions|discussion)\b/gi,
    fi: 'Englanniksi ollaan avoimia jollekin: ”open to feedback”, ei ”open for”.',
    fix: (m) => m[0].replace(/ for /i, ' to '),
  },

  // --- Sananvalinta (suomalaiset "väärät ystävät" ja suorat käännökset) ---
  {
    id: 'actual-current', cat: 'word', sev: 'tip', re: /\bactual (?:situation|status|state|version|price|prices|schedule|plan)\b/gi,
    fi: '”Actual” tarkoittaa ”todellinen”, ei ”ajankohtainen”. Nykyisestä tilanteesta puhuessa käytä sanaa ”current”.',
    fix: (m) => m[0].replace(/^actual/i, 'current'),
  },
  {
    id: 'treat-invoice', cat: 'word', sev: 'tip', re: /\btreat(?:s|ed|ing)? (?:the |your |this |these |all )?(?:invoices?|payments?|orders?|cases?|requests?|tickets?|applications?)\b/gi,
    fi: '”Treat” tarkoittaa kohtelemista. Asian käsittelyyn sopii ”handle” tai ”process”.',
  },
  {
    id: 'reclamation', cat: 'word', sev: 'error', re: /\breclamations?\b/gi,
    fi: 'Suomen ”reklamaatio” on englanniksi ”complaint”.',
    fix: 'complaint',
  },
  {
    id: 'absent', cat: 'word', sev: 'tip', re: /\b(?:be|am|are|will be|'ll be|'m) absent\b/gi,
    fi: 'Työpaikalla poissaolosta kerrotaan: ”I’ll be out of the office” tai ”I’m away”.',
    fix: 'out of the office',
  },
  {
    id: 'next-days', cat: 'word', sev: 'error', re: /\bin the next days\b/gi,
    fi: '”Seuraavina päivinä” on ”in the next few days” tai ”in the coming days”.',
    fix: 'in the next few days',
  },
  {
    id: 'latest-by', cat: 'word', sev: 'tip', re: /\b(?:at )?latest (?:by|on|until|before)\b/gi,
    fi: '”Viimeistään” ilmaistaan: ”by Friday at the latest” tai ”no later than Friday”.',
    fix: 'no later than',
  },
  {
    id: 'until-deadline', cat: 'word', sev: 'tip',
    re: new RegExp(`\\b(?:send|reply|respond|confirm|provide|submit|pay|finish|deliver|complete|return|answer)\\b[^.!?]{0,40}\\buntil (?:${WEEKDAYS}|tomorrow|noon|the end of)\\b`, 'gi'),
    fi: 'Määräajan kanssa ”mennessä” on ”by”, ei ”until”: send it by Friday. (”Until” tarkoittaa ”asti”.)',
  },

  // --- Sävy ja kohteliaisuus ---
  {
    id: 'i-want', cat: 'register', sev: 'tip', tone: true, re: /\bI want (?:you|the|a|an|some|it|this|that)\b/g,
    fi: '”I want …” kuulostaa vaativalta. Pehmeämpi: ”I’d like …” tai ”Could you …?”',
  },
  {
    id: 'you-must', cat: 'register', sev: 'tip', tone: true, re: /\byou (?:must|have to|will have to|need to)\b/gi,
    fi: 'Käskevä sävy. Pehmeämpi: ”Could you …?” tai ”It would help if you could …”',
  },
  {
    id: 'kindly', cat: 'register', sev: 'tip', re: /\bkindly (?:send|provide|confirm|find|note|let|advise|reply|revert)\b/gi,
    fi: 'Amerikanenglannissa ”kindly” kuulostaa jäykältä tai kärkkäältä. Käytä ”please” tai ”could you”.',
  },
  {
    id: 'dear-sir', cat: 'register', sev: 'tip', re: /\bdear sir(?: or madam)?\b|\bto whom it may concern\b/gi,
    fi: 'Vanhahtava tervehdys. Nykyisin käytetään nimeä (Hi Anna, Dear Ms. Lee) tai ryhmää (Hello team).',
  },
  {
    id: 'yours-sincerely', cat: 'register', sev: 'tip', re: /\byours (?:sincerely|faithfully|truly)\b/gi,
    fi: 'Brittiläinen päätös. Amerikkalaisessa työviestissä käytetään yleensä ”Best regards”, ”Best” tai ”Sincerely”.',
    fix: 'Best regards',
  },
  {
    id: 'inform-you', cat: 'register', sev: 'tip', re: /\b(?:I|we) (?:would like to|want to|wish to|am writing to|are writing to) inform you\b/gi,
    fi: '”Inform you” on jäykkä. Arkisempi ja luontevampi: ”I wanted to let you know …”',
    fix: 'let you know',
  },

  // --- Päivämäärät, ajat ja luvut ---
  {
    id: 'date-dots', cat: 'format', sev: 'error',
    re: /(?<![\d.])([12]?\d|3[01])\.\s?([1-9]|1[0-2])\.\s?(\d{4}|\d{2})(?!\d|\.\d)/g,
    fi: (m) => `Suomalainen päivämäärä voidaan lukea väärin: yhdysvaltalaisessa käytössä kuukausi tulee ensin. Kirjoita ”${usDate(m)}”.`,
    fix: (m) => usDate(m),
  },
  {
    id: 'date-dots-short', cat: 'format', sev: 'tip',
    re: /(?<![\d.])([12]?\d|3[01])\.\s?([1-9]|1[0-2])\.(?![\d.]|\w)/g,
    fi: (m) => `Jos tämä on päivämäärä: suomalainen muoto voidaan lukea väärin, koska yhdysvaltalaisessa käytössä kuukausi tulee ensin. Kirjoita ”${usDate(m)}”.`,
    fix: (m) => usDate(m),
  },
  {
    id: 'date-of', cat: 'format', sev: 'tip', re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? of (${MONTH_RE})\\b`, 'gi'),
    fi: (m) => `Amerikanenglannissa kuukausi tulee ensin: ”${m[2]} ${m[1]}”.`,
    fix: (m) => `${m[2]} ${m[1]}`,
  },
  {
    id: 'date-day-month', cat: 'format', sev: 'tip', re: new RegExp(`\\b(\\d{1,2})(?:st|nd|rd|th)? (${MONTH_RE})\\b`, 'g'),
    fi: (m) => `Amerikanenglannissa kuukausi tulee ensin: ”${m[2]} ${m[1]}”.`,
    fix: (m) => `${m[2]} ${m[1]}`,
  },
  {
    id: 'time-24h', cat: 'format', sev: 'tip', re: /\b(1[3-9]|2[0-3]):([0-5]\d)\b(?!\s?(?:a\.?m\.?|p\.?m\.?))/gi,
    fi: (m) => `Yhdysvalloissa kellonaika ilmoitetaan yleensä 12 tunnin kellolla: ”${time12(m)}”.`,
    fix: (m) => time12(m),
  },
  {
    id: 'klo', cat: 'format', sev: 'error', re: /\bklo\.?(?=\s|\d)/gi,
    fi: '”Klo” on suomea. Englanniksi kellonaika kerrotaan: at 3 p.m.',
    fix: 'at',
  },
  {
    id: 'decimal-comma', cat: 'format', sev: 'tip', re: /(?<![\d,])\d+,\d{1,2}(?![\d,])/g,
    fi: (m) => `Englanniksi desimaalierotin on piste: ”${m[0].replace(',', '.')}”.`,
    fix: (m) => m[0].replace(',', '.'),
  },
  {
    id: 'thousands-space', cat: 'format', sev: 'tip', re: /(?<![\d.,])\d{1,3}(?: \d{3})+(?![\d,])/g,
    fi: (m) => `Englanniksi tuhaterotin on pilkku: ”${m[0].replace(/ /g, ',')}”.`,
    fix: (m) => m[0].replace(/ /g, ','),
  },
  {
    id: 'euro-after', cat: 'format', sev: 'tip', re: /(?<![\w€$£])(\d[\d,. ]*\d|\d)\s?€/g,
    fi: (m) => `Englanniksi valuuttamerkki kirjoitetaan summan eteen: ”€${usNumber(m[1])}” (tai ”${usNumber(m[1])} euros”).`,
    fix: (m) => `€${usNumber(m[1])}`,
  },
  {
    id: 'percent-space', cat: 'format', sev: 'tip', re: /\b\d+(?:[.,]\d+)? %/g,
    fi: (m) => `Englanniksi prosenttimerkki kirjoitetaan kiinni lukuun: ”${m[0].replace(' ', '')}”.`,
    fix: (m) => m[0].replace(' ', ''),
  },
  {
    id: 'fi-abbr', cat: 'format', sev: 'error', re: /\b(?:esim|jne|yms|vk)\.?(?=\s|\d|,|$)/gi,
    fi: (m) => ({ esim: 'Suomen ”esim.” on englanniksi ”e.g.”', jne: 'Suomen ”jne.” on englanniksi ”etc.”', yms: 'Suomen ”yms.” on englanniksi ”and so on” tai ”etc.”', vk: 'Suomen ”vk” on englanniksi ”week” (week 45).' })[m[0].toLowerCase().replace('.', '')],
  },
  {
    id: 'alv', cat: 'format', sev: 'error', re: /\balv\b/gi,
    fi: 'Arvonlisävero on englanniksi ”VAT” (value-added tax).',
    fix: 'VAT',
  },

  {
    id: 'title-dot', cat: 'us', sev: 'tip', re: /\b(Mr|Mrs|Ms|Dr)(?![.\w])(?=\s+[A-Z])/g,
    fi: (m) => `Amerikanenglannissa titteli kirjoitetaan pisteellä: ”${m[1]}.” (brittiläisessä englannissa piste jätetään pois).`,
    fix: (m) => `${m[1]}.`,
  },

  // --- Isot kirjaimet ---
  {
    id: 'lowercase-day-month', cat: 'caps', sev: 'error',
    re: /\b(?:monday|tuesday|wednesday|thursday|friday|saturday|sunday|january|february|april|june|july|august|september|october|november|december)\b/g,
    fi: 'Viikonpäivät ja kuukaudet kirjoitetaan englanniksi isolla alkukirjaimella (toisin kuin suomessa).',
    fix: (m) => m[0][0].toUpperCase() + m[0].slice(1),
  },
  {
    id: 'lowercase-i', cat: 'caps', sev: 'error', re: /(?<![\w.'’-])i(?=\s|'(?:m|ll|d|ve)\b)/g,
    fi: 'Englanniksi ”I” kirjoitetaan aina isolla.',
    fix: 'I',
  },
];

/** Suomalainen lukumuoto (1 250,5 / 1,5) amerikkalaiseksi (1,250.5 / 1.5). */
function usNumber(text) {
  const t = text.trim();
  if (/^\d{1,3}(?: \d{3})+(?:,\d{1,2})?$/.test(t)) return t.replace(/ /g, ',').replace(/,(\d{1,2})$/, '.$1');
  if (/^\d+,\d{1,2}$/.test(t)) return t.replace(',', '.');
  return t;
}

function time12(m) {
  const hour = Number(m[1]) - 12;
  return m[2] === '00' ? `${hour} p.m.` : `${hour}:${m[2]} p.m.`;
}

function usDate(m) {
  const day = Number(m[1]);
  const month = MONTHS_LONG[Number(m[2]) - 1];
  const year = m[3] ? (m[3].length === 2 ? `20${m[3]}` : m[3]) : null;
  return year ? `${month} ${day}, ${year}` : `${month} ${day}`;
}

export const RULES = [...RULES_HAND, ...UK_US.map(ukRule), ...spellingRules, contractionRule, compoundRule, finnishRule];
