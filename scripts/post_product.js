/**
 * scripts/post_product.js
 * 商品紹介をDBに直接追加するスクリプト（チャット投稿用）
 *
 * 使い方:
 *   node scripts/post_product.js \
 *     --title  "作品タイトル" \
 *     --body   "本文（Markdown）" \
 *     --link   "https://www.dlsite.com/..."
 *     --rating 4.29   # 省略時は OGP / JSON-LD から自動取得
 */
require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const cheerio = require('cheerio');
const Product = require('../models/Product');
const User = require('../models/User');

async function fetchPageMeta(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const $ = cheerio.load(data);
    const imageUrl = $('meta[property="og:image"]').attr('content') || null;

    let rating = null;
    $('script[type="application/ld+json"]').each((_, el) => {
      try {
        const json = JSON.parse($(el).html());
        const rv = json?.aggregateRating?.ratingValue;
        if (rv) { rating = parseFloat(rv) || null; return false; }
      } catch {}
    });
    if (!rating) {
      const rv = $('[itemprop="ratingValue"]').attr('content') ||
                 $('[itemprop="ratingValue"]').text().trim() ||
                 $('#average_count_detail').text().trim();
      if (rv) rating = parseFloat(rv) || null;
    }

    return { imageUrl, rating };
  } catch {
    return { imageUrl: null, rating: null };
  }
}

// CLI 引数をパース（--key value 形式）
const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i].startsWith('--')) {
    args[rawArgs[i].slice(2)] = rawArgs[i + 1] ?? '';
    i++;
  }
}

// --body-file でファイルからボディを読み込む
if (args['body-file']) {
  const fs = require('fs');
  args.body = fs.readFileSync(args['body-file'], 'utf8');
}

const { title, body, link, rating: ratingArg, thumbnail: thumbnailArg, genre: genreArg } = args;

if (!title || !body || !link) {
  console.error('使い方: node scripts/post_product.js --title "..." --body "..." --link "URL" [--rating 4.29] [--genre "FANZAブックス"]');
  console.error('       または --body-file <ファイルパス> でファイルから本文を読み込む');
  console.error('       ジャンル: FANZA同人 / 同人ゲーム / PCゲーム / 成年コミック / FANZAブックス / DLsite / その他');
  process.exit(1);
}

// URLバリデーション
try { new URL(link); } catch {
  console.error('--link に有効なURLを指定してください');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  // 管理者ユーザーを取得（最初に作成されたユーザー = オーナー）
  const admin = await User.findOne().sort({ createdAt: 1 }).lean();
  if (!admin) {
    console.error('ユーザーが見つかりません。先にサイトにログインしてください。');
    await mongoose.disconnect();
    process.exit(1);
  }

  console.log('🔍 ページメタ情報を取得中...');
  const { imageUrl: fetchedImageUrl, rating: fetchedRating } = await fetchPageMeta(link.trim());
  // --thumbnail 指定があれば優先、なければ自動取得値を使用
  const imageUrl = thumbnailArg ? thumbnailArg.trim() : fetchedImageUrl;
  // --rating 指定があれば優先、なければ自動取得値を使用
  const rating = ratingArg ? (parseFloat(ratingArg) || undefined) : (fetchedRating || undefined);
  if (imageUrl) console.log('  画像URL:', imageUrl);
  if (rating)   console.log('  評価値 :', rating);

  const product = new Product({
    title: title.trim(),
    body: body.trim(),
    affiliateLink: link.trim(),
    imageUrl: imageUrl || undefined,
    rating: rating || undefined,
    genre: genreArg ? genreArg.trim() : undefined,
    author: admin._id,
    status: 'published',
  });

  await product.save();
  console.log('✅ 投稿完了');
  console.log('  ID   :', product._id.toString());
  console.log('  URL  : http://localhost:3000/products/' + product._id.toString());
  await mongoose.disconnect();
})();
