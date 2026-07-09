// index.js — Détecte les nouvelles missions, les qualifie, et envoie UN email récapitulatif (HTML).
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

// ---------- Outils de mise en forme ----------
function esc(s) {
  return String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}
function couleurVerdict(v) {
  if (v === "SUPER PLAN") return "#15803d";
  if (v === "À RÉPONDRE") return "#2563eb";
  if (v === "MOYEN") return "#d97706";
  return "#64748b";
}
function couleurVaut(v) {
  const x = (v || "").toLowerCase();
  if (x === "oui") return "#15803d";
  if (x === "mitigé") return "#d97706";
  return "#dc2626";
}

// ---------- Version TEXTE (fallback des clients mail sans HTML) ----------
function blocAnnonceTexte({ annonce, res: e }) {
  return `${annonce.titre}
${annonce.lien}
=> ${e.verdict} — ça vaut le coup ? ${(e.vaut_le_coup || "?").toUpperCase()}
${e.compte_rendu || e.raison_courte || ""}
Correspondance ${e.correspondance_profil}/10 · Charge ~${e.charge_estimee_jours} j · Budget ${annonce.budget || "—"} · Marché ${annonce.montantMoyenDevis || "—"} · Concurrence ${e.concurrence || "?"}
Brouillon : ${e.brouillon_proposition}`;
}
function corpsRecapTexte(prio, seco) {
  let c = "";
  if (prio.length) c += `À TRAITER EN PRIORITÉ (${prio.length})\n\n` + prio.map(blocAnnonceTexte).join("\n\n----------\n\n");
  if (seco.length) c += (c ? "\n\n======\n\n" : "") + `À REGARDER QUAND MÊME (${seco.length})\n\n` + seco.map(blocAnnonceTexte).join("\n\n----------\n\n");
  return c.trim();
}

// ---------- Version HTML (email principal) ----------
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
  for (let i = 0; i < stats.length; i += 3) {
    rows += "<tr>" + stats.slice(i, i + 3).map(([k, v]) => statCell(k, v)).join("") + "</tr>";
  }
  const redflags = (e.red_flags && e.red_flags.length)
    ? `<div style="margin-top:14px;padding:10px 12px;background:#fef2f2;border-left:3px solid #dc2626;border-radius:4px;font-size:13px;color:#7f1d1d;"><strong>⚠ Points de vigilance :</strong> ${esc(e.red_flags.join(" · "))}</div>` : "";
  const questions = (e.questions_a_poser_au_client && e.questions_a_poser_au_client.length)
    ? `<div style="margin-top:14px;font-size:13px;color:#374151;"><strong>Questions à poser au client :</strong><ul style="margin:6px 0 0 18px;padding:0;">${e.questions_a_poser_au_client.map((q) => `<li style="margin:2px 0;">${esc(q)}</li>`).join("")}</ul></div>` : "";

  return `<table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin:0 0 18px;border:1px solid #e5e7eb;border-left:5px solid ${cv};border-radius:8px;background:#ffffff;">
    <tr><td style="padding:18px 20px;">
      <span style="display:inline-block;background:${cv};color:#ffffff;font-size:11px;font-weight:700;padding:3px 10px;border-radius:999px;letter-spacing:.04em;">${esc(e.verdict)}</span>
      <h2 style="margin:12px 0 2px;font-size:18px;line-height:1.3;color:#0f172a;">
        <a href="${esc(a.lien)}" style="color:#0f172a;text-decoration:none;">${esc(a.titre)}</a>
      </h2>
      <div style="font-size:15px;font-weight:700;color:${cvaut};margin:10px 0 4px;">Ça vaut le coup ? ${esc((e.vaut_le_coup || "?").toUpperCase())}</div>
      <div style="font-size:14px;color:#334155;line-height:1.6;">${esc(e.compte_rendu || e.raison_courte || "")}</div>
      <table width="100%" cellpadding="0" cellspacing="0" role="presentation" style="margin-top:14px;border-collapse:collapse;">${rows}</table>
      ${redflags}
      ${questions}
      <div style="margin-top:16px;">
        <div style="font-size:11px;color:#6b7280;text-transform:uppercase;letter-spacing:.03em;margin-bottom:5px;">Brouillon de proposition</div>
        <div style="padding:12px 14px;background:#f8fafc;border:1px solid #e5e7eb;border-radius:6px;font-size:14px;color:#111827;line-height:1.55;white-space:pre-wrap;">${esc(e.brouillon_proposition)}</div>
      </div>
      <div style="margin-top:16px;">
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
        <div style="font-size:22px;font-weight:800;color:#0f172a;margin-top:4px;">
          ${prio.length} mission${prio.length > 1 ? "s" : ""} à traiter${seco.length ? ` · ${seco.length} à regarder` : ""}
        </div>
      </td></tr>
      ${sectionHTML("À traiter en priorité", "#15803d", prio)}
      ${sectionHTML("À regarder quand même — un bémol (prix, concurrence ou brief)", "#d97706", seco)}
      <tr><td style="padding:16px;text-align:center;font-size:12px;color:#94a3b8;">
        Envoyé automatiquement par ton serveur de veille · ${total} mission${total > 1 ? "s" : ""} ce passage
      </td></tr>
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
  const t = transporteur();
  await t.sendMail({
    from: process.env.SMTP_USER,
    to: process.env.NOTIFY_TO,
    subject: sujet,
    text: texte,
    html,
  });
}

// ---------- Boucle principale ----------
async function executerPassage() {
  console.log(`[${new Date().toISOString()}] Démarrage${DRY ? " (DRY RUN)" : ""}`);
  const vus = chargerVus();

  // Email de test : envoie un récap d'exemple (fausses annonces) pour vérifier le rendu.
  if (TESTMAIL) {
    const prio = [{
      annonce: { titre: "[TEST] Dev React/Node — app de réservation en temps réel", lien: "https://www.codeur.com/projects/000000-exemple", budget: "1 000 € à 10 000 €", montantMoyenDevis: "3 200 €", nbOffres: 6 },
      res: { verdict: "À RÉPONDRE", vaut_le_coup: "oui", compte_rendu: "Pile dans ton cœur de cible (React/Node/Supabase), budget aligné sur le marché et peu de concurrence. Charge dans ta limite. À traiter vite.", raison_courte: "Bon fit, bon budget", correspondance_profil: 8, complexite: "moyenne", charge_estimee_jours: 6, prix_estime_juste: "3 500 €", prix_marche: "3 200 €", ratio_prix_travail: "correct", concurrence: "faible", red_flags: ["hébergement à préciser"], questions_a_poser_au_client: ["Hébergement fourni ?", "Nombre d'utilisateurs visés ?"], brouillon_proposition: "Bonjour, votre app de réservation React/Node correspond exactement à mon profil fullstack. J'ai bien noté le besoin de gestion de créneaux en temps réel. Je propose une base Supabase + front React. On peut caler un premier échange cette semaine ?" }
    }];
    const seco = [{
      annonce: { titre: "[TEST] Intégration API de paiement Stripe", lien: "https://www.codeur.com/projects/000001-exemple", budget: "Moins de 500 €", montantMoyenDevis: "1 900 €", nbOffres: 22 },
      res: { verdict: "MOYEN", vaut_le_coup: "mitigé", compte_rendu: "Techniquement dans tes cordes, mais budget affiché très en-dessous de la charge réelle et déjà 22 devis. À ne prendre que si le client peut monter le budget.", raison_courte: "Bon fit mais budget bas et forte concurrence", correspondance_profil: 7, complexite: "moyenne", charge_estimee_jours: 4, prix_estime_juste: "2 000 €", prix_marche: "1 900 €", ratio_prix_travail: "mauvais", concurrence: "forte", red_flags: ["budget incohérent vs charge"], questions_a_poser_au_client: ["Le budget est-il ferme ?"], brouillon_proposition: "Bonjour, votre intégration Stripe est réalisable rapidement. Avant de chiffrer précisément, pouvez-vous confirmer le budget et le prestataire de paiement visé ?" }
    }];
    const sujet = "[Codeur] EMAIL DE TEST — 1 prioritaire, 1 à regarder";
    const texte = corpsRecapTexte(prio, seco);
    const html = corpsRecapHTML(prio, seco);
    if (DRY) {
      fs.writeFileSync("apercu-email.html", html);
      console.log("Aperçu HTML écrit dans apercu-email.html (ouvre ce fichier dans un navigateur).");
    } else {
      await envoyerRecap(sujet, texte, html);
      console.log("Email de test envoyé à " + process.env.NOTIFY_TO + ". Vérifie ta boîte (et les spams).");
    }
    return;
  }

  const flux = await parser.parseURL(reglages.rssUrl);
  const items = flux.items || [];
  console.log(`Flux récupéré : ${items.length} annonces.`);

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

  const total = prioritaires.length + secondaires.length;
  if (total > 0) {
    const sujet = `[Codeur] ${prioritaires.length} prioritaire(s), ${secondaires.length} à regarder`;
    const texte = corpsRecapTexte(prioritaires, secondaires);
    const html = corpsRecapHTML(prioritaires, secondaires);
    if (DRY) {
      fs.writeFileSync("apercu-email.html", html);
      console.log(`\n${total} mission(s) retenue(s). Aperçu écrit dans apercu-email.html.`);
    } else {
      await envoyerRecap(sujet, texte, html);
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
