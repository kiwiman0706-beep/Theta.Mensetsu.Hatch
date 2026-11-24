# Theta Mensetsu Hatch Android版

ネイティブのAndroidアプリ（Java）。画面と処理（同期・連絡先・Gemini・データ形式）は PC版・ブラウザ版と同じものをアプリの中で動かし、スマホならではの部分をJavaで受け持ちます。

| Javaが受け持つこと | |
| --- | --- |
| 書類スキャナー | Google の ML Kit ドキュメントスキャナー（紙の履歴書の端を見つけて切り抜き・傾き補正、何ページでも）。使えない端末では画面内のカメラ |
| Googleアカウント | Play開発者サービスで許可（アカウントを選ぶ。以後は自動で更新。ブラウザ版のような1時間ごとのログインは不要） |
| ファイル | 履歴書の画像・PDF・録音・手書きメモはスマホ内のファイル。PDFを他のアプリで開く・共有 |
| 共有で受け取る | Gmail・ファイル・Googleドライブなどの「共有」から履歴書のPDF・画像を直接取り込み。書き出した zip を共有すると、まとめて読み込み |
| カメラ・マイク | 書類の撮影・面接の録音（初回に許可を求めます） |
| 鍵 | Gemini APIキーは Android Keystore で暗号化して保存（同期・バックアップしない） |
| 戻るボタン | 画面を1つ戻る。一覧では閉じる |

同期は、アプリを開いたとき・閉じたとき・変更の直後・開いている間の3分ごとに行います（裏で常に動くわけではありません）。

## 入れる

[Releases](https://github.com/kiwiman0706-beep/Theta.Mensetsu.Hatch/releases/latest) の `ThetaMensetsuHatch-<版>.apk` をスマホでダウンロードして開く（「提供元不明のアプリ」の許可が必要です）。

## Googleとつなぐ

Google Cloud のシリーズのプロジェクトに、Android 用の OAuth クライアント（パッケージ名 `app.thetahatch.mensetsu`、シリーズ共通の SHA-1）が登録してあります（2026-11-06）。アプリでメニュー →「Googleアカウント」→「ログイン」でアカウントを選ぶだけです。

## 署名と更新

- APK は**シリーズ共通の鍵**で署名します（GitHub の Secret `ANDROID_KEYSTORE_B64`・`ANDROID_KEYSTORE_PASSWORD`・`ANDROID_KEY_ALIAS`・`ANDROID_KEY_PASSWORD`。Theta.Hatch.Series の `secrets/README.md`）。Secret が無いとリリースは止まります。
- このアプリはインストールの権限を持ちません。メニュー →「更新を確認」で、Theta Home Hatch／KidsHome Hatch（更新のハブ）に更新を頼みます。ハブが無ければ Releases のページを開きます。
- 0.2.0 まで（`jp.yaegaki.theta.mensetsu`、開発用の鍵）とは別のアプリです。1.0.0 を入れて Vault から応募者が戻ったのを確かめてから、古い方を削除してください。

## 共通設定（ハブ）

同じ端末に Theta Home Hatch（または KidsHome Hatch）があれば、その「Hatch シリーズの共通設定」から Gemini のモデル・Google アカウントを受け取り、Gemini API キーは「Gemini APIキー・モデル」の画面で「Home Hatch の Gemini APIキーを使う」を押したときにだけ受け取ります。

## 開発

```sh
cd web && npm install && npm run build:android     # 共通の画面と処理を app/src/main/assets/www へ
cd ../android && ./gradlew :app:assembleRelease    # app/build/outputs/apk/release/app-release.apk
NODE_PATH=$(npm root -g) node tests/page.e2e.cjs   # アプリの画面を、Javaの橋渡しの代役つきでChromiumで確認
```

Android Studio で `android/` を開いてもビルド・実機実行できます（先に `npm run build:android`）。
