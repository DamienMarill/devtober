/**
 * Le mémo punaisé au mur : le garant de la lisibilité. Toute règle du jeu est écrite ici ou sur une pièce,
 * sans exception.
 */
export const REGLES = [
  { n: 1, jour: 1, texte: "Une case contradictoire se coche, puis s'annule d'un tampon ANNULÉ." },
  {
    n: 2,
    jour: 1,
    texte: "Entre deux clauses contradictoires, la plus récemment datée l'emporte.",
  },
  { n: 3, jour: 1, texte: 'Tout retour doit être revêtu du tampon VU.' },
  { n: 4, jour: 2, texte: "Un tampon raté s'annule par un tampon ANNULÉ lui-même conforme." },
] as const;

/** La note de service punaisée à 9 h, une par journée. */
export const NOTES: Record<number, { n: number; titre: string; lignes: readonly string[] }> = {
  1: {
    n: 1,
    titre: 'Prise de poste',
    lignes: [
      'Bienvenue au guichet 7B. Les dossiers arrivent sur la pile, à gauche : un clic (ou Espace) pour prendre celui du dessus.',
      'Chaque pièce se déplace, se superpose, se retourne (double-clic). Clic droit maintenu : la loupe.',
      "Un tampon fait trois empreintes nettes, puis il faut le réencrer à l'encreur. La molette le fait pivoter.",
      "La pile s'effondre au-delà de la ligne rouge et demie. Le service décline toute responsabilité.",
      "Aujourd'hui, et aujourd'hui seulement, une coche verte valide chaque exigence.",
    ],
  },
  2: {
    n: 14,
    titre: 'Les Archives',
    lignes: [
      "Le pied de chaque bordereau porte désormais une case « Visa de l'agent » et une case « Cachet du service » (tampon VU). Elles comptent comme deux exigences.",
      'Les pièces manquantes sont aux Archives (armoire, en bas à droite). La bonne pièce a le bon type, le bon nom et la bonne date.',
      'Le tampon REÇU LE se règle à ses molettes : clic gauche +1, clic droit −1.',
      'Certains dossiers peuvent revenir sans motif apparent. Le service rappelle que ce n’est pas une raison.',
    ],
  },
};

/** Le post-it du chef, collé sur le premier retour sans motif du lundi. */
export const POSTIT_CHEF = 'Tout retour doit être revêtu du tampon VU. — Le Chef';
