# Theta Mensetsu Hatch

医療機関の職員採用面接の管理（履歴書の読み取り・選考・面接の記録・採用手続き）。Android・Windows/Mac（Electron）・Web（PWA）で、共通の画面 `ui/` と共通の処理 `desktop/lib/` を使う。

- 文章は日本語。データ形式は `docs/MENSETSU_VAULT.md`、一括の読み込み・書き出しは `docs/IMPORT_FORMAT.md`
- テスト：`cd desktop && npm test`、`cd web && npm test`、画面は `desktop/test/e2e/ui.e2e.cjs`・`web/test/e2e.cjs`・`android/tests/page.e2e.cjs`（Playwright）
- リリース：版（`desktop/package.json`・`web/package.json`・`android/app/build.gradle`）を揃えて上げ、`docs/releases/v<版>.md` を足して main に push

## Theta Hatch シリーズ共通（必ず参照）

このアプリは Theta Hatch シリーズの 1 つです。シリーズ共通の仕様・デザイン・鍵の決まりは
GitHub の kiwiman0706-beep/Theta.Hatch.Series にあり、このリポジトリの docs より優先します。

- 作業を始める前に、Theta.Hatch.Series を読める状態にする
  （クラウドのスレッドでは add_repo で kiwiman0706-beep/Theta.Hatch.Series を追加して clone する）
- 読むもの：
  - `spec/THETA_HATCH_SPEC.md`（共通仕様）、`spec/THETA_VAULT_SPEC.md`、`spec/THETA_SHARED_SETTINGS.md`、`spec/THETA_GOOGLE_SETUP.md`
  - `design/README.md`（スキン：system・dark・light・pop・alert・scifi。色は `design/skins/skins.json`）
  - `spec/THETA_HATCH_SPEC.md` §6.1（アプリ内自動更新は必須）、`docs/MIGRATION.md`・`catalog/apps.json`（このアプリの目標の ID・リポジトリ名）
  - `secrets/README.md`（署名鍵はシリーズ共通。Secret の名前は ANDROID_KEYSTORE_B64・ANDROID_KEYSTORE_PASSWORD・ANDROID_KEY_ALIAS・ANDROID_KEY_PASSWORD）
- 共通仕様の写しをこのリポジトリに増やさない（変えるときは Theta.Hatch.Series 側を直す）
- 鍵・パスワード・API キーをリポジトリに入れない
- 移行や大きな変更の方針と進み具合は、Theta.Hatch.Series の `progress/<id>.md` に書く（書き方は `progress/_TEMPLATE.md`。自分のアプリのファイルだけを触る）
- 作品の版や概要が変わったら、Theta.Hatch.Series の README の一覧も直す
