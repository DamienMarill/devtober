// Génère les aperçus d'un jour : filme la page `/capture/<jour>` avec Chrome (Playwright) puis convertit la
// vidéo avec ffmpeg. Écrit dans le dossier du jour :
//   preview.gif        l'aperçu du README (~13 Mo)
//   preview.mp4        pour les posts (X, LinkedIn, Instagram…) : pleine qualité, ~4 Mo
//   preview-embed.gif  l'image d'aperçu des liens partagés (og:image) : sous 5 Mo, sinon les réseaux l'ignorent
//
// Usage : npm run gif -- 1                (tout, durée définie par le jour)
//         npm run gif -- 1 --preview      (3 s, GIF seulement, pour vérifier le clic et le cadrage : preview-test.gif)
//         npm run gif -- 1 --embed-only   (refait seulement preview-embed.gif, depuis preview.mp4 : sans refilmer)
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
//           --no-embed        ne génère pas l'image d'embed
//           --embed-seconds <s>  durée visée de l'image d'embed (12) ; elle raccourcit seule si elle dépasse le budget
//           --embed-budget <Mo>  poids maximal de l'image d'embed (4.5 : X, LinkedIn et Slack refusent au-delà de 5)
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
const MB = 1024 * 1024;

// ---------- arguments ----------
const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const dayNumber = Number(args.find((a) => /^\d+$/.test(a)));
if (!Number.isInteger(dayNumber) || dayNumber < 1 || dayNumber > 31) {
  console.error('Usage : npm run gif -- <jour 1-31> [--preview] [--embed-only] [--url <adresse>] [--skip-build] [--light] [--size 720] [--width 400] [--fps 12] [--colors 256] [--no-mp4] [--no-embed]');
  process.exit(1);
}
const preview = flag('preview');
const embedOnly = flag('embed-only');
const size = Number(option('size', 720));
const light = flag('light');
const width = Number(option('width', light ? 360 : 400));
const fps = Number(option('fps', 12));
const colors = Number(option('colors', light ? 128 : 256));
const dither = option('dither', 'none');
const embedSeconds = Number(option('embed-seconds', 12));
const embedBudget = Number(option('embed-budget', 4.5)) * MB;
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
const outputEmbed = join(dayDir, 'preview-embed.gif');
const wantMp4 = !preview && !embedOnly && !flag('no-mp4');
const wantGif = !embedOnly;
const wantEmbed = !preview && !flag('no-embed');
const rel = (file) => file.replace(ROOT + sep, '');
const mb = (file) => (statSync(file).size / MB).toFixed(1);

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

// ---------- enregistrement ----------
/** Filme `/capture/<jour>` et renvoie la vidéo brute, avec l'instant du clic (`from`) et la durée utile. */
async function record() {
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
    console.log('→ Pas de clic défini : on filme dès que la page est chargée');
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
  return { videoPath: await video.path(), from, seconds, work };
}

// ---------- analyse du mouvement ----------
/**
 * Différence moyenne entre images successives (une mesure par seconde, la 1re est à ignorer), de 0 à 255.
 * Elle reste au-dessus de 0,4 sur une animation vivante et tombe à ~0 sur une image figée.
 */
function motionPerSecond(videoPath, from, seconds) {
  const probe = spawnSync(
    'ffmpeg',
    ['-v', 'error', '-ss', from.toFixed(2), '-t', String(seconds), '-i', videoPath, '-vf',
      'fps=1,scale=160:-1,format=gray,tblend=all_mode=difference,signalstats,metadata=print:key=lavfi.signalstats.YAVG:file=-',
      '-f', 'null', '-'],
    { encoding: 'utf8' },
  );
  return [...(probe.stdout ?? '').matchAll(/YAVG=([\d.]+)/g)].map((m) => Number(m[1]));
}

/** Secondes, en fin de clip, pendant lesquelles l'image ne bouge plus (musique coupée, réseau lent…). */
function frozenTailSeconds(motion) {
  let still = 0;
  for (let i = motion.length - 1; i >= 0 && motion[i] < 0.05; i--) still++;
  return still;
}

/** Début (en secondes depuis le début du clip) de la fenêtre de `win` secondes où ça bouge le plus. */
function mostActiveWindow(motion, win) {
  let best = { start: 1, score: -1 };
  for (let start = 1; start + win <= motion.length; start++) {
    const score = motion.slice(start, start + win).reduce((a, b) => a + b, 0);
    if (score > best.score) best = { start, score };
  }
  return best.start;
}

// ---------- encodage ----------
/** Vidéo -> GIF : `ss` et `t` découpent la source (secondes). */
function encodeGif({ videoPath, ss, t, out, width: w, fps: f, colors: c }) {
  // Le GIF encode chaque image : le bruit de compression de la vidéo brute (surtout dans les dégradés sombres)
  // le gonfle pour rien. Un débruitage temporel avant la palette allège sans changer l'aspect.
  const denoise = flag('no-denoise') ? '' : 'hqdn3d=4:3:10:8,';
  const filters =
    `${denoise}fps=${f},scale=${w}:-1:flags=lanczos,split[a][b];` +
    // `full` : la palette tient compte de tout, fond compris (avec `diff`, elle favorise ce qui bouge et le fond s'aplatit).
    `[a]palettegen=stats_mode=full:max_colors=${c}[p];` +
    `[b][p]paletteuse=dither=${dither}${dither === 'bayer' ? ':bayer_scale=5' : ''}:diff_mode=rectangle`;
  const run = spawnSync(
    'ffmpeg',
    ['-y', '-loglevel', 'error', '-ss', ss.toFixed(2), '-t', String(t), '-i', videoPath, '-vf', filters, '-loop', '0', out],
    { stdio: 'inherit' },
  );
  if (run.status !== 0) {
    console.error('ffmpeg a échoué.');
    process.exit(run.status ?? 1);
  }
  return statSync(out).size;
}

/**
 * Image d'aperçu des liens partagés. Les réseaux ignorent une image trop lourde (5 Mo pour X, LinkedIn et
 * Slack, 8 Mo pour Facebook et Discord) : on prend donc la fenêtre la plus animée du clip, en petit, et on
 * la raccourcit tant qu'elle dépasse le budget. X et LinkedIn n'affichent que sa première image : mieux
 * vaut qu'elle montre l'action plutôt que le début d'un clip encore calme.
 */
function encodeEmbed(videoPath, from, seconds) {
  const motion = motionPerSecond(videoPath, from, seconds);
  let win = Math.max(2, Math.min(embedSeconds, motion.length - 1));
  for (let attempt = 0; attempt < 6; attempt++) {
    const start = mostActiveWindow(motion, win);
    const bytes = encodeGif({ videoPath, ss: from + start, t: win, out: outputEmbed, width: 360, fps: 10, colors: 128 });
    if (bytes <= embedBudget || win <= 3) {
      console.log(`✔ ${rel(outputEmbed)} · ${win} s (dès ${start} s) · 360 px · ${mb(outputEmbed)} Mo (aperçu des liens partagés)`);
      if (bytes > embedBudget) console.warn('⚠ Toujours au-dessus du budget : les réseaux risquent de l\'ignorer. Essaie --embed-budget plus haut ou un clip plus calme.');
      return;
    }
    win = Math.max(3, Math.floor(win * 0.8));
  }
}

// ---------- déroulé ----------
let source;
if (embedOnly) {
  if (!existsSync(outputMp4)) {
    console.error(`${rel(outputMp4)} est introuvable : génère d'abord l'aperçu avec « npm run gif -- ${dayNumber} ».`);
    process.exit(1);
  }
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outputMp4], { encoding: 'utf8' });
  source = { videoPath: outputMp4, from: 0, seconds: Math.floor(Number(probe.stdout)) };
  console.log(`→ Image d'embed dérivée de ${rel(outputMp4)} (${source.seconds} s)`);
} else {
  source = await record();
}
const { videoPath, from, seconds } = source;

// Une capture qui s'arrête en route ne se voit qu'à l'œil : on le vérifie.
if (!embedOnly) {
  const frozen = frozenTailSeconds(motionPerSecond(videoPath, from, seconds));
  if (frozen >= 4) {
    console.warn(`⚠ L'image est figée depuis ${frozen} s avant la fin : l'animation s'est peut-être arrêtée (musique coupée, réseau lent…). Vérifie le résultat, ou relance la commande.`);
  }
}

if (wantGif) {
  console.log('→ Conversion en GIF…');
  encodeGif({ videoPath, ss: from, t: seconds, out: output, width, fps, colors });
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
if (wantEmbed) {
  console.log("→ Image d'embed…");
  encodeEmbed(videoPath, from, seconds);
}
if (!embedOnly) {
  if (flag('keep-video')) {
    const kept = output.replace(/\.gif$/, '.webm');
    copyFileSync(videoPath, kept);
    console.log(`   vidéo brute : ${kept}`);
  }
  rmSync(source.work, { recursive: true, force: true });
}

if (wantGif) {
  console.log(`✔ ${rel(output)} · ${seconds} s · ${size}×${size} → ${width} px, ${fps} i/s, ${colors} couleurs · ${mb(output)} Mo`);
}
if (wantMp4 && existsSync(outputMp4)) {
  console.log(`✔ ${rel(outputMp4)} · ${size}×${size} · ${mb(outputMp4)} Mo (à privilégier pour les posts)`);
}
if (wantGif && statSync(output).size > 15 * MB) {
  console.log('  GIF lourd (X refuse au-delà de 15 Mo) : essaie --fps 10, --width 360 ou --colors 128.');
}
