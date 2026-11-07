// Oman puheen nauhoitus (MediaRecorder) shadowing-harjoituksen vertailua varten.
// Nauhoitus pysyy vain muistissa (Blob): sitä ei tallenneta laitteelle eikä lähetetä minnekään.

const TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus', 'audio/mp4', 'audio/webm'];

export function recordingSupported(nav = globalThis.navigator, MR = globalThis.MediaRecorder) {
  return Boolean(nav?.mediaDevices?.getUserMedia) && typeof MR === 'function';
}

/** Ensimmäinen selaimen tukema tallennusmuoto tai '' (silloin selain valitsee itse). */
export function pickMimeType(MR = globalThis.MediaRecorder) {
  if (typeof MR?.isTypeSupported !== 'function') return '';
  return (
    TYPES.find((t) => {
      try {
        return MR.isTypeSupported(t);
      } catch {
        return false;
      }
    }) ?? ''
  );
}

/** getUserMedia-virheen nimi → koodi: 'denied' | 'no-mic' | 'failed'. */
export function recorderErrorCode(error) {
  const name = error?.name;
  if (name === 'NotAllowedError' || name === 'SecurityError' || name === 'PermissionDeniedError') return 'denied';
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError' || name === 'OverconstrainedError') return 'no-mic';
  return 'failed';
}

export function recorderErrorText(code) {
  switch (code) {
    case 'denied':
      return 'Mikrofonin käyttö on estetty. Salli mikrofoni selaimen osoitekentän kuvakkeesta tai ohita nauhoitus.';
    case 'no-mic':
      return 'Mikrofonia ei löytynyt.';
    case 'unsupported':
      return 'Tämä selain ei tue nauhoitusta.';
    default:
      return 'Nauhoitus ei käynnistynyt.';
  }
}

/**
 * Käynnistää nauhoituksen. Palauttaa { ok: true, stop, cancel } tai { ok: false, error }.
 * stop() päättää nauhoituksen ja palauttaa Promisen { blob, ms, type } tai null, jos nauhoitus epäonnistui.
 * cancel() päättää nauhoituksen ja hylkää sen. Mikrofoni vapautetaan aina.
 */
export async function startRecording({ nav = globalThis.navigator, MR = globalThis.MediaRecorder, now = () => performance.now() } = {}) {
  if (!recordingSupported(nav, MR)) return { ok: false, error: 'unsupported' };
  let stream;
  try {
    // Kaiunpoisto auttaa, jos malli soi kaiuttimesta; kuulokkeilla nauhoitus on silti selvästi parempi.
    stream = await nav.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true } });
  } catch (e) {
    return { ok: false, error: recorderErrorCode(e) };
  }
  const release = () => {
    for (const track of stream.getTracks()) track.stop();
  };
  let rec;
  try {
    const type = pickMimeType(MR);
    rec = type ? new MR(stream, { mimeType: type }) : new MR(stream);
  } catch {
    release();
    return { ok: false, error: 'failed' };
  }
  const chunks = [];
  rec.addEventListener('dataavailable', (e) => {
    if (e.data?.size) chunks.push(e.data);
  });
  const t0 = now();
  let discard = false;
  const done = new Promise((resolve) => {
    rec.addEventListener(
      'stop',
      () => {
        release();
        if (discard || !chunks.length) return resolve(null);
        const type = rec.mimeType || chunks[0].type || 'audio/webm';
        resolve({ blob: new Blob(chunks, { type }), ms: Math.round(now() - t0), type });
      },
      { once: true },
    );
    rec.addEventListener(
      'error',
      () => {
        release();
        resolve(null);
      },
      { once: true },
    );
  });
  try {
    rec.start();
  } catch {
    release();
    return { ok: false, error: 'failed' };
  }
  const end = () => {
    try {
      if (rec.state !== 'inactive') rec.stop();
      else release();
    } catch {
      release();
    }
  };
  return {
    ok: true,
    stop() {
      end();
      return done;
    },
    cancel() {
      discard = true;
      end();
    },
  };
}
