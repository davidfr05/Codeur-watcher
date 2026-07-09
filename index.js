// index.js — Détecte les nouvelles missions, les qualifie, et envoie UN email récapitulatif.
//
// Usage :
//   node index.js         -> exécution normale (évalue + envoie 1 email récap)
//   node index.js --dry   -> évalue et affiche dans la console, SANS email ni mémorisation
//   node index.js --seed  -> marque TOUT le stock actuel comme déjà vu (à lancer 1x avant la prod)
//   node index.js --test-mail -> envoie un email récap d'EXEMPLE pour vérifier le format et le SMTP
//   node index.js --watch -> surveillance CONTINUE (boucle) pour un PC/serveur toujours allumé
//
import "dotenv/config";
import fs from "fs";
import Parser from "rss-parser";
import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { reglages } from "./config.js";
import { construirePrompt } from "./prompt.js";
import { recupererDetail } from "./scraper.js";

const DRY = process.argv.includes("--dry");
const SEED = process.argv.includes("--seed");
const TESTMAIL = process.argv.includes("--test-mail");
const WATCH = process.argv.includes("--watch");
const parser = new Parser({ timeout: 20000 });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Mémoire des annonces déjà vues ----------
function chargerVus() {
  try {
    const data = JSON.parse(fs.readFileSync(reglages.fichierVus, "utf8"));
    const limite = Date.now() - reglages.retentionJours * 86400000;
    const frais = {};
    for (const [id, ts] of Object.entries(data)) {
      if (ts > limite) frais[id] = ts;
    }
    return frais;
  } catch {
    return {};
  }
}

function sauverVus(vus) {
  fs.writeFileSync(reglages.fichierVus, JSON.stringify(vus, null, 2));
}

// ---------- Parsing d'une entrée RSS ----------
function extraireId(link = "") {
  const m = link.match(/\/projects\/(\d+)/);
  return m ? m[1] : link;
}

function nettoyerHtml(s = "") {
  return s
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#\d+;/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function repererBudget(texte = "") {
  const patterns = [
    /moins de \d[\d\s.]*\s*€/i,
    /\d[\d\s.]*\s*€\s*(?:à|-|–)\s*\d[\d\s.]*\s*€/i,
    /\d[\d\s.]*\s*€\s*et plus/i,
    /\d[\d\s.]*\s*(?:à|-|–)\s*\d[\d\s.]*\s*€\s*\/\s*jour/i,
  ];
  for (const p of patterns) {
    const m = texte.match(p);
    if (m) return m[0].replace(/\s+/g, " ").trim();
  }
  return null;
}

// ---------- Évaluation via Claude ----------
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

async function evaluer(annonce) {
  const msg = await anthropic.messages.create({
    model: reglages.modele,
    max_tokens: 3000,
    system:
      "Tu réponds UNIQUEMENT avec un objet JSON valide et complet. " +
      "Pas de texte avant/après, pas de balises markdown, pas de ```json. " +
      "Garde le champ brouillon_proposition à 4 phrases maximum pour ne pas dépasser.",
    messages: [{ role: "user", content: construirePrompt(annonce) }],
  });

  if (msg.stop_reason === "max_tokens") {
    throw new Error("réponse tronquée (max_tokens atteint) — augmente max_tokens");
  }

  let texte = msg.content.map((c) => c.text || "").join("").trim();
  texte = texte.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const debut = texte.indexOf("{");
  const fin = texte.lastIndexOf("}");
  if (debut === -1 || fin === -1) {
    throw new Error("pas de JSON exploitable: " + texte.slice(0, 120));
  }
  return JSON.parse(texte.slice(debut, fin + 1));
}

// ---------- Construction du récap ----------
// Bloc détaillé pour une annonce.
function blocAnnonce({ annonce, res: e }) {
  return `${annonce.titre}
${annonce.lien}
=> ${e.verdict} — ça vaut le coup ? ${(e.vaut_le_coup || "?").toUpperCase()}
${e.compte_rendu || e.raison_courte || ""}
Correspondance ${e.correspondance_profil}/10 · Complexité ${e.complexite} · Charge ~${e.charge_estimee_jours} j
Budget ${annonce.budget || "(non précisé)"} · Prix juste ${e.prix_estime_juste} · Ratio ${e.ratio_prix_travail}
Prix marché ${annonce.montantMoyenDevis || e.prix_marche || "(inconnu)"} · Concurrence ${e.concurrence || "?"} (${annonce.nbOffres ?? "?"} offres)
Red flags : ${(e.red_flags || []).join(" | ") || "aucun"}
Questions : ${(e.questions_a_poser_au_client || []).join(" ; ") || "-"}
--- Brouillon de proposition ---
${e.brouillon_proposition}`;
}

const sep = "\n\n" + "-".repeat(60) + "\n\n";

function corpsRecap(prioritaires, secondaires) {
  let corps = "";
  if (prioritaires.length) {
    corps += `### À TRAITER EN PRIORITÉ (${prioritaires.length})\n\n`;
    corps += prioritaires.map(blocAnnonce).join(sep);
  }
  if (secondaires.length) {
    if (corps) corps += "\n\n" + "=".repeat(60) + "\n\n";
    corps += `### À REGARDER QUAND MÊME (${secondaires.length}) — un bémol (prix, concurrence ou brief)\n\n`;
    corps += secondaires.map(blocAnnonce).join(sep);
  }
  return corps.trim();
}

// ---------- Email ----------
function transporteur() {
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: Number(process.env.SMTP_PORT) === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
}

async function envoyerRecap(sujet, corps) {
  const t = transporteur();
  await t.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_TO,
    subject: sujet,
    text: corps,
  });
}

// ---------- Boucle principale ----------
async function executerPassage() {
  console.log(`[${new Date().toISOString()}] Démarrage${DRY ? " (DRY RUN)" : ""}`);
  const vus = chargerVus();

  // Email de test : envoie un récap d'exemple (fausses annonces) pour vérifier le rendu.
  if (TESTMAIL) {
    const prio = [{
      annonce: { titre: "[TEST] Dev React/Node — app de réservation", lien: "https://www.codeur.com/projects/000000-exemple", budget: "1 000 € à 10 000 €", montantMoyenDevis: "3 200 €", nbOffres: 6 },
      res: { verdict: "À RÉPONDRE", vaut_le_coup: "oui", compte_rendu: "Pile dans ton cœur de cible (React/Node/Supabase), budget aligné sur le marché et peu de concurrence. À traiter vite.", raison_courte: "Bon fit, bon budget", correspondance_profil: 8, complexite: "moyenne", charge_estimee_jours: 6, prix_estime_juste: "3 500 €", prix_marche: "3 200 €", ratio_prix_travail: "correct", concurrence: "faible", red_flags: ["hébergement à préciser"], questions_a_poser_au_client: ["Hébergement fourni ?", "Nombre d'utilisateurs visés ?"], brouillon_proposition: "Bonjour, votre app de réservation React/Node correspond exactement à mon profil fullstack. J'ai bien noté le besoin de gestion de créneaux en temps réel. Je propose une base Supabase + front React. On peut caler un premier échange cette semaine ?" }
    }];
    const seco = [{
      annonce: { titre: "[TEST] Intégration API de paiement", lien: "https://www.codeur.com/projects/000001-exemple", budget: "Moins de 500 €", montantMoyenDevis: "1 900 €", nbOffres: 22 },
      res: { verdict: "MOYEN", vaut_le_coup: "mitigé", compte_rendu: "Techniquement dans tes cordes, mais budget affiché très en-dessous de la charge réelle et déjà 22 devis. À ne prendre que si le client peut monter le budget.", raison_courte: "Bon fit mais budget bas et forte concurrence", correspondance_profil: 7, complexite: "moyenne", charge_estimee_jours: 4, prix_estime_juste: "2 000 €", prix_marche: "1 900 €", ratio_prix_travail: "mauvais", concurrence: "forte", red_flags: ["budget incohérent vs charge"], questions_a_poser_au_client: ["Le budget est-il ferme ?"], brouillon_proposition: "Bonjour, votre intégration de paiement est réalisable rapidement. Avant de chiffrer précisément, pouvez-vous confirmer le budget et le prestataire de paiement visé ?" }
    }];
    const sujet = "[Codeur] EMAIL DE TEST — 1 prioritaire, 1 à regarder";
    const corps = corpsRecap(prio, seco);
    if (DRY) {
      console.log("\n===== APERÇU (dry) =====\n" + sujet + "\n\n" + corps);
    } else {
      await envoyerRecap(sujet, corps);
      console.log("Email de test envoyé à " + process.env.NOTIFY_TO + ". Vérifie ta boîte (et les spams).");
    }
    return;
  }

  const flux = await parser.parseURL(reglages.rssUrl);
  const items = flux.items || [];
  console.log(`Flux récupéré : ${items.length} annonces.`);

  // Mode initialisation : marque tout le stock actuel comme "déjà vu", sans évaluer.
  if (SEED) {
    for (const it of items) vus[extraireId(it.link)] = Date.now();
    sauverVus(vus);
    console.log(`Initialisation : ${items.length} annonces marquées comme vues. Aucune évaluation, aucun email.`);
    return;
  }

  const nouvelles = items.filter((it) => !vus[extraireId(it.link)]).slice(0, reglages.maxParRun);
  console.log(`Nouvelles annonces à évaluer : ${nouvelles.length}`);

  const prioritaires = [];
  const secondaires = [];

  for (const it of nouvelles) {
    const id = extraireId(it.link);
    const descRss = nettoyerHtml(it.contentSnippet || it.content || it.summary || "");
    const annonce = {
      id,
      titre: it.title || "(sans titre)",
      lien: it.link,
      description: descRss,
      budget: repererBudget(descRss + " " + (it.title || "")),
      categorie: (it.categories || []).join(", ") || null,
      date: it.pubDate || null,
    };

    // Enrichissement via la page publique.
    try {
      const detail = await recupererDetail(it.link);
      annonce.titre = detail.titre || annonce.titre;
      annonce.description = detail.description || annonce.description;
      annonce.budget = detail.budget || annonce.budget;
      annonce.statut = detail.statut;
      annonce.nbOffres = detail.nbOffres;
      annonce.nbVues = detail.nbVues;
      annonce.interactions = detail.interactions;
      annonce.profils = detail.profils;
      annonce.montantMoyenDevis = detail.montantMoyenDevis;
      annonce.delaiEstime = detail.delaiEstime;
      annonce.publication = detail.publication;
      await pause(1500);
    } catch (err) {
      console.error(`  ~ Détail indisponible pour ${id} (${err.message}), éval sur l'extrait RSS.`);
    }

    try {
      const res = await evaluer(annonce);
      console.log(`- ${res.verdict} (${res.correspondance_profil}/10) — ${annonce.titre}`);
      if (reglages.verdictsAlertes.includes(res.verdict)) prioritaires.push({ annonce, res });
      else if (reglages.verdictsSecondaires.includes(res.verdict)) secondaires.push({ annonce, res });
    } catch (err) {
      console.error(`  ! Erreur sur ${id}: ${err.message}`);
    }

    if (!DRY) vus[id] = Date.now();
  }

  // Un seul email récapitulatif si au moins une mission intéressante.
  const total = prioritaires.length + secondaires.length;
  if (total > 0) {
    const sujet = `[Codeur] ${prioritaires.length} prioritaire(s), ${secondaires.length} à regarder`;
    const corps = corpsRecap(prioritaires, secondaires);
    if (DRY) {
      console.log("\n===== APERÇU DE L'EMAIL RÉCAP =====\n" + sujet + "\n\n" + corps + "\n");
    } else {
      await envoyerRecap(sujet, corps);
      console.log(`Email récap envoyé (${total} mission(s)).`);
    }
  } else {
    console.log("Aucune mission intéressante ce passage — pas d'email.");
  }

  if (!DRY) sauverVus(vus);
  console.log("Terminé.");
}

async function main() {
  if (WATCH) {
    const intervalle = (reglages.intervalleSecondes || 90) * 1000;
    console.log(`Mode surveillance continue : vérification toutes les ${reglages.intervalleSecondes || 90} s. Ctrl+C pour arrêter.`);
    // Boucle infinie : une erreur sur un passage n'arrête pas la surveillance.
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try {
        await executerPassage();
      } catch (e) {
        console.error("Passage en erreur (on continue) :", e.message);
      }
      await pause(intervalle);
    }
  } else {
    await executerPassage();
  }
}

main().catch((e) => {
  console.error("Échec:", e);
  process.exit(1);
});
