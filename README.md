# Devtober 2026

Un mot par jour pendant tout octobre, une création en code inspirée du mot. Ça se passe sur **[damienmarill.github.io/devtober](https://damienmarill.github.io/devtober/)**.

Stack : Angular 22 (standalone, signals), Tailwind CSS 4 et [spartan-ng](https://spartan.ng) pour l'UI de la page d'accueil.

## Les jours

| # | Mot | | # | Mot | | # | Mot |
|---|-----|-|---|-----|-|---|-----|
| 01 | Pulse | | 12 | Lost | | 23 | Spark |
| 02 | Loop | | 13 | Tangle | | 24 | Hidden |
| 03 | Bloom | | 14 | Bounce | | 25 | Melt |
| 04 | Drift | | 15 | Shadow | | 26 | Machine |
| 05 | Chaos | | 16 | Tide | | 27 | Haunted |
| 06 | Tiny | | 17 | Orbit | | 28 | Grow |
| 07 | Swarm | | 18 | Glitch | | 29 | Infinite |
| 08 | Maze | | 19 | Echo | | 30 | Collapse |
| 09 | Gravity | | 20 | Fragile | | 31 | Wake |
| 10 | Fold | | 21 | Signal | | | |
| 11 | Ripple | | 22 | Mirror | | | |

Chaque création vit dans son dossier `days/day-XX-mot/`, avec un README qui explique le code et le lien au mot.

## Structure

```
days/
  day-01-pulse/        ← un dossier par jour : composant + README
  registry.ts          ← jours publiés, branchés sur le routing (lazy-loading)
src/app/
  home/                ← page d'accueil : grille des 31 jours
  day-page/            ← cadre commun d'une page de jour (nav, lien README)
  days.ts              ← liste des mots, dates et statuts
libs/ui/               ← composants spartan-ng (helm) générés
scripts/new-day.mjs    ← crée le dossier d'un jour
```

## Ajouter un jour

```bash
npm run new-day -- 3     # ou sans argument pour le jour d'aujourd'hui
```

Le script crée `days/day-03-bloom/` (composant + README à compléter) et l'ajoute au routing. Le jour passe en « Publié » sur la page d'accueil et devient accessible sur `/day-03-bloom`.

Le composant prend toute la zone sous la barre de navigation : canvas, SVG, Three.js, ce que tu veux.

## Développement

```bash
npm install
npm start                # http://localhost:4200
npm run build:pages      # build de prod tel que déployé sur GitHub Pages
```

Node 22.22.3+ ou 24 (voir `.nvmrc`).

Ajouter un composant spartan-ng : `npx ng g @spartan-ng/cli:ui <nom>`.

## Déploiement

Chaque push sur `main` build et déploie sur GitHub Pages via `.github/workflows/deploy.yml`. Le build utilise `--base-href /devtober/` et copie `index.html` en `404.html` pour que les liens directs vers un jour fonctionnent.
