// prompt.js — Construit le prompt de qualification à partir du profil et d'une annonce enrichie.
import { profil } from "./config.js";
import { reglages } from "./config.js";

export function construirePrompt(annonce) {
  const seuil = reglages.seuilCorrespondance ?? 5;
  return `RÔLE
Tu es l'assistant de qualification de missions freelance sur codeur.com.
Tu évalues UNE annonce et tu décides si je dois y répondre vite, plus tard, ou l'ignorer.

MON PROFIL
- Technos maîtrisées : ${profil.technosMaitrisees}
- Technos que je refuse / hors périmètre : ${profil.technosRefusees}
- Type de missions idéales : ${profil.missionsIdeales}
- Tarif horaire cible : ${profil.tarifCible} €/h  | Tarif plancher : ${profil.tarifPlancher} €/h
- Charge que je peux prendre : missions courtes à moyennes, ${profil.chargeMaxJours} jours ouvrés de travail max
- Red flags (à pénaliser) : ${profil.redFlags}
- Signaux de bon plan : ${profil.bonsSignaux}

ANNONCE À ÉVALUER (données complètes récupérées sur la page publique)
Titre : ${annonce.titre}
Statut : ${annonce.statut || "(inconnu)"}
Description complète : ${annonce.description}
Budget affiché : ${annonce.budget || "(non précisé)"}
Catégorie / profils recherchés : ${annonce.profils || annonce.categorie || "(non précisés)"}
Nombre d'offres déjà envoyées par des concurrents : ${annonce.nbOffres ?? "(inconnu)"}
Nombre de vues : ${annonce.nbVues ?? "(inconnu)"}
Montant moyen des devis concurrents : ${annonce.montantMoyenDevis || "(non disponible)"}
Délai estimé par la plateforme : ${annonce.delaiEstime || "(non disponible)"}
Publiée : ${annonce.publication || annonce.date || "(inconnue)"}

MÉTHODE DE CALCUL DU RATIO PRIX/TRAVAIL
1. Estime la charge réelle en heures (jours × 7h).
2. prix_estime_juste = charge_heures × ${profil.tarifCible} € (mon TJM cible).
3. Point de repère marché : si un "montant moyen des devis concurrents" est fourni, c'est le prix réel que le client s'attend à payer — compare-le à prix_estime_juste.
4. Verdict du ratio :
   - budget (ou montant moyen des devis) >= prix_estime_juste                          -> "bon"
   - entre (charge_heures × ${profil.tarifPlancher} €) et prix_estime_juste             -> "correct"
   - < charge_heures × ${profil.tarifPlancher} €, absent ou incohérent                  -> "mauvais"

CE QUE TU DOIS PRODUIRE (uniquement ce JSON, rien d'autre)
{
  "correspondance_profil": 0-10,
  "complexite": "faible|moyenne|élevée",
  "charge_estimee_jours": nombre,
  "hypotheses": "ce que tu as supposé pour estimer",
  "prix_estime_juste": "montant € = charge_heures × ${profil.tarifCible}",
  "prix_marche": "montant moyen des devis concurrents ou 'inconnu'",
  "ratio_prix_travail": "bon|correct|mauvais",
  "concurrence": "faible|moyenne|forte",
  "vaut_le_coup": "oui|mitigé|non",
  "compte_rendu": "2-3 phrases : est-ce que ça vaut le coup pour moi et pourquoi (points forts / points faibles concrets, prix vs charge, concurrence). Sois direct.",
  "verdict": "SUPER PLAN|À RÉPONDRE|MOYEN|À ÉVITER",
  "raison_courte": "1 phrase",
  "red_flags": ["..."],
  "questions_a_poser_au_client": ["..."],
  "brouillon_proposition": "3-4 phrases max : accroche personnalisée + compréhension du besoin + approche technique + prochaine étape. Ton pro, direct, sans blabla."
}

RÈGLES (seuil d'acceptation : correspondance_profil >= ${seuil})
- Techno hors périmètre (${profil.technosRefusees}) -> "À ÉVITER" et vaut_le_coup "non", quel que soit le budget.
- Correspondance < ${seuil} -> "À ÉVITER".
- Charge estimée > ${profil.chargeMaxJours} jours -> pénalise : verdict max "MOYEN".
- "SUPER PLAN" si correspondance >= 8 ET ratio "bon" ET brief clair ET concurrence pas "forte".
- "À RÉPONDRE" si correspondance >= ${seuil} ET ratio "bon" ou "correct".
- "MOYEN" si correspondance >= ${seuil} mais ratio "mauvais" ou brief flou ou concurrence "forte".
- Concurrence : nbOffres < 8 = "faible", 8-25 = "moyenne", > 25 = "forte".
- "vaut_le_coup" = "oui" pour SUPER PLAN et À RÉPONDRE, "mitigé" pour MOYEN, "non" pour À ÉVITER.
- Le brouillon doit montrer que j'ai LU le besoin (reprends 1 détail concret de la description), jamais générique.
- N'invente pas d'infos absentes ; mets-les dans questions_a_poser_au_client.`;
}
