# Jour 9 : est-ce que la physique est juste ?

La simulation confrontée aux sources : le guide utilisateur de l'ESA pour les vols paraboliques, le CNES, la NASA et la réglementation de certification des avions de ligne. Les chiffres « simulation » viennent du pilote automatique ; les tests de [`lib/autopilot.spec.ts`](./lib/autopilot.spec.ts), [`lib/flight.spec.ts`](./lib/flight.spec.ts) et [`lib/cabin.spec.ts`](./lib/cabin.spec.ts) les vérifient.

## L'apesanteur commence en montée

On a envie de penser que l'apesanteur arrive quand l'avion redescend. En fait, elle commence pendant que l'avion monte encore. Le guide de l'ESA le dit : à 7 500 m, avec une pente d'environ 47° et 650 km/h, les pilotes réduisent la poussée juste assez pour compenser la traînée, et « l'avion suit alors une trajectoire balistique de chute libre ». Le sommet n'arrive qu'après, vers 8 500 m.

« Chute libre » ne veut pas dire « descendre ». Ça veut dire que la seule force qui agit, c'est la gravité : l'avion accélère de g vers le bas, et c'est tout. Une balle lancée vers le haut est en chute libre dès qu'elle quitte la main, à la montée comme à la descente. L'avion fait pareil. Ses passagers aussi, avec lui, à la même accélération : rien ne les presse contre le plancher, et ils flottent.

L'avion ne tombe donc pas « plus vite que la gravité ». S'il le faisait, s'il accélérait vers le bas de plus de g, les passagers seraient plaqués au plafond : c'est ce que le compteur affiche sous zéro.

Dans la simulation, la chute libre commence à 7 670 m, en montée à 50° de pente et +121 m/s de vitesse verticale, et finit en descente. Pendant toute la phase, l'accélération de l'avion vaut g vers le bas, à 0,05 g près (test « l'apesanteur, c'est la chute libre »).

## Le compteur peut-il passer sous zéro ?

Oui. Il affiche ce que mesure un accéléromètre, c'est-à-dire ce qu'on ressent : toutes les forces sauf le poids (portance, traînée, poussée), dans les axes de la cabine. En chute libre parfaite, il lit 0. S'il lit moins que 0, c'est que l'avion pousse vers le bas un peu plus que la chute libre : les objets montent vers le plafond.

C'est normal en vol réel. Selon le guide de l'ESA, pendant l'apesanteur, le g résiduel oscille entre −0,02 et +0,02 g sur l'axe vertical, avec des pointes à ±0,05 g, et reste entre −0,01 et +0,01 g sur les deux autres axes. La simulation retrouve ça grâce à la turbulence : un écart type de 0,01 g, 96 % du temps entre −0,02 et +0,02 g, des pointes à ±0,05 g, et ±0,0004 g sur l'axe longitudinal.

Si on pousse le manche plus fort, on peut descendre jusqu'à −1 g. C'est la limite de structure des avions de transport (CS-25, comme la règle américaine 14 CFR 25.337 : pas moins de −1,0 g, pas moins de +2,5 g en positif). Les protections de la simulation s'arrêtent là.

## Le profil, chiffre par chiffre

| Grandeur       | Sources                                                                  | Simulation                                 |
| -------------- | ------------------------------------------------------------------------ | ------------------------------------------ |
| Palier         | 6 000 m, 810 km/h (ESA)                                                  | 6 000 m, 810 km/h                          |
| Ressource      | environ 20 s à 1,5–1,8 g (ESA)                                           | 20 s, jusqu'à 1,9 g                        |
| Injection      | vers 7 500 m, environ 47°, 650 km/h (ESA) ; nez vers 50° (ESA, eoPortal) | 7 670 m, pente 50°, assiette 48°, 570 km/h |
| Sommet         | vers 8 500 m, environ 390 km/h (ESA)                                     | 8 410 m, 368 km/h                          |
| Apesanteur     | environ 20 s (ESA), 20 à 22 s (CNES), jusqu'à 23 s (Pletser, 2016)       | 21,5 s sous 0,05 g                         |
| Sortie         | −42° (CNES), environ −45° (ESA), 1,5–1,8 g                               | ordre à −42°, de 1,5 à 1,9 g               |
| g résiduel     | ±0,02 g, pointes à ±0,05 g (ESA)                                         | écart type 0,01 g, pointes à 0,05 g        |
| Hauteur cabine | 2,3 m (ESA)                                                              | 2,3 m                                      |

Les chiffres de l'ESA sont des valeurs rondes, tirées d'un schéma, et ne collent pas exactement entre eux. Sur une vraie parabole, la vitesse horizontale ne change pas : partir à 650 km/h avec 47° de pente donne 443 km/h au sommet, pas 390, et un sommet à 8 390 m. La simulation conserve l'énergie, elle ne peut donc pas tous les atteindre. Elle arrive à l'injection avec 2,4 % d'énergie en moins que les chiffres de l'ESA : avec la poussée que le modèle donne aux deux réacteurs à cette altitude (environ 205 kN, une hypothèse), on n'a pas plus.

## Ce qui est sourcé, ce qui est supposé

**Sourcé** :

- l'atmosphère type, vérifiée à moins de 1 % du modèle de troposphère de la NASA ;
- la gravité qui baisse avec l'altitude, g₀·(R / (R + h))² (loi de Newton) ;
- la correction de compressibilité de Prandtl-Glauert ;
- pour l'A310 : 219 m² de surface alaire, deux CF6-80C2A2 de 238 kN, 80 t à vide, 157 t au maximum pour la version Zero G ;
- les facteurs de charge limites (+2,5 et −1 g) ;
- le profil, la hauteur de la zone d'expérience et les annonces « pull-up, injection, pull-out » (ESA).

**Supposé** :

- la masse en vol (110 t) ;
- la polaire de traînée (CD0 = 0,019, k = 0,042, soit un coefficient d'Oswald de 0,86) ;
- la pente de portance et l'incidence de portance nulle ;
- la baisse de poussée avec l'altitude et le Mach ;
- l'incidence de décrochage (13°) ;
- la turbulence (rafales de 0,35 m/s) ;
- le centre de gravité, placé au milieu de la cabine, au plancher.

Ces réglages ont été choisis pour retrouver le profil ci-dessus, Novespace ne les publie pas.

**Simplifié** :

- le vol est plan (ni roulis ni lacet) ;
- l'avion est rigide ;
- l'incidence suit le manche avec un retard du premier ordre, au lieu d'une vraie dynamique de tangage ;
- la poussée est dans l'axe du fuselage ;
- le mécanicien qui gère les gaz est parfait.

## La cabine tourne

Pendant l'apesanteur, l'avion bascule de +48° à −42° d'assiette. Au sommet, il tourne à environ 5°/s : sa trajectoire s'incurve de g·cos γ / V = 9,8 / 102 ≈ 0,096 rad/s. Un objet qui flotte garde son orientation dans l'espace. Vu de la cabine, il semble donc tourner, et il subit les forces d'inertie d'un repère tournant (centrifuge, Coriolis, Euler), de l'ordre du millième de g. [`lib/cabin.ts`](./lib/cabin.ts) les applique. Un test vérifie que, vu de l'extérieur, un objet libre file bien en ligne droite.

## Sources

- ESA, Erasmus User Guide, chapitre 5, [« Parabolic Flights »](https://wsn.spaceflight.esa.int/docs/EUG2LGPr3/EUG2LGPr3-5-ParabolicFlights.pdf) : profil, durées, g résiduel, hauteur de la cabine, annonces.
- CNES, [« Parabole, c'est quoi ? »](https://cnes.fr/education/parabole) : profil, rôle des trois pilotes, explication de la chute libre.
- eoPortal, [« Airbus A310 Zero-G »](https://www.eoportal.org/other-space-activities/airbus-a310-zero-g) : masse maximale, dimensions, nez vers 50°.
- NASA, [« Parabolic Flight »](https://www.nasa.gov/mission/parabolic-flight/) : « l'avion tombe à la même vitesse que les passagers ».
- V. Pletser et al., [« The First European Parabolic Flight Campaign with the Airbus A310 ZERO-G »](https://www.researchgate.net/publication/306331485_The_First_European_Parabolic_Flight_Campaign_with_the_Airbus_A310_ZERO-G), Microgravity Science and Technology, 2016 (résumé : jusqu'à 23 s).
- [14 CFR 25.337](https://www.law.cornell.edu/cfr/text/14/25.337), facteurs de charge limites de manœuvre (équivalent de la CS 25.337 de l'EASA).
- NASA Glenn Research Center, [« Earth Atmosphere Model »](https://www.grc.nasa.gov/www/k-12/airplane/atmosmet.html).
- [Aerospaceweb, Airbus A310](https://aerospaceweb.org/aircraft/jetliner/a310/) : surface alaire, moteurs, poussée, masses.
- J. D. Anderson, _Fundamentals of Aerodynamics_, McGraw-Hill : règle de Prandtl-Glauert, polaire parabolique.
