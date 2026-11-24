import { useState } from "react";
// window.confirm は dialog プラグインに非同期関数へ差し替えられるため、必ずこちらを await して使う
import { confirm } from "@tauri-apps/plugin-dialog";
import { deserialize } from "./backup";
import type { AppState } from "./backup";
import { loadPresets, makePreset, storePresets } from "./presets";
import type { Preset } from "./presets";

const ACTIVE_KEY = "seating-app-active-preset";

export interface PresetsApi {
  presets: Preset[];
  /** 最後に読み込んだ・保存したプリセット（ヘッダーのプルダウンに表示する） */
  active: Preset | null;
  saveNew: (name: string) => Promise<void>;
  overwrite: (p: Preset) => Promise<void>;
  remove: (p: Preset) => Promise<void>;
  load: (p: Preset) => Promise<void>;
}

const ask = (message: string) => confirm(message, { title: "プリセット", kind: "warning" });

function loadActiveId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_KEY);
  } catch {
    return null;
  }
}

/**
 * プリセットの一覧と操作。上書き・削除・読み込みは必ず確認ダイアログを通す。
 * ヘッダーのプルダウンと「データ > プリセット」タブで同じ状態を共有する
 */
export function usePresets(
  st: AppState,
  today: string,
  onLoad: (next: AppState) => void,
  notify: (msg: string, err?: boolean) => void,
): PresetsApi {
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [activeId, setActiveIdState] = useState<string | null>(loadActiveId);

  const setActiveId = (id: string | null) => {
    setActiveIdState(id);
    try {
      if (id) localStorage.setItem(ACTIVE_KEY, id);
      else localStorage.removeItem(ACTIVE_KEY);
    } catch {
      /* 保存できなくても動作には影響しない */
    }
  };

  /** 一覧を保存する。容量不足などで失敗したら false */
  const commit = (list: Preset[], msg: string): boolean => {
    try {
      storePresets(list);
      setPresets(list);
      notify(msg);
      return true;
    } catch {
      notify("プリセットを保存できませんでした。不要なプリセットを削除してから再度お試しください。", true);
      return false;
    }
  };

  const replace = (target: Preset) => presets.map((p) => (p.id === target.id ? makePreset(target.name, st, target.id) : p));

  const saveNew = async (name: string) => {
    const n = name.trim() || st.data.title;
    const same = presets.find((p) => p.name === n);
    if (same) {
      if (!(await ask(`プリセット「${n}」はすでにあります。上書きしますか？`))) return;
      if (commit(replace(same), `プリセット「${n}」を上書き保存しました`)) setActiveId(same.id);
      return;
    }
    const created = makePreset(n, st);
    if (commit([created, ...presets], `プリセット「${n}」を保存しました`)) setActiveId(created.id);
  };

  const overwrite = async (p: Preset) => {
    if (!(await ask(`プリセット「${p.name}」を現在の状態で上書きしますか？`))) return;
    if (commit(replace(p), `プリセット「${p.name}」を上書き保存しました`)) setActiveId(p.id);
  };

  const remove = async (p: Preset) => {
    if (!(await ask(`プリセット「${p.name}」を削除しますか？`))) return;
    if (commit(presets.filter((x) => x.id !== p.id), `プリセット「${p.name}」を削除しました`) && p.id === activeId) setActiveId(null);
  };

  const load = async (p: Preset) => {
    try {
      const next = deserialize(p.contents, today);
      if (!(await ask(`プリセット「${p.name}」（${p.summary}）を読み込みます。\n現在のデータは上書きされます。よろしいですか？`))) return;
      onLoad(next);
      setActiveId(p.id);
      notify(`プリセット「${p.name}」を読み込みました`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  };

  const active = presets.find((p) => p.id === activeId) ?? null;
  return { presets, active, saveNew, overwrite, remove, load };
}
