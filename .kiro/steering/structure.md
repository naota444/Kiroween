---
inclusion: always
---

# フォルダ構成

npm workspaces のモノレポにする。

```
Kiroween/            # リポジトリのルート(.kiro はここに置く)
├─ apps/
│  ├─ web/            # Vite + React。上下2画面の UI、キャンバス、部屋一覧
│  └─ local-server/   # ローカル開発用 WebSocket サーバー(core を呼ぶだけ)
├─ packages/
│  └─ core/           # 共通: メッセージ型、部屋ロジック、geohash、AI/保存の interface、ボット
├─ backend/
│  └─ lambdas/        # API Gateway WebSocket 用の Lambda(core を呼ぶだけ)
├─ infra/             # AWS CDK(TypeScript)
└─ docs/              # デモ台本、審査用の説明
```

## 命名

- ファイル: kebab-case(例: `room-service.ts`)
- React コンポーネント: PascalCase
- テスト: 対象と同じ場所に `*.test.ts`(Vitest)
