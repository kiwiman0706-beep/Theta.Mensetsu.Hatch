# Theta Vault 仕様 v1

Theta ○○ Hatch シリーズ共通の保存・同期形式。**Obsidianでそのまま開けるフォルダ（Markdown＋添付ファイル）**をデータの正本とし、アプリはそれを読み書きする「ビューア兼エディタ」として振る舞う。特定のクラウドやアプリに依存しない（ベンダーロックインを防ぐ）。

> 状態：Theta Meishi Hatch 0.10.0 で実装済み（Android・Google Drive）。他のTheta Hatchアプリもこの仕様に合わせる。

## 1. 原則

1. **正本は人が読めるファイル**。アプリが消えても、Obsidian・テキストエディタ・エクスプローラーで全データを読める。
2. **置き場所は自由**。Google Drive / OneDrive / Dropbox / Syncthing / NAS / ローカル。アプリは「フォルダ」として扱い、運び方（トランスポート）は差し替え可能。
3. **Obsidianで編集してもよい**。アプリは外部での編集を取り込み、知らない項目・本文は消さない。
4. **端末固有の情報はVaultに入れない**（連絡先ID・カレンダー予定ID・処理キュー・同期状態）。
5. **1件 = 1ファイル**。同期の衝突単位を小さくし、差分が見やすい。

## 2. フォルダ構成

```
Theta Vault/                       ← Vaultのルート（Obsidianで「保管庫として開く」）
├── .theta/
│   └── vault.json                 ← {"spec": 1, "apps": ["meishi", ...]}
├── Meishi/                        ← Theta Meishi Hatch
│   ├── People/                    ← 人の名刺（1人1ファイル）
│   │   └── 山田 太郎（サンプル株式会社）.md
│   ├── Shops/                     ← お店のカード
│   │   └── 炭火焼 さくら.md
│   └── _files/                    ← 添付（画像・PDF原本・録音）。全員分を1つのフォルダに
│       ├── 3f2a…-0.jpg            ← ファイル名はアプリが付ける一意の名前（英数字）。中身は変えない
│       ├── 3f2a….pdf
│       └── 9c1e….m4a
├── Mensetsu/                     ← Theta Mensetsu Hatch（応募者。docs/MENSETSU_VAULT.md）
│   ├── Applicants/
│   └── _files/
├── <他のTheta アプリ>/
└── （ユーザーが自由に作るノート）
```

- フォルダ名は英語（アプリ間で固定・文字化けしにくい）、ファイル名は日本語（人が読む）。
- ファイル名は表示用。**同一性はfrontmatterの `id`** で判定するので、Obsidianでファイル名を変えても、アプリ側で氏名を変えて名前が変わっても追跡できる。
- 添付の参照はVaultのルートからのパス（例 `Meishi/_files/3f2a…-0.jpg`）。Obsidianの埋め込み `![[…]]` で表示される。
- 添付のファイル名を人が読める名前にしない理由：全端末・全OSで同じ名前を保て、差し替え・改名による取り違えが起きないため。どの人の画像かはノート側の埋め込みで分かる。

## 3. 1件のMarkdown

```markdown
---
theta: meishi/person@1
rev: 9c1e0b7a2f44
id: 2b6f3c1e-…
name: 山田 太郎
kana: やまだ たろう
company: "[[サンプル株式会社]]"
department: 営業部
title: 部長
email: [taro@example.com]
phone: [03-1234-5678]
mobile: [090-1234-5678]
postal: 100-0001
address: 東京都千代田区丸の内1-1-1
website: https://example.com
tags: [取引先, 展示会]
met: 2024-03-05
met_place: 展示会
status: confirmed
contact_registered: true
geo: [35.681, 139.767]
created: 2024-03-05T10:00:00+09:00
updated: 2026-10-16T15:30:00+09:00
pages:
- Meishi/_files/3f2a…-0.jpg
- Meishi/_files/3f2a…-1.jpg
greetings:
- id: g1
  year: 2027
  dir: received
  date: 2027-01-02
  kind: nenga
  files:
  - Meishi/_files/7d0c…-0.jpg
---

![[Meishi/_files/3f2a…-0.jpg|360]] ![[Meishi/_files/3f2a…-1.jpg|360]]

## メモ
- 2026-10-16 15:30 展示会でご挨拶。次回、資料を共有する予定。 ^9b1f…
- 2026-11-02 09:10 見積もり送付済み。
  来週フォロー ^c27a…

## 年賀状・お便り・書類
| 年 | 日付 | 届いた/送った | 種類 | 件名・差出人 |
|---|---|---|---|---|
| 2027 | 2027-01-02 | 届いた | 年賀状 | 山田 太郎・山田 花子 |

## 録音
- ![[Meishi/_files/9c1e….m4a]] 2026-10-16 15:30（1分25秒）

## 名刺の全文
```text
（Geminiが読み取った全文）
```

<!-- ここから下は自由に書けます（アプリは変更しません） -->
```

### 正本の分担

| 部分 | 正本 | Obsidianでの編集 |
| --- | --- | --- |
| frontmatter | 構造化データの正本 | 可（アプリが取り込む） |
| `## メモ` | メモの正本。`- YYYY-MM-DD HH:MM 本文 ^id` の行（2行目以降は2字下げ）。`^id` はメモを見分ける印 | 可（追加・修正・削除を取り込む。新しい行に `^id` は不要） |
| `## 名刺の全文` | Geminiの読み取り全文 | 可 |
| 画像の埋め込み行、`## 年賀状・お便り・書類`、`## 録音` | frontmatterから**アプリが生成** | 編集しても次回上書き（表示用） |
| `rev` | アプリが書いた時点の本文の指紋。一致しなければObsidian等で編集されたと判断し、ファイルの更新時刻を編集時刻として扱う | 触らない |
| それ以外の本文・見出し | ユーザーのもの | 自由。アプリは触らない |

- 知らないfrontmatter項目は保持して書き戻す（他アプリやObsidianプラグインの項目を壊さない）。
- **Obsidianで新しくノートを作ってもよい**：`Meishi/People/` に `name:` などを書いたノートを置くと、次の同期で名刺として取り込み、`id` を書き足す。
- 会社名は `[[会社名]]` リンクにして、Obsidianのグラフ・バックリンクで「会社ごとの人」を見られるようにする（会社ノートは任意。無くても動く）。

## 4. 同期

- **変更の検出はファイル内容のハッシュ**（Google Driveのmd5。前回同期時の値と比較）。端末ごとの記録はVaultの外（アプリのローカル領域 `vault-sync.json`）に置く。Google Driveの独自属性には頼らない（PCの「Googleドライブ」アプリ経由でObsidianが書き換えても正しく検出するため）。
- 端末側の変更は、名刺データの内容ハッシュ（表示用の細部を除く）で検出する。
- 判定表は現行の `SYNC_SPEC.md` と同じ（片側だけ変更 → その側を採用、両側変更 → 項目単位で新しい方＋メモ・添付は和集合、編集は削除に勝つ）。
- 解析できないノート（frontmatterが壊れた等）は取り込まず、上書きもせず、同期結果にエラーとして表示する。
- 削除：ファイルを消すのではなく `.theta/trash/` へ移動（誤操作から戻せる）。
- **Obsidianでノートをサブフォルダへ移しても削除扱いにしない**（IDで所在を確認し、その場所のまま更新する）。People ↔ Shops の振り分けだけはアプリが行う。
- **一度に多数（既知の30%超かつ5件超）が見当たらない場合は、端末側の削除を行わない**（フォルダ・アカウントの取り違え対策）。
- ノートのファイル名は「氏名（会社）.md」。氏名・会社を変えると同じファイルのまま改名する。同名がある時は「 (2)」を付ける。
- 添付は不変名（同名で中身を変えない）。差し替え時は新しい名前で追加。

### トランスポート

| 方式 | 使う場面 | 備考 |
| --- | --- | --- |
| Google Drive API | Android（他アプリ不要） | 現行の仕組みを流用。PCは「Googleドライブ」デスクトップアプリで同じフォルダがローカルに見える → Obsidianで開ける |
| ローカルフォルダ | Windows / Mac（Drive・OneDrive・Dropbox・Syncthingの同期フォルダ）、Android（Syncthing等のフォルダをSAFで指定） | クラウドを選ばない |
| WebDAV（将来） | NAS・自宅サーバー | |

Obsidian Sync（有料・独自形式）はアプリから直接は使わないが、PCでObsidian Syncを使っていても、ローカルフォルダ方式なら共存できる。

## 5. プラットフォーム

| 対象 | 形 | UI |
| --- | --- | --- |
| Android（スマホ・タブレット） | APK（現行） | 共通Web UI＋Javaブリッジ |
| Android TV / Google TV（Chromecast with Google TV含む） | **同じAPK**（Leanbackランチャー対応、リモコン操作用のフォーカス表示、撮影系は非表示） | 閲覧・地図・カレンダー・写真表示 |
| Windows / Mac | Electronの単体アプリ ＋ **DeskHatchプラグイン**（同じ中身） | 共通Web UI＋Nodeブリッジ |

- UI（HTML/CSS/JS）は全プラットフォーム共通。端末機能だけブリッジで差し替える（現行の `Native.call` / `onNative` の形を全アプリで統一）。
- DeskHatch側には「プラグイン型ドロワー」（`manifest.json`＋ローカルHTML＋preloadブリッジ＋権限宣言）を追加し、Theta Hatchアプリはすべてこの形で載る。

## 6. テレビに映す（Theta Link）

Google Cast（Chromecast）は受信側アプリをGoogleに登録・公開する必要があり、Google以外の端末で使えないため、**自前のLAN内連携「Theta Link」**を基本にする。

- テレビ（Android TV / PC）側のアプリが同じLAN内に `_thetahatch._tcp` を告知（mDNS / Android NSD）。
- スマホのアプリが一覧から選び、初回だけテレビに表示される4桁コードでペアリング。
- WebSocketで「この名刺を表示」「地図をこの範囲で」「カレンダーのこの月」などのコマンドを送る。テレビ側は自分のVaultのデータで描画するので、画像を送る必要がない（同じVaultを同期している前提。未同期でも、スマホから一時的に画像を送るフォールバックあり）。
- 必要になれば、Google Cast対応を後から追加できる（受信側は同じWeb UI）。

## 7. 移行（Theta Meishi Hatch）

1. 0.10.0から同期はVault形式のみ。端末のデータがそのままVaultへ送られるので、変換作業は不要。旧同期フォルダ（「Meishi-Claude データ」「Theta Meishi Hatch データ」）は使わなくなるが、削除はしない。
2. 2台目以降の端末は、最初の同期でVaultの内容と突き合わせる（同じ人は統合、違う人は追加）。
3. 旧形式（`people/*.json` + `media/`）のZIP取り込みは引き続き使える。バックアップZIPのVault形式化は今後。

## 8. 決定事項

- Vaultのルート名は `Theta Vault`、既定の置き場所はGoogle Driveのマイドライブ直下（名前で探し、無ければ作る）。
- フォルダ名は英語、ノートのファイル名は日本語。
- Obsidianでの編集は frontmatter・`## メモ`・`## 名刺の全文`・自由記述を取り込む。
