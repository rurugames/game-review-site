#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const PROCESSED_PATH = path.join(WORKSPACE_ROOT, "csvoutput", "processed_games.json");

const IDS_TO_APPEND = [
  // part3
  "RJ01529962",
  "RJ01542685",
  "RJ01511479",
  "RJ01542220",
  "RJ01542198",
  // part4
  "RJ01539118",
  "RJ01533974",
  "RJ01538606",
  "RJ01534758",
  "RJ01540133",
  // part5
  "RJ01483219",
  "RJ01443324",
  "RJ01536610",
  "RJ01534398",
  "RJ01525727",
  // part6
  "RJ01154283",
  "RJ01539256",
  "RJ01536338",
  "RJ01536074",
  "RJ01535700",
  // part7
  "RJ01533816",
  "RJ01531060",
  "RJ01523923",
  "RJ01520579",
  "RJ01519244",
  // part8
  "RJ01517577",
  "RJ01512233",
  "RJ01500613",
];

function detectNewline(text) {
  return text.includes("\r\n") ? "\r\n" : "\n";
}

function main() {
  const original = fs.readFileSync(PROCESSED_PATH, "utf8");
  const newline = detectNewline(original);

  let arr;
  try {
    arr = JSON.parse(original);
  } catch (e) {
    throw new Error(`Failed to parse processed_games.json as JSON: ${e.message}`);
  }
  if (!Array.isArray(arr)) throw new Error("processed_games.json is not a JSON array");

  const existing = new Set(arr);
  const toAdd = IDS_TO_APPEND.filter((id) => !existing.has(id));

  if (toAdd.length === 0) {
    console.log("No new IDs to append.");
    return;
  }

  // Append to the existing file without rewriting everything.
  // Assumes formatting: [\n  "RJ...",\n  "RJ..."\n]\n
  const trimmed = original.trimEnd();
  if (!trimmed.endsWith("]")) throw new Error("processed_games.json does not end with ]");

  const closeIndex = trimmed.lastIndexOf("]");
  let before = trimmed.slice(0, closeIndex);
  const after = trimmed.slice(closeIndex); // "]"

  before = before.trimEnd();
  if (before.endsWith("[")) {
    // Empty array
  } else if (!before.endsWith(",")) {
    before += ",";
  }

  const additions = toAdd
    .map((id) => `${newline}  ${JSON.stringify(id)},`)
    .join("");

  // Remove trailing comma from the last appended element.
  const additionsFixed = additions.replace(/,\s*$/, "");

  const updated = `${before}${additionsFixed}${newline}${after}${newline}`;
  fs.writeFileSync(PROCESSED_PATH, updated, "utf8");

  console.log(`Appended ${toAdd.length} IDs to processed_games.json`);
}

main();
