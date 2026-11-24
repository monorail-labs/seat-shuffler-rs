# seat-shuffler

> 制約充足問題（CSP）ソルバーを搭載した、教育現場向け座席配置最適化デスクトップアプリケーション。

[![Tauri v2](https://img.shields.io/badge/Tauri-v2-blue.svg?logo=tauri)](https://tauri.app/)
[![Rust](https://img.shields.io/badge/Rust-1.96+-orange.svg?logo=rust)](https://www.rust-lang.org/)
[![React](https://img.shields.io/badge/React-19-61DAFB.svg?logo=react)](https://react.dev/)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-v4-38B2AC.svg?logo=tailwind-css)](https://tailwindcss.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

---

## 概要 (Overview)

`seat-shuffler` は、学校教育現場における複雑な制約条件（視力配慮、生徒同士のトラブル防止、過去履歴の重複排除、留学・固定席対応など）を数理的にモデル化し、ミリ秒単位で最適な座席配置を算出・帳票印刷するデスクトップアプリケーションです。

従来のExcelマクロや手作業による座席決定で発生していた人的コストや組合せ競合を排除し、非ITユーザーである教員でも直感的に操作できる人間中心のUI/UXを提供します。

---

## 主要機能 (Features)

### 1. 数理的アルゴリズム層 (Core Solver)
- **制約充足問題（CSP）と MRV ヒューリスティクス**:
  - 最小残余値（Minimum Remaining Values）ヒューリスティクスに基づき、最も選択肢が狭い生徒から優先的に配置を確定する高速探索エンジン。
- **チェビシェフ距離（$L_\infty \ge 2$）によるグループ分離制約**:
  - トラブル防止や私語防止のため、指定した複数人グループのメンバー同士が「縦・横・斜め」の8近傍に隣接しない配置を保証。
- **左右の隣席ペア制約（通路を挟まない）**:
  - 指定した2人を同じ行の左右に隣り合う席へ配置。ペアを他の生徒より先に置く構成的探索により、ランダム試行に頼らず確実に満たす。
- **固定席（Fixed Seat）の最優先割り当て**:
  - 留学中や身体的配慮による特定座席の固定に対応。探索ドメインを1点に縮小することで、探索計算量を削減しながら自然に解空間を統合。
- **履歴追跡による公平性の担保**:
  - 過去の座席配置履歴を保持し、同一生徒が同じ座席に連続して着席することを防止。

### 2. 現場特化の業務UI/UX (Frontend & UX)
- **教員視点（180度反転）と生徒視点のシームレス切替**:
  - 教室後方から見上げる「生徒視点（黒板が上）」と、教卓から見渡す実視界と完全一致する「先生視点（教卓が下・180度アフィン反転）」をワンクリックで切り替え可能。
- **座席レイアウトの個別マス編集**:
  - 列単位での通路設定に加え、人数の端数や教室形状に応じたピンポイントの「空席（机なし / -1）」トグル機能を搭載。座席番号は左上から自動連番でリナンバリング。
- **プリセット（名前付き保存）**:
  - 名簿・レイアウト・履歴・設定・現在の配置をまとめて名前を付けてアプリ内に保存し、いつでも読み込み・上書き・削除が可能。クラスや授業ごとの切り替えに対応。
- **Excel からの名簿一括コピペ登録**:
  - カンマまたはタブ区切りの名簿データ（番号、ローマ字、性別、氏名）をクリップボードから直接一括インポート可能。
- **公的帳票レイアウト ＆ A4印刷・PDF最適化**:
  - 考査用・選択授業用に対応する自由なタイトル入力。
  - 男女別生徒数（`男: X名　女: Y名　計: Z名`）の自動集計フッター。
  - `@media print` により、操作UIを隠蔽してA4用紙（横）にジャストフィットするハイコントラスト印刷スタイルを標準装備。
- **安全な自動アップデート機構 (Auto-Updater)**:
  - 公開鍵暗号（Minisign）による電子署名検証と GitHub Releases 連携を内蔵。ワンクリックでバックグラウンド自己置換アップデートを実行。
  - アップデート後の初回起動時に、そのバージョンの変更内容（新機能・改善・修正）を一度だけ表示。過去の更新内容は画面左下の「更新内容」からいつでも確認可能。
  - リリースノートは `src/releaseNotes.json` に一元管理し、`scripts/bump.mjs` は記入漏れを検出して停止、`scripts/release-notes.mjs` で GitHub Releases 用の Markdown を生成。

---

## アーキテクチャ設計思想 (Design Rationale)

1. **正の制約（生成関数）と負の制約（判定関数）の完全分離**:
   - 「どこにならなければならないか」（前列指定、未経験座席など）は探索前のドメイン縮小（生成関数）で空間を圧縮。
   - 「どこになってはいけないか」（グループ分離など）は生成解に対する純粋関数（述語フィルター）で刈り取る二段構えの疎結合設計。
2. **データの単一情報源 (Single Source of Truth)**:
   - 生徒数や最大座席番号、前列有効範囲を設定ファイルに多重記述させず、名簿配列長や座席グリッド構造から動的に導出。設定の不整合によるバグを構造的に防止。
3. **道具としての機能美**:
   - 目的のないアニメーションや装飾的グラデーションを排除し、高コントラストなスレートグレーを基調とした業務特化のライトテーマを採用。

---

## 技術スタック (Tech Stack)

| レイヤー | 技術 | 用途 |
|---|---|---|
| **OS統合・ランタイム** | **Tauri v2** | ネイティブウィンドウ管理、IPC通信、Auto-Updater |
| **コアソルバー** | **Rust 1.96+** | CSP探索エンジン、幾何距離判定、高速リトライ |
| **フロントエンド** | **React 19 / TypeScript** | 状態管理、動的レンダリング、一括パース |
| **スタイリング** | **Tailwind CSS v4** | ユーティリティファースト、A4印刷スタイル最適化 |
| **アイコン** | **Lucide React** | 業務視認性に特化したSVGアイコン |
| **ビルドツール** | **Vite** | 超高速バンドル、HMR |

---

## 開発と実行 (Getting Started)

### 前提条件
- Node.js 20+
- Rust 1.80+ (および C++ Build Tools)

### 開発環境の起動
```bash
# 依存関係のインストール
npm install

# Tauri 開発サーバーの起動 (HMR & Native Window)
npm run tauri dev
```

### プロダクションビルド
```bash
# 配布用インストーラー (.msi / .exe) の生成
npm run tauri build
```

---

## データモデル仕様 (Data Schema)

設定は `localStorage` に自動永続化されます。テスト・検証用の設定サンプルはリポジトリ直下の `config_sample.json` を参照してください。

```typescript
export interface Student {
  student_no: string;         // 表示用名簿番号（合同授業用 "2-15" 等に対応）
  name: string;               // 漢字氏名
  romaji: string;             // ローマ字氏名
  gender: string;             // "男" | "女"
  is_dorm: boolean;           // 寮生フラグ
  is_abroad: boolean;         // 留学中フラグ
  fixed_seat: number | null;  // 固定座席番号（0始まり）
}

export interface Data {
  title: string;              // 座席表タイトル（例: "2年3組 座席表（考査用）"）
  teacher_name: string | null;
  sub_teacher_name: string | null;
  front_rows: number;         // 前列指定生徒が着席可能な行数
  seat_model: number[][];     // 教室グリッド（-1 = 通路・空席、0..N = 座席番号）
  students: Student[];
  history: number[][];        // 過去の座席配置履歴
  front_student_num: number[];// 前列希望生徒のインデックス
  separation_groups: number[][]; // 互いに離す生徒インデックスのグループ配列
  adjacent_pairs: [number, number][]; // 左右の隣（通路を挟まない）に座らせる生徒インデックスの組
}
```

---

## ライセンス (License)

MIT License © 2026 fushiginoko
