# Theta Mensetsu Hatch Android版

ネイティブのAndroidアプリ（Java）。画面と処理（同期・連絡先・Gemini・データ形式）は PC版・ブラウザ版と同じものをアプリの中で動かし、スマホならではの部分をJavaで受け持ちます。

| Javaが受け持つこと | |
| --- | --- |
| 書類スキャナー | Google の ML Kit ドキュメントスキャナー（紙の履歴書の端を見つけて切り抜き・傾き補正、何ページでも）。使えない端末では画面内のカメラ |
| Googleアカウント | Play開発者サービスで許可（アカウントを選ぶ。以後は自動で更新。ブラウザ版のような1時間ごとのログインは不要） |
| ファイル | 履歴書の画像・PDF・録音・手書きメモはスマホ内のファイル。PDFを他のアプリで開く・共有 |
| 共有で受け取る | Gmail・ファイル・Googleドライブなどの「共有」から履歴書のPDF・画像を直接取り込み |
| カメラ・マイク | 書類の撮影・面接の録音（初回に許可を求めます） |
| 鍵 | Gemini APIキーは Android Keystore で暗号化して保存（同期・バックアップしない） |
| 戻るボタン | 画面を1つ戻る。一覧では閉じる |

同期は、アプリを開いたとき・閉じたとき・変更の直後・開いている間の3分ごとに行います（裏で常に動くわけではありません）。

## 入れる

[Releases](https://github.com/kiwiman0706-beep/Theta.Mensetsu.Hatch/releases/latest) の `ThetaMensetsuHatch-<版>.apk` をスマホでダウンロードして開く（「提供元不明のアプリ」の許可が必要です）。

## Googleとつなぐ（1回だけ）

Google Cloud の同じプロジェクトに「**Android**」のOAuthクライアントを作ります。アプリのメニュー →「Google連携の初期設定ガイド」に、貼り付けるパッケージ名とSHA-1が表示されます。

- パッケージ名：`jp.yaegaki.theta.mensetsu`
- SHA-1：署名鍵ごとに違います（アプリの画面に出る値を使ってください）。開発用の鍵（`android/signing/mensetsu-dev.jks`）なら `AF:16:1A:37:D8:45:CB:D5:DD:2A:90:0C:57:4F:21:EA:DC:CB:9B:C1`

クライアントIDをアプリに入れる必要はありません。作ったら、メニュー →「Googleアカウント」→「ログイン」でアカウントを選びます。

## 署名鍵

- リポジトリのSecrets（`ANDROID_KEYSTORE_B64`・`ANDROID_KEYSTORE_PASSWORD`・`ANDROID_KEY_ALIAS`）があればその鍵で、無ければ開発用の鍵 `android/signing/mensetsu-dev.jks`（パスワード `mensetsu-dev`）で署名します。
- 開発用の鍵はリポジトリに入っているので、リポジトリを読める人なら同じ署名のAPKを作れます。リポジトリを公開する場合や、本格的に使う場合は自分の鍵に替えてください（替えるとSHA-1が変わるので、Google CloudのAndroidクライアントを作り直し、アプリも入れ直しになります）。

```sh
keytool -genkeypair -keystore mensetsu-release.jks -alias mensetsu -keyalg RSA -keysize 2048 -validity 10000
base64 -w0 mensetsu-release.jks   # → ANDROID_KEYSTORE_B64（Macは base64 -i mensetsu-release.jks）
```

## 開発

```sh
cd web && npm install && npm run build:android     # 共通の画面と処理を app/src/main/assets/www へ
cd ../android && ./gradlew :app:assembleRelease    # app/build/outputs/apk/release/app-release.apk
NODE_PATH=$(npm root -g) node tests/page.e2e.cjs   # アプリの画面を、Javaの橋渡しの代役つきでChromiumで確認
```

Android Studio で `android/` を開いてもビルド・実機実行できます（先に `npm run build:android`）。
