import { useMemo } from "react";
import { useParams, useSearchParams } from "react-router-dom";
import { getTheme } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { WorkCard } from "../common/WorkCard";
import { BASE_PATH, SITE_NAME, breadcrumbJsonLd, useSeo } from "../common/useSeo";
import { LEVEL_OPTIONS } from "../common/labels";
import { bookYear } from "../common/bookYear";

const ORIGIN_OPTIONS: { value: string; label: string }[] = [
  { value: "jp", label: "日本語オリジナル" },
  { value: "overseas", label: "翻訳書" },
];

const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: "year-desc", label: "刊行が新しい順" },
  { value: "year-asc", label: "刊行が古い順" },
  { value: "kana", label: "五十音順" },
];

export function ThemeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const state = useAsyncData(() => getTheme(id!), [id]);
  const theme = state.status === "ready" ? state.data : undefined;

  useSeo({
    title: theme?.name,
    description: theme
      ? `「${theme.name}」テーマの技術書${theme.workCount}冊一覧。${theme.description ?? ""}`.trim()
      : undefined,
    jsonLd: theme
      ? breadcrumbJsonLd([
          { name: SITE_NAME, path: BASE_PATH },
          { name: "テーマ一覧", path: `${BASE_PATH}themes` },
          { name: theme.name, path: `${BASE_PATH}themes/${id}` },
        ])
      : undefined,
  });

  const [params, setParams] = useSearchParams();
  const origin = params.get("origin") ?? "";
  const level = params.get("level") ?? "";
  const sort = params.get("sort") ?? "year-desc";

  const filtered = useMemo(() => {
    if (state.status !== "ready" || !state.data) return [];
    return state.data.works.filter((w) => {
      if (origin && w.origin !== origin) return false;
      if (level && w.level !== level) return false;
      return true;
    });
  }, [state, origin, level]);

  const sorted = useMemo(() => {
    if (sort === "year-asc") return [...filtered].sort((a, b) => bookYear(a) - bookYear(b));
    if (sort === "year-desc") return [...filtered].sort((a, b) => bookYear(b) - bookYear(a));
    if (sort === "kana") return [...filtered].sort((a, b) => a.titleKana.localeCompare(b.titleKana, "ja"));
    return filtered;
  }, [filtered, sort]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    setParams(next, { replace: true });
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    for (const key of ["origin", "level"]) {
      next.delete(key);
    }
    setParams(next, { replace: true });
  }

  const hasActiveFilters = Boolean(origin || level);

  return (
    <div className="page">
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && !state.data && <EmptyState text="見つかりませんでした。" />}
      {state.status === "ready" && state.data && (
        <>
          <h1>{state.data.name}</h1>
          <p className="page-subtitle">{state.data.workCount}冊</p>
          {state.data.description && <p>{state.data.description}</p>}
          <div className="filter-row">
            <select value={level} onChange={(e) => updateParam("level", e.target.value)}>
              <option value="">対象レベルで絞り込み</option>
              {LEVEL_OPTIONS.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select value={origin} onChange={(e) => updateParam("origin", e.target.value)}>
              <option value="">原著/翻訳で絞り込み</option>
              {ORIGIN_OPTIONS.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            <select
              value={sort}
              onChange={(e) => updateParam("sort", e.target.value === "year-desc" ? "" : e.target.value)}
            >
              {SORT_OPTIONS.map((o) => (
                <option value={o.value} key={o.value}>
                  {o.label}
                </option>
              ))}
            </select>
            {hasActiveFilters && (
              <button type="button" className="filter-clear-btn" onClick={clearFilters}>
                フィルターをクリア
              </button>
            )}
          </div>
          {sorted.length === 0 && <EmptyState />}
          <div className="work-grid">
            {sorted.map((w) => (
              <WorkCard work={w} key={w.id} />
            ))}
          </div>
        </>
      )}
    </div>
  );
}
