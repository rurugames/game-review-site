#!/usr/bin/env node
"use strict";

const fs = require("fs");
const path = require("path");

const WORKSPACE_ROOT = path.resolve(__dirname, "..");
const FETCHED_PATH = path.join(WORKSPACE_ROOT, "csvoutput", "fetched_games_2026-01.json");
const OUT_DIR = path.join(WORKSPACE_ROOT, "csvoutput");

const HEADER =
  "タイトル,ゲームタイトル,説明,本文,ジャンル,評価,画像URL,ステータス,発売日,タグ,アフィリエイトリンク";

// Remaining R18 (28) were pre-identified; part3 already created manually.
const IDS_BY_PART = {
  4: [
    "RJ01539118",
    "RJ01533974",
    "RJ01538606",
    "RJ01534758",
    "RJ01540133",
  ],
  5: [
    "RJ01483219",
    "RJ01443324",
    "RJ01536610",
    "RJ01534398",
    "RJ01525727",
  ],
  6: [
    "RJ01154283",
    "RJ01539256",
    "RJ01536338",
    "RJ01536074",
    "RJ01535700",
  ],
  7: [
    "RJ01533816",
    "RJ01531060",
    "RJ01523923",
    "RJ01520579",
    "RJ01519244",
  ],
  8: ["RJ01517577", "RJ01512233", "RJ01500613"],
};

function inferGenre(workFormat) {
  const wf = String(workFormat || "");
  if (/RPG|ロールプレイング/i.test(wf)) return "RPG";
  if (/シミュレーション/.test(wf)) return "シミュレーション";
  if (/アクション/.test(wf)) return "アクション";
  if (/アドベンチャー/.test(wf)) return "アドベンチャー";
  if (/ノベル/.test(wf)) return "ノベル";
  return "その他";
}

function pickTags(tags) {
  const blacklist = new Set(["R18", "PC", "同人ゲーム"]);
  const result = [];
  for (const t of Array.isArray(tags) ? tags : []) {
    if (!t) continue;
    if (blacklist.has(t)) continue;
    if (result.includes(t)) continue;
    result.push(t);
    if (result.length >= 6) break;
  }
  return result;
}

function csvQuote(value) {
  const s = String(value ?? "");
  const escaped = s.replace(/\u0000/g, "").replace(/"/g, '""');
  return `"${escaped}"`;
}

function buildBody(game, genre) {
  const title = game.title || game.id;
  const dl = game.dlsiteUrl || "";
  const tags = pickTags(game.tags);
  const tagText = tags.length ? `主な要素: ${tags.join(" / ")}` : "";

  const overview =
    genre === "RPG"
      ? "短編〜中編で遊びやすいRPG作品として、成長と突破の気持ちよさを重視したタイプです。"
      : genre === "アクション"
        ? "操作と反射で押し切るより、状況判断で安全に進める攻略が鍵になるアクション系です。"
        : genre === "シミュレーション"
          ? "パラメータ管理と選択の積み重ねで結果が変わる、回収型のシミュレーション寄り作品です。"
          : genre === "アドベンチャー"
            ? "探索と読み進めを中心に、イベント回収で満足度が上がるアドベンチャー寄り作品です。"
            : "作品の導線を掴むとテンポ良く進められるタイプです。";

  const tips =
    genre === "RPG"
      ? "- 序盤は装備更新を優先\n- 回復アイテムは出し惜しみしない\n- 詰まったら育成方針を1点集中で見直す"
      : genre === "アクション"
        ? "- まず安全な移動ルートを固定\n- 被弾が増える場面は引き撃ち/距離取り\n- 1回の挑戦で欲張らず、確実に進行"
        : genre === "シミュレーション"
          ? "- 目的(回収/生存/分岐)を決めて行動を固定\n- 詰まったら直前ではなく少し前から組み直す\n- 分岐前セーブで回収効率UP"
          : "- 進行に必要な条件を先に整理\n- 戻りを減らすためにメモ/セーブ分け\n- 詰まったら未回収のフラグを潰す";

  const review =
    "テンポ重視で遊びたい人は、まず短時間プレイで“勝ち筋”を掴むのがおすすめ。";

  return (
    `[${title}](${dl})\n\n` +
    `## ゲーム概要\n${overview}\n${tagText ? `\n${tagText}\n` : "\n"}` +
    `\n## 攻略ポイント\n${tips}\n` +
    `\n## プレイレビュー\n${review}\n` +
    `\n## 総合評価\nおすすめ度: 8/10。`
  );
}

function writePart(partNumber, gamesById) {
  const ids = IDS_BY_PART[partNumber];
  const outPath = path.join(OUT_DIR, `articles_2026-01_part${partNumber}.csv`);

  const rows = [HEADER];
  for (const id of ids) {
    const game = gamesById.get(id);
    if (!game) {
      throw new Error(`Missing game data for ${id} in fetched JSON`);
    }

    const genre = inferGenre(game.workFormat);
    const articleTitle = `【${genre}】${game.title} 攻略・レビュー`;
    const desc =
      (game.description || "").trim().slice(0, 120) ||
      `${genre}作品。発売日:${game.releaseDate}。`;

    const body = buildBody(game, genre);
    const rating = 8;
    const tags = pickTags(game.tags).join(",");

    const row = [
      csvQuote(articleTitle),
      csvQuote(game.title || ""),
      csvQuote(desc),
      csvQuote(body),
      csvQuote(genre),
      String(rating),
      csvQuote(game.imageUrl || ""),
      csvQuote("draft"),
      csvQuote(game.releaseDate || ""),
      csvQuote(tags),
      csvQuote(game.dlsiteUrl || ""),
    ].join(",");

    rows.push(row);
  }

  fs.writeFileSync(outPath, rows.join("\n") + "\n", "utf8");
  console.log(`Wrote ${outPath} (${ids.length} rows)`);
}

function main() {
  const fetched = JSON.parse(fs.readFileSync(FETCHED_PATH, "utf8"));
  const gamesById = new Map();
  for (const g of fetched) {
    if (g && g.id) gamesById.set(g.id, g);
  }

  for (const partNumber of [4, 5, 6, 7, 8]) {
    writePart(partNumber, gamesById);
  }
}

main();
