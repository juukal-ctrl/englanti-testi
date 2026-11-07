import test from 'node:test';
import assert from 'node:assert/strict';
import { repairApp } from '../js/repair.js';
import { isStandalone, installedRelatedApp } from '../js/views/install.js';

function fakeCaches(keys, { failDelete = false } = {}) {
  const deleted = [];
  return {
    deleted,
    keys: async () => [...keys],
    delete: async (k) => {
      if (failDelete) throw new Error('delete failed');
      deleted.push(k);
      return true;
    },
  };
}
const fakeNav = (regs) => ({ serviceWorker: { getRegistrations: async () => regs } });

test('korjaus poistaa service workerin ja sovelluskuoren välimuistin, mutta ei ääniä eikä muiden sovellusten välimuisteja', async () => {
  const cacheStorage = fakeCaches(['englanti-abc123', 'englanti-audio-v1', 'englanti-old999', 'jokin-muu', 'laitetesti-v1']);
  let unregistered = 0;
  const regs = [
    { unregister: async () => (unregistered++, true) },
    { unregister: async () => (unregistered++, false) },
  ];
  const res = await repairApp({ cacheStorage, nav: fakeNav(regs) });
  assert.deepEqual(cacheStorage.deleted.sort(), ['englanti-abc123', 'englanti-old999']);
  assert.equal(res.removedCaches, 2);
  assert.equal(res.unregistered, 1, 'vain onnistuneet poistot lasketaan');
  assert.equal(unregistered, 2, 'kaikkia rekisteröintejä yritetään');
});

test('korjaus ei kaadu, vaikka rajapinnat puuttuvat tai heittävät virheen', async () => {
  assert.deepEqual(await repairApp({ cacheStorage: undefined, nav: undefined }), { unregistered: 0, removedCaches: 0 });
  assert.deepEqual(await repairApp({ cacheStorage: fakeCaches(['englanti-x'], { failDelete: true }), nav: { serviceWorker: { getRegistrations: async () => { throw new Error('x'); } } } }), { unregistered: 0, removedCaches: 0 });
});

test('isStandalone tunnistaa asennetun sovelluksen näkymätilan', () => {
  assert.equal(isStandalone({ matchMedia: () => ({ matches: true }), navigator: {} }), true);
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }), navigator: {} }), false);
  assert.equal(isStandalone({ matchMedia: () => ({ matches: false }), navigator: { standalone: true } }), true);
  assert.equal(isStandalone({ matchMedia: () => { throw new Error('x'); }, navigator: {} }), false);
  assert.equal(isStandalone({}), false);
});

test('installedRelatedApp: kyllä, ei, tai ei tiedossa', async () => {
  assert.equal(await installedRelatedApp({ getInstalledRelatedApps: async () => [{ platform: 'webapp', url: 'x' }] }), true);
  assert.equal(await installedRelatedApp({ getInstalledRelatedApps: async () => [] }), false);
  assert.equal(await installedRelatedApp({ getInstalledRelatedApps: async () => [{ platform: 'play' }] }), false);
  assert.equal(await installedRelatedApp({}), null, 'selain ei tue rajapintaa');
  assert.equal(await installedRelatedApp({ getInstalledRelatedApps: async () => { throw new Error('denied'); } }), null);
});
