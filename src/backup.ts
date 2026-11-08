import type { Data, Student } from "./types";

/** 画面の状態全体（localStorage に保存しているものと同じ） */
export interface AppState {
  data: Data;
  seats: number[];
  retries: number | null;
  createdAt: string;
  updatedAt: string;
}

const FORMAT = "seat-shuffler";
const VERSION = 1;

/** エクスポート用 JSON 文字列。名簿・レイアウト・座席履歴・現在の配置をすべて含む */
export function serialize(st: AppState): string {
  return JSON.stringify({ format: FORMAT, version: VERSION, exported_at: new Date().toISOString(), ...st }, null, 2);
}

/** ファイル名に使えない文字を除いた既定のファイル名 */
export function fileName(st: AppState): string {
  const d = new Date();
  const ymd = `${d.getFullYear()}${String(d.getMonth() + 1).padStart(2, "0")}${String(d.getDate()).padStart(2, "0")}`;
  const title = st.data.title.replace(/[\\/:*?"<>|\s]+/g, "_").replace(/^_+|_+$/g, "") || "座席表";
  return `${title}_${ymd}.json`;
}

class ImportError extends Error {}
const fail = (msg: string): never => {
  throw new ImportError(msg);
};

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);
const isInt = (v: unknown): v is number => typeof v === "number" && Number.isInteger(v);
const intArr = (v: unknown, what: string): number[] =>
  Array.isArray(v) && v.every(isInt) ? v : fail(`${what}の形式が正しくありません。`);
const intMatrix = (v: unknown, what: string): number[][] =>
  Array.isArray(v) ? v.map((r) => intArr(r, what)) : fail(`${what}の形式が正しくありません。`);
const optStr = (v: unknown): string | null => (typeof v === "string" ? v : null);

function parseStudent(v: unknown, i: number): Student {
  if (!isObj(v)) return fail(`名簿の ${i + 1} 行目の形式が正しくありません。`);
  const str = (k: string) => (typeof v[k] === "string" ? (v[k] as string) : v[k] == null ? "" : String(v[k]));
  const fixed = v.fixed_seat;
  if (fixed != null && !isInt(fixed)) fail(`名簿の ${i + 1} 行目の固定席が正しくありません。`);
  return {
    student_no: str("student_no"),
    name: str("name"),
    romaji: str("romaji"),
    gender: str("gender") || "男",
    is_dorm: v.is_dorm === true,
    is_abroad: v.is_abroad === true,
    fixed_seat: (fixed as number | null | undefined) ?? null,
  };
}

function parseData(v: unknown): Data {
  if (!isObj(v)) return fail("データ本体が見つかりません。");
  const seat_model = intMatrix(v.seat_model, "座席レイアウト");
  if (!seat_model.length || seat_model.some((r) => r.length !== seat_model[0].length)) fail("座席レイアウトの行の長さが揃っていません。");
  if (!Array.isArray(v.students)) fail("名簿の形式が正しくありません。");
  const students = (v.students as unknown[]).map(parseStudent);
  const n = students.length;
  const history = intMatrix(v.history ?? [], "座席の履歴");
  if (history.some((h) => h.length !== n)) fail("座席の履歴の人数と名簿の人数が一致しません。");
  const front_student_num = intArr(v.front_student_num ?? [], "前列指定");
  const separation_groups = intMatrix(v.separation_groups ?? [], "離すグループ");
  if ([...front_student_num, ...separation_groups.flat()].some((i) => i < 0 || i >= n)) fail("前列指定または離すグループに存在しない生徒が含まれています。");
  return {
    title: typeof v.title === "string" ? v.title : "座席表",
    teacher_name: optStr(v.teacher_name),
    sub_teacher_name: optStr(v.sub_teacher_name),
    front_rows: isInt(v.front_rows) && v.front_rows >= 0 ? v.front_rows : 0,
    seat_model,
    students,
    history,
    front_student_num,
    separation_groups,
  };
}

/**
 * インポートした JSON を検証して AppState にする。
 * 本アプリのエクスポート形式に加え、config_sample.json のような Data 単体の JSON も受け付ける。
 */
export function deserialize(text: string, today: string): AppState {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return fail("JSON として読み込めませんでした。ファイルが壊れていないか確認してください。");
  }
  if (!isObj(raw)) return fail("対応していないファイル形式です。");
  if (raw.format === FORMAT) {
    if (!isInt(raw.version) || raw.version > VERSION) fail("新しいバージョンのアプリで作られたファイルです。アプリを更新してください。");
    const data = parseData(raw.data);
    const seats = Array.isArray(raw.seats) ? intArr(raw.seats, "現在の配置") : [];
    const keep = seats.length === data.students.length;
    return {
      data,
      seats: keep ? seats : [],
      retries: keep && isInt(raw.retries) ? raw.retries : null,
      createdAt: optStr(raw.createdAt) ?? today,
      updatedAt: optStr(raw.updatedAt) ?? today,
    };
  }
  if ("seat_model" in raw && "students" in raw) {
    return { data: parseData(raw), seats: [], retries: null, createdAt: today, updatedAt: today };
  }
  return fail("対応していないファイル形式です。");
}
