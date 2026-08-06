import { useParams } from "react-router-dom";
import { getAuthor, getTranslator, getPublisher } from "../../data/manifest";
import { useAsyncData } from "./useAsyncData";
import { Loading, ErrorState, EmptyState } from "./Status";
import { WorkCard } from "./WorkCard";
import type { PersonKind } from "./PersonListPage";
import { BASE_PATH, SITE_NAME, breadcrumbJsonLd, useSeo } from "./useSeo";

const FETCHER: Record<PersonKind, (id: string) => ReturnType<typeof getAuthor>> = {
  author: getAuthor,
  translator: getTranslator,
  publisher: getPublisher,
};

const LIST_INFO: Record<PersonKind, { pathPrefix: string; listName: string; schemaType: string; noun: string }> = {
  author: { pathPrefix: "/authors", listName: "著者一覧", schemaType: "Person", noun: "著者" },
  translator: { pathPrefix: "/translators", listName: "翻訳者一覧", schemaType: "Person", noun: "翻訳者" },
  publisher: { pathPrefix: "/publishers", listName: "出版社一覧", schemaType: "Organization", noun: "出版社" },
};

export function PersonDetailPage({ kind }: { kind: PersonKind }) {
  const { id } = useParams<{ id: string }>();
  const state = useAsyncData(() => FETCHER[kind](id!), [kind, id]);
  const person = state.status === "ready" ? state.data : undefined;
  const info = LIST_INFO[kind];

  useSeo({
    title: person?.name,
    description: person
      ? `${info.noun}「${person.name}」が手がけた技術書${person.workCount}冊一覧。${person.description}`.slice(0, 160)
      : undefined,
    jsonLd: person
      ? [
          {
            "@context": "https://schema.org",
            "@type": info.schemaType,
            name: person.name,
            ...(person.description && { description: person.description }),
            ...(person.externalLinks.wikipediaUrl && { sameAs: [person.externalLinks.wikipediaUrl] }),
          },
          breadcrumbJsonLd([
            { name: SITE_NAME, path: BASE_PATH },
            { name: info.listName, path: `${BASE_PATH}${info.pathPrefix.slice(1)}` },
            { name: person.name, path: `${BASE_PATH}${info.pathPrefix.slice(1)}/${id}` },
          ]),
        ]
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
          <p className="page-subtitle">{state.data.workCount}冊</p>
          {state.data.description && <p>{state.data.description}</p>}
          {state.data.externalLinks.wikipediaUrl && (
            <p>
              <a href={state.data.externalLinks.wikipediaUrl} target="_blank" rel="noreferrer">
                Wikipediaで見る
              </a>
            </p>
          )}
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
