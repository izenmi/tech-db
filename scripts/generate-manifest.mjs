// Reads public/data/source/*.json (hand-authored) and writes public/data/generated/*.json:
// denormalized, name-resolved data ready for direct rendering, plus reference-integrity
// checks so a typo'd id fails the build instead of silently rendering blank names.
import { readFileSync, writeFileSync, mkdirSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(rootDir, "public", "data", "source");
const outDir = path.join(rootDir, "public", "data", "generated");

function readSource(name) {
  return JSON.parse(readFileSync(path.join(sourceDir, `${name}.json`), "utf-8"));
}

const works = readSource("works");
const authors = readSource("authors");
const techs = readSource("techs");
const translators = readSource("translators");
const publishers = readSource("publishers");
const themes = readSource("themes");
const awards = readSource("awards");

// Optional: built by `npm run fetch-covers` (scripts/fetch-covers.mjs), which resolves an ISBN
// and cover image URL per work via the Rakuten/BOOK☆WALKER stores, then commits the result here
// so builds stay offline/deterministic. Absent entries just mean "no cover resolved yet".
const coversCachePath = path.join(sourceDir, "covers-cache.json");
const coversCache = existsSync(coversCachePath) ? JSON.parse(readFileSync(coversCachePath, "utf-8")) : {};

const authorsById = new Map(authors.map((a) => [a.id, a]));
const techsById = new Map(techs.map((t) => [t.id, t]));
const translatorsById = new Map(translators.map((t) => [t.id, t]));
const publishersById = new Map(publishers.map((p) => [p.id, p]));
const themesById = new Map(themes.map((t) => [t.id, t]));
const awardsById = new Map(awards.map((a) => [a.id, a]));

const LEVELS = ["beginner", "intermediate", "advanced"];
const TECH_CATEGORIES = ["language", "framework", "infra", "database", "tool", "concept"];

const errors = [];

function checkRef(map, id, kind, workId) {
  if (!map.has(id)) errors.push(`work "${workId}": unknown ${kind} id "${id}"`);
}

for (const w of works) {
  if (!Array.isArray(w.authorIds) || w.authorIds.length === 0) {
    errors.push(`work "${w.id}": authorIds must list at least one author`);
  }
  w.authorIds.forEach((id) => checkRef(authorsById, id, "author", w.id));
  // techIds may be empty — 技術非依存の本(『人月の神話』等)があるため。存在チェックだけ行う。
  w.techIds.forEach((id) => checkRef(techsById, id, "tech", w.id));
  w.translatorIds.forEach((id) => checkRef(translatorsById, id, "translator", w.id));
  checkRef(publishersById, w.publisherId, "publisher", w.id);
  w.themeIds.forEach((id) => checkRef(themesById, id, "theme", w.id));
  (w.awardResults ?? []).forEach((r) => checkRef(awardsById, r.awardId, "award", w.id));

  // ISBN is optional, but a malformed one would silently break the cover lookup, so it fails
  // the build the same way a bad id reference does.
  if (w.isbn != null && !/^97[89]\d{10}$/.test(w.isbn)) {
    errors.push(`work "${w.id}": isbn must be a 13-digit ISBN with no hyphens (got "${w.isbn}")`);
  }

  if (!LEVELS.includes(w.level)) {
    errors.push(`work "${w.id}": level must be one of ${LEVELS.join("/")} (got "${w.level}")`);
  }

  // origin drives which translation fields are meaningful; catching a mismatch here is what
  // stops a 邦訳 work from silently rendering with no translator credit.
  if (w.origin !== "jp" && w.origin !== "overseas") {
    errors.push(`work "${w.id}": origin must be "jp" or "overseas" (got "${w.origin}")`);
  } else if (w.origin === "overseas") {
    if (w.translatorIds.length === 0) errors.push(`work "${w.id}": overseas work needs at least one translator`);
    if (!w.originalTitle) errors.push(`work "${w.id}": overseas work needs originalTitle`);
  } else {
    if (w.translatorIds.length > 0) errors.push(`work "${w.id}": domestic work must not have translators`);
    if (w.originalTitle) errors.push(`work "${w.id}": domestic work must not have originalTitle`);
    if (w.jpPublishedYear) errors.push(`work "${w.id}": domestic work must not have jpPublishedYear`);
  }
}

const workIds = new Set();
for (const w of works) {
  if (workIds.has(w.id)) errors.push(`duplicate work id "${w.id}"`);
  workIds.add(w.id);
}

for (const t of techs) {
  if (!TECH_CATEGORIES.includes(t.category)) {
    errors.push(`tech "${t.id}": category must be one of ${TECH_CATEGORIES.join("/")} (got "${t.category}")`);
  }
}

for (const [label, list] of [
  ["author", authors],
  ["tech", techs],
  ["translator", translators],
  ["publisher", publishers],
  ["theme", themes],
  ["award", awards],
]) {
  const seen = new Set();
  for (const item of list) {
    if (seen.has(item.id)) errors.push(`duplicate ${label} id "${item.id}"`);
    seen.add(item.id);
  }
}

if (errors.length > 0) {
  console.error("generate-manifest: reference integrity errors:");
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

/** The year this book, as a reader can buy it in Japanese today, was published: the edition we
 *  catalogued, else the Japanese edition of a translated book, else first publication. Keep in
 *  sync with bookYear() in src/ui/common/bookYear.ts, which documents why a translated book must
 *  not be labelled with its original-language year. */
function editionYear(w) {
  return w.latestEditionYear ?? w.jpPublishedYear ?? w.firstPublishedYear;
}

// ---- related works ("この本が好きなら") ----
// Cosine similarity over IDF-weighted theme tags, plus a bonus for sharing a technology or author.
// IDF matters because the tag vocabulary is deliberately small and reused (see CLAUDE.md
// 「テーマタグの方針」): a tag carried by hundreds of books says almost nothing about similarity,
// while a rare one is highly informative. Weighting every shared tag equally would just
// surface the most generic books on every page.
// The technology bonus outranks the author bonus here (mystery-db has it the other way round):
// "another book about the same technology" is a stronger recommendation for a technical reader
// than "another book by the same person".
const RELATED_COUNT = 6;
const SAME_TECH_BONUS = 0.15;
const SAME_AUTHOR_BONUS = 0.1;

const worksById = new Map(works.map((x) => [x.id, x]));

const tagsOf = (x) => x.themeIds;

const tagDocFreq = new Map();
for (const x of works) {
  for (const t of tagsOf(x)) tagDocFreq.set(t, (tagDocFreq.get(t) ?? 0) + 1);
}
// A tag carried by every work gets idf 0 and drops out of the scoring entirely.
const tagIdf = new Map([...tagDocFreq].map(([t, df]) => [t, Math.log(works.length / df)]));

const tagNorm = new Map(
  works.map((x) => {
    let sumSquares = 0;
    for (const t of tagsOf(x)) sumSquares += tagIdf.get(t) ** 2;
    return [x.id, Math.sqrt(sumSquares)];
  }),
);

const tagToItems = new Map();
for (const x of works) {
  for (const t of tagsOf(x)) {
    if (!tagToItems.has(t)) tagToItems.set(t, []);
    tagToItems.get(t).push(x);
  }
}

function relatedIdsFor(item) {
  // Accumulate the dot product only over works that share at least one tag, rather than
  // scanning all N works for each of N works.
  const dotProducts = new Map();
  for (const t of tagsOf(item)) {
    const weight = tagIdf.get(t) ** 2;
    if (weight === 0) continue;
    for (const other of tagToItems.get(t)) {
      if (other.id === item.id) continue;
      dotProducts.set(other.id, (dotProducts.get(other.id) ?? 0) + weight);
    }
  }

  const ownTechs = new Set(item.techIds);
  const ownAuthors = new Set(item.authorIds);

  // Same-technology and same-author books are strong recommendations even with no tag overlap,
  // so seed them in rather than letting the tag filter drop them.
  for (const other of works) {
    if (other.id === item.id || dotProducts.has(other.id)) continue;
    if (other.techIds.some((id) => ownTechs.has(id)) || other.authorIds.some((id) => ownAuthors.has(id))) {
      dotProducts.set(other.id, 0);
    }
  }

  const ownNorm = tagNorm.get(item.id);
  const scored = [];
  for (const [otherId, dot] of dotProducts) {
    const other = worksById.get(otherId);
    const otherNorm = tagNorm.get(otherId);
    let score = ownNorm > 0 && otherNorm > 0 ? dot / (ownNorm * otherNorm) : 0;
    if (other.techIds.some((id) => ownTechs.has(id))) score += SAME_TECH_BONUS;
    if (other.authorIds.some((id) => ownAuthors.has(id))) score += SAME_AUTHOR_BONUS;
    if (score > 0) scored.push({ id: otherId, score });
  }

  // Tie-break by id so the output (and therefore the prerendered HTML) is stable across builds.
  scored.sort((a, b) => b.score - a.score || a.id.localeCompare(b.id));
  return scored.slice(0, RELATED_COUNT).map((s) => s.id);
}

const relatedById = new Map(works.map((x) => [x.id, relatedIdsFor(x)]));

// ---- generated/works.json ----
const worksGenerated = works.map((w) => ({
  relatedWorkIds: relatedById.get(w.id),
  ...w,
  authorNames: w.authorIds.map((id) => authorsById.get(id).name),
  techNames: w.techIds.map((id) => techsById.get(id).name),
  translatorNames: w.translatorIds.map((id) => translatorsById.get(id).name),
  publisherName: publishersById.get(w.publisherId).name,
  themeNames: w.themeIds.map((id) => themesById.get(id).name),
  awardSummaries: (w.awardResults ?? []).map((r) => ({
    awardId: r.awardId,
    awardName: awardsById.get(r.awardId).name,
    year: r.year,
    result: r.result,
  })),
  coverUrl: coversCache[w.id]?.coverUrl ?? undefined,
}));

// Cross-reference lists (author/tech/translator/publisher/theme pages) embed the full
// denormalized work — same shape as generated/works.json — so those pages can render a full
// WorkCard (cover, publisher, awards, theme tags) instead of just a bare title+year link.
const worksGeneratedById = new Map(worksGenerated.map((w) => [w.id, w]));

function fullWork(w) {
  // Only the work detail page renders related works, and each work is embedded in roughly seven
  // of these cross-reference lists, so keeping relatedWorkIds out of the embedded copies avoids
  // a large amount of duplicated ids across generated/.
  const { relatedWorkIds, ...rest } = worksGeneratedById.get(w.id);
  return rest;
}

function byPublicationYear(a, b) {
  return a.firstPublishedYear - b.firstPublishedYear;
}

function byEditionYearDesc(a, b) {
  return editionYear(b) - editionYear(a) || a.titleKana.localeCompare(b.titleKana, "ja");
}

// ---- generated/{authors,translators,publishers}.json ----
function buildPersonList(people, worksByPersonId) {
  return people
    .map((p) => {
      const theirWorks = worksByPersonId.get(p.id) ?? [];
      return {
        id: p.id,
        name: p.name,
        nameKana: p.nameKana,
        description: p.description,
        externalLinks: p.externalLinks,
        workCount: theirWorks.length,
        works: theirWorks.map(fullWork).sort(byPublicationYear),
      };
    })
    .sort((a, b) => a.nameKana.localeCompare(b.nameKana, "ja"));
}

function groupWorksBy(idsOf) {
  const map = new Map();
  for (const w of works) {
    for (const id of idsOf(w)) {
      if (!map.has(id)) map.set(id, []);
      map.get(id).push(w);
    }
  }
  return map;
}

const authorsGenerated = buildPersonList(authors, groupWorksBy((w) => w.authorIds));
const translatorsGenerated = buildPersonList(translators, groupWorksBy((w) => w.translatorIds));
const publishersGenerated = buildPersonList(
  publishers,
  groupWorksBy((w) => [w.publisherId])
);

// ---- generated/techs.json ----
// Newest edition first, deliberately the reverse of mystery-db's detective pages: someone
// landing on "Rust" wants the current book, not the historically first one. A superseded
// edition of the same book is a different work entry, so this also floats the newest revision.
const worksByTech = groupWorksBy((w) => w.techIds);
const techsGenerated = techs
  .map((t) => {
    const theirWorks = worksByTech.get(t.id) ?? [];
    return {
      ...t,
      workCount: theirWorks.length,
      works: theirWorks.map(fullWork).sort(byEditionYearDesc),
    };
  })
  .sort((a, b) => a.nameKana.localeCompare(b.nameKana, "ja"));

// ---- generated/themes.json ----
const worksByTheme = groupWorksBy((w) => w.themeIds);
const themesGenerated = themes
  .map((t) => {
    const theirWorks = worksByTheme.get(t.id) ?? [];
    return {
      ...t,
      workCount: theirWorks.length,
      works: theirWorks.map(fullWork).sort(byPublicationYear),
    };
  })
  .sort((a, b) => b.workCount - a.workCount || a.name.localeCompare(b.name, "ja"));

// ---- generated/awards.json ----
const winnersByAward = new Map();
for (const w of works) {
  for (const r of w.awardResults ?? []) {
    if (!winnersByAward.has(r.awardId)) winnersByAward.set(r.awardId, []);
    winnersByAward.get(r.awardId).push({ workId: w.id, workTitle: w.title, year: r.year, result: r.result });
  }
}
const awardsGenerated = awards
  .map((a) => {
    const winners = (winnersByAward.get(a.id) ?? []).sort((x, y) => y.year - x.year);
    return { ...a, workCount: winners.length, winners };
  })
  .sort((a, b) => a.name.localeCompare(b.name, "ja"));

// ---- generated/counts.json ----
const counts = {
  works: works.length,
  authors: authors.length,
  techs: techs.length,
  translators: translators.length,
  publishers: publishers.length,
  themes: themes.length,
  awards: awards.length,
};

mkdirSync(outDir, { recursive: true });
writeFileSync(path.join(outDir, "works.json"), JSON.stringify(worksGenerated), "utf-8");
writeFileSync(path.join(outDir, "authors.json"), JSON.stringify(authorsGenerated), "utf-8");
writeFileSync(path.join(outDir, "techs.json"), JSON.stringify(techsGenerated), "utf-8");
writeFileSync(path.join(outDir, "translators.json"), JSON.stringify(translatorsGenerated), "utf-8");
writeFileSync(path.join(outDir, "publishers.json"), JSON.stringify(publishersGenerated), "utf-8");
writeFileSync(path.join(outDir, "themes.json"), JSON.stringify(themesGenerated), "utf-8");
writeFileSync(path.join(outDir, "awards.json"), JSON.stringify(awardsGenerated), "utf-8");
writeFileSync(path.join(outDir, "counts.json"), JSON.stringify(counts), "utf-8");

console.log(
  `generate-manifest: wrote ${works.length} works, ${authors.length} authors, ${techs.length} techs, ${translators.length} translators, ${publishers.length} publishers, ${themes.length} themes, ${awards.length} awards`
);

// ---- generated/search-index.json ----
// Compact index for the cross-site search page. All five sister sites are served from
// izenmi.github.io, so in production each site can fetch the others' index with a plain
// same-origin request — no CORS setup and no backend. Keys are one letter because this file is
// downloaded whole by /search: i=id, t=title, c=creators, y=year.
// The index is self-describing (siteName/baseUrl/itemPath) so a consumer can build links into it
// without hardcoding another site's routing.
const searchIndex = {
  site: "tech",
  siteName: "技術書DB",
  baseUrl: "https://izenmi.github.io/tech-db",
  itemPath: "works",
  items: works.map((w) => ({
    i: w.id,
    t: w.title,
    c: w.authorIds.map((id) => authorsById.get(id).name).join("・"),
    y: editionYear(w),
  })),
};
writeFileSync(path.join(outDir, "search-index.json"), JSON.stringify(searchIndex), "utf-8");
console.log(`generate-manifest: wrote search-index.json with ${searchIndex.items.length} items`);

// ---- sitemap.xml ----
// Lives at the site root (not data/generated/) so it's served at /tech-db/sitemap.xml, but is
// just as deterministically derived from public/data/source/*.json — see the .gitignore note.
const SITE_URL = "https://izenmi.github.io/tech-db";
const today = new Date().toISOString().slice(0, 10);

function urlEntry(loc, lastmod) {
  return `  <url>\n    <loc>${SITE_URL}${loc}</loc>\n    <lastmod>${lastmod ?? today}</lastmod>\n  </url>`;
}

const sitemapEntries = [
  urlEntry("/"),
  urlEntry("/works"),
  ...works.map((w) => urlEntry(`/works/${w.id}`, w.updatedAt?.slice(0, 10))),
  urlEntry("/themes"),
  ...themes.map((t) => urlEntry(`/themes/${t.id}`)),
  urlEntry("/authors"),
  ...authors.map((a) => urlEntry(`/authors/${a.id}`, a.updatedAt?.slice(0, 10))),
  urlEntry("/techs"),
  ...techs.map((t) => urlEntry(`/techs/${t.id}`, t.updatedAt?.slice(0, 10))),
  urlEntry("/translators"),
  ...translators.map((t) => urlEntry(`/translators/${t.id}`, t.updatedAt?.slice(0, 10))),
  urlEntry("/publishers"),
  ...publishers.map((p) => urlEntry(`/publishers/${p.id}`, p.updatedAt?.slice(0, 10))),
  urlEntry("/awards"),
  ...awards.map((a) => urlEntry(`/awards/${a.id}`, a.updatedAt?.slice(0, 10))),
  urlEntry("/timeline"),
  urlEntry("/search"),
  urlEntry("/about"),
];

const sitemapXml =
  `<?xml version="1.0" encoding="UTF-8"?>\n` +
  `<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemapEntries.join("\n")}\n</urlset>\n`;

writeFileSync(path.join(rootDir, "public", "sitemap.xml"), sitemapXml, "utf-8");
console.log(`generate-manifest: wrote sitemap.xml with ${sitemapEntries.length} URLs`);
