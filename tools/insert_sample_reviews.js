/**
 * 本番環境にサンプルレビューを登録するスクリプト
 *
 * 使い方:
 *   node tools/insert_sample_reviews.js
 *
 * オプション:
 *   --count=3              最新N件に投入（デフォルト3）
 *   --authorEmail=...      投稿者（既存Userのemail）
 *   --confirmProd=1        mongodb+srv 等の本番っぽいURIへ書き込む場合の確認フラグ
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Review = require('../models/Review');
const User = require('../models/User');
const Article = require('../models/Article');

function parseArgs(argv) {
  const out = {};
  for (const a of argv.slice(2)) {
    const m = a.match(/^--([^=]+)=(.*)$/);
    if (m) out[m[1]] = m[2];
  }
  return out;
}

function isProbablyProdMongoUri(uri) {
  if (!uri) return false;
  const u = String(uri);
  return u.startsWith('mongodb+srv://') || /mongodb\.net/i.test(u);
}

function sampleReviewByIndex(i) {
  const pool = [
    {
      rating: 5,
      headline: 'システムもストーリーも最高！長く楽しめる良作です。',
      prosTags: ['ストーリー', 'ボリューム', 'システム'],
      consTags: [],
      playtimeBucket: '20h+',
      spoiler: false
    },
    {
      rating: 4,
      headline: '演出が素晴らしく、キャラクターも魅力的。達成感があります。',
      prosTags: ['演出', 'キャラ', '達成感'],
      consTags: ['難易度'],
      playtimeBucket: '10-20h',
      spoiler: false
    },
    {
      rating: 4,
      headline: 'グラフィックが綺麗でUIも使いやすい。周回も楽しめます。',
      prosTags: ['グラフィック', 'UI', '周回要素'],
      consTags: [],
      playtimeBucket: '5-10h',
      spoiler: false
    },
    {
      rating: 3,
      headline: '尖った魅力はあるが好みは分かれそう。刺さる人には刺さるタイプ。',
      prosTags: ['世界観'],
      consTags: ['テンポ'],
      playtimeBucket: '1-5h',
      spoiler: false
    }
  ];
  return pool[i % pool.length];
}

async function main() {
  const args = parseArgs(process.argv);
  const count = Math.max(1, Math.min(20, parseInt(args.count || '3', 10) || 3));
  const authorEmail = args.authorEmail || process.env.SAMPLE_REVIEW_AUTHOR_EMAIL || '';
  const confirmProd = String(args.confirmProd || process.env.CONFIRM_PROD || '') === '1';

  const mongoUri = process.env.MONGODB_URI;
  if (!mongoUri) {
    console.error('MONGODB_URI is not set');
    process.exit(1);
  }
  if (isProbablyProdMongoUri(mongoUri) && !confirmProd) {
    console.error('Refusing to write to a probable production MongoDB URI without --confirmProd=1 (or CONFIRM_PROD=1).');
    process.exit(1);
  }

  console.log('Connecting to MongoDB...');
  await mongoose.connect(mongoUri);
  console.log('Connected.');

  let authorUser = null;
  if (authorEmail) {
    authorUser = await User.findOne({ email: authorEmail }).lean();
  }
  if (!authorUser) {
    authorUser = await User.findOne({}).sort({ createdAt: 1 }).lean();
  }
  if (!authorUser) {
    console.error('No User found in DB. Please login at least once to create a user.');
    process.exit(1);
  }
  console.log('Using user:', authorUser.displayName || authorUser.email || String(authorUser._id));

  const articles = await Article.find({})
    .sort({ releaseDate: -1, createdAt: -1 })
    .limit(count)
    .select('_id title gameTitle releaseDate')
    .lean();

  if (!articles.length) {
    console.error('No Article found in DB.');
    process.exit(1);
  }

  for (let i = 0; i < articles.length; i++) {
    const article = articles[i];
    const articleId = String(article._id);
    console.log(`\nRegistering review for: ${article.title || article.gameTitle}`);

    const reviewData = sampleReviewByIndex(i);
    const result = await Review.updateOne(
      { article: articleId, author: authorUser._id },
      {
        $set: {
          rating: reviewData.rating,
          headline: reviewData.headline,
          prosTags: reviewData.prosTags,
          consTags: reviewData.consTags,
          playtimeBucket: reviewData.playtimeBucket,
          spoiler: reviewData.spoiler
        },
        $setOnInsert: {
          article: articleId,
          author: authorUser._id,
          helpfulBy: [],
          helpfulCount: 0
        }
      },
      { upsert: true }
    );
    console.log('  Result:', result.upsertedCount ? 'inserted' : 'updated');
  }

  console.log('\nDone!');
  await mongoose.disconnect();
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
