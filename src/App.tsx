import { useEffect, useMemo, useState } from "react";
import { flushSync } from "react-dom";
import { invoke } from "@tauri-apps/api/core";
import { Download, GraduationCap, Eye, History, Plus, Printer, Upload, Wrench } from "lucide-react";
import { Sidebar } from "./Sidebar";
import { SeatCard } from "./SeatCard";
import { makeSeatModel, toggleSeat } from "./types";
import type { Data, SolveResult, View } from "./types";
import { deserialize, fileName, serialize } from "./backup";
import type { AppState } from "./backup";

const KEY = "seating-app-v1";
const today = () => new Date().toLocaleDateString("ja-JP");

function initial(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return JSON.parse(raw) as AppState;
  } catch {
    /* 壊れた保存データは無視して初期化 */
  }
  const d = today();
  return {
    data: {
      title: "2年3組 座席表",
      teacher_name: null,
      sub_teacher_name: null,
      front_rows: 2,
      seat_model: makeSeatModel(5, 7, [3]),
      students: [],
      history: [],
      front_student_num: [],
      separation_groups: [],
    },
    seats: [],
    retries: null,
    createdAt: d,
    updatedAt: d,
  };
}

export default function App() {
  const [st, setSt] = useState<AppState>(initial);
  const [view, setView] = useState<View>("student");
  const [busy, setBusy] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [toast, setToast] = useState<{ msg: string; err: boolean } | null>(null);
  const { data, seats } = st;

  useEffect(() => {
    localStorage.setItem(KEY, JSON.stringify(st));
  }, [st]);

  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(null), toast.err ? 8000 : 3500);
    return () => clearTimeout(t);
  }, [toast]);

  const patch = (f: (d: Data) => Data, clearSeats = false) =>
    setSt((s) => ({ ...s, data: f(s.data), seats: clearSeats ? [] : s.seats, retries: clearSeats ? null : s.retries, updatedAt: today() }));

  const run = async () => {
    setBusy(true);
    try {
      const r = await invoke<SolveResult>("solve_seats", { data });
      setSt((s) => ({ ...s, seats: r.seats, retries: r.retries, updatedAt: today() }));
      setToast({ msg: r.retries > 0 ? `席替えが完了しました（${r.retries}回リトライ）` : "席替えが完了しました（リトライなし）", err: false });
    } catch (e) {
      setToast({ msg: String(e), err: true });
    } finally {
      setBusy(false);
    }
  };

  const addHistory = () => {
    patch((d) => ({ ...d, history: [...d.history, seats] }));
    setToast({ msg: `履歴に追加しました（計${data.history.length + 1}回）`, err: false });
  };

  // 名簿・レイアウト・座席履歴・現在の配置をまとめて JSON ファイルに保存する
  const exportData = async () => {
    try {
      const saved = await invoke<boolean>("export_json", { contents: serialize(st), fileName: fileName(st) });
      if (saved) setToast({ msg: "データをエクスポートしました", err: false });
    } catch (e) {
      setToast({ msg: String(e), err: true });
    }
  };

  // JSON ファイルを読み込み、検証してから現在のデータを置き換える
  const importData = async () => {
    try {
      const text = await invoke<string | null>("import_json");
      if (text == null) return;
      const next = deserialize(text, today());
      const ok = window.confirm(
        `「${next.data.title}」（生徒 ${next.data.students.length} 名・履歴 ${next.data.history.length} 回）を読み込みます。
現在のデータは上書きされます。よろしいですか？`,
      );
      if (!ok) return;
      setSt(next);
      setToast({ msg: "データをインポートしました", err: false });
    } catch (e) {
      setToast({ msg: e instanceof Error ? e.message : String(e), err: true });
    }
  };

  // 画面を切り替えてから印刷し、終わったら元の視点に戻す
  const printAs = (v: View) => {
    const prev = view;
    const prevEdit = editMode;
    flushSync(() => {
      setView(v);
      setEditMode(false); // 編集用の点線枠が印刷に出ないようにする
    });
    window.print();
    setView(prev);
    setEditMode(prevEdit);
  };

  // 座席 ⇄ 空白を切り替え、番号を振り直す。履歴・固定席・現在の配置は同じマスの新番号へ付け替える
  const toggleCell = (r: number, c: number) => {
    const { model, map } = toggleSeat(data.seat_model, r, c);
    const moved = seats.map((x) => map.get(x));
    const keep = moved.every((x) => x !== undefined);
    const lostFixed = data.students.filter((s) => s.fixed_seat != null && !map.has(s.fixed_seat)).length;
    setSt((s) => ({
      ...s,
      data: {
        ...s.data,
        seat_model: model,
        history: s.data.history.map((h) => h.map((x) => (x < 0 ? x : (map.get(x) ?? -1)))),
        students: s.data.students.map((x) =>
          x.fixed_seat == null ? x : { ...x, fixed_seat: map.get(x.fixed_seat) ?? null },
        ),
      },
      seats: keep ? (moved as number[]) : [],
      retries: keep ? s.retries : null,
      updatedAt: today(),
    }));
    const notes = [!keep && "席を消したため現在の配置をクリアしました", lostFixed > 0 && `固定席が消えた生徒 ${lostFixed} 名の固定を解除しました`].filter(Boolean);
    if (notes.length) setToast({ msg: notes.join("。"), err: true });
  };

  // 生徒index → 座席。未実行のときは固定席だけを仮表示する
  const placed = seats.length === data.students.length ? seats : data.students.map((s) => s.fixed_seat ?? -1);
  const bySeat = useMemo(() => {
    const m = new Map<number, number>();
    placed.forEach((seat, i) => seat >= 0 && m.set(seat, i));
    return m;
  }, [placed]);

  const grid = view === "teacher" ? [...data.seat_model].reverse().map((r) => [...r].reverse()) : data.seat_model;
  const cols = data.seat_model[0]?.length ?? 1;
  const rows = data.seat_model.length;
  const count = (g: string) => data.students.filter((s) => s.gender === g).length;
  const canCommit = seats.length > 0 && seats.length === data.students.length;

  const seg = (v: View) =>
    `inline-flex items-center gap-1.5 px-3 py-1.5 text-sm ${view === v ? "bg-slate-900 font-bold text-white" : "bg-white text-slate-800 hover:bg-slate-100"}`;
  const btn = "inline-flex items-center gap-1.5 rounded border border-slate-300 bg-white px-3 py-1.5 text-sm text-slate-800 hover:bg-slate-100 disabled:opacity-50";

  return (
    <div className="flex h-screen bg-white text-slate-900 print:block print:h-auto">
      <Sidebar data={data} patch={patch} run={run} busy={busy} />

      <main className="flex min-w-0 flex-1 flex-col print:block">
        <div className="flex flex-wrap items-center gap-2 border-b border-slate-300 bg-slate-50 px-5 py-2 print:hidden">
          <div className="inline-flex overflow-hidden rounded border border-slate-300" role="group" aria-label="視点切り替え">
            <button className={seg("student")} aria-pressed={view === "student"} onClick={() => setView("student")}>
              <Eye className="size-4" />生徒視点（黒板が上）
            </button>
            <button className={`${seg("teacher")} border-l border-slate-300`} aria-pressed={view === "teacher"} onClick={() => setView("teacher")}>
              <GraduationCap className="size-4" />先生視点（教卓が下）
            </button>
          </div>
          <button
            className={`inline-flex items-center gap-1.5 rounded border px-3 py-1.5 text-sm ${editMode ? "border-slate-900 bg-slate-900 font-bold text-white" : "border-slate-300 bg-white text-slate-800 hover:bg-slate-100"}`}
            aria-pressed={editMode}
            onClick={() => setEditMode((e) => !e)}
          >
            <Wrench className="size-4" />レイアウト変更モード
          </button>
          <button className={btn} disabled={!canCommit} onClick={addHistory}><History className="size-4" />履歴に追加</button>
          <div className="ml-auto flex gap-2">
            <button className={btn} onClick={importData}><Upload className="size-4" />インポート</button>
            <button className={btn} onClick={exportData}><Download className="size-4" />エクスポート</button>
            <button className={btn} onClick={() => printAs("student")}><Printer className="size-4" />生徒用印刷</button>
            <button className={btn} onClick={() => printAs("teacher")}><Printer className="size-4" />先生用印刷</button>
          </div>
        </div>

        {/* 印刷対象。A4横の内寸（297-20 × 210-20mm）に収める */}
        <section className="sheet flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-5 print:h-[190mm] print:gap-2 print:overflow-hidden print:p-0">
          <header className="flex items-baseline justify-between gap-4 border-b-2 border-slate-900 pb-1 print:border-black">
            <input
              aria-label="座席表タイトル"
              className="min-w-0 flex-1 rounded border border-transparent bg-transparent px-1 text-2xl font-bold hover:border-slate-300 focus:border-slate-600 focus:outline-none print:p-0 print:text-[20pt] print:text-black"
              value={data.title}
              onChange={(e) => patch((d) => ({ ...d, title: e.target.value }))}
            />
            <span className="shrink-0 text-sm text-slate-600 print:text-black">
              {view === "student" ? "生徒視点" : "先生視点（教卓側から見た配置）"}
            </span>
          </header>

          {editMode && (
            <p className="rounded border border-slate-400 bg-slate-50 px-3 py-1.5 text-sm text-slate-800 print:hidden">
              レイアウト変更モード：マスをクリックすると「座席 ⇄ 空白」が切り替わり、座席番号は左上から自動で振り直されます（現在 {data.seat_model.flat().filter((v) => v >= 0).length} 席 / 生徒 {data.students.length} 名）。
            </p>
          )}

          {view === "student" && <Board label="黒板" />}

          <div className="grid min-h-0 flex-1 gap-1.5 print:gap-1" style={{ gridTemplateColumns: `repeat(${cols}, minmax(0, 1fr))`, gridAutoRows: "minmax(0, 1fr)" }}>
            {grid.flatMap((row, r) =>
              row.map((no, c) => {
                const k = r * cols + c;
                // 先生視点は反転表示なので、クリック先は元のモデル座標へ戻す
                const or = view === "teacher" ? rows - 1 - r : r;
                const oc = view === "teacher" ? cols - 1 - c : c;
                if (no < 0) {
                  // 通常時は枠なしの通路。編集中だけ「席を追加できる」点線枠を出す
                  return editMode ? (
                    <button
                      key={k}
                      type="button"
                      aria-label="ここに席を追加"
                      onClick={() => toggleCell(or, oc)}
                      className="flex items-center justify-center rounded-md border border-dashed border-slate-300 text-slate-300 hover:border-slate-800 hover:bg-slate-50 hover:text-slate-800"
                    >
                      <Plus className="size-5" />
                    </button>
                  ) : (
                    <div key={k} aria-hidden />
                  );
                }
                const card = <SeatCard seatNo={no} student={bySeat.has(no) ? data.students[bySeat.get(no)!] : undefined} />;
                return editMode ? (
                  <button
                    key={k}
                    type="button"
                    aria-label={`座席${no}を空白にする`}
                    onClick={() => toggleCell(or, oc)}
                    className="grid min-h-0 min-w-0 cursor-pointer rounded-md text-left ring-2 ring-slate-300 hover:ring-slate-900"
                  >
                    {card}
                  </button>
                ) : (
                  <div key={k} className="grid min-h-0 min-w-0">{card}</div>
                );
              }),
            )}
          </div>

          {view === "teacher" && <Board label="教卓" />}

          <footer className="grid grid-cols-3 items-center border-t border-slate-400 pt-2 text-sm text-slate-700 print:border-black print:text-[9pt] print:text-black">
            <span>作成日 {st.createdAt}　更新日 {st.updatedAt}</span>
            <span className="text-center font-medium tabular-nums">
              男: {count("男")}名　女: {count("女")}名　計: {data.students.length}名
            </span>
            <span className="text-right">
              担任 {data.teacher_name || "未設定"}　副担任 {data.sub_teacher_name || "未設定"}
            </span>
          </footer>
        </section>
      </main>

      {toast && (
        <div
          role="status"
          className={`fixed bottom-6 right-6 z-50 max-w-md rounded border px-4 py-3 text-sm shadow-lg print:hidden ${
            toast.err
              ? "border-rose-400 bg-rose-50 text-rose-900"
              : "border-slate-400 bg-white text-slate-900"
          }`}
        >
          {toast.msg}
        </div>
      )}
    </div>
  );
}

function Board({ label }: { label: string }) {
  return (
    <div className="rounded-sm border border-slate-500 bg-slate-200 py-1 text-center text-sm font-bold tracking-[0.5em] text-slate-800 print:border-black print:bg-white print:text-[9pt] print:text-black">
      {label}
    </div>
  );
}
