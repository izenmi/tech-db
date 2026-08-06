import { Link } from "react-router-dom";
import { getTechs } from "../../data/manifest";
import { useAsyncData } from "../common/useAsyncData";
import { Loading, ErrorState } from "../common/Status";
import { useSeo } from "../common/useSeo";
import { TECH_CATEGORY_LABEL, TECH_CATEGORY_ORDER } from "../common/labels";

/** Technologies get their own list rather than reusing EntityList, because a flat A-Z run of
 *  "Rust / PostgreSQL / アルゴリズム / Docker" is hard to scan — the category headings are what
 *  make it usable. */
export function TechListPage() {
  const state = useAsyncData(getTechs, []);

  useSeo({
    title: "技術スタック一覧",
    description:
      state.status === "ready"
        ? `プログラミング言語・フレームワーク・インフラなど${state.data.length}件の技術から技術書を探せます。`
        : undefined,
  });

  return (
    <div className="page">
      <h1>技術スタック</h1>
      {state.status === "loading" && <Loading />}
      {state.status === "error" && <ErrorState error={state.error} />}
      {state.status === "ready" && (
        <>
          <p className="page-subtitle">{state.data.length}件</p>
          {TECH_CATEGORY_ORDER.map((category) => {
            const items = state.data.filter((t) => t.category === category);
            if (items.length === 0) return null;
            return (
              <section key={category}>
                <h2 className="home-section__heading font-display">{TECH_CATEGORY_LABEL[category]}</h2>
                <ul className="entity-list">
                  {items.map((t) => (
                    <li className="entity-list__item" key={t.id}>
                      <Link to={`/techs/${t.id}`}>
                        <span>
                          {t.name}
                          {t.releasedYear && <span className="entity-list__note">{t.releasedYear}年〜</span>}
                        </span>
                        <span className="entity-list__count">{t.workCount}</span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </>
      )}
    </div>
  );
}
