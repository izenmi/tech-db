# 技術書DB

ITエンジニア向けの技術書を技術スタック・対象レベル・著者・翻訳者・出版社・受賞歴・テーマから検索できるデータベースです。姉妹サイト [ミステリDB](https://izenmi.github.io/mystery-db/) をベースに作成しました。**言語・フレームワーク・インフラといった技術スタックを独立した軸として持ち、技術ごとに本を新しい版から辿れる**のが特徴です。

https://izenmi.github.io/tech-db/

## 版と情報の鮮度について

技術書は内容が古くなりやすいため、**収録した版(第◯版・改訂版)とその刊行年**を明記しています。一覧の並び順や「刊行の新しさ」の絞り込みも、初版ではなくこの版の年を基準にしています。ただし古い本を隠すことはしません — 刊行から年数が経っても価値が落ちない本があるためです。

翻訳書については、原著の刊行年と邦訳版の刊行年を分けて記録しています。一覧や詳細に出る年は**邦訳版**の年で、原著の年は詳細ページの「原著◯◯年」と年表ページで使っています。

## 対象レベルについて

各書籍には「入門」「中級」「上級」のいずれかを付けています。書籍のまえがきや出版社が示す想定読者像をもとにした**目安**であり、絶対的な難易度の評価ではありません。

## データについて

`public/data/source/*.json` が一次データです。出版社の公式書籍ページ、電子書店の書誌情報、国立国会図書館サーチ、Wikipediaなどの公開情報を参考に、内容紹介等は独自の文章で要約して作成しています(出版社の紹介文をそのまま転記することはしていません)。データの誤りに気づいた場合はIssueでお知らせください。

`public/data/generated/*.json` はビルド時に `scripts/generate-manifest.mjs` が `source/*.json` から自動生成する非正規化データです(`.gitignore`対象、手で編集しないでください)。

## 開発

```sh
npm install
npm run dev        # http://localhost:5173/tech-db/
npm run build      # 型チェック + データ整合性チェック + ビルド + プリレンダー
npm run preview
npm run fetch-covers   # 表紙画像の解決(要 RAKUTEN_APP_ID / RAKUTEN_ACCESS_KEY)
```

`npm run dev` / `npm run build` の前に `scripts/generate-manifest.mjs` が自動実行され、`source/*.json` 内のid参照(著者・技術スタック・翻訳者・出版社・テーマ・アワード)や対象レベル・ISBNの形式に誤りがあるとビルドが失敗します。

## デプロイ

`main` ブランチへのpushで GitHub Actions (`.github/workflows/deploy.yml`) が自動的にビルドしてGitHub Pagesへ公開します。リポジトリ名を変更する場合は `vite.config.ts` の `base` も合わせて変更してください。

## 姉妹サイト

- [らのべDB](https://izenmi.github.io/ranobe-db/) — ライトノベル
- [まんがDB](https://izenmi.github.io/manga-db/) — コミック
- [ミステリDB](https://izenmi.github.io/mystery-db/) — 推理小説・ミステリ
- [ゲームDB](https://izenmi.github.io/game-db/) — PS5 / Switch / Switch 2

5サイトはトップナビの「横断検索」からまとめて検索できます。
