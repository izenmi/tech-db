import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { getPublishers, getTechs, getThemes, getWorks } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState, EmptyState } from "../common/Status";
import { WorkGrid } from "../common/WorkGrid";
import { useCoverView } from "../common/useCoverView";
import { useSeo } from "../common/useSeo";
import { TECH_CATEGORY_LABEL, TECH_CATEGORY_ORDER } from "../common/labels";
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

/** Cutoffs for the freshness filter, in years before the current one. Technical books age out of
 *  usefulness at very different rates by topic, so this is a coarse browse aid rather than a
 *  judgement — nothing is hidden by default. */
const FRESHNESS_OPTIONS: { value: string; label: string }[] = [
  { value: "5", label: "5年以内の版" },
  { value: "10", label: "10年以内の版" },
];

const PAGE_SIZE = 50;

/** Numbered page list with "…" collapsing for large totals, e.g. [1,2,3,"…",710].
 *  Always keeps a 3-page window around the current page plus the first/last page pinned;
 *  collapses to a plain 1..totalPages list when everything already fits without gaps. */
function getPageNumbers(page: number, totalPages: number): (number | "ellipsis")[] {
  const windowSize = 3;
  if (totalPages <= windowSize + 2) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }

  let start: number;
  if (page <= windowSize) {
    start = 1;
  } else if (page > totalPages - windowSize) {
    start = totalPages - windowSize + 1;
  } else {
    start = page - 1;
  }
  const end = start + windowSize - 1;

  const items: (number | "ellipsis")[] = [];
  if (start > 1) {
    items.push(1);
    if (start > 2) items.push("ellipsis");
  }
  for (let n = start; n <= end; n++) items.push(n);
  if (end < totalPages) {
    if (end < totalPages - 1) items.push("ellipsis");
    items.push(totalPages);
  }
  return items;
}

function Pager({ page, totalPages, onGoToPage }: { page: number; totalPages: number; onGoToPage: (page: number) => void }) {
  return (
    <div className="pager">
      <button type="button" className="pager__prev" disabled={page <= 1} onClick={() => onGoToPage(page - 1)}>
        ← 前へ
      </button>
      <ol className="pager__pages">
        {getPageNumbers(page, totalPages).map((item, i) =>
          item === "ellipsis" ? (
            <li className="pager__ellipsis" key={`ellipsis-${i}`} aria-hidden="true">
              …
            </li>
          ) : (
            <li key={item}>
              <button
                type="button"
                className={item === page ? "pager__page pager__page--active" : "pager__page"}
                aria-current={item === page ? "page" : undefined}
                onClick={() => onGoToPage(item)}
              >
                {item}
              </button>
            </li>
          ),
        )}
      </ol>
      <button type="button" className="pager__next" disabled={page >= totalPages} onClick={() => onGoToPage(page + 1)}>
        次へ →
      </button>
    </div>
  );
}

export function WorkListPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const themeId = params.get("theme") ?? "";
  const publisherId = params.get("publisher") ?? "";
  const techId = params.get("tech") ?? "";
  const origin = params.get("origin") ?? "";
  const award = params.get("award") ?? "";
  const freshness = params.get("freshness") ?? "";
  const sort = params.get("sort") ?? "year-desc";
  const pageParam = Math.max(1, parseInt(params.get("page") ?? "1", 10) || 1);
  const { coverView, toggle } = useCoverView();

  const worksState = useAsyncData(getWorks, []);
  const themesState = useAsyncData(getThemes, []);
  const publishersState = useAsyncData(getPublishers, []);
  const techsState = useAsyncData(getTechs, []);

  useSeo({
    title: "本を探す",
    description:
      worksState.status === "ready"
        ? `技術書${worksState.data.length}冊を技術スタック・テーマ・出版社などから検索・絞り込みできます。`
        : undefined,
  });

  const filtered = useMemo(() => {
    if (worksState.status !== "ready") return [];
    const keyword = q.trim().toLowerCase();
    const currentYear = new Date().getFullYear();
    return worksState.data.filter((w) => {
      if (keyword) {
        const haystack =
          `${w.title}${w.titleKana}${w.authorNames.join("")}${w.techNames.join("")}`.toLowerCase();
        if (!haystack.includes(keyword)) return false;
      }
      if (themeId && !w.themeIds.includes(themeId)) return false;
      if (publisherId && w.publisherId !== publisherId) return false;
      if (techId && !w.techIds.includes(techId)) return false;
      if (origin && w.origin !== origin) return false;
      if (award === "yes" && w.awardSummaries.length === 0) return false;
      if (freshness && currentYear - bookYear(w) > Number(freshness)) {
        return false;
      }
      return true;
    });
  }, [worksState, q, themeId, publisherId, techId, origin, award, freshness]);

  const sorted = useMemo(() => {
    if (sort === "year-asc") return [...filtered].sort((a, b) => bookYear(a) - bookYear(b));
    if (sort === "year-desc") return [...filtered].sort((a, b) => bookYear(b) - bookYear(a));
    if (sort === "kana") return [...filtered].sort((a, b) => a.titleKana.localeCompare(b.titleKana, "ja"));
    return filtered;
  }, [filtered, sort]);

  const totalPages = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(pageParam, totalPages);
  const pageItems = sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  }

  function goToPage(nextPage: number) {
    const next = new URLSearchParams(params);
    if (nextPage <= 1) next.delete("page");
    else next.set("page", String(nextPage));
    setParams(next, { replace: true });
    window.scrollTo(0, 0);
  }

  function clearFilters() {
    const next = new URLSearchParams(params);
    for (const key of ["q", "theme", "publisher", "tech", "origin", "award", "freshness", "page"]) {
      next.delete(key);
    }
    setParams(next, { replace: true });
  }

  const hasActiveFilters = Boolean(
    q || themeId || publisherId || techId || origin || award || freshness
  );

  return (
    <div className="page">
      <h1>本を探す</h1>
      <input
        className="search-box"
        type="search"
        placeholder="書名・著者名・技術名で検索"
        value={q}
        onChange={(e) => updateParam("q", e.target.value)}
      />
      <div className="filter-row">
        {techsState.status === "ready" && (
          <select value={techId} onChange={(e) => updateParam("tech", e.target.value)}>
            <option value="">技術スタックで絞り込み</option>
            {TECH_CATEGORY_ORDER.map((category) => {
              const items = techsState.data.filter((t) => t.category === category);
              if (items.length === 0) return null;
              return (
                <optgroup label={TECH_CATEGORY_LABEL[category]} key={category}>
                  {items.map((t) => (
                    <option value={t.id} key={t.id}>
                      {t.name}
                    </option>
                  ))}
                </optgroup>
              );
            })}
          </select>
        )}
        {themesState.status === "ready" && (
          <select value={themeId} onChange={(e) => updateParam("theme", e.target.value)}>
            <option value="">テーマで絞り込み</option>
            {themesState.data.map((t) => (
              <option value={t.id} key={t.id}>
                {t.name}
              </option>
            ))}
          </select>
        )}
        {publishersState.status === "ready" && (
          <select value={publisherId} onChange={(e) => updateParam("publisher", e.target.value)}>
            <option value="">出版社で絞り込み</option>
            {publishersState.data.map((p) => (
              <option value={p.id} key={p.id}>
                {p.name}
              </option>
            ))}
          </select>
        )}
        <select value={origin} onChange={(e) => updateParam("origin", e.target.value)}>
          <option value="">原著/翻訳で絞り込み</option>
          {ORIGIN_OPTIONS.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={freshness} onChange={(e) => updateParam("freshness", e.target.value)}>
          <option value="">刊行の新しさで絞り込み</option>
          {FRESHNESS_OPTIONS.map((o) => (
            <option value={o.value} key={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <select value={award} onChange={(e) => updateParam("award", e.target.value)}>
          <option value="">受賞歴で絞り込み</option>
          <option value="yes">受賞歴あり</option>
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
        {toggle}
      </div>

      {worksState.status === "loading" && <Loading />}
      {worksState.status === "error" && <ErrorState error={worksState.error} />}
      {worksState.status === "ready" && (
        <>
          <p className="page-subtitle">
            {hasActiveFilters ? `${filtered.length}件 / 全${worksState.data.length}件` : `${filtered.length}件`}
            {totalPages > 1 && `(${page} / ${totalPages}ページ)`}
          </p>
          {filtered.length === 0 && <EmptyState />}
          {totalPages > 1 && <Pager page={page} totalPages={totalPages} onGoToPage={goToPage} />}
          <WorkGrid works={pageItems} coverView={coverView} />
          {totalPages > 1 && <Pager page={page} totalPages={totalPages} onGoToPage={goToPage} />}
        </>
      )}
    </div>
  );
}
