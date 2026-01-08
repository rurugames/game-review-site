#!/usr/bin/env node
"use strict";

const fs = require("fs");

const EXPECTED_HEADER =
  "タイトル,ゲームタイトル,説明,本文,ジャンル,評価,画像URL,ステータス,発売日,タグ,アフィリエイトリンク";

function usageAndExit() {
  console.error("Usage: node tools/fix-csv.js <csvPath> [--no-header-check]");
  process.exit(2);
}

function stripLeadingWeirdChars(text) {
  // Remove BOM and any leading control chars before first printable char.
  let t = text;
  t = t.replace(/^\uFEFF/, "");
  // Strip ASCII control chars (except CR/LF/TAB) at start.
  t = t.replace(/^[\u0000-\u0008\u000B\u000C\u000E-\u001F]+/, "");
  return t;
}

function normalizeNewlinesToLF(text) {
  return text.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
}

function removeTrailingBlankLines(lines) {
  let end = lines.length;
  while (end > 0 && lines[end - 1].trim() === "") end--;
  return lines.slice(0, end);
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 1) usageAndExit();

  const csvPath = args[0];
  const noHeaderCheck = args.includes("--no-header-check");

  const rawBuf = fs.readFileSync(csvPath);
  let text = rawBuf.toString("utf8");

  text = stripLeadingWeirdChars(text);
  text = normalizeNewlinesToLF(text);

  // Remove NULs and other non-printable controls inside.
  text = text.replace(/\u0000/g, "");

  let lines = text.split("\n");
  lines = removeTrailingBlankLines(lines);

  if (lines.length === 0) {
    throw new Error("CSV is empty after normalization");
  }

  const header = lines[0].replace(/^\uFEFF/, "").trimEnd();
  if (!noHeaderCheck && header !== EXPECTED_HEADER) {
    throw new Error(
      `Unexpected header.\nExpected: ${EXPECTED_HEADER}\nActual:   ${header}`
    );
  }

  const normalized = lines.join("\r\n") + "\r\n";
  const out = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(normalized, "utf8")]);
  fs.writeFileSync(csvPath, out);

  console.log(`OK: normalized ${csvPath} (lines=${lines.length - 1})`);
}

main();
