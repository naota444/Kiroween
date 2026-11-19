# Doodle Nearby(仮称)

> A web app where nearby strangers break the ice by drawing, not typing.
> An AI facilitator reads the doodles and starts the conversation.
> Built with Kiro for **Kiroween 2026** (category: Resurrection).
>
> *This README is the team's working guide (in Japanese). It will be rewritten in English before submission.*

---

## 1. 何を作るか

近くにいる初対面の人同士が、**文字を使わず手描きの絵だけ**で交流できるスマホ向け Web アプリです。

1. アプリを開くと、位置情報(粗くてよい)から**近くの部屋**が一覧に出る
2. 部屋に入り、**下の画面**に指で絵を描いて送ると、**上の画面**(共有ボード)に出る
3. **AI 司会者**が絵を読み取り、「2人とも猫を描いていますね!」と共通点を見つけたり、協力お題を出したりする
4. 部屋を出るときに「交換カード」を受け取れる

詳しい方針は [`.kiro/steering/product.md`](.kiro/steering/product.md) にあります。

---

## 2. 締め切りと大事な規約

| 項目 | 内容 |
|---|---|
| **提出締め切り** | **2026-12-04 14:00 PT(日本時間 12/5 朝7時)**。チームの目標は **12/3 提出** |
| **Kiro クレジット申請** | **12/1 12:00 PT まで**(4,000クレジット)。3人とも早めに Devpost のページから申請する |
| リポジトリ | 公開 GitHub。ルートに `/.kiro` を置く(**`.gitignore` に入れない**)。ライセンスファイルが必要 |
| 動画 | 3分未満、YouTube で公開。他社の商標や著作権のある音楽は使わない |
| 言語 | 説明文・動画・テスト手順は**英語**(または英訳付き) |
| テスト用 URL | 審査員が無料で試せる URL を **2027-01-29 まで**動かし続ける |
| 新規性 | 2026-10-30 以降に始めた作品だけが対象。過去のコードは流用しない |
| 商標 | 作品・画面・説明文に**任天堂の名称を使わない**(ピクトチャット、すれちがい通信、脳トレ、モンハン、DS など) |

> 規約の正本は [Devpost の Rules](https://kiroween.devpost.com/rules) です。迷ったらここを確認してください。

---

## 3. 3人の分担

役割は「層」で分けます。Kiro の Spec が人ごとに分かれるので、作業がぶつかりにくくなります。

| 担当 | 担当者 | 主な Spec | 範囲 |
|---|---|---|---|
| **A: 画面と見た目** | (未定) | Spec 1(画面側)、Spec 4 | 上下2画面の UI、描画キャンバス、部屋一覧、デザイン、ハロウィン夜モード、動画編集 |
| **B: 通信と AWS** | naota444 | Spec 0、Spec 1(サーバー側)、Spec 3 | リポジトリの土台、CI/CD、WebSocket、DynamoDB、AWS CDK、費用の管理。**AWS プロジェクトのオーナー** |
| **C: AI と体験** | (未定) | Spec 2 | AI 司会者(Bedrock)、ボット参加者、交換カード、英語の README・ブログ |

### 共通の約束

- **WebSocket のメッセージ型(`packages/core`)が3人の約束ごと**です。変えるときは pull request で3人全員が確認します
- `.kiro/steering/` の変更も3人全員で確認します(Kiro の動き方が全員分変わるため)
- **1つの Spec は1人が担当**します。同じ Spec を2人で同時に動かさないでください
- 困ったら早めにチャットで共有します。1人で半日以上詰まったら必ず相談

---

## 4. 日程

| 期間 | やること | 主な担当 |
|---|---|---|
| 11/19〜20 | Spec 0(土台・メッセージ型・CI)。全員 Kiro を入れてクレジット申請 | B(全員で型を確認) |
| 11/21〜25 | Spec 1・2 をローカルで並行して作る → スマホ2台で通しの確認 | A・B・C |
| 11/26〜29 | Spec 3(AWS へのデプロイ)、AI を Bedrock に切り替え | B・C |
| 11/30 頃 | 勉強会などで実際に使って撮影し、数字を記録 | 全員 |
| 12/1〜3 | Spec 4(仕上げ)、英語の README、動画、**12/3 に提出** | A・C(B は本番環境の確認) |

> AWS のアップグレードは問い合わせ中です。**11/26 頃までに解決しない場合**は、A か C の AWS 環境を使うことを考えます(CDK で作るので、別の環境にもそのまま作れます)。

---

## 5. Kiro の始め方(初めての人向け)

### 5-1. 準備

1. [Kiro](https://kiro.dev/) をインストールしてサインインする
2. Devpost の Kiroween ページから **Kiro クレジットを申請**する(12/1 まで)
3. このリポジトリを clone する
   ```
   gh repo clone naota444/Kiroween
   ```
4. Kiro で `Kiroween` フォルダを開く

### 5-2. Kiro の3つの機能(この作品で使うもの)

| 機能 | 何をするか | このリポジトリでの場所 |
|---|---|---|
| **Steering** | Kiro が毎回読む「プロジェクトのルール」。作品の目的・技術方針・フォルダ構成を書いてある | `.kiro/steering/` |
| **Spec** | 大きな機能を「要件 → 設計 → タスク」の順に Kiro と一緒に作る | `.kiro/specs/<名前>/`(Kiro が作る) |
| **Hooks** | 「ファイルを保存したらテストを実行」などの自動処理 | `.kiro/hooks/`(Kiro が作る) |

審査では「Kiro をどう使ったか」も見られるので、**Spec と Hooks はできるだけ Kiro の機能で作り、`.kiro/` に残してください**。

### 5-3. Spec の進め方

1. Kiro のチャットで **Spec** を選ぶ
2. [`KIRO_PROMPTS.md`](KIRO_PROMPTS.md) から自分の担当の Spec のプロンプトを貼る
3. Kiro が `requirements.md`(要件)を作る → 読んで、違うところはチャットで直してもらう → OK を出す
4. `design.md`(設計)も同じように確認する
5. `tasks.md`(タスク一覧)ができたら、上から順に1つずつ実行する
6. タスクが1〜2個終わるごとに動作確認し、commit する

> **コツ**: Kiro が作った要件や設計は必ず読みましょう。ここで直すほうが、コードを直すよりずっと楽です。

### 5-4. 自分の担当のプロンプト

| 担当 | 流すもの(`KIRO_PROMPTS.md` 内) |
|---|---|
| A | Spec 1 のうち画面側(apps/web)、Spec 4 |
| B | Spec 0、Spec 1 のうちサーバー側(packages/core、apps/local-server)、Spec 3 |
| C | Spec 2、Hooks 4つ |

> Spec 1 は A と B で分けて作ります。B が Spec 1 の requirements と design を作って3人で確認し、`tasks.md` を「画面」と「サーバー」に分けて担当します。

---

## 6. GitHub での進め方

### ブランチと pull request

1. `main` から作業用のブランチを作る(名前は `担当/内容`)
   ```
   git switch main
   git pull
   git switch -c a/canvas
   ```
2. 作業して commit する
3. push して pull request を作る
   ```
   git push -u origin a/canvas
   gh pr create
   ```
4. **CI が緑になり、1人がレビューで OK** したら main にマージする(Squash merge)

### ルール

- `main` には直接 push しない(ブランチ保護を設定します)
- pull request の説明には「どの Spec のどのタスクか」と「どう確認したか」を書く
- `.kiro/` フォルダは**消さない・無視しない**(提出に必要です)
- 秘密情報(AWS のキーなど)は絶対に commit しない

### CI/CD(Spec 0 で作ります)

| タイミング | 動くもの |
|---|---|
| pull request を出したとき | lint、型チェック、テスト、`cdk synth` |
| main にマージしたとき | AWS へ自動デプロイ(AWS の準備ができてから有効にする) |

AWS への認証は GitHub OIDC を使い、アクセスキーは GitHub に保存しません。本番環境は1つだけにして、個人の確認はローカルで行います。

---

## 7. ローカルでの動かし方

> Spec 0・1 が終わったら、ここに手順を書きます。

---

## 8. フォルダ構成

```
Kiroween/
├─ .kiro/
│  ├─ steering/      # Kiro が毎回読むルール(product / tech / structure / aws-starter-rules)
│  ├─ specs/         # Spec(Kiro が作る)
│  └─ hooks/         # Hooks(Kiro が作る)
├─ apps/
│  ├─ web/           # 画面(Vite + React)
│  └─ local-server/  # ローカル用 WebSocket サーバー
├─ packages/core/    # 共通のメッセージ型・部屋のロジック・AI とボット
├─ backend/lambdas/  # AWS Lambda
├─ infra/            # AWS CDK
├─ docs/             # デモ台本・デプロイ手順
└─ KIRO_PROMPTS.md   # Kiro に貼るプロンプト集
```

---

## 9. 提出前チェックリスト

- [ ] リポジトリを **public** にした
- [ ] ルートに `/.kiro` がある(`.gitignore` に入っていない)
- [ ] LICENSE があり、GitHub の About 欄にライセンスが表示されている
- [ ] README を英語にした(機能、Kiro の使い方、起動方法)
- [ ] 審査員が無料で試せる URL があり、1台でもデモモードで全機能を見られる
- [ ] 動画は3分未満、YouTube で公開、英語字幕あり、他社の商標・音楽なし
- [ ] 画面・説明文・動画に任天堂の名称がない
- [ ] Kiro の使い方(Spec / Steering / Hooks)を説明文に書いた
- [ ] AWS の費用上限と、1/29 まで動かし続ける準備ができている
