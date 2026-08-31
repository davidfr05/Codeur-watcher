// scraper.js — Récupère les infos complètes d'une annonce depuis sa page publique codeur.com.
import * as cheerio from "cheerio";

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0 Safari/537.36";

function texteComplet($) {
  $("script, style, nav, footer, header, svg").remove();
  return $("body").text().replace(/ /g, " ").replace(/[ \t]+/g, " ").replace(/\n\s*\n\s*\n+/g, "\n\n").trim();
}
function extraire(re, txt, defaut = null) {
  const m = txt.match(re);
  return m ? m[1].replace(/\s+/g, " ").trim() : defaut;
}

// Paragraphes de boilerplate à ignorer (ne font pas partie de la description).
const SKIP = /sur codeur\.com|trouver un freelance|déposez un projet|recevez.*devis|meilleurs? .* freelances|projet similaire|inscrivez-vous|créez votre compte|réservé aux prestataires/i;
// Marqueurs de FIN de la description (tout ce qui suit n'est plus la description).
const STOP = /budget indicatif|profils?\s+recherch|freelances?\s+ont répondu|montant moyen des devis|estimation du d[ée]lai/i;

export function parserDetail(html) {
  const $ = cheerio.load(html);
  const titre = $("h1").first().text().trim() || null;
  const txt = texteComplet($);

  // Description = TOUS les paragraphes de contenu (multi-paragraphes), dans l'ordre,
  // jusqu'au premier marqueur de fin. On ignore le boilerplate.
  const parts = [];
  let stop = false;
  $("p").each((_, el) => {
    if (stop) return;
    const t = $(el).text().replace(/\s+/g, " ").trim();
    if (!t) return;
    if (STOP.test(t)) { stop = true; return; }
    if (SKIP.test(t)) return;
    if (t.length >= 20) parts.push(t);
  });
  let description = parts.join("\n\n");
  // Repli si rien de solide n'a été trouvé.
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
    titre, description, budget, statut,
    nbOffres: nbOffres ? Number(nbOffres) : null,
    nbVues: nbVues ? Number(nbVues) : null,
    interactions: interactions ? Number(interactions) : null,
    publication, profils, montantMoyenDevis, delaiEstime,
  };
}

export async function recupererDetail(lien) {
  const res = await fetch(lien, { headers: { "User-Agent": UA }, redirect: "follow" });
  if (!res.ok) throw new Error(`HTTP ${res.status} sur ${lien}`);
  const html = await res.text();
  return parserDetail(html);
}
