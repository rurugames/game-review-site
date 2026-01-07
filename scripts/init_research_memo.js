const fs = require('fs');
const path = require('path');

function usageAndExit() {
  console.log('Usage: node scripts/init_research_memo.js <RJxxxxxx> [--title "Title"]');
  process.exit(1);
}

function sanitizeForFilename(s) {
  return String(s || '')
    .replace(/[\\/:*?"<>|]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 60);
}

function parseArgs(argv) {
  const args = { rj: null, title: '' };
  const rest = argv.slice(2);
  if (!rest.length) return args;

  args.rj = rest[0];
  for (let i = 1; i < rest.length; i++) {
    const a = rest[i];
    if (a === '--title') {
      args.title = rest[i + 1] || '';
      i++;
    }
  }
  return args;
}

const { rj, title } = parseArgs(process.argv);
if (!rj) usageAndExit();

const upper = String(rj).toUpperCase();
if (!/^RJ\d{6,}$/.test(upper)) {
  console.error('Invalid RJ id:', rj);
  process.exit(1);
}

const safeTitle = sanitizeForFilename(title);
const filename = safeTitle ? `調査メモ_${upper}_${safeTitle}.md` : `調査メモ_${upper}.md`;
const filePath = path.join(process.cwd(), filename);

if (fs.existsSync(filePath)) {
  console.log('Already exists:', filePath);
  process.exit(0);
}

const content = `# 調査メモ（${upper}${safeTitle ? ` / ${safeTitle}` : ''}）

対象（必ずDLsiteを起点に確認）：
- 作品ID: ${upper}
- DLsite: https://www.dlsite.com/maniax/work/=/product_id/${upper}.html

---

## 統合メモ（この記事用の“材料”）

\`\`\`txt
[統合メモ]
- 共通して言える仕様/特徴（事実/一般化）:

- 攻略の定石（汎用化）:

- 詰まりやすい点（仮説として）:

- 良かった点の傾向（複数サイトで共通するもののみ）:

- 気になった点の傾向（複数サイトで共通するもののみ）:

- レビューコメントの引用（短い引用）:

- 記事で差分を作る切り口（3案）:
  - 初心者向け:
  - 時短/回収向け:
  - 雰囲気/没入向け:
\`\`\`

メモ：
- 「レビューコメントの引用（短い引用）」に書いた箇条書きは、記事本文にそのまま出ます。短くし、出典URLも併記してください。
`;

fs.writeFileSync(filePath, content, 'utf8');
console.log('Created:', filePath);
