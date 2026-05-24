/**
 * scripts/sync_products_local_to_prod.js
 * ローカル MongoDB の商品レビューを Atlas（本番）へ同期する
 *
 * 使い方:
 *   node scripts/sync_products_local_to_prod.js
 *
 * 前提:
 *   - .env の MONGODB_URI が Atlas URI になっていること
 *   - ローカル MongoDB が localhost:27017 で起動していること
 *   - LOCAL_MONGODB_URI 環境変数でローカル URI を上書き可
 */
require('dotenv').config();
const { MongoClient, ObjectId } = require('mongodb');

const LOCAL_URI = process.env.LOCAL_MONGODB_URI || 'mongodb://localhost:27017/game-review-site';
const PROD_URI  = process.env.MONGODB_URI;
const DB_NAME   = 'game-review-site';

if (!PROD_URI) {
  console.error('ERROR: MONGODB_URI が設定されていません（.env を確認してください）');
  process.exit(1);
}

if (LOCAL_URI === PROD_URI) {
  console.log('✅ LOCAL_URI と PROD_URI が同じです。同期不要（ローカルが既に Atlas を向いています）');
  process.exit(0);
}

(async () => {
  const localClient = new MongoClient(LOCAL_URI, { serverSelectionTimeoutMS: 5000 });
  const prodClient  = new MongoClient(PROD_URI,  { serverSelectionTimeoutMS: 10000 });

  try {
    await localClient.connect();
    await prodClient.connect();
    console.log('✅ 両DB接続完了');

    const localDb = localClient.db(DB_NAME);
    const prodDb  = prodClient.db(DB_NAME);

    // 本番の管理者ユーザーを取得
    const adminUser = await prodDb.collection('users').findOne({}, { sort: { createdAt: 1 } });
    if (!adminUser) {
      console.error('ERROR: Atlas にユーザーが見つかりません。先に本番サイトでログインしてください。');
      process.exit(1);
    }

    // ローカルの商品を全取得
    const localProducts = await localDb.collection('products').find({}).toArray();
    console.log(`ローカル: ${localProducts.length} 件`);

    // 本番の affiliateLink 一覧（重複チェック用）
    const prodDocs = await prodDb.collection('products')
      .find({}, { projection: { affiliateLink: 1 } }).toArray();
    const prodLinks = new Set(prodDocs.map(p => p.affiliateLink));
    console.log(`Atlas  : ${prodLinks.size} 件`);

    const toSync = localProducts.filter(p => !prodLinks.has(p.affiliateLink));
    console.log(`未同期 : ${toSync.length} 件\n`);

    if (toSync.length === 0) {
      console.log('✅ 同期不要（すべて反映済み）');
      return;
    }

    for (const p of toSync) {
      const { _id, author, ...rest } = p;
      const doc = {
        ...rest,
        _id: new ObjectId(),           // 新規 ID を発行
        author: adminUser._id,          // 本番の管理者 ID に差し替え
        createdAt: p.createdAt || new Date(),
        updatedAt: p.updatedAt || new Date(),
      };
      await prodDb.collection('products').insertOne(doc);
      console.log(`  ✅ 同期: ${p.title}`);
    }

    console.log('\n✅ 同期完了');
  } catch (err) {
    console.error('ERROR:', err.message);
    process.exit(1);
  } finally {
    await localClient.close();
    await prodClient.close();
  }
})();
