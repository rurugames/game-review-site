const fs = require('fs');
const path = require('path');

function normalizeNewlines(s) {
  return String(s || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
}

function readIfExists(filePath) {
  try {
    if (!fs.existsSync(filePath)) return null;
    return fs.readFileSync(filePath, 'utf8');
  } catch {
    return null;
  }
}

function findResearchMemoMarkdown(workspaceRoot, rj) {
  const upper = String(rj || '').toUpperCase();
  if (!/^RJ\d{6,}$/.test(upper)) return null;

  // Prefer common naming patterns if present; otherwise scan workspace root.
  const candidates = [];
  candidates.push(path.join(workspaceRoot, `調査メモ_${upper}.md`));

  try {
    const files = fs.readdirSync(workspaceRoot, { withFileTypes: true });
    for (const d of files) {
      if (!d.isFile()) continue;
      if (!d.name.endsWith('.md')) continue;
      if (d.name.startsWith('調査メモ_') && d.name.includes(upper)) {
        candidates.push(path.join(workspaceRoot, d.name));
      }
    }
  } catch {
    // ignore
  }

  for (const p of candidates) {
    const txt = readIfExists(p);
    if (txt) return { path: p, text: txt };
  }

  return null;
}

function extractTxtCodeBlockContaining(md, marker) {
  const s = normalizeNewlines(md);
  // Iterate all ```txt ... ``` blocks and return the first one that contains marker.
  const re = /```txt\n([\s\S]*?)```/g;
  let m;
  while ((m = re.exec(s))) {
    const body = m[1] || '';
    if (body.includes(marker)) return body;
  }
  return null;
}

function parseSectionBullets(txtBlock, headingLine) {
  const lines = normalizeNewlines(txtBlock).split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === headingLine.trim());
  if (startIdx === -1) return [];

  const out = [];
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*-\s+[^-]/.test(line) && !/^\s{2,}-\s+/.test(line)) {
      // Next top-level bullet starts => section ends
      break;
    }
    const m = line.match(/^\s{2,}-\s+(.*)$/);
    if (m && m[1]) {
      const v = m[1].trim();
      if (v) out.push(v);
    }
  }
  return out;
}

function parseAngleBullets(txtBlock) {
  const lines = normalizeNewlines(txtBlock).split('\n');
  const startIdx = lines.findIndex((l) => l.trim() === '- 記事で差分を作る切り口（3案）:');
  if (startIdx === -1) return null;

  const angles = {};
  for (let i = startIdx + 1; i < lines.length; i++) {
    const line = lines[i];
    if (/^\s*-\s+[^-]/.test(line) && !/^\s{2,}-\s+/.test(line)) break;

    const m = line.match(/^\s{2,}-\s+([^:]+):\s*(.*)$/);
    if (m) {
      const k = String(m[1] || '').trim();
      const v = String(m[2] || '').trim();
      if (k) angles[k] = v;
    }
  }

  return Object.keys(angles).length ? angles : null;
}

function loadResearchMemo(workspaceRoot, rj) {
  const found = findResearchMemoMarkdown(workspaceRoot, rj);
  if (!found) return null;

  const block = extractTxtCodeBlockContaining(found.text, '[統合メモ]');
  if (!block) return { sourcePath: found.path };

  const features = parseSectionBullets(block, '- 共通して言える仕様/特徴（事実/一般化）:');
  const tips = parseSectionBullets(block, '- 攻略の定石（汎用化）:');
  const pitfalls = parseSectionBullets(block, '- 詰まりやすい点（仮説として）:');
  const pros = parseSectionBullets(block, '- 良かった点の傾向（複数サイトで共通するもののみ）:');
  const cons = parseSectionBullets(block, '- 気になった点の傾向（複数サイトで共通するもののみ）:');
  const angles = parseAngleBullets(block);

  return {
    sourcePath: found.path,
    features,
    tips,
    pitfalls,
    pros,
    cons,
    angles,
  };
}

module.exports = {
  loadResearchMemo,
};
