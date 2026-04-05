/**
 * R2バケット内の全画像を一覧取得し、エージェントが view_image で確認できるよう
 * 公開URLとR2キーの対応表を .r2_images.json として出力するスクリプト。
 *
 * 使い方: node scripts/list_r2_images.js
 * 出力:   .r2_images.json（プロジェクトルート）
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { S3Client, ListObjectsV2Command } = require('@aws-sdk/client-s3');

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

async function run() {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');

  console.log(`R2バケット「${bucket}」を一覧取得中...`);

  const images = [];
  let continuationToken;
  do {
    const res = await s3.send(new ListObjectsV2Command({
      Bucket: bucket,
      ContinuationToken: continuationToken,
    }));
    for (const obj of (res.Contents || [])) {
      const key = obj.Key;
      const dot = key.lastIndexOf('.');
      if (dot !== -1 && IMAGE_EXTS.has(key.substring(dot).toLowerCase())) {
        images.push({ key, url: `${publicBase}/${key}` });
      }
    }
    continuationToken = res.NextContinuationToken;
  } while (continuationToken);

  const outPath = path.join(__dirname, '../.r2_images.json');
  fs.writeFileSync(outPath, JSON.stringify(images, null, 2), 'utf8');
  console.log(`${images.length} 件の画像を検出`);
  console.log(`一覧を保存しました: ${outPath}`);
  console.log('\nエージェントは各URLを view_image で確認し、.metadata.json を作成してください。');
}

run().catch(err => {
  console.error('エラー:', err);
  process.exit(1);
});
