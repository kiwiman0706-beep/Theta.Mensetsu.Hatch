# 一括の読み込み・書き出しのファイル形式（zip）

Theta Mensetsu Hatch の「メニュー → まとめて書き出す・読み込む」で使う zip の形式です。
アプリが書き出す zip も、ほかで作った zip（例：まとめて受け取った履歴書を別の作業で整理したもの）も、同じ形なら読み込めます。

- zip を開くと、そのまま **Theta Vault**（Obsidian で開けるフォルダ）になっています。
- 読み込みは **足すだけ** です。今あるデータは消しません。同じ `id` の応募者は `updated`（更新日時）が新しい方を残します。
- 読み込む前に、件数（新しく加わる人・置き換える人・飛ばす人）とファイル数、問題点を画面に出します。

## 1. zip の中身

```
mensetsu-20261124.zip
├── manifest.json                          ← 任意（アプリが書き出すときは必ず付ける）
├── Mensetsu/
│   ├── Applicants/                        ← 応募者 1 人 = 1 つの Markdown
│   │   ├── 山田 花子（看護師）.md
│   │   └── 佐藤 一郎（医療事務）.md
│   └── _files/                            ← 履歴書の画像・PDF の原本・顔写真・書類・録音・手書き
│       ├── r2026-001-1.jpg
│       ├── r2026-001-2.jpg
│       ├── r2026-001.pdf
│       └── r2026-001-face.jpg
└── .theta/mensetsu-settings.json          ← 任意（アプリの設定。読み込むかは画面で選ぶ）
```

読み込みの決まり：

- **ノート**：zip の中のどこにある `.md` でも応募者として読みます（`.theta/` の中は除く）。フォルダ名は上のとおりにしておくのがおすすめです。
- **ファイル**：zip の中の場所は問わず、**ファイル名**で探します（ノートの `pages:` などに書いた名前と同じファイル）。ファイル名は **英数字と `_` `.` `-` だけ**（日本語・空白は不可）。同じ名前のファイルは同じ中身にしてください。
- すでにアプリにある同じ名前のファイルは上書きしません。
- `__MACOSX/`・`.DS_Store`・`.base` は無視します。

## 2. 応募者のノート（Markdown）

先頭の `---` と `---` の間（frontmatter、YAML）が項目です。最低限は `name` だけで読み込めます。

### いちばん小さい例（履歴書の画像だけ。読み取りはアプリの Gemini に任せる）

```markdown
---
id: r2026-001
name: 山田 花子
status: new
pages:
- Mensetsu/_files/r2026-001-1.jpg
- Mensetsu/_files/r2026-001-2.jpg
originals:
- file: Mensetsu/_files/r2026-001.pdf
  name: 山田花子_履歴書.pdf
applied: 2026-11-20
source: 求人サイト
---
```

- `status: new` にすると、読み込んだあとの画面に「読み取りがまだの n 人を Gemini で読み取る」ボタンが出ます。押すと `pages` の画像から氏名・学歴・職歴・資格・顔写真などを読み取ります（Gemini API キーが必要）。
- `pages` は **画像（JPEG・PNG）**。PDF は Gemini が読めないので、ページごとの画像にして `pages` に入れ、PDF そのものは `originals` に入れてください（アプリの画面で「原本のPDFを開く」になります）。

### すでに内容を読み取ってある例

```markdown
---
id: r2026-002
name: 佐藤 一郎
kana: さとう いちろう
birth_date: 1990-05-01
category: 医療事務
position: 医療事務（外来受付）
employment: 常勤
stage: received
applied: 2026-11-18
source: 紹介会社
agency: ○○メディカルキャリア
agency_contact: 担当 田中 03-0000-0000
postal: 160-0000
address: 東京都新宿区○○1-2-3
mobile: [090-0000-0000]
email: [ichiro@example.com]
education: |-
  2006-04 ○○高等学校 入学
  2009-03 ○○高等学校 卒業
career: |-
  2009-04 ○○クリニック 受付 入職
  2020-03 ○○クリニック 退職
licenses: |-
  2010-06 医療事務技能審査試験（メディカル クラーク）
motivation: 地域の医療に…
wishes: 平日のみ希望
status: confirmed
pages:
- Mensetsu/_files/r2026-002-1.jpg
portrait: Mensetsu/_files/r2026-002-face.jpg
portrait_source: resume
---

## 面接メモ
- 2026-11-25 14:00 電話で面接日を調整 ^m1

## 履歴書の全文
```text
（読み取った全文。任意）
```
```

### 項目の一覧

| 項目（frontmatter） | 中身 | 書き方 |
| --- | --- | --- |
| `id` | 応募者を見分ける印 | 英数字・`_`・`-`、80 文字まで。**付けておくことを強くおすすめ**（無いと読み込むたびに新しい人になる）。例 `r2026-001` |
| `name` | 氏名 | 姓と名の間に半角スペース |
| `kana` | ふりがな | ひらがな、姓と名の間に半角スペース |
| `birth_date` | 生年月日 | `YYYY-MM-DD`（西暦） |
| `gender` | 性別 | 書かれていれば |
| `category` | 職種 | 例：看護師・准看護師・介護職・医療事務・事務・薬剤師…。一覧に無い職種も可（アプリの一覧に加わる） |
| `position` | 応募職種・希望部署（書類の記載どおり） | 文 |
| `employment` | 雇用形態 | 常勤・非常勤・パートなど |
| `stage` | 選考状況 | `received`（書類受付・既定）・`scheduled`（面接予定）・`interviewed`（面接済み）・`hold`（保留）・`offered`（内定）・`hired`（採用）・`rejected`（不採用）・`declined`（辞退）。日本語の名前でも可 |
| `rating` | 評価 | `"1"`〜`"5"`（引用符付き） |
| `applied` | 応募日 | `YYYY-MM-DD` |
| `source` | 応募経路 | 求人サイト・ハローワーク・紹介会社・紹介など |
| `agency`・`agency_contact`・`agency_fee` | 紹介会社・担当者と連絡先・手数料と返金規定 | 文 |
| `interview` | 面接日時 | `YYYY-MM-DD HH:MM` |
| `interviewers` | 面接担当 | 文 |
| `start_date` | 入職可能日 | `YYYY-MM-DD` |
| `decided`・`decision_note` | 採否決定日・理由と本人への連絡 | `YYYY-MM-DD`・文 |
| `hire_date`・`department` | 入職日・配属先 | `YYYY-MM-DD`・文 |
| `commute`・`commute_cost` | 通勤（時間・手段）・通勤費 | 文 |
| `postal`・`address` | 郵便番号・住所 | 住所は 1 行目が現住所（2 行目以降に「連絡先：…」を書いてもよい） |
| `phone`・`mobile`・`email` | 電話・携帯・メール | **リスト**：`[090-0000-0000]`、複数なら `[a@example.com, b@example.com]` |
| `education`・`career`・`licenses` | 学歴・職歴・免許資格 | 1 行 1 件、`YYYY-MM 内容`（`|-` の複数行） |
| `motivation`・`self_pr`・`wishes` | 志望動機・自己PR・本人希望 | 文（複数行は `|-`） |
| `shift_days`・`shift_kinds`・`shift_hours` | 勤務できる曜日・勤務帯・時間帯や日数 | 曜日と勤務帯はリスト：`[月, 水, 土]`・`[日勤, 夜勤]`（曜日は 月〜日・祝、勤務帯は 日勤・早番・遅番・夜勤・当直・オンコール。ほかの言葉も可）。時間帯は文（例 `9:00〜16:00、週3日まで`） |
| `tags` | タグ | リスト：`[経験者, 夜勤可]` |
| `status` | 読み取りの状態 | `new`（まだ。Gemini で読み取れる）・`review`（要確認）・`confirmed`（確認済み）。省略時は `name` があれば `confirmed` |
| `created`・`updated` | 作った日時・更新日時 | ISO 8601（例 `2026-11-24T10:00:00+09:00`）。省略時は読み込んだ時刻。**同じ id を読み込み直すときは `updated` を新しくする**（古いと飛ばされる） |
| `pages` | 履歴書などのページの画像 | リスト。`Mensetsu/_files/<ファイル名>`（前の部分は無くてもよい） |
| `originals` | 元のファイル（PDF など） | リスト。`- file: Mensetsu/_files/x.pdf`（`name:` に元の名前を書けば画面に出る） |
| `portrait` | 顔写真（一覧のサムネイル） | `Mensetsu/_files/<ファイル名>`。無いときは、`status: new` の人は Gemini の読み取りのときに、読み取り済みの人は読み込んだあとの「顔写真の無い n 人の顔写真を切り出す」（メニューの「顔写真をまとめて切り出す」も同じ）で、履歴書の 1 ページ目から切り出す。`pages` が無く `originals` に PDF だけある人は、そのときに PDF をページの画像にする。ずれたときは応募者の画面の「履歴書から自分で切り出す」で直せる。顔写真の画像が手元にあれば、ここに入れておけば Gemini を使わずに済む |
| `documents` | 履歴書以外の書類 | `- {id: d1, date: 2026-11-20, kind: 職務経歴書, title: 職務経歴書, files: [Mensetsu/_files/d1.jpg], originals: [Mensetsu/_files/d1.pdf]}` |

アプリが書き出す zip には、このほか `recordings`（録音と文字起こし）・`sketches`（手書き）・`evaluations`（職員評価）・`google_contact` などが入ります。詳しくは [`MENSETSU_VAULT.md`](MENSETSU_VAULT.md)。

### 本文（任意）

| 見出し | 中身 |
| --- | --- |
| `## 面接メモ` | 1 行 1 件：`- YYYY-MM-DD HH:MM 本文`（行末の `^id` は任意。本文の先頭を `📌 ` にすると一覧にも出る） |
| `## 採用手続き` | `- [ ] 項目` ／ `- [x] 項目 📅 YYYY-MM-DD — メモ` |
| `## 履歴書の全文` | ` ```text ` と ` ``` ` で囲んだ全文 |

それ以外の本文は「自由に書いた部分」として残ります。

## 3. `manifest.json`（任意）

```json
{
  "format": "theta-export-1",
  "app": "mensetsu",
  "version": "1.0.0",
  "created": "2026-11-24T10:00:00Z",
  "count": 2,
  "files": [{ "path": "Mensetsu/Applicants/山田 花子（看護師）.md", "size": 1234, "sha256": "…" }],
  "missing": []
}
```

無くても読み込めます。あるときは `format` が `theta-export-1` であることを確かめます。

## 4. 作った zip を確かめる

PC で（Node.js が要ります）：

```sh
cd desktop && npm install
node scripts/check-import.js ../履歴書まとめ.zip
```

人数・ファイル数・読めないノート・足りないファイル・id の無い人を一覧にします（アプリのデータは変えません）。

## 5. 注意

- 個人情報のファイルです。作った zip は読み込みが済んだら消すか、安全な場所に置いてください。
- Gemini API キー・Google のログインなどの秘密は、書き出しにも読み込みにも入りません。
- 大きすぎる zip（目安 1GB 超）は、何回かに分けてください（スマホでは数百 MB までがおすすめ）。
