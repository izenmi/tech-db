// ---- source data (public/data/source/*.json, hand-authored, committed) ----

export interface ExternalLinks {
  wikipediaUrl?: string;
  officialUrl?: string;
}

export interface AwardResult {
  awardId: string;
  year: number;
  result: string; // free text: "受賞" / "第1位" など
}

/** Domestic (Japanese-authored) book vs. a translated foreign one. Drives the 国内/翻訳 filter and
 *  decides whether originalTitle/jpPublishedYear/translatorIds are expected. Translations are the
 *  backbone of this genre (O'Reilly / Manning / Addison-Wesley), so the distinction earns its keep. */
export type WorkOrigin = "jp" | "overseas";

/** Who the book is written for. The single most useful axis when picking a technical book, which
 *  is why it lives on the work itself rather than being expressed as just another theme tag. */

export interface WorkSource {
  id: string;
  /** Japanese title. For translated works this is the 邦題, not the original title. */
  title: string;
  titleKana: string;
  authorIds: string[];
  /** Languages/frameworks/tools the book teaches. Deliberately allowed to be empty: 『人月の神話』
   *  『SOFT SKILLS』のような技術非依存の本があるため。The UI renders those as 技術非依存. */
  techIds: string[];
  /** Empty for `origin: "jp"`; required for `origin: "overseas"`. */
  translatorIds: string[];
  publisherId: string;
  themeIds: string[];
  /** Plain display text such as "Software Design plus シリーズ" — deliberately not an entity. */
  seriesName?: string;
  origin: WorkOrigin;
  /** Year the book was first published in its original language. Translated works therefore sort
   *  alongside Japanese ones on a single timeline of computing-book history. */
  firstPublishedYear: number;
  /** Translated works only: year the Japanese edition this entry describes appeared. */
  jpPublishedYear?: number;
  /** Translated works only. */
  originalTitle?: string;
  /** Free text for the edition this entry describes: "第4版" / "改訂新版" など。 */
  edition?: string;
  /** Publication year of that edition. A technical book's value decays with age, so this — not
   *  firstPublishedYear — is the freshness signal the cards surface. */
  latestEditionYear?: number;
  /** Free text for the software versions covered: "Python 3.11" / "React 18" など。 */
  targetVersion?: string;
  /** ISBN-13 (no hyphens) of the exact edition this entry describes.
   *
   *  The sister sites deliberately have no ISBN field, because a novel or a manga is reissued in
   *  単行本 and 文庫 by different imprints and no single ISBN identifies "the work". That reasoning
   *  does not apply here: this site catalogues one specific edition (see `edition` /
   *  `latestEditionYear`), so exactly one ISBN identifies it. scripts/fetch-covers.mjs resolves
   *  the cover from this first, which makes the lookup exact instead of a keyword search that has
   *  to be eyeballed for mismatches. Optional so a book can be catalogued before its ISBN is
   *  confirmed — the keyword tiers still run in that case. */
  isbn?: string;
  /** 150〜250 chars, written from scratch — never copied from Wikipedia or a publisher blurb. */
  synopsis: string;
  awardResults?: AwardResult[];
  externalLinks: ExternalLinks;
  sourceNote: string;
  updatedAt: string;
}

export interface AuthorSource {
  id: string;
  name: string;
  nameKana: string;
  description: string;
  birthYear?: number;
  externalLinks: ExternalLinks;
  sourceNote: string;
  updatedAt: string;
}

export type TranslatorSource = AuthorSource;

/** Grouping for the tech list page. Broad on purpose — the point is to make a long list of
 *  languages and tools scannable, not to model a taxonomy. */
export type TechCategory = "language" | "framework" | "infra" | "database" | "tool" | "concept";

/** A language, framework, middleware or tool a book teaches. The site's differentiator: every
 *  tech page lists its books newest-first, which is what someone picking up a technology wants. */
export interface TechSource {
  id: string;
  name: string;
  nameKana: string;
  category: TechCategory;
  /** 100〜150字。何のための技術で、どういう本が集まる軸なのかがわかる程度に。 */
  description: string;
  /** The year the language/product first appeared. Shown as context on the tech page. */
  releasedYear?: number;
  externalLinks: ExternalLinks;
  sourceNote: string;
  updatedAt: string;
}

export interface PublisherSource {
  id: string;
  name: string;
  nameKana: string;
  parentCompany?: string;
  description: string;
  foundedYear?: number;
  externalLinks: ExternalLinks;
  sourceNote: string;
  updatedAt: string;
}

export interface ThemeSource {
  id: string;
  name: string;
  description?: string;
}

export interface AwardSource {
  id: string;
  name: string;
  organizer: string;
  description: string;
  firstYear?: number;
  externalLinks: ExternalLinks;
  sourceNote: string;
  updatedAt: string;
}

// ---- generated data (public/data/generated/*.json, built by scripts/generate-manifest.mjs) ----

/** Denormalized work: source fields plus resolved names for direct rendering. */
/** あらすじ・出典メモ・updatedAt は含まない — 作品詳細ページでしか使わないのに works.json の
 *  3分の1を占めていたので work-texts.json に分けてある(WorkTexts / getWorkTexts)。 */
export interface WorkGenerated extends Omit<WorkSource, "synopsis" | "sourceNote" | "updatedAt"> {
  authorNames: string[];
  techNames: string[];
  translatorNames: string[];
  publisherName: string;
  themeNames: string[];
  awardSummaries: { awardId: string; awardName: string; year: number; result: string }[];
  /** Resolved at build time from public/data/source/covers-cache.json (see scripts/fetch-covers.mjs).
   *  Absent when no ISBN/cover could be matched — callers must fall back to the placeholder cover. */
  coverUrl?: string;
  /** covers-cache が解決したISBN。購入リンクの商品ページ直リンクに使う。 */
  isbn?: string;
  /** 楽天ブックスの商品ページURL。購入リンクをここへ直リンクする。 */
  rakutenItemUrl?: string;
  /** Ids of similar books, best first, computed at build time by generate-manifest.mjs.
   *  Only present in generated/works.json — the copies embedded in the cross-reference lists
   *  omit it to keep those files small. */
  relatedWorkIds?: string[];
}

/** Shared shape for authors/translators/publishers list+detail pages. */
export interface PersonOrPublisherGenerated {
  id: string;
  name: string;
  nameKana: string;
  description: string;
  externalLinks: ExternalLinks;
  workCount: number;
  /** 実データは works.json 側。表示側で id から引き直す。 */
  workIds: string[];
}

export interface TechGenerated extends TechSource {
  workCount: number;
  /** Newest edition first — the opposite of mystery-db's detective pages, because for a
   *  technology the current book matters more than the historically first one. */
  /** 実データは works.json 側。表示側で id から引き直す。 */
  workIds: string[];
}

export interface ThemeGenerated extends ThemeSource {
  workCount: number;
  /** 実データは works.json 側。表示側で id から引き直す。 */
  workIds: string[];
}

export interface AwardWinner {
  workId: string;
  workTitle: string;
  year: number;
  result: string;
  /** 並べ替え用に result から取り出した順位。順位表記がないものは大賞系=0 / その他=900。 */
  rank: number;
}

export interface AwardGenerated extends AwardSource {
  workCount: number;
  winners: AwardWinner[];
}

/** 作品詳細ページだけが読む長文(generated/work-texts.json)。キーは作品id。 */
export type WorkTexts = Record<string, { synopsis: string; sourceNote: string }>;

/** 「好みからおすすめ」(/recommend)専用の軽量索引(generated/recommend-index.json)。
 *  tags は件数の多い順、items はタグidだけを持つ全本。 */
export interface RecommendIndex {
  tags: { id: string; name: string; count: number }[];
  items: { id: string; tagIds: string[] }[];
}

export interface Counts {
  works: number;
  authors: number;
  techs: number;
  translators: number;
  publishers: number;
  themes: number;
  awards: number;
}
