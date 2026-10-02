# Jour 2 : Loop

Un circuit de voitures électriques en huit, posé sur le lino d'une chambre d'enfant au milieu des jouets. Deux joueurs sur le même clavier martèlent leur touche (`Z` à gauche, `O` à droite) pour faire avancer leur voiture, et le premier à boucler trois tours gagne. Sur mobile, deux gros boutons remplacent les touches et le jeu passe en paysage.

## L'idée

« Loop », c'est la boucle d'un circuit. J'ai pensé aux circuits jouets à rails, avec leur manette reliée au circuit par un fil. Le tracé est un huit avec un pont au croisement. Les manettes sont des touches du clavier, et un fil part du bornier jusqu'à chacune. À chaque pression, une impulsion lumineuse remonte le fil jusqu'au circuit.

## Comment c'est codé

**Le tracé** ([`lib/track.ts`](./lib/track.ts)). Le huit est construit comme un vrai circuit jouet : deux cercles identiques et leurs deux tangentes communes intérieures, qui se croisent au centre. Tout se raccorde sans angle. Le tracé est échantillonné en polyligne, ce qui donne `poseAt(d)` : la position et la direction à `d` unités du départ, modulo la longueur du tour. `offsetAt(d, o)` décale ce point sur le côté pour tracer les voies et poser les voitures. `elevation()` donne la hauteur du pont, avec des rampes adoucies.

```ts
const theta = Math.asin(radius / spacing); // pente des droites
const half = spacing * Math.cos(theta); // du croisement au point de tangence
const arc = radius * (Math.PI + 2 * theta); // chaque boucle
```

**La course** ([`lib/race.ts`](./lib/race.ts)). Chaque voiture n'a qu'une distance et une vitesse. Une pression ajoute une impulsion plafonnée, et la vitesse décroît de façon exponentielle à chaque image. L'instant exact du passage de la ligne est recalculé à partir du dépassement, pour que les chronos ne dépendent pas de la cadence des images.

**Le dessin**, sur un canvas 2D en couches ([`lib/scene.ts`](./lib/scene.ts)). Ce qui ne bouge pas est dessiné une seule fois par mise en page sur trois calques :

- le sol ([`lib/floor.ts`](./lib/floor.ts)) : des dalles de lino, des mouchetures et des reflets, tirés d'un générateur aléatoire à graine pour ne pas changer au redimensionnement ;
- le décor ([`lib/decor.ts`](./lib/decor.ts)) : canard, billes, briques, dé, crayons, toupie, voiture de police et stickers, placés dans le repère du circuit ;
- la piste ([`lib/road.ts`](./lib/road.ts)) : l'asphalte, les fentes entre leurs rails argentés, les glissières, les vibreurs, le bornier, puis à part le pont et le portique START.

À chaque image, on empile le sol, la piste, les fils, les voitures au sol, le pont, puis les voitures sur le pont. Une voiture passe sur le pont un peu avant sa rampe et un peu après (`isOnBridge`) : le tablier a la couleur de la route, il couperait sinon son nez ou sa queue à l'entrée et à la sortie. Toutes les ombres partent vers le bas à droite : la lumière vient de la fenêtre.

**Le composant** ([`day-02-loop.ts`](./day-02-loop.ts)). Il écoute le clavier et les deux boutons, et ne fait tourner la boucle d'animation que s'il y a quelque chose à animer. Il place le circuit, légèrement tourné, sous le HUD et au-dessus du couloir où courent les fils. Il mesure ensuite les boutons pour que les fils les rejoignent par en dessous, sans jamais croiser la piste ; leurs ondulations sont tirées d'une graine, donc fixes. Sur un écran tactile tenu en portrait, toute la scène est tournée d'un quart de tour. Les mesures passent par `offsetLeft` et `offsetTop`, qui ignorent cette rotation. Au départ d'une partie, il demande aussi le plein écran et le verrouillage en paysage, là où le navigateur le permet.

## Lien avec le mot

Le circuit est une boucle fermée que les voitures parcourent indéfiniment, et le huit en est une version qui se croise elle-même. Le jeu aussi est une boucle : la même touche, pressée encore et encore.

## Pour aller plus loin

- Faire décrocher une voiture qui prend un virage trop vite, comme les vraies : ça récompenserait le rythme plutôt que le martelage.
