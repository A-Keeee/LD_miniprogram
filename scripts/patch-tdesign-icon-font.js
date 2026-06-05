/**
 * Point TDesign icon @font-face at bundled static fonts (avoids CDN ERR_CACHE_MISS in devtools).
 * Re-run after `npm install` (wired via postinstall).
 */
const fs = require('fs');
const path = require('path');
const https = require('https');

const root = path.join(__dirname, '..');
const fontDir = path.join(root, 'static', 'fonts');
const fontFile = path.join(fontDir, 't.woff');
const iconWxss = path.join(
  root,
  'node_modules',
  'tdesign-miniprogram',
  'miniprogram_dist',
  'icon',
  'icon.wxss',
);

const LOCAL_FACE =
  "@font-face{font-family:t;src:url('/static/fonts/t.woff') format('woff');font-weight:400;font-style:normal;}";

function downloadFont(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest);
    https
      .get(url, (res) => {
        if (res.statusCode !== 200) {
          reject(new Error(`download failed: ${res.statusCode}`));
          return;
        }
        res.pipe(file);
        file.on('finish', () => file.close(resolve));
      })
      .on('error', reject);
  });
}

async function main() {
  if (!fs.existsSync(iconWxss)) {
    console.warn('[patch-tdesign-icon-font] tdesign-miniprogram not installed, skip');
    return;
  }

  fs.mkdirSync(fontDir, { recursive: true });
  if (!fs.existsSync(fontFile) || fs.statSync(fontFile).size < 1000) {
    await downloadFont(
      'https://tdesign.gtimg.com/icon/0.4.0/fonts/t.woff',
      fontFile,
    );
    console.log('[patch-tdesign-icon-font] downloaded t.woff');
  }

  const raw = fs.readFileSync(iconWxss, 'utf8');
  const patched = raw.replace(/@font-face\{font-family:t;[^}]+\}/, LOCAL_FACE);
  if (patched === raw) {
    console.warn('[patch-tdesign-icon-font] @font-face pattern not found');
    return;
  }
  fs.writeFileSync(iconWxss, patched, 'utf8');
  console.log('[patch-tdesign-icon-font] icon.wxss updated');
}

main().catch((err) => {
  console.error('[patch-tdesign-icon-font]', err);
  process.exit(1);
});
