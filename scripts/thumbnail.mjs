// Génère la miniature PNG d'un jour : lance l'animation sur la page `/capture/<jour>` (Chrome, Playwright), attend
// l'instant choisi et photographie la scène (sans le bandeau du bas). Écrit dans le dossier du jour :
//   preview.png   la miniature des cartes de la page d'accueil (16/9, découpée dans la scène)
//
// Usage : npm run thumbnail -- 1              (miniature du jour 1)
//         npm run thumbnail -- 1 --at 12      (photographie 12 s après le clic ou la touche)
//
// Options : --url <adresse>   photographier un serveur déjà lancé (ex. http://localhost:4200) au lieu de construire l'app
//           --skip-build      réutiliser le dernier `ng build` (dist/)
//           --size <px>       côté du carré de capture (720)
//           --at <s>          instant de la photo, en secondes après le déclenchement de l'animation
//           --focus <0-1>     bande 16/9 gardée dans la scène carrée : 0 = le haut, 0.5 = le centre (défaut), 1 = le bas
//
// L'instant par défaut est `thumbnailAt` dans days/registry.ts, sinon le tiers de la durée de capture ; le cadrage
// par défaut est `thumbnailFocus`, sinon le centre.
// `npm run gif` appelle ce script à la fin : les GIF, le MP4 et la miniature sortent d'une seule commande.
import { statSync } from 'node:fs';
import { join, sep } from 'node:path';
import { launchChrome, loadCapture, openApp, resolveDay, ROOT, trigger } from './lib/capture-env.mjs';

const args = process.argv.slice(2);
const flag = (name) => args.includes(`--${name}`);
const option = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : fallback;
};
const { slug, dayDir } = resolveDay(args, 'Usage : npm run thumbnail -- <jour 1-31> [--at <s>] [--focus 0.5] [--url <adresse>] [--skip-build] [--size 720]');
const size = Number(option('size', 720));
const output = join(dayDir, 'preview.png');

const { server, baseUrl } = await openApp({ url: option('url', null), skipBuild: flag('skip-build') });
const browser = await launchChrome(server);
try {
  const context = await browser.newContext({ viewport: { width: size, height: size }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const cfg = await loadCapture(page, baseUrl, slug);
  await trigger(page, cfg);

  const at = Number(option('at', cfg.thumbnailAt ?? Math.round(cfg.seconds / 3)));
  console.log(`→ Photo dans ${at} s…`);
  await page.waitForTimeout(at * 1000);
  // Une bande 16/9 de la scène (sans le bandeau du bas : numéro et mot sont déjà écrits sur la carte).
  const focus = Math.min(1, Math.max(0, Number(option('focus', cfg.thumbnailFocus ?? 0.5))));
  const stage = await page.locator('#capture-stage').boundingBox();
  const height = Math.round((stage.width * 9) / 16);
  const y = stage.y + Math.round((stage.height - height) * focus);
  await page.screenshot({ path: output, type: 'png', animations: 'allow', clip: { x: stage.x, y, width: stage.width, height } });
  await context.close();
} finally {
  await browser.close();
  server?.close();
}
console.log(`✔ ${output.replace(ROOT + sep, '')} · ${(statSync(output).size / 1024).toFixed(0)} Ko (miniature de l'accueil)`);
