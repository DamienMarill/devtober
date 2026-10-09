# Jour 9 : Gravity

![Aperçu](./preview.gif)

Un vol parabolique à piloter avec deux boutons, haut et bas : dehors, la trajectoire se dessine, colorée par la force ressentie ; dedans, trois passagers, un ballon, une pomme, une bulle d'eau et des bonbons se mettent à flotter quand on réussit l'apesanteur.

## L'idée

Au retour de la Cité de l'espace, je voulais une expérience plutôt qu'un jeu : monter dans l'avion « zéro g » de Novespace. Le paradoxe que j'avais envie de montrer : en apesanteur, la gravité est toujours là. L'avion coupe sa portance, suit la parabole d'une pierre lancée, et tout ce qu'il contient tombe exactement avec lui. Le profil visé est celui du CNES : palier à 6 000 m et 830 km/h, ressource à 1,8 g jusqu'à 45-47°, une vingtaine de secondes d'apesanteur, sortie à −42°.

## Comment c'est codé

**Le vol** ([`lib/flight.ts`](./lib/flight.ts)) est un point matériel dans un plan vertical : vitesse V, pente γ, incidence α. L'air suit l'atmosphère type ([`lib/atmosphere.ts`](./lib/atmosphere.ts)), avec la compressibilité à Mach 0,7. Ce que ressent la cabine, c'est tout sauf le poids : la force spécifique (portance, traînée, poussée) projetée sur les axes du fuselage.

```ts
const fAlong = (T * cosA - D) / A.mass;
const fNormal = (L + T * sinA) / A.mass;
this.V = Math.max(40, this.V + (fAlong - g * Math.sin(this.gamma)) * dt);
this.gamma += ((fNormal - g * Math.cos(this.gamma)) / this.V) * dt;
this.nz = (fNormal * cosA - fAlong * sinA) / G0;
```

**Le manche.** Les boutons ▲ et ▼ (ou les flèches) déplacent le manche, qui reste où on le lâche. Sa position commande l'incidence ; les protections la bornent entre −1 et 2,5 g et avant le décrochage. Le repère rose du manche est l'incidence de portance nulle : la même à toutes les vitesses, c'est là qu'on tient 0 g. Les gaz sont automatiques, comme le troisième pilote à bord : en apesanteur, ils compensent la traînée. Une légère turbulence laisse les quelques centièmes de g d'un vrai vol.

**Le pilote automatique** ([`lib/autopilot.ts`](./lib/autopilot.ts), touche A, ou T pour une démo déjà dans la ressource) ne touche qu'au manche : il calcule l'incidence qui donne le facteur de charge voulu. Il tient 23 s d'apesanteur et culmine vers 8 100 m à 470 km/h. Un pilote de sécurité reprend la main si l'avion va trop bas, trop vite ou dépasse 60° d'assiette : sans lui, manche tiré à fond, l'A310 enchaînait les loopings. [`lib/phases.ts`](./lib/phases.ts) reconnaît les annonces « Pull up », « Injection », « Pull out » et chronomètre l'apesanteur (sous 0,05 g).

**La cabine** ([`lib/cabin.ts`](./lib/cabin.ts)) a son propre repère : rien n'y tombe « vers le bas », chaque corps subit l'opposé de la force spécifique de l'avion. Passagers en capsules, objets en disques, avec rotation, chocs et frottement ; on les attrape et on les lance au pointeur. En apesanteur, un passager collé à une paroi s'en repousse de la main.

```ts
setLoad(nx: number, nz: number): void {
  this.ax = -nx * G0;
  this.ay = -nz * G0;
}
```

**Le rendu** est en canvas 2D : la trace extérieure ([`lib/sky-view.ts`](./lib/sky-view.ts)), la cabine et ses hublots où l'horizon penche avec l'assiette ([`lib/cabin-view.ts`](./lib/cabin-view.ts)), l'accéléromètre et sa courbe ([`lib/gauges.ts`](./lib/gauges.ts)). Le son est synthétisé en Web Audio ([`lib/audio.ts`](./lib/audio.ts)), les annonces dites par le navigateur. [`day-09-gravity.ts`](./day-09-gravity.ts) fait tourner le tout à pas fixe (1/120 s).

## Lien avec le mot

La gravité ne change pas : environ 9,8 m/s², du début à la fin. Ce qui change, c'est ce qu'on en ressent. À 1,8 g, les passagers sont plaqués au plancher ; à 0 g, ils ouvrent les bras et flottent, parce que l'avion est en chute libre, même quand il monte encore vers son sommet. Le compteur affiche la force ressentie et le poids apparent d'un passager de 70 kg, de 126 kg à presque rien.

## Pour aller plus loin

- Les paraboles lunaires (0,16 g) et martiennes (0,38 g) que Novespace vole aussi : il suffit de viser un autre facteur de charge.
- [Le vol parabolique expliqué par le CNES](https://cnes.fr/education/parabole), d'où viennent les chiffres du profil.
