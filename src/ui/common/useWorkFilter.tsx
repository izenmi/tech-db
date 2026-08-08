import { useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import type { WorkGenerated } from "../../types";

/**
 * 作品リストを持つページ(テーマ詳細・原作者/作画家/出版社/レーベル詳細・アワード詳細)で
 * 共通に使う絞り込み。作品一覧ページ(WorkListPage)と同じ操作感を、詳細ページにも出すためのもの。
 *
 * 絞り込み条件はURLのクエリパラメータに持つので、絞った状態のまま共有・ブックマークできるし、
 * ブラウザの戻るでひとつ前の条件に戻れる。詳細ページごとに useState を置くとこれが崩れる。
 *
 * WorkListPage 側は「テーマ」「レーベル」など、そのページでしか意味のない条件も持つため
 * 統合していない。ここに置くのは**どの詳細ページでも意味がある条件だけ**にしている。
 */

const LEVEL_OPTIONS = [
  { value: "beginner", label: "入門" },
  { value: "intermediate", label: "中級" },
  { value: "advanced", label: "上級" },
];

const ORIGIN_OPTIONS = [
  { value: "jp", label: "日本語オリジナル" },
  { value: "overseas", label: "翻訳書" },
];

const SORT_OPTIONS = [
  { value: "year-desc", label: "刊行年が新しい順" },
  { value: "year-asc", label: "刊行年が古い順" },
  { value: "kana", label: "五十音順" },
];

export function useWorkFilter(works: WorkGenerated[] | undefined, defaultSort = "year-desc") {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const level = params.get("level") ?? "";
  const origin = params.get("origin") ?? "";
  const sort = params.get("sort") ?? defaultSort;

  const filtered = useMemo(() => {
    if (!works) return [];
    const keyword = q.trim().toLowerCase();
    return works.filter((w) => {
      if (keyword) {
        // 制作者名のフィールド名はサイトごとに違う(原作者/作画家、著者/イラストレーター等)ので
        // 存在するものだけを拾う。姉妹サイトへ同じフックを移植できるようにするため。
        const w2 = w as unknown as Record<string, unknown>;
        const names = ["originalAuthorNames", "artistNames", "authorNames", "illustratorNames"]
          .flatMap((k) => (Array.isArray(w2[k]) ? (w2[k] as string[]) : []));
        if (!`${w.title}${w.titleKana}${names.join("")}`.toLowerCase().includes(keyword)) return false;
      }
      if (level && w.level !== level) return false;
      if (origin && w.origin !== origin) return false;
      return true;
    });
  }, [works, q, level, origin]);

  const sorted = useMemo(() => {
    if (sort === "year-asc") return [...filtered].sort((a, b) => a.firstPublishedYear - b.firstPublishedYear);
    if (sort === "year-desc") return [...filtered].sort((a, b) => b.firstPublishedYear - a.firstPublishedYear);
    if (sort === "kana") return [...filtered].sort((a, b) => a.titleKana.localeCompare(b.titleKana, "ja"));
    return filtered;
  }, [filtered, sort]);

  function updateParam(key: string, value: string) {
    const next = new URLSearchParams(params);
    if (value) next.set(key, value);
    else next.delete(key);
    next.delete("page");
    setParams(next, { replace: true });
  }

  const hasActiveFilters = Boolean(q || level || origin);

  const controls = (
    <div className="filter-row">
      <input
        type="search"
        value={q}
        placeholder="タイトル・著者で絞り込み"
        aria-label="タイトル・著者で絞り込み"
        onChange={(e) => updateParam("q", e.target.value)}
      />
      <select value={level} onChange={(e) => updateParam("level", e.target.value)}>
        <option value="">難易度で絞り込み</option>
        {LEVEL_OPTIONS.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select value={origin} onChange={(e) => updateParam("origin", e.target.value)}>
        <option value="">原著の言語で絞り込み</option>
        {ORIGIN_OPTIONS.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <select
        value={sort}
        onChange={(e) => updateParam("sort", e.target.value === defaultSort ? "" : e.target.value)}
      >
        {SORT_OPTIONS.map((o) => (
          <option value={o.value} key={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      {hasActiveFilters && (
        <button
          type="button"
          className="filter-clear-btn"
          onClick={() => {
            const next = new URLSearchParams(params);
            ["q", "level", "origin"].forEach((k) => next.delete(k));
            setParams(next, { replace: true });
          }}
        >
          フィルターをクリア
        </button>
      )}
    </div>
  );

  return { filtered, sorted, controls, hasActiveFilters };
}
