import { useState } from "react";

export interface SubTab<Id extends string> {
  id: Id;
  label: string;
  count?: number;
}

/** サブタブをまとめる1段目のカテゴリ。選ぶと2段目にサブタブが出る */
export interface TabGroup<Id extends string> {
  group: string;
  label: string;
  children: SubTab<Id>[];
}

/** 1段目のタブ：直接開くタブか、サブタブを持つカテゴリ */
export type TopTab<Id extends string> = SubTab<Id> | TabGroup<Id>;

interface Props<Id extends string> {
  tabs: TopTab<Id>[];
  active: Id;
  onSelect: (id: Id) => void;
  showCounts: boolean;
}

const isGroup = <Id extends string>(t: TopTab<Id>): t is TabGroup<Id> => "children" in t;
const keyOf = <Id extends string>(t: TopTab<Id>) => (isGroup(t) ? t.group : t.id);

/** カテゴリの件数は、サブタブの件数の合計（件数を持つサブタブがなければ表示しない） */
const countOf = <Id extends string>(t: TopTab<Id>) =>
  isGroup(t) ? t.children.reduce<number | undefined>((sum, c) => (c.count === undefined ? sum : (sum ?? 0) + c.count), undefined) : t.count;

const withCount = (label: string, count: number | undefined, show: boolean) => (show && count !== undefined ? `${label}（${count}）` : label);

/**
 * Vivaldi の2段タブのような二段タブバー。
 * 1段目でカテゴリを選び、サブタブを持つカテゴリのときだけ2段目が現れる。
 * カテゴリごとに最後に開いていたサブタブを覚えておき、1段目から戻ったときに復元する
 */
export function TabBar<Id extends string>({ tabs, active, onSelect, showCounts }: Props<Id>) {
  const [lastChild, setLastChild] = useState<Record<string, Id>>({});
  const current = tabs.find((t) => (isGroup(t) ? t.children.some((c) => c.id === active) : t.id === active));

  const selectTop = (t: TopTab<Id>) => onSelect(isGroup(t) ? (lastChild[t.group] ?? t.children[0].id) : t.id);
  const selectChild = (g: TabGroup<Id>, id: Id) => {
    setLastChild((m) => ({ ...m, [g.group]: id }));
    onSelect(id);
  };

  return (
    <div className="border-b border-slate-300 bg-white">
      <div role="tablist" aria-label="設定のカテゴリ" className="flex">
        {tabs.map((t) => {
          const on = current === t;
          return (
            <button
              key={keyOf(t)}
              role="tab"
              aria-selected={on}
              onClick={() => selectTop(t)}
              className={`min-w-0 flex-1 truncate border-b-2 px-2 py-2.5 text-sm ${on ? "border-slate-900 font-bold text-slate-900" : "border-transparent text-slate-600 hover:bg-slate-100"}`}
            >
              {withCount(t.label, countOf(t), showCounts)}
              {isGroup(t) && <span aria-hidden className="ml-0.5 text-xs text-slate-400">▾</span>}
            </button>
          );
        })}
      </div>
      {current && isGroup(current) && (
        <div role="tablist" aria-label={`${current.label}のサブタブ`} className="flex gap-1 border-t border-slate-200 bg-slate-100 px-2 py-1.5">
          {current.children.map((c) => (
            <button
              key={c.id}
              role="tab"
              aria-selected={active === c.id}
              onClick={() => selectChild(current, c.id)}
              className={`min-w-0 truncate rounded px-3 py-1 text-sm ${active === c.id ? "bg-white font-bold text-slate-900 shadow-sm ring-1 ring-slate-300" : "text-slate-600 hover:bg-white/60"}`}
            >
              {withCount(c.label, c.count, showCounts)}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
