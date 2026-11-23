//! 席替えの探索ロジック。Tauri に依存しない純粋な処理だけを置く。

use rand::seq::IteratorRandom;
use serde::{Deserialize, Serialize};
use std::collections::{hash_map::Entry, HashMap, HashSet};

/// 離すグループの生徒同士に求めるチェビシェフ距離の下限（上下左右・斜めの隣接を禁止）
const MIN_SEPARATION: usize = 2;
const MAX_RETRIES: usize = 1000;

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

#[derive(Serialize, Deserialize, Debug)]
pub struct Data {
    pub title: String,
    pub teacher_name: Option<String>,
    pub sub_teacher_name: Option<String>,
    pub front_rows: usize,
    /// 座席ID の二次元配列。負の値は通路
    pub seat_model: Vec<Vec<i32>>,
    pub students: Vec<Student>,
    /// history[回][生徒] = その回に座った座席ID
    pub history: Vec<Vec<i32>>,
    /// 前列に座らせる生徒のインデックス
    pub front_student_num: Vec<i32>,
    pub separation_groups: Vec<Vec<usize>>,
}

#[derive(Serialize, Debug)]
pub struct SolveResult {
    /// seats[i] = i 番目の生徒（students 配列順）の座席番号
    pub seats: Vec<i32>,
    pub retries: usize,
}

type Coord = (usize, usize);
type CoordMap = HashMap<i32, Coord>;

pub fn solve(data: &Data) -> Result<SolveResult, String> {
    let seat_ids = collect_seat_ids(&data.seat_model);
    validate_input(data, &seat_ids)?;

    let coord_map = build_coord_map(&data.seat_model);
    // リトライに入る前に、固定席の矛盾を決定的に検出する
    validate_fixed_seats(&data.students, &data.separation_groups, &coord_map)?;

    let candidates = build_candidates(data, &seat_ids);
    if candidates.iter().any(Vec::is_empty) {
        return Err("この条件で使用可能な座席が存在しない生徒がいます。前列指定・固定席・履歴を見直してください。".into());
    }

    for retries in 0..=MAX_RETRIES {
        let Some(seats) = assign_seats(&candidates) else { continue };
        if is_separation_valid(&seats, &data.separation_groups, &coord_map) {
            return Ok(SolveResult { seats, retries });
        }
    }
    Err(format!(
        "{MAX_RETRIES}回リトライしましたが失敗しました。条件を見直してください。"
    ))
}

// ---------------------------------------------------------------------------
// 入力検証
// ---------------------------------------------------------------------------

fn validate_input(data: &Data, seat_ids: &[i32]) -> Result<(), String> {
    let n = data.students.len();
    if n == 0 {
        return Err("名簿が空です。生徒を追加してください。".into());
    }
    // 座席数と生徒数の完全一致を仕様とする（空席・席不足は運用上の不整合として扱う）
    if seat_ids.len() != n {
        return Err(format!(
            "有効な座席数({})と生徒数({n})が一致していません。レイアウトの座席数を調整してください。",
            seat_ids.len()
        ));
    }
    if data.history.iter().any(|round| round.len() != n) {
        return Err("履歴の人数と名簿の人数が一致しません。履歴をクリアしてください。".into());
    }
    if data.separation_groups.iter().flatten().any(|&i| i >= n) {
        return Err("離すグループに存在しない生徒が含まれています。".into());
    }
    Ok(())
}

/// 固定席の異常（存在しない席・重複・離すグループ同士の隣接）を探索前に検出する
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
                "{} の固定席 {seat} は座席表に存在しません（範囲外または通路です）。",
                student_label(s)
            ));
        }
        match owner.entry(seat) {
            Entry::Occupied(e) => {
                return Err(format!(
                    "座席 {seat} に {} と {} が重複して固定されています。",
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
        for (&(i, seat_a), &(j, seat_b)) in pairs(&fixed) {
            if i != j && is_too_close(coord_map[&seat_a], coord_map[&seat_b]) {
                return Err(format!(
                    "離すグループの {} と {} が隣接する固定席（{seat_a} と {seat_b}）に指定されています。固定席か離すグループを見直してください。",
                    student_label(&students[i]),
                    student_label(&students[j]),
                ));
            }
        }
    }
    Ok(())
}

fn student_label(s: &Student) -> String {
    if s.name.is_empty() {
        format!("{}番", s.student_no)
    } else {
        format!("{}番 {}", s.student_no, s.name)
    }
}

// ---------------------------------------------------------------------------
// 座席の割り当て
// ---------------------------------------------------------------------------

/// 生徒ごとに座ってよい座席の候補を作る。
/// - 固定席の生徒: その席だけ
/// - それ以外: 過去に座った席と他人の固定席を除く。前列指定の生徒は前列の範囲に限る
fn build_candidates(data: &Data, seat_ids: &[i32]) -> Vec<Vec<i32>> {
    let front_seat_max = data
        .seat_model
        .iter()
        .take(data.front_rows)
        .flatten()
        .copied()
        .max()
        .unwrap_or(0);
    let fixed_seats: HashSet<i32> = data.students.iter().filter_map(|s| s.fixed_seat).collect();

    data.students
        .iter()
        .enumerate()
        .map(|(i, student)| {
            if let Some(fixed) = student.fixed_seat {
                return vec![fixed];
            }
            let needs_front = data.front_student_num.contains(&(i as i32));
            seat_ids
                .iter()
                .copied()
                .filter(|&seat| !data.history.iter().any(|round| round[i] == seat))
                .filter(|&seat| !needs_front || seat <= front_seat_max)
                .filter(|seat| !fixed_seats.contains(seat))
                .collect()
        })
        .collect()
}

/// 候補の少ない生徒から順に、まだ空いている候補席をランダムに割り当てる。
/// 途中で誰かの候補が尽きたら None を返す（呼び出し側でリトライする）
fn assign_seats(candidates: &[Vec<i32>]) -> Option<Vec<i32>> {
    let mut rng = rand::rng();
    let mut order: Vec<usize> = (0..candidates.len()).collect();
    order.sort_by_key(|&i| candidates[i].len());

    let mut seats = vec![-1; candidates.len()]; // 成功時は全員分上書きされる
    let mut taken = HashSet::new();
    for i in order {
        let seat = candidates[i]
            .iter()
            .copied()
            .filter(|seat| !taken.contains(seat))
            .choose(&mut rng)?;
        taken.insert(seat);
        seats[i] = seat;
    }
    Some(seats)
}

/// 離すグループ内のどの 2 人も隣接していないか
fn is_separation_valid(
    seats: &[i32],
    separation_groups: &[Vec<usize>],
    coord_map: &CoordMap,
) -> bool {
    separation_groups.iter().all(|group| {
        // 座標が見つからない座席があれば不正として扱う
        let Some(coords) = group
            .iter()
            .map(|&i| coord_map.get(&seats[i]).copied())
            .collect::<Option<Vec<Coord>>>()
        else {
            return false;
        };
        let all_apart = pairs(&coords).all(|(&a, &b)| !is_too_close(a, b));
        all_apart
    })
}

// ---------------------------------------------------------------------------
// 座標・汎用ヘルパー
// ---------------------------------------------------------------------------

/// seat_model 上の有効な座席ID（通路を除く）を列挙
fn collect_seat_ids(seat_model: &[Vec<i32>]) -> Vec<i32> {
    seat_model.iter().flatten().copied().filter(|&v| is_seat(v)).collect()
}

/// 座席ID → (行, 列)。通路は座席ではないので登録しない
fn build_coord_map(seat_model: &[Vec<i32>]) -> CoordMap {
    seat_model
        .iter()
        .enumerate()
        .flat_map(|(r, row)| row.iter().enumerate().map(move |(c, &id)| (id, (r, c))))
        .filter(|&(id, _)| is_seat(id))
        .collect()
}

fn is_seat(id: i32) -> bool {
    id >= 0
}

fn is_too_close(a: Coord, b: Coord) -> bool {
    chebyshev_distance(a, b) < MIN_SEPARATION
}

fn chebyshev_distance((r1, c1): Coord, (r2, c2): Coord) -> usize {
    r1.abs_diff(r2).max(c1.abs_diff(c2))
}

/// スライス内の全ての組 (items[i], items[j]) (i < j) を列挙
fn pairs<T>(items: &[T]) -> impl Iterator<Item = (&T, &T)> {
    items
        .iter()
        .enumerate()
        .flat_map(move |(k, a)| items[k + 1..].iter().map(move |b| (a, b)))
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

    // --- 前列指定 ---

    #[test]
    fn front_students_stay_in_front_rows() {
        let mut d = data(vec![vec![0, 1], vec![2, 3]], students(&[None; 4]));
        d.front_student_num = vec![0, 2];
        for _ in 0..50 {
            let r = solve(&d).unwrap();
            assert!(r.seats[0] <= 1 && r.seats[2] <= 1, "{:?}", r.seats);
        }
    }
}
