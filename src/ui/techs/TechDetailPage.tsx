import { useParams } from "react-router-dom";
import { getTech, getWorksByIds } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { WorkGrid } from "../common/WorkGrid";
import { BASE_PATH, SITE_NAME, breadcrumbJsonLd, useSeo } from "../common/useSeo";
import { TECH_CATEGORY_LABEL } from "../common/labels";
import { useWorkFilter } from "../common/useWorkFilter";

/** 既定の並びは新しい版が先。「この技術について今どれを読めばいいか」がこのページの用なので、
 *  技術書では最新版が答えになりやすい。generate-manifest.mjs が既にその順で `works` を出している。
 *  並べ替えと絞り込みは他の一覧ページと揃えて出す(既定を崩さないよう defaultSort は year-desc)。 */
export function TechDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsyncData(() => getTech(id!), [id]);
  const tech = state.status === "ready" ? state.data : undefined;
  // 作品の実データは works.json 側にある(エンティティは workIds しか持たない)。
  // 取得済みならキャッシュから返るので追加の通信はほぼ発生しない。
  const resolvedWorksState = useAsyncData(
    () => (tech ? getWorksByIds(tech.workIds) : Promise.resolve([])),
    [tech],
  );
  const resolvedWorks = resolvedWorksState.status === "ready" ? resolvedWorksState.data : undefined;
  const { sorted, controls, hasActiveFilters, coverView } = useWorkFilter(resolvedWorks);

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
          <h2 className="home-section__heading font-display">この技術の本</h2>
          {controls}
          {hasActiveFilters && (
            <p className="page-subtitle">
              絞り込み結果 {sorted.length}件 / 全{state.data.workCount}件
            </p>
          )}
          {sorted.length === 0 && <EmptyState text="登録されている本はまだありません。" />}
          <WorkGrid works={sorted} coverView={coverView} />
        </>
      )}
    </div>
  );
}
