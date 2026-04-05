/**
 * R2バケット内の全画像をスキャンしてMongoDBのギャラリーに同期するスクリプト。
 * 既にr2Keyが登録済みのものはスキップ（重複なし）。
 * サブフォルダも再帰的に処理する。
 *
 * メタデータの優先順位:
 *   1. .metadata.json（Copilotエージェントによる事前解析結果）
 *   2. OpenAI Vision（OPENAI_API_KEYが設定されている場合）
 *   3. 連番フォールバック（アニメN）
 *
 * 使い方: node scripts/sync_r2_gallery.js
 */
require('dotenv').config();
const fs = require('fs');
const mongoose = require('mongoose');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const GalleryImage = require('../models/GalleryImage');
const { analyzeImage, buildMeta, initCounters, mimeFromExt, sleep } = require('../lib/imageMetaFromAI');
const path = require('path');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

const s3 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function downloadFromR2(bucket, key) {
  const res = await s3.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

// Cloudflare REST API でオブジェクト一覧を取得（S3 APIエンドポイントのTLS問題を回避）
async function listAllImages(accountId, bucket, apiToken) {
  const imageKeys = [];
  let cursor;
  do {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`);
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    if (!res.ok) {
      const text = await res.text();
      throw new Error(`Cloudflare API error ${res.status}: ${text}`);
    }
    const data = await res.json();
    const objects = Array.isArray(data.result) ? data.result : [];
    for (const obj of objects) {
      const key = obj.key;
      const dot = key.lastIndexOf('.');
      if (dot !== -1 && IMAGE_EXTS.has(key.substring(dot).toLowerCase())) {
        imageKeys.push(key);
      }
    }
    cursor = data.result_info?.truncated ? data.result_info?.cursor : null;
  } while (cursor);
  return imageKeys;
}

async function run() {
  await mongoose.connect(process.env.MONGODB_URI);
  console.log('MongoDB接続OK');

  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');

  // Copilotエージェントの事前解析結果を読み込む
  const METADATA_FILE = path.join(__dirname, '../.metadata.json');
  let agentAnalysis = {};
  if (fs.existsSync(METADATA_FILE)) {
    try {
      agentAnalysis = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
      console.log(`[Meta] Copilotエージェント解析メタデータを読み込みました (${Object.keys(agentAnalysis).length} 件)`);
    } catch (e) {
      console.warn('[Meta] .metadata.json のパースに失敗:', e.message);
    }
  }
  const hasAgentMeta = Object.keys(agentAnalysis).length > 0;
  const hasAI = !hasAgentMeta && !!process.env.OPENAI_API_KEY;

  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN が設定されていません');

  console.log(`R2バケット「${bucket}」を一覧取得中...`);
  const imageKeys = await listAllImages(accountId, bucket, apiToken);
  console.log(`画像ファイル ${imageKeys.length} 件検出 / 解析: ${hasAgentMeta ? 'Copilotエージェント' : hasAI ? 'OpenAI Vision' : '連番フォールバック'}`);

  const existing = new Set(
    (await GalleryImage.find({}, 'r2Key').lean()).map(d => d.r2Key)
  );
  console.log(`既存DB登録数: ${existing.size} 件`);

  const newKeys = imageKeys.filter(k => !existing.has(k));
  console.log(`新規追加対象: ${newKeys.length} 件`);

  if (newKeys.length === 0) {
    console.log('追加すべき新規画像はありません。');
    await mongoose.disconnect();
    return;
  }

  const counters = await initCounters(GalleryImage);
  console.log(`[Init] DBから各フォルダの採番カウンタを初期化しました`);

  let added = 0;
  let skipped = 0;

  for (const key of newKeys) {
    // R2キーの第1階層フォルダをシリーズ名として使用
    // 例: "Re:ゼロから始める異世界生活/char1.jpg" → folder = "Re:ゼロから始める異世界生活"
    const keyParts = key.split('/');
    const folderName = keyParts.length > 1 ? keyParts[0] : null;

    let title, tags;

    if (agentAnalysis[key]) {
      // Copilotエージェントの解析結果を使用
      const a = agentAnalysis[key];
      ({ title, tags } = buildMeta(a, counters, folderName));
      console.log(`  [Meta] ${key}: title="${title}" tags=${JSON.stringify(tags)}`);
    } else if (hasAI) {
      try {
        const ext = path.extname(key);
        const imageBuffer = await downloadFromR2(bucket, key);
        const mimeType = mimeFromExt(ext);
        const analysis = await analyzeImage(imageBuffer, mimeType);
        console.log(`  [AI] ${key}: type=${analysis.type}`);
        ({ title, tags } = buildMeta(analysis, counters, folderName));
        await sleep(500);
      } catch (err) {
        console.warn(`  [AI] ${key} 解析失敗、フォールバック: ${err.message}`);
        ({ title, tags } = buildMeta({ type: 'normal' }, counters, folderName));
      }
    } else {
      ({ title, tags } = buildMeta({ type: 'normal' }, counters, folderName));
    }

    try {
      await GalleryImage.create({
        title,
        r2Key: key,
        r2Url: `${publicBase}/${key}`,
        description: '',
        tags,
        status: 'published',
      });
      added++;
      console.log(`  追加: "${title}" tags=${JSON.stringify(tags)} [${key}]`);
    } catch (err) {
      if (err.code === 11000) {
        skipped++;
        console.log(`  スキップ（重複）: ${key}`);
      } else {
        console.error(`  DB登録失敗: ${key}`, err.message);
      }
    }
  }

  // .metadata.json を削除
  if (fs.existsSync(METADATA_FILE)) {
    fs.unlinkSync(METADATA_FILE);
    console.log('[Clean] .metadata.json を削除しました');
  }

  console.log(`\n完了 — 追加: ${added} 件 / スキップ（重複）: ${skipped} 件`);
  await mongoose.disconnect();
}

run().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
