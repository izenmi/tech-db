import { Link } from "react-router-dom";
import type { WorkGenerated } from "../../types";
import { WorkCover } from "./WorkCover";
import { bookYear } from "./bookYear";

function authorLine(work: WorkGenerated): string {
  const authors = work.authorNames.join("・");
  if (work.translatorNames.length === 0) return authors;
  return `${authors}(訳: ${work.translatorNames.join("・")})`;
}

/** Fuller card for the main book list page: cover thumbnail on the left, and a right-hand
 *  column (title/author/publisher/awards + clickable theme tags). The whole card navigates
 *  to the book page via a "stretched link" (`work-card__cover-link`, an absolutely-positioned
 *  <Link> covering the entire card) rather than a `<div onClick>` — that keeps the click target
 *  a real `<a>` so middle-click/ctrl-click "open in new tab" and keyboard nav work natively. The
 *  theme tags' own `<Link>`s are layered above it (`position: relative` in CSS) so they still
 *  navigate to their own theme page instead of the book page. */
export function WorkCard({ work }: { work: WorkGenerated }) {
  return (
    <div className="work-card">
      <Link to={`/works/${work.id}`} className="work-card__cover-link" aria-label={work.title} />
      <WorkCover title={work.title} coverUrl={work.coverUrl} size="sm" />
      <div className="work-card__content">
        <div className="work-card__title">{work.title}</div>
        <div className="work-card__meta">
          {authorLine(work)} / {work.publisherName} / {bookYear(work)}年
          {work.edition && `(${work.edition})`}
          {work.origin === "overseas" && " / 翻訳書"}
        </div>
        {work.seriesName && <div className="work-card__series">{work.seriesName}</div>}
        <div className="chip-row">
          {work.targetVersion && <span className="chip version-chip">{work.targetVersion}</span>}
        </div>
        {work.techNames.length > 0 && (
          <div className="work-card__meta">技術: {work.techNames.join("・")}</div>
        )}
        {work.awardSummaries.length > 0 && (
          <div className="work-card__awards">
            {work.awardSummaries.slice(0, 2).map((a) => (
              <span className="chip award-chip" key={`${a.awardId}-${a.year}`}>
                {a.awardName} {a.result}
              </span>
            ))}
          </div>
        )}
        {work.themeIds.length > 0 && (
          <div className="chip-row">
            {work.themeIds.map((id, i) => (
              <Link className="chip" to={`/themes/${id}`} key={id}>
                {work.themeNames[i]}
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/** 表紙表示モード(`?view=covers`)のカード。書影だけを大きく並べる。カード全体がそのまま
 *  <Link> なので WorkCard のような stretched link は要らない。文字が一切出ないぶん、書名は
 *  `title`(ホバーで出るツールチップ)と `aria-label`(読み上げ・キーボード操作)の両方で補う。 */
export function WorkCoverCard({ work }: { work: WorkGenerated }) {
  return (
    <Link to={`/works/${work.id}`} className="work-cover-card" title={work.title} aria-label={work.title}>
      <WorkCover title={work.title} coverUrl={work.coverUrl} size="xl" />
    </Link>
  );
}
