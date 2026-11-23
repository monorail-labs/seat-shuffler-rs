import { useState } from "react";
import { Bookmark, Save, Trash2 } from "lucide-react";
import { deserialize } from "./backup";
import type { AppState } from "./backup";
import { loadPresets, makePreset, storePresets } from "./presets";
import type { Preset } from "./presets";

interface Props {
  st: AppState;
  today: string;
  onLoad: (next: AppState) => void;
  notify: (msg: string, err?: boolean) => void;
}

const btn = "inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50";
const small = "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-100";

/** 名簿・レイアウト・履歴・設定・現在の配置を、名前を付けてアプリ内に保存・復元するメニュー */
export function PresetMenu({ st, today, onLoad, notify }: Props) {
  const [open, setOpen] = useState(false);
  const [presets, setPresets] = useState<Preset[]>(loadPresets);
  const [name, setName] = useState("");

  const commit = (list: Preset[], msg: string) => {
    try {
      storePresets(list);
      setPresets(list);
      notify(msg);
    } catch {
      notify("プリセットを保存できませんでした。不要なプリセットを削除してから再度お試しください。", true);
    }
  };

  const saveNew = () => {
    const n = name.trim() || st.data.title;
    const same = presets.find((p) => p.name === n);
    if (same) {
      if (!window.confirm(`プリセット「${n}」はすでにあります。上書きしますか？`)) return;
      commit(presets.map((p) => (p.id === same.id ? makePreset(n, st, p.id) : p)), `プリセット「${n}」を上書き保存しました`);
    } else {
      commit([makePreset(n, st), ...presets], `プリセット「${n}」を保存しました`);
    }
    setName("");
  };

  const overwrite = (p: Preset) => {
    if (!window.confirm(`プリセット「${p.name}」を現在の状態で上書きしますか？`)) return;
    commit(presets.map((x) => (x.id === p.id ? makePreset(p.name, st, p.id) : x)), `プリセット「${p.name}」を上書き保存しました`);
  };

  const remove = (p: Preset) => {
    if (!window.confirm(`プリセット「${p.name}」を削除しますか？`)) return;
    commit(presets.filter((x) => x.id !== p.id), `プリセット「${p.name}」を削除しました`);
  };

  const load = (p: Preset) => {
    try {
      const next = deserialize(p.contents, today);
      if (!window.confirm(`プリセット「${p.name}」（${p.summary}）を読み込みます。\n現在のデータは上書きされます。よろしいですか？`)) return;
      onLoad(next);
      setOpen(false);
      notify(`プリセット「${p.name}」を読み込みました`);
    } catch (e) {
      notify(e instanceof Error ? e.message : String(e), true);
    }
  };

  return (
    <div className="relative">
      <button className={btn} aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Bookmark className="size-4" />プリセット
      </button>
      {open && (
        <>
          {/* 外側クリックで閉じる */}
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-50 mt-1 w-96 space-y-3 rounded border border-slate-300 bg-white p-3 shadow-lg">
            <div>
              <label className="mb-1 block text-xs font-medium text-slate-600">現在の状態（名簿・レイアウト・履歴・設定・配置）を保存</label>
              <div className="flex gap-2">
                <input
                  className="min-w-0 flex-1 rounded border border-slate-300 px-1.5 py-1 text-sm focus:border-slate-700 focus:outline-none"
                  placeholder={st.data.title}
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && saveNew()}
                />
                <button className={btn} onClick={saveNew}><Save className="size-4" />保存</button>
              </div>
            </div>
            <ul className="max-h-80 space-y-1.5 overflow-y-auto border-t border-slate-200 pt-2">
              {presets.map((p) => (
                <li key={p.id} className="rounded border border-slate-200 p-2">
                  <div className="truncate text-sm font-bold text-slate-900">{p.name}</div>
                  <div className="text-xs text-slate-600">{p.summary}　保存 {p.savedAt}</div>
                  <div className="mt-1.5 flex gap-1.5">
                    <button className={small} onClick={() => load(p)}>読み込む</button>
                    <button className={small} onClick={() => overwrite(p)}>上書き保存</button>
                    <button aria-label={`プリセット「${p.name}」を削除`} className="ml-auto p-1 text-slate-500 hover:text-rose-700" onClick={() => remove(p)}>
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                </li>
              ))}
              {!presets.length && <li className="text-sm text-slate-600">保存したプリセットはまだありません。</li>}
            </ul>
          </div>
        </>
      )}
    </div>
  );
}
