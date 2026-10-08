import type { PieceDef } from '../lib/model';

/**
 * Le catalogue des pièces : justificatifs du demandeur, formulaires, courriers. Le texte est interpolé avec les
 * variables du dossier (`{nom}`, `{depot}`…) et celles de la pièce. Le moteur est sérieux, le contenu est fou :
 * chaque gag est une entrée de ce fichier, et chaque pièce folle porte une valeur à lire ou un cadre à remplir.
 */
export const PIECES: Record<string, PieceDef> = {
  /* ───────── Prise de poste ───────── */
  fiche_installation: {
    id: 'fiche_installation',
    titre: "Fiche d'installation de l'agent",
    format: 'a4',
    poids: 6,
    recto: [
      { t: 'meta', texte: 'CAUFD · Guichet 7B · Agent de traitement, catégorie C' },
      { t: 'titre', texte: "FICHE D'INSTALLATION DE L'AGENT" },
      {
        t: 'texte',
        texte:
          "L'agent soussigné prend son poste ce jour, {date}. Il traitera tout dossier présenté, y compris ceux qui ne le seront pas.",
      },
      {
        t: 'case',
        id: 'reglement',
        label: "J'ai pris connaissance du règlement intérieur (642 pages, hors annexes).",
      },
      { t: 'signature', id: 'signature', label: "Signature de l'agent" },
      { t: 'cachet', id: 'cachet', label: 'Cachet : VU' },
    ],
  },

  /* ───────── Logement ───────── */
  bail: {
    id: 'bail',
    titre: "Bail d'habitation",
    format: 'a4',
    poids: 14,
    recto: [
      { t: 'meta', texte: 'Résidence Les Mouettes Grises · Studio n° {lot}, 9 m²' },
      { t: 'titre', texte: "BAIL D'HABITATION" },
      { t: 'valeur', label: 'Locataire', valeur: '{nom}' },
      { t: 'valeur', label: 'Loyer mensuel', valeur: '{loyer} €' },
      { t: 'texte', texte: 'Le locataire respirera avec modération dans les parties communes.' },
      {
        t: 'case',
        id: 'radiateur',
        label: 'Le radiateur a pris connaissance du dossier (art. 12).',
      },
      { t: 'cachet', id: 'cachet', label: 'Cachet du service' },
    ],
    petits:
      'Art. 7 : les groupes sanguins autres que O négatif provoquent des fuites. Art. 12 : le radiateur est copropriétaire.',
  },
  prise_de_sang: {
    id: 'prise_de_sang',
    titre: 'Résultat de prise de sang à jeun',
    format: 'demi',
    poids: 5,
    recto: [
      { t: 'titre', texte: "LABORATOIRE D'ANALYSES DU BEFFROI" },
      { t: 'meta', texte: 'Prélèvement à jeun du {depot}' },
      { t: 'valeur', label: 'Patient', valeur: '{nom}' },
      { t: 'valeur', label: 'Groupe sanguin', valeur: '{groupe}' },
      { t: 'valeur', label: 'Cholestérol total', valeur: '{cholesterol} mg/dL' },
      {
        t: 'texte',
        style: 'petit',
        texte: 'Valeurs de référence : non communiquées, par discrétion.',
      },
    ],
  },
  avis_chat: {
    id: 'avis_chat',
    titre: 'Avis favorable du chat du propriétaire',
    format: 'demi',
    papier: 'jaune',
    poids: 4,
    recto: [
      { t: 'titre', texte: 'AVIS FAVORABLE DU CHAT DU PROPRIÉTAIRE' },
      {
        t: 'texte',
        style: 'manuscrit',
        texte: 'Je soussigné {chat}, chat du propriétaire, émets un avis favorable.',
      },
      { t: 'motif', motif: 'patte', valeur: '{empreinte}', hauteur: 34 },
      { t: 'meta', texte: 'Fait à la gamelle, le {depot}' },
    ],
  },
  lettre_radiateur: {
    id: 'lettre_radiateur',
    titre: 'Lettre de motivation adressée au radiateur',
    format: 'a4',
    poids: 4,
    recto: [
      { t: 'meta', texte: '{nom} · à l’attention du radiateur, salle de séjour' },
      { t: 'titre', texte: 'LETTRE DE MOTIVATION' },
      {
        t: 'texte',
        style: 'manuscrit',
        texte:
          "Cher radiateur, je rêve depuis toujours de vivre à vos côtés. Je ne sèche pas de linge sur vous et je vous purge deux fois l'an. Veuillez agréer l'expression de ma chaleur distinguée. {prenom}",
      },
      { t: 'cachet', id: 'cachet', label: 'Cachet : lu par le radiateur' },
    ],
  },
  formulaire_chauffage: {
    id: 'formulaire_chauffage',
    titre: 'Demande de raccordement au chauffage collectif',
    format: 'a4',
    poids: 6,
    recto: [
      { t: 'meta', texte: 'Cerfa n° 15-90°C · Service Logement' },
      { t: 'titre', texte: 'DEMANDE DE RACCORDEMENT AU CHAUFFAGE COLLECTIF' },
      { t: 'valeur', label: 'Demandeur', valeur: '{nom}' },
      { t: 'valeur', label: 'Étage', valeur: '{etage}e sans ascenseur' },
      { t: 'case', id: 'radiateur', label: 'Le radiateur a pris connaissance du dossier.' },
      { t: 'cachet', id: 'cachet', label: 'Cachet du service' },
    ],
  },

  /* ───────── État civil ───────── */
  formulaire_cni: {
    id: 'formulaire_cni',
    titre: "Demande de renouvellement de carte d'identité",
    format: 'a4',
    poids: 6,
    recto: [
      { t: 'meta', texte: 'Cerfa n° 12100*04 bis ter · État civil' },
      { t: 'titre', texte: "RENOUVELLEMENT DE CARTE NATIONALE D'IDENTITÉ" },
      { t: 'valeur', label: 'Demandeur', valeur: '{nom}' },
      { t: 'valeur', label: 'Né(e) le', valeur: '{naissance}' },
      { t: 'valeur', label: 'Motif', valeur: '{motif}' },
      { t: 'signature', id: 'visa', label: "Visa de l'agent" },
      { t: 'cachet', id: 'cachet', label: 'Cachet du service' },
    ],
  },
  acte_naissance: {
    id: 'acte_naissance',
    titre: 'Acte de naissance certifié par le demandeur',
    format: 'a4',
    papier: 'jaune',
    poids: 5,
    recto: [
      { t: 'titre', texte: 'ACTE DE NAISSANCE' },
      { t: 'meta', texte: "Certifié conforme par l'intéressé(e), le jour de sa naissance" },
      {
        t: 'texte',
        texte:
          "Le {naissance}, à 4 h 12, est né(e) {nom}, qui certifie l'exactitude du présent acte.",
      },
      { t: 'motif', motif: 'gribouillis', hauteur: 30 },
      { t: 'meta', texte: "Signature de l'intéressé(e), âgé(e) de 0 jour" },
      { t: 'cachet', id: 'cachet', label: 'Cachet' },
    ],
  },
  copie_cni: {
    id: 'copie_cni',
    titre: "Photocopie de la photocopie de la carte d'identité",
    format: 'carte',
    poids: 3,
    filigranes: 'filigranes',
    recto: [
      { t: 'meta', texte: "RÉPUBLIQUE FRANÇAISE · CARTE NATIONALE D'IDENTITÉ" },
      { t: 'valeur', label: 'Nom', valeur: '{nom}' },
      { t: 'valeur', label: 'Né(e) le', valeur: '{naissance}' },
      { t: 'motif', motif: 'photo', hauteur: 30 },
    ],
  },
  attestation_honneur: {
    id: 'attestation_honneur',
    titre: "Attestation sur l'honneur",
    format: 'a4',
    poids: 4,
    recto: [
      { t: 'titre', texte: "ATTESTATION SUR L'HONNEUR" },
      { t: 'texte', texte: "Je soussigné(e) {nom} atteste sur l'honneur {objet}." },
      { t: 'meta', texte: 'Fait pour servir et valoir ce que de droit, le {depot}.' },
      { t: 'signature', id: 'signature', label: "Visa de l'agent" },
      { t: 'cachet', id: 'cachet', label: 'Cachet du service' },
    ],
  },
  attestation_honnetete: {
    id: 'attestation_honnetete',
    titre: "Attestation de l'honnêteté de l'attestation sur l'honneur",
    format: 'a4',
    poids: 4,
    recto: [
      {
        t: 'titre',
        texte: "ATTESTATION SUR L'HONNEUR DE L'HONNÊTETÉ DE L'ATTESTATION SUR L'HONNEUR",
      },
      {
        t: 'texte',
        texte:
          "Je soussigné(e) {nom} atteste sur l'honneur que l'attestation sur l'honneur ci-jointe est honnête, et que la présente l'est aussi, jusqu'à preuve du contraire.",
      },
      { t: 'signature', id: 'signature', label: "Visa de l'agent" },
    ],
  },
  formulaire_prenom: {
    id: 'formulaire_prenom',
    titre: 'Demande de changement de prénom',
    format: 'a4',
    poids: 5,
    recto: [
      { t: 'meta', texte: 'Cerfa n° 11-11 · État civil' },
      { t: 'titre', texte: 'DEMANDE DE CHANGEMENT DE PRÉNOM' },
      { t: 'valeur', label: 'Prénom actuel', valeur: '{prenom}' },
      { t: 'valeur', label: 'Prénom souhaité', valeur: '{nouveau}' },
      { t: 'valeur', label: 'Raison', valeur: '{raison}' },
      { t: 'signature', id: 'visa', label: "Visa de l'agent" },
      { t: 'cachet', id: 'cachet', label: 'Cachet du service' },
    ],
  },
  renonciation: {
    id: 'renonciation',
    titre: 'Formulaire de renonciation au droit de ne pas renoncer',
    format: 'demi',
    papier: 'rose',
    poids: 3,
    recto: [
      { t: 'titre', texte: 'RENONCIATION AU DROIT DE NE PAS RENONCER' },
      { t: 'texte', texte: 'Le demandeur renonce à toute réclamation, à l’exception de celle-ci.' },
      { t: 'case', id: 'contradictoire', label: 'Je ne coche pas cette case.' },
    ],
  },

  /* ───────── Crédit et Finances ───────── */
  offre_pret: {
    id: 'offre_pret',
    titre: 'Offre de prêt',
    format: 'a4',
    poids: 8,
    recto: [
      { t: 'meta', texte: 'Caisse de Crédit du Guichet · offre n° {ref}' },
      { t: 'titre', texte: 'OFFRE DE PRÊT' },
      { t: 'valeur', label: 'Emprunteur', valeur: '{nom}' },
      { t: 'valeur', label: 'Objet', valeur: '{objet}' },
      { t: 'champ', id: 'montant', label: 'Montant (en euros)' },
      { t: 'cachet', id: 'recu', label: 'REÇU LE' },
      { t: 'cachet', id: 'decision', label: 'Décision' },
    ],
  },
  demande_pret: {
    id: 'demande_pret',
    titre: 'Demande de prêt manuscrite',
    format: 'demi',
    papier: 'bleu',
    poids: 3,
    recto: [
      { t: 'meta', texte: '{nom}, le {depot}' },
      {
        t: 'texte',
        style: 'manuscrit',
        texte:
          'Madame, Monsieur, je sollicite un prêt de {montant} euros pour {objet}. Je rembourserai, promis.',
      },
    ],
  },
  bulletin_ce2: {
    id: 'bulletin_ce2',
    titre: 'Bulletin de notes de CE2',
    format: 'a4',
    papier: 'jaune',
    poids: 4,
    recto: [
      { t: 'meta', texte: 'École communale Jules-Ferry · année scolaire {annee_ce2}' },
      { t: 'titre', texte: 'BULLETIN SCOLAIRE · CE2' },
      { t: 'valeur', label: 'Élève', valeur: '{prenom}' },
      { t: 'valeur', label: 'Calcul mental', valeur: '{calcul}/20' },
      { t: 'valeur', label: 'Récitation', valeur: '{recitation}/20' },
      { t: 'valeur', label: 'Conduite', valeur: '{conduite}' },
      { t: 'texte', style: 'manuscrit', texte: 'Appréciation : {appreciation}' },
    ],
  },
  carte_fidelite: {
    id: 'carte_fidelite',
    titre: 'Carte de fidélité de la boulangerie',
    format: 'carte',
    papier: 'kraft',
    poids: 2,
    recto: [
      { t: 'meta', texte: 'BOULANGERIE AU PAIN DE MIE · CARTE DE FIDÉLITÉ' },
      { t: 'motif', motif: 'fidelite', valeur: '{fidelite}', hauteur: 44 },
      { t: 'meta', texte: '10 tampons = 1 baguette offerte' },
    ],
  },
  ticket_baguette: {
    id: 'ticket_baguette',
    titre: "Ticket de caisse d'une baguette",
    format: 'ticket',
    papier: 'ticket',
    poids: 1,
    recto: [
      { t: 'texte', style: 'machine', texte: 'AU PAIN DE MIE\nBOULANGERIE' },
      { t: 'motif', motif: 'baguette', hauteur: 22 },
      { t: 'texte', style: 'machine', texte: '1 BAGUETTE TRADI 1,30\nTOTAL EUR 1,30' },
      { t: 'valeur', label: 'Le', valeur: '{ticket}' },
      { t: 'motif', motif: 'code-barres', hauteur: 16 },
    ],
  },
  formulaire_bourse: {
    id: 'formulaire_bourse',
    titre: "Demande de bourse d'études",
    format: 'a4',
    poids: 6,
    recto: [
      { t: 'meta', texte: 'Cerfa n° 0-20 · Crédit et Finances' },
      { t: 'titre', texte: "DEMANDE DE BOURSE D'ÉTUDES" },
      { t: 'valeur', label: 'Étudiant(e)', valeur: '{nom}, {age} ans' },
      { t: 'valeur', label: 'Études envisagées', valeur: '{etudes}' },
      { t: 'champ', id: 'rfr', label: "Revenu fiscal de référence (avis d'imposition)" },
      { t: 'cachet', id: 'cachet', label: 'Cachet du service' },
    ],
  },
  avis_imposition: {
    id: 'avis_imposition',
    titre: "Avis d'imposition {annee}",
    format: 'a4',
    papier: 'bleu',
    poids: 5,
    recto: [
      { t: 'meta', texte: 'Direction des Finances publiques · revenus de l’année prochaine' },
      { t: 'titre', texte: "AVIS D'IMPOSITION {annee}" },
      { t: 'valeur', label: 'Contribuable', valeur: '{nom}' },
      { t: 'valeur', label: 'Établi le', valeur: '{etabli}' },
      { t: 'valeur', label: 'Revenu fiscal de référence', valeur: '{rfr} €' },
      {
        t: 'texte',
        style: 'petit',
        texte:
          'Montant estimé de bonne foi par le contribuable, qui ne connaît pas encore ses revenus.',
      },
    ],
    leurres: [
      'Avis de non-imposition {annee}',
      "Avis d'imposition {annee} (duplicata non certifié)",
    ],
    archive: { nom: 'nom', date: 'etabli' },
  },
  formulaire_location: {
    id: 'formulaire_location',
    titre: 'Demande de location avec garantie parentale',
    format: 'a4',
    poids: 6,
    recto: [
      { t: 'meta', texte: 'Service Logement · garantie des ascendants' },
      { t: 'titre', texte: 'DEMANDE DE LOCATION · GARANTIE PARENTALE' },
      { t: 'valeur', label: 'Locataire', valeur: '{nom}, {age} ans' },
      { t: 'valeur', label: 'Père', valeur: '{pere}' },
      { t: 'valeur', label: 'Mère', valeur: '{mere}' },
      { t: 'champ', id: 'salaire', label: 'Salaire mensuel net du père (en euros)' },
      { t: 'cachet', id: 'recu', label: 'REÇU LE' },
    ],
  },
  bulletin_salaire: {
    id: 'bulletin_salaire',
    titre: 'Bulletin de salaire de {salarie}',
    format: 'demi',
    poids: 3,
    recto: [
      { t: 'titre', texte: 'BULLETIN DE SALAIRE · {mois}' },
      { t: 'meta', texte: 'Établissements {employeur}' },
      { t: 'valeur', label: 'Salarié(e)', valeur: '{salarie}' },
      { t: 'valeur', label: 'Emploi', valeur: '{emploi}' },
      { t: 'valeur', label: 'Net à payer', valeur: '{salaire} €' },
    ],
  },
  diplome_natation: {
    id: 'diplome_natation',
    titre: 'Diplôme de natation',
    format: 'a4',
    papier: 'bleu',
    poids: 4,
    recto: [
      { t: 'meta', texte: 'Piscine municipale Alfred-Nakache · bassin de 25 m' },
      { t: 'titre', texte: 'DIPLÔME DE NATATION · {distance} MÈTRES' },
      { t: 'motif', motif: 'nageur', hauteur: 34 },
      { t: 'valeur', label: 'Titulaire', valeur: '{nom}' },
      { t: 'valeur', label: 'Obtenu le', valeur: '{obtention}' },
      { t: 'valeur', label: 'Mention', valeur: '{mention}' },
    ],
  },
  formulaire_pret_rdc: {
    id: 'formulaire_pret_rdc',
    titre: 'Demande de prêt pour un rez-de-chaussée en zone inondable',
    format: 'a4',
    poids: 6,
    recto: [
      { t: 'meta', texte: 'Crédit et Finances · zone inondable de niveau 4' },
      { t: 'titre', texte: 'PRÊT POUR UN REZ-DE-CHAUSSÉE EN ZONE INONDABLE' },
      { t: 'valeur', label: 'Emprunteur', valeur: '{nom}' },
      { t: 'champ', id: 'natation', label: "Date d'obtention du diplôme de natation" },
      { t: 'cachet', id: 'decision', label: 'Décision' },
    ],
  },
  formulaire_pret_etudiant: {
    id: 'formulaire_pret_etudiant',
    titre: 'Demande de prêt étudiant',
    format: 'a4',
    poids: 6,
    recto: [
      { t: 'meta', texte: 'Crédit et Finances · prêt garanti' },
      { t: 'titre', texte: 'DEMANDE DE PRÊT ÉTUDIANT' },
      { t: 'valeur', label: 'Étudiant(e)', valeur: '{nom}' },
      { t: 'valeur', label: 'Garant', valeur: '{garant}' },
      { t: 'case', id: 'solidaire', label: 'Le garant transpire de manière solidaire.' },
      { t: 'cachet', id: 'cachet', label: 'Cachet du service' },
    ],
  },
  flacon_sueur: {
    id: 'flacon_sueur',
    titre: 'Échantillon de sueur du garant',
    format: 'etiquette',
    papier: 'blanc',
    poids: 30,
    scelle: true,
    recto: [
      { t: 'meta', texte: 'ÉCHANTILLON DE SUEUR · {garant}' },
      { t: 'texte', style: 'gras', texte: 'Flacon scellé : NE PAS OUVRIR' },
      { t: 'cachet', id: 'etiquette', label: 'Visa (étiquette)' },
    ],
  },
  formulaire_remboursement: {
    id: 'formulaire_remboursement',
    titre: "Demande de remboursement d'un aspirateur",
    format: 'a4',
    poids: 6,
    recto: [
      { t: 'meta', texte: 'Crédit et Finances · litiges électroménagers' },
      { t: 'titre', texte: "REMBOURSEMENT D'UN ASPIRATEUR QUI N'ASPIRE PAS" },
      { t: 'valeur', label: 'Demandeur', valeur: '{nom}' },
      { t: 'valeur', label: 'Montant', valeur: '89,90 €' },
      { t: 'motif', motif: 'aspirateur', hauteur: 26 },
      { t: 'cachet', id: 'recu', label: 'REÇU LE' },
      { t: 'cachet', id: 'cachet', label: 'Cachet du service' },
    ],
  },
  ticket_aspirateur: {
    id: 'ticket_aspirateur',
    titre: "Preuve d'achat",
    format: 'ticket',
    papier: 'ticket',
    poids: 1,
    recto: [
      { t: 'texte', style: 'machine', texte: 'ÉLECTROMÉNAGER\nDU CENTRE' },
      { t: 'texte', style: 'machine', texte: '1 ASPIRATEUR TRAINEAU\n89,90 EUR' },
      { t: 'valeur', label: 'Transaction', valeur: '{transaction}' },
      { t: 'motif', motif: 'code-barres', hauteur: 16 },
    ],
  },
  preuve_preuve: {
    id: 'preuve_preuve',
    titre: "Preuve d'achat de la preuve d'achat",
    format: 'ticket',
    papier: 'ticket',
    poids: 1,
    recto: [
      { t: 'texte', style: 'machine', texte: "PREUVE D'ACHAT DE LA PREUVE D'ACHAT" },
      { t: 'texte', style: 'machine', texte: "1 PREUVE D'ACHAT 0,10\nTOTAL EUR 0,10" },
      { t: 'valeur', label: 'Transaction', valeur: '{transaction2}' },
    ],
  },
  certificat_residence: {
    id: 'certificat_residence',
    titre: 'Demande de certificat de résidence',
    format: 'a4',
    poids: 5,
    recto: [
      { t: 'meta', texte: 'État civil · preuve de résidence en France' },
      { t: 'titre', texte: 'DEMANDE DE CERTIFICAT DE RÉSIDENCE' },
      { t: 'valeur', label: 'Demandeur', valeur: '{nom}' },
      {
        t: 'texte',
        texte:
          'Le demandeur justifie de sa présence en France par l’achat d’une baguette le jour du dépôt.',
      },
      { t: 'cachet', id: 'cachet', label: 'Cachet du service' },
    ],
  },
  page_blanche: {
    id: 'page_blanche',
    titre: 'Page laissée blanche pour des raisons de sécurité',
    format: 'a4',
    poids: 4,
    recto: [
      { t: 'espace', h: 96 },
      { t: 'texte', style: 'petit', texte: 'Page laissée blanche pour des raisons de sécurité.' },
      { t: 'paraphe', id: 'paraphe' },
    ],
  },
};

/** Titres de pièces imaginaires pour le fouillis des Archives. */
export const FOUILLIS = [
  'Attestation de non-attestation',
  'Relevé de relevés',
  'Certificat de présence à son propre domicile',
  'Déclaration de non-déclaration',
  "Avis de passage de l'avis de passage",
  'Inventaire des tiroirs de 1983',
  'Note de service n° 0 (abrogée)',
  'Formulaire 7B-bis, recto seul',
  'Bon de commande de trombones (refusé)',
  "Procès-verbal de la réunion sur l'ordre du jour",
  "Liste d'attente de la liste d'attente",
  'Justificatif de justificatif',
];
