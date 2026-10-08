import type { DossierModel } from '../lib/model';

/**
 * Les modèles de dossiers du lundi et du mardi. Un modèle = des variables tirées à la graine du jour, des pièces,
 * et les lignes du bordereau. Une ligne = un geste + des paramètres + une condition éventuelle. Les lignes
 * « facultatives » se retirent pour tenir le nombre de lignes du jour ; à partir du mardi, le visa et le cachet
 * du pied de bordereau s'ajoutent tout seuls.
 */
export const DOSSIERS: readonly DossierModel[] = [
  /* ───────── Le tutoriel : le premier dossier du lundi ───────── */
  {
    id: 'prise-de-poste',
    service: 'etat_civil',
    jourMin: 1,
    jourMax: 1,
    tutoriel: true,
    titre: "Formalités de prise de poste de l'agent 7B",
    variables: {},
    pieces: [{ cle: 'fiche', type: 'fiche_installation' }],
    exigences: [
      {
        geste: 'signer',
        cible: 'fiche.signature',
        aide: 'stylo',
        texte:
          "L'agent prendra le stylo dans le pot à crayons et signera la fiche d'installation, dans le cadre prévu.",
      },
      {
        geste: 'tamponner',
        cible: 'fiche.cachet',
        tampon: 'VU',
        aide: 'tampons',
        texte:
          "L'agent saisira le tampon VU au porte-tampons et l'apposera dans le cadre « Cachet » de la même fiche.",
      },
      {
        geste: 'cocher',
        cible: 'fiche.reglement',
        attendu: true,
        texte: "L'agent cochera la case « J'ai pris connaissance du règlement intérieur ».",
      },
      {
        geste: 'memo',
        aide: 'memo',
        texte:
          "L'agent prendra connaissance de la note de service du jour, punaisée au mémo (le survoler).",
      },
      {
        geste: 'transmettre',
        aide: 'sortant',
        texte: "L'agent fermera la chemise par son rabat et la glissera dans le bac Sortant.",
      },
    ],
  },

  /* ───────── Lundi : Logement ───────── */
  {
    id: 'studio-9m2',
    service: 'logement',
    jourMin: 1,
    titre: "Demande de location d'un studio de 9 m²",
    poids: 3,
    variables: {
      groupe: ['O-', 'O-', 'O-', 'O-', 'A+', 'B+', 'AB-', 'O+'],
      cholesterol: { min: 150, max: 280, pas: 5 },
      loyer: { min: 190, max: 520, pas: 10 },
      empreinte: ['oui', 'oui', 'oui', 'non'],
      lot: { min: 1, max: 64 },
      chat: ['Moustache', 'Pompon', 'Réglisse', 'Monsieur Félix', 'Caramel', 'Duchesse'],
    },
    pieces: [
      { cle: 'bail', type: 'bail' },
      { cle: 'sang', type: 'prise_de_sang' },
      { cle: 'chat', type: 'avis_chat' },
      { cle: 'lettre', type: 'lettre_radiateur', decor: true },
    ],
    exigences: [
      {
        geste: 'lire',
        condition: "groupe == 'O-'",
        texte:
          "L'agent vérifiera la compatibilité sanguine du demandeur avec l'immeuble : O négatif exclusivement (règlement de copropriété, art. 7).",
      },
      {
        geste: 'lire',
        condition: 'cholesterol < loyer',
        facultative: true,
        texte: 'Le cholestérol du demandeur, en mg/dL, sera inférieur au loyer, en euros.',
      },
      {
        geste: 'lire',
        condition: "empreinte == 'oui'",
        facultative: true,
        texte: "L'avis favorable du chat du propriétaire portera l'empreinte de sa patte.",
      },
      {
        geste: 'tamponner',
        cible: 'bail.cachet',
        siConditions: true,
        alors: 'IRRECEVABLE',
        sinon: 'CONFORME',
        texte:
          'Si une condition n’est pas remplie, apposer IRRECEVABLE sur le bail. Sinon, CONFORME.',
      },
      {
        geste: 'cocher',
        cible: 'bail.radiateur',
        attendu: true,
        facultative: true,
        texte:
          'Cocher « Le radiateur a pris connaissance du dossier » (le radiateur est copropriétaire, art. 12).',
      },
    ],
  },
  {
    id: 'chauffage-collectif',
    service: 'logement',
    jourMin: 1,
    titre: 'Demande de raccordement au chauffage collectif',
    poids: 2,
    variables: { etage: [1, 2, 2, 3, 3, 4, 5, 7] },
    pieces: [
      { cle: 'formulaire', type: 'formulaire_chauffage' },
      { cle: 'lettre', type: 'lettre_radiateur' },
    ],
    exigences: [
      {
        geste: 'tamponner',
        cible: 'lettre.cachet',
        tampon: 'VU',
        texte:
          "L'agent apposera VU sur la lettre de motivation adressée au radiateur, en preuve de lecture par ce dernier.",
      },
      {
        geste: 'tamponner',
        cible: 'formulaire.cachet',
        si: 'etage > 3',
        alors: 'IRRECEVABLE',
        sinon: 'APPROUVE',
        texte:
          'La chaleur ne monte pas au-delà du 3e étage : IRRECEVABLE au-dessus, APPROUVÉ sinon (sur le formulaire).',
      },
      {
        geste: 'cocher',
        cible: 'formulaire.radiateur',
        attendu: true,
        facultative: true,
        texte: 'Cocher « Le radiateur a pris connaissance du dossier ».',
      },
    ],
  },

  /* ───────── Lundi : État civil ───────── */
  {
    id: 'renouvellement-cni',
    service: 'etat_civil',
    jourMin: 1,
    titre: "Renouvellement de carte nationale d'identité",
    poids: 3,
    variables: {
      filigranes: [2, 2, 2, 1],
      naissance: { annees: [1931, 2004] },
      motif: [
        'Carte usée par excès de présentation',
        'Photo devenue ressemblante',
        "Changement d'humeur",
        'Carte lavée à 60 °C',
        'Perte de la carte dans la carte',
      ],
    },
    pieces: [
      { cle: 'formulaire', type: 'formulaire_cni' },
      { cle: 'acte', type: 'acte_naissance' },
      { cle: 'copie', type: 'copie_cni' },
    ],
    exigences: [
      {
        geste: 'tamponner',
        cible: 'acte.cachet',
        tampon: 'CONFORME',
        texte:
          "La signature du demandeur, apposée le jour de sa naissance, fait foi : l'agent apposera CONFORME sur l'acte, quel qu'en soit l'aspect.",
      },
      {
        geste: 'tamponner',
        cible: 'formulaire.cachet',
        si: 'filigranes != 2',
        alors: 'IRRECEVABLE',
        sinon: 'APPROUVE',
        texte:
          'La carte sera fournie en photocopie de photocopie : deux filigranes COPIE exigés. À défaut, IRRECEVABLE sur le formulaire ; sinon, APPROUVÉ.',
      },
      {
        geste: 'signer',
        cible: 'formulaire.visa',
        sens: 'rtl',
        facultative: true,
        texte:
          "L'agent signera le formulaire de droite à gauche, conformément à la circulaire sur l'égalité des sens de lecture.",
      },
    ],
  },
  {
    id: 'attestation-honneur',
    service: 'etat_civil',
    jourMin: 1,
    titre: "Enregistrement d'une attestation sur l'honneur",
    poids: 2,
    variables: {
      objet: [
        "avoir changé d'adresse sans changer de domicile",
        'ne posséder aucune deuxième chaussette gauche',
        'être la personne qui signe la présente',
        "n'avoir jamais menti, sauf à l'instant",
        'résider à mi-temps chez sa propre sœur',
      ],
    },
    pieces: [
      { cle: 'attestation', type: 'attestation_honneur' },
      { cle: 'honnetete', type: 'attestation_honnetete' },
    ],
    exigences: [
      {
        geste: 'signer',
        cible: 'honnetete.signature',
        texte:
          "L'agent visera d'abord l'attestation de l'honnêteté de l'attestation : la seconde en premier.",
      },
      {
        geste: 'signer',
        cible: 'attestation.signature',
        apres: 'honnetete.signature',
        texte: "Puis, et seulement puis, il visera l'attestation sur l'honneur.",
      },
      {
        geste: 'tamponner',
        cible: 'attestation.cachet',
        tampon: 'VU',
        facultative: true,
        texte: "Apposer VU sur l'attestation sur l'honneur.",
      },
    ],
  },
  {
    id: 'changement-prenom',
    service: 'etat_civil',
    jourMin: 1,
    titre: 'Demande de changement de prénom',
    poids: 2,
    variables: {
      nouveau: [
        'Jo',
        'Eugénie-Hortense',
        'Lou',
        'Maximilien',
        'Bob',
        'Marie-Antoinette',
        'Ugo',
        'Cunégonde',
      ],
      raison: [
        'Confusion avec un collègue',
        'Prénom actuel trop porté par le voisin',
        'Lassitude',
        "Conseil d'un horoscope",
      ],
    },
    pieces: [
      { cle: 'formulaire', type: 'formulaire_prenom' },
      { cle: 'renonciation', type: 'renonciation' },
    ],
    exigences: [
      {
        geste: 'cocher',
        cible: 'renonciation.contradictoire',
        attendu: true,
        annuler: true,
        texte: 'Cocher la case « Je ne coche pas cette case ».',
      },
      {
        geste: 'tamponner',
        cible: 'formulaire.cachet',
        si: 'len(nouveau) > len(prenom)',
        alors: 'IRRECEVABLE',
        sinon: 'APPROUVE',
        texte:
          "Par économie d'encre, un prénom souhaité plus long que le prénom actuel est IRRECEVABLE. Sinon, APPROUVÉ (sur le formulaire).",
      },
      {
        geste: 'signer',
        cible: 'formulaire.visa',
        sens: 'rtl',
        facultative: true,
        texte:
          "L'agent signera de droite à gauche, conformément à la circulaire sur l'égalité des sens de lecture.",
      },
    ],
  },

  /* ───────── Mardi : Crédit et Finances ───────── */
  {
    id: 'pret-immobilier',
    service: 'credit',
    jourMin: 2,
    titre: 'Prêt immobilier',
    poids: 3,
    variables: {
      montant: [140000, 95000, 210000, 68000, 175000, 123456],
      objet: [
        'un T2 sous les toits',
        'une maison de garde-barrière',
        'un studio sans fenêtre',
        'un pavillon témoin',
      ],
      calcul: [14, 12.5, 16, 11.5, 13, 9, 18, 12],
      recitation: [8, 11, 15, 19, 6],
      conduite: ['Bavard', 'Rêveur', 'Exemplaire', 'Insolent avec la règle graduée'],
      appreciation: [
        'Compte sur ses doigts, et sur ceux du voisin.',
        'Peut mieux faire, et le sait.',
        'Élève sérieux, trop.',
      ],
      annee_ce2: ['1986-1987', '1991-1992', '1978-1979'],
      fidelite: [10, 10, 10, 9],
      ticket: { dateDe: 'depot', plus: '-1' },
      ref: { min: 10000, max: 99999 },
    },
    pieces: [
      { cle: 'offre', type: 'offre_pret' },
      { cle: 'demande', type: 'demande_pret' },
      { cle: 'ce2', type: 'bulletin_ce2' },
      { cle: 'fidelite', type: 'carte_fidelite' },
      { cle: 'ticket', type: 'ticket_baguette', decor: true },
    ],
    exigences: [
      {
        geste: 'ecrire',
        cible: 'offre.montant',
        valeur: '{montant}',
        texte:
          "Recopier le montant sollicité dans la case « Montant » de l'offre (voir la demande manuscrite).",
      },
      {
        geste: 'tamponner',
        cible: 'offre.decision',
        si: 'calcul < 12',
        alors: 'IRRECEVABLE',
        sinon: 'APPROUVE',
        facultative: true,
        exclusif: 'decision',
        texte:
          "Moyenne de calcul mental au CE2 : 12/20 au moins (risque d'erreur sur les mensualités). À défaut, IRRECEVABLE sur l'offre ; sinon, APPROUVÉ.",
      },
      {
        geste: 'tamponner',
        cible: 'offre.decision',
        si: 'fidelite < 10',
        alors: 'IRRECEVABLE',
        sinon: 'APPROUVE',
        facultative: true,
        exclusif: 'decision',
        texte:
          "Preuve de stabilité : la carte de fidélité de la boulangerie portera 10 tampons, l'agent ne la complète pas. À défaut, IRRECEVABLE ; sinon, APPROUVÉ.",
      },
      {
        geste: 'tamponner',
        cible: 'offre.recu',
        tampon: 'RECU_LE',
        date: 'demain',
        facultative: true,
        texte:
          "Tampon REÇU LE sur l'offre. Antidater est interdit, postdater est obligatoire : au lendemain.",
      },
    ],
  },
  {
    id: 'bourse',
    service: 'credit',
    jourMin: 2,
    titre: "Demande de bourse d'études",
    poids: 2,
    variables: {
      age: { min: 19, max: 67 },
      etudes: [
        'Licence de philatélie',
        'BTS en attente',
        'Doctorat de sieste comparée',
        "CAP d'archiviste",
      ],
      annee: [2027],
      etabli: { dateDe: 'date', plus: '343' },
      rfr: { min: 8000, max: 42000, pas: 10 },
    },
    pieces: [
      { cle: 'formulaire', type: 'formulaire_bourse' },
      { cle: 'avis', type: 'avis_imposition', absente: true },
    ],
    exigences: [
      {
        geste: 'joindre',
        piece: 'avis',
        aide: 'archives',
        texte:
          "Joindre l'avis d'imposition {annee} du demandeur, établi le {etabli} (Archives, classé à l'année prochaine).",
      },
      {
        geste: 'ecrire',
        cible: 'formulaire.rfr',
        valeur: '{rfr}',
        facultative: true,
        texte: "Recopier le revenu fiscal de référence de l'avis dans le formulaire.",
      },
      {
        geste: 'tamponner',
        cible: 'bordereau.cachet',
        tampon: 'VU',
        rotation: 45,
        facultative: true,
        texte:
          'Le cachet du service sera apposé à 45 degrés, sens horaire, en hommage au fondateur.',
      },
    ],
  },
  {
    id: 'location-47-ans',
    service: 'logement',
    jourMin: 2,
    titre: 'Location avec garantie parentale',
    poids: 2,
    variables: {
      age: { min: 44, max: 53 },
      pere: { personne: 'famille' },
      mere: { personne: 'famille' },
      papy: { personne: 'famille' },
      salaire_pere: { min: 1200, max: 3900, pas: 10 },
      salaire_mere: { min: 1200, max: 3900, pas: 10 },
      salaire_papy: { min: 600, max: 1400, pas: 10 },
    },
    pieces: [
      { cle: 'formulaire', type: 'formulaire_location' },
      {
        cle: 'bulletin_mere',
        type: 'bulletin_salaire',
        valeurs: {
          salarie: 'mere',
          salaire: 'salaire_mere',
          mois: "'AOÛT'",
          employeur: "'Fauvel et Fils'",
          emploi: "'Comptable'",
        },
      },
      {
        cle: 'bulletin_pere',
        type: 'bulletin_salaire',
        valeurs: {
          salarie: 'pere',
          salaire: 'salaire_pere',
          mois: "'AOÛT'",
          employeur: "'Ribot'",
          emploi: "'Contrôleur de contrôleurs'",
        },
      },
      {
        cle: 'bulletin_papy',
        type: 'bulletin_salaire',
        decor: true,
        valeurs: {
          salarie: 'papy',
          salaire: 'salaire_papy',
          mois: "'JUIN 1971'",
          employeur: "'Houillères'",
          emploi: "'Mineur de fond'",
        },
      },
    ],
    exigences: [
      {
        geste: 'ecrire',
        cible: 'formulaire.salaire',
        valeur: '{salaire_pere}',
        texte:
          'Recopier le salaire net du père du demandeur (bulletin de salaire) dans le formulaire.',
      },
      {
        geste: 'tamponner',
        cible: 'formulaire.recu',
        tampon: 'RECU_LE',
        date: 'jour',
        facultative: true,
        texte: 'Tampon REÇU LE à la date du jour sur le formulaire.',
      },
    ],
  },
  {
    id: 'pret-zone-inondable',
    service: 'credit',
    jourMin: 2,
    titre: 'Prêt pour un rez-de-chaussée en zone inondable',
    poids: 2,
    variables: {
      distance: [25, 25, 25, 10],
      obtention: { annees: [1962, 2015] },
      mention: ['Têtard', 'Grenouille', 'Dauphin', 'Petit phoque'],
    },
    pieces: [
      { cle: 'formulaire', type: 'formulaire_pret_rdc' },
      { cle: 'diplome', type: 'diplome_natation' },
    ],
    exigences: [
      {
        geste: 'ecrire',
        cible: 'formulaire.natation',
        valeur: '{obtention}',
        texte: "Recopier la date d'obtention du diplôme de natation dans le formulaire.",
      },
      {
        geste: 'tamponner',
        cible: 'formulaire.decision',
        si: 'distance < 25',
        alors: 'IRRECEVABLE',
        sinon: 'APPROUVE',
        facultative: true,
        texte:
          'Le diplôme attestera 25 mètres au moins. À défaut, IRRECEVABLE sur le formulaire ; sinon, APPROUVÉ.',
      },
    ],
  },
  {
    id: 'pret-etudiant',
    service: 'credit',
    jourMin: 2,
    titre: 'Prêt étudiant garanti',
    poids: 2,
    variables: { garant: { personne: 'complet' } },
    pieces: [
      { cle: 'formulaire', type: 'formulaire_pret_etudiant' },
      { cle: 'flacon', type: 'flacon_sueur' },
    ],
    exigences: [
      {
        geste: 'tamponner',
        cible: 'flacon.etiquette',
        tampon: 'VU',
        exclusif: 'flacon',
        texte:
          "L'échantillon de sueur du garant ne sera pas ouvert : l'agent apposera VU sur l'étiquette du flacon scellé.",
      },
      {
        geste: 'tamponner',
        cible: 'flacon.etiquette',
        tampon: 'VU',
        superposes: 3,
        exclusif: 'flacon',
        texte:
          "Le tampon VU de l'étiquette (flacon scellé, ne pas ouvrir) sera lui-même revêtu du tampon VU, jusqu'à épuisement du doute : trois VU superposés.",
      },
      {
        geste: 'cocher',
        cible: 'formulaire.solidaire',
        attendu: true,
        facultative: true,
        texte: 'Cocher « Le garant transpire de manière solidaire ».',
      },
    ],
  },
  {
    id: 'aspirateur',
    service: 'credit',
    jourMin: 2,
    titre: "Remboursement d'un aspirateur",
    poids: 2,
    variables: {
      transaction: { min: 100000, max: 999999 },
      ecart: [0, 0, 0, 7, 13],
      transaction2: { expr: 'transaction + ecart' },
    },
    pieces: [
      { cle: 'formulaire', type: 'formulaire_remboursement' },
      { cle: 'ticket', type: 'ticket_aspirateur' },
      { cle: 'preuve', type: 'preuve_preuve' },
    ],
    exigences: [
      {
        geste: 'tamponner',
        cible: 'formulaire.cachet',
        si: 'ecart != 0',
        alors: 'IRRECEVABLE',
        sinon: 'CONFORME',
        texte:
          "La preuve d'achat et la preuve d'achat de la preuve d'achat porteront le même numéro de transaction. À défaut, IRRECEVABLE ; sinon, CONFORME.",
      },
      {
        geste: 'tamponner',
        cible: 'formulaire.recu',
        tampon: 'RECU_LE',
        date: 'demain',
        facultative: true,
        texte:
          'Tampon REÇU LE, postdaté au lendemain : antidater est interdit, postdater est obligatoire.',
      },
    ],
  },
  {
    id: 'certificat-residence',
    service: 'etat_civil',
    jourMin: 2,
    titre: 'Demande de certificat de résidence',
    poids: 2,
    variables: {
      decalage: [0, 0, 0, -1, 2],
      ticket: { dateDe: 'depot', plus: 'decalage' },
    },
    pieces: [
      { cle: 'formulaire', type: 'certificat_residence' },
      { cle: 'ticket', type: 'ticket_baguette' },
      { cle: 'blanche', type: 'page_blanche' },
    ],
    exigences: [
      {
        geste: 'tamponner',
        cible: 'formulaire.cachet',
        si: 'decalage != 0',
        alors: 'IRRECEVABLE',
        sinon: 'APPROUVE',
        texte:
          'Le ticket de la baguette sera daté du jour du dépôt, inscrit sur la chemise. À défaut, IRRECEVABLE sur la demande ; sinon, APPROUVÉ.',
      },
      {
        geste: 'parapher',
        cible: 'blanche.paraphe',
        facultative: true,
        texte:
          'Parapher la page laissée blanche pour des raisons de sécurité, dans sa case de paraphe.',
      },
    ],
  },
];
