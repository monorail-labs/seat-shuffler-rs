import { useEffect, useState } from "react";
import { Loader2, Plus, Shuffle, Trash2, X } from "lucide-react";
import { makeSeatModel, newStudent, seatCount } from "./types";
import { UpdateChecker } from "./UpdateChecker";
import type { Data, Student } from "./types";

type Patch = (f: (d: Data) => Data, clearSeats?: boolean) => void;
interface Props {
  data: Data;
  patch: Patch;
  run: () => void;
  busy: boolean;
}

const inp =
  "w-full rounded border border-slate-300 bg-white px-1.5 py-1 text-sm text-slate-900 focus:border-slate-700 focus:outline-none";
const lbl = "mb-1 block text-xs font-medium text-slate-600";
const btn2 =
  "inline-flex items-center gap-1 rounded border border-slate-300 bg-white px-2.5 py-1.5 text-sm text-slate-800 hover:bg-slate-100";

export function Sidebar({ data, patch, run, busy }: Props) {
  const [tab, setTab] = useState<"basic" | "roster" | "groups">("basic");
  const tabs = [
    ["basic", "基本設定"],
    ["roster", `名簿（${data.students.length}）`],
    ["groups", `離すグループ（${data.separation_groups.length}）`],
  ] as const;
  // バックエンドの仕様（有効座席数 = 生徒数）と同じ条件で実行を止める
  const seats = seatCount(data.seat_model);
  const blocker = !data.students.length
    ? "名簿が空です。生徒を追加してください。"
    : seats !== data.students.length
      ? `有効な座席数(${seats})と生徒数(${data.students.length})が一致していません。レイアウトの座席数を調整してください。`
      : null;

  return (
    <aside className="flex w-120 shrink-0 flex-col border-r border-slate-300 bg-slate-50 print:hidden">
      <div role="tablist" className="flex border-b border-slate-300 bg-white">
        {tabs.map(([k, t]) => (
          <button
            key={k}
            role="tab"
            aria-selected={tab === k}
            onClick={() => setTab(k)}
            className={`flex-1 border-b-2 px-2 py-2.5 text-sm ${tab === k ? "border-slate-900 font-bold text-slate-900" : "border-transparent text-slate-600 hover:bg-slate-100"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {tab === "basic" && <Basic data={data} patch={patch} />}
        {tab === "roster" && <Roster data={data} patch={patch} />}
        {tab === "groups" && <Groups data={data} patch={patch} />}
      </div>

      <div className="border-t border-slate-300 bg-white p-3 space-y-2">
        {blocker && (
          <p role="alert" className="rounded border border-rose-400 bg-rose-50 px-2.5 py-1.5 text-xs font-bold text-rose-800">
            {blocker}
          </p>
        )}
        <button
          onClick={run}
          disabled={busy || blocker !== null}
          className="flex w-full items-center justify-center gap-2 rounded bg-slate-900 py-3 text-base font-bold text-white hover:bg-slate-700 disabled:opacity-60"
        >
          {busy ? <Loader2 className="size-5 animate-spin" /> : <Shuffle className="size-5" />}
          席替えを実行する
        </button>
        <UpdateChecker />
      </div>
    </aside>
  );
}

function Basic({ data, patch }: Omit<Props, "run" | "busy">) {
  const rows = data.seat_model.length;
  const cols = data.seat_model[0]?.length ?? 0;
  // 全行が空白の列だけを「通路列」として表示（個別セル編集と矛盾させない）
  const aisleOf = (m: number[][]) =>
    (m[0] ?? []).map((_, j) => (m.every((row) => row[j] < 0) ? j + 1 : 0)).filter(Boolean).join(",");
  const [r, setR] = useState(rows);
  const [c, setC] = useState(cols);
  const [aisle, setAisle] = useState(aisleOf(data.seat_model));
  // マスのクリックでレイアウトが変わったら入力欄も追従させる
  useEffect(() => {
    setR(data.seat_model.length);
    setC(data.seat_model[0]?.length ?? 0);
    setAisle(aisleOf(data.seat_model));
  }, [data.seat_model]);
  const seats = seatCount(data.seat_model);
  const mismatch = seats !== data.students.length;

  return (
    <div className="space-y-5">
      <div>
        <label className={lbl}>座席表タイトル</label>
        <input className={inp} value={data.title} onChange={(e) => patch((d) => ({ ...d, title: e.target.value }))} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className={lbl}>担任</label>
          <input className={inp} value={data.teacher_name ?? ""} onChange={(e) => patch((d) => ({ ...d, teacher_name: e.target.value || null }))} />
        </div>
        <div>
          <label className={lbl}>副担任</label>
          <input className={inp} value={data.sub_teacher_name ?? ""} onChange={(e) => patch((d) => ({ ...d, sub_teacher_name: e.target.value || null }))} />
        </div>
      </div>
      <div>
        <label className={lbl}>前列の範囲（前から何列＝前列指定の生徒が座れる行数）</label>
        <input type="number" min={1} max={rows} className={`${inp} w-24`} value={data.front_rows}
          onChange={(e) => patch((d) => ({ ...d, front_rows: Math.max(0, Number(e.target.value)) }))} />
      </div>

      <fieldset className="space-y-2 border-t border-slate-300 pt-4">
        <legend className="pr-2 text-sm font-bold text-slate-800">座席レイアウト</legend>
        <div className="grid grid-cols-3 gap-3">
          <div><label className={lbl}>行数</label><input type="number" min={1} className={inp} value={r} onChange={(e) => setR(Number(e.target.value))} /></div>
          <div><label className={lbl}>列数</label><input type="number" min={1} className={inp} value={c} onChange={(e) => setC(Number(e.target.value))} /></div>
          <div><label className={lbl}>通路にする列</label><input className={inp} placeholder="例: 4" value={aisle} onChange={(e) => setAisle(e.target.value)} /></div>
        </div>
        <p className={`text-xs ${mismatch ? "font-bold text-rose-700" : "text-slate-600"}`}>
          座席 {seats} 席 / 生徒 {data.students.length} 名{mismatch && "（席数と人数を一致させてください）"}
        </p>
        <p className="text-xs text-slate-600">
          1席ずつの追加・削除は、画面上部の「レイアウト変更モード」をオンにしてマスをクリックします。
        </p>
        <button
          className={btn2}
          onClick={() => {
            const a = aisle.split(/[,、\s]+/).map((x) => Number(x) - 1).filter((x) => x >= 0);
            patch((d) => ({ ...d, seat_model: makeSeatModel(r, c, a), history: [], front_student_num: d.front_student_num }), true);
          }}
        >
          レイアウトを一括生成（個別に変えた席・履歴もリセット）
        </button>
      </fieldset>

      <fieldset className="space-y-2 border-t border-slate-300 pt-4">
        <legend className="pr-2 text-sm font-bold text-slate-800">過去の配置（履歴 {data.history.length} 回）</legend>
        <p className="text-xs text-slate-600">履歴にある席には、その生徒は再び座りません。席替え後、配置を確定するには画面上部の「履歴に追加」を押します。</p>
        <button className={btn2} disabled={!data.history.length} onClick={() => patch((d) => ({ ...d, history: [] }))}>履歴をすべて消す</button>
      </fieldset>
    </div>
  );
}

function Roster({ data, patch }: Omit<Props, "run" | "busy">) {
  const [paste, setPaste] = useState("");
  const set = (i: number, p: Partial<Student>) =>
    patch((d) => ({ ...d, students: d.students.map((s, k) => (k === i ? { ...s, ...p } : s)) }));

  const append = (list: Student[]) =>
    patch((d) => ({ ...d, students: [...d.students, ...list], history: d.history.map((h) => [...h, ...list.map(() => -1)]) }), true);

  const remove = (i: number) =>
    patch((d) => {
      const m = (x: number) => (x > i ? x - 1 : x);
      return {
        ...d,
        students: d.students.filter((_, k) => k !== i),
        history: d.history.map((h) => h.filter((_, k) => k !== i)),
        front_student_num: d.front_student_num.filter((x) => x !== i).map(m),
        separation_groups: d.separation_groups.map((g) => g.filter((x) => x !== i).map(m)).filter((g) => g.length >= 2),
      };
    }, true);

  const toggleFront = (i: number) =>
    patch((d) => ({
      ...d,
      front_student_num: d.front_student_num.includes(i) ? d.front_student_num.filter((x) => x !== i) : [...d.front_student_num, i],
    }));

  const importPaste = () => {
    const list = paste.split("\n").map((l) => l.trim()).filter(Boolean).map((l) => {
      // Excel の列順: 番号, ローマ字, 性別, 氏名
      const [no, romaji, gender, name] = l.split(/[,\t]/).map((x) => x.trim());
      const g = /^(女|F)/i.test(gender ?? "") ? "女" : /^(男|M)/i.test(gender ?? "") ? "男" : gender || "男";
      return { ...newStudent(no ?? ""), romaji: romaji ?? "", gender: g, name: name ?? "" };
    });
    if (list.length) { append(list); setPaste(""); }
  };

  const cell = "border-b border-slate-200 p-1";
  return (
    <div className="space-y-3">
      <div className="overflow-x-auto">
        <table className="w-full min-w-110 border-collapse text-xs">
          <thead className="text-left text-slate-600">
            <tr>
              {["番号", "氏名", "ローマ字", "性", "寮", "留", "前", "固定席", ""].map((h) => (
                <th key={h} className="border-b border-slate-400 p-1 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.students.map((s, i) => (
              <tr key={i} className="bg-white">
                <td className={cell}><input className={`${inp} w-12 px-1 text-xs`} value={s.student_no} onChange={(e) => set(i, { student_no: e.target.value })} /></td>
                <td className={cell}><input className={`${inp} w-20 px-1 text-xs`} value={s.name} onChange={(e) => set(i, { name: e.target.value })} /></td>
                <td className={cell}><input className={`${inp} w-24 px-1 text-xs`} value={s.romaji} onChange={(e) => set(i, { romaji: e.target.value })} /></td>
                <td className={cell}>
                  <select className={`${inp} px-0.5 text-xs`} value={s.gender} onChange={(e) => set(i, { gender: e.target.value })}>
                    <option>男</option><option>女</option>
                  </select>
                </td>
                <td className={cell}><input type="checkbox" aria-label="寮" checked={s.is_dorm} onChange={(e) => set(i, { is_dorm: e.target.checked })} /></td>
                <td className={cell}><input type="checkbox" aria-label="留学中" checked={s.is_abroad} onChange={(e) => set(i, { is_abroad: e.target.checked })} /></td>
                <td className={cell}><input type="checkbox" aria-label="前列指定" checked={data.front_student_num.includes(i)} onChange={() => toggleFront(i)} /></td>
                <td className={cell}>
                  <input type="number" min={0} className={`${inp} w-14 px-1 text-xs`} placeholder="なし" value={s.fixed_seat ?? ""}
                    onChange={(e) => set(i, { fixed_seat: e.target.value === "" ? null : Number(e.target.value) })} />
                </td>
                <td className={cell}>
                  <button aria-label={`${s.name || "生徒"}を削除`} onClick={() => remove(i)} className="p-1 text-slate-500 hover:text-rose-700"><Trash2 className="size-4" /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {!data.students.length && <p className="py-6 text-center text-sm text-slate-600">名簿が空です。下の「生徒を追加」または一括貼り付けで登録してください。</p>}
      </div>
      <button className={btn2} onClick={() => append([newStudent(String(data.students.length + 1))])}><Plus className="size-4" />生徒を追加</button>

      <details className="rounded border border-slate-300 bg-white p-2">
        <summary className="cursor-pointer text-sm text-slate-800">名簿を一括貼り付け</summary>
        <p className="my-1 text-xs text-slate-600">1行1名。番号,ローマ字,性別,氏名（カンマまたはタブ区切り。Excelからそのまま貼れます）</p>
        <textarea className={`${inp} h-28 font-mono text-xs`} value={paste} onChange={(e) => setPaste(e.target.value)} placeholder={"1,Yamada Taro,男,山田 太郎\n2,Ishida Hanako,女,石田 花子"} />
        <button className={`${btn2} mt-2`} onClick={importPaste}>末尾に追加</button>
      </details>
    </div>
  );
}

function Groups({ data, patch }: Omit<Props, "run" | "busy">) {
  const [sel, setSel] = useState<number[]>([]);
  const nm = (i: number) => data.students[i]?.name || `番号${data.students[i]?.student_no}`;
  return (
    <div className="space-y-4">
      <p className="text-xs text-slate-600">同じグループの生徒は、縦・横・斜めに隣り合わない席（2マス以上離れた席）になります。</p>
      <ul className="space-y-2">
        {data.separation_groups.map((g, gi) => (
          <li key={gi} className="flex flex-wrap items-center gap-1.5 rounded border border-slate-300 bg-white p-2">
            {g.map((i) => (
              <span key={i} className="inline-flex items-center gap-1 rounded-sm bg-slate-200 py-0.5 pl-2 pr-1 text-sm text-slate-900">
                {nm(i)}
                <button aria-label={`${nm(i)}をグループから外す`} className="text-slate-600 hover:text-rose-700"
                  onClick={() => patch((d) => ({ ...d, separation_groups: d.separation_groups.map((x, k) => (k === gi ? x.filter((y) => y !== i) : x)).filter((x) => x.length >= 2) }))}>
                  <X className="size-3.5" />
                </button>
              </span>
            ))}
            <button aria-label="グループを削除" className="ml-auto p-1 text-slate-500 hover:text-rose-700"
              onClick={() => patch((d) => ({ ...d, separation_groups: d.separation_groups.filter((_, k) => k !== gi) }))}>
              <Trash2 className="size-4" />
            </button>
          </li>
        ))}
        {!data.separation_groups.length && <li className="text-sm text-slate-600">グループはまだありません。</li>}
      </ul>

      <div className="rounded border border-slate-300 bg-white p-2">
        <p className="mb-1 text-xs font-medium text-slate-600">離したい生徒を2名以上選択（選択中 {sel.length} 名）</p>
        <div className="grid max-h-56 grid-cols-3 gap-x-2 gap-y-1 overflow-y-auto">
          {data.students.map((s, i) => (
            <label key={i} className="flex items-center gap-1.5 text-sm text-slate-900">
              <input type="checkbox" checked={sel.includes(i)} onChange={() => setSel((p) => (p.includes(i) ? p.filter((x) => x !== i) : [...p, i]))} />
              <span className="truncate">{s.student_no} {s.name}</span>
            </label>
          ))}
        </div>
        <button className={`${btn2} mt-2`} disabled={sel.length < 2}
          onClick={() => { patch((d) => ({ ...d, separation_groups: [...d.separation_groups, [...sel].sort((a, b) => a - b)] })); setSel([]); }}>
          <Plus className="size-4" />選択した生徒をグループにする
        </button>
      </div>
    </div>
  );
}
