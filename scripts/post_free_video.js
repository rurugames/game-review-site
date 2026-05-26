/**
 * scripts/post_free_video.js
 * FANZA無料動画をDBに直接追加するスクリプト（チャット投稿用）
 *
 * 使い方:
 *   node scripts/post_free_video.js \
 *     --title    "タイトル" \
 *     --desc     "説明文" \
 *     --link     "https://al.fanza.co.jp/..." \
 *     --thumbnail "https://..." \
 *     --actress  "女優1,女優2" \
 *     --maker    "メーカー名" \
 *     --series   "シリーズ名" \
 *     --tags     "タグ1,タグ2,タグ3" \
 *     --views    175303
 */
require('dotenv').config();
const mongoose = require('mongoose');
const FreeVideo = require('../models/FreeVideo');
const User = require('../models/User');

// CLI 引数をパース（--key value 形式）
const rawArgs = process.argv.slice(2);
const args = {};
for (let i = 0; i < rawArgs.length; i++) {
  if (rawArgs[i].startsWith('--')) {
    args[rawArgs[i].slice(2)] = rawArgs[i + 1] ?? '';
    i++;
  }
}

// --desc-file でファイルから説明文を読み込む
if (args['desc-file']) {
  const fs = require('fs');
  args.desc = fs.readFileSync(args['desc-file'], 'utf8');
}

const { title, desc, link, thumbnail, actress, maker, series, tags, views } = args;

if (!title || !desc || !link) {
  console.error('使い方: node scripts/post_free_video.js --title "..." --desc "..." --link "URL"');
  console.error('  オプション: --thumbnail URL --actress "女優1,女優2" --maker "名前" --series "名前" --tags "タグ1,タグ2" --views 12345');
  process.exit(1);
}

try { new URL(link); } catch {
  console.error('--link に有効なURLを指定してください');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI);

  const admin = await User.findOne().sort({ createdAt: 1 }).lean();
  if (!admin) {
    console.error('ユーザーが見つかりません。先にサイトにログインしてください。');
    await mongoose.disconnect();
    process.exit(1);
  }

  const actressArr = actress
    ? actress.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const tagsArr = tags
    ? tags.split(',').map(s => s.trim()).filter(Boolean)
    : [];
  const viewCount = views ? (parseInt(views.replace(/[,，]/g, ''), 10) || undefined) : undefined;

  // --thumbnail 未指定時はアフィリエイトリンクのCIDからサムネイルを自動生成
  let resolvedThumbnail = thumbnail ? thumbnail.trim() : undefined;
  if (!resolvedThumbnail) {
    try {
      const urlObj = new URL(link.trim());
      const lurl = urlObj.searchParams.get('lurl');
      const target = lurl ? decodeURIComponent(lurl) : link;
      const m = target.match(/\/cid=([^\/&?]+)/);
      if (m && m[1]) {
        resolvedThumbnail = `https://pics.dmm.co.jp/digital/video/${m[1]}/${m[1]}pl.jpg`;
        console.log('  サムネイル（自動）:', resolvedThumbnail);
      }
    } catch (_) {}
  }

  const video = new FreeVideo({
    title: title.trim(),
    description: desc.trim(),
    affiliateLink: link.trim(),
    imageUrl: resolvedThumbnail || undefined,
    actress: actressArr,
    maker: maker ? maker.trim() : undefined,
    series: series ? series.trim() : undefined,
    tags: tagsArr,
    viewCount,
    author: admin._id,
    status: 'published',
  });

  await video.save();
  console.log('✅ 投稿完了');
  console.log('  ID  :', video._id.toString());
  console.log('  URL : http://localhost:3000/free-videos/' + video._id.toString());
  await mongoose.disconnect();
})();
