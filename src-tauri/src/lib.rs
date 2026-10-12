use rand::seq::IteratorRandom;
use serde::{Deserialize, Serialize};
use std::collections::{hash_map::Entry, HashMap};

#[derive(Serialize, Deserialize, Debug, Clone)]
pub struct Student {
    pub student_no: String,
    pub name: String,
    pub romaji: String,
    pub gender: String,
    #[serde(default)]
    pub is_dorm: bool,
    #[serde(default)]
    pub is_abroad: bool,
    pub fixed_seat: Option<i32>,
}

// struct Data を pub にしただけ（フィールドは無変更）
#[derive(Serialize, Deserialize, Debug)]
pub struct Data {
    pub title: String,
    pub teacher_name: Option<String>,
    pub sub_teacher_name: Option<String>,
    pub front_rows: usize,
    pub seat_model: Vec<Vec<i32>>,
    pub students: Vec<Student>,
    pub history: Vec<Vec<i32>>,
    pub front_student_num: Vec<i32>,
    pub separation_groups: Vec<Vec<usize>>,
}

#[derive(Serialize, Debug)]
pub struct SolveResult {
    /// seats[i] = i 番目の生徒（students 配列順）の座席番号
    pub seats: Vec<i32>,
    pub retries: usize,
}

struct Config {
    student_count: usize,
    seat_max: i32,
    front_seat_max: i32,
}

// async にすることで、リトライ中も UI スレッドをブロックしない
#[tauri::command]
async fn solve_seats(data: Data) -> Result<SolveResult, String> {
    solve(&data)
}

fn solve(data: &Data) -> Result<SolveResult, String> {
    let n = data.students.len();
    if n == 0 {
        return Err("名簿が空です。生徒を追加してください。".into());
    }
    // 座席数と生徒数の完全一致を仕様とする（空席・席不足は運用上の不整合として扱う）
    let seat_ids = collect_seat_ids(&data.seat_model);
    if seat_ids.len() != n {
        return Err(format!(
            "有効な座席数({})と生徒数({})が一致していません。レイアウトの座席数を調整してください。",
            seat_ids.len(),
            n
        ));
    }
    // 元コードは範囲外アクセスでパニックするため、入口で検証する
    if data.history.iter().any(|row| row.len() != n) {
        return Err("履歴の人数と名簿の人数が一致しません。履歴をクリアしてください。".into());
    }
    if data.separation_groups.iter().flatten().any(|&i| i >= n) {
        return Err("離すグループに存在しない生徒が含まれています。".into());
    }

    let coord_map = build_coord_map(&data.seat_model);
    // リトライに入る前に、固定席の矛盾を決定的に検出する
    validate_fixed_seats(&data.students, &data.separation_groups, &coord_map)?;

    let config = Config {
        student_count: n,
        seat_max: data.seat_model.iter().flatten().copied().max().unwrap_or(0),
        front_seat_max: data
            .seat_model
            .iter()
            .take(data.front_rows)
            .flatten()
            .copied()
            .max()
            .unwrap_or(0),
    };

    let never_per_s = make_never_per_s(&make_history_per_s(&data.history, &config), &seat_ids);
    let front_per_s = make_front_per_s(&data.front_student_num, &config);
    let available_per_s = make_available_per_s(&never_per_s, &front_per_s);
    let available_per_s = apply_fixed_seats(&available_per_s, &data.students);

    if available_per_s.iter().any(|v| v.is_empty()) {
        return Err("この条件で使用可能な座席が存在しない生徒がいます。前列指定・固定席・履歴を見直してください。".into());
    }

    let max_retries = 1000;
    for retry_count in 0..=max_retries {
        if let Ok(seats) = make_seats(&available_per_s) {
            if is_separation_valid(&seats, &data.separation_groups, &coord_map) {
                return Ok(SolveResult {
                    seats,
                    retries: retry_count,
                });
            }
        }
    }
    Err(format!(
        "{}回リトライしましたが失敗しました。条件を見直してください。",
        max_retries
    ))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .setup(|app| {
            // updater はデスクトップ専用。モバイルビルドでコンパイルエラーにならないよう cfg で限定する
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![solve_seats])
        .run(tauri::generate_context!())
        .expect("Tauri の起動に失敗しました");
}

// 「しなければならない」の条件に使う生成関数（配列を返す）
// 生徒ごとの座ったことのある座席の配列を作成
fn make_history_per_s(history: &[Vec<i32>], config: &Config) -> Vec<Vec<i32>> {
    let mut history_per_s: Vec<Vec<i32>> = Vec::new();
    for s_num in 0..config.student_count {
        let mut temp = Vec::new();
        for i in 0..history.len() {
            temp.push(history[i][s_num]);
        }
        history_per_s.push(temp);
    }
    history_per_s
}

// seat_model 上の有効な座席ID（-1 = 通路 を除く）を列挙
fn collect_seat_ids(seat_model: &[Vec<i32>]) -> Vec<i32> {
    seat_model.iter().flatten().copied().filter(|&v| v >= 0).collect()
}

// 生徒ごとの座ったことのない座席の配列を作成
fn make_never_per_s(history_per_s: &[Vec<i32>], seat_ids: &[i32]) -> Vec<Vec<i32>> {
    let mut never_per_s: Vec<Vec<i32>> = Vec::new();
    for history_one in history_per_s.iter() {
        let never_one: Vec<i32> = seat_ids
            .iter()
            .copied()
            .filter(|x| !history_one.contains(x))
            .collect();
        never_per_s.push(never_one);
    }
    never_per_s
}

// 目が悪い生徒は後ろの座席に座れない
fn make_front_per_s(front_student_num: &[i32], config: &Config) -> Vec<Vec<i32>> {
    let mut front_per_s: Vec<Vec<i32>> = Vec::new();
    for student_num in 0..(config.student_count as i32) {
        if front_student_num.contains(&student_num) {
            front_per_s.push((0..=config.front_seat_max).collect());
        } else {
            front_per_s.push((0..=config.seat_max).collect());
        }
    }
    front_per_s
}

// 条件ごとの座れる座席の共通部分を出す
fn make_available_per_s(never_per_s: &[Vec<i32>], front_per_s: &[Vec<i32>]) -> Vec<Vec<i32>> {
    let mut available_per_s: Vec<Vec<i32>> = Vec::new();
    for (never, front) in never_per_s.iter().zip(front_per_s.iter()) {
        let available_one: Vec<i32> = never
            .iter()
            .filter(|x| front.contains(x))
            .copied()
            .collect();
        available_per_s.push(available_one);
    }
    available_per_s
}

// available_per_sから一人一つ選ぶ
fn make_seats(available_per_s: &[Vec<i32>]) -> Result<Vec<i32>, String> {
    let mut rng = rand::rng();
    let mut seats: Vec<i32> = vec![-1; available_per_s.len()];

    // 要素数の少ない順に並べ替えられたインデックスを作成
    let mut indices: Vec<usize> = (0..available_per_s.len()).collect();
    indices.sort_by_key(|&i| available_per_s[i].len());

    // 要素数の少ない順に一つずつ座席を選んでいく
    for i in indices {
        let available = &available_per_s[i];
        let seat = *available
            .iter()
            .filter(|x| !seats.contains(x))
            .choose(&mut rng)
            // どこかで自分が座れる席はすべて取りつくされてしまったらエラーメッセージが出て終了する
            .ok_or("座席候補が空です。もう一度やり直してください。場合によっては、この条件で使用可能な座席が存在しないかもしれません。".to_string())?;
        seats[i] = seat
    }
    Ok(seats)
}

// 固定席ルールをドメインに反映する関数
fn apply_fixed_seats(available_per_s: &[Vec<i32>], students: &[Student]) -> Vec<Vec<i32>> {
    let all_fixed: Vec<i32> = students.iter().filter_map(|s| s.fixed_seat).collect();
    available_per_s
        .iter()
        .enumerate()
        .map(|(i, available)| {
            if let Some(fixed) = students[i].fixed_seat {
                vec![fixed] // 固定の生徒は1席だけ！
            } else {
                available
                    .iter()
                    .filter(|&&s| !all_fixed.contains(&s))
                    .copied()
                    .collect()
            }
        })
        .collect()
}

fn student_label(s: &Student) -> String {
    if s.name.is_empty() {
        format!("{}番", s.student_no)
    } else {
        format!("{}番 {}", s.student_no, s.name)
    }
}

// 固定席の異常（存在しない席・重複・離すグループ同士の隣接）を探索前に検出する
fn validate_fixed_seats(
    students: &[Student],
    separation_groups: &[Vec<usize>],
    coord_map: &CoordMap,
) -> Result<(), String> {
    let mut owner: HashMap<i32, usize> = HashMap::new();
    for (i, s) in students.iter().enumerate() {
        let Some(seat) = s.fixed_seat else { continue };
        if !coord_map.contains_key(&seat) {
            return Err(format!(
                "{} の固定席 {} は座席表に存在しません（範囲外または通路です）。",
                student_label(s),
                seat
            ));
        }
        match owner.entry(seat) {
            Entry::Occupied(e) => {
                return Err(format!(
                    "座席 {} に {} と {} が重複して固定されています。",
                    seat,
                    student_label(&students[*e.get()]),
                    student_label(s)
                ));
            }
            Entry::Vacant(e) => {
                e.insert(i);
            }
        }
    }

    for group in separation_groups {
        let fixed: Vec<(usize, i32)> = group
            .iter()
            .filter_map(|&i| students[i].fixed_seat.map(|seat| (i, seat)))
            .collect();
        for (k, &(i, seat_a)) in fixed.iter().enumerate() {
            for &(j, seat_b) in &fixed[k + 1..] {
                if i != j && chebyshev_distance(coord_map[&seat_a], coord_map[&seat_b]) < 2 {
                    return Err(format!(
                        "離すグループの {} と {} が隣接する固定席（{} と {}）に指定されています。固定席か離すグループを見直してください。",
                        student_label(&students[i]),
                        student_label(&students[j]),
                        seat_a,
                        seat_b
                    ));
                }
            }
        }
    }
    Ok(())
}

// 「してはならない」の条件で使う判定関数（真偽値を返す）

type CoordMap = HashMap<i32, (usize, usize)>;

fn build_coord_map(seat_model: &[Vec<i32>]) -> CoordMap {
    let mut map = HashMap::new();
    for (r, row) in seat_model.iter().enumerate() {
        // 通路（-1）は座席ではないので登録しない
        for (c, &val) in row.iter().enumerate().filter(|&(_, &v)| v >= 0) {
            map.insert(val, (r, c));
        }
    }
    map
}

fn is_separation_valid(
    seats: &[i32],
    separation_groups: &[Vec<usize>],
    coord_map: &CoordMap,
) -> bool {
    separation_groups.iter().all(|group| {
        // 座標が見つからない座席があれば None → 不正として false にする
        let Some(coords) = group
            .iter()
            .map(|&i| coord_map.get(&seats[i]).copied())
            .collect::<Option<Vec<(usize, usize)>>>()
        else {
            return false;
        };

        // グループ内の全ペアのチェビシェフ距離が2以上か確認
        coords.iter().enumerate().all(|(i, &a)| {
            coords[i + 1..]
                .iter()
                .all(|&b| chebyshev_distance(a, b) >= 2)
        })
    })
}

fn chebyshev_distance((r1, c1): (usize, usize), (r2, c2): (usize, usize)) -> usize {
    r1.abs_diff(r2).max(c1.abs_diff(c2))
}

#[cfg(test)]
mod tests {
    use super::*;

    fn student(no: &str, fixed_seat: Option<i32>) -> Student {
        Student {
            student_no: no.into(),
            name: format!("生徒{no}"),
            romaji: String::new(),
            gender: "男".into(),
            is_dorm: false,
            is_abroad: false,
            fixed_seat,
        }
    }

    fn students(fixed: &[Option<i32>]) -> Vec<Student> {
        fixed
            .iter()
            .enumerate()
            .map(|(i, &f)| student(&(i + 1).to_string(), f))
            .collect()
    }

    fn data(seat_model: Vec<Vec<i32>>, students: Vec<Student>) -> Data {
        Data {
            title: "test".into(),
            teacher_name: None,
            sub_teacher_name: None,
            front_rows: 1,
            seat_model,
            students,
            history: vec![],
            front_student_num: vec![],
            separation_groups: vec![],
        }
    }

    fn sorted(mut v: Vec<i32>) -> Vec<i32> {
        v.sort_unstable();
        v
    }

    // --- 仕様A: 座席数と生徒数の一致 ---

    #[test]
    fn rejects_more_seats_than_students() {
        let d = data(vec![vec![0, 1], vec![2, 3]], students(&[None; 3]));
        let err = solve(&d).unwrap_err();
        assert!(err.contains("有効な座席数(4)と生徒数(3)が一致していません"), "{err}");
    }

    #[test]
    fn rejects_fewer_seats_than_students() {
        let d = data(vec![vec![0, 1, 2]], students(&[None; 4]));
        let err = solve(&d).unwrap_err();
        assert!(err.contains("有効な座席数(3)と生徒数(4)が一致していません"), "{err}");
    }

    #[test]
    fn aisles_are_not_counted_as_seats() {
        let d = data(vec![vec![0, -1, 1], vec![2, -1, 3]], students(&[None; 4]));
        let r = solve(&d).unwrap();
        assert_eq!(sorted(r.seats), vec![0, 1, 2, 3]);
    }

    #[test]
    fn empty_roster_is_rejected_before_seat_count() {
        let d = data(vec![vec![0, 1]], vec![]);
        assert!(solve(&d).unwrap_err().contains("名簿が空"));
    }

    #[test]
    fn candidates_come_from_actual_seat_ids() {
        // 連番でない座席ID。旧実装（0..生徒数）では必ず失敗していたケース
        let d = data(vec![vec![10, -1, 20], vec![30, -1, 40]], students(&[None; 4]));
        for _ in 0..50 {
            let r = solve(&d).unwrap();
            assert_eq!(sorted(r.seats), vec![10, 20, 30, 40]);
        }
    }

    #[test]
    fn never_reassigns_history_seat() {
        let mut d = data(vec![vec![0, 1], vec![2, 3]], students(&[None; 4]));
        d.history = vec![vec![0, 1, 2, 3]];
        for _ in 0..50 {
            let r = solve(&d).unwrap();
            assert!(r.seats.iter().enumerate().all(|(i, &s)| s != i as i32));
            assert_eq!(sorted(r.seats), vec![0, 1, 2, 3]);
        }
    }

    // --- 固定席の事前検証 ---

    #[test]
    fn respects_fixed_seat() {
        let d = data(vec![vec![0, 1], vec![2, 3]], students(&[None, Some(3), None, None]));
        for _ in 0..20 {
            assert_eq!(solve(&d).unwrap().seats[1], 3);
        }
    }

    #[test]
    fn rejects_duplicate_fixed_seat() {
        let d = data(
            vec![vec![0, 1], vec![2, 3]],
            students(&[Some(2), None, Some(2), None]),
        );
        let err = solve(&d).unwrap_err();
        assert!(err.contains("座席 2 に 1番 生徒1 と 3番 生徒3 が重複"), "{err}");
    }

    #[test]
    fn rejects_fixed_seat_out_of_range() {
        let d = data(vec![vec![0, 1], vec![2, 3]], students(&[None, Some(99), None, None]));
        let err = solve(&d).unwrap_err();
        assert!(err.contains("2番 生徒2 の固定席 99 は座席表に存在しません"), "{err}");
    }

    #[test]
    fn rejects_fixed_seat_on_aisle() {
        let d = data(vec![vec![0, -1, 1]], students(&[Some(-1), None]));
        let err = solve(&d).unwrap_err();
        assert!(err.contains("固定席 -1 は座席表に存在しません"), "{err}");
    }

    #[test]
    fn rejects_adjacent_fixed_seats_in_separation_group() {
        // 0 と 3 は斜めに隣接（チェビシェフ距離 1）
        let mut d = data(
            vec![vec![0, 1], vec![2, 3]],
            students(&[Some(0), Some(3), None, None]),
        );
        d.separation_groups = vec![vec![0, 1]];
        let err = solve(&d).unwrap_err();
        assert!(err.contains("1番 生徒1 と 2番 生徒2 が隣接する固定席（0 と 3）"), "{err}");
    }

    #[test]
    fn adjacent_fixed_seats_outside_group_are_allowed() {
        let mut d = data(
            vec![vec![0, 1], vec![2, 3]],
            students(&[Some(0), Some(3), None, None]),
        );
        d.separation_groups = vec![vec![2, 3]];
        // 生徒2・3は 1 と 2（斜め隣接）しか残らないので探索では解けないが、
        // 固定席の事前検証は通過してリトライ失敗に至ることを確認する
        let err = solve(&d).unwrap_err();
        assert!(err.contains("リトライ"), "{err}");
    }

    #[test]
    fn separated_fixed_seats_in_group_pass() {
        let mut d = data(vec![vec![0, 1, 2, 3]], students(&[Some(0), Some(3), None, None]));
        d.separation_groups = vec![vec![0, 1]];
        let r = solve(&d).unwrap();
        assert_eq!((r.seats[0], r.seats[1]), (0, 3));
    }

    #[test]
    fn fixed_seats_across_aisle_are_not_adjacent() {
        // 通路を挟むと列差 2 なので隣接扱いにならない
        let mut d = data(vec![vec![0, -1, 1]], students(&[Some(0), Some(1)]));
        d.separation_groups = vec![vec![0, 1]];
        assert_eq!(solve(&d).unwrap().seats, vec![0, 1]);
    }
}
