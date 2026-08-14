// Resolves a representative ISBN + cover image URL per work via the Rakuten Books search API
// (BooksTotal/Search) and caches the result in public/data/source/covers-cache.json (committed,
// read by generate-manifest.mjs). Not run on every build — run manually with `npm run
// fetch-covers` when adding new works or retrying misses. Each work here is a single novel, so
// this searches by its 邦題 (never the original title — Japanese stores don't index those) and
// keeps items that look like an actual edition of that book: non-empty isbn (Blu-ray/DVD/CD items
// use `jan` instead), a title matching the work's, and an author that matches ours.
//
// **Every match path requires the author name to appear in the store's metadata.** Technical
// titles are short and generic in a way light-novel titles aren't (『暗号技術入門』『Team Geek』),
// and prefix matching alone pulls in unrelated books — a bare `Team Geek` search returns music
// CDs, and BOOK☆WALKER answers `リーダブルコード` with 『文系のための金型入門』. This mirrors what
// mystery-db and manga-db had to do for the same reason.
//
// We tried openBD first (ISBN -> cover), but its cover images only come from 版元ドットコム
// member publishers, so real-world coverage was ~0%. Rakuten Books actually sells these titles,
// so its own cover images are far more complete.
//
// Sources are tried in order. The first is an exact lookup; the rest are keyword searches that
// share the same candidate keywords (see keywordCandidates):
//
//   0. Rakuten Books by ISBN (BooksBook/Search?isbn=). Used whenever works.json carries an `isbn`
//      for the book, which it normally does — this site catalogues one specific edition, so one
//      ISBN identifies it exactly (see the field's doc comment in src/types.ts). An exact lookup
//      can't mismatch, so it needs none of the title/author/genre guards the keyword tiers below
//      depend on, and its result needs no eyeballing. Prefer filling in `isbn` over tuning the
//      keyword tiers.
//
//   1. Rakuten Books (BooksTotal/Search) — print editions. Strongest tier for this genre: almost
//      every technical book ships in print, and Rakuten files them all under the 001005
//      (パソコン・システム開発) top-level genre, which makes the genre filter unusually reliable.
//   2. Rakuten Kobo (Kobo/EbookSearch) — same app credentials. Covers titles Rakuten doesn't
//      stock in print. Kobo items have no ISBN field (itemNumber instead), so these are cached
//      with isbn: null and source: "kobo".
//   4. O'Reilly Japan (HTML), ISBN only. Its product pages live at /books/<isbn13>/ and the cover
//      is a real <img> on the page whose filename carries the hyphenated ISBN, so the right image
//      is selected by comparing digits — no URL is guessed. robots.txt allows /books/. This is the
//      backstop for older O'Reilly titles that the Rakuten stores no longer list, and it only
//      runs when the ISBN lookup above found no cover.
//
//   3. BOOK☆WALKER (HTML). No public API, but both the search page and the product pages are
//      server-rendered: the search page links to https://bookwalker.jp/de<uuid>/ (and returns
//      HTTP 404 when there are zero hits, which is a clean "no results" signal), and each product
//      page carries <meta property="og:image"> plus a <title> of the form
//        <作品名> - <ジャンル> <著者>（<レーベル>）：電子書籍試し読み無料 - BOOK☆WALKER -
//      i.e. genre, author and label in one string. bookwalker.jp/robots.txt allows /search/ and
//      /de*/ (it only disallows /member/, /history/ and friends), and c.bookwalker.jp serves the
//      images without any Referer restriction. Cached with isbn: null and source: "bookwalker".
//
// BOOK☆WALKER's raw search ranking is NOT trustworthy — a zero-hit query falls back to unrelated
// promoted items, and manga adaptations of the same series rank above the novel. So a candidate is
// only accepted when its genre isn't マンガ（漫画）/ライトノベル/文芸・小説/etc., an author name from
// authors.json appears in the page title, AND the normalized core title is contained in it.
// NOTE: BOOK☆WALKER files technical books under 実用, so — unlike mystery-db, which rejects that
// genre — 実用 must stay OUT of BW_REJECTED_GENRES here. Verified against real product pages
// (『達人プログラマー』『ゼロから始めるNetlify』) on 2026-08-06.
//
// Cover URLs are always harvested from a real page (API response / og:image). Guessing or
// hardcoding a direct image URL by pattern is still forbidden.
//
// Requires a Rakuten Web Service app — free, instant self-serve: register at
// https://webservice.rakuten.co.jp/ and copy its "アプリケーションID" and "アクセスキー". Pass
// them via env vars; never commit them. The current gateway credentials are shared across all
// five sister sites (verified for tech-db on 2026-08-06), so ranobe-db's keys work here as-is. The API enforces
// Referer/Origin headers — see REFERER_URL below — which this script sends explicitly since it
// isn't a browser request.
//
// Usage:
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers -- --force
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers -- --retry-misses
//   RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=xxx npm run fetch-covers -- --only=readable-code,team-geek
//
// --force re-fetches everything, including entries that were filled in by hand, so prefer
// --retry-misses when you just want to have another go at the unresolved works: it only touches
// entries whose coverUrl is null and leaves every resolved entry alone.
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import path from "node:path";

const rootDir = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const sourceDir = path.join(rootDir, "public", "data", "source");
const worksPath = path.join(sourceDir, "works.json");
const authorsPath = path.join(sourceDir, "authors.json");
const translatorsPath = path.join(sourceDir, "translators.json");
const cachePath = path.join(sourceDir, "covers-cache.json");

const REFERER_URL = "https://izenmi.github.io/tech-db/";
const ORIGIN_URL = "https://izenmi.github.io";
const BROWSER_UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/** How many BOOK☆WALKER product pages to open per search (each one is an extra HTTP request). */
const BW_PRODUCT_LIMIT = 4;

// Only the two Rakuten tiers need credentials; BOOK☆WALKER is plain HTML. Running without them
// is therefore useful (BOOK☆WALKER-only pass) rather than fatal.
const APP_ID = process.env.RAKUTEN_APP_ID;
const ACCESS_KEY = process.env.RAKUTEN_ACCESS_KEY;
const RAKUTEN_ENABLED = Boolean(APP_ID && ACCESS_KEY);
if (!RAKUTEN_ENABLED) {
  console.warn(
    "RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY が未設定のため、楽天ブックス・Koboをスキップし BOOK☆WALKER のみで解決します(see the header comment in this file)。",
  );
}

const works = JSON.parse(readFileSync(worksPath, "utf-8"));
const authors = JSON.parse(readFileSync(authorsPath, "utf-8"));
const translators = JSON.parse(readFileSync(translatorsPath, "utf-8"));
const cache = existsSync(cachePath) ? JSON.parse(readFileSync(cachePath, "utf-8")) : {};

const authorNameById = new Map(authors.map((a) => [a.id, a.name]));
const translatorNameById = new Map(translators.map((t) => [t.id, t.name]));

const args = process.argv.slice(2);
const FORCE = args.includes("--force");
const RETRY_MISSES = args.includes("--retry-misses");
const onlyArg = args.find((a) => a.startsWith("--only="));
const ONLY = onlyArg ? onlyArg.slice("--only=".length).split(",") : undefined;

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

// NFKC folds the fullwidth/halfwidth variants that Japanese book catalogs mix freely (ＴＥＮＫＹ
// vs TENKY, （） vs (), U+FF5E ～ vs ~). The explicit class then drops the punctuation that
// differs between our titles and a store's — including the wave dash U+301C 〜, which NFKC does
// NOT fold into U+FF5E and which used to silently break prefix matching on subtitled titles.
function normalize(title) {
  return title
    .normalize("NFKC")
    .replace(/[\s　・:：;；!?！？―—\-ー~〜～()（）[\]「」『』【】〈〉《》〔〕"“”'’,、.。]/g, "")
    .toLowerCase();
}

// The part of a series title a store is likely to index under: everything before the long
// subtitle that web-novel titles carry (`～…～`, `（…）`, `【…】`), minus quoting brackets and a
// trailing "シリーズ" that only exists in our own data (e.g. 「文学少女」シリーズ -> 文学少女).
function coreTitle(title) {
  return title
    .split(/[~〜～(（【]/)[0]
    .replace(/[「」『』"“”]/g, "")
    .replace(/シリーズ$/, "")
    .trim();
}

// Translator names count as much as author names for the store-metadata check. Japanese book
// stores list a translated technical book's people in one "author" field, and for these books the
// original authors are frequently romanized there ("Brendan Gregg", "Andrew Hunt") while
// authors.json holds the katakana form — so requiring an author-name hit alone made every
// O'Reilly translation miss. The translator is always a Japanese name and matches reliably.
function creditNamesFor(work) {
  return [
    ...(work.authorIds ?? []).map((id) => authorNameById.get(id)),
    ...(work.translatorIds ?? []).map((id) => translatorNameById.get(id)),
  ].filter(Boolean);
}

// Progressively looser search keywords. The full title is the most precise; the core title finds
// entries whose subtitle is punctuated differently; adding the author disambiguates a core title
// that is too generic on its own. Anything matched on one of the looser keywords has to pass the
// author check as well (see pickBestMatch), so widening the net here doesn't widen false matches.
function keywordCandidates(work, authorNames) {
  const core = coreTitle(work.title);
  const candidates = [work.title, core];
  if (authorNames.length > 0) candidates.push(`${core || work.title} ${authorNames[0]}`);
  return [...new Set(candidates.filter(Boolean))];
}

function authorMatches(text, authorNames) {
  if (authorNames.length === 0) return false;
  const haystack = normalize(text ?? "");
  return authorNames.some((name) => haystack.includes(normalize(name)));
}

// Products sold alongside a technical book that aren't the book: box sets, magazines that carry
// the same words in a feature title, and the 別冊/ムック spin-offs.
const NON_BOOK_PATTERNS = /全巻セット|完結セット|セット\s*$|ムック|雑誌|カレンダー|DVD|CD-ROM付録/;

/**
 * Orders otherwise-equal candidates. Unlike the sister sites (which prefer volume 1 of a series),
 * a technical book has editions rather than volumes and the *right* one is whichever edition
 * works.json says we catalogued — a 2012 first edition and its 2024 third edition are genuinely
 * different books. When `edition` is unset the API order (newest first) already does the right
 * thing, since a revised edition supersedes the one it replaces.
 */
function editionRank(title, work) {
  if (!work.edition) return 0;
  return normalize(title).includes(normalize(work.edition)) ? 0 : 1;
}

/** The volume number a series title carries, as a string, or "" when it carries none.
 *  Covers both the circled numerals O'Reilly Japan uses (ゼロから作るDeep Learning ❷) and a plain
 *  trailing digit. Edition markers (第2版/改訂2版) are NOT volumes and are excluded. */
function volumeToken(title) {
  const t = title.normalize("NFKC").replace(/(第|改訂)\s*\d+\s*版/g, "");
  const circled = t.match(/[❶-❿]/);
  if (circled) return String("❶❷❸❹❺❻❼❽❾❿".indexOf(circled[0]) + 1);
  return t.match(/(?:^|[\s　])(\d{1,2})\s*$/)?.[1] ?? "";
}

/** Applies the shared "is this actually the book" filter and best-first ordering. */
function rankCandidates(items, titleOf, work) {
  // A volume mismatch is a hard reject, not a preference: with sort=-releaseDate the newest
  // volume of a series otherwise wins every time (『ゼロから作るDeep Learning』 resolved to the
  // cover of volume ❻ before this check existed).
  const wantVolume = volumeToken(work.title);
  return items
    .filter((it) => !NON_BOOK_PATTERNS.test(titleOf(it) ?? ""))
    .filter((it) => volumeToken(titleOf(it) ?? "") === wantVolume)
    .sort((a, b) => editionRank(titleOf(a) ?? "", work) - editionRank(titleOf(b) ?? "", work));
}

/** Rakuten serves a generic grey placeholder for items with no real cover — never cache one. */
function isPlaceholderImage(imageUrl) {
  // 店舗ごとに綴りが違う。楽天ブックスは noimage_01.gif、ブックオフ系は r_noimg.gif を返す。
  // noimage しか見ていなかったため、noimg のプレースホルダをそのまま表紙として採っていた。
  return !imageUrl || /no[-_]?im(?:age|g)|now[-_]?printing/i.test(imageUrl);
}

/** Bump the thumbnail service's requested resolution (default 200x200) for a crisper cover. */
function upscale(imageUrl) {
  return imageUrl.replace(/_ex=\d+x\d+/, "_ex=400x400");
}

// Rakuten answers 429 when a long batch runs (or when a sister site's fetch-covers runs at the
// same time on the same app credentials). Backing off once or twice keeps a run from dropping
// entries — a thrown error leaves the work unresolved until the next --retry-misses pass.
async function fetchRakuten(url) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, { headers: { Referer: REFERER_URL, Origin: ORIGIN_URL } });
    if (res.status !== 429 || attempt >= 2) return res;
    await sleep(5000 * (attempt + 1));
  }
}

/** Exact lookup: one ISBN, one book. Uses BooksBook/Search (the 書籍 endpoint) because
 *  BooksTotal/Search — the endpoint the keyword tiers use — rejects an `isbn` parameter with
 *  HTTP 400. */
async function fetchRakutenByIsbn(isbn) {
  const params = new URLSearchParams({
    applicationId: APP_ID,
    accessKey: ACCESS_KEY,
    isbn,
    format: "json",
  });
  const url = `https://openapi.rakuten.co.jp/services/api/BooksBook/Search/20170404?${params.toString()}`;
  const res = await fetchRakuten(url);
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(data.errors?.errorMessage || data.error_description || `HTTP ${res.status}`);
  }
  return (data.Items ?? []).map((wrapped) => wrapped.Item)[0];
}

async function searchRakuten(keyword) {
  const params = new URLSearchParams({
    applicationId: APP_ID,
    accessKey: ACCESS_KEY,
    keyword,
    hits: "30",
    // Newest first: for a technical book the current edition is the one worth showing, the
    // opposite of the sister sites where the oldest printing is the canonical one.
    sort: "-releaseDate",
    format: "json",
  });
  const url = `https://openapi.rakuten.co.jp/services/api/BooksTotal/Search/20170404?${params.toString()}`;
  const res = await fetchRakuten(url);
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(data.errors?.errorMessage || data.error_description || `HTTP ${res.status}`);
  }
  return (data.Items ?? []).map((wrapped) => wrapped.Item);
}

// Fallback for series Rakuten Books doesn't carry (small-press / web-novel-origin titles that
// only ship as e-books). Same app credentials work across Rakuten Web Service APIs. Kobo items
// have no ISBN field (itemNumber instead), so these are cached with isbn: null.
async function searchKobo(keyword) {
  const params = new URLSearchParams({
    applicationId: APP_ID,
    accessKey: ACCESS_KEY,
    keyword,
    hits: "30",
    sort: "-releaseDate",
    format: "json",
  });
  const url = `https://openapi.rakuten.co.jp/services/api/Kobo/EbookSearch/20170426?${params.toString()}`;
  const res = await fetchRakuten(url);
  const data = await res.json();
  if (!res.ok || data.errors) {
    throw new Error(data.errors?.errorMessage || data.error_description || `HTTP ${res.status}`);
  }
  return (data.Items ?? []).map((wrapped) => wrapped.Item);
}

/** Rakuten files technical books under the 001005 (パソコン・システム開発) top-level genre.
 *  booksGenreId is a slash-separated list when an item sits in several genres
 *  ("001005017/001005004003/001012010001"), so every segment is checked. Requiring this genre is
 *  strictly stronger than the sister sites' approach of excluding コミック/ライトノベル: it also
 *  drops the magazines (007605…) and music CDs (002105…) that short English titles pull in.
 *  Verified against the live API on 2026-08-06. */
function isTechGenre(booksGenreId) {
  return (booksGenreId ?? "").split("/").some((g) => g.startsWith("001005"));
}

function pickBestMatch(items, work, authorNames) {
  const target = normalize(work.title);
  const core = normalize(coreTitle(work.title));
  // Already sorted newest-first by the API (sort=-releaseDate). Require a 978-4 (Japan
  // registrant group) ISBN and the computing genre.
  //
  // The author check applies to BOTH match paths here, unlike ranobe-db where it only guards the
  // loose one: `暗号技術入門` or `Team Geek` as a bare prefix matches plenty of unrelated books.
  const eligible = rankCandidates(
    items.filter(
      (it) =>
        it.isbn &&
        it.isbn.startsWith("9784") &&
        isTechGenre(it.booksGenreId) &&
        !isPlaceholderImage(it.largeImageUrl) &&
        authorMatches(`${it.title ?? ""} ${it.author ?? ""}`, authorNames),
    ),
    (it) => it.title,
    work,
  );
  return (
    eligible.find((it) => normalize(it.title ?? "").startsWith(target)) ??
    // Looser: the store's title merely contains our core title.
    eligible.find((it) => core.length >= 3 && normalize(it.title ?? "").includes(core))
  );
}

function pickBestKoboMatch(items, work, authorNames) {
  const target = normalize(work.title);
  const core = normalize(coreTitle(work.title));
  const eligible = rankCandidates(
    items.filter(
      (it) =>
        !isPlaceholderImage(it.largeImageUrl) &&
        authorMatches(`${it.title ?? ""} ${it.author ?? ""}`, authorNames),
    ),
    (it) => it.title,
    work,
  );
  return (
    eligible.find((it) => normalize(it.title ?? "").startsWith(target)) ??
    eligible.find((it) => core.length >= 3 && normalize(it.title ?? "").includes(core))
  );
}

function decodeEntities(text) {
  return text
    .replace(/&#0?39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}

async function fetchHtml(url) {
  const res = await fetch(url, { headers: { "User-Agent": BROWSER_UA } });
  if (res.status === 404) return null; // BOOK☆WALKER answers 404 for a zero-hit search
  if (!res.ok) throw new Error(`HTTP ${res.status} (${url})`);
  return res.text();
}

// Returns the product pages behind a BOOK☆WALKER search, each with its <title> (genre + author +
// label) and og:image (the cover). Empty array when the search has no hits.
async function searchBookWalker(keyword) {
  const html = await fetchHtml(`https://bookwalker.jp/search/?word=${encodeURIComponent(keyword)}`);
  if (!html) return [];
  const links = [
    ...new Set([...html.matchAll(/href="(https:\/\/bookwalker\.jp\/de[0-9a-f-]+\/)"/g)].map((m) => m[1])),
  ];
  const candidates = [];
  for (const link of links.slice(0, BW_PRODUCT_LIMIT)) {
    await sleep(1500);
    let page;
    try {
      page = await fetchHtml(link);
    } catch {
      continue;
    }
    if (!page) continue;
    const image = page.match(/<meta property="og:image" content="([^"]+)"/)?.[1];
    if (!image) continue;
    const pageTitle = decodeEntities(page.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "");
    const ogTitle = decodeEntities(page.match(/<meta property="og:title" content="([^"]+)"/)?.[1] ?? "");
    candidates.push({ url: link, pageTitle, title: ogTitle || pageTitle.split(" - ")[0], image });
  }
  return candidates;
}

/** The genre token of a BOOK☆WALKER <title>: "<作品名> - <ジャンル> <著者>（<レーベル>）：…". */
function bookWalkerGenre(pageTitle) {
  return pageTitle.split(" - ")[1]?.split(/[\s　]/)[0] ?? "";
}

// 実用 is deliberately absent: that is the genre BOOK☆WALKER files technical books under (see the
// header comment). Rejecting it — as mystery-db does — would reject every hit this site wants.
const BW_REJECTED_GENRES = [
  "マンガ（漫画）",
  "ライトノベル",
  "文芸・小説",
  "ゲーム攻略本",
  "雑誌",
  "写真集",
];

/** Omnibus editions are real hits but poor covers — only used as a last resort. */
function bookWalkerPenalty(title) {
  return /合本版|全巻|セット版/i.test(title) ? 1 : 0;
}

function pickBestBookWalkerMatch(candidates, work, authorNames) {
  const core = normalize(coreTitle(work.title));
  if (core.length < 3) return undefined;
  const usable = candidates.filter(
    (c) =>
      !BW_REJECTED_GENRES.includes(bookWalkerGenre(c.pageTitle)) &&
      volumeToken(c.title) === volumeToken(work.title) &&
      authorMatches(c.pageTitle, authorNames) &&
      normalize(c.pageTitle).includes(core),
  );
  return usable.sort(
    (a, b) =>
      bookWalkerPenalty(a.title) - bookWalkerPenalty(b.title) ||
      editionRank(a.title, work) - editionRank(b.title, work),
  )[0];
}

/** The cover on an O'Reilly Japan product page. The page also lists related titles, so the right
 *  <img> is picked by matching digits: the filename carries the hyphenated ISBN
 *  (picture_large978-4-87311-565-8.jpeg), and stripping non-digits from it yields the ISBN-13. */
async function fetchOreillyCover(isbn) {
  let html;
  try {
    html = await fetchHtml(`https://www.oreilly.co.jp/books/${isbn}/`);
  } catch {
    return undefined;
  }
  if (!html) return undefined;
  const title = decodeEntities(html.match(/<title>([\s\S]*?)<\/title>/)?.[1] ?? "").split(" - ")[0].trim();
  for (const [, src] of html.matchAll(/<img[^>]+src="([^"]+)"/g)) {
    if (src.replace(/\D/g, "") === isbn) return { image: src, title };
  }
  return undefined;
}

// Walks the sources in order, retrying each with progressively looser keywords before
// moving on. Returns the cache entry to store, or null when nothing matched anywhere.
async function resolveWork(work) {
  const authorNames = creditNamesFor(work);
  const keywords = keywordCandidates(work, authorNames);

  if (work.isbn && RAKUTEN_ENABLED) {
    const item = await fetchRakutenByIsbn(work.isbn);
    await sleep(1100);
    if (item && !isPlaceholderImage(item.largeImageUrl)) {
      console.log(`[ok-isbn] ${work.title} -> matched "${item.title}" (ISBN ${work.isbn})`);
      return {
        title: work.title,
        isbn: work.isbn,
        matchedTitle: item.title,
        coverUrl: upscale(item.largeImageUrl),
        source: "rakuten-books-isbn",
        resolvedAt: new Date().toISOString(),
      };
    }
  }

  for (const keyword of RAKUTEN_ENABLED ? keywords : []) {
    const items = await searchRakuten(keyword);
    await sleep(1100);
    const best = pickBestMatch(items, work, authorNames);
    if (best) {
      console.log(`[ok] ${work.title} -> matched "${best.title}" (ISBN ${best.isbn})`);
      return {
        title: work.title,
        isbn: best.isbn,
        matchedTitle: best.title,
        coverUrl: best.largeImageUrl ? upscale(best.largeImageUrl) : null,
        source: "rakuten-books",
        resolvedAt: new Date().toISOString(),
      };
    }
  }

  for (const keyword of RAKUTEN_ENABLED ? keywords : []) {
    const items = await searchKobo(keyword);
    await sleep(1100);
    const best = pickBestKoboMatch(items, work, authorNames);
    if (best) {
      console.log(`[ok-kobo] ${work.title} -> matched "${best.title}" (Kobo電子書籍)`);
      return {
        title: work.title,
        isbn: null,
        matchedTitle: best.title,
        coverUrl: best.largeImageUrl || null,
        source: "kobo",
        resolvedAt: new Date().toISOString(),
      };
    }
  }

  for (const keyword of keywords) {
    const candidates = await searchBookWalker(keyword);
    await sleep(1500);
    const best = pickBestBookWalkerMatch(candidates, work, authorNames);
    if (best) {
      console.log(`[ok-bw] ${work.title} -> matched "${best.title}" (BOOK☆WALKER)`);
      return {
        title: work.title,
        isbn: null,
        matchedTitle: best.title,
        coverUrl: best.image,
        source: "bookwalker",
        resolvedAt: new Date().toISOString(),
      };
    }
  }

  if (work.isbn) {
    const hit = await fetchOreillyCover(work.isbn);
    await sleep(1200);
    if (hit) {
      console.log(`[ok-oreilly] ${work.title} -> matched "${hit.title}" (O'Reilly Japan)`);
      return {
        title: work.title,
        isbn: work.isbn,
        matchedTitle: hit.title,
        coverUrl: hit.image,
        source: "oreilly-japan",
        resolvedAt: new Date().toISOString(),
      };
    }
  }

  return null;
}

function shouldSkip(work) {
  const cached = cache[work.id];
  if (!cached) return false;
  if (FORCE) return false;
  if (RETRY_MISSES) return Boolean(cached.coverUrl);
  return true;
}


/**
 * 解決できなかったときのキャッシュ更新。
 *
 * 前のエントリがあるなら、分かっていること(ISBN・購入リンク・手書き注記・すでに持っている
 * 表紙)はそのまま残し、「いつ試したか」だけを更新する。今回分かったのは「見つからなかった」
 * ことだけで、前に分かっていたことが嘘になったわけではない。
 * 全部を null の雛形で上書きすると、手で直した判断が再取得のたびに消える。
 */
function keepWhatWeKnew(previous, fallback) {
  if (!previous) return fallback;
  return { ...previous, resolvedAt: new Date().toISOString() };
}

/** 自動取得が成功したときも、手書きの注記だけは引き継ぐ。 */
function withNote(previous, entry) {
  return previous?.note && !entry.note ? { ...entry, note: previous.note } : entry;
}

async function run() {
  const targets = works.filter((w) => (ONLY ? ONLY.includes(w.id) : true));
  let updated = 0;
  let skipped = 0;
  let missed = 0;

  for (const work of targets) {
    if (shouldSkip(work)) {
      skipped++;
      continue;
    }
    try {
      const entry = await resolveWork(work);
      if (entry) {
        cache[work.id] = withNote(cache[work.id], entry);
        updated++;
      } else {
        cache[work.id] = keepWhatWeKnew(cache[work.id], {
          title: work.title,
          isbn: work.isbn ?? null,
          coverUrl: null,
          resolvedAt: new Date().toISOString(),
        });
          console.log(
          `[miss] ${work.title}: 楽天ブックス(ISBN/キーワード)・Kobo・BOOK☆WALKER・オライリー・ジャパンのいずれでも解決できませんでした`,
        );
        missed++;
      }
    } catch (err) {
      console.error(`[error] ${work.title}: ${err.message}`);
    }
  }

  const sorted = Object.fromEntries(Object.entries(cache).sort(([a], [b]) => a.localeCompare(b)));
  writeFileSync(cachePath, JSON.stringify(sorted, null, 2) + "\n");
  console.log(`完了: ${updated}件更新, ${missed}件未解決, ${skipped}件スキップ(既存キャッシュ)。 -> ${cachePath}`);
}

run();
