import { useEffect, useRef, useState } from "react";
import { getVersion } from "@tauri-apps/api/app";
import { Sparkles } from "lucide-react";
import { notesToShow } from "./releaseNotes";
import type { ReleaseNote } from "./releaseNotes";

const SEEN_KEY = "seating-app-last-seen-version";

/**
 * アップデート後の初回起動で一度だけ見せるリリースノート。
 * hasSavedData は App が保存データを書き込む前の値を渡す（新規インストールと更新を見分けるため）
 */
export function useWhatsNew(hasSavedData: boolean) {
  const [notes, setNotes] = useState<ReleaseNote[]>([]);
  // 記録は起動時の値で固定する（StrictMode で effect が2回走っても同じ判定になるように）
  const [lastSeen] = useState(() => {
    try {
      return { ok: true, value: localStorage.getItem(SEEN_KEY) };
    } catch {
      return { ok: false, value: null };
    }
  });
  const [hadData] = useState(hasSavedData);

  useEffect(() => {
    // 記録を読めない環境では、毎回表示されてしまわないよう何も出さない
    if (!lastSeen.ok) return;
    let alive = true;
    getVersion()
      .then((current) => {
        // 表示する時点で記録しておき、閉じずに終了しても次回は出さない
        localStorage.setItem(SEEN_KEY, current);
        if (alive) setNotes(notesToShow(lastSeen.value, current, hadData));
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [lastSeen, hadData]);

  return { notes, close: () => setNotes([]) };
}

/** リリースノートのモーダル。notes が空のときは何も出さない */
export function ReleaseNotesDialog({ notes, heading, onClose }: { notes: ReleaseNote[]; heading: string; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const open = notes.length > 0;

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) {
      d.showModal();
      // スクロール領域ではなく「閉じる」にフォーカスを置き、Enter でも閉じられるようにする
      closeRef.current?.focus();
      d.querySelector("[data-scroll]")?.scrollTo(0, 0);
    }
    if (!open && d.open) d.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="release-notes-heading"
      onClose={onClose}
      className="m-auto w-[min(40rem,calc(100vw-2rem))] max-h-[calc(100vh-2rem)] flex-col rounded-lg border border-slate-300 bg-white p-0 text-slate-900 shadow-xl backdrop:bg-slate-900/40 open:flex print:hidden"
    >
      <header className="flex items-center gap-2 border-b border-slate-200 px-5 py-3">
        <Sparkles aria-hidden className="size-5 text-slate-700" />
        <h2 id="release-notes-heading" className="text-lg font-bold">{heading}</h2>
      </header>

      <div data-scroll className="min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-4">
        {notes.map((n) => (
          <article key={n.version}>
            <h3 className="flex items-baseline gap-2 border-b border-slate-200 pb-1">
              <span className="text-base font-bold">v{n.version}</span>
              <span className="text-xs text-slate-500">{n.date.replace(/-/g, "/")}</span>
            </h3>
            {n.sections.map((s) => (
              <section key={s.title} className="mt-3">
                <h4 className="text-sm font-bold text-slate-700">{s.title}</h4>
                <ul className="mt-1 list-disc space-y-1.5 pl-5 text-sm leading-relaxed">
                  {s.items.map((it, i) => (
                    <li key={i}>
                      {it.title && <span className="font-bold">{it.title}：</span>}
                      {it.text}
                      {it.details && (
                        <ul className="mt-1 list-[circle] space-y-1 pl-5 text-slate-700">
                          {it.details.map((d, j) => <li key={j}>{d}</li>)}
                        </ul>
                      )}
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </article>
        ))}
      </div>

      <footer className="flex justify-end border-t border-slate-200 px-5 py-3">
        {/* method=dialog で閉じると onClose が呼ばれる。Esc キーでも閉じられる */}
        <form method="dialog">
          <button ref={closeRef} className="rounded bg-slate-900 px-4 py-1.5 text-sm font-bold text-white hover:bg-slate-700">
            閉じる
          </button>
        </form>
      </footer>
    </dialog>
  );
}
