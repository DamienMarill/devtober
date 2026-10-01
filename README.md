# Devtober 2026

Un mot par jour pendant tout octobre, une création en code inspirée du mot. Le résultat est en ligne sur **[damienmarill.github.io/devtober](https://damienmarill.github.io/devtober/)**.

## Le principe, version Angular

La règle du Devtober demande un dossier par jour avec un README. Ici, tout le mois est **une seule application Angular** : chaque jour est un **composant Angular** dans son propre dossier, chargé à la demande quand on ouvre sa page. On garde donc l'esprit de la règle (un dossier + un README par jour), mais tout est navigable depuis un même site.

- La page d'accueil affiche les 31 mots et l'état de chaque jour (publié, aujourd'hui, à venir).
- Chaque jour a sa page, `/day-XX-mot`, où la création occupe tout l'écran sous la barre de navigation.
- La barre de navigation est commune à toutes les pages : fil d'Ariane, accès au jour précédent et au jour suivant, et une icône livre en haut à droite qui ouvre le README du jour dans une modale.

## Où sont les créations ?

**Dans [`days/`](./days)**, un dossier par jour :

```
days/
  day-01-pulse/
    day-01-pulse.ts     ← le composant du jour (canvas, SVG, WebGL… au choix)
    README.md           ← ce que fait le code et le lien avec le mot
    preview.gif         ← (optionnel) l'aperçu à poster avec #devtober
  registry.ts           ← liste des jours publiés, branchée sur le routing
```

Le reste du repo, c'est le cadre commun :

```
src/app/
  home/                 ← page d'accueil : grille des 31 jours
  layout/               ← barre de navigation, fil d'Ariane, modale README
  days.ts               ← mots, dates et statut de chaque jour
libs/ui/                ← composants spartan-ng (helm) utilisés par le cadre
scripts/new-day.mjs     ← crée le dossier d'un jour
.claude/skills/         ← skill Claude Code qui rédige le README d'un jour
```

## Les mots

| #   | Mot     |     | #   | Mot     |     | #   | Mot      |
| --- | ------- | --- | --- | ------- | --- | --- | -------- |
| 01  | Pulse   |     | 12  | Lost    |     | 23  | Spark    |
| 02  | Loop    |     | 13  | Tangle  |     | 24  | Hidden   |
| 03  | Bloom   |     | 14  | Bounce  |     | 25  | Melt     |
| 04  | Drift   |     | 15  | Shadow  |     | 26  | Machine  |
| 05  | Chaos   |     | 16  | Tide    |     | 27  | Haunted  |
| 06  | Tiny    |     | 17  | Orbit   |     | 28  | Grow     |
| 07  | Swarm   |     | 18  | Glitch  |     | 29  | Infinite |
| 08  | Maze    |     | 19  | Echo    |     | 30  | Collapse |
| 09  | Gravity |     | 20  | Fragile |     | 31  | Wake     |
| 10  | Fold    |     | 21  | Signal  |     |     |          |
| 11  | Ripple  |     | 22  | Mirror  |     |     |          |

## Ajouter un jour

```bash
npm run new-day -- 3     # ou sans argument pour le jour d'aujourd'hui
```

Le script crée `days/day-03-bloom/` avec un composant de départ et un squelette de README, puis l'ajoute à `days/registry.ts` (avec un réglage de capture par défaut). Le jour passe en « Publié » sur l'accueil et devient accessible sur `/day-03-bloom`.

Le composant reçoit toute la zone sous la barre de navigation (`size-full`). À toi de jouer.

### Documenter le jour

Une fois le code écrit, demande à Claude Code « documente le jour 3 ». Le skill [`day-readme`](./.claude/skills/day-readme/SKILL.md) lit le code du dossier et rédige le README : l'idée, comment c'est codé, le lien avec le mot. Les liens relatifs vers les fichiers fonctionnent à la fois sur GitHub et dans la modale du site.

### Le GIF d'aperçu

```bash
npm run gif -- 3              # preview.gif (README), preview.mp4 (posts) et preview-embed.gif (liens partagés)
npm run gif -- 3 --preview    # 3 s seulement, pour vérifier le clic et le cadrage (preview-test.gif, non versionné)
npm run gif -- 3 --light      # GIF plus léger (~9 Mo au lieu de ~13 pour 30 s)
npm run gif -- 3 --embed-only # refait seulement preview-embed.gif, depuis le MP4 existant (sans refilmer)
```

Le script construit l'app, ouvre la page `/capture/day-03-bloom` dans Chrome (Playwright), la filme, puis convertit la vidéo avec ffmpeg. Cette page est hors de la barre de navigation : elle affiche le jour dans un carré, avec en bas un bandeau (numéro et mot à gauche, logo Marill.dev à droite). Ouverte dans un navigateur, elle montre le même carré, pratique pour régler le clic.

Chaque jour a un réglage `capture` dans [`days/registry.ts`](./days/registry.ts) (créé par `new-day`) :

```ts
capture: { click: { x: 307, y: 534 }, seconds: 30, settle: 3000 },
```

- `click` : où cliquer, en pixels dans le carré de 720 × 720, pour lancer l'animation. `null` si le jour démarre tout seul : on filme dès que la page est chargée.
- `seconds` : la durée filmée, à partir du clic.
- `settle` : l'attente (ms) avant de cliquer, le temps que le jour finisse de charger (1500 par défaut).

Pour trouver les coordonnées d'un bouton, ouvre `/capture/day-03-bloom` en mode « appareil » 720 × 720 dans les outils de développement, ou mesure-le avec Playwright (`locator(...).boundingBox()`). Le registre est compilé dans l'app : après l'avoir modifié, relance sans `--skip-build`.

Il faut Google Chrome et ffmpeg installés.

**GIF ou MP4 ?** Pour 30 s d'animation, le GIF pèse ~13 Mo (400 px, 256 couleurs, 12 images/s) alors que le MP4 (720 px, pleine qualité) en pèse ~4 : c'est le format à envoyer sur X, LinkedIn ou Instagram. Le GIF sert à l'aperçu du README, où une vidéo ne s'affiche pas. Un GIF est lourd par nature sur ces scènes (fonds en dégradé, lueurs qui changent à chaque image) : avec moins de 128 couleurs, les dégradés se découpent en aplats. Pour l'alléger sans les abîmer, `--light` ; sinon `--fps 10`, `--width 360` ou `--colors 128`. `--dither bayer` lisse les dégradés mais double le poids. Le script débruite la vidéo avant la palette, ce qui allège le GIF sans changer son aspect.

Si l'image reste figée pendant les dernières secondes (la musique s'est coupée, un réseau lent…), le script le signale : une capture ratée ne se voit sinon qu'à l'œil. Relance simplement la commande. `npm run gif` sans argument donne la liste des options.

### L'aperçu des liens partagés

Quand on partage le lien d'un jour (`/day-03-bloom/`), les réseaux affichent son `preview-embed.gif`. `npm run build:pages` écrit pour chaque jour une page HTML statique avec ses balises de partage (Open Graph, X) : le titre, la description (le premier paragraphe du README) et l'image. C'est nécessaire parce que les robots des réseaux n'exécutent pas le JavaScript d'Angular : sans ça, tous les liens afficheraient le même aperçu. Le script est [`scripts/social-pages.mjs`](./scripts/social-pages.mjs). Un jour sans `preview-embed.gif` a ses balises de titre et de description, mais pas d'image. L'accueil a des balises génériques, sans image.

Cette image est à part du `preview.gif` du README, pour une raison de poids : X, LinkedIn et Slack ignorent une image de plus de 5 Mo (8 Mo pour Facebook et Discord), et un GIF de 30 s en fait ~13. `npm run gif` prend donc la fenêtre la plus animée du clip (12 s par défaut, 360 px) et la raccourcit jusqu'à passer sous 4,5 Mo. X et LinkedIn n'affichent que sa **première image**, qui montre ainsi l'action et non le début calme du clip ; Facebook et Discord jouent l'animation. Le carré n'est pas recadré : la carte X est de type `summary`, qui accepte le 1:1.

Les réseaux mettent les aperçus en cache : après un déploiement, ils peuvent montrer l'ancien jusqu'à ce qu'on force la relecture (Facebook Sharing Debugger, LinkedIn Post Inspector).

## Développement

```bash
npm install
npm start                # http://localhost:4200
npm run build:pages      # build de prod tel que déployé sur GitHub Pages
```

Node 22.22.3+ ou 24 (voir `.nvmrc`).

## Stack et design

- **Angular 22** (composants standalone, signals) et **Tailwind CSS 4**.
- **[spartan-ng](https://spartan.ng)** pour l'interface du cadre : cartes et badges de l'accueil, fil d'Ariane, tooltips, modale. Ajouter un composant : `npx ng g @spartan-ng/cli:ui <nom>`.
- **[marked](https://marked.js.org)** convertit les README en HTML dans la modale. Il n'est chargé qu'à la première ouverture.
- Le thème reprend le design system **Marill.dev** (« Sakura Night ») : fond nuit `#0E0A35`, accent périwinkle, titres en Bricolage Grotesque, texte en Lato. Les variables sont dans [`src/styles.css`](./src/styles.css).

Les créations de chaque jour sont libres : elles n'ont pas à utiliser spartan ni le thème.

## Déploiement

Chaque push sur `main` lance le build et le déploiement sur GitHub Pages via [`.github/workflows/deploy.yml`](./.github/workflows/deploy.yml). Le build utilise `--base-href /devtober/` et copie `index.html` en `404.html` pour que les liens directs vers un jour fonctionnent.
