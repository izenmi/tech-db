import type { BookLevel, TechCategory } from "../../types";

/** Display labels for the two enums that appear in filters, cards and headings alike. Kept in one
 *  place so a wording change lands everywhere at once. */
export const LEVEL_LABEL: Record<BookLevel, string> = {
  beginner: "入門",
  intermediate: "中級",
  advanced: "上級",
};

export const LEVEL_OPTIONS: { value: BookLevel; label: string }[] = [
  { value: "beginner", label: "入門" },
  { value: "intermediate", label: "中級" },
  { value: "advanced", label: "上級" },
];

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
