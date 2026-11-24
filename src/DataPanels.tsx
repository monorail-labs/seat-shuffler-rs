import { useState } from "react";
import { Download, Save, Trash2, Upload } from "lucide-react";
import type { PresetsApi } from "./usePresets";

const inp = "min-w-0 flex-1 rounded border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-900 focus:border-slate-700 focus:outline-none";
const btn = "inline-flex shrink-0 items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100";
const small = "rounded border border-slate-300 bg-white px-2 py-1 text-xs text-slate-800 hover:bg-slate-100";

/** データ > プリセット：名前を付けた保存と、一覧からの読み込み・上書き・削除 */
export function PresetManager({ api, title }: { api: PresetsApi; title: string }) {
  const [name, setName] = useState("");
  const save = async () => {
    await api.saveNew(name);
    setName("");
  };

  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">
        名簿・レイアウト・履歴・設定・現在の配置をまとめて、名前を付けてこのパソコンに保存します。切り替えは画面上部のプルダウンからもできます。
      </p>
      <div>
        <label htmlFor="preset-name" className="mb-1 block text-xs font-medium text-slate-600">現在の状態を新しいプリセットとして保存</label>
        <div className="flex gap-2">
          <input id="preset-name" className={inp} placeholder={title} value={name}
            onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} />
          <button className={btn} onClick={save}><Save className="size-4" />保存</button>
        </div>
      </div>

      <ul className="space-y-1.5">
        {api.presets.map((p) => (
          <li key={p.id} className={`rounded border bg-white p-2 ${p.id === api.active?.id ? "border-slate-700" : "border-slate-300"}`}>
            <div className="flex items-baseline gap-2">
              <span className="truncate text-sm font-bold text-slate-900">{p.name}</span>
              {p.id === api.active?.id && <span className="shrink-0 rounded-sm bg-slate-800 px-1.5 text-xs text-white">使用中</span>}
            </div>
            <div className="text-xs text-slate-600">{p.summary}　保存 {p.savedAt}</div>
            <div className="mt-1.5 flex gap-1.5">
              <button className={small} onClick={() => api.load(p)}>読み込む</button>
              <button className={small} onClick={() => api.overwrite(p)}>上書き保存</button>
              <button aria-label={`プリセット「${p.name}」を削除`} className="ml-auto p-1 text-slate-500 hover:text-rose-700" onClick={() => api.remove(p)}>
                <Trash2 className="size-4" />
              </button>
            </div>
          </li>
        ))}
        {!api.presets.length && <li className="text-sm text-slate-600">保存したプリセットはまだありません。</li>}
      </ul>
    </div>
  );
}

/** データ > インポート/エクスポート：JSON ファイルでのやり取り（ほかのパソコンへの移行・バックアップ用） */
export function BackupPanel({ importData, exportData }: { importData: () => void; exportData: () => void }) {
  return (
    <div className="space-y-4">
      <section className="space-y-1.5">
        <h3 className="text-sm font-bold text-slate-800">エクスポート</h3>
        <p className="text-xs text-slate-600">名簿・レイアウト・履歴・現在の配置を JSON ファイルに保存します。ほかのパソコンへの移行やバックアップに使えます。</p>
        <button className={btn} onClick={exportData}><Download className="size-4" />エクスポート</button>
      </section>
      <section className="space-y-1.5 border-t border-slate-300 pt-4">
        <h3 className="text-sm font-bold text-slate-800">インポート</h3>
        <p className="text-xs text-slate-600">エクスポートした JSON ファイルを読み込みます。現在のデータは上書きされます（読み込む前に確認します）。</p>
        <button className={btn} onClick={importData}><Upload className="size-4" />インポート</button>
      </section>
    </div>
  );
}
