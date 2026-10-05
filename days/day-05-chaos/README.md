# Jour 5 : Chaos

<!-- phrase de Damien -->

Une forme à guider au clavier (flèches, ZQSD ou WASD) dans un champ de turbulence qui s'épaissit, entre des glows qui apparaissent au loin.

## L'idée

Le chaos au sens mathématique : un système déterministe dont on ne peut pas prévoir la trajectoire, parce que la moindre différence de départ finit par tout changer. Ici, tout le comportement du monde découle d'une variable, `density`, et ses variations passent par une application logistique. Les règles sont fixes, mais on ne peut pas en déduire la suite.

## Comment c'est codé

**Une variable qui règle tout** ([`lib/params.ts`](./lib/params.ts)). `computeParams(p, density, clearing)` recalcule à chaque image un unique objet `Params` : poussée, vitesse max et drag du body, gain du courant, rayon de l'aperture, opacité des nappes et du grain, cadence des glows. Chaque grandeur est une paire `[à 0, à 1]` lue dans [`lib/config.ts`](./lib/config.ts), où se règle toute la pièce.

**La density** ([`lib/density.ts`](./lib/density.ts)). Elle monte lentement avec le temps et à chaque ajout, toujours lissé : rien ne saute. Au contact d'un glow coherent, un épisode démarre. C'est une fonction pure de son propre temps (descente, palier, puis retour), donc testable point par point, et l'audio lit la même courbe avec une demi-seconde d'avance.

**Le courant transverse** ([`lib/body.ts`](./lib/body.ts)). Le body a de l'inertie, un input lissé (`viscosity`) et un drag exponentiel. Le `current` pousse perpendiculairement à la direction d'entrée, proportionnellement à la vitesse. Son signe et son intensité suivent une suite logistique interpolée entre deux itérés ([`lib/noise.ts`](./lib/noise.ts)), son orientation une somme de sinus aux fréquences incommensurables (1, φ, e) :

```ts
step(dt: number, rate: number): void {
  this.phase += dt * rate;
  while (this.phase >= 1) {
    this.phase -= 1;
    this.prev = this.next;
    this.next = this.iterate(this.next); // r·x·(1 − x), r = 3,9
  }
}
```

**Les glows** ([`lib/glows.ts`](./lib/glows.ts)). Un pool fixe. À l'apparition, chaque glow tire s'il est `coherent`. Les autres se dissipent quand le body s'en approche, et la part dissipée ne revient pas. Au contact d'un glow coherent, le tirage donne `stable`, `inert` ou `unstable`.

**Le rendu** ([`lib/stage.ts`](./lib/stage.ts)), en canvas 2D, sans allocation dans la boucle. Les sprites radiaux, quatre nappes de value noise tuilable, six images de grain et une table de 256 couleurs de fond sont préparés au démarrage ; chaque image n'est plus qu'une suite de `drawImage` et de `fillRect`. L'aperture, une ombre radiale centrée sur le body, pulse au rythme d'une seconde suite logistique lissée pour rester lente.

**Le son** ([`lib/audio.ts`](./lib/audio.ts)), synthétisé avec Web Audio : bruit brun filtré, deux paires d'oscillateurs désaccordées de 2 Hz qui battent, un sinus aigu très faible et une voix par glow. Il démarre au premier appui, en fondu, et l'`AudioContext` est fermé quand on quitte la page.

Avec `?debug` dans l'adresse, un HUD s'affiche. Les touches 0 à 9 imposent la density, P la fige, J, K et L font apparaître un glow coherent (stable, inert, unstable) et H un glow non coherent. `?debug&density=0.6&seed=42` part d'une valeur et d'une graine données.

## Lien avec le mot

Rien n'est tiré au hasard image par image : tout vient de règles fixes et d'une graine. Mais l'application logistique à r = 3,9 est chaotique. Deux graines qui diffèrent d'un milliardième divergent en quelques dizaines d'itérations (c'est vérifié dans [`lib/noise.spec.ts`](./lib/noise.spec.ts)). Le courant, la pulsation de l'aperture et les tirages sont donc reproductibles avec la même graine, et pourtant impossibles à anticiper.

## Pour aller plus loin

- [La suite logistique](https://fr.wikipedia.org/wiki/Suite_logistique) et son diagramme de bifurcation : on passe de l'ordre au chaos en faisant varier un unique paramètre, r.
- [`AudioParam.setTargetAtTime`](https://developer.mozilla.org/fr/docs/Web/API/AudioParam/setTargetAtTime), qui fait toutes les transitions du son sans jamais couper.
