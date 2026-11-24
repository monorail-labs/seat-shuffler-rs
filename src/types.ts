// Rust の Data / Student と 1:1 対応（フィールド名は snake_case のまま）
export interface Student {
  student_no: string;
  name: string;
  romaji: string;
  gender: string;
  is_dorm: boolean;
  is_abroad: boolean;
  fixed_seat: number | null;
}

export interface Data {
  title: string;
  teacher_name: string | null;
  sub_teacher_name: string | null;
  front_rows: number;
  seat_model: number[][]; // -1 = 通路
  students: Student[];
  history: number[][]; // history[回][生徒index] = 座席番号
  front_student_num: number[]; // 生徒index（名簿順 0 始まり）
  separation_groups: number[][]; // 生徒index の配列
  adjacent_pairs: [number, number][]; // 左右の隣（通路を挟まない）に座らせる生徒index の組
}

export interface SolveResult {
  seats: number[]; // seats[生徒index] = 座席番号
  retries: number;
}

export type View = "student" | "teacher";

/** 通路列（0 始まり）を除いて、座席番号を 0 から行順に振る */
export function makeSeatModel(rows: number, cols: number, aisleCols: number[]): number[][] {
  let n = 0;
  return Array.from({ length: rows }, () =>
    Array.from({ length: cols }, (_, c) => (aisleCols.includes(c) ? -1 : n++)),
  );
}

export const seatCount = (m: number[][]) => m.flat().filter((v) => v >= 0).length;

export const newStudent = (no: string): Student => ({
  student_no: no,
  name: "",
  romaji: "",
  gender: "男",
  is_dorm: false,
  is_abroad: false,
  fixed_seat: null,
});

/**
 * (r, c) の座席 ⇄ 空白（-1）を切り替え、左上→右下で 0,1,2... に再採番する。
 * map は「旧座席番号 → 新座席番号」（同じマスの対応。消えた席は含まれない）。
 * 履歴・固定席・現在の配置をこの map で付け替えることで、席を増減しても情報を失わない。
 */
export function toggleSeat(
  old: number[][],
  r: number,
  c: number,
): { model: number[][]; map: Map<number, number> } {
  let n = 0;
  const map = new Map<number, number>();
  const model = old.map((row, i) =>
    row.map((v, j) => {
      const isSeat = i === r && j === c ? v < 0 : v >= 0;
      if (!isSeat) return -1;
      const k = n++;
      if (v >= 0) map.set(v, k);
      return k;
    }),
  );
  return { model, map };
}
