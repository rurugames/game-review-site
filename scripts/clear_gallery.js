require('dotenv').config();
const mongoose = require('mongoose');
const GalleryImage = require('../models/GalleryImage');

const ACCOUNT_ID = process.env.R2_ACCOUNT_ID;
const BUCKET_NAME = process.env.R2_BUCKET_NAME;
const API_TOKEN = process.env.CLOUDFLARE_API_TOKEN;

async function clearGallery() {
  try {
    await mongoose.connect(process.env.MONGODB_URI);
    const result = await GalleryImage.deleteMany({});
    console.log(`DBから ${result.deletedCount} 件削除しました`);

    // R2のファイル削除
    const listUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects`;
    const listRes = await fetch(listUrl, {
      headers: { 'Authorization': `Bearer ${API_TOKEN}` }
    });
    
    if (!listRes.ok) {
      console.error('R2一覧取得失敗:', await listRes.text());
      process.exit(1);
    }
    
    const listData = await listRes.json();
    const objects = listData.result || [];
    
    console.log(`R2に ${objects.length} 件のオブジェクトが見つかりました。削除を開始します...`);
    
    for (const obj of objects) {
      const key = obj.key;
      const delUrl = `https://api.cloudflare.com/client/v4/accounts/${ACCOUNT_ID}/r2/buckets/${BUCKET_NAME}/objects/${encodeURIComponent(key)}`;
      const delRes = await fetch(delUrl, {
        method: 'DELETE',
        headers: { 'Authorization': `Bearer ${API_TOKEN}` }
      });
      if (delRes.ok) {
        console.log(`  R2削除済: ${key}`);
      } else {
        console.error(`  R2削除失敗: ${key}`, await delRes.text());
      }
    }
    
    console.log('全ての削除が完了しました。');
  } catch (err) {
    console.error('エラー:', err);
  } finally {
    await mongoose.disconnect();
    process.exit(0);
  }
}

clearGallery();
