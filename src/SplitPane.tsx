import { useEffect, useRef, useState } from "react";
import type { KeyboardEvent, PointerEvent, ReactNode } from "react";

const KEY = "seating-app-split-ratio";
/** 左（設定パネル）と右（座席表）が、ドラッグしてもこれより狭くならない幅 */
export const MIN_LEFT = 300;
export const MIN_RIGHT = 320;
const DEFAULT_RATIO = 0.38;
const KEY_STEP = 16;
/** スプリッター自体の幅（className の w-2 と合わせる） */
const HANDLE_WIDTH = 8;

function loadRatio(): number {
  try {
    const v = Number(localStorage.getItem(KEY));
    return v > 0 && v < 1 ? v : DEFAULT_RATIO;
  } catch {
    return DEFAULT_RATIO;
  }
}

/**
 * 2 ペインに配れる幅 space（スプリッターの幅を除く）のときの左ペインの幅。
 * 両方の最小幅を守り、収まらないときは左（設定）を優先する
 */
export function leftWidthFor(ratio: number, space: number): number {
  return Math.max(MIN_LEFT, Math.min(ratio * space, space - MIN_RIGHT));
}

/**
 * 左右 2 ペインと、その境界のドラッグ可能なスプリッター。
 * 配分は比率で localStorage に保存し、次回起動時やウィンドウサイズが変わったときも同じ割合で復元する。
 * キーボードでも操作できる（←→ で 16px、Home/End で端まで、ダブルクリックで初期値）
 */
export function SplitPane({ left, right }: { left: ReactNode; right: ReactNode }) {
  const ref = useRef<HTMLDivElement>(null);
  const [space, setSpace] = useState(0);
  const [ratio, setRatio] = useState(loadRatio);
  const [dragging, setDragging] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => setSpace(Math.max(0, entry.contentRect.width - HANDLE_WIDTH)));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // ドラッグ中は書き込まず、離したとき（とキーボード操作のたび）に保存する
  useEffect(() => {
    if (dragging) return;
    try {
      localStorage.setItem(KEY, String(ratio));
    } catch {
      /* 保存できなくても表示には影響しない */
    }
  }, [ratio, dragging]);

  const leftWidth = space ? leftWidthFor(ratio, space) : null;
  const setLeftWidth = (w: number) => space && setRatio(leftWidthFor(w / space, space) / space);

  const onPointerDown = (e: PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    setDragging(true);
  };
  const onPointerMove = (e: PointerEvent<HTMLDivElement>) => {
    if (dragging && ref.current) setLeftWidth(e.clientX - ref.current.getBoundingClientRect().left);
  };
  const onPointerUp = (e: PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) e.currentTarget.releasePointerCapture(e.pointerId);
    setDragging(false);
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    if (leftWidth === null) return;
    const next = { ArrowLeft: leftWidth - KEY_STEP, ArrowRight: leftWidth + KEY_STEP, Home: MIN_LEFT, End: space - MIN_RIGHT }[e.key];
    if (next === undefined) return;
    e.preventDefault();
    setLeftWidth(next);
  };

  return (
    <div ref={ref} className={`flex min-h-0 flex-1 print:block ${dragging ? "cursor-col-resize select-none" : ""}`}>
      <div className="flex min-h-0 flex-none print:hidden" style={{ width: leftWidth ?? `${ratio * 100}%` }}>
        {left}
      </div>
      <div
        role="separator"
        aria-orientation="vertical"
        aria-label="設定パネルと座席表の幅"
        aria-valuemin={MIN_LEFT}
        aria-valuemax={Math.max(MIN_LEFT, space - MIN_RIGHT)}
        aria-valuenow={leftWidth === null ? undefined : Math.round(leftWidth)}
        tabIndex={0}
        title="ドラッグで幅を調整（ダブルクリックで元に戻す）"
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        onKeyDown={onKeyDown}
        onDoubleClick={() => setRatio(DEFAULT_RATIO)}
        className={`flex w-2 shrink-0 cursor-col-resize touch-none items-center justify-center border-x border-slate-300 hover:bg-slate-300 focus-visible:bg-slate-400 focus-visible:outline-none print:hidden ${dragging ? "bg-slate-400" : "bg-slate-100"}`}
      >
        <span aria-hidden className="h-8 w-0.5 rounded-full bg-slate-400" />
      </div>
      <div className="flex min-h-0 min-w-0 flex-1 print:block">{right}</div>
    </div>
  );
}
