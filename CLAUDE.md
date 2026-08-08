# tech-db

ITエンジニア向けの技術書を技術スタック・対象レベル・著者・翻訳者・出版社・受賞歴・テーマから検索できるデータベース。姉妹サイト[ミステリDB](https://izenmi.github.io/mystery-db/)(`izenmi/mystery-db`)をベースに作成した5番目のサイト。**技術スタック(言語・フレームワーク・インフラ)を独立したエンティティとして持ち、技術ごとに本を新しい版から辿れる**のと、**収録した版と刊行年を明示する**のが差別化点。

- 公開URL: https://izenmi.github.io/tech-db/
- リポジトリ: `izenmi/tech-db`(public。GitHub Pagesは無料枠だとpublicでないと使えない)
- スタック: React 18 + TypeScript + Vite 5 + `react-router-dom`(`BrowserRouter`)。姉妹サイトと同じ

## なぜ mystery-db をベースにしたか

- 技術書も**1冊1エントリ**で登録する。シリーズ単位のranobe-db/manga-dbではなく、1タイトル単位のmystery-dbと同じ粒度
- 技術書は**翻訳書が主力**(オライリー・Manning・Addison-Wesley系)。mystery-dbの`origin`(jp/overseas)+訳者エンティティ+`originalTitle`/`jpPublishedYear`がそのまま効く

**mystery-db固有のネタバレ機構(`ThemeSource.spoiler`・`spoilerThemeIds`・spoiler関連のUI/CSS)は移植時にすべて削除した**。同様に`WorkStatus`・`volumeCount`・`mediaMix`・`relatedComicUrl`も技術書に意味がないため削除している。

## データフロー(source → generated)

- `public/data/source/*.json` … 手作業で作成・**コミットする**一次データ(works/authors/techs/translators/publishers/themes/awards/covers-cache)
- `public/data/generated/*.json` … `scripts/generate-manifest.mjs` がビルド時に生成する非正規化データ。**`.gitignore`対象**、`predev`/`prebuild`npmスクリプトで毎回再生成するので手で編集しない
- 生成スクリプトの検証(いずれも失敗するとビルドが落ちる):
  - 全Workの`authorIds`(空配列不可)/`techIds`/`translatorIds`/`publisherId`/`themeIds`/`awardResults[].awardId` の参照整合性
  - `level` が `beginner`/`intermediate`/`advanced` のいずれかであること
  - `isbn` は任意だが、あるならハイフンなし13桁(978/979始まり)であること
  - `TechSource.category` が6種のいずれかであること
  - **`origin` の整合性**: `"overseas"` なら `translatorIds` が1件以上あり `originalTitle` があること / `"jp"` なら `translatorIds`・`originalTitle`・`jpPublishedYear` がいずれも空であること

## データモデル上の判断(mystery-dbとの違い)

- **`techIds` は空配列を許可する**。『人月の神話』『Team Geek』のような技術非依存の本があるため。UIでは「技術非依存」と表示する(mystery-dbの`detectiveIds`が空を許すのと同じ考え方)
- **`level`(入門/中級/上級)は必須**。技術書選びで最も効く軸なので、テーマタグではなく作品のフィールドとして持つ
- **版と鮮度のフィールドを持つ**: `edition`(「第4版」等の自由テキスト)/ `latestEditionYear`(その版の刊行年)/ `targetVersion`(「Python 3.11」等)。技術書は内容が古くなりやすく、これが実用上いちばん重要な情報になる
- **`isbn` を持つ**。姉妹サイトが持たないのは「1作品が単行本と文庫で別々に版を重ねるため版ごとのISBNを持てない」からだが、このサイトは最初から「収録した版」を特定する設計なのでその制約が当てはまらない。表紙取得がISBN直引きになり、誤マッチが原理的に起きなくなる(後述)
- **`TechGenerated.works` は新しい版が先(降順固定)**。mystery-dbの探偵ページが「シリーズを読む順=発表年昇順」なのとは**逆**。技術スタックのページは「いまこの技術で読むべき本」を答える場所なので、古い順に並べる意味がない
- `PersonKind` は `"author" | "translator" | "publisher"`。技術スタックは固有フィールド(カテゴリ・登場年)を持ち、カテゴリ別セクションで表示するため generic な `PersonListPage`/`PersonDetailPage` を使わず `src/ui/techs/` に専用ページを置いている

### 「この本の年」は `bookYear()` に集約している(重要)

年を答えるフィールドが3つあり、意味が違う。`src/ui/common/bookYear.ts` の `bookYear()` が
`latestEditionYear ?? jpPublishedYear ?? firstPublishedYear` を返し、カード・詳細・並び替え・
「刊行の新しさ」フィルタ・JSON-LDのすべてがこれを使う。

- **翻訳書に原著年を表示してはいけない**。『Clean Architecture』は英語では2017年の本だが、当サイトが収録しているのは2026年の邦訳版であり、カードに「2017年」と出しても日本の読者には鮮度の情報にならない。実装当初これを間違えて原著年を出しており、画面確認で発見して直した
- 原著年には別の居場所がある: 作品詳細ページの「原著◯◯年」表記と、`/timeline`(意図的に`firstPublishedYear`でグルーピングし、コンピュータ書の歴史として読めるようにしている)
- `scripts/generate-manifest.mjs` の `editionYear()` が同じ規則を持つ(技術スタックページの並び順と横断検索の索引に使う)。**片方だけ変えないこと**

## 表紙画像(ISBN直引きが主、キーワード検索は保険)

`scripts/fetch-covers.mjs`。段の順序は以下:

0. **楽天ブックス `BooksBook/Search?isbn=`(ISBN直引き)** ← 本命
1. 楽天ブックス `BooksTotal/Search`(キーワード)
2. 楽天Kobo(キーワード)
3. BOOK☆WALKER(HTMLスクレイプ、キーワード)
4. **オライリー・ジャパン `/books/<isbn13>/`(ISBN、最後の砦)**

- **`isbn` を埋めるのが最優先**。2026-08-06時点で27冊すべてがISBN直引き1発で解決しており、誤マッチが起きないので`matchedTitle`の目視確認も不要。キーワード段のチューニングに時間を使うより`isbn`を調べるほうが速くて確実
- **ISBN検索は `BooksTotal/Search` では動かない**(`isbn`パラメータにHTTP 400を返す)。書籍専用の `BooksBook/Search` を使うこと
- **楽天のジャンルは `001005`(パソコン・システム開発)を要求する**。`booksGenreId` は複数ジャンルのとき `/` 区切りの並び("001005017/001005004003/001012010001")になるので全セグメントを見る。姉妹サイトのように「コミック/ラノベを除外」するより強く、短い英語タイトルが拾ってしまう雑誌(007605…)や音楽CD(002105…)も落ちる
- **BOOK☆WALKERは技術書を「実用」に分類する**。mystery-dbは「実用」を除外しているが、**このサイトでは除外してはいけない**(除外すると全滅する)。代わりに「マンガ（漫画）」「ライトノベル」「文芸・小説」を除外する
- **著者名だけの照合では翻訳書が全滅する**。楽天の著者欄は原著者をローマ字(「Brendan Gregg」「Andrew Hunt」)で書くことが多く、`authors.json`のカタカナ表記と一致しない。`creditNamesFor()`が**訳者名も照合対象に含める**ことで解決している(訳者は必ず日本語表記)
- **巻数の不一致はハード拒否**(`volumeToken`)。`sort=-releaseDate`(新しい順)にしているため、これがないとシリーズの最新巻を拾う。実際『ゼロから作るDeep Learning』に第6巻の書影が付いた
- オライリー段は商品ページの`<img>`から**ISBNの数字が一致するものを選ぶ**(URLの推測はしない)。`robots.txt`は`/books/`を許可。非オライリー本ではページが404になり正しく不発する
- **フラグ**: `--only=id1,id2` / `--force` / `--retry-misses`。手動修正済みのエントリがある状態で`--force`を使わないこと
- 楽天の認証情報(`RAKUTEN_APP_ID`/`RAKUTEN_ACCESS_KEY`)は**姉妹サイトと共用できる**(tech-dbでも2026-08-06に実証)。値はユーザーが管理

**検証済みで使えなかった経路**(再調査しないこと、2026-08-06):

- **openBD**: 書誌は返るが `summary.cover` が空。技術書8冊で試して書影は0件
- **Google Books API**: このサンドボックスの送信元IPから全リクエストが HTTP 429。時間を空けても解消しない

## データの裏取り手順(mystery-dbとの最大の運用差)

**技術書は日本語版Wikipediaにほとんど記事がない**ので、mystery-dbのWikipedia中心の手順は使えない。優先順を入れ替えている。

1. **楽天ブックスAPI `BooksBook/Search`** … 邦訳版のタイトル・著者/訳者・出版社・発売日・ISBN・`itemCaption`(出版社紹介文)が1リクエストで揃う。**`BooksTotal/Search` は `title`/`isbn` パラメータを受け付けずHTTP 400を返す**ので、キーワード検索は`keyword=`、書誌特定は`BooksBook`と使い分ける
2. **国立国会図書館サーチAPI**(`https://ndlsearch.ndl.go.jp/api/opensearch?title=...`) … **初版の刊行年月を調べる唯一の手段**。楽天は現行版しか扱っていないため、第2版・第6版の本の`firstPublishedYear`はここでしか取れない。訳者(`dc:creator`)も取れる。**`findtext`に名前空間を渡すときは`namespaces=`キーワード引数で渡すこと**(第2引数はdefault値)。レスポンスが遅く、連続で叩くと429になるので8秒程度あけて1件ずつ
3. **OpenLibrary**(`https://openlibrary.org/search.json?title=...&author=...`) … 原著の初版年。`first_publish_year`が使える
4. **英語版Wikipedia** … 有名な古典(The Mythical Man-Month、The Pragmatic Programmer、Effective Java)はこちらのほうが確実
5. **翔泳社「ITエンジニア本大賞」公式サイト**(`/campaign/award/<年>/result`) … 受賞歴。HTMLからタグを落とせば本文が読める

既存ルールはすべて踏襲する: **あらすじはコピペ禁止**(出版社紹介文からの転記も禁止、150〜250字で自分の言葉に)/ **実在確認できない候補は無理に埋めない** / **購入リンクは検索URL形式のみ**(`amazonSearchUrl()`、アフィリエイトタグ`izenmi-22`は姉妹サイト共通)。

## データ拡充時の作業フロー

**小バッチ(30冊程度まで)で作業し、バッチごとに即コミット・push**する。
**サブエージェントの並列実行はしない**(ranobe-dbでのユーザー指示を姉妹サイト全体に適用)。

1. 候補タイトルを1行1件のテキストにする
2. `python3 scripts/probe.py <candidates.txt> <probe.json> --sleep 2 --workers 3` で一括下調べ
3. probe.json のOKだけを見ながら注釈 `annot.json` を書く(下記)
4. `python3 scripts/merge_batch.py <probe.json> <annot.json> <batch.json>`
5. `python3 scripts/apply_batch.py <batch.json>`。batch.jsonのキーは `newAuthors` / `newTechs` /
   `newTranslators` / `newPublishers` / `newThemes` / `newAwards` / `works`。`generate-manifest.mjs`
   と同じルールで検証し、通らない要素はレポートしてスキップする
6. `npm run fetch-covers`(ISBNを入れてあれば1発で解決する)
7. `PRERENDER_PORT=4381 npm run build` が通ることを確認
8. `git add public/data/source && git commit && git push`

### scripts/probe.py — 候補の一括下調べ(2026-08-06 新設)

国立国会図書館サーチAPI(opensearch)に候補タイトルを投げ、**書名・書名の読み・責任表示(著/訳の別)・
出版社・刊行年・ISBN13・原タイトル・同書名の最古年**をまとめて取ってくる。これ1本で裏取りが済むので、
手で書くのは id・著者・技術スタック・レベル・テーマ・あらすじだけになる。

- **works.json と正規化タイトルで照合し、既登録の候補は詳しく調べる前に `DUP` として弾く**。
  ただし副題の有無で長さが大きく違うと取りこぼす(「達人に学ぶDB設計」で既存の
  「達人に学ぶDB設計徹底指南書」を検出できなかった)ので、OK行の書名も目視すること
- **`mediatype=1` を付けると図書のヒットが0件になる**。指定しないこと(実際に踏んだ)
- NDLは1件あたり5〜18秒かかる。`--workers 3` の並行取得で429は出なかった
- **タイトル検索は似た書名の別の本を拾うことがある**(「スッキリわかるJava入門」で実践編、
  「プログラミング作法」でExcel VBAの本がヒットした)。OK行の書名・著者・出版社を必ず確認する
- 学位論文や医学書など無関係な本が混じることもある。採用しない候補は annot.json に書かなければよい

### scripts/merge_batch.py — 注釈とマージして batch.json を作る

annot.json では短いキーで最小限だけ書く(`n` は probe.json の候補番号)。

```json
{"works": [{"n": 2, "id": "programmers-brain", "a": ["felienne-hermans"],
            "tr": ["mizuno-takaaki"], "t": ["python"], "th": ["essay-career"], "o": "ov", "ot": "The Programmer's Brain",
            "fy": 2021, "ed": "第2版", "syn": "…"}]}
```

タイトル・読み・ISBN・出版社・刊行年・`latestEditionYear`・`jpPublishedYear`・sourceNote は
probe.json から機械的に埋まる。出版社はNDLの表記から自動解決する(「日経BP社」→`nikkei-bp` のような
表記ゆれは吸収するが、「マイナビ」と「マイナビ出版」のように別語なら `p` で明示する)。

- **翻訳書(`o":"ov"`)は原著初版年 `fy` が必須**。NDLの `first_year` は同書名の別の本を拾って
  でたらめな年になることがあるので、`fy` は自分で確かめて書くこと
- 同じ人物が著者と訳者の両方で登場する場合、**authors と translators は別のエンティティ**なので
  両方に登録する(既存の `saito-koki` / `saito-koki-tr` と同じ流儀。`mick-tr` などを追加済み)

### scripts/verify_titles.py — 反映後の突き合わせ

`RAKUTEN_APP_ID=… RAKUTEN_ACCESS_KEY=… python3 scripts/verify_titles.py [work-id …]` で、
登録済みISBNを楽天ブックスに直引きして書名・版のズレを洗い出す。NDLのタイトル検索の取り違えは
これで見つかる。副題の有無による差分も出るので、出力は「要確認」であって「誤り」ではない。

## 受賞歴(awards)の方針

現状は**ITエンジニア本大賞**(翔泳社主催、2014年〜)のみ。

- **抽出元は3種類のページ**(2026-08-07に全年を機械抽出した): `/campaign/award/about/`(2014〜前年の各年大賞)、`/campaign/award/<年>/result`(各年の大賞・特別賞・プレゼン大会進出作)、`/campaign/award/result/`(最新年。**ここだけはベスト10の全リストも本文テキストで取れる**)。いずれも`<script>`/`<style>`を落としてタグを除去すれば本文が読める
- **過去年の結果ページはベスト10が画像**なので、そこから取れるのはプレゼン大会進出作(上位3冊)と各賞だけ。最新年のページ構成が変わってベスト10が本文に載るようになったため、**年ごとにどこまで取れるかが違う**
- `result`の文字列は「技術書部門大賞」「ビジネス書部門大賞」「特別賞」「技術書部門プレゼン大会進出」「技術書部門ベスト10」など。**同じ年に「プレゼン大会進出」と「ベスト10(プレゼン大会進出)」の両方を入れない**(2026-08-07に重複表現を1本化した)
- 2026-08-07時点で46冊に受賞歴を付与済み(既存23冊への遡り付与+新規20冊)。**大賞・特別賞・ベスト10のうち、ソフトウェア/ITエンジニアの仕事に関わらない一般ビジネス書・自己啓発書(睡眠・習慣・一般的な働き方など)は収録対象外として見送っている**
- 作品自体の受賞・順位が明記されているものだけを採用する(mystery-dbと同じ基準)
- 大川出版賞などは未登録。追加してよい

## テーマタグの方針

**テーマは「本の種類」、技術スタックは「本の主題」**という分担にしている。この直交性を崩さないこと(たとえば「セキュリティ」はテーマではなく技術スタック側の項目)。scaffold時点で12件: 入門書 / リファレンス / 設計・アーキテクチャ / 可読性・リファクタリング / テスト / パフォーマンス / 作って学ぶ / チーム開発・プロセス / 読み物・キャリア / 古典・名著 / 現場の実践ノウハウ / 理論・基礎。

## 技術スタック(techs)の方針

`category` は `language` / `framework` / `infra` / `database` / `tool` / `concept` の6種。作品が参照していないエンティティは作らない方針で始めている(0件のカテゴリは`TechListPage`が自動的に非表示にするので害はない)。

## デザイン方針

- パステルカラー基調、グラデーションはなるべく使わない。**メインアクセントはパステルティール(`--color-teal` / `--color-teal-strong` / `--color-teal-deep`)**。ranobe-dbの水色・manga-dbのオレンジ・game-dbのグリーン・mystery-dbの藤色と区別するための5色目。**`--color-blue`(装飾用の水色)からは意図的に色相と彩度を離してある**
- **`/techs` のカテゴリ見出しは「区切り」として組む**(`.tech-section` / `.tech-section__heading`)。
  当初は`.home-section__heading`を流用していたが、見出しの下マージン10pxだけが前カテゴリのカードとの
  境目になり「どこからが次のカテゴリか一目で分からない」とユーザーから指摘された。カテゴリ間に
  32pxの余白＋1pxの罫線を入れ、見出しをティールにして件数を添えることで解決している。
  また技術名は長い複合カタカナ(「コンピュータアーキテクチャ」)が多く、共通の`.entity-list`の
  200pxトラックだと2行目に1文字だけ溢れるため、このページだけ250pxに広げている
- 対象レベルのチップだけ色分けしている(`.level-chip--beginner/intermediate/advanced`)。**同系色の3段階**にして「入門→上級」が1本の尺度に見えるようにし、別カテゴリに見えないようにしている。`targetVersion`のチップは破線・ミュートでいちばん静かにしてある
- ページ背景は黒一色固定。装飾(影・グラデーション・点線ボーダー等)は基本つけない
- 見出しは`M PLUS Rounded 1c`、本文は`Noto Sans JP`
- favicon/apple-touch-icon/og-image は生成済み(`scripts/generate-icons.mjs`・`scripts/generate-ogp.mjs`、いずれも手動実行)。字は「技」、色は`#71e6d3`。**mystery-dbと同じく角丸をやめて四隅を不透明な黒で塗っている**(角丸だと四隅が透明になり、一部のタブストリップやICO consumerが白く合成するため)

## コマンド

```sh
npm install
npm run dev       # http://localhost:5173/tech-db/
npm run build     # 型チェック + データ整合性チェック + ビルド + プリレンダー
npm run preview
npm run fetch-covers
```

`main`へのpushで`.github/workflows/deploy.yml`が自動ビルド・GitHub Pagesデプロイを行う。

**`npm run build` が「vite preview didn't come up」で落ちたら、プリレンダー用ポート4319を姉妹サイトのpreviewサーバーが握っている**。`PRERENDER_PORT=4381 npm run build` のように別ポートを指定すること(実際に踏んだ)。

## SEO / SSG

mystery-dbの構成をそのまま移植している。

- `src/ui/common/useSeo.ts`: **canonical/og:urlは`window.location.origin`ではなく固定の`SITE_ORIGIN`定数から組み立てる**(prerenderがローカルの`vite preview`から取得するため)
- JSON-LD: 作品詳細=`Book`(`bookEdition`に版を入れている)、著者・翻訳者=`Person`、出版社=`Organization`、加えて`BreadcrumbList`。トップは`WebSite`+`SearchAction`
- `scripts/prerender.mjs`(npm `postbuild`): Playwrightで全ルートをクロールし`dist/<route>/index.html`を書き出し、最後に`dist/index.html`を`dist/404.html`にコピー
- `public/sitemap.xml`は`generate-manifest.mjs`の末尾で生成(`.gitignore`対象)
- **静的ルートを追加したら4箇所に追記が必要**: `src/App.tsx` / `src/ui/common/TopNav.tsx` / `scripts/prerender.mjs`の`routes` / `scripts/generate-manifest.mjs`の`sitemapEntries`
- Google Analytics: `index.html`にGA4のgtagスニペットを直書きしている(測定ID `G-FKN7MFW3HQ`)。**姉妹サイトはそれぞれ固有のプロパティを持つ**(ranobe-db `G-2NR0M8VN1N` / manga-db `G-01FCSJVHQX` / mystery-db `G-JM8SW0R904` / game-db `G-V6407CNZ8Y`)ので、サイト間でIDを流用しないこと


## 姉妹サイト間の相互リンク

**このサイトは`relatedNovelUrl`/`relatedComicUrl`のような相互リンクを持たない**。manga-dbの`scripts/link-sister-works.mjs`は小説↔コミックの突合スクリプトで、技術書とは突合対象がないため。**同スクリプトは触らないこと**。

## データ規模

913冊(2026-08-07 時点)。著者1012・技術スタック106・翻訳者280・出版社72・テーマ13・アワード1。
2026-08-07にITエンジニア本大賞の受賞作20冊を追加し、既存23冊にも受賞歴を遡って付与した
(受賞歴付き46冊・のべ66件)。表紙は追加分19/20がISBN直引きで解決している。未解決は絶版で楽天・Koboに在庫がない古い本が中心。

初回は27冊で公開し、同日に `scripts/probe.py` の一括下調べを使って287冊、さらに40〜50冊ずつの
バッチを14回回して502冊を追加した。

### scripts/find_people.py — 責任表示の人名を既存エンティティと突き合わせる(2026-08-06 新設)

`python3 scripts/find_people.py <probe.json>` で、OK候補の責任表示に出てくる人名が
authors.json / translators.json に既にあるかを一覧する(`--names 名前 …` で個別照会も可)。
著者995人・訳者280人の一覧をコンテキストに載せずに既存IDを引けるので、バッチ作業では
probe.py の直後にこれを実行してから annot.json を書くとトークンを大幅に節約できる。

### 大量追加でのバッチ作業メモ(2026-08-06)

- **候補は1バッチ55〜65件**。NDLのヒット率は7〜8割、そこから既登録・別書・学位論文を落として
  30〜45冊が残る。全件のフルビルドは8分かかるので、バッチごとは `node scripts/generate-manifest.mjs`
  だけで検証し、フルビルド(プリレンダー)は最後に1回でよい
- **probe.py の DUP 判定は万能ではない**。「30日でできる!OS自作入門」が既存の「OS自作入門」を、
  「大規模言語モデル入門」が既存の「Kaggleではじめる大規模言語モデル入門」をすり抜けた。
  OK行の書名は必ず目視すること
- **タイトル検索の取り違えが多い**。「デッドライン」で西尾維新の小説、「組織パターン」で病理診断の本、
  「ユーザビリティエンジニアリング」で医療機器規格の本がヒットした。責任表示と出版社を見て弾く
- **出版社名の表記ゆれは `p` で明示する**。「秀和システム新社」「毎日コミュニケーションズ」「マイナビ」
  (→ mynavi)、「ソフトバンククリエイティブ」(→ sb-creative)、「日経BP日本経済新聞出版本部」
  (→ nikkei-bp)、「丸善」(→ maruzen) は自動解決できない
- 学位論文・研究報告・医学書がタイトル検索に混じる。`publisher` が個人名や大学名のものは採用しない

## 公開まわりの設定状況(2026-08-06 時点ですべて完了)

- **GitHub Pages**: 有効化済み。`gh api -X POST repos/izenmi/tech-db/pages -f build_type=workflow` で
  Source を GitHub Actions に設定した(Settings画面での手動操作は不要だった。次に姉妹サイトを作るときも
  この方法が使える)
- **Google Analytics**: 設定済み(測定ID `G-FKN7MFW3HQ`、上記「SEO / SSG」の節を参照)
- **Google Search Console**: sitemap 登録済み(ユーザーが実施)

## 既知の未着手事項

- **受賞歴がITエンジニア本大賞のみ**。大川出版賞などは未登録。ITエンジニア本大賞については
  2026-08-07に全年(2014〜2026)を抽出して遡り付与を済ませた
- **データ拡充の継続**。姉妹サイトは数百件規模で並んだが、まだ手薄な領域がある:
  Perl/Elm/Zig などの言語、Azure・GCPの各サービス、ネットワーク機器(Cisco)、FPGA・論理設計、
  会計/業務システム、DX・IT戦略系。「データ拡充時の作業フロー」の節に沿って増やす
- **あらすじが規定の150〜250字より短い**。`WorkSource.synopsis` のコメントは150〜250字としているが、
  実際は初回27冊が平均147字(最短131)、2026-08-06に追加した305冊が平均116字(最短89)。
  意味の通る要約にはなっているが、規定に合わせるなら書き足す作業が残っている
- **一部の `firstPublishedYear` は NDL の同名異書に引きずられている可能性がある**。probe.py の
  `first_year` は同じ書名の全版から最古の年を取るため、似た書名の別の本が混じると古すぎる年になる。
  気づいた範囲では `fy` を明示して直したが、全件は検証していない

## 候補の集め方: scripts/suggest_candidates.py(2026-08-08 新設)

**候補タイトルを自分で思いつくのはやめる。** 楽天ブックスのカタログに列挙させて、
works.json と突合済みの「実在していて未登録」の一覧を得る。

```sh
RAKUTEN_APP_ID=xxx RAKUTEN_ACCESS_KEY=yyy \
  python3 scripts/suggest_candidates.py out.json [--pages 5] [--sort sales] [--keyword <語>]
```

**なぜこれが要るか**: 2026-08-08にtech-dbで「ネットワーク系100冊」を思いつきの書名で
リストアップしたところ、93件中59件がNDLに存在せず、残った35件にも誤マッチが多発した
(『ルーティングの教科書』→『オウンドメディアリク**ルーティングの教科書**』、
『データセンターネットワーク』→学位論文、『分散システムの設計』→学位論文)。
カタログ側に列挙させれば、出てくるものは全て実在し、重複も事前に除ける。
game-db の `scripts/suggest-candidates.mjs`(IGDB版)と同じ発想。

**`booksGenreId` による絞り込みは当てにならない**(実測)。「パソコン・システム開発」を
指定しても『るるぶ東海オンエア』『うんこドリル』『共通テスト情報1』が混ざる。
ジャンルは足がかりにとどめ、**最終的な選別は必ずタイトルを目視して行うこと**。
`--keyword` でタイトル語を足すほうが精度が高い。

**新刊に偏る**点にも注意。`--sort sales` は売れ筋順だが結果は新しい巻に寄るので、
既刊シリーズの途中巻(『ONE PIECE 115』『キングダム 80』)が大量に出る。
このサイトはシリーズ単位で登録するため、**巻数付きタイトルはシリーズ名に丸めてから
重複判定し直す**必要がある。

## 読者レベル(入門/中級/上級)は廃止した(2026-08-08)

`BookLevel` と `work.level` を型・データ・UI・取り込みスクリプトから削除した。

**理由**: 判定が当てにならなかった。同じ「入門」でもプログラミング未経験者向けと
実務経験者向けが混在し、逆に「上級」も分野が違えば比較できない。1冊ずつ中身を読まずに
書誌情報から機械的に付けていたので、フィルターとして信用できる粒度になっていなかった。

代わりの browse 軸はテーマ(`intro` / `practice` / `theory` など)で足りている。
**再導入しないこと**。付け直すなら中身を読んだうえで基準を決める必要がある。
