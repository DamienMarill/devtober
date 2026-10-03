# Jour 3 : Bloom

Un tunnel de cerisiers en fleur au-dessus du canal Suimon, à Ōgaki : le ciel, la lumière, la pluie et le vent suivent en direct l'heure et la météo de là-bas.

## L'idée

Ōgaki est la ville où se passe *Koe no Katachi*, et le pont Mitokoi celui du film. Je voulais une fenêtre ouverte sur ce canal au printemps : on lève les yeux, les fleurs cachent tout, le pont flotte dans une trouée et les montagnes de l'ouest apparaissent au fond. Ce qu'on voit, c'est ce que verrait quelqu'un sur place au même moment. Seule licence : les cerisiers sont toujours en fleur, même en octobre.

## Comment c'est codé

La scène est un empilement de plans, du fond vers l'avant :
- le ciel ([`art/sky.ts`](./art/sky.ts)) ;
- les montagnes en SVG ([`lib/mountains.ts`](./lib/mountains.ts)) ;
- le pont ([`lib/bridge.ts`](./lib/bridge.ts)), modélisé en mètres avec sa propre caméra : droit, il traverse tout le cadre derrière les fleurs et s'élargit au milieu en un carré, comme le balcon du film ;
- quatre calques de cerisiers sur canvas ;
- deux canvases de pétales et de pluie, l'un derrière les branches proches, l'autre devant.

Une caméra ([`lib/camera.ts`](./lib/camera.ts)) recadre le tout pour garder le pont visible, du téléphone en portrait à l'écran ultra-large.

Les arbres ([`lib/sakura.ts`](./lib/sakura.ts)) poussent à partir d'une graine : tronc, charpentières qui ploient sous leur poids, rameaux en zigzag, puis des bouquets de 2 à 5 fleurs. Pour suivre mon croquis, deux polygones ([`lib/composition.ts`](./lib/composition.ts)) délimitent les masses de fleurs. Une branche qui s'approche du bord se détourne, et si elle sort quand même, elle s'arrête en s'effilant :

```ts
if (shape.at(q.x, q.y) < (depth >= 3 ? 0.06 : 0.04)) {
  outside++;
  if (outside > (depth <= 1 ? 1 : 0)) {
    const n = points.length;
    for (let j = Math.max(1, n - 6); j < n; j++)
      points[j].r *= 0.08 + 0.92 * ((n - 1 - j) / 6);
    break;
  }
}
```

Chaque fleur est un sprite dessiné une seule fois : cinq pétales échancrés, cœur, étamines ([`lib/sakura-paint.ts`](./lib/sakura-paint.ts)). Il est ensuite tamponné des dizaines de milliers de fois, tourné et aplati, par tranches de quelques millisecondes par image pour ne pas geler l'animation.

La météo vient d'[Open-Meteo](https://open-meteo.com/), gratuit et sans clé ([`lib/weather.ts`](./lib/weather.ts)), relue toutes les 10 minutes avec `resource()`. Elle fournit :
- le code WMO, qui devient pluie, bruine, neige, brouillard ou orage avec éclairs ;
- la couverture nuageuse ;
- le vent et les rafales ;
- les heures de lever et de coucher.

La lumière, elle, suit la hauteur du soleil que je calcule sur place avec les formules de la NOAA ([`lib/solar.ts`](./lib/solar.ts)). [`lib/look.ts`](./lib/look.ts) en tire toute la palette (ciel, montagnes, pont) sous forme de variables CSS, plus une teinte pour les calques de cerisiers. Le coucher donné par l'API allume les lanternes, qui s'éteignent à 22 h.

Le vent météo dit d'où il vient. Comme on regarde plein ouest, je le projette dans le repère de l'écran ([`lib/wind.ts`](./lib/wind.ts)) :

```ts
const rel = ((from + 180 - heading) * Math.PI) / 180;
return { x: clean(Math.sin(rel) * speed), z: clean(Math.cos(rel) * speed) };
```

Les pétales ([`lib/petals.ts`](./lib/petals.ts)) partent des bouquets, tombent à environ 1 m/s en culbutant et suivent le vent. Une seule boucle `requestAnimationFrame` fait tout bouger ; aucun signal ne change à chaque image.

Le bouton en haut à droite lance une ambiance synthétisée en WebAudio à partir de bruit filtré : rivière, vent, pluie, tonnerre ([`lib/ambience.ts`](./lib/ambience.ts)). La touche T lance une visite d'une journée en 30 secondes. La touche D (ou `?debug` dans l'adresse) ouvre un panneau pour imposer l'heure, la météo et le vent, par exemple `?debug&time=18:40&weather=rain&wind=8,270`.

## Lien avec le mot

Bloom, c'est la floraison, mais aussi la lumière qui bave autour des lanternes la nuit. La canopée elle-même fleurit à l'écran au chargement, calque par calque.

## Pour aller plus loin

- Suivre la vraie saison : des bourgeons en mars, des feuilles vertes en été, rouges en automne.
- Le GIF d'aperçu n'est pas encore là : `npm run gif -- 3` (la capture lance la visite).
