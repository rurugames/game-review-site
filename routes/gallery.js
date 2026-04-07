const express = require('express');
const router = express.Router();
const GalleryImage = require('../models/GalleryImage');
const GalleryComment = require('../models/GalleryComment');
const AdTag = require('../models/AdTag');
const youtubeApi = require('../services/youtubeDataApiService');
const { S3Client, ListObjectsV2Command, GetObjectCommand } = require('@aws-sdk/client-s3');
const { ensureAdmin } = require('../middleware/auth');
const path = require('path');
const { analyzeImage, buildMeta, initCounters, mimeFromExt, sleep } = require('../lib/imageMetaFromAI');

const IMAGE_EXTS = new Set(['.jpg', '.jpeg', '.png', '.gif', '.webp', '.avif']);

const r2Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

async function syncR2ToGallery() {
  const bucket = process.env.R2_BUCKET_NAME;
  const publicBase = (process.env.R2_PUBLIC_DOMAIN || '').replace(/\/$/, '');
  const hasAI = !!process.env.OPENAI_API_KEY;

  // Cloudflare REST API でオブジェクト一覧を取得（S3 APIエンドポイントのTLS問題を回避）
  const apiToken = process.env.CLOUDFLARE_API_TOKEN;
  const accountId = process.env.R2_ACCOUNT_ID;
  if (!apiToken) throw new Error('CLOUDFLARE_API_TOKEN が設定されていません');

  const imageKeys = [];
  let cursor;
  do {
    const url = new URL(`https://api.cloudflare.com/client/v4/accounts/${accountId}/r2/buckets/${bucket}/objects`);
    if (cursor) url.searchParams.set('cursor', cursor);
    const cfRes = await fetch(url.toString(), {
      headers: { 'Authorization': `Bearer ${apiToken}` }
    });
    if (!cfRes.ok) {
      const text = await cfRes.text();
      throw new Error(`Cloudflare API error ${cfRes.status}: ${text}`);
    }
    const data = await cfRes.json();
    const objects = Array.isArray(data.result) ? data.result : [];
    for (const obj of objects) {
      const key = obj.key;
      const dot = key.lastIndexOf('.');
      if (dot === -1) continue;
      if (IMAGE_EXTS.has(key.substring(dot).toLowerCase())) {
        imageKeys.push(key);
      }
    }
    cursor = data.result_info?.truncated ? data.result_info?.cursor : null;
  } while (cursor);

  // 既存r2Keyを取得してSet化
  const existing = new Set(
    (await GalleryImage.find({}, 'r2Key').lean()).map(d => d.r2Key)
  );

  const newKeys = imageKeys.filter(k => !existing.has(k));
  if (newKeys.length === 0) {
    return { total: imageKeys.length, added: 0, skipped: 0 };
  }

  const counters = await initCounters(GalleryImage);

  // R2から画像バッファを取得するヘルパー
  async function downloadImage(key) {
    const res = await r2Client.send(new GetObjectCommand({ Bucket: bucket, Key: key }));
    const chunks = [];
    for await (const chunk of res.Body) chunks.push(chunk);
    return Buffer.concat(chunks);
  }

  const newDocs = [];
  for (const k of newKeys) {
    const keyParts = k.split('/');
    const folderName = keyParts.length > 1 ? keyParts[0] : null;
    let title, tags;
    if (hasAI) {
      try {
        const ext = path.extname(k);
        const buf = await downloadImage(k);
        const analysis = await analyzeImage(buf, mimeFromExt(ext));
        ({ title, tags } = buildMeta(analysis, counters));
        if (folderName && !tags.includes(folderName)) tags = [folderName, ...tags];
        await sleep(500);
      } catch (_) {
        title = folderName || `アニメ${++counters.anime}`;
        tags = folderName ? [folderName] : ['アニメ'];
      }
    } else {
      title = folderName || `アニメ${++counters.anime}`;
      tags = folderName ? [folderName] : ['アニメ'];
    }
    newDocs.push({ title, r2Key: k, r2Url: `${publicBase}/${k}`, description: '', tags, status: 'published' });
  }

  let added = 0;
  try {
    const result = await GalleryImage.insertMany(newDocs, { ordered: false });
    added = result.length;
  } catch (e) {
    // ordered:false の場合、部分成功でも例外が出る場合がある
    added = e.insertedDocs ? e.insertedDocs.length : newDocs.length;
  }

  return { total: imageKeys.length, added, skipped: imageKeys.length - existing.size - added };
}

function cleanEnvValue(v) {
  const s = String(v || '').trim();
  if (!s) return '';
  return s.replace(/^["']|["']$/g, '');
}

async function fetchOneRandomVideo() {
  try {
    const youtubeChannelId = cleanEnvValue(process.env.YOUTUBE_CHANNEL_ID);
    const youtubeRecommendedPlaylistId = cleanEnvValue(process.env.YOUTUBE_RECOMMENDED_PLAYLIST_ID);
    if (!youtubeChannelId) return null;

    let videos = [];
    if (youtubeRecommendedPlaylistId) {
      videos = await youtubeApi.fetchVideosByPlaylist(youtubeRecommendedPlaylistId, { limit: 25 });
    } else {
      videos = await youtubeApi.fetchPopularVideosByChannel(youtubeChannelId, { limit: 25 });
    }
    if (!videos || videos.length === 0) return null;
    return videos[Math.floor(Math.random() * videos.length)];
  } catch (e) {
    return null;
  }
}

function ensureAuth(req, res, next) {
  if (req.isAuthenticated()) return next();
  res.status(401).json({ error: 'ログインが必要です' });
}

function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// --- R2 → MongoDB 同期（管理者のみ）---
router.post('/admin/sync-r2', ensureAdmin, async (req, res) => {
  try {
    const result = await syncR2ToGallery();
    res.json({ ok: true, ...result });
  } catch (err) {
    console.error('R2 sync error:', err);
    res.status(500).json({ error: err.message });
  }
});

// ギャラリートップ（フォルダ一覧）
router.get('/', async (req, res) => {
  try {
    const folders = await GalleryImage.aggregate([
      { $match: { status: 'published' } },
      {
        $project: {
          folder: {
            $let: {
              vars: { parts: { $split: ['$r2Key', '/'] } },
              in: {
                $cond: [
                  { $gt: [{ $size: '$$parts' }, 1] },
                  { $arrayElemAt: ['$$parts', 0] },
                  'その他'
                ]
              }
            }
          },
          r2Url: 1,
          uploadDate: 1
        }
      },
      {
        $group: {
          _id: '$folder',
          count: { $sum: 1 },
          cover: { $first: '$r2Url' },
          latestDate: { $max: '$uploadDate' }
        }
      },
      { $sort: { _id: 1 } }
    ]);

    // 最新画像5件の取得
    const latestImages = await GalleryImage.find({ status: 'published' })
      .sort({ uploadDate: -1 })
      .limit(5)
      .lean();

    const randomVideo = await fetchOneRandomVideo();

    // 広告タグの取得（トップなので 'default' を優先）
    const defaultAd = await AdTag.findOne({ keyword: 'default', isActive: true }).lean();

    res.render('gallery', {
      title: 'ギャラリー',
      folders,
      latestImages,
      user: req.user,
      randomVideo,
      adTag: defaultAd ? defaultAd.adHtml : null
    });
  } catch (err) {
    console.error('Gallery Folder List Error:', err);
    res.status(500).send('ギャラリーの読み込み中にエラーが発生しました。');
  }
});

// シリーズ（フォルダ）別ページ
router.get('/series/:folder', async (req, res) => {
  try {
    const folder = req.params.folder;
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const regexStr = folder === 'その他'
      ? '^[^/]+\\.[^/]+$'  // スラッシュなし（ルート直下）
      : `^${escapeRegex(folder)}/`;

    const query = { status: 'published', r2Key: { $regex: regexStr } };

    const [images, total] = await Promise.all([
      GalleryImage.find(query).sort({ uploadDate: -1 }).skip(skip).limit(limit),
      GalleryImage.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);

    const likedSet = new Set();
    if (req.user) {
      images.forEach(img => {
        if (img.likes && img.likes.some(uid => String(uid) === String(req.user._id))) {
          likedSet.add(String(img._id));
        }
      });
    }

    const randomVideo = await fetchOneRandomVideo();

    // 広告タグの取得（現在のフォルダ名、なければ 'default'）
    const adTagDoc = await AdTag.findOne({ keyword: { $in: [folder, 'default'] }, isActive: true })
      .sort({ keyword: -1 }) // folderが 'default' よりアルファベット順で上等にならないケースもあるが簡易的に。
      .lean();
    
    // 正確には folder に一致するものを探し、なければ default を探す
    let adHtml = null;
    const specificAd = await AdTag.findOne({ keyword: folder, isActive: true }).lean();
    if (specificAd) {
      adHtml = specificAd.adHtml;
    } else {
      const defaultAd = await AdTag.findOne({ keyword: 'default', isActive: true }).lean();
      if (defaultAd) adHtml = defaultAd.adHtml;
    }

    res.render('gallery-series', {
      title: folder + ' - ギャラリー',
      folder,
      images,
      likedSet,
      currentPage: page,
      totalPages,
      user: req.user,
      randomVideo,
      adTag: adHtml
    });
  } catch (err) {
    console.error('Gallery Series Error:', err);
    res.status(500).send('エラーが発生しました。');
  }
});

// タグ別一覧ページ
router.get('/tag/:tag', async (req, res) => {
  try {
    const tag = req.params.tag;
    const page = parseInt(req.query.page) || 1;
    const limit = 20;
    const skip = (page - 1) * limit;

    const query = { status: 'published', tags: tag };

    const [images, total] = await Promise.all([
      GalleryImage.find(query).sort({ uploadDate: -1 }).skip(skip).limit(limit),
      GalleryImage.countDocuments(query),
    ]);
    const totalPages = Math.ceil(total / limit);

    const likedSet = new Set();
    if (req.user) {
      images.forEach(img => {
        if (img.likes && img.likes.some(uid => String(uid) === String(req.user._id))) {
          likedSet.add(String(img._id));
        }
      });
    }

    const randomVideo = await fetchOneRandomVideo();

    let adHtml = null;
    const specificAd = await AdTag.findOne({ keyword: tag, isActive: true }).lean();
    if (specificAd) {
      adHtml = specificAd.adHtml;
    } else {
      const defaultAd = await AdTag.findOne({ keyword: 'default', isActive: true }).lean();
      if (defaultAd) adHtml = defaultAd.adHtml;
    }

    res.render('gallery-tag', {
      title: '#' + tag + ' - ギャラリー',
      tag,
      images,
      likedSet,
      currentPage: page,
      totalPages,
      user: req.user,
      randomVideo,
      adTag: adHtml
    });
  } catch (err) {
    console.error('Gallery Tag Error:', err);
    res.status(500).send('エラーが発生しました。');
  }
});

// 画像詳細ページ
router.get('/:id', async (req, res) => {
  try {
    const image = await GalleryImage.findByIdAndUpdate(
      req.params.id,
      { $inc: { views: 1 } },
      { new: true }
    );
    if (!image || image.status !== 'published') {
      return res.status(404).send('画像が見つかりません。');
    }

    const comments = await GalleryComment.find({ image: image._id })
      .populate('author', 'displayName profilePhoto')
      .sort({ createdAt: 1 });

    const liked = req.user
      ? image.likes.some(uid => String(uid) === String(req.user._id))
      : false;

    const bookmarked = req.user
      ? (image.bookmarks && image.bookmarks.some(uid => String(uid) === String(req.user._id)))
      : false;

    const randomVideo = await fetchOneRandomVideo();

    let adHtml = null;
    const tagToSearch = (image.tags && image.tags.length > 0) ? image.tags[0] : null;
    if (tagToSearch) {
      const specificAd = await AdTag.findOne({ keyword: tagToSearch, isActive: true }).lean();
      if (specificAd) adHtml = specificAd.adHtml;
    }
    if (!adHtml) {
      const defaultAd = await AdTag.findOne({ keyword: 'default', isActive: true }).lean();
      if (defaultAd) adHtml = defaultAd.adHtml;
    }

    res.render('gallery-detail', {
      title: image.title,
      image,
      comments,
      liked,
      bookmarked,
      queryError: req.query.error === '1',
      randomVideo,
      user: req.user,
      adTag: adHtml
    });
  } catch (err) {
    console.error('Gallery Detail Error:', err);
    res.status(500).send('エラーが発生しました。');
  }
});

// いいねトグル（ログイン必須、JSON API）
router.post('/:id/like', ensureAuth, async (req, res) => {
  try {
    const image = await GalleryImage.findById(req.params.id);
    if (!image) return res.status(404).json({ error: '画像が見つかりません' });

    const userId = req.user._id;
    const alreadyLiked = image.likes.some(uid => String(uid) === String(userId));

    if (alreadyLiked) {
      image.likes = image.likes.filter(uid => String(uid) !== String(userId));
    } else {
      image.likes.push(userId);
    }
    await image.save();

    res.json({ liked: !alreadyLiked, likeCount: image.likes.length });
  } catch (err) {
    console.error('Like Error:', err);
    res.status(500).json({ error: 'いいねの処理に失敗しました' });
  }
});

// ブックマークトグル（ログイン必須、JSON API）
router.post('/:id/bookmark', ensureAuth, async (req, res) => {
  try {
    const image = await GalleryImage.findById(req.params.id);
    if (!image) return res.status(404).json({ error: '画像が見つかりません' });

    const userId = req.user._id;
    if (!image.bookmarks) image.bookmarks = [];
    const alreadyBookmarked = image.bookmarks.some(uid => String(uid) === String(userId));

    if (alreadyBookmarked) {
      image.bookmarks = image.bookmarks.filter(uid => String(uid) !== String(userId));
    } else {
      image.bookmarks.push(userId);
    }
    await image.save();

    res.json({ bookmarked: !alreadyBookmarked, bookmarkCount: image.bookmarks.length });
  } catch (err) {
    console.error('Bookmark Error:', err);
    res.status(500).json({ error: 'ブックマークの処理に失敗しました' });
  }
});

// コメント投稿（ログイン必須）
router.post('/:id/comment', ensureAuth, async (req, res) => {
  try {
    const image = await GalleryImage.findById(req.params.id);
    if (!image) return res.status(404).send('画像が見つかりません。');

    const content = String(req.body.content || '').trim();
    if (!content || content.length > 500) {
      return res.redirect(`/gallery/${req.params.id}?error=1`);
    }

    await GalleryComment.create({
      image: image._id,
      author: req.user._id,
      content
    });

    res.redirect(`/gallery/${req.params.id}#comments`);
  } catch (err) {
    console.error('Comment Error:', err);
    res.redirect(`/gallery/${req.params.id}?error=1`);
  }
});

// コメント削除（本人のみ）
router.post('/comment/:commentId/delete', ensureAuth, async (req, res) => {
  try {
    const comment = await GalleryComment.findById(req.params.commentId);
    if (!comment) return res.status(404).send('コメントが見つかりません。');
    if (String(comment.author) !== String(req.user._id)) {
      return res.status(403).send('削除権限がありません。');
    }
    const imageId = comment.image;
    await comment.deleteOne();
    res.redirect(`/gallery/${imageId}#comments`);
  } catch (err) {
    console.error('Comment Delete Error:', err);
    res.status(500).send('削除に失敗しました。');
  }
});

module.exports = router;
