---
inclusion: always
---

# Git のルール

- タスクを1つ終えて、チェック(build、typecheck、lint、test)が通ったら、先に tasks.md でそのタスクを完了にし、そのあとで変更をコミットする
- コミットメッセージの1行目は英語で「Task <番号>: <要約>」(例: Task 3.1: define WebSocket message types)。2行目は空行、3行目以降に変更点と確認した内容を書く
- tasks.md と tasks.meta.json の変更も、そのタスクのコミットに含める
- git add . は使わず、変更したファイルを指定して add する。一時ファイル(ログなど)はコミットしない
- push と pull request の作成は、指示があったときだけ行う
- Spec(requirements.md、design.md、tasks.md)を直したときは、その修正だけで別のコミットにする
