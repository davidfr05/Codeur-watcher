// scraper.js — Récupère les infos complètes d'une annonce depuis sa page publique codeur.com.
// La page détail est accessible sans connexion : description complète, budget,
// nombre d'offres/vues, montant moyen des devis concurrents, délai estimé, profils recherchés.
import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function texteComplet($) {
  $("script, style, nav, footer, header, svg").remove();
  return $("body")
    .text()
    .replace(/ /g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/\n\s*\n\s*\n+/g, "\n\n")
    .trim();
}

function extraire(re, txt, defaut = null) {
  const m = txt.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : defaut;
}

// Parse le HTML d'une page détail. Exporté pour être testable sans réseau.
export function parserDetail(html) {
  const $ = cheerio.load(html);
  const titre = $("h1").first().text().trim() || null;
  const txt = texteComplet($);

  // Description : le plus long paragraphe (robuste aux changements de mise en page).
  let description = "";
  $("p").each((_, el) => {
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (t.length > description.length) description = t;
  });
  if (description.length < 40) {
    description = $('meta[name="description"]').attr("content") || description;
  }

  const budget =
    extraire(/Budget indicatif\s*:\s*([^\n]+)/i, txt) ||
    extraire(/·\s*([^·\n]*€[^·\n]*)·/i, txt);
  const statut = extraire(/\b(Ouvert|Ferm[ée]|En cours)\b/i, txt);
  const nbOffres = extraire(/(\d+)\s+offres?/i, txt);
  const nbVues = extraire(/(\d+)\s+vues?/i, txt);
  const interactions = extraire(/(\d+)\s+interactions?/i, txt);
  const publication = extraire(/Publication\s*:\s*([^\n]+)/i, txt);
  const profils = extraire(/Profils? recherch[ée]s?\s*:\s*([^\n]+)/i, txt);
  const montantMoyenDevis = extraire(/Montant moyen des devis[^:]*:\s*([\d\s.]+€)/i, txt);
  const delaiEstime = extraire(/Estimation du d[ée]lai\s*:\s*([^\n]+)/i, txt);

  return {
    titre,
    description,
    budget,
    statut,
    nbOffres: nbOffres ? Number(nbOffres) : null,
    nbVues: nbVues ? Number(nbVues) : null,
    interactions: interactions ? Number(interactions) : null,
    publication,
    profils,
    montantMoyenDevis,
    delaiEstime,
  };
}

// Récupère et parse la page détail. Renvoie un objet enrichi.
export async function recupererDetail(lien) {
  const res = await fetch(lien, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${lien}`);
  const html = await res.text();
  return parserDetail(html);
}
