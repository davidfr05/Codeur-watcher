// config.js — Ton profil et tes réglages. Modifie librement.

export const profil = {
  // Prénom utilisé pour signer la proposition envoyée au client.
  prenom: "David",

  // Présentation générale (donne du recul et du contexte à l'IA pour juger).
  presentation:
    "Développeur web fullstack junior, en début d'activité freelance. " +
    "J'ai déjà livré plusieurs sites vitrines, des boutiques e-commerce, et des automatisations " +
    "de workflows complexes pour des sociétés du secteur de la santé. Je maîtrise et j'apprécie " +
    "Python, Node.js, React, JavaScript, HTML et CSS, et je gère les bases de données Supabase et PostgreSQL. " +
    "Je suis en formation machine learning et à l'aise sur ce type de projets. Je suis particulièrement " +
    "avancé et à jour sur les LLM : tout ce qui touche à l'intégration d'IA et à l'automatisation métier me parle, " +
    "et j'en ai déjà réalisé, y compris via des outils no-code comme Make. En tant que junior, je suis motivé " +
    "pour apprendre et prendre de nouveaux projets — j'ai grandi avec l'IA et j'en suis les progrès depuis le début.",

  // Technos que je maîtrise et sur lesquelles je suis à l'aise.
  technosMaitrisees:
    "Python, Node.js, React, JavaScript, HTML, CSS, Supabase, PostgreSQL, " +
    "intégration d'IA / LLM, automatisation de workflows (dont no-code type Make)",

  // Technos que je sais faire mais avec prudence (en apprentissage, ne pas survendre).
  technosApprentissage: "machine learning (en formation)",

  // Type de missions idéales pour moi.
  missionsIdeales:
    "sites vitrines et sites e-commerce UNIQUEMENT en sur-mesure (développement custom, ex. React/Node), " +
    "automatisation de workflows métier, intégration d'IA / LLM, projets no-code + IA",

  // Technos / domaines hors périmètre (à écarter quel que soit le budget).
  technosRefusees:
    "cybersécurité, technologies anciennes / legacy, " +
    "WordPress et autres CMS / constructeurs de sites clé-en-main (Shopify, WooCommerce, PrestaShop, Wix, Webflow, etc.)",

  // Tarif JOURNALIER (TJM), profil junior — sert à juger si le prix est correct.
  tarifJourCible: 180,   // €/jour visé
  tarifJourPlancher: 150, // €/jour minimum acceptable

  // Charge que je peux prendre : projets courts.
  chargeMaxJours: 14, // 14 jours de travail réel maximum

  // Red flags = signaux de MAUVAISE annonce (qualité/cadrage, pas techno).
  redFlags:
    "brief flou ou trop vague, périmètre mal défini, projet trop complexe ou trop gros, " +
    "budget absent ou incohérent avec la charge de travail",

  // Signaux d'une BONNE annonce.
  bonsSignaux:
    "brief clair et détaillé, périmètre bien défini, budget cohérent avec la charge, " +
    "techno dans mon cœur de compétences, projet court, possibilité de récurrent ou d'apprentissage",
};

export const reglages = {
  // Flux RSS surveillé. /projects.rss = tous les projets.
  rssUrl: "https://www.codeur.com/projects.rss",

  // Seuil de correspondance profil (0-10) à partir duquel une mission est jugée "à répondre".
  seuilCorrespondance: 5,

  // On ne t'alerte que pour ces verdicts.
  verdictsAlertes: ["SUPER PLAN", "À RÉPONDRE"],

  // Verdicts affichés en section secondaire du récap (informatif).
  verdictsSecondaires: ["MOYEN"],

  // --- MODÈLES (optimisation coût/qualité) ---
  // Haiku : évalue toutes les annonces (rapide et économique).
  modeleEvaluation: "claude-haiku-4-5-20251001",
  // Sonnet : rédige la proposition, seulement pour les annonces retenues (qualité là où ça compte).
  modeleProposition: "claude-sonnet-5",

  // --- PRÉ-FILTRE gratuit (aucun appel IA) ---
  // Si le titre ou la catégorie contient un de ces mots, l'annonce est écartée AVANT toute évaluation.
  // Ne mets ici que des termes qui ne sont JAMAIS pour toi (sinon tu risquerais de rater une bonne mission).
  preFiltreMotsCles: [
    // CMS / constructeurs hors périmètre
    "wordpress", "shopify", "woocommerce", "prestashop", "wix", "webflow", "joomla", "drupal", "magento", "wix ",
    // cybersécurité
    "cybersécurité", "cybersecurite", "pentest", "sécurité informatique",
    // non-développement
    "logo", "graphiste", "graphisme", "bannière", "banniere", "flyer", "illustration",
    "rédaction", "redaction", "rédacteur", "redacteur", "rédactrice",
    "référencement", "referencement", "seo", "netlinking",
    "photographe", "retouche photo", "montage vidéo", "montage video", "monteur", "motion design",
    "community manager", "traduction", "traducteur", "saisie de données",
    "télémarketing", "telemarketing", "prospection commerciale", "téléprospection", "standardiste",
  ],

  // Nombre max d'annonces évaluées par exécution (garde-fou coût/temps).
  maxParRun: 25,

  // Intervalle (en secondes) entre deux vérifications en mode --watch (serveur/PC allumé).
  intervalleSecondes: 120,

  // Fichier de mémoire des annonces déjà vues.
  fichierVus: "./seen.json",

  // Nb de jours avant d'oublier un ID vu (nettoyage du fichier).
  retentionJours: 30,
};
