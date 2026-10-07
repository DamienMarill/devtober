# Jour 7 : Swarm

![Aperçu](./preview.gif)

Un mini-jeu de gestion au poste de régulation du tram de Montpellier : pendant un mercredi, de 6 h à 0 h 30, je répartis 83 rames entre les 5 lignes pour que les foules ne débordent pas des quais.

## L'idée

J'ai pris « Swarm » à contre-pied : pas d'étourneaux ni d'abeilles, mais la foule de l'heure de pointe. Le tram est gratuit pour les habitants de la Métropole depuis décembre 2023, et ça se voit sur les quais. Le réseau est réel : les 107 stations, les couleurs, les temps de parcours et le nombre de rames en ligne heure par heure viennent du GTFS de la TaM. Les événements de la journée sont inventés.

## Comment c'est codé

**Les données.** [`tools/gtfs.mjs`](./tools/gtfs.mjs) lit le GTFS dézippé et écrit [`lib/network-data.ts`](./lib/network-data.ts). Il fusionne les quais d'une même station qui portent des noms différents (Gare Saint-Roch et République, par exemple), garde les parcours complets, prend le temps médian entre deux stations et compte les rames en service grâce au `block_id` des courses : 56 vers 6 h 30, 83 vers 8 h 30.

**La carte.** [`lib/network.ts`](./lib/network.ts) projette les coordonnées en kilomètres autour de la Comédie, puis applique une loupe `r' = r0 · asinh(r / r0)` qui grossit le centre, où la Comédie, la gare Saint-Roch et l'Observatoire sont à environ 300 m les unes des autres. Sur les tronçons partagés, comme Gare–Comédie–Corum pour la 1 et la 2, les lignes sont décalées côte à côte.

**Les itinéraires.** [`lib/routing.ts`](./lib/routing.ts) lance un Dijkstra sur les états (parcours, rang), avec 5 minutes de pénalité par correspondance, et précalcule les 107 × 107 trajets.

**La simulation.** [`lib/sim.ts`](./lib/sim.ts) avance par pas fixes de 3 secondes simulées. La demande ([`lib/demand.ts`](./lib/demand.ts)) dépend du type de station (domicile, fac, centre, bureaux…) et de l'offre réelle de ses lignes. Hors terminus, un quai n'accueille qu'une rame à la fois, et l'arrêt dure tant que des gens montent (2 minutes au plus) : plus la foule est grosse, plus la rame traîne et plus les suivantes la rattrapent. Un voyageur ne monte que si la rame va vers sa prochaine descente :

```ts
serves(tram: Tram, leg: Leg): boolean {
  if (leg.line !== tram.line.id) return false;
  if (tram.path.loop) return leg.dir === tram.path.dir;
  return tram.path.rank[leg.to] > tram.k;
}
```

Après 16 à 26 minutes d'attente, il abandonne et finit à pied.

**L'essaim.** Dans [`lib/swarm.ts`](./lib/swarm.ts), un point représente 10 voyageurs. Chaque point à quai est tiré vers sa station et repoussé par ses voisins (cherchés dans une grille de hachage), avec un peu d'agitation. Les montées et les descentes sont de petites trajectoires animées. Le rendu ([`lib/render.ts`](./lib/render.ts)) est un canvas 2D dont le fond, les lignes et les étiquettes sont en cache.

**L'équilibrage.** Une journée se simule sans rendu en une demi-seconde, de quoi régler la demande. Sans toucher à rien, on finit à 8/20 ; le pilote automatique ([`lib/autopilot.ts`](./lib/autopilot.ts)) fait 14,5/20, et le bilan rappelle sa note pour comparer. Le fil du PC ([`lib/feed.ts`](./lib/feed.ts)) reste sobre, avec au plus une réplique taquine toutes les 75 minutes de jeu.

## Lien avec le mot

L'essaim est partout : les nuées colorées qui gonflent autour des stations, la sortie du match qui déborde du quai de la Mosson, et même les rames qui finissent par rouler en paquets. Le joueur n'a qu'un levier sur ce comportement collectif, le nombre de rames par ligne, et doit anticiper : une rame met cinq minutes à sortir du dépôt.

## Pour aller plus loin

- Laisser le joueur choisir la branche de la 3 au départ de Juvignac, ou retenir une rame en station pour casser un paquet.
- Sources : le [GTFS de la TaM](https://transport.data.gouv.fr/datasets/offre-de-transport-tam-en-temps-reel-gtfs-rt-urbain-et-suburbain) sur transport.data.gouv.fr, et le phénomène des [bus qui se suivent](https://en.wikipedia.org/wiki/Bus_bunching).
