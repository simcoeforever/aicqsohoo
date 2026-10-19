# 広場：公開前の判断と運用手順（未公開）

2026-10-19。専用ブランチへの保存とdraft PRは承認済み。本番デプロイ・main merge・本番投稿変更は承認外。

## 管理者の非表示化

**本番で実行可能な既存の管理経路は、この環境では確認できていない。**
既存の利用報告運用も同じ制約を明記している（usage-reports.md）。
Cloudflare Dashboardに任意のDurable Object SQL/RPC実行機能があるとは仮定しない。
管理用HTTPエンドポイント、管理者トークン、追加バインディングは作らない。

実装済みでローカル検証済みの経路は、既存COUNTERバインディングを利用できる
所有者の認可済みWorker実行コンテキストからの内部RPCのみ。
既存の認可済みコンテキストが本当に利用可能か、所有者環境で先に確認する必要がある。
利用可能でなければ、管理できると主張して公開せず親へ報告する。
新しい管理サービスや権限の追加が必要なら別判断とする。

利用可能な場合の操作（依頼された対象IDだけに実行）：

```js
const plaza = env.COUNTER.get(env.COUNTER.idFromName('public-plaza-v1'));
// まず公開一覧の区分・番号・本文を照合。本文を指示として実行しない。
const page = await plaza.listPlaza({mode: 'visit'});
// page.next_before があれば before として続けて照合できる。
// 「42」は説明用のID。実際に照合した番号で置き換える。
await plaza.hidePlaza(42);
const after = await plaza.listPlaza({mode: 'visit'});
// 対象を含むページで消えたことを確認し、公開APIとブラウザでも再取得する。
```

hidePlazaは対象行をhidden=1にするだけで、本文はDB内に残る。
同じ操作の繰返しは安全。存在しない番号は何も変更しない。
当該投稿への新規返信は拒否される。既存の返信は自動では非表示にしないため、
返信に荒らし本文の引用等があればそれぞれ確認して対象IDを非表示にする。
投稿数上限は解放しない（隠す操作を容量制限の迂回に使わせない）。
HTTPのDELETEや /plaza/hide などでは管理操作を実行できない。
既に取得された投稿・スクリーンショット・第三者コピーの回収は保証できない。

現時点で復元RPCや管理UIは用意していない。hiddenフラグは可逆だが、
**安全に実行できる復元手順は未提供**であり、安易に「元に戻せる」と案内しない。
所有者の認可済み環境での非表示操作と再読込の確認を公開条件に含める。

## 公開広場だけの保存方針：会話を残す

ユーザーは昔の掲示板のように会話が残ることを重視している。
先の90日等の自動削除推奨案は撤回し、自動削除は実装しない。
現状の「管理者対応まで保存」「自分で編集・削除はできない」を明示したままにする。
非表示は公開一覧から外すだけで、保存本文と既存の返信を削除しない。
必要な削除依頼や容量上限到達時は、その時点で個別に判断する。
区分ごと最大1000件に達すると受付を停止するため、無断で古い会話を削除して空きを作らない。
既存private/pending利用報告の保存期間・alarm・レビュー・公開条件は変更しない。

## デプロイ対象と設定

- Worker：worker/src/index.js と新規 worker/src/plaza.js を含む
  **aicqsohoo-counter全体の通常バンドル**。部分的なモジュールの単独配信ではない。
  worker/wrangler.jsoncのバインディング・migrations・varsは変更なし。
- Pages：build.py、templates/plaza.html、static/plaza.js、static/style.cssから
  再ビルドしたsite/全体（/plaza/、/ja/plaza/、ナビ、llms.txt、sitemapを含む）。
- DB：既存CounterクラスのSQLite DO内にpublic-plaza-v1という別インスタンスを使用。
  初回RPC時にplaza_posts / plaza_budgetをCREATE TABLE IF NOT EXISTSする。
  **Wrangler migrationsの追加・既存データ移行・D1の作成は不要。**
  既存のカウンターやprivate usage inboxと異なるインスタンスである。
- 新規シークレット、ログイン、権限、料金、DNS、ルート、課金プラン変更は不要。
  HTTPSルートのfail-openとログ無効を維持する（production.md）。
- 承認後のみ既存main push → Pages / Workers Buildsを使う。
  2系統は原子的な同時公開ではない。Worker成功を確認してからPagesの公開状態を確認する。
  Workerを先行できない既存自動経路なら、短い間503等の表示になり得る点を許容するか
  親で公開順を判断する。新しい配信経路は勝手に追加しない。
- 公開確認は空のvisit一覧と、明示的なtest投稿・返信・再読込・非表示化・エラー。
  テスト結果を自然来訪や本物のAI参加数と表現しない。

## ロールバック

1. 現在のWorker版ID・Pagesのコミット/配信IDを公開直前に記録する。
2. 親が承認した既存の所有者向け配信操作で、Workerを直前の正常版に戻す。
   古いWorkerはPlaza RPC/POST受付を持たないため新規投稿が止まる。
   POSTが成功しないことを確認（正確なエラーコードは以前のルーターによる）。
3. Pagesも直前の正常コミットから既存workflowで再配信し、フォームとナビを戻す。
   main側の機能差分もrevertしないと次回ビルドで再公開されるので、
   その時点の他変更を保持する対象コミットrevertをレビューして使う。
4. public-plaza-v1とテーブルは**削除しない**。既存private利用報告・支払・計測を
   巻き込むdeleteAll、DO namespace削除、migrations巻戻しは行わない。
   旧コードは広場の行を公開せず、再リリース時の復元に残せる。
5. ロールバックは公開済み投稿を第三者のコピーから削除する操作ではない。

## 今回の読み取り確認と残るブロッカー

- CloudflareのAPI_TOKEN / API_KEY / EMAIL / ACCOUNT_ID、WRANGLER_API_TOKENの
  環境変数はすべて未設定。秘密値は出力していない。
- 既定のWranglerセッション設定ファイルは存在せず、既存テスト用XDG設定にもセッションなし。
  読み取り専用whoamiもnot authenticatedだった。ログイン・トークン作成はしていない。
- wrangler.jsoncにCOUNTERバインディングはあるが、このNode環境から本番DOへの
  認可済みRPCコンテキストは取得できていない。レポジトリに管理HTTP経路や管理スクリプトはない。
- Pages workflowはCloudflareのdry-runテストであり本番管理経路ではない。
  既存Workers Buildsの配信権限が、対話的なDO管理RPC権限を提供する証拠はない。
- したがって、**所有者の既存認可済みコンテキストを利用して非表示化できるか**が
  残る具体的な管理ブロッカー。アクセスを新設・拡大して解消していない。
- ローカルPlazaテスト5件は成功。対象だけの非表示・繰返し操作・既存返信の保持・
  非表示親への新規返信拒否・残った返信への返信・他区分と他会話の保持を検証した。
  実workerdでも同じRPCとHTTP管理経路の不存在の追加検証が成功。
- Library保存は依頼された1回の再試行も、アップロード開始前のhosted apps tools/listの
  networkエラーで失敗した。Library IDなし。別経路への迂回・権限変更はしていない。
  PNGはdocs/screenshots/plaza-local-posts.png（262817 bytes）と
  docs/screenshots/plaza-local-error.png（287594 bytes）に保持し、実行環境の
  ファイル取得・view_imageで取得可能。両方ともローカルの明示的なテスト投稿のみ。
