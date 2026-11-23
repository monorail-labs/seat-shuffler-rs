import { serialize } from "./backup";
import type { AppState } from "./backup";

/** 名前を付けてアプリ内に保存した状態。中身はエクスポートと同じ JSON 文字列 */
export interface Preset {
  id: string;
  name: string;
  savedAt: string;
  summary: string; // 一覧表示用（例: 生徒 30 名・履歴 2 回）
  contents: string;
}

const KEY = "seating-app-presets";

export function loadPresets(): Preset[] {
  try {
    const raw = localStorage.getItem(KEY);
    const list: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? (list as Preset[]) : [];
  } catch {
    return []; // 壊れた保存データは無視する
  }
}

/** 保存に失敗した（容量不足など）ときは例外を投げる */
export function storePresets(list: Preset[]): void {
  localStorage.setItem(KEY, JSON.stringify(list));
}

export function makePreset(name: string, st: AppState, id: string = crypto.randomUUID()): Preset {
  return {
    id,
    name,
    savedAt: new Date().toLocaleString("ja-JP"),
    summary: `生徒 ${st.data.students.length} 名・履歴 ${st.data.history.length} 回`,
    contents: serialize(st),
  };
}
