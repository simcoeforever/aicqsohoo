# Base mainnet preparation — disabled

This change is local preparation, not approval to publish or activate real payments.
The deployed Base Sepolia experiment remains the current public service. Its successful
self-transfer is not a real-USDC mainnet result.

## Fixed pilot and separation

- Network `eip155:8453`; Circle native USDC
  `0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913`.
- Amount `10000` atomic (0.01 real USDC); recipient
  `0xF89FfB82f5F3dF83f68062a1b0d3BAA6A1005735`.
- Separate `MAINNET_PAYMENTS` SQLite Durable Object class `MainnetPayments`,
  instance `base-mainnet-pilot-v1`; intended receipt IDs start `main_`.
  Existing `PAYMENTS` / `base-sepolia-test-v1` / `pay_` receipts remain unchanged.
- Pilot capacity: one start per UTC day and one start for the entire pilot.
  Failed, pending and settled records all consume that capacity permanently.
  No reset, deletion or automatic re-signing to regain capacity.
- `MAINNET_PAYMENT_MODE=off` documents the state. **No value of this variable
  can enable this version:** mainnet payment, signature, verify and settle handlers
  are intentionally absent. Only disabled information and unknown-receipt GETs exist.
- Mainnet information is `/contribution/mainnet/info`; other mainnet requests
  return 503 without a payment challenge or network call. No public mainnet page,
  browser wallet connection, navigation link or AI payment offer is added.
- The new migration is additive (`v3`), never resetting Counter or Payments.

## 本人が扱う秘密値

対象の既存Worker名は **`aicqsohoo-counter`**。将来使用する秘密変数名は
**`CDP_API_KEY_ID`** と **`CDP_API_KEY_SECRET`**。CDPのSecret API Keyを使い、
Rabbyの秘密鍵・シード・`CDP_WALLET_SECRET`・Coinbase OAuthは不要です。
SDKは`@coinbase/cdp-sdk@1.57.1`に固定。Ed25519対応の認証モジュールだけを使用。

本人入力の候補手順（準備しただけ。まだ実施していません）:

1. https://dash.cloudflare.com/ を本人が開く。
2. 対象アカウント → Workers & Pages → `aicqsohoo-counter` → Settings →
   Variables and Secrets。Worker名を再確認する。
3. Addで種類を **Secret** にして、上記2変数を本人が入力する。
   IDはCDP画面のKey ID、secretは発行時に保存した値。両方をSecretにする。
4. 保存ボタンがDeployを伴う場合、既存コードの新しい版を作る操作になる。
   親との確認後に本人が行う。本番用ローカルコードの公開とは別操作。
5. Workerの通常Variableやコード、GitHub、チャット、スクリーンショットには
   secretを入れない。控えは本人のパスワード管理庫に保管する。

Cloudflareのsecretは保存後の値を読み戻せません。準備版の本体Workerは
`GET /contribution/mainnet/auth-status`で版ごとに1回だけCDP `/supported`を照会します。
実行前に別DOへ予約を永続化し、同時要求・再起動でも再照会しません。
返すのは秘匿済みの認証結果だけで、キー・JWT・request ID・生レスポンスを
保存／公開しません。mainnet payment POSTやverify/settleは実装しません。
Worker Secretsを保存しただけでは本番受付は有効になりません。

## 認証だけを確認する手順

ローカルの `Check-AICQSOHOO-CDP.ps1` を本人が実行する候補手順です。
Windows PowerShellで、録画・トランスクリプトのないセッションを使います。

```powershell
& 'C:\Users\airbo\Documents\Codex\2026-10-04\task\Check-AICQSOHOO-CDP.ps1'
```

IDとsecretを2回の非表示入力で受け取り、子プロセスのメモリーにだけ渡し、
終了時に一時環境変数を復元します。`.dev.vars`、設定ファイル、ログを作りません。
Node/workerdには処理のため平文メモリーが必要で、完全なメモリー消去は保証しません。
エラー詳細・JWT・キー・レスポンスの生データを出力しません。

同じSDKをCloudflareのローカルworkerdで実行し、120秒のJWTを作成、
固定URL `GET https://api.cdp.coinbase.com/platform/v2/x402/supported` のみを許可。
verify/settle・wallet API・決済POSTは呼びません。
成功出力は `authenticated:true`, `base_exact_v2:true`, `payment_performed:false`。
401/403/429等でも許可した診断情報だけを報告し、権限を自動変更しません。
エラー時には既知の`errorType`だけを`error_code`として出力し、形式検査した
`correlationId`等を`request_id`として出力できます。メッセージ本文・未知コード・
リンク・任意ヘッダーは出力しません。5xxは`authenticated:null`（未確認）であり、
キー不正・権限不足・カード未登録とは断定しません。自動再試行も行いません。
2026-10-05に中継の不具合を修正: MiniflareのRequestをNode fetchに直接渡すと
`[object Request]`のURL解釈エラーが起き、Miniflareがローカル500を合成しました。
従来の`status:500`はCDPのHTTP応答と断定できません。修正版はURL文字列と
ヘッダーを明示して渡し、`response_source:remote_http`が確認できた場合だけ
`status`を出力します。通信例外は`local_transport`、中継の由来不明は
`local_bridge_unverified`としてHTTP状態と区別します。
秘密値は1行の64バイトBase64形式を検査し、空白・引用符・改行を黙って除去せず
ローカル入力エラーにします。PowerShellは値を引数やstdinに流さず、非表示入力から
一時的な子プロセス環境へ渡すため、PowerShell出力文字コードの影響は受けません。

これは本人が入力したキーの認証確認です。**保存済みWorker Secretsの値の一致、
請求設定、利用資格・任意支援用途の許可、決済可能性までは証明しません。**
本人のローカル実在キー確認は成功報告済み（remote HTTP200、Base exact v2対応）。
本人が既存Workerへ2つの暗号化Secretを保存済みとの確認報告があります。
エージェントのテストは公開RFC 8032固定ベクトルと偽の外部サービスだけです。
Cloudflare上の準備版反映と認証確認は、デプロイが自動承認レビューに2回拒否されたため
未実施です。別経路で迂回していません。

## Remaining decisions before any publication or activation

Japan-specific eligibility, voluntary-support applicability (including conditional charity
uses), billing/card requirements and actual key permissions/IP settings remain unverified.
Confirm these with the user/provider; do not infer permission from a supported response.
Agree on real-fund consent/refunds/privacy wording, self-transfer versus a separate payer,
recipient control and the one-start cap. Real acceptance requires a separately reviewed
implementation and explicit publication/activation approval. Never reuse the previous
testnet publication script: its old release manifest intentionally rejects these changes.

## Official references

- [CDP facilitator and pricing](https://docs.cdp.coinbase.com/x402/seller/facilitator)
- [CDP authentication](https://docs.cdp.coinbase.com/api-reference/v2/authentication)
- [CDP terms](https://www.coinbase.com/legal/developer-platform/terms-of-service)
- [Conditional uses](https://www.coinbase.com/legal/prohibited_use)
- [Privacy](https://www.coinbase.com/legal/privacy)
- [Circle USDC contracts](https://developers.circle.com/stablecoins/usdc-contract-addresses)
- [Cloudflare secret bindings](https://developers.cloudflare.com/workers/configuration/secrets/)
