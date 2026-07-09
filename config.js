// config.js — Ton profil et tes réglages. Modifie librement.

export const profil = {
  technosMaitrisees: "React, Node, Python, Supabase, IA, fullstack",
  technosRefusees: "cybersécurité, WordPress, technologies anciennes/legacy",
  missionsIdeales: "dev web sur-mesure, automatisation, intégration API",
  tarifCible: 65,   // €/h
  tarifPlancher: 45, // €/h
  chargeMaxJours: 10, // 2 semaines ouvrées
  redFlags: "brief pas clair, budget qui ne correspond pas à la charge, budget absent, périmètre flou, techno hors profil",
  bonsSignaux: "budget cohérent avec la charge, projet bien rédigé et clair, possibilité de récurrent",
};

export const reglages = {
  // Flux RSS surveillé. /projects.rss = tous les projets.
  // Tu peux aussi cibler une catégorie, ex: https://www.codeur.com/developpeur/web.rss
  rssUrl: "https://www.codeur.com/projects.rss",

  // Seuil de correspondance profil (0-10) à partir duquel une mission est jugée "à répondre".
  seuilCorrespondance: 5,

  // On ne t'alerte que pour ces verdicts.
  verdictsAlertes: ["SUPER PLAN", "À RÉPONDRE"],

  // Verdicts affichés en section secondaire du récap (informatif).
  verdictsSecondaires: ["MOYEN"],

  // Nombre max d'annonces évaluées par exécution (garde-fou coût/temps).
  maxParRun: 25,

  // Modèle Claude utilisé pour l'évaluation.
  modele: "claude-sonnet-5",

  // Intervalle (en secondes) entre deux vérifications en mode --watch (serveur/PC allumé).
  intervalleSecondes: 90,

  // Fichier de mémoire des annonces déjà vues.
  fichierVus: "./seen.json",

  // Nb de jours avant d'oublier un ID vu (nettoyage du fichier).
  retentionJours: 30,
};
