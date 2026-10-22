# Theta Mensetsu Hatch PC版（Windows / Mac）

## 使い始める

1. [Releases](https://github.com/kiwiman0706-beep/Theta.Mensetsu.Hatch/releases/latest) から入れます。
   - **Windows**：`ThetaMensetsuHatch-Setup-<版>.exe`（管理者権限は不要）。署名していないため SmartScreen が出たら「詳細情報」→「実行」。更新は自動です。
   - **Mac**：Apple シリコンは `…-mac-arm64.dmg`、Intel は `…-mac-x64.dmg`。初回だけ右クリック →「開く」。
2. 初回起動で Theta Vault フォルダの場所を決めます（ふつうは「書類フォルダに作る」）。
3. メニュー →「Gemini APIキー・モデル」、複数のPCで使うなら [`../docs/SETUP.md`](../docs/SETUP.md) の手順でGoogleに接続して「同期を始める」。

ウインドウを閉じてもタスクトレイ（Macはメニューバー）に残り、同期を続けます。終了はトレイのメニューから。

## PCならではの操作

- 履歴書のPDF・画像を**ウインドウにドラッグ＆ドロップ**で取り込み（1ファイル = 1人）。
- 一覧で **Ctrl＋クリック**（Macは⌘＋クリック）、またはホイールクリックで、応募者を**別ウインドウ**で開く。何人でも並べて見比べられます。
- Esc で戻る・閉じる、Ctrl＋F で検索。
- PCのカメラで紙の書類を撮影、PCのマイクで面接を録音（初回に許可を求められます）。
- DeskHatch：トレイ →「DeskHatch用のURLをコピー」を「Webページ」ドロワーに貼り付け。

## 開発

```sh
cd desktop
npm install
npm start            # ../ui の共通画面を取り込んで起動
npm test             # Vault形式・同期（2台のPC）・連絡先・HTTPブリッジ・Googleログイン
NODE_PATH=$(npm root -g) node test/e2e/ui.e2e.cjs   # 画面（Playwright / Chromium）
npm run dist:win     # Windows インストーラー（Windowsで）
npm run dist:mac     # Mac dmg / zip（Macで）
```

| ファイル | 役割 |
| --- | --- |
| `main.js` | Electron本体：トレイ、ウインドウ（別ウインドウ）、Vaultの場所、鍵の暗号化保管、画像変換、カメラ・マイクの許可、終了時の同期 |
| `lib/backend.js` | 画面からの操作の実装（ブラウザ版も同じものを使う）。読み取りキュー、顔写真、連絡先、同期の予定 |
| `lib/drive-vault.js` | Googleドライブとの同期（[`../docs/SYNC.md`](../docs/SYNC.md)） |
| `lib/vault-store.js` / `vault-codec.js` | Vaultフォルダの読み書き・監視、Markdown形式（[`../docs/MENSETSU_VAULT.md`](../docs/MENSETSU_VAULT.md)） |
| `lib/google-api.js` / `google-desktop.js` / `contacts.js` | Drive・People API、PCのGoogleログイン（ループバック＋PKCE、更新トークン）、連絡先とラベル |
| `lib/gemini.js` / `prompts.json` | 履歴書の読み取り・顔写真・文字起こし・通勤の概算 |
| `lib/server.js` | 127.0.0.1のHTTPサーバー（画面・ブリッジ・アップロード） |
