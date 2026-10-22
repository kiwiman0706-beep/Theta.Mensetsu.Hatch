# 応募者ノートの形式（Theta Vault / Obsidian）

`Theta Vault/Mensetsu/Applicants/山田 花子（看護師）.md`。共通の決まりは [`THETA_VAULT_SPEC.md`](THETA_VAULT_SPEC.md)。

```markdown
---
rev: 9c1e0b7a2f44
theta: mensetsu/applicant@1
id: 2b6f3c1e-…
name: 山田 花子
kana: やまだ はなこ
birth_date: 1995-04-12
category: 看護師
position: 病棟看護師（夜勤可）
employment: 常勤
stage: scheduled          # received / scheduled / interviewed / hold / offered / hired / rejected / declined（日本語名でも可）
rating: "4"
decided: 2026-11-10       # 採否決定日
decision_note: |-
  内定。11/10 電話で連絡済み
hire_date: 2027-04-01
department: 3階東病棟
applied: 2026-10-20
source: 紹介会社
agency: ○○メディカルキャリア
agency_contact: 担当 田中 03-…
agency_fee: |-
  理論年収の20%
  3か月以内の退職は返金
interview: 2026-11-05 14:00
interviewers: 看護部長
start_date: 2027-04-01
commute: 公共交通 約35分 ・ JR中央線 … （概算 2026-10-22）
commute_cost: 定期 1か月 約6,000円・片道 180円 （概算 2026-10-22）
postal: 160-0000
address: 東京都…
phone: [03-…]
mobile: [090-…]
email: [hanako@example.com]
education: |-
  2013-04 ○○看護専門学校 看護学科 入学
  2016-03 同 卒業
career: |-
  2016-04 ○○病院 内科病棟 看護師 入職
licenses: |-
  2016-05 看護師免許
motivation: …
self_pr: …
wishes: …
tags: [経験者, 夜勤可]
status: confirmed         # 読み取りの状態（new / review / confirmed）
contact_registered: true
google_contact: people/c123…           # どのPCからでも同じ連絡先を更新できる
google_contact_account: hr@example.com
created: …
updated: …
pages: [Mensetsu/_files/…-0.jpg, …]
originals: [{file: Mensetsu/_files/….pdf, name: 履歴書.pdf, sha256: …}]
portrait: Mensetsu/_files/….jpg
portrait_source: resume   # 無ければ手動で選んだ写真（自動では置き換えない）
documents:
- {id: …, date: 2026-10-21, kind: 免許証・資格証の写し, title: 看護師免許, files: [...], originals: [...]}
recordings:
- {id: …, file: Mensetsu/_files/….webm, time: …, seconds: 1501, title: 一次面接, summary: …, transcript: …}
sketches:
- {id: …, file: Mensetsu/_files/….png, strokes: Mensetsu/_files/….json, time: …, title: 一次面接, text: （Geminiで読み取った文字）}
evaluations:
- {id: …, date: 2027-09-30, period: 試用期間, evaluator: 看護部長, score: A, text: …}
---

![[Mensetsu/_files/….jpg|120]] ![[Mensetsu/_files/…-0.jpg|360]]

## 面接メモ
- 2026-11-05 14:40 受け答えが丁寧。夜勤の経験あり ^9b1f…

## 手書きメモ
- 2026-11-05 14:10 一次面接
  ![[Mensetsu/_files/….png|480]]

## 採用手続き
- [x] 入職前の健康診断（健康診断書の提出） 📅 2026-11-20 — 原本受領 ^c1…
- [ ] 免許証の原本確認・写しの提出 ^c2…

## 面接の録音
- ![[Mensetsu/_files/….webm]] 2026-11-05 14:00（25分1秒）一次面接
  ・夜勤可 …

> [!note]- 文字起こし
> 面接官: …

## 職員評価
| 日付 | 期間 | 評価者 | 評価 | 所見 |

## 書類
| 日付 | 種類 | 書類 | ファイル |

## 履歴書の全文
（Geminiが読み取った全文）

<!-- ここから下は自由に書けます（アプリは変更しません） -->
```

| 部分 | Obsidianでの編集 |
| --- | --- |
| frontmatter | 可（アプリが取り込む）。知らない項目は保持 |
| `## 面接メモ`・`## 採用手続き`・`## 履歴書の全文` | 可（取り込む）。採用手続きは `- [ ]` / `- [x]` のチェックをObsidianで付け外しでき、行を足すと項目が増える |
| `## 手書きメモ`・`## 面接の録音`・`## 職員評価`・`## 書類`・画像の行 | frontmatterから生成（表示用。編集は次の保存で上書き） |
| 自由記述の部分・自分で足した見出し | 自由（アプリは触らない） |

端末固有の情報（読み取り待ち・Geminiの未確認の結果など）はノートに入れず、各PCの設定フォルダに置きます。
