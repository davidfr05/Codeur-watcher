// index.js — Détecte, pré-filtre, évalue (Haiku), rédige la proposition (Sonnet), envoie 1 email récap HTML.
//
// Usage :
//   node index.js            -> exécution normale (évalue + envoie 1 email récap)
//   node index.js --dry      -> évalue et écrit un aperçu, SANS email ni mémorisation
//   node index.js --seed     -> marque TOUT le stock actuel comme déjà vu (1x avant la prod)
//   node index.js --test-mail-> envoie un email récap d'EXEMPLE (vérifier format + SMTP)
//   node index.js --watch    -> surveillance continue (boucle) pour un serveur toujours allumé
//
import "dotenv/config";
import fs from "fs";
import Parser from "rss-parser";
import Anthropic from "@anthropic-ai/sdk";
import nodemailer from "nodemailer";
import { reglages } from "./config.js";
import { construirePromptEvaluation, construirePromptProposition } from "./prompt.js";
import { recupererDetail } from "./scraper.js";

const DRY = process.argv.includes("--dry");
const SEED = process.argv.includes("--seed");
const TESTMAIL = process.argv.includes("--test-mail");
const WATCH = process.argv.includes("--watch");
const VERSION = "2.0 — pré-filtre + Haiku(éval) + Sonnet(propo) + format v2";
const parser = new Parser({ timeout: 20000 });
const pause = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- Mémoire des annonces déjà vues ----------
function chargerVus() {
  try {
    const data = JSON.parse(fs.readFileSync(reglages.fichierVus, "utf8"));
    const limite = Date.now() - reglages.retentionJours * 86400000;
    const frais = {};
    for (const [id, ts] of Object.entries(data)) if (ts > limite) frais[id] = ts;
    return frais;
  } catch {
    return {};
  }
}
function sauverVus(vus) {
  fs.writeFileSync(reglages.fichierVus, JSON.stringify(vus, null, 2));
}

// ---------- Utilitaires ----------
function extraireId(link = "") {
  const m = link.match(/\/projects\/(\d+)/);
  return m ? m[1] : link;
}
function nettoyerHtml(s = "") {
  return s.replace(/<[^>]+>/g, " ").replace(/&nbsp;/g, " ").replace(/&amp;/g, "&").replace(/&#\d+;/g, " ").replace(/\s+/g, " ").trim();
}
function repererBudget(texte = "") {
  const patterns = [
    /moins de \d[\d\s.]*\s*€/i,
    /\d[\d\s.]*\s*€\s*(?:à|-|–)\s*\d[\d\s.]*\s*€/i,
    /\d[\d\s.]*\s*€\s*et plus/i,
    /\d[\d\s.]*\s*(?:à|-|–)\s*\d[\d\s.]*\s*€\s*\/\s*jour/i,
  ];
  for (const p of patterns) { const m = texte.match(p); if (m) return m[0].replace(/\s+/g, " ").trim(); }
  return null;
}
// Pré-filtre gratuit : renvoie le mot-clé bloquant trouvé, ou null.
function motBloquant(texte = "") {
  const t = texte.toLowerCase();
  return (reglages.preFiltreMotsCles || []).find((m) => t.includes(m.toLowerCase())) || null;
}

// ---------- Appels IA ----------
const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

function extraireJson(texte) {
  let t = texte.replace(/^```(?:json)?/i, "").replace(/```$/i, "").trim();
  const d = t.indexOf("{"), f = t.lastIndexOf("}");
  if (d === -1 || f === -1) throw new Error("pas de JSON exploitable: " + t.slice(0, 120));
  return JSON.parse(t.slice(d, f + 1));
}

// Évaluation (modèle économique).
async function evaluer(annonce) {
  const msg = await anthropic.messages.create({
    model: reglages.modeleEvaluation,
    max_tokens: 3000,
    system: "Tu réponds UNIQUEMENT avec un objet JSON valide et complet. Pas de texte autour, pas de balises markdown.",
    messages: [{ role: "user", content: construirePromptEvaluation(annonce) }],
  });
  if (msg.stop_reason === "max_tokens") throw new Error("évaluation tronquée (max_tokens)");
  return extraireJson(msg.content.map((c) => c.text || "").join("").trim());
}

// Rédaction de la proposition (modèle qualité), seulement pour les annonces retenues.
async function redigerProposition(annonce, evaluation) {
  const msg = await anthropic.messages.create({
    model: reglages.modeleProposition,
    max_tokens: 1200,
    messages: [{ role: "user", content: construirePromptProposition(annonce, evaluation) }],
  });
  return msg.content.map((c) => c.text || "").join("").trim();
}

// ---------- Mise en forme ----------
function esc(s) { return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;"); }
function couleurVerdict(v) { if (v === "SUPER PLAN") return "#15803d"; if (v === "À RÉPONDRE") return "#2563eb"; if (v === "MOYEN") return "#d97706"; return "#64748b"; }
function couleurVaut(v) { const x = (v || "").toLowerCase(); if (x === "oui") return "#15803d"; if (x === "mitigé") return "#d97706"; return "#dc2626"; }
function labelSection(txt) { return `<div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.04em;font-weight:700;margin:18px 0 6px;">${esc(txt)}</div>`; }
function liste(items) { return `<ul style="margin:0 0 0 18px;padding:0;font-size:14px;color:#334155;line-height:1.55;">${(items || []).map((x) => `<li style="margin:3px 0;">${esc(x)}</li>`).join("")}</ul>`; }

// Version texte (fallback)
function blocAnnonceTexte({ annonce, res: e }) {
  return `${annonce.titre}
${annonce.lien}
[${e.verdict}]
LA DEMANDE : ${e.resume_demande || ""}
Correspondance ${e.correspondance_profil}/10 · Charge ~${e.charge_estimee_jours} j · Budget ${annonce.budget || "—"} · Marché ${annonce.montantMoyenDevis || "—"} · Concurrence ${e.concurrence || "?"}
À ÉCLAIRCIR : ${(e.questions_a_poser_au_client || []).join(" ; ") || "-"}
--- PROPOSITION DE RÉPONSE ---
${e.brouillon_proposition || ""}
--- MON AVIS --- (ça vaut le coup ? ${(e.vaut_le_coup || "?").toUpperCase()})
${e.compte_rendu || ""}
Difficultés : ${(e.difficultes || []).join(" ; ") || "aucune notable"}`;
}
function corpsRecapTexte(prio, seco) {
  let c = "";
  if (prio.length) c += `À TRAITER EN PRIORITÉ (${prio.length})\n\n` + prio.map(blocAnnonceTexte).join("\n\n==========\n\n");
  if (seco.length) c += (c ? "\n\n######\n\n" : "") + `À REGARDER QUAND MÊME (${seco.length})\n\n` + seco.map(blocAnnonceTexte).join("\n\n==========\n\n");
  return c.trim();
}

// Version HTML
function statCell(label, valeur) {
  return `<td width="33%" valign="top" style="padding:8px 10px;border:1px solid #e5e7eb;">
    <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.03em;">${esc(label)}</div>
    <div style="font-size:14px;color:#111827;font-weight:600;margin-top:2px;">${esc(valeur)}</div>
  </td>`;
}
function blocAnnonceHTML({ annonce: a, res: e }) {
  const cv = couleurVerdict(e.verdict);
  const cvaut = couleurVaut(e.vaut_le_coup);
  const stats = [
    ["Correspondance", `${e.correspondance_profil}/10`],
    ["Charge estimée", `${e.charge_estimee_jours} j`],
    ["Complexité", e.complexite || "—"],
    ["Budget affiché", a.budget || "—"],
    ["Prix marché", a.montantMoyenDevis || e.prix_marche || "—"],
    ["Concurrence", `${e.concurrence || "?"} (${a.nbOffres ?? "?"} offres)`],
  ];
  let rows = "";
  for (let i = 0; i < stats.length; i += 3) rows += "<tr>" + stats.slice(i, i + 3).map(([k, v]) => statCell(k, v)).join("") + "</tr>";
  const vigilance = (e.red_flags && e.red_flags.length)
    ? `<div style="margin-top:12px;padding:10px 12px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:4px;font-size:13px;color:#7f1d1d;"><strong>⚠ Points de vigilance :</strong> ${esc(e.red_flags.join(" · "))}</div>` : "";
  const questions = (e.questions_a_poser_au_client && e.questions_a_poser_au_client.length)
    ? labelSection("À éclaircir avec le client") + liste(e.questions_a_poser_au_client) : "";
  const propo = (e.brouillon_proposition && e.brouillon_proposition.trim())
    ? labelSection("Proposition de réponse (prête à envoyer)") + `<div style="padding:12px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;color:#111827;line-height:1.6;white-space:pre-wrap;">${esc(e.brouillon_proposition)}</div>` : "";
  const difficultes = (e.difficultes && e.difficultes.length)
    ? `<div style="margin-top:8px;font-size:14px;color:#334155;"><strong>Difficultés :</strong> ${esc(e.difficultes.join(" · "))}</div>` : "";

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 18px;border:1px solid #e5e7eb;border-left:5px solid ${cv};border-radius:8px;background:#ffffff;">
    <tr><td style="padding:18px 20px;">
      <span style="display:inline-block;background:${cv};color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:.04em;">${esc(e.verdict)}</span>
      <h2 style="margin:12px 0 2px;font-size:18px;line-height:1.3;color:#0f172a;">
        <a href="${esc(a.lien)}" style="color:#0f172a;text-decoration:none;">${esc(a.titre)}</a>
      </h2>
      ${labelSection("La demande")}
      <div style="font-size:14px;color:#334155;line-height:1.6;">${esc(e.resume_demande || "")}</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:14px;border-collapse:collapse;">${rows}</table>
      ${vigilance}
      ${questions}
      ${propo}
      ${labelSection("Mon avis")}
      <div style="font-size:15px;font-weight:700;color:${cvaut};margin-bottom:4px;">Ça vaut le coup ? ${esc((e.vaut_le_coup || "?").toUpperCase())}</div>
      <div style="font-size:14px;color:#334155;line-height:1.6;">${esc(e.compte_rendu || e.raison_courte || "")}</div>
      ${difficultes}
      <div style="margin-top:18px;">
        <a href="${esc(a.lien)}" style="display:inline-block;background:${cv};color:#ffffff;text-decoration:none;padding:11px 20px;border-radius:6px;font-size:14px;font-weight:600;">Voir / répondre sur Codeur →</a>
      </div>
    </td></tr>
  </table>`;
}
function sectionHTML(titre, couleur, items) {
  if (!items.length) return "";
  return `<tr><td style="padding:6px 16px 2px;">
      <div style="font-size:12px;font-weight:700;color:${couleur};text-transform:uppercase;letter-spacing:.06em;margin:10px 0 8px;">${esc(titre)} (${items.length})</div>
    </td></tr>
    <tr><td style="padding:0 16px;">${items.map(blocAnnonceHTML).join("")}</td></tr>`;
}
function corpsRecapHTML(prio, seco) {
  const total = prio.length + seco.length;
  const date = new Date().toLocaleString("fr-FR", { dateStyle: "full", timeStyle: "short" });
  return `<div style="font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;background:#f1f5f9;padding:24px 0;">
    <table width="600" align="center" cellpadding="0" cellspacing="0" role="presentation" style="width:600px;max-width:600px;margin:0 auto;">
      <tr><td style="padding:0 16px 12px;">
        <div style="font-size:12px;color:#64748b;">CODEUR WATCHER · ${esc(date)}</div>
        <div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:4px;">${prio.length} mission${prio.length > 1 ? "s" : ""} à traiter${seco.length ? ` · ${seco.length} à regarder` : ""}</div>
      </td></tr>
      ${sectionHTML("À traiter en priorité", "#15803d", prio)}
      ${sectionHTML("À regarder quand même", "#d97706", seco)}
      <tr><td style="padding:16px;text-align:center;font-size:12px;color:#94a3b8;">Envoyé automatiquement par ton serveur de veille · ${total} mission${total > 1 ? "s" : ""} ce passage</td></tr>
    </table>
  </div>`;
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
async function envoyerRecap(sujet, texte, html) {
  await transporteur().sendMail({ from: process.env.SMTP_USER, to: process.env.NOTIFY_TO, subject: sujet, text: texte, html });
}

// ---------- Exemple pour --test-mail ----------
function exemples() {
  const prio = [{
    annonce: { titre: "Développeur pour une app web de réservation sur-mesure", lien: "https://www.codeur.com/projects/000000-exemple", budget: "1 000 € à 10 000 €", montantMoyenDevis: "3 200 €", nbOffres: 6 },
    res: { verdict: "À RÉPONDRE", vaut_le_coup: "oui", resume_demande: "Le client veut une application web de réservation de créneaux en temps réel pour ses salles, avec un back-office simple.", correspondance_profil: 8, complexite: "moyenne", charge_estimee_jours: 6, difficultes: ["créneaux concurrents en temps réel", "synchronisation multi-salles"], prix_estime_juste: "1 080 €", prix_marche: "3 200 €", ratio_prix_travail: "correct", concurrence: "faible", compte_rendu: "Projet pile dans mon cœur de cible, budget marché confortable et peu de concurrence. Charge dans ma limite. À traiter vite.", raison_courte: "Bon fit, bon marché", red_flags: ["hébergement non précisé"], questions_a_poser_au_client: ["L'hébergement est-il fourni ?", "Combien d'utilisateurs simultanés ?"], brouillon_proposition: "Bonjour,\n\nVotre projet de réservation en temps réel a retenu toute mon attention : la gestion de créneaux par salle est exactement le type de développement sur-mesure que j'affectionne. Je vous proposerais une base React + Node avec Supabase pour une synchronisation fiable même en accès simultanés. Développeur junior motivé et à jour sur les outils modernes, je m'investirais pour livrer un outil simple et robuste. J'estime le travail entre 5 et 7 jours, soit un ordre de grandeur de 900 à 1 400 € à affiner ensemble. Seriez-vous disponible cette semaine pour un court échange ?\n\nBien cordialement,\nDavid" },
  }];
  const seco = [{
    annonce: { titre: "Intégration d'un paiement en ligne", lien: "https://www.codeur.com/projects/000001-exemple", budget: "Moins de 500 €", montantMoyenDevis: "1 900 €", nbOffres: 22 },
    res: { verdict: "MOYEN", vaut_le_coup: "mitigé", resume_demande: "Ajouter un paiement en ligne à un site existant, plateforme non précisée.", correspondance_profil: 7, complexite: "moyenne", charge_estimee_jours: 4, difficultes: ["stack existante inconnue", "sécurité des paiements"], prix_estime_juste: "720 €", prix_marche: "1 900 €", ratio_prix_travail: "mauvais", concurrence: "forte", compte_rendu: "Faisable et dans mes cordes, mais budget très bas et 22 devis déjà envoyés. À poursuivre seulement si le budget peut monter.", raison_courte: "Budget bas, forte concurrence", red_flags: ["budget incohérent", "22 offres"], questions_a_poser_au_client: ["Site sur-mesure ou CMS ?", "Le budget est-il ferme ?"], brouillon_proposition: "Bonjour,\n\nL'ajout d'un paiement en ligne est tout à fait dans mes compétences. Pour vous proposer une solution fiable, pourriez-vous préciser sur quelle base votre site est développé ? Je m'appuierais sur une intégration éprouvée (Stripe) pour une mise en place propre et sécurisée. Selon le périmètre, je situe l'intervention autour de 3 à 5 jours, à ajuster ensemble. Souhaitez-vous en discuter ?\n\nBien cordialement,\nDavid" },
  }];
  return { prio, seco };
}

// ---------- Boucle principale ----------
async function executerPassage() {
  console.log(`[${new Date().toISOString()}] Démarrage — version ${VERSION}${DRY ? " (DRY RUN)" : ""}`);
  const vus = chargerVus();

  if (TESTMAIL) {
    const { prio, seco } = exemples();
    const sujet = "[Codeur] EMAIL DE TEST — 1 prioritaire, 1 à regarder";
    const html = corpsRecapHTML(prio, seco);
    if (DRY) { fs.writeFileSync("apercu-email.html", html); console.log("Aperçu écrit dans apercu-email.html."); }
    else { await envoyerRecap(sujet, corpsRecapTexte(prio, seco), html); console.log("Email de test envoyé à " + process.env.NOTIFY_TO + "."); }
    return;
  }

  const flux = await parser.parseURL(reglages.rssUrl);
  const items = flux.items || [];
  console.log(`Flux récupéré : ${items.length} annonces.`);

  if (SEED) {
    for (const it of items) vus[extraireId(it.link)] = Date.now();
    sauverVus(vus);
    console.log(`Initialisation : ${items.length} annonces marquées comme vues.`);
    return;
  }

  const nouvelles = items.filter((it) => !vus[extraireId(it.link)]).slice(0, reglages.maxParRun);
  console.log(`Nouvelles annonces : ${nouvelles.length}`);

  const prioritaires = [], secondaires = [];
  let filtrees = 0;

  for (const it of nouvelles) {
    const id = extraireId(it.link);

    // Pré-filtre gratuit (titre + catégories RSS), avant tout appel réseau/IA.
    const mot = motBloquant((it.title || "") + " " + ((it.categories || []).join(" ")));
    if (mot) {
      filtrees++;
      console.log(`- (pré-filtré: ${mot}) ${it.title}`);
      if (!DRY) vus[id] = Date.now();
      continue;
    }

    const descRss = nettoyerHtml(it.contentSnippet || it.content || it.summary || "");
    const annonce = {
      id, titre: it.title || "(sans titre)", lien: it.link, description: descRss,
      budget: repererBudget(descRss + " " + (it.title || "")),
      categorie: (it.categories || []).join(", ") || null, date: it.pubDate || null,
    };

    try {
      const detail = await recupererDetail(it.link);
      annonce.titre = detail.titre || annonce.titre;
      annonce.description = detail.description || annonce.description;
      annonce.budget = detail.budget || annonce.budget;
      annonce.statut = detail.statut;
      annonce.nbOffres = detail.nbOffres;
      annonce.nbVues = detail.nbVues;
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

      const emailable = reglages.verdictsAlertes.includes(res.verdict) || reglages.verdictsSecondaires.includes(res.verdict);
      res.brouillon_proposition = "";
      if (emailable && res.vaut_le_coup !== "non") {
        try {
          res.brouillon_proposition = await redigerProposition(annonce, res);
        } catch (err) {
          console.error(`  ! Proposition échouée pour ${id}: ${err.message}`);
        }
      }

      if (reglages.verdictsAlertes.includes(res.verdict)) prioritaires.push({ annonce, res });
      else if (reglages.verdictsSecondaires.includes(res.verdict)) secondaires.push({ annonce, res });
    } catch (err) {
      console.error(`  ! Erreur sur ${id}: ${err.message}`);
    }

    if (!DRY) vus[id] = Date.now();
  }

  console.log(`Pré-filtrées : ${filtrees}. Évaluées : ${nouvelles.length - filtrees}.`);

  const total = prioritaires.length + secondaires.length;
  if (total > 0) {
    const sujet = `[Codeur] ${prioritaires.length} prioritaire(s), ${secondaires.length} à regarder`;
    const html = corpsRecapHTML(prioritaires, secondaires);
    if (DRY) { fs.writeFileSync("apercu-email.html", html); console.log(`\n${total} mission(s) retenue(s). Aperçu écrit dans apercu-email.html.`); }
    else { await envoyerRecap(sujet, corpsRecapTexte(prioritaires, secondaires), html); console.log(`Email récap envoyé (${total} mission(s)).`); }
  } else {
    console.log("Aucune mission intéressante ce passage — pas d'email.");
  }

  if (!DRY) sauverVus(vus);
  console.log("Terminé.");
}

async function main() {
  if (WATCH) {
    const intervalle = (reglages.intervalleSecondes || 90) * 1000;
    console.log(`Mode surveillance continue : toutes les ${reglages.intervalleSecondes || 90} s. Ctrl+C pour arrêter.`);
    // eslint-disable-next-line no-constant-condition
    while (true) {
      try { await executerPassage(); } catch (e) { console.error("Passage en erreur (on continue) :", e.message); }
      await pause(intervalle);
    }
  } else {
    await executerPassage();
  }
}

main().catch((e) => { console.error("Échec:", e); process.exit(1); });
