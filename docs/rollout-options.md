# 本番反映の選択肢と承認範囲（設計時の記録）

実行後の状態・運用手順は [production.md](production.md) を参照してください。

2026-10-04時点。設定・公開・新規シークレットは変更していません。
基点は890369e40a0bb85cf08cef66b8f60111d4d5519aです。

## 一度で確認する選択肢

| 選択 | 観測 | 追加シークレット | 承認する変更 |
|---|---|---|---|
| A: Edge＋公開集計API（推奨候補） | JSなしを含む成功した対象GET＋別系列のブラウザイベント | 不要 | 既存DNSのproxy化、Worker Route、既存Worker/Pages更新、公開基準適用済みAPI、週次Actionsの書き込み・公開 |
| B: Edge＋非公開集計API | Aと同じ | REPORT_TOKEN 1個を2箇所へ保存 | Aの配信変更＋集計API読み取り鍵の発行/保存。APIは非公開 |
| C: ブラウザのみ | JSを動かさないHTML/JSON/llms.txt取得は観測不能 | 公開APIなら不要 | DNS/Route変更なし。Worker/Pages更新と週次公開のみ |

AI向け実験の観測目的にはA/Bが合います。Aは記事に公開するものと同じ
抑制済みデータだけをAPI公開し、鍵を増やしません。BはAPIの公開範囲と
無認証リクエストを抑えたい場合です。公開APIの濫用による無料枠消費は
Aの追加リスクです。A/BともAI判定やユニーク人数計測はしません。
現時点の実プラン・DNS値・権限は未確認なので、これらの読み取り確認後に
「費用を増やさず既存無料枠で行える」範囲を確定します。Paidへの変更、
有料分析、追加管理API鍵は承認に含めず、必要なら別途報告します。

## 最小の配信案

GitHub Pagesの配信元・カスタムドメイン設定を維持し、既存Workerを
観測用Routeとして前段に置きます。RouteはCloudflareのactive zoneと
proxy済みDNSを必要とし、受信RequestをfetchするとDNSで指定された
既存originへ転送できます。[公式Route説明](https://developers.cloudflare.com/workers/configuration/routing/routes/)

具体的な承認対象は、aicqsohoo.comと実際に利用されるwwwについて、
**現在のA/AAAA/CNAMEの値は保持しproxyだけON**（既にONなら不要）、
既存Worker aicqsohoo-counterへ `https://aicqsohoo.com/*` と
`https://www.aicqsohoo.com/*` のRouteを追加することです。wwwが独立した
配信DNSを持たない場合は追加せず、現状を確認して扱います。新しいDNS
レコード、wildcard DNS、origin移転、Worker Custom Domainは不要です。
Routeはwrangler.jsoncへ入れていないので、ローカル変更をdeployするだけ
では配信経路を切り替えません。[Proxyの意味](https://developers.cloudflare.com/dns/proxy-status/)

gateway.jsは元のRequest/Responseを転送し、成功したGET（2xx/304）の
公開ページ・experiences.json・agents.json・submission-schema.json・llms.txt
だけを別イベントresource_getで集計します。HEAD/エラー/画像/CSS等を
計測対象にしませんが、上記全域RouteではこれらもWorkerの呼び出し枠を
消費します。必要なら対象パスごとのRouteへ絞る設計を別途確認します。
ブラウザpage_viewとresource_getは重なるため足しません。User-Agentは
参照も保存もせず、機械取得を「真のAI訪問」とは呼びません。

DNS切替前にGitHub Pagesのカスタムドメイン所有確認、現在のorigin証明書、
Cloudflareのedge証明書とFull (strict)適合を確認します。証明書/リダイレクト
検証に失敗したら切替を止め、SSLを弱めて回避しません。ゾーン全体の
SSL設定変更は他サイトへ影響し得るので勝手に行いません。
[Full (strict)の条件](https://developers.cloudflare.com/ssl/origin-configuration/ssl-modes/full-strict/)、
[GitHubのドメイン/HTTPS確認](https://docs.github.com/en/pages/configuring-a-custom-domain-for-your-github-pages-site/troubleshooting-custom-domains-and-github-pages)

## 障害時の配信継続と復旧

Routeの無料リクエスト枠超過時は**fail open**を選びます。Workerを迂回して
既存originを配信し、計測は欠落します。fail closedは配信に1027エラーを
返すので、この観測用Routeには使いません。
[無料枠超過時の公式動作](https://developers.cloudflare.com/workers/platform/limits/#daily-requests)

コードはpassThroughOnExceptionを設定し、計測RPCはwaitUntil内で失敗を
吸収して有効なorigin Responseを保ちます。これでDNS/TLS/originの障害が
直るわけではなく、Cloudflare自体の障害も保証対象ではありません。
HTTP GETも失敗したもの・迂回されたもの・github.io直取得は観測外です。

復旧順序は、週次Actions停止→Routeを削除/無効化してorigin直配信→必要なら
記録しておいたproxy状態へ戻す、です。DNS値/Pages設定/カウンター整数は
変更しないので移転の巻き戻しは不要です。proxyのOFFにはDNSキャッシュの
遅延があり、即時全利用者への復旧は保証しません。先にRouteを外すとproxyを
維持したままWorkerだけを迂回できます。実施前に既存DNS状態とRoute一覧を
保存し、他のRouteやSSL設定は削除しません。

## 無料枠と費用

公式情報を2026-10-04に確認しました。Workers Freeはアカウント共有で
100,000 requests/UTC日、10ms CPU/invocation。全域Routeは画像等も含めて
呼び出しを使います。キャッシュでorigin負荷を減らしても、このWorker実行が
無料/無制限になるわけではありません。Paidは月額最低$5と従量料金があり、
現在Paidなら既存利用と合算されて増分課金があり得ます。
[Workers料金](https://developers.cloudflare.com/workers/platform/pricing/)

SQLite Durable ObjectsのFreeは100,000 requests/日、13,000 GB-s/日、
5百万row reads/日、100,000 row writes/日、5GB（account total）。イベントに
加えてalarm/API/SQL索引更新も消費し、SELECTの走査量は1イベント1readでは
ありません。DO Paidはrequests/実行時間/SQL超過等が別途課金されます。
小規模でも「必ず0円」とは断定しません。Freeでは該当枠超過が失敗になり、
Paid化を自動実施しません。[DO料金](https://developers.cloudflare.com/durable-objects/platform/pricing/)

全域Route＋既存DO＋週1Actionsを既存Freeの範囲で運用する案です。無料枠は
他Workerと共有で、API濫用・クローラー急増・SQLの走査量に注意します。
閉じた週の公開用集計は1回作成後に封印して再利用し、繰り返しAPIで生集計を
走査しません。それでもHTTP/DO呼び出し枠は消費します。Paidの場合は現契約と
許容上限を確認してから反映します。CPU上限は暴走抑制で、請求額の上限では
ありません。GitHub Actions/Pagesの実権限・プラン・branch保護も事前確認します。

## REPORT_TOKENの意味と最小権限

これはCloudflare API tokenではありません。アプリ内GET /summaryを読むため
だけの共有Bearer鍵で、直近84日以内の閉じた週の**公開基準適用済み集計**が
対象です。生SQL/生ログ/任意日付/利用者情報/書き込み/デプロイ/DNS操作の権限は
持ちません。鍵を持っていてもPOST /eventの内容やカウンターを管理できません。

Bなら承認後に32 random bytes以上で1個発行し、Cloudflare Worker Secret
REPORT_TOKENとGitHubのgithub-pages **Environment Secret** REPORT_TOKENへ
保存します。ソース、HTML/JS、リポジトリ変数、コマンド引数/ログ、ローカル
.dev.vars、記事へは入れません。Actionsでは生成ステップの環境だけへ渡し、
HTTPSのAuthorizationヘッダーだけに載せます。redirectを拒否し、APIエラー本文
や例外URLを出力しません。侵害時は両保存先でローテーション/失効します。
[Worker Secret](https://developers.cloudflare.com/workers/configuration/secrets/)、
[GitHub Environment Secret](https://docs.github.com/en/actions/how-tos/write-workflows/choose-what-workflows-do/use-secrets)

AならWorker PUBLIC_SUMMARY=true、GitHub SUMMARY_AUTH=publicとし、
REPORT_TOKENを発行・保存しません。公開APIからは初回イベント日を取り除き、
coverageはnot_verifiedにします。生集計は公開せず、公開済み記事と同じ粗さの
週次データだけが第三者にも読めます。週次更新に使うGITHUB_TOKENはActionsが
自動で発行する既存機構で、別の個人アクセストークンは追加しません。記事の
commitにはcontents:write、Pages公開にはpages:write/id-token:writeが必要で、
これらの許可はA/B/Cとも独立して承認対象です。

## 診断と検証

Nodeはwin32/x64、npm config get osはlinuxでした。lockfileにはWindows版が
存在しており、lockfile不足ではなくnpmの既存OS指定が原因でした。今回だけ
`npm.cmd ci --os=win32 --cpu=x64 --include=optional --ignore-scripts --cache .npm-cache --no-audit --no-fund`
を作業内で実行して解消。既存Wrangler 4.141.0の依存である
@cloudflare/workerd-windows-64 1.20260925.1と@esbuild/win32-x64 0.28.1を取得し、
グローバルnpm設定・package-lock.jsonは変更していません。新しい宣言依存は不要。
ダウンロードのネットワーク昇格は許可され、認証発行や本番接続はありません。

Wranglerログ/設定が許可外のAppDataへ出ないよう、このプロセスだけ
XDG_CONFIG_HOMEとWRANGLER_LOG_PATHをworker/.wrangler配下へ指定し、
WRANGLER_SEND_METRICS=falseにしてdry-runを実行しました。実workerdテストは
既存依存Miniflareを使い、外部fetchを拒否したローカル環境で実行。Counterの
並行更新、SQL/RPC、alarm設定、認証、入力上限、週次summaryが通過しています。
90日expiry実行はSQLite shimで検証。実DNS/Route/TLS、実アカウント権限、
本番の週次commit/deployはまだ検証していません。

少数保護は10未満抑制＋10イベント帯＋域名/ページの件数非表示＋小さい補集合の
抑制＋閉じた非重複週＋封印snapshot＋累積値非公開で検証しました。20件の
主要集団に1〜9件を足しても同じ公開帯20〜29となり、総数から正確な残差を
引けません。ただし外部知識に対する万能な匿名性や差分プライバシーを主張しません。
10件は10人ではなく、繰り返し1人の場合もあります。旧counterとの対応は不明です。

referrerはDNS文字だけを許し、UAは解析しません。記事生成は固定テンプレートで
外部入力をLLMやコマンドへ渡さず、域名は不信頼なデータラベルとして引用します。
HTMLはhtml.escapeで表示し、外部域名のリンクを自動生成しません。SQLはbind値。
公開変更説明だけは人がレビューしたpublic_summaryを利用します。HTML/命令風入力、
リダイレクト、認証失敗/鍵未設定、エラーの秘密漏洩、二重生成、API失敗後retryを
テストしました。週報は一時ファイルを完全に書いてから排他的hard linkで公開し、
同時生成でも既存ファイルを上書きしません。GitHub concurrencyと通常pushを併用し、
競合pushや保護ルール拒否は停止します。

## 承認後の実施順序

1. 選択A/B/C、現プランと費用境界、公開範囲、Actions書き込み権限を確認。
2. Worker/Pagesを測定OFFで反映し、About/Privacyを先に公開。
3. A/BはDNSのproxy状態、TLS、origin確認後に上記2本以内のRouteを追加し、
   fail openを設定。EDGE_ENABLED=true、必要なbrowser METRICS_ENABLED=true。
   Routeなし/CではEDGE_ENABLED=falseを維持。設定は承認後のsourceに反映して
   次の自動deployでOFFへ戻らないようにする。
4. AはPUBLIC_SUMMARY=true/SUMMARY_AUTH=public、Bは鍵設定/private。
   SUMMARY_URLは既存workers.dev/hitの同じホストの/summaryへ設定。
5. production smokeはmeasurement=testを各ページ/JSON/llms URLに付ける。
   実RouteのJSなしGET、counter非増加、抑制済みAPI、配信失敗時の復旧を確認。
6. ENABLE_WEEKLY_REPORTS=trueを最後に設定し、承認済みmanual runで
   commit/Pages反映を確認。実日時とレビュー済みpublic_summaryをnotebookへ追記。

以上をまとめて承認しても、プラン変更や権限不足、TLS/branch保護等の新たな
条件が判明したらその影響を報告し、承認範囲外の変更は実施しません。
