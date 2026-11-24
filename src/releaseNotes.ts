import notes from "./releaseNotes.json";

export interface NoteItem {
  /** 太字の見出し（任意） */
  title?: string;
  text: string;
  details?: string[];
}

export interface ReleaseNote {
  version: string;
  date: string;
  sections: { title: string; items: NoteItem[] }[];
}

/** 新しい順。リリースのたびに先頭へ追加する（scripts/bump.mjs が未記入を検出する） */
export const RELEASE_NOTES: ReleaseNote[] = notes;

/** "1.10.0" > "1.9.2" のように数値で比較する */
export function compareVersions(a: string, b: string): number {
  const pa = a.split(".").map(Number);
  const pb = b.split(".").map(Number);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const d = (pa[i] ?? 0) - (pb[i] ?? 0);
    if (d !== 0) return Math.sign(d);
  }
  return 0;
}

/**
 * 起動時に見せるリリースノート。
 * - 最後に見たバージョンより新しく、現在のバージョン以下のものを新しい順に返す
 * - 記録がない場合：保存データがあれば「この機能がなかった版からの更新」とみなして現在の版だけ、なければ新規インストールなので何も出さない
 */
export function notesToShow(lastSeen: string | null, current: string, hasSavedData: boolean, all = RELEASE_NOTES): ReleaseNote[] {
  const upTo = all.filter((n) => compareVersions(n.version, current) <= 0);
  if (lastSeen === null) return hasSavedData ? upTo.filter((n) => n.version === current) : [];
  return upTo.filter((n) => compareVersions(n.version, lastSeen) > 0);
}
