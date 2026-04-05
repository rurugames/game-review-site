/**
 * R2バケット内の全画像をローカルの uploads/gallery/ にダウンロードするスクリプト。
 * フォルダ構造を維持して保存します。
 *   R2: 女神のカフェテラス/image.png
 *   ↓
 *   ローカル: uploads/gallery/女神のカフェテラス/image.png
 *
 * 使い方: node scripts/download_r2_gallery.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');

const API_TOKEN  = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const BUCKET     = process.env.R2_BUCKET_NAME || 'mytool-gallery';
const PUBLIC_BASE = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');
const UPLOADS_DIR = path.join(__dirname, '../uploads/gallery');
const IMAGE_EXTS  = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

if (!API_TOKEN)  { console.error('CLOUDFLARE_API_TOKEN が未設定です'); process.exit(1); }
if (!PUBLIC_BASE) { console.error('R2_PUBLIC_DOMAIN が未設定です'); process.exit(1); }

/** Cloudflare REST API でオブジェクト一覧を取得 */
async function listAllObjects() {
  const keys = [];
  let cursor;
  do {
    const url = new URL(
      `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects`
    );
    if (cursor) url.searchParams.set('cursor', cursor);
    const res = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    const data = await res.json();
    for (const obj of (Array.isArray(data.result) ? data.result : [])) {
      keys.push(obj.key);
    }
    cursor = data.result_info?.truncated ? data.result_info?.cursor : null;
  } while (cursor);
  return keys;
}

/** 公開URL経由でファイルをダウンロードして Buffer で返す */
async function downloadFile(key) {
  const url = `${PUBLIC_BASE}/${key.split('/').map(encodeURIComponent).join('/')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Download failed ${res.status}: ${url}`);
  const buf = await res.arrayBuffer();
  return Buffer.from(buf);
}

async function run() {
  console.log(`R2バケット「${BUCKET}」の画像一覧を取得中...`);
  const allKeys = await listAllObjects();

  // 画像ファイルのみ
  const imageKeys = allKeys.filter(k => {
    const dot = k.lastIndexOf('.');
    return dot !== -1 && IMAGE_EXTS.has(k.substring(dot).toLowerCase());
  });

  console.log(`画像ファイル: ${imageKeys.length} 件`);
  if (imageKeys.length === 0) {
    console.log('ダウンロード対象がありません。');
    return;
  }

  let downloaded = 0, skipped = 0, errors = 0;

  for (const key of imageKeys) {
    // ローカル保存先を決定
    const localPath = path.join(UPLOADS_DIR, key);
    const localDir  = path.dirname(localPath);

    // 既にローカルに存在する場合はスキップ
    if (fs.existsSync(localPath)) {
      console.log(`  スキップ（既存）: ${key}`);
      skipped++;
      continue;
    }

    // フォルダ作成
    if (!fs.existsSync(localDir)) {
      fs.mkdirSync(localDir, { recursive: true });
    }

    try {
      process.stdout.write(`  ダウンロード中: ${key} ... `);
      const buf = await downloadFile(key);
      fs.writeFileSync(localPath, buf);
      console.log(`完了 (${(buf.length / 1024).toFixed(1)} KB)`);
      downloaded++;
    } catch (e) {
      console.error(`失敗: ${e.message}`);
      errors++;
    }
  }

  console.log(`\n完了 — ダウンロード: ${downloaded} 件 / スキップ（既存）: ${skipped} 件 / エラー: ${errors} 件`);
  console.log(`保存先: ${UPLOADS_DIR}`);
}

run().catch(e => { console.error('エラー:', e.message); process.exit(1); });
