---
name: day-readme
description: Rédige ou met à jour le README d'un jour du Devtober (days/day-XX-mot/README.md) à partir du code du composant Angular. À utiliser dès qu'un jour est créé ou modifié, ou quand on demande de « documenter le jour X », « écrire le README du jour », « expliquer le code du jour ».
---

# README d'un jour du Devtober

Chaque jour du Devtober est un composant Angular dans `days/day-XX-mot/`. Son `README.md` explique le code et le lien avec le mot du jour. Il est lu à deux endroits :

- sur GitHub, dans le dossier du jour ;
- dans le site, via le bouton « Comment c'est codé ? » en haut à droite de la barre de navigation, qui l'affiche dans une modale (Markdown converti en HTML par `marked`, GFM activé).

## Étapes

1. **Identifier le jour.** À partir du numéro ou du mot demandé, trouve le dossier `days/day-XX-mot/` (la liste des mots est dans `src/app/days.ts`). S'il n'existe pas, propose `npm run new-day -- <numéro>` au lieu de le créer à la main.
2. **Lire tout le code du dossier** : le composant `day-XX-mot.ts`, ses templates, styles et fichiers annexes (shaders, utilitaires, données). Si le dossier contient un `preview.gif` ou un `preview.png`, note-le.
3. **Comprendre avant d'écrire** : ce que l'utilisateur voit et peut faire, la technique principale (canvas 2D, SVG, WebGL, CSS, signals…), l'algorithme ou l'astuce centrale, ce qui fait le lien avec le mot.
4. **Écrire `README.md`** selon le modèle ci-dessous, en remplaçant le squelette généré par `new-day` s'il est encore là.
5. **Ne touche à rien d'autre** : ni au composant, ni à `days/registry.ts`, ni au routing.

## Modèle

```markdown
# Jour 3 : Bloom

![Aperçu](./preview.gif) ← seulement si le fichier existe dans le dossier

Une phrase qui dit ce qu'on voit et ce qu'on peut faire.

## L'idée

Comment le mot a été interprété, en 2 à 4 phrases.

## Comment c'est codé

Les étapes du code dans l'ordre où elles s'exécutent : mise en place, boucle d'animation ou réactivité, interactions.
Un ou deux extraits courts (10 lignes max chacun) pour les passages clés, avec le langage du bloc (`ts`, `html`, `css`, `glsl`).
Cite les fichiers avec un lien relatif : [`day-03-bloom.ts`](./day-03-bloom.ts).

## Lien avec le mot

En quoi la création incarne le mot : le comportement, le visuel, l'interaction.

## Pour aller plus loin

Une ou deux pistes d'amélioration, ou les ressources qui ont servi (liens externes).
```

## Règles

- **En français**, avec les accents. Ton direct, à la première personne (« j'ai utilisé… »). Le lecteur est un autre étudiant : explique les notions non évidentes sans jargon gratuit.
- **Concis** : 250 à 600 mots. Le README accompagne le code, il ne le recopie pas.
- **Exact** : ne décris que ce que le code fait vraiment. Pas de fonctionnalité inventée, pas de chiffre de performance non mesuré.
- **Liens relatifs** vers les fichiers du dossier (`./fichier.ts`). Dans la modale, ils sont réécrits automatiquement vers GitHub (et les images vers `raw.githubusercontent.com`), donc ils marchent aux deux endroits.
- **Pas de HTML brut** dans le Markdown : la modale passe par le sanitizer d'Angular, qui retire scripts, styles et attributs non sûrs.
- **Pas d'image qui n'existe pas** : n'inclus `![Aperçu](./preview.gif)` que si le fichier est dans le dossier. Sinon, indique à l'utilisateur qu'il peut en ajouter un pour le post #devtober.
- Le titre H1 garde la forme `# Jour N : Mot`.

## Vérification

Après écriture, relis le README en le confrontant au code (noms de fonctions, fichiers cités, comportement décrit). Si `npm start` tourne, ouvre `http://localhost:4200/day-XX-mot` et clique sur l'icône livre en haut à droite pour voir le rendu dans la modale.
