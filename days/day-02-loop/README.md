# Jour 2 : Loop

Un circuit de voitures électriques en forme de huit, deux joueurs sur le même clavier : chacun martèle sa touche (`Z` à gauche, `O` à droite) pour faire avancer sa voiture, et le premier à boucler trois tours gagne. Sur mobile, deux gros boutons en bas de l'écran remplacent les touches.

## L'idée

« Loop », c'est la boucle d'un circuit, et j'ai tout de suite pensé aux circuits de voitures électriques à rails, ceux où l'on tient une manette reliée au circuit par un fil. Le tracé est un huit : une grande boucle, une petite, et un croisement entre les deux. Les manettes sont les touches du clavier, dessinées comme des touches, et un fil part du bornier du circuit jusqu'à chacune. À chaque pression, une impulsion lumineuse remonte le fil jusqu'à la piste : c'est l'électricité qui fait avancer la voiture.

## Comment c'est codé

Trois petits modules sans rien d'Angular, chacun avec ses tests, et un composant qui les assemble.

**Le tracé** ([`lib/track.ts`](./lib/track.ts)). Le huit est une liste de points de contrôle par lesquels passe une spline de Catmull-Rom fermée. Le croisement est un point de contrôle présent deux fois dans la liste, donc la courbe y passe deux fois. La spline est échantillonnée en polyligne avec les distances cumulées, ce qui donne `poseAt(d)` : la position et la direction de la piste à `d` unités du départ, modulo la longueur du tour. `offsetAt(d, o)` décale ce point perpendiculairement : c'est ainsi que sont tracés les deux rails et posées les voitures.

```ts
offsetAt(distance: number, offset: number): Pose {
  const pose = this.poseAt(distance);
  return {
    x: pose.x - Math.sin(pose.angle) * offset,
    y: pose.y + Math.cos(pose.angle) * offset,
    angle: pose.angle,
  };
}
```

**La course** ([`lib/race.ts`](./lib/race.ts)). Chaque voiture n'a qu'une distance parcourue et une vitesse. Une pression ajoute une impulsion à la vitesse (plafonnée), et à chaque image la vitesse décroît de façon exponentielle : si on arrête de taper, la voiture glisse puis s'arrête. Un tour est bouclé quand la distance dépasse un multiple de la longueur du circuit ; l'instant exact du passage est recalculé à partir du dépassement, pour que les chronos ne dépendent pas de la cadence des images. Le décompte de départ (trois feux rouges) vit aussi là, et le temps qui déborde du décompte dans la même image est déjà compté comme temps de course.

**Le dessin** ([`lib/scene.ts`](./lib/scene.ts)). Un canvas 2D plein écran. La route est la polyligne du circuit tracée en trait épais (un trait plus large et plus clair en dessous fait les bordures), les rails sont deux polylignes décalées, la ligne de départ un damier. Les fils sont des courbes de Bézier cubiques qui tombent du bornier et remontent dans la manette ; les impulsions sont des points qui parcourent ces courbes en 220 ms.

**Le composant** ([`day-02-loop.ts`](./day-02-loop.ts)). Il écoute `keydown` sur le document (en ignorant la répétition automatique du clavier) et `pointerdown` sur les deux boutons, fait tourner la boucle `requestAnimationFrame` seulement tant qu'il y a quelque chose à animer, et recopie l'état de la course dans des signals pour le HUD (compteur de tours, chrono du tour, dernier et meilleur tour, chrono de course au milieu).

Le point délicat, c'était de faire rejoindre les fils aux boutons, qui sont de vrais `<button>` HTML et pas des dessins. À chaque redimensionnement, le composant mesure leur `getBoundingClientRect()` par rapport à l'hôte, en déduit l'espace restant pour le circuit (sous le HUD, au-dessus des boutons) et donne au canvas le point d'arrivée de chaque fil. Sur mobile, `@media (pointer: coarse)` transforme les touches de clavier en gros boutons ronds, et les fils suivent.

## Lien avec le mot

Le circuit est une boucle fermée : la distance parcourue est prise modulo la longueur du tour, et une voiture peut tourner indéfiniment. Le huit en est une version tordue, qui se croise elle-même. Et le jeu lui-même est une boucle : la même touche, pressée encore et encore, c'est le seul contrôle.

## Pour aller plus loin

- Les vraies voitures à rails décrochent dans les virages si on va trop vite. Un rayon de courbure trop petit pour la vitesse pourrait faire sortir la voiture et la renvoyer sur la ligne quelques secondes plus tard : ça récompenserait le rythme plutôt que le martelage.
- Le bouton « Démo » fait courir deux robots qui pressent à des cadences aléatoires ; c'est aussi lui que filme `npm run gif -- 2`.
