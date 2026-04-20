/**
 * ローカルフォルダの画像を R2 にアップロードして MongoDB ギャラリーに登録するスクリプト。
 *
 * フォルダ構造:
 *   uploads/gallery/フォルダ名/画像.png              → R2キー: フォルダ名/画像.png
 *   uploads/gallery/フォルダ名/サブフォルダ/画像.png → R2キー: フォルダ名/サブフォルダ/画像.png
 *   uploads/gallery/画像.png                         → R2キー: 画像.png（その他扱い）
 *
 * フォルダ名が自動的にタグとタイトルに使用されます。
 * 使い方: node scripts/upload_gallery.js
 */
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const GalleryImage = require('../models/GalleryImage');
const { analyzeImage, buildMeta, initCounters, mimeFromExt, sleep } = require('../lib/imageMetaFromAI');
require('dotenv').config();

const UPLOADS_DIR = path.join(__dirname, '../uploads/gallery');
const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

// アップロードフォルダが存在しない場合は作成
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

if (!process.env.CLOUDFLARE_API_TOKEN) {
  console.error('[Error] CLOUDFLARE_API_TOKEN が .env に設定されていません。');
  process.exit(1);
}

const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;
const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const BUCKET = process.env.R2_BUCKET_NAME || 'mytool-gallery';
const PUBLIC_BASE = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');

/**
 * Cloudflare REST API 経由で R2 にファイルをアップロード
 */
async function uploadToR2(r2Key, fileBuffer, contentType) {
  const encodedKey = r2Key.split('/').map(encodeURIComponent).join('/');
  const url = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET}/objects/${encodedKey}`;
  const res = await fetch(url, {
    method: 'PUT',
    headers: {
      'Authorization': `Bearer ${API_TOKEN}`,
      'Content-Type': contentType,
    },
    body: fileBuffer,
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`R2 PUT 失敗 (${res.status}): ${text}`);
  }
}

/**
 * uploads/gallery を再帰スキャンして画像ファイルを返す
 * @returns {{ localPath: string, r2Key: string, folderName: string|null }[]}
 */
function scanUploadDir() {
  const results = [];

  function walkDirectory(currentDir, folderName = null) {
    const entries = fs.readdirSync(currentDir, { withFileTypes: true });

    for (const entry of entries) {
      if (entry.name.startsWith('.')) continue;

      const fullPath = path.join(currentDir, entry.name);

      if (entry.isDirectory()) {
        const nextFolderName = folderName || path.relative(UPLOADS_DIR, fullPath).split(path.sep)[0] || null;
        walkDirectory(fullPath, nextFolderName);
        continue;
      }

      if (!entry.isFile()) continue;

      const ext = path.extname(entry.name).toLowerCase();
      if (!IMAGE_EXTS.has(ext)) continue;

      const relativePath = path.relative(UPLOADS_DIR, fullPath).split(path.sep).join('/');
      results.push({
        localPath: fullPath,
        r2Key: relativePath,
        folderName,
      });
    }
  }

  walkDirectory(UPLOADS_DIR);
  return results;
}

const processUploads = async () => {
  try {
    const targets = scanUploadDir();

    if (targets.length === 0) {
      console.log('アップロード待ちの画像ファイルがありません。');
      console.log(`対象フォルダ: ${UPLOADS_DIR}`);
      console.log('  └ サブフォルダ構成例: uploads/gallery/女神のカフェテラス/image.png');
      return;
    }

    // Copilot エージェントが事前に生成したメタデータを読み込む
    const METADATA_FILE = path.join(UPLOADS_DIR, '.metadata.json');
    let agentAnalysis = {};
    if (fs.existsSync(METADATA_FILE)) {
      try {
        agentAnalysis = JSON.parse(fs.readFileSync(METADATA_FILE, 'utf8'));
        console.log(`[Meta] エージェント解析メタデータを読み込みました (${Object.keys(agentAnalysis).length} 件)`);
      } catch (e) {
        console.warn('[Meta] .metadata.json のパースに失敗:', e.message);
      }
    }

    const hasAgentMeta = Object.keys(agentAnalysis).length > 0;
    const hasAI = !hasAgentMeta && !!process.env.OPENAI_API_KEY;
    console.log(`${targets.length} 件の画像を R2 にアップロードします...`);
    console.log(`解析モード: ${hasAgentMeta ? 'Copilotエージェント' : hasAI ? 'OpenAI Vision' : '連番フォールバック'}`);

    // MongoDB 接続
    await mongoose.connect(process.env.MONGODB_URI, { serverSelectionTimeoutMS: 5000 });
    console.log('MongoDB: Connected');

    // r2Key の重複チェック用
    const existing = new Set(
      (await GalleryImage.find({}, 'r2Key').lean()).map(d => d.r2Key)
    );

    // 採番カウンタ
    const counters = await initCounters(GalleryImage);
    console.log(`[Init] DBから各フォルダの採番カウンタを初期化しました`);

    let added = 0, skipped = 0, errors = 0;

    for (const { localPath, r2Key, folderName } of targets) {
      const fileName = path.basename(localPath);
      console.log(`\n[Upload] ${r2Key}`);

      // 既にDBに登録済みならスキップ
      if (existing.has(r2Key)) {
        console.log(`  スキップ（既登録）`);
        skipped++;
        continue;
      }

      try {
        const fileBuffer = fs.readFileSync(localPath);
        const ext = path.extname(fileName).toLowerCase();
        const contentType = mimeFromExt(ext);

        // R2 アップロード（Cloudflare REST API）
        await uploadToR2(r2Key, fileBuffer, contentType);
        const publicUrl = `${PUBLIC_BASE}/${r2Key}`;
        console.log(`  R2アップロード完了: ${publicUrl}`);

        let title, tags;
        const metaKey = agentAnalysis[r2Key] ? r2Key : (agentAnalysis[fileName] ? fileName : null);
        if (metaKey) {
          const analysis = agentAnalysis[metaKey];
          ({ title, tags } = buildMeta(analysis, counters, folderName));
          console.log(`  [Meta] title="${title}" tags=${JSON.stringify(tags)}`);
        } else if (hasAI) {
          const analysis = await analyzeImage(fileBuffer, contentType);
          console.log(`  [AI] type=${analysis.type}`);
          ({ title, tags } = buildMeta(analysis, counters, folderName));
          await sleep(500);
        } else {
          ({ title, tags } = buildMeta({ type: 'normal' }, counters, folderName));
        }

        // DB 登録
        await GalleryImage.create({ title, r2Url: publicUrl, r2Key, description: '', tags, status: 'published' });
        console.log(`  DB登録完了: title="${title}" tags=${JSON.stringify(tags)}`);
        added++;

        // ローカルファイル削除
        // ローカルファイルは削除せずに残す
        // fs.unlinkSync(localPath);
        // console.log(`  ローカルファイル削除完了`);

      } catch (err) {
        console.error(`  [Error] ${err.message}`);
        errors++;
      }
    }

    // .metadata.json を削除
    if (fs.existsSync(METADATA_FILE)) {
      fs.unlinkSync(METADATA_FILE);
      console.log('\n[Clean] .metadata.json を削除しました');
    }

    console.log(`\n完了 — 追加: ${added} 件 / スキップ（既登録）: ${skipped} 件 / エラー: ${errors} 件`);

  } catch (error) {
    console.error('処理スクリプト全体でエラーが発生しました:', error);
  } finally {
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('MongoDB: Disconnected');
    }
  }
};

processUploads();
