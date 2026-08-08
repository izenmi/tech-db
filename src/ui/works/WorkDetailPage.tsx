import { useMemo } from "react";
import { Link, useParams } from "react-router-dom";
import { getWork, getWorks } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { WorkCard } from "../common/WorkCard";
import { WorkCover, amazonSearchUrl, rakutenBooksUrl } from "../common/WorkCover";
import { BASE_PATH, DEFAULT_OG_IMAGE, SITE_NAME, breadcrumbJsonLd, useSeo } from "../common/useSeo";
import { LEVEL_LABEL } from "../common/labels";
import { bookYear } from "../common/bookYear";
import type { WorkGenerated } from "../../types";

function workJsonLd(id: string, w: WorkGenerated) {
  return [
    {
      "@context": "https://schema.org",
      "@type": "Book",
      name: w.title,
      inLanguage: "ja",
      author: w.authorNames.map((name) => ({ "@type": "Person", name })),
      ...(w.translatorNames.length > 0 && {
        translator: w.translatorNames.map((name) => ({ "@type": "Person", name })),
      }),
      publisher: { "@type": "Organization", name: w.publisherName },
      datePublished: String(bookYear(w)),
      ...(w.edition && { bookEdition: w.edition }),
      genre: [...w.themeNames, ...w.techNames],
      description: w.synopsis,
      ...(w.coverUrl && { image: w.coverUrl }),
      ...(w.awardSummaries.length > 0 && {
        award: w.awardSummaries.map((a) => `${a.awardName} ${a.result}(${a.year})`),
      }),
    },
    breadcrumbJsonLd([
      { name: SITE_NAME, path: BASE_PATH },
      { name: "本を探す", path: `${BASE_PATH}works` },
      { name: w.title, path: `${BASE_PATH}works/${id}` },
    ]),
  ];
}

export function WorkDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsyncData(() => getWork(id!), [id]);
  const work = state.status === "ready" ? state.data : undefined;

  // getWorks() resolves from the same cached works.json that getWork() above already pulled,
  // so this costs no extra request.
  const allWorksState = useAsyncData(getWorks, []);
  const relatedWorks = useMemo(() => {
    if (allWorksState.status !== "ready" || !work?.relatedWorkIds) return [];
    const byId = new Map(allWorksState.data.map((x) => [x.id, x]));
    return work.relatedWorkIds
      .map((relatedId) => byId.get(relatedId))
      .filter((x): x is WorkGenerated => Boolean(x));
  }, [allWorksState, work]);

  useSeo({
    title: work?.title,
    description: work
      ? `${work.title}(${work.authorNames.join("・")}/${work.publisherName})の内容・刊行年・対象レベル・扱う技術をまとめて紹介。${work.synopsis.slice(0, 60)}…`
      : undefined,
    image: work?.coverUrl ?? DEFAULT_OG_IMAGE,
    jsonLd: work ? workJsonLd(id!, work) : undefined,
  });

  return (
    <div className="page">
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && !state.data && <EmptyState text="見つかりませんでした。" />}
      {state.status === "ready" && state.data && (
        <>
          <div className="work-detail__hero">
            <div className="work-detail__hero-cover">
              <WorkCover title={state.data.title} coverUrl={state.data.coverUrl} size="lg" />
              <a
                className="cover-link"
                href={amazonSearchUrl(state.data.title, state.data.authorNames[0], state.data.isbn)}
                target="_blank"
                rel="noreferrer"
              >
                Amazonで購入
              </a>
              <a
                className="cover-link"
                href={rakutenBooksUrl(state.data.title, state.data.authorNames[0], state.data.isbn)}
                target="_blank"
                rel="noreferrer"
              >
                楽天ブックスで購入
              </a>
            </div>
            <div className="work-card__body">
              <h1>{state.data.title}</h1>
              {state.data.originalTitle && <p className="page-subtitle">原題: {state.data.originalTitle}</p>}
              <p className="page-subtitle">
                {state.data.authorIds.map((authorId, i) => (
                  <span key={authorId}>
                    {i > 0 && "・"}
                    <Link to={`/authors/${authorId}`}>{state.data!.authorNames[i]}</Link>
                  </span>
                ))}
                {state.data.translatorIds.length > 0 && (
                  <>
                    (訳:{" "}
                    {state.data.translatorIds.map((translatorId, i) => (
                      <span key={translatorId}>
                        {i > 0 && "・"}
                        <Link to={`/translators/${translatorId}`}>{state.data!.translatorNames[i]}</Link>
                      </span>
                    ))}
                    )
                  </>
                )}
              </p>
              <p className="page-subtitle">
                <Link to={`/publishers/${state.data.publisherId}`}>{state.data.publisherName}</Link>
                {" / "}
                {bookYear(state.data)}年
                {state.data.edition && `(${state.data.edition})`}
                {state.data.origin === "overseas" && ` / 原著${state.data.firstPublishedYear}年`}
              </p>
              {state.data.targetVersion && (
                <p className="page-subtitle">対象バージョン: {state.data.targetVersion}</p>
              )}
              {state.data.seriesName && <p className="page-subtitle">{state.data.seriesName}</p>}

              <div className="chip-row">
                <span className={`chip level-chip level-chip--${state.data.level}`}>
                  {LEVEL_LABEL[state.data.level]}向け
                </span>
              </div>

              <p className="page-subtitle">
                技術:{" "}
                {state.data.techIds.length > 0 ? (
                  state.data.techIds.map((techId, i) => (
                    <span key={techId}>
                      {i > 0 && "・"}
                      <Link to={`/techs/${techId}`}>{state.data!.techNames[i]}</Link>
                    </span>
                  ))
                ) : (
                  // Books like 『人月の神話』 teach no particular stack; saying so is more useful
                  // than silently omitting the row.
                  <>技術非依存</>
                )}
              </p>

              {state.data.themeIds.length > 0 && (
                <div className="chip-row">
                  {state.data.themeIds.map((themeId, i) => (
                    <Link className="chip" to={`/themes/${themeId}`} key={themeId}>
                      {state.data!.themeNames[i]}
                    </Link>
                  ))}
                </div>
              )}

              {state.data.awardSummaries.length > 0 && (
                <div className="chip-row">
                  {state.data.awardSummaries.map((a) => (
                    <Link className="chip award-chip" to={`/awards/${a.awardId}`} key={`${a.awardId}-${a.year}`}>
                      {a.awardName} {a.result}({a.year})
                    </Link>
                  ))}
                </div>
              )}
            </div>
          </div>

          <p>{state.data.synopsis}</p>

          {(state.data.externalLinks.officialUrl || state.data.externalLinks.wikipediaUrl) && (
            <p>
              {state.data.externalLinks.officialUrl && (
                <a href={state.data.externalLinks.officialUrl} target="_blank" rel="noreferrer">
                  出版社の書籍ページ
                </a>
              )}
              {state.data.externalLinks.officialUrl && state.data.externalLinks.wikipediaUrl && " / "}
              {state.data.externalLinks.wikipediaUrl && (
                <a href={state.data.externalLinks.wikipediaUrl} target="_blank" rel="noreferrer">
                  Wikipediaで見る
                </a>
              )}
            </p>
          )}

          {relatedWorks.length > 0 && (
            <div className="home-section">
              <h2 className="home-section__heading font-display">この本が好きなら</h2>
              <div className="work-grid">
                {relatedWorks.map((related) => (
                  <WorkCard key={related.id} work={related} />
                ))}
              </div>
            </div>
          )}

          <p className="source-note">{state.data.sourceNote}</p>
        </>
      )}
    </div>
  );
}
