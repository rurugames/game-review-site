const express = require('express');
const router = express.Router();
const Product = require('../models/Product');
const { ensureAdmin } = require('../middleware/auth');
const { marked } = require('marked');
const { normalizeAffiliateLink } = require('../lib/dlsiteAffiliate');
const axios = require('axios');
const cheerio = require('cheerio');
const youtubeApi = require('../services/youtubeDataApiService');
const AdTag = require('../models/AdTag');

async function fetchDefaultAdTag() {
  try {
    const doc = await AdTag.findOne({ keyword: 'default', isActive: true }).lean();
    return doc ? doc.adHtml : null;
  } catch {
    return null;
  }
}

function cleanEnv(v) {
  const s = String(v || '').trim();
  return s.replace(/^["']|["']$/g, '');
}

async function fetchProductVideos(title) {
  const channelId = cleanEnv(process.env.YOUTUBE_CHANNEL_ID);
  const playlistId = cleanEnv(process.env.YOUTUBE_RECOMMENDED_PLAYLIST_ID);
  try {
    // タイトルキーワードで関連動画を検索（最大3件）
    const related = channelId ? await youtubeApi.searchVideosByQuery(title, { limit: 6 }) : [];
    if (related && related.length > 0) return { videos: related.slice(0, 3), isRelated: true };
    // 関連なし → おすすめ動画からランダム1件
    let pool = [];
    if (playlistId) {
      pool = await youtubeApi.fetchVideosByPlaylist(playlistId, { limit: 25 });
    } else if (channelId) {
      pool = await youtubeApi.fetchPopularVideosByChannel(channelId, { limit: 25 });
    }
    const video = pool.length > 0 ? pool[Math.floor(Math.random() * pool.length)] : null;
    return { videos: video ? [video] : [], isRelated: false };
  } catch {
    return { videos: [], isRelated: false };
  }
}

marked.setOptions({ breaks: true, gfm: true });

async function fetchPageMeta(url) {
  try {
    const { data } = await axios.get(url, {
      timeout: 8000,
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
    });
    const $ = cheerio.load(data);
    const imageUrl = $('meta[property="og:image"]').attr('content') || null;

    // 評価値: JSON-LD → itemprop → DLsite固有スパン の優先順で取得
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

// @route   GET /products
// @desc    商品紹介一覧
router.get('/', async (req, res) => {
  try {
    const [products, adTag] = await Promise.all([
      Product.find({ status: 'published' }).sort({ createdAt: -1 }).lean(),
      fetchDefaultAdTag(),
    ]);
    res.render('products/index', {
      title: '商品レビュー',
      products,
      adTag,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// @route   GET /products/new
// @desc    投稿フォーム（管理者のみ）
router.get('/new', ensureAdmin, (req, res) => {
  res.render('products/new', { title: '商品レビューを追加' });
});

// @route   POST /products
// @desc    商品紹介を登録（管理者のみ）
router.post('/', ensureAdmin, async (req, res) => {
  try {
    const title = String(req.body.title || '').trim();
    const body = String(req.body.body || '').trim();
    const affiliateLinkRaw = String(req.body.affiliateLink || '').trim();

    if (!title || !body || !affiliateLinkRaw) {
      return res.status(400).send('タイトル・本文・アフィリエイトリンクは必須です');
    }

    // URLバリデーション
    try { new URL(affiliateLinkRaw); } catch {
      return res.status(400).send('アフィリエイトリンクのURLが不正です');
    }

    const affiliateLink = normalizeAffiliateLink(affiliateLinkRaw) || affiliateLinkRaw;
    const { imageUrl, rating } = await fetchPageMeta(affiliateLink);

    const product = new Product({
      title,
      body,
      affiliateLink,
      imageUrl: imageUrl || undefined,
      rating: rating || undefined,
      author: req.user._id,
      status: req.body.status === 'draft' ? 'draft' : 'published',
    });
    await product.save();
    res.redirect(`/products/${product._id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// @route   GET /products/:id
// @desc    商品紹介詳細
router.get('/:id', async (req, res) => {
  try {
    const product = await Product.findById(req.params.id).lean();
    if (!product || product.status !== 'published') {
      return res.status(404).send('ページが見つかりません');
    }
    const bodyHtml = marked(product.body);
    const [{ videos: productVideos, isRelated: videosAreRelated }, adTag] = await Promise.all([
      fetchProductVideos(product.title),
      fetchDefaultAdTag(),
    ]);
    res.render('products/show', {
      title: product.title,
      product,
      bodyHtml,
      productVideos,
      videosAreRelated,
      adTag,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// @route   DELETE /products/:id
// @desc    削除（管理者のみ）
router.delete('/:id', ensureAdmin, async (req, res) => {
  try {
    await Product.findByIdAndDelete(req.params.id);
    res.redirect('/products');
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

module.exports = router;
