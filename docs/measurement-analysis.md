# 保存済み集計で分かる範囲（2026-10-13）

これはコードと生成manifestの確認です。本番の保存件数を読んだ分析ではありません。
公開サイトとworkers.devはこの環境のCONNECTプロキシが403で遮断します。
今回追加する実数APIも全体件数だけで、下記の内訳を新たに公開する機能はありません。

## 既存の分類

Edgeは公開サイトの有効なRouteを通ったGETで、origin応答が成功（2xxまたは304）し、
集計保存も成功したものを数えます。HEAD・失敗応答・許可外の対象は数えません。
参照：`worker/src/gateway.js`、`worker/src/public-resource-manifest.js`、
`machine_catalog.py` が作る `measurement-manifest.json`。

| 対象 | 集計に保存される分類 |
| --- | --- |
| ホーム・説明・投稿・一覧・支援・既存の経験／プロフィールHTML | PUBLIC_PAGESの公開パス。日英は同じ分類 |
| 実験記事／週報HTML | 全て `/experiment/` に集約。個別記事名は保存しない |
| experiences.json / agents.json / submission-schema.json / llms.txt | 各固定パス |
| index.json / machine-schema.json | 各固定パス。manifest取得が必要 |
| 個別の記事JSON | `/records/experience/`、`/records/agent/`、`/records/weekly_report/`、`/records/experiment_article/`、`/records/payment_policy/` の5種類。記事ID・言語は保存しない。manifestにある完全一致URLのみ |
| 日英payment-policy HTML | `/payment-policy/` に集約。ブラウザイベントは注入しない |
| CSS・JS・画像、robots.txt、sitemap.xml、measurement-manifest.json、products.json、verification-kit-sample.json | 現在は対象外 |
| contribution／決済エンドポイント、receipt等 | 別のルートで処理し、アクセス集計のresource_getには含めない |

新しいJSON対象はmanifest整合の変更が本番に反映された後の観測だけです。
以前に数えなかった取得を、後から補完できません。
manifestが未取得・無効・上限超過なら、新対象の取得は数えられません。

## 保存粒度とできる分析

SQLの `metrics` は `day,page,event,source,test,n` の日次合計です。
UTCの日単位、pageは上の公開パスまたは固定分類、eventは
page_view／submission_intent／resource_get、sourceはドメインだけまたは
unknown／internal／other、testは明示的なテスト区別、nは丸め前の整数です。
90日保持で、新しい参照元の種類が1日100に達するとotherへまとめます。
個々のアクセス時刻、訪問者、セッション、全文URLやクエリ、IP、User-Agentはありません。

既存の権限で集計を読めれば、日別推移、HTML・固定JSON・llms.txt・JSONの5種類の
取得傾向、テストを除いた系列比較を分析できます。
JSONの特定記事・言語や、何人が繰り返したか、bot／AIの比率は復元できません。
従来の経験／プロフィールHTMLは公開パス単位ですが、実験HTMLは記事別には分けられません。
これらの保存上の分類は、公開内訳や本番で観測できた分類別件数を意味しません。
参照元・個別ページ・日時の細かな組合せは今回公開しません。

## ブラウザイベントとGETの差

ブラウザイベントは、計測scriptが注入され、JavaScriptとfetchが動き、公開本番ドメインで、
言語リダイレクト待ちでなく、集計POSTが受け付けられ保存されたときに増えます。
JS無効、script／通信の遮断、通信失敗、無効なイベント・Origin、Worker設定OFF、
計測scriptがないページでは欠けます。404・送金自己テスト・payment-policyには注入しません。
ローカル／別ドメインでは送らず、JSON取得では実行しません。
言語切替の最初のHTMLをGETで数えても、そのページのブラウザイベントを送らず、
遷移先だけから送る場合があります。

GETはHTMLだけでなく対象JSONやllms.txtも含み、巡回・取得の繰り返し・先読み等でも増え得ます。
逆に、Routeを迂回するgithub.io閲覧、計測失敗、許可外リソースは欠けます。
ブラウザのcache等で新しいEdge GETがないこともあり、二つの系列は同じ母集団ではありません。
ブラウザイベント自体も、JSを実行する自動処理から送れます。
したがってGETが大きくても「人間がいない」「AIが読んだ」とは言えません。
比率をbot／AIの割合に読み替えません。

`?measurement=test` は明示テストを別集計にし、今回の実数APIは `test=0` だけを足します。
印を付けていない運用者確認は、個人識別なしでは一般イベントと区別できません。
旧ホームカウンターは別のPOST回数で、これらの系列にも人数にも足しません。

## 公開済みAPIで取得できる粒度

- 形式2（従来）：https://aicqsohoo-counter.waste-tkt.workers.dev/summary?start=2026-10-05&schema=2
  — 閾値10・10件幅の週全体のブラウザ表示、投稿クリック、GET合計。
  frequent_pages／参照元はブラウザのpage_viewだけで、件数なし。GET分類ではありません。
- 形式3（実数）：https://aicqsohoo-counter.waste-tkt.workers.dev/summary?start=2026-10-05&schema=3
  — 週全体の実数のみ。参照元・ページ・日別・GET分類の項目はありません。

ユーザー提供画面を親の会話で確認した内容では、形式3の合計は27表示・1798 GET・0クリックでした。
確認経路と応答項目は `data/measurement-confirmations/2026-10-05.json` に記録しています。
これは分類別件数の取得ではありません。この環境では形式2の直接読取もプロキシ403でした。

GET分類別の分析に不足しているのは、明示テストを除いた既存resource_get集計の、
固定分類ごとの合計（時系列ならUTC日ごとの合計）です。既存の公開情報には含まれず、
新APIや追跡を追加しない今回の範囲では取得・公開しません。
公開manifestは分類と対象URLを示しますが、それぞれの取得件数は含みません。

## 承認を受けて追加した粗い分類（2026-10-13）

ユーザーの「続けよう」を受け、既存の記録だけを使う形式4を追加しました。
https://aicqsohoo-counter.waste-tkt.workers.dev/summary?start=2026-10-05&schema=4

公開するのは週全体のhtml／article_json／catalog_json／llms_txt／other_unknownの5合計です。
上の保存粒度より粗くし、レコード5種類の細かな件数も一つのarticle_jsonにまとめます。
参照元・個別記事・日別・時刻との組合せは出しません。
1798という確定済み全体値との一致を確認し、不一致や保持データ不足なら分類値はnullです。
分類できない古いラベルはother_unknownに残して合計から落としません。
ゼロは記録のゼロで、計測開始前・失敗・迂回を含む実際の取得ゼロの証明ではありません。
形式2/3と既存の計測は維持します。実際の分類別件数はまだ取得しておらず、結果は捏造しません。
日英の説明は `data/reports/2026-10-13-get-categories.json` に記録しています。
