import { useParams } from "react-router-dom";
import { getTech } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { WorkCard } from "../common/WorkCard";
import { BASE_PATH, SITE_NAME, breadcrumbJsonLd, useSeo } from "../common/useSeo";
import { TECH_CATEGORY_LABEL } from "../common/labels";

/** Unlike every other cross-reference page on the site, the book list here is NOT re-sortable:
 *  it is always newest edition first, because "which book should I read for this technology
 *  now?" is the question this page exists to answer, and for technical books the answer skews
 *  hard towards the most recent edition. generate-manifest.mjs already emits `works` in that
 *  order. */
export function TechDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsyncData(() => getTech(id!), [id]);
  const tech = state.status === "ready" ? state.data : undefined;

  useSeo({
    title: tech?.name,
    description: tech
      ? `${tech.name}の技術書${tech.workCount}冊を新しい版から順に紹介。${tech.description}`.slice(0, 160)
      : undefined,
    jsonLd: tech
      ? breadcrumbJsonLd([
          { name: SITE_NAME, path: BASE_PATH },
          { name: "技術スタック一覧", path: `${BASE_PATH}techs` },
          { name: tech.name, path: `${BASE_PATH}techs/${id}` },
        ])
      : undefined,
  });

  return (
    <div className="page">
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && !state.data && <EmptyState text="見つかりませんでした。" />}
      {state.status === "ready" && state.data && (
        <>
          <h1>{state.data.name}</h1>
          <p className="page-subtitle">
            {TECH_CATEGORY_LABEL[state.data.category]}
            {state.data.releasedYear && ` / ${state.data.releasedYear}年登場`}
            {" / "}
            {state.data.workCount}冊
          </p>
          <p>{state.data.description}</p>
          {(state.data.externalLinks.officialUrl || state.data.externalLinks.wikipediaUrl) && (
            <p>
              {state.data.externalLinks.officialUrl && (
                <a href={state.data.externalLinks.officialUrl} target="_blank" rel="noreferrer">
                  公式サイト
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
          <h2 className="home-section__heading font-display">この技術の本(新しい順)</h2>
          {state.data.works.length === 0 && <EmptyState text="登録されている本はまだありません。" />}
          <div className="work-grid">
            {state.data.works.map((w) => (
              <WorkCard work={w} key={w.id} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
