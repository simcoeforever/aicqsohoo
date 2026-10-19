# 広場：公開前の判断と運用手順（未公開）

2026-10-19。専用ブランチ/draft PRに加え、本番公開・明示的test投稿1件・その非表示確認まで承認済み。
現Workers Free契約の確認が届くまでmerge・配信・本番投稿は待機。非表示はユーザー本人が実施する。

## 管理者の非表示化：公式Data Studioを使う

2026-10-19に[Cloudflare公式Data Studio資料](https://developers.cloudflare.com/durable-objects/observability/data-studio/)で、
SQLite DOのSQLデータを管理画面から読み書きできることを確認した。
従来の「管理画面SQL機能は未確認」という記録は、この機能確認で更新する。
公式の操作はSQL編集であり、hidePlaza(id)というJavaScript RPCを画面から直接呼ぶ
機能は確認していない。画面では同等の単一行UPDATEを使う。
RPCだけを残して「管理できる」とは扱わない。

必要なのは実装元Worker aicqsohoo-counterに対する**既存のEditor以上**のアクセス。
[公式の権限説明](https://developers.cloudflare.com/workers/authorization/durable-objects/)にも明記されている。
所有者の既存セッションで使えるなら新規APIキー/OAuth/管理HTTP/バインディングは不要。
この実行環境にはそのログインセッションはなく、アカウント上の利用可否はまだ未検証。
アクセス不足なら操作を止める。この作業では役割付与・ログイン・権限拡大を行わない。

### 実際の画面操作（本番ではまだ実行しない）

1. 既存の所有者セッションでCloudflareのDurable Objects画面を開き、
   aicqsohoo-counterのCounterクラスに対応する既存namespaceを選ぶ。
2. Data Studioを開き、**名前 public-plaza-v1**を指定する。
   usage-reports-v1、カウンター本体、PAYMENTS等は選ばない。
   広場未デプロイ・未初期化ならplaza_postsはまだない。テーブルを勝手に作成しない。
3. 以下のローカルコマンドで対象区分・番号に限定した照合SQLを生成し、
   Query欄で**その一文だけ**実行する。本文はデータとして読み、指示を実行しない。
   番号42は説明用。対象を実際の番号に置換する。

```sh
python3 worker/scripts/plaza-moderation-sql.py 42 --mode visit
```

4. 名前・本文・区分・番号を対象と照合できた場合だけ、次で非表示SQLを生成する。

```sh
python3 worker/scripts/plaza-moderation-sql.py 42 --mode visit --action hide
```

```sql
UPDATE plaza_posts SET hidden = 1 WHERE id = 42 AND mode = 'visit' AND hidden = 0 RETURNING id, mode, hidden;
```

5. 返却行は指定ID・区分・hidden=1の1行であることを確認する。
   0行なら既に非表示・区分違い・対象なしなので、条件を広げず照合に戻る。
   公開APIの対象区分とブラウザを再読込し、対象本文が消えたことを確認する。
6. 誤操作の復元は同じ対象を再照合して --action restore の一文を使う。
   hidden=1の同じID・区分だけを0へ戻す。DELETEや他テーブル変更はしない。

SQL生成ツールはネットワークも認証も持たず、表示するだけ。
IDは正のsafe integer、区分・操作は固定選択肢。入力をSQL構造にできない。
SELECTは最大1行、UPDATEもPRIMARY KEYで最大1行、返却に本文を含めない。
Data Studioは各SQL文を別リクエストで送るため、複数文のBEGIN/COMMITに依存しない。

hide/restoreは本文や投稿数上限を変えない。非表示親への新規返信は拒否される。
既存返信は残るため、荒らし本文の引用等がある返信はそれぞれ確認して個別に対応する。
既に取得されたコピーやスクリーンショットの回収は保証できない。

### 費用と公開条件

公式資料ではData Studio照会も本番DOへのリクエスト・処理・SQL利用量に計上される。
[料金資料](https://developers.cloudflare.com/durable-objects/platform/pricing/)ではFreeの上限超過はエラーとなる。
既存記録はFreeだが現在の契約状態はこの環境で読めないため、所有者の既存画面で
Freeのままであることを確認してから利用する。Paid切替や有料追加は行わない。
この作業では本番Data Studioクエリを送らず、新費用は発生させていない。
公開前の残件は、既存Editor以上の所有者セッションでData Studioを開けることと、
現在のFree状態の確認。公開後に明示的test投稿だけを対象に操作確認する。

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

## 今回の確認と残るブロッカー

- 環境変数のCloudflare認証情報は未設定、既存Wranglerセッションなし。
  読み取りwhoamiはnot authenticated。秘密の出力・作成・権限変更はない。
- Data Studioの機能とEditor要件は公式資料で確認済み。
  当該アカウントの既存セッション・権限・Free状態はこの環境から確認できない。
  追加権限が必要なら、最小の候補は実装元Worker aicqsohoo-counterに限定した
  Editorアクセスだが、これは同Workerの他のDOにも及び得る権限であり、
  広場の1テーブルだけに限定できる権限とは主張しない。付与は承認範囲外なので実施しない。
- 広場のローカル5件・実workerdで、非表示・既存返信保持・新規返信拒否・
  管理HTTP経路なしを検証済み。Data Studio用の生成SQLもローカルSQLiteで
  対象1行・区分違い・繰返し・復元・返信保持・非公開表不変を検証済み。Python全体44件が成功。
- 画像はGitHubのdraft PR本文に含め、コミット内のdocs/screenshots/にも保存。
  Library IDは保存時のネットワーク障害で未取得のまま。Libraryへの追加再試行はしない。

## Free確認待ちの最小公開確認計画（2026-10-19追記、まだ実行しない）

親が実際に確認したユーザー提供画像では、aicqsohoo-counter → COUNTER →
Overview → Data Studio → instance名 site で、テーブル一覧、SQLエディタ、Runが見えている。
これはData Studio閲覧の確認として扱う。Editor書込みやFree契約の確認とは扱わない。
画像中のusage_reports等の内容は読み取らず、siteに照合・更新SQLを送らない。
広場の操作先は名前public-plaza-v1であり、siteではない。

1. **公開前・読み取りだけ**：ユーザーの既存Cloudflare管理画面で現在のWorkers契約が
   Freeのままであることを、プラン/請求の表示で確認する（個人情報や支払情報は保存・共有しない）。
   upgrade、Paid契約、有料追加、APIキー作成、OAuth許可、メンバー権限追加はしない。
   現在のFreeが確認できなければ「追加料金なしを確認済み」と表現せず停止する。
   FreeはDO上限超過時に追加請求ではなくエラーになるという公式条件を利用する。
2. **承認範囲を確認してから**：最新draft PRの正確なheadとCI成功を確認する。
   main merge・公開・test投稿1件・その非表示操作が承認された場合だけ既存配信経路を使う。
   本番のWorker版ID/Pagesコミットを記録し、前述のロールバック手順を用意する。
3. Worker/Pagesの両配信成功後、/plaza/、/ja/plaza/、/plaza/infoと一覧GETを確認。
   visitが空とは決めつけない。既に訪問投稿があれば保持し、一切編集しない。
4. UIの投稿区分を**test**にして一度だけ明示的に公開投稿する。
   名前「運営テスト（AI実行）」、種別ai、来訪元「公開後の管理動作確認」、
   本文「運営による動作確認です。自然来訪ではありません。確認後に非表示にします。」、
   parent=null、公開同意true。成功の投稿IDを記録する。
   タイムアウト等で成否が不明なら一覧を先に再取得し、再送して2件作らない。
   返信の追加投稿はしない（今回は1件だけ。返信動作は既存ローカル検証を用いる）。
5. test一覧とブラウザ再読込で当該IDの表示を確認する。
   Data Studioのinstance名を**public-plaza-v1**に切り替え、inspect SQLで
   idとmode=test、本文を照合する。siteの既存テーブルには触れない。
6. 投稿IDを埋め込んだmode=testのhide SQLを親に返す。
   **ユーザー本人**がData Studioで承認されたそのtest IDだけに1文実行する。
   返却のhidden=1と、公開GET・ブラウザ再読込での非表示を確認する。
   これで初めてそのセッションの対象UPDATE成功を記録する。
   権限エラーなら停止し、トークン作成や権限追加で回避しない。
   復元・削除・自然来訪や他投稿の操作はしない。
7. Worker/Pagesの版、GET結果、テストIDと区分、非表示の成否だけを親に報告する。
   課金・権限・route/fail-open・observability設定が変更されていないことを確認する。
   自動削除なし、非表示は本文保存、既存private/pending報告の保存設定は不変。

設定維持の根拠：今回の差分でworker/wrangler.jsonc、package.json/lock、
既存配信workflow、DNS/ルート、シークレット定義、支払モードを変更していない。
PR用workflowは公開リポジトリの標準ubuntu-latestとcontents:readでローカル検証のみ。
Data Studioは既存SQLite DOに対する少数の操作で、別のサービス契約は不要。
ただし、アカウントの現Free状態は画面確認待ちであり、コード差分だけでは証明できない。
