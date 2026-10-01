// Génère l'aperçu d'un jour : filme la page `/capture/<jour>` avec Chrome (Playwright) puis convertit la
// vidéo avec ffmpeg. Écrit dans le dossier du jour : preview.gif (pour le README) et preview.mp4 (pour les posts).
//
// Usage : npm run gif -- 1              (GIF + MP4 finaux, durée définie par le jour)
//         npm run gif -- 1 --preview    (3 s, GIF seulement, pour vérifier le clic et le cadrage : preview-test.gif)
//
// Options : --url <adresse>   filmer un serveur déjà lancé (ex. http://localhost:4200) au lieu de construire l'app
//           --skip-build      réutiliser le dernier `ng build` (dist/)
//           --size <px>       côté du carré filmé (720) ; les coordonnées de clic du registre sont dans ce carré
//           --light           GIF plus léger (360 px, 128 couleurs : ~9 Mo au lieu de ~13 pour 30 s), un peu moins fin
//           --width <px>      largeur du GIF (400)
//           --fps <n>         images par seconde du GIF (12)
//           --colors <n>      couleurs de la palette, 2 à 256 (256) : moins de couleurs = plus léger mais des aplats visibles
//           --dither <mode>   none (par défaut), bayer ou sierra2_4a : tramer lisse les dégradés mais alourdit beaucoup
//           --no-denoise      désactive le débruitage avant la palette (il allège le GIF sans changer son aspect)
//           --no-mp4          ne génère pas le MP4
//           --keep-video      garder la vidéo brute (.webm) à côté du GIF
//
// Réglages par jour : `capture` dans days/registry.ts (clic, durée, attente).
import { spawnSync } from 'node:child_process';
import { copyFileSync, createReadStream, existsSync, mkdirSync, readdirSync, rmSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { tmpdir } from 'node:os';
import { dirname, extname, join, normalize, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright-core';

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const DIST = join(ROOT, 'dist', 'devtober', 'browser');
const PREVIEW_SECONDS = 3;

// ---------- arguments ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dayNumber = Number(args.find((a) => /^\d+$/.test(a)));
if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
  console.error('Usage : npm run gif -- <jour 1-31> [--preview] [--url <adresse>] [--skip-build] [--light] [--size 720] [--width 400] [--fps 12] [--colors 256] [--no-mp4]');
  process.exit(1);
}
const preview = flag('preview');
const size = Number(option('size', 720));
const light = flag('light');
const width = Number(option('width', light ? 360 : 400));
const fps = Number(option('fps', 12));
const colors = Number(option('colors', light ? 128 : 256));
const dither = option('dither', 'none');
if (!['none', 'bayer', 'sierra2_4a'].includes(dither)) {
  console.error('--dither : none, bayer ou sierra2_4a.');
  process.exit(1);
}

const nn = String(dayNumber).padStart(2, '0');
const slug = readdirSync(join(ROOT, 'days')).find((name) => name.startsWith(`day-${nn}-`));
if (!slug) {
  console.error(`Aucun dossier days/day-${nn}-… : crée-le avec « npm run new-day -- ${dayNumber} ».`);
  process.exit(1);
}
const dayDir = join(ROOT, 'days', slug);
const output = join(dayDir, preview ? 'preview-test.gif' : 'preview.gif');
const outputMp4 = join(dayDir, 'preview.mp4');
const wantMp4 = !preview && !flag('no-mp4');

if (spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status !== 0) {
  console.error("ffmpeg est introuvable : installe-le (https://ffmpeg.org) et vérifie qu'il est dans le PATH.");
  process.exit(1);
}

// ---------- serveur ----------
const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.png': 'image/png',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Sert dist/ avec le repli SPA (toute adresse sans fichier renvoie index.html, comme sur GitHub Pages). */
function serveDist() {
  return new Promise((done) => {
    const server = createServer((req, res) => {
      const pathname = decodeURIComponent(new URL(req.url, 'http://x').pathname);
      let file = normalize(join(DIST, pathname));
      if (!file.startsWith(DIST + sep) && file !== DIST) file = join(DIST, 'index.html');
      if (!existsSync(file) || statSync(file).isDirectory()) file = join(DIST, 'index.html');
      res.setHeader('Content-Type', MIME[extname(file)] ?? 'application/octet-stream');
      createReadStream(file).pipe(res);
    });
    server.listen(0, '127.0.0.1', () => done({ server, url: `http://127.0.0.1:${server.address().port}` }));
  });
}

let server;
let baseUrl = option('url', null);
if (!baseUrl) {
  if (!flag('skip-build') || !existsSync(join(DIST, 'index.html'))) {
    console.log("→ Construction de l'app (ng build)…");
    // `ng` lancé par Node directement : pas de shell, donc pas d'arguments à échapper.
    const ng = join(ROOT, 'node_modules', '@angular', 'cli', 'bin', 'ng.js');
    const build = spawnSync(process.execPath, [ng, 'build'], { cwd: ROOT, stdio: 'inherit' });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }
  ({ server, url: baseUrl } = await serveDist());
}
baseUrl = baseUrl.replace(/\/$/, '');

// ---------- enregistrement ----------
const work = join(tmpdir(), `devtober-gif-${Date.now()}`);
mkdirSync(work, { recursive: true });

let browser;
try {
  browser = await chromium.launch({
    channel: 'chrome',
    // Le clic fournit le geste exigé par l'autoplay ; on coupe le son pour ne pas jouer le morceau dans la pièce.
    args: ['--autoplay-policy=no-user-gesture-required', '--mute-audio'],
  });
} catch (error) {
  console.error(`Impossible de lancer Google Chrome (${error.message.split('\n')[0]}). Installe Chrome, ou adapte « channel » dans scripts/gif.mjs.`);
  server?.close();
  process.exit(1);
}

const context = await browser.newContext({
  viewport: { width: size, height: size },
  deviceScaleFactor: 1,
  recordVideo: { dir: work, size: { width: size, height: size } },
});

console.log(`→ Chargement de ${baseUrl}/capture/${slug}`);
const startedAt = Date.now(); // la vidéo démarre à la création de la page
const page = await context.newPage();
await page.goto(`${baseUrl}/capture/${slug}`);
await page.waitForSelector('#capture[data-ready="true"]', { timeout: 30_000 });
const cfg = await page.$eval('#capture', (el) => ({
  seconds: Number(el.dataset.seconds),
  settle: Number(el.dataset.settle),
  click: el.dataset.clickX === undefined ? null : { x: Number(el.dataset.clickX), y: Number(el.dataset.clickY) },
}));
await page.waitForTimeout(cfg.settle);

if (cfg.click) {
  console.log(`→ Clic en (${cfg.click.x}, ${cfg.click.y})`);
  await page.mouse.click(cfg.click.x, cfg.click.y);
} else {
  console.log("→ Pas de clic défini : on filme dès que la page est chargée");
}
const seconds = preview ? PREVIEW_SECONDS : cfg.seconds;
// Un peu avant le clic : la vidéo et l'horloge du script ne sont pas parfaitement synchrones.
const from = Math.max(0, (Date.now() - startedAt) / 1000 - 0.1);
console.log(`→ Enregistrement de ${seconds} s…`);
await page.waitForTimeout(seconds * 1000 + 300);

const video = page.video();
await context.close(); // finalise la vidéo
await browser.close();
server?.close();
const videoPath = await video.path();

// ---------- vérification ----------
/**
 * Nombre de secondes, en fin de clip, pendant lesquelles l'image ne bouge plus. Une capture qui s'arrête en
 * route (musique coupée, réseau lent…) ne se voit qu'à l'œil : on mesure la différence moyenne entre images
 * à 1 s d'intervalle, qui reste au-dessus de 0,4 sur une animation vivante et tombe à ~0 sur une image figée.
 */
function frozenTailSeconds(videoPath, from, seconds) {
  const probe = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-ss', from.toFixed(2), '-t', String(seconds), '-i', videoPath, '-vf',
      'fps=1,scale=160:-1,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
      '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  const diffs = [...(probe.stdout ?? '').matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
  let still = 0;
  for (let i = diffs.length - 1; i >= 0 && diffs[i] < 0.05; i--) still++;
  return still;
}

const frozen = frozenTailSeconds(videoPath, from, seconds);
if (frozen >= 4) {
  console.warn(`⚠ L'image est figée depuis ${frozen} s avant la fin : l'animation s'est peut-être arrêtée (musique coupée, réseau lent…). Vérifie le résultat, ou relance la commande.`);
}

// ---------- vidéo -> GIF ----------
console.log('→ Conversion en GIF…');
// Le GIF encode chaque image : le bruit de compression de la vidéo brute (surtout dans les dégradés sombres)
// le gonfle pour rien. Un débruitage temporel avant la palette allège sans changer l'aspect.
const denoise = flag('no-denoise') ? '' : 'hqdn3d=4:3:10:8,';
const filters =
  `${denoise}fps=${fps},scale=${width}:-1:flags=lanczos,split[a][b];` +
  // `full` : la palette tient compte de tout, fond compris (avec `diff`, elle favorise ce qui bouge et le fond s'aplatit).
  `[a]palettegen=stats_mode=full:max_colors=${colors}[p];` +
  `[b][p]paletteuse=dither=${dither}${dither === 'bayer' ? ':bayer_scale=5' : ''}:diff_mode=rectangle`;
const ffmpeg = spawnSync(
  'ffmpeg',
  ['-y', '-loglevel', 'error', '-ss', from.toFixed(2), '-t', String(seconds), '-i', videoPath, '-vf', filters, '-loop', '0', output],
  { stdio: 'inherit' },
);
if (ffmpeg.status !== 0) {
  console.error('ffmpeg a échoué.');
  process.exit(ffmpeg.status ?? 1);
}
if (wantMp4) {
  // Pour les posts (X, LinkedIn, Instagram…) : la vidéo garde toute la qualité pour ~4 Mo, là où le GIF en pèse ~14.
  console.log('→ Conversion en MP4…');
  const mp4 = spawnSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-ss', from.toFixed(2), '-t', String(seconds), '-i', videoPath,
      '-vf', `scale=${size}:-2:flags=lanczos`, '-c:v', 'libx264', '-crf', '23', '-preset', 'slow',
      '-pix_fmt', 'yuv420p', '-movflags', '+faststart', '-an', outputMp4],
    { stdio: 'inherit' },
  );
  if (mp4.status !== 0) console.error('ffmpeg a échoué sur le MP4 (le GIF est bon).');
}
if (flag('keep-video')) {
  const kept = output.replace(/\.gif$/, '.webm');
  copyFileSync(videoPath, kept);
  console.log(`   vidéo brute : ${kept}`);
}
rmSync(work, { recursive: true, force: true });

const mb = statSync(output).size / 1024 / 1024;
console.log(`✔ ${output.replace(ROOT + sep, '')} · ${seconds} s · ${size}×${size} → ${width} px, ${fps} i/s, ${colors} couleurs · ${mb.toFixed(1)} Mo`);
if (existsSync(outputMp4) && wantMp4) {
  console.log(`✔ ${outputMp4.replace(ROOT + sep, '')} · ${size}×${size} · ${(statSync(outputMp4).size / 1024 / 1024).toFixed(1)} Mo (à privilégier pour les posts)`);
}
if (mb > 15) console.log('  GIF lourd (X refuse au-delà de 15 Mo) : essaie --fps 10, --width 360 ou --colors 128.');
