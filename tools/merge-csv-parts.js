#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

function stripBOM(text) {
  return text.replace(/^\uFEFF/, "");
}

function splitHeaderAndRest(text) {
  const idxLF = text.indexOf("\n");
  if (idxLF === -1) {
    return { header: text.trimEnd(), rest: "" };
  }
  const headerLine = text.slice(0, idxLF);
  const rest = text.slice(idxLF + 1);
  // If header line ended with CRLF, headerLine includes CR; normalize it out.
  const header = headerLine.replace(/\r$/, "");
  return { header, rest };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length < 2) {
    console.error(
      "Usage: node tools/merge-csv-parts.js <outPath> <part1.csv> <part2.csv> ..."
    );
    process.exit(2);
  }

  const outPath = args[0];
  const partPaths = args.slice(1);

  let header = null;
  let merged = "";

  for (let i = 0; i < partPaths.length; i++) {
    const p = partPaths[i];
    const abs = path.resolve(p);
    let text = fs.readFileSync(abs, "utf8");
    text = stripBOM(text);

    const { header: thisHeader, rest } = splitHeaderAndRest(text);
    if (!header) header = thisHeader;
    if (thisHeader !== header) {
      throw new Error(`Header mismatch in ${p}`);
    }

    if (i === 0) {
      // Keep header + rest of first file as-is.
      merged = `${header}\r\n${rest}`;
    } else {
      // Append everything after the first header line.
      merged += rest;
    }
  }

  if (!header) throw new Error("No header found from parts");

  // Ensure CRLF in the final output.
  merged = merged.replace(/\r\n/g, "\n").replace(/\r/g, "\n").replace(/\n/g, "\r\n");

  const out = Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(merged, "utf8")]);
  fs.writeFileSync(path.resolve(outPath), out);

  console.log(`OK: wrote ${outPath}`);
}

main();
