// scripts/release-notes.mjs
// src/releaseNotes.json から GitHub リリース用の Markdown を出力する
//   node scripts/release-notes.mjs 1.2.0 > notes.md
//   gh release edit v1.2.0 --notes-file notes.md
import fs from 'fs';

const version = process.argv[2];
const notes = JSON.parse(fs.readFileSync('./src/releaseNotes.json', 'utf8'));
const note = notes.find((n) => n.version === version);
if (!note) {
  console.error(`Usage: node scripts/release-notes.mjs X.Y.Z（src/releaseNotes.json にあるバージョン）`);
  process.exit(1);
}

const lines = [`## v${note.version} の主な変更`];
for (const s of note.sections) {
  lines.push('', `### ${s.title}`);
  for (const it of s.items) {
    lines.push(`- ${it.title ? `**${it.title}**：` : ''}${it.text}`);
    for (const d of it.details ?? []) lines.push(`  - ${d}`);
  }
}
lines.push('', 'ダウンロードは下の Assets からどうぞ。');
process.stdout.write(lines.join('\n') + '\n');
