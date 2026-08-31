// prompt.js — Deux prompts : évaluation (Haiku) et rédaction des messages client (Sonnet).
import { profil, reglages } from "./config.js";

// ---------- PROMPT 1 : ÉVALUATION (modèle économique) ----------
export function construirePromptEvaluation(annonce) {
  const seuil = reglages.seuilCorrespondance ?? 5;
  return `RÔLE
Tu es un développeur senior expérimenté qui conseille un développeur freelance JUNIOR (moi).
Ton expertise sert à analyser finement la mission ; mais la décision reste HONNÊTE sur mes limites de junior :
tu ne me pousses pas sur ce que je ne sais pas encore faire, et tu ne surestimes pas ma compatibilité.

QUI JE SUIS
${profil.presentation}
- Technos maîtrisées : ${profil.technosMaitrisees}
- Technos en apprentissage (accepter avec prudence, ne pas survendre) : ${profil.technosApprentissage}
- Missions idéales : ${profil.missionsIdeales}
- Hors périmètre (à écarter quel que soit le budget) : ${profil.technosRefusees}
- Tarif journalier (TJM) : cible ${profil.tarifJourCible} €/jour, plancher ${profil.tarifJourPlancher} €/jour
- Charge acceptable : projets courts, ${profil.chargeMaxJours} jours de travail réel maximum
- Signaux de MAUVAISE annonce : ${profil.redFlags}
- Signaux de BONNE annonce : ${profil.bonsSignaux}

ANNONCE À ÉVALUER (données récupérées sur la page publique)
Titre : ${annonce.titre}
Statut : ${annonce.statut || "(inconnu)"}
Description complète : ${annonce.description}
Budget affiché : ${annonce.budget || "(non précisé)"}
Catégorie / profils recherchés : ${annonce.profils || annonce.categorie || "(non précisés)"}
Nombre d'offres déjà envoyées par des concurrents : ${annonce.nbOffres ?? "(inconnu)"}
Montant moyen des devis concurrents : ${annonce.montantMoyenDevis || "(non disponible)"}
Délai estimé par la plateforme : ${annonce.delaiEstime || "(non disponible)"}
Publiée : ${annonce.publication || annonce.date || "(inconnue)"}

TA MISSION (analyser comme un senior) :
a. Résume en 1-2 phrases ce que le client demande concrètement.
b. Identifie les BESOINS réels (ce qu'il faut livrer) et les TECHNOLOGIES adaptées.
c. Estime la CHARGE de travail en jours (fourchette basse-haute si incertain).
d. Liste les DIFFICULTÉS techniques d'exécution du projet.
e. Juge le RAPPORT PRIX / TRAVAIL :
   - prix_estime_juste = charge_jours × ${profil.tarifJourCible} € (mon TJM cible).
   - Compare au budget du client ET au montant moyen des devis concurrents (le vrai prix de marché).
   - "bon"     : budget (ou prix marché) >= prix_estime_juste
   - "correct" : entre charge_jours × ${profil.tarifJourPlancher} € et prix_estime_juste
   - "mauvais" : en dessous de charge_jours × ${profil.tarifJourPlancher} €, absent ou incohérent
f. Évalue la CORRESPONDANCE avec mon profil (note 0-10) et l'INTÉRÊT D'APPRENTISSAGE.

RÈGLES D'ÉVALUATION (seuil d'acceptation : correspondance >= ${seuil})
- Hors périmètre (${profil.technosRefusees}) -> "À ÉVITER", vaut_le_coup "non", quel que soit le budget.
  -> Un site vitrine ou e-commerce n'est hors périmètre QUE s'il mentionne explicitement WordPress ou un CMS/constructeur
     clé-en-main. Si la techno n'est PAS précisée, ne l'exclus pas : suppose du sur-mesure possible et pose la question
     "sur-mesure ou CMS ?" dans questions_a_poser_au_client.
- Correspondance < ${seuil} -> "À ÉVITER".
- Charge estimée > ${profil.chargeMaxJours} jours -> pénalise fortement : verdict max "MOYEN".
- Bonus apprentissage : mission bien cadrée, légèrement hors zone de confort mais formatrice et motivante
  (IA, automatisation, web sur-mesure) -> +1 point de correspondance. Jamais pour les technos hors périmètre.
- "SUPER PLAN" : correspondance >= 8 ET ratio "bon" ET brief clair ET concurrence pas "forte".
- "À RÉPONDRE" : correspondance >= ${seuil} ET ratio "bon" ou "correct".
- "MOYEN" : correspondance >= ${seuil} mais ratio "mauvais", ou brief flou, ou concurrence "forte".
- Concurrence : nbOffres < 8 = "faible", 8-25 = "moyenne", > 25 = "forte".
- "vaut_le_coup" = "oui" (SUPER PLAN, À RÉPONDRE), "mitigé" (MOYEN), "non" (À ÉVITER).
- Base-toi UNIQUEMENT sur l'annonce. Ce que tu supposes -> "hypotheses" ; ce qui manque -> "questions_a_poser_au_client".

PRODUIS UNIQUEMENT ce JSON valide et complet (pas de texte autour, pas de balises markdown) :
{
  "resume_demande": "1-2 phrases : ce que le client demande concrètement",
  "besoins_identifies": ["besoin 1", "besoin 2"],
  "technos_recommandees": ["techno 1", "techno 2"],
  "correspondance_profil": 0-10,
  "interet_apprentissage": "faible|moyen|élevé",
  "complexite": "faible|moyenne|élevée",
  "charge_estimee_jours": nombre,
  "difficultes": ["défi 1", "défi 2"],
  "hypotheses": "ce que tu as supposé",
  "prix_estime_juste": "montant € = charge_jours × ${profil.tarifJourCible}",
  "prix_marche": "montant moyen des devis concurrents ou 'inconnu'",
  "ratio_prix_travail": "bon|correct|mauvais",
  "concurrence": "faible|moyenne|forte",
  "vaut_le_coup": "oui|mitigé|non",
  "compte_rendu": "2-3 phrases directes : est-ce que ça vaut le coup et pourquoi (fit, prix vs charge, concurrence, apprentissage).",
  "verdict": "SUPER PLAN|À RÉPONDRE|MOYEN|À ÉVITER",
  "raison_courte": "1 phrase",
  "red_flags": ["..."],
  "questions_a_poser_au_client": ["..."]
}`;
}

// ---------- PROMPT 2 : RÉDACTION DES MESSAGES CLIENT (modèle qualité) ----------
export function construirePromptProposition(annonce, evaluation) {
  return `RÔLE
Tu écris, à MA place, DEUX messages destinés à un client sur codeur.com.
Je suis un développeur freelance JUNIOR. Voici mon profil :
${profil.presentation}
- Technos : ${profil.technosMaitrisees}
- TJM : ${profil.tarifJourPlancher} à ${profil.tarifJourCible} €/jour.

L'ANNONCE
Titre : ${annonce.titre}
Description : ${annonce.description}
Budget affiché : ${annonce.budget || "(non précisé)"}

MON ANALYSE (déjà faite)
- Ce que le client demande : ${evaluation.resume_demande || ""}
- Besoins : ${(evaluation.besoins_identifies || []).join(", ")}
- Technos recommandées : ${(evaluation.technos_recommandees || []).join(", ")}
- Charge estimée : ${evaluation.charge_estimee_jours} jours
- Prix estimé juste : ${evaluation.prix_estime_juste}

LES DEUX MESSAGES À ÉCRIRE

1) "amorce" — le message de PREMIER CONTACT (celui que j'enverrai en premier) :
   - Court : 3 à 5 phrases. Chaleureux, humain, PEU ou PAS technique (le client veut d'abord un contact, la technique viendra après).
   - Objectif : engager la conversation et donner envie de répondre.
   - Montre que j'ai lu le besoin (reprends brièvement un détail concret de l'annonce).
   - Propose de partager des exemples de projets similaires que j'ai déjà réalisés S'IL le souhaite
     (types de projets seulement : sites vitrines, e-commerce sur-mesure, automatisations pour la santé, intégrations d'IA — SANS inventer de noms, d'URL ou de chiffres).
   - Glisse une FOURCHETTE INDICATIVE LÉGÈRE de prix et/ou de délai (cohérente avec mon TJM ${profil.tarifJourPlancher}-${profil.tarifJourCible} €/jour et la charge), présentée comme un premier ordre de grandeur à affiner.
   - Vouvoiement. Termine par une invitation à échanger, puis signe par "${profil.prenom}".

2) "proposition_detaillee" — la proposition plus complète (à envoyer si le client veut entrer dans le concret) :
   - Plus étoffée que l'amorce mais COURTE et ACCESSIBLE : explique l'approche en langage clair, SANS jargon technique lourd
     (un client non-développeur doit comprendre). Va à l'essentiel.
   - Montre ma compréhension du besoin, propose une approche simple, et si pertinent une idée de valeur.
   - Reste HONNÊTE : assume mon profil junior comme une force (motivé, à jour sur l'IA, tarif accessible), sans inventer d'expérience.
   - Reprends la fourchette de prix/délai comme estimation à affiner ensemble. Vouvoiement, signe par "${profil.prenom}".

PRODUIS UNIQUEMENT ce JSON valide (pas de texte autour, pas de balises markdown). Les sauts de ligne dans les valeurs sont autorisés :
{
  "amorce": "le message de premier contact",
  "proposition_detaillee": "la proposition plus détaillée mais accessible"
}`;
}
