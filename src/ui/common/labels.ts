import type { TechCategory } from "../../types";



export const TECH_CATEGORY_LABEL: Record<TechCategory, string> = {
  language: "プログラミング言語",
  framework: "フレームワーク・ライブラリ",
  infra: "インフラ・クラウド",
  database: "データベース",
  tool: "ツール",
  concept: "分野・概念",
};

/** Section order on the tech list page: the things people search for by name first, the broad
 *  "分野" bucket last. */
export const TECH_CATEGORY_ORDER: TechCategory[] = [
  "language",
  "framework",
  "infra",
  "database",
  "tool",
  "concept",
];
