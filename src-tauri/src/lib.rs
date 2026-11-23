mod solver;

use solver::{Data, SolveResult};

// async にすることで、リトライ中も UI スレッドをブロックしない
#[tauri::command]
async fn solve_seats(data: Data) -> Result<SolveResult, String> {
    solver::solve(&data)
}

// データの JSON 保存。ダイアログで保存先を選び、キャンセル時は false を返す
#[tauri::command]
async fn export_json(app: tauri::AppHandle, contents: String, file_name: String) -> Result<bool, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(path) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .set_file_name(file_name)
        .blocking_save_file()
    else {
        return Ok(false);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, contents).map_err(|e| format!("ファイルの保存に失敗しました: {e}"))?;
    Ok(true)
}

// JSON ファイルを選んで中身を返す。キャンセル時は None。中身の検証はフロント側で行う
#[tauri::command]
async fn import_json(app: tauri::AppHandle) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let Some(path) = app
        .dialog()
        .file()
        .add_filter("JSON", &["json"])
        .blocking_pick_file()
    else {
        return Ok(None);
    };
    let path = path.into_path().map_err(|e| e.to_string())?;
    let text = std::fs::read_to_string(&path).map_err(|e| format!("ファイルの読み込みに失敗しました: {e}"))?;
    Ok(Some(text))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            // updater はデスクトップ専用。モバイルビルドでコンパイルエラーにならないよう cfg で限定する
            #[cfg(desktop)]
            app.handle()
                .plugin(tauri_plugin_updater::Builder::new().build())?;
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![solve_seats, export_json, import_json])
        .run(tauri::generate_context!())
        .expect("Tauri の起動に失敗しました");
}
