// scripts/bump.mjs
import fs from 'fs';

const newVersion = process.argv[2];
if (!newVersion) {
  console.error('Usage: node scripts/bump.mjs 1.0.1');
  process.exit(1);
}

// 0. アプリ内のリリースノート（更新後に一度だけ表示する）が書かれているか確認する
const notes = JSON.parse(fs.readFileSync("./src/releaseNotes.json", "utf8"));
if (!notes.some((n) => n.version === newVersion)) {
  console.error(`src/releaseNotes.json に v${newVersion} のリリースノートがありません。先頭に追加してから実行してください。`);
  process.exit(1);
}

// 1. package.json 更新
const pkgPath = './package.json';
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.version = newVersion;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');

// 2. Cargo.toml 更新
const cargoPath = './src-tauri/Cargo.toml';
let cargo = fs.readFileSync(cargoPath, 'utf8');
cargo = cargo.replace(/^version\s*=\s*".*?"/m, `version = "${newVersion}"`);
fs.writeFileSync(cargoPath, cargo);

console.log(`🚀 All versions bumped to v${newVersion} (SSOT achieved!)`);
