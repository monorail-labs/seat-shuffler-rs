import { useState } from "react";
import { Bookmark, ChevronDown, Eye, GraduationCap, History, Printer, Save } from "lucide-react";
import type { PresetsApi } from "./usePresets";
import type { View } from "./types";

interface Props {
  presets: PresetsApi;
  /** プリセットが未選択のときの保存ボタン：プリセット管理タブを開く */
  openPresetTab: () => void;
  view: View;
  setView: (v: View) => void;
  canCommit: boolean;
  addHistory: () => void;
  printAs: (v: View) => void;
}

const btn =
  "inline-flex shrink-0 items-center gap-1.5 whitespace-nowrap rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50";

/**
 * 最上部バー。プリセットの切り替えを中心に、よく使う操作だけを1行に置く。
 * 800px 幅でも折り返さないよう、ここに置くボタンは増やさない（ほかの操作は設定パネルのタブへ）
 */
export function Header({ presets, openPresetTab, view, setView, canCommit, addHistory, printAs }: Props) {
  const { active } = presets;
  const seg = (v: View) =>
    `inline-flex items-center gap-1.5 whitespace-nowrap px-2.5 py-1.5 text-sm ${view === v ? "bg-slate-900 font-bold text-white" : "bg-white text-slate-800 hover:bg-slate-100"}`;

  return (
    <header className="flex items-center gap-2 border-b border-slate-300 bg-slate-50 px-3 py-1.5 print:hidden">
      <div className="flex min-w-0 items-center gap-1.5">
        <Bookmark aria-hidden className="size-4 shrink-0 text-slate-600" />
        <select
          aria-label="プリセット"
          className="w-52 min-w-24 shrink rounded border border-slate-300 bg-white px-1.5 py-1.5 text-sm text-slate-900 focus:border-slate-700 focus:outline-none"
          value={active?.id ?? ""}
          onChange={(e) => {
            // 確認ダイアログでキャンセルされたら active は変わらず、表示も元に戻る
            const p = presets.presets.find((x) => x.id === e.target.value);
            if (p) presets.load(p);
          }}
        >
          <option value="" disabled>
            {presets.presets.length ? "プリセットを選択" : "プリセットなし"}
          </option>
          {presets.presets.map((p) => (
            <option key={p.id} value={p.id}>{p.name}</option>
          ))}
        </select>
        <button
          className={btn}
          title={active ? `「${active.name}」に現在の状態を上書き保存` : "新しいプリセットとして保存（データ > プリセット）"}
          onClick={() => (active ? presets.overwrite(active) : openPresetTab())}
        >
          <Save className="size-4" />保存
        </button>
      </div>

      <div className="ml-auto flex items-center gap-2">
        <div className="inline-flex shrink-0 overflow-hidden rounded border border-slate-300" role="group" aria-label="視点切り替え">
          <button className={seg("student")} title="生徒視点（黒板が上）" aria-pressed={view === "student"} onClick={() => setView("student")}>
            <Eye className="size-4" />生徒視点
          </button>
          <button className={`${seg("teacher")} border-l border-slate-300`} title="先生視点（教卓が下）" aria-pressed={view === "teacher"} onClick={() => setView("teacher")}>
            <GraduationCap className="size-4" />先生視点
          </button>
        </div>
        <button className={btn} disabled={!canCommit} onClick={addHistory}><History className="size-4" />履歴に追加</button>
        <PrintMenu printAs={printAs} />
      </div>
    </header>
  );
}

function PrintMenu({ printAs }: { printAs: (v: View) => void }) {
  const [open, setOpen] = useState(false);
  const item = "flex w-full items-center gap-2 whitespace-nowrap px-3 py-2 text-left text-sm text-slate-800 hover:bg-slate-100";
  const pick = (v: View) => {
    setOpen(false);
    printAs(v);
  };
  return (
    <div className="relative">
      <button className={btn} aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen((o) => !o)}>
        <Printer className="size-4" />印刷<ChevronDown className="size-3.5" />
      </button>
      {open && (
        <>
          {/* 外側クリックで閉じる */}
          <div className="fixed inset-0 z-40" aria-hidden onClick={() => setOpen(false)} />
          <div role="menu" className="absolute right-0 z-50 mt-1 overflow-hidden rounded border border-slate-300 bg-white py-1 shadow-lg">
            <button role="menuitem" className={item} onClick={() => pick("student")}>生徒用（黒板が上）</button>
            <button role="menuitem" className={item} onClick={() => pick("teacher")}>先生用（教卓が下）</button>
          </div>
        </>
      )}
    </div>
  );
}
