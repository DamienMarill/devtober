# Jour 10 : Fold

Cinq origamis à plier pas à pas en 3D : une flèche montre le pli, on fait glisser la feuille au doigt ou à la souris, le pli se marque, et on enchaîne jusqu'au modèle fini, sur l'un des six papiers japonais au choix.

## L'idée

Fold, c'est plier, et rien ne se plie mieux qu'une feuille d'origami. Je voulais retrouver le plaisir d'un diagramme qu'on suit étape par étape, avec la feuille sous la main : chien, gobelet, cœur, avion et kabuto (le casque de samouraï de la fête des enfants). Rien n'est enregistré : chaque pli est calculé.

## Comment c'est codé

**Le moteur de pliage** ([`lib/paper.ts`](./lib/paper.ts)) ne connaît pas three.js. La feuille est une liste de facettes : un polygone convexe en coordonnées « feuille », une isométrie du plan qui dit où il se trouve sur la table (déterminant −1 : la facette montre son dos) et un numéro de couche. Un pli est une droite : la médiatrice de deux points (« amène ce coin sur ce point ») ou une droite donnée. Chaque facette traversée est coupée en deux ([`lib/geometry.ts`](./lib/geometry.ts)), la partie mobile est symétrisée puis posée sur la pile (pli vallée), dessous (pli montagne) ou glissée sous un rabat (la poche du gobelet), dans l'ordre inverse :

```ts
const layer = (f: Facet) =>
  mountain
    ? bottom - 1 - (f.layer - lo)
    : tuck
      ? pocket - 1 + (1 + hi - f.layer) / (hi - lo + 2)
      : top + 1 + (hi - f.layer);
```

Les modèles ([`lib/models.ts`](./lib/models.ts)) sont de simples listes d'étapes. Pour viser « une seule épaisseur », chaque facette retient les étapes où elle a bougé (`only: ['half']`). [`lib/paper.spec.ts`](./lib/paper.spec.ts) plie les cinq modèles jusqu'au bout et vérifie que la surface reste 4, que tout s'annule, et que deux facettes qui se recouvrent n'ont jamais la même hauteur.

**L'animation** ([`lib/scene.ts`](./lib/scene.ts)) interpole entre l'état avant et l'état après : les facettes mobiles tournent autour de la droite du pli, et toutes glissent vers leur nouvelle hauteur dans la pile. Quand on fait glisser la feuille, je projette le geste sur la flèche, puis je retrouve l'angle qui amène la pointe sous le doigt : vue de dessus, elle avance comme 1 − cos θ.

```ts
const t = Math.acos(1 - progress * (1 - Math.cos(angle))) / angle;
```

Lâchée après 42 %, la feuille finit le pli toute seule ; avant, elle revient. Au repos, un doigt fantôme refait le geste ([`lib/guides.ts`](./lib/guides.ts)).

**Le rendu** ([`lib/paper-mesh.ts`](./lib/paper-mesh.ts)) tient en un seul maillage, recalculé à chaque image. Recto et verso ont chacun leur texture, choisie dans le shader par `gl_FrontFacing` ; les plis marqués sont dessinés dans ces textures. Les six motifs ([`lib/patterns.ts`](./lib/patterns.ts)) sont tracés en canvas : seigaiha, asanoha, sakura, ichimatsu, shippō et un vermillon uni, avec les fibres du washi par-dessus. Les sons ([`lib/sound.ts`](./lib/sound.ts)) sont du bruit blanc filtré. Le modèle fini se redresse (le cœur bat, l'avion plane) et on peut tourner autour.

## Lien avec le mot

Tout repose sur le pli : la seule opération du moteur est une symétrie par rapport à une droite, et c'est la répétition de ce geste simple qui fait naître un chien, un cœur ou un casque. L'interaction elle-même est un pli : on attrape la feuille et on la rabat.

## Pour aller plus loin

- La grue : elle demande des plis « squash », pétale et renversés, où plusieurs droites bougent ensemble. Mon moteur ne fait que des plis simples ; il faudrait passer à un vrai patron de plis (crease pattern) avec un angle par pli.
- [Origami Simulator](https://origamisimulator.org/) d'Amanda Ghassaei plie n'importe quel patron en simulant les contraintes du papier.
