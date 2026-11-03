// Luo sovelluskuvakkeet (SVG ja PNG) omasta, yksinkertaisesta puhekuplamuodosta.
// Ajo: NODE_PATH=/usr/local/lib/node_modules_global node tools/make-icons.cjs
const fs = require('fs');
const path = require('path');
const sharp = require('sharp');

const out = path.join(__dirname, '..', 'icons');
fs.mkdirSync(out, { recursive: true });

const BLUE = '#1d4fd7';
const bubble =
  'M140 96 H372 A44 44 0 0 1 416 140 V280 A44 44 0 0 1 372 324 H236 L148 396 V324 H140 A44 44 0 0 1 96 280 V140 A44 44 0 0 1 140 96 Z';
const dots = [184, 256, 328].map((cx) => `<circle cx="${cx}" cy="210" r="22" fill="${BLUE}"/>`).join('');

const svg = (scale = 1, rounded = true) => {
  const t = scale === 1 ? '' : ` transform="translate(256 256) scale(${scale}) translate(-256 -256)"`;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><rect width="512" height="512"${rounded ? ' rx="112"' : ''} fill="${BLUE}"/><g${t}><path d="${bubble}" fill="#fff"/>${dots}</g></svg>`;
};

fs.writeFileSync(path.join(out, 'icon.svg'), svg());
(async () => {
  await sharp(Buffer.from(svg())).resize(192, 192).png().toFile(path.join(out, 'icon-192.png'));
  await sharp(Buffer.from(svg())).resize(512, 512).png().toFile(path.join(out, 'icon-512.png'));
  await sharp(Buffer.from(svg(0.8, false))).resize(512, 512).png().toFile(path.join(out, 'icon-maskable-512.png'));
  console.log('Kuvakkeet luotu:', fs.readdirSync(out).join(', '));
})();
