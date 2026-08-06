import type { WorkGenerated, WorkSource } from "../../types";

/** The year this book, as a reader can buy it in Japanese today, was published.
 *
 *  Three fields can answer "what year is this book?" and they mean different things:
 *    - `latestEditionYear` — the 第N版 we catalogued. Wins when present: a 2024 revision of a
 *      1999 book is a 2024 book as far as choosing what to read is concerned.
 *    - `jpPublishedYear` — when the Japanese edition of a translated book appeared.
 *    - `firstPublishedYear` — first publication in the original language.
 *
 *  For a translated book the last of these is the wrong thing to show: 『Clean Architecture』 is a
 *  2017 book in English but the edition on this site is the 2026 Japanese one, and labelling the
 *  card "2017年" tells a Japanese reader nothing useful about how current it is. The original year
 *  still has its own home — the work detail page prints it as 原著◯◯年, and /timeline groups by it
 *  deliberately so the timeline reads as a history of computing books rather than of translations.
 *
 *  Keep in sync with `editionYear()` in scripts/generate-manifest.mjs, which orders each tech
 *  page's book list and fills the cross-site search index with the same number. */
export function bookYear(work: WorkGenerated | WorkSource): number {
  return work.latestEditionYear ?? work.jpPublishedYear ?? work.firstPublishedYear;
}
