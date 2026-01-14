const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Article = require('../models/Article');
const DailyArticleView = require('../models/DailyArticleView');
const DailyArticleReferrer = require('../models/DailyArticleReferrer');
const Comment = require('../models/Comment');
const Review = require('../models/Review');
const RelatedClick = require('../models/RelatedClick');
const RelatedImpression = require('../models/RelatedImpression');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const { marked } = require('marked');
const { normalizeAffiliateLink, rewriteDlsiteWorkLinksInHtml, DEFAULT_AID } = require('../lib/dlsiteAffiliate');
const { searchVideosByQuery } = require('../services/youtubeDataApiService');

// Markedの設定
marked.setOptions({
  breaks: true,
  gfm: true
});

const RELATED_POSITION_ORDER_TTL_MS = 30 * 60 * 1000;
const relatedPositionOrderCache = new Map();

const REVIEW_GLOBAL_STATS_TTL_MS = 10 * 60 * 1000;
let globalReviewStatsCache = { ts: 0, avg: 4.0, count: 0 };

async function getGlobalReviewStats() {
  const now = Date.now();
  if (globalReviewStatsCache && (now - globalReviewStatsCache.ts) < REVIEW_GLOBAL_STATS_TTL_MS) {
    return globalReviewStatsCache;
  }

  try {
    const rows = await Review.aggregate([
      { $group: { _id: null, avg: { $avg: '$rating' }, count: { $sum: 1 } } },
    ]);
    const avg = rows && rows[0] && Number.isFinite(rows[0].avg) ? Number(rows[0].avg) : 4.0;
    const count = rows && rows[0] && Number.isFinite(rows[0].count) ? Number(rows[0].count) : 0;
    globalReviewStatsCache = { ts: now, avg, count };
    return globalReviewStatsCache;
  } catch (_) {
    return globalReviewStatsCache;
  }
}

async function getRelatedPositionOrder(block, days = 30) {
  const key = `${block}|${days}`;
  const now = Date.now();
  const cached = relatedPositionOrderCache.get(key);
  if (cached && (now - cached.ts) < RELATED_POSITION_ORDER_TTL_MS) {
    return cached.order;
  }

  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const [clicksByPos, impsByPos] = await Promise.all([
    RelatedClick.aggregate([
      { $match: { ts: { $gte: since }, block } },
      { $group: { _id: '$position', clicks: { $sum: 1 } } },
    ]),
    RelatedImpression.aggregate([
      { $match: { ts: { $gte: since }, block } },
      { $group: { _id: '$position', impressions: { $sum: 1 } } },
    ]),
  ]);

  const clickMap = new Map((clicksByPos || []).map((r) => [String(r._id ?? ''), Number(r.clicks) || 0]));
  const impMap = new Map((impsByPos || []).map((r) => [String(r._id ?? ''), Number(r.impressions) || 0]));

  const positions = [1, 2, 3];
  const rows = positions.map((p) => {
    const k = String(p);
    const clicks = clickMap.get(k) || 0;
    const impressions = impMap.get(k) || 0;
    const ctr = impressions > 0 ? clicks / impressions : 0;
    return { position: p, ctr };
  });

  // 位置別CTRが全て0なら従来通り
  const hasSignal = rows.some((r) => r.ctr > 0);
  const order = hasSignal
    ? rows.sort((a, b) => (b.ctr - a.ctr) || (a.position - b.position)).map((r) => r.position)
    : positions;

  relatedPositionOrderCache.set(key, { ts: now, order });
  return order;
}

function reorderByPositionOrder(items, positionOrder) {
  if (!Array.isArray(items) || items.length <= 1) return items;
  const order = Array.isArray(positionOrder) && positionOrder.length ? positionOrder : [1, 2, 3];

  const n = items.length;
  const positions = order.filter((p) => Number.isFinite(p) && p >= 1 && p <= n);
  const out = new Array(n).fill(null);

  for (let i = 0; i < Math.min(n, positions.length); i++) {
    const targetIdx = positions[i] - 1;
    if (out[targetIdx] == null) out[targetIdx] = items[i];
  }

  // 余った/穴を元の順で埋める
  const used = new Set(out.filter(Boolean).map((x) => String(x && x._id)));
  let srcIdx = 0;
  for (let j = 0; j < n; j++) {
    if (out[j] != null) continue;
    while (srcIdx < n) {
      const cand = items[srcIdx++];
      const id = String(cand && cand._id);
      if (!used.has(id)) {
        out[j] = cand;
        used.add(id);
        break;
      }
    }
  }

  return out.filter(Boolean);
}

function getTagSet(tags) {
  if (!Array.isArray(tags)) return new Set();
  return new Set(tags.map((t) => String(t || '').trim()).filter(Boolean));
}

function countTagMatches(aTags, bTagSet) {
  if (!Array.isArray(aTags) || aTags.length === 0 || !bTagSet || bTagSet.size === 0) return 0;
  let c = 0;
  for (const t of aTags) {
    const k = String(t || '').trim();
    if (k && bTagSet.has(k)) c += 1;
  }
  return c;
}

function normalizeYoutubeKeyword(s) {
  return String(s || '')
    .replace(/\uFEFF/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractYoutubeKeywordsFromText(text) {
  const src = normalizeYoutubeKeyword(text);
  if (!src) return [];

  const out = [];
  const push = (v) => {
    const k = normalizeYoutubeKeyword(v);
    if (!k) return;
    if (k.length < 2) return;
    if (k.length > 60) return;
    out.push(k);
  };

  // 「」『』"" 内のフレーズを優先
  const quoteRx = /[「『"“”]([^」』"“”]{2,60})[」』"“”]/g;
  let m;
  while ((m = quoteRx.exec(src)) !== null) {
    push(m[1]);
  }

  // 〜系 っぽい語
  const keiRx = /[一-龯ぁ-んァ-ヶー]{2,}系/g;
  const keis = src.match(keiRx) || [];
  keis.forEach(push);

  // 日本語の連続
  const jpRx = /[一-龯ぁ-んァ-ヶー]{2,}/g;
  const jp = src.match(jpRx) || [];
  jp.forEach(push);

  // 英数字トークン（例: RPG3, SRPG, etc）
  const anRx = /[A-Za-z0-9][A-Za-z0-9+._-]{2,}/g;
  const an = src.match(anRx) || [];
  an.forEach(push);

  // 末尾の数字を落とした派生（深淵の森RPG3 -> 深淵の森RPG）
  const derived = [];
  for (const t of out) {
    const d = t.replace(/[0-9０-９]+$/g, '').trim();
    if (d && d !== t) derived.push(d);
  }
  derived.forEach(push);

  const stop = new Set([
    'レビュー',
    '感想',
    'おすすめ',
    'まとめ',
    '攻略',
    '同人',
    'ゲーム',
    '紹介',
  ]);

  const seen = new Set();
  const uniq = [];
  for (const t of out) {
    const k = normalizeYoutubeKeyword(t);
    if (!k) continue;
    if (stop.has(k)) continue;
    if (seen.has(k)) continue;
    seen.add(k);
    uniq.push(k);
  }
  return uniq;
}

function buildYoutubeSearchKeywords(article) {
  const texts = [];
  if (article && article.gameTitle) texts.push(article.gameTitle);
  if (article && article.title) texts.push(article.title);
  if (article && Array.isArray(article.tags) && article.tags.length) {
    texts.push(article.tags.slice(0, 6).join(' '));
  }

  const tokens = [];
  for (const t of texts) {
    extractYoutubeKeywordsFromText(t).forEach((x) => tokens.push(x));
  }

  // 長めの語を優先（ノイズを減らす）
  tokens.sort((a, b) => (b.length - a.length) || a.localeCompare(b, 'ja'));

  const seen = new Set();
  const out = [];
  for (const t of tokens) {
    if (seen.has(t)) continue;
    seen.add(t);
    out.push(t);
    if (out.length >= 6) break;
  }
  return out;
}

// 新規記事作成フォーム（管理者のみ）
router.get('/new', ensureAdmin, (req, res) => {
  res.render('articles/new');
});

// 記事作成（管理者のみ）
router.post('/', ensureAdmin, async (req, res) => {
  try {
    const articleData = {
      ...req.body,
      author: req.user.id
    };

    // アフィリエイトリンク（DLsite作品URL → dlaf作品リンク）
    if (typeof articleData.affiliateLink !== 'undefined') {
      articleData.affiliateLink = normalizeAffiliateLink(articleData.affiliateLink, { aid: DEFAULT_AID }) || '';
    }
    
    // タグの処理（カンマ区切りの文字列を配列に変換）
    if (req.body.tags) {
      articleData.tags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }
    
    await Article.create(articleData);
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('記事の作成に失敗しました');
  }
});

// 記事詳細
router.get('/:id', async (req, res) => {
  try {
    // レビュー投稿直後のフィードバック（1回だけ表示）
    let reviewPostFeedback = null;
    try {
      const fb = req.session && req.session.reviewJustPosted ? req.session.reviewJustPosted : null;
      if (fb && String(fb.articleId || '') === String(req.params.id || '')) {
        reviewPostFeedback = {
          action: String(fb.action || ''),
          rating: Number(fb.rating) || null,
          ts: Number(fb.ts) || null,
        };
        delete req.session.reviewJustPosted;
      }
    } catch (_) {}

    const article = await Article.findById(req.params.id)
      .populate('author');
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    // コメントを取得（親 + 返信）
    const [parentComments, replyComments] = await Promise.all([
      Comment.find({ article: req.params.id, parent: null })
        .populate('author')
        .sort({ createdAt: -1, _id: -1 })
        .lean(),
      Comment.find({ article: req.params.id, parent: { $ne: null } })
        .populate('author')
        .sort({ createdAt: 1, _id: 1 })
        .lean(),
    ]);

    const repliesByParent = new Map();
    (replyComments || []).forEach((c) => {
      const pid = c && c.parent ? String(c.parent) : '';
      if (!pid) return;
      const arr = repliesByParent.get(pid) || [];
      arr.push(c);
      repliesByParent.set(pid, arr);
    });

    const comments = (parentComments || []).map((c) => {
      const id = c && c._id ? String(c._id) : '';
      return { ...c, replies: repliesByParent.get(id) || [] };
    });
    const commentCount = (parentComments ? parentComments.length : 0) + (replyComments ? replyComments.length : 0);

    // レビュー（短評）を取得
    const reviewSummary = {
      count: 0,
      avgRaw: null,
      bayesScore: null,
      stars: { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 },
      topProsTags: [],
      topConsTags: [],
    };
    let reviews = [];
    let myReview = null;

    try {
      const aid = String(req.params.id || '').trim();
      if (mongoose.Types.ObjectId.isValid(aid)) {
        const articleObjId = new mongoose.Types.ObjectId(aid);

        const [globalStats, summaryRows] = await Promise.all([
          getGlobalReviewStats(),
          Review.aggregate([
            { $match: { article: articleObjId } },
            {
              $group: {
                _id: '$article',
                count: { $sum: 1 },
                avg: { $avg: '$rating' },
                s1: { $sum: { $cond: [{ $eq: ['$rating', 1] }, 1, 0] } },
                s2: { $sum: { $cond: [{ $eq: ['$rating', 2] }, 1, 0] } },
                s3: { $sum: { $cond: [{ $eq: ['$rating', 3] }, 1, 0] } },
                s4: { $sum: { $cond: [{ $eq: ['$rating', 4] }, 1, 0] } },
                s5: { $sum: { $cond: [{ $eq: ['$rating', 5] }, 1, 0] } },
              },
            },
          ]),
        ]);

        if (summaryRows && summaryRows[0]) {
          const s = summaryRows[0];
          const v = Number(s.count) || 0;
          const R = Number(s.avg);
          const C = Number(globalStats && globalStats.avg);
          const m = 10;
          reviewSummary.count = v;
          reviewSummary.avgRaw = Number.isFinite(R) ? R : null;
          reviewSummary.stars = {
            1: Number(s.s1) || 0,
            2: Number(s.s2) || 0,
            3: Number(s.s3) || 0,
            4: Number(s.s4) || 0,
            5: Number(s.s5) || 0,
          };
          if (v > 0 && Number.isFinite(R) && Number.isFinite(C)) {
            reviewSummary.bayesScore = ((v / (v + m)) * R) + ((m / (v + m)) * C);
          } else if (Number.isFinite(C)) {
            reviewSummary.bayesScore = C;
          }
        }

        const [topPros, topCons] = await Promise.all([
          Review.aggregate([
            { $match: { article: articleObjId } },
            { $unwind: '$prosTags' },
            { $group: { _id: '$prosTags', c: { $sum: 1 } } },
            { $sort: { c: -1, _id: 1 } },
            { $limit: 3 },
          ]),
          Review.aggregate([
            { $match: { article: articleObjId } },
            { $unwind: '$consTags' },
            { $group: { _id: '$consTags', c: { $sum: 1 } } },
            { $sort: { c: -1, _id: 1 } },
            { $limit: 3 },
          ]),
        ]);

        reviewSummary.topProsTags = (topPros || []).map((r) => String(r._id || '')).filter(Boolean);
        reviewSummary.topConsTags = (topCons || []).map((r) => String(r._id || '')).filter(Boolean);

        const viewerId = req.user ? String(req.user.id || '') : '';
        const [list, mine] = await Promise.all([
          Review.find({ article: aid })
            .populate('author')
            .sort({ helpfulCount: -1, createdAt: -1, _id: -1 })
            .limit(80)
            .lean(),
          viewerId
            ? Review.findOne({ article: aid, author: viewerId }).lean()
            : Promise.resolve(null),
        ]);

        reviews = (list || []).map((r) => {
          const helped = viewerId && Array.isArray(r.helpfulBy) && r.helpfulBy.some((x) => String(x) === viewerId);
          return { ...r, viewerHasHelped: !!helped };
        });
        myReview = mine;
      }
    } catch (e) {
      reviews = [];
      myReview = null;
      try { console.warn('review fetch failed:', e && e.message ? e.message : String(e)); } catch (_) {}
    }
    
    // 閲覧数を増加
    article.views += 1;
    await article.save();

    // 日別アクセス数（JST）を集計（軽量カウンター）
    try {
      const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
      const day = new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
      const authorId = article && article.author && (article.author._id || article.author) ? (article.author._id || article.author) : null;
      if (authorId) {
        await DailyArticleView.updateOne(
          { day, article: article._id },
          { $setOnInsert: { author: authorId, createdAt: new Date() }, $set: { updatedAt: new Date() }, $inc: { views: 1 } },
          { upsert: true }
        );
      }
    } catch (_) {
      // 集計失敗は本表示を止めない
    }

    // 流入元（参照元）を日別に集計（ドメイン単位）
    try {
      const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
      const day = new Date(Date.now() + JST_OFFSET_MS).toISOString().slice(0, 10);
      const authorId = article && article.author && (article.author._id || article.author) ? (article.author._id || article.author) : null;
      if (authorId) {
        const rawRef = String(req.get('referer') || '').trim();
        const reqHost = String(req.get('host') || '').trim().toLowerCase();

        let refType = 'direct';
        let refHost = '';
        if (rawRef) {
          try {
            const u = new URL(rawRef);
            refHost = String(u.hostname || '').trim().toLowerCase();
            if (refHost) {
              refType = (reqHost && refHost === reqHost) ? 'internal' : 'external';
            }
          } catch (_) {
            // invalid referrer
          }
        }

        if (refHost && refHost.length > 200) refHost = refHost.slice(0, 200);

        await DailyArticleReferrer.updateOne(
          { day, article: article._id, refType, refHost },
          { $setOnInsert: { author: authorId, createdAt: new Date() }, $set: { updatedAt: new Date() }, $inc: { views: 1 } },
          { upsert: true }
        );
      }
    } catch (_) {
      // 集計失敗は本表示を止めない
    }
    
    // MarkdownをHTMLに変換（既にHTMLの場合はそのまま使用）
    const articleWithHtml = article.toObject();
    
    if (article.content && article.content.includes('<')) {
      // すでにHTMLの場合はそのまま使用
      articleWithHtml.contentHtml = article.content;
    } else {
      // Markdownの場合は変換
      articleWithHtml.contentHtml = marked.parse(article.content || '');
    }

    // 本文内のDLsite作品URLをdlaf作品リンクへ置換（既存記事にも適用）
    try {
      const { html, firstAffiliateLink } = rewriteDlsiteWorkLinksInHtml(articleWithHtml.contentHtml, { aid: DEFAULT_AID });
      articleWithHtml.contentHtml = html;

      const normalized = normalizeAffiliateLink(articleWithHtml.affiliateLink, { aid: DEFAULT_AID });
      if (normalized && normalized !== articleWithHtml.affiliateLink) {
        articleWithHtml.affiliateLink = normalized;
      } else if ((!articleWithHtml.affiliateLink || !String(articleWithHtml.affiliateLink).trim()) && firstAffiliateLink) {
        articleWithHtml.affiliateLink = firstAffiliateLink;
      } else if (articleWithHtml.affiliateLink && !/^https?:\/\//i.test(String(articleWithHtml.affiliateLink))) {
        // 不正値は表示上は無効化
        articleWithHtml.affiliateLink = '';
      }
    } catch (_) {
      // 変換失敗は表示を止めない
    }

    // 比較して買うための導線（同ジャンル高評価 / 同タグで最近レビュー増）
    let compareTopByGenreReviews = [];
    let compareTrendingByTags = [];

    try {
      const baseSelect = '_id title gameTitle imageUrl genre affiliateLink createdAt updatedAt';
      const currentId = String(articleWithHtml._id || '').trim();
      const currentObjId = mongoose.Types.ObjectId.isValid(currentId) ? new mongoose.Types.ObjectId(currentId) : null;

      // 同ジャンル: 評価が高い（ベイズ補正）
      const currentGenre = String(articleWithHtml.genre || '').trim();
      if (currentObjId && currentGenre) {
        const candidates = await Article.find({ status: 'published', _id: { $ne: currentObjId }, genre: currentGenre })
          .select(baseSelect)
          .limit(60)
          .lean();

        const ids = (candidates || []).map((a) => a && a._id).filter(Boolean);
        if (ids.length) {
          const [globalStats, rows] = await Promise.all([
            getGlobalReviewStats(),
            Review.aggregate([
              { $match: { article: { $in: ids } } },
              { $group: { _id: '$article', count: { $sum: 1 }, avg: { $avg: '$rating' } } },
            ]),
          ]);

          const C = Number(globalStats && globalStats.avg);
          const m = 10;
          const scoreMap = new Map(
            (rows || []).map((r) => {
              const v = Number(r.count) || 0;
              const R = Number(r.avg);
              const bayes = (v > 0 && Number.isFinite(R) && Number.isFinite(C))
                ? ((v / (v + m)) * R) + ((m / (v + m)) * C)
                : (Number.isFinite(C) ? C : null);
              return [String(r._id), { count: v, avg: Number.isFinite(R) ? R : null, bayesScore: bayes }];
            })
          );

          compareTopByGenreReviews = (candidates || [])
            .map((a) => {
              const s = scoreMap.get(String(a._id)) || { count: 0, avg: null, bayesScore: null };
              return { ...a, reviewCount: s.count, reviewAvg: s.avg, bayesScore: s.bayesScore };
            })
            .filter((a) => (a.reviewCount || 0) > 0)
            .sort((a, b) => {
              const sb = Number(b.bayesScore ?? -1);
              const sa = Number(a.bayesScore ?? -1);
              if (sb !== sa) return sb - sa;
              return (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0);
            })
            .slice(0, 6);
        }
      }

      // 同タグ: 最近レビューが増えている（直近30日）
      const tags = Array.isArray(articleWithHtml.tags) ? articleWithHtml.tags : [];
      const currentTags = tags.map((t) => String(t || '').trim()).filter(Boolean).slice(0, 6);
      if (currentObjId && currentTags.length) {
        const candidates = await Article.find({ status: 'published', _id: { $ne: currentObjId }, tags: { $in: currentTags } })
          .select(baseSelect)
          .limit(80)
          .lean();

        const ids = (candidates || []).map((a) => a && a._id).filter(Boolean);
        if (ids.length) {
          const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          const [globalStats, recentRows, totalRows] = await Promise.all([
            getGlobalReviewStats(),
            Review.aggregate([
              { $match: { article: { $in: ids }, createdAt: { $gte: since } } },
              { $group: { _id: '$article', recentCount: { $sum: 1 } } },
              { $sort: { recentCount: -1, _id: 1 } },
              { $limit: 12 },
            ]),
            Review.aggregate([
              { $match: { article: { $in: ids } } },
              { $group: { _id: '$article', count: { $sum: 1 }, avg: { $avg: '$rating' } } },
            ]),
          ]);

          const recentMap = new Map((recentRows || []).map((r) => [String(r._id), Number(r.recentCount) || 0]));
          const C = Number(globalStats && globalStats.avg);
          const m = 10;
          const scoreMap = new Map(
            (totalRows || []).map((r) => {
              const v = Number(r.count) || 0;
              const R = Number(r.avg);
              const bayes = (v > 0 && Number.isFinite(R) && Number.isFinite(C))
                ? ((v / (v + m)) * R) + ((m / (v + m)) * C)
                : (Number.isFinite(C) ? C : null);
              return [String(r._id), { count: v, avg: Number.isFinite(R) ? R : null, bayesScore: bayes }];
            })
          );

          compareTrendingByTags = (candidates || [])
            .map((a) => {
              const recentReviewCount = recentMap.get(String(a._id)) || 0;
              const s = scoreMap.get(String(a._id)) || { count: 0, avg: null, bayesScore: null };
              return { ...a, recentReviewCount, reviewCount: s.count, reviewAvg: s.avg, bayesScore: s.bayesScore };
            })
            .filter((a) => (a.recentReviewCount || 0) > 0)
            .sort((a, b) => {
              const rb = Number(b.recentReviewCount) || 0;
              const ra = Number(a.recentReviewCount) || 0;
              if (rb !== ra) return rb - ra;
              const sb = Number(b.bayesScore ?? -1);
              const sa = Number(a.bayesScore ?? -1);
              if (sb !== sa) return sb - sa;
              return (Number(b.reviewCount) || 0) - (Number(a.reviewCount) || 0);
            })
            .slice(0, 6);
        }
      }
    } catch (e) {
      compareTopByGenreReviews = [];
      compareTrendingByTags = [];
      try { console.warn('compare blocks build failed:', e && e.message ? e.message : String(e)); } catch (_) {}
    }

    // 記事末尾の回遊導線: 同属性のおすすめ / 同サークル(開発元)の他作
    const baseQuery = { status: 'published', _id: { $ne: article._id } };
    let recommendedSameAttribute = [];
    let recommendedSameDeveloper = [];

    try {
      // 同属性: 同ジャンル優先 + タグ一致数でスコアリング（新着順ベース）
      const tagSet = getTagSet(article.tags);
      const or = [];
      if (article.genre) or.push({ genre: article.genre });
      if (tagSet.size > 0) or.push({ tags: { $in: Array.from(tagSet) } });

      if (or.length > 0) {
        const candidates = await Article.find({ ...baseQuery, $or: or })
          .populate('author')
          .sort({ createdAt: -1, _id: -1 })
          .limit(60)
          .lean();

        const scored = (candidates || []).map((a) => {
          const genreBoost = article.genre && a && a.genre === article.genre ? 100 : 0;
          const tagMatches = countTagMatches(a && a.tags, tagSet);
          const score = genreBoost + (tagMatches * 10);
          return { a, score, tagMatches };
        });

        scored.sort((x, y) => {
          if ((y.score || 0) !== (x.score || 0)) return (y.score || 0) - (x.score || 0);
          if ((y.tagMatches || 0) !== (x.tagMatches || 0)) return (y.tagMatches || 0) - (x.tagMatches || 0);
          const ya = y.a || {};
          const xa = x.a || {};
          const yCreated = ya.createdAt ? new Date(ya.createdAt).getTime() : 0;
          const xCreated = xa.createdAt ? new Date(xa.createdAt).getTime() : 0;
          if (yCreated !== xCreated) return yCreated - xCreated;
          return String(ya._id || '').localeCompare(String(xa._id || ''));
        });

        recommendedSameAttribute = scored.slice(0, 3).map((r) => r.a);
      }

      // 同サークル(開発元): developer一致
      if (article.developer) {
        recommendedSameDeveloper = await Article.find({ ...baseQuery, developer: article.developer })
          .populate('author')
          .sort({ createdAt: -1, _id: -1 })
          .limit(3)
          .lean();
      }

      // 位置別CTRに合わせて「一番良い枠」に一番良い候補を置く
      try {
        const [attrOrder, devOrder] = await Promise.all([
          getRelatedPositionOrder('same_attribute', 30),
          getRelatedPositionOrder('same_developer', 30),
        ]);
        recommendedSameAttribute = reorderByPositionOrder(recommendedSameAttribute, attrOrder);
        recommendedSameDeveloper = reorderByPositionOrder(recommendedSameDeveloper, devOrder);
      } catch (e) {
        // 並び替え失敗は無視（記事表示を優先）
      }
    } catch (e) {
      // 回遊導線の取得失敗で記事表示自体が落ちないようにする
      recommendedSameAttribute = [];
      recommendedSameDeveloper = [];
      try {
        console.warn('Related articles fetch failed:', e && e.message ? e.message : String(e));
      } catch (_) {}
    }

    // 関連動画（YouTube）: 単語ベースの曖昧検索 → 統合・重複排除
    let relatedVideos = [];
    try {
      const keywords = buildYoutubeSearchKeywords(articleWithHtml).slice(0, 4);
      const seenVideoIds = new Set();
      for (const kw of keywords) {
        const videos = await searchVideosByQuery(kw, { limit: 3 });
        for (const v of videos) {
          const id = v && v.id ? String(v.id) : '';
          if (!id || seenVideoIds.has(id)) continue;
          seenVideoIds.add(id);
          relatedVideos.push(v);
          if (relatedVideos.length >= 6) break;
        }
        if (relatedVideos.length >= 6) break;
      }
    } catch (e) {
      relatedVideos = [];
      try {
        console.warn('Related videos fetch failed:', e && e.message ? e.message : String(e));
      } catch (_) {}
    }

    // SEO
    const title = articleWithHtml.title || articleWithHtml.gameTitle || '記事';
    const metaDescription = String(articleWithHtml.description || '').trim().slice(0, 160);
    const ogImage = articleWithHtml.imageUrl || undefined;
    const authorName = (articleWithHtml.author && articleWithHtml.author.displayName) ? articleWithHtml.author.displayName : 'R18Hub';
    const canonicalUrl = (res.locals && res.locals.canonicalUrl)
      ? String(res.locals.canonicalUrl)
      : `${req.protocol}://${req.get('host')}${req.originalUrl}`;
    const jsonLd = {
      '@context': 'https://schema.org',
      '@type': 'Article',
      headline: title,
      description: metaDescription || undefined,
      image: ogImage ? [ogImage] : undefined,
      datePublished: articleWithHtml.createdAt ? new Date(articleWithHtml.createdAt).toISOString() : undefined,
      dateModified: articleWithHtml.updatedAt ? new Date(articleWithHtml.updatedAt).toISOString() : undefined,
      author: { '@type': 'Person', name: authorName },
      mainEntityOfPage: { '@type': 'WebPage', '@id': (res.locals && res.locals.canonicalUrl) ? res.locals.canonicalUrl : undefined }
    };

    // 「結局買うべき？」の結論1行（現在値に基づく）
    const scoreForDecision = Number(reviewSummary && (reviewSummary.bayesScore ?? reviewSummary.avgRaw));
    const countForDecision = Number(reviewSummary && reviewSummary.count) || 0;
    const scoreText = Number.isFinite(scoreForDecision) ? `★${scoreForDecision.toFixed(2)}` : '★-';
    let purchaseConclusion = '';
    if (countForDecision <= 0) {
      purchaseConclusion = 'まだ評価が0件です。気になるなら買って自分の評価を残すのが一番早いです。';
    } else if (!Number.isFinite(scoreForDecision)) {
      purchaseConclusion = `評価は${countForDecision}件ありますが、集計値が取得できませんでした。短評を見て判断がおすすめです。`;
    } else if (scoreForDecision >= 4.2 && countForDecision >= 10) {
      purchaseConclusion = `${scoreText}（${countForDecision}件）。評価も件数も十分なので買い寄りです。`;
    } else if (scoreForDecision >= 4.0 && countForDecision >= 5) {
      purchaseConclusion = `${scoreText}（${countForDecision}件）。高評価なので買い候補です。`;
    } else if (scoreForDecision >= 4.3 && countForDecision < 5) {
      purchaseConclusion = `${scoreText}（${countForDecision}件）。かなり良さそうですが件数が少ないので、刺さりそうなら買いです。`;
    } else if (scoreForDecision >= 3.6 && countForDecision >= 5) {
      purchaseConclusion = `${scoreText}（${countForDecision}件）。好みが分かれそうなので、短評の注意点も見て判断がおすすめです。`;
    } else if (countForDecision >= 5) {
      purchaseConclusion = `${scoreText}（${countForDecision}件）。評価が伸びていないので慎重に、短評の注意点を確認してからがおすすめです。`;
    } else {
      purchaseConclusion = `${scoreText}（${countForDecision}件）。判断材料が少なめなので、短評を見て合いそうなら買いです。`;
    }
    
    res.render('articles/show', {
      title,
      metaDescription,
      ogType: 'article',
      ogImage,
      jsonLd,
      canonicalUrl,
      article: articleWithHtml,
      comments,
      commentCount,
      reviewSummary,
      purchaseConclusion,
      reviews,
      myReview,
      reviewPostFeedback,
      compareTopByGenreReviews,
      compareTrendingByTags,
      recommendedSameAttribute,
      recommendedSameDeveloper,
      relatedVideos,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// 記事一覧（公開済み）
router.get('/', async (req, res) => {
  try {
    // 表示件数制御 + ページネーション: デフォルト10件、オプション: 10,30,50,100
    const allowed = [10, 30, 50, 100];
    let per = parseInt(req.query.per, 10) || 10;
    if (!allowed.includes(per)) per = 10;
    let page = parseInt(req.query.page, 10) || 1;
    if (page < 1) page = 1;

    const articlesQuery = { status: 'published' };

    // 年/月フィルタ（releaseDate優先、未設定はcreatedAt）
    const rawYear = req.query.year;
    const rawMonth = req.query.month;
    const selectedYear = rawYear != null && rawYear !== '' ? parseInt(String(rawYear), 10) : null;
    const selectedMonth = rawMonth != null && rawMonth !== '' ? parseInt(String(rawMonth), 10) : null;
    const hasValidYear = Number.isFinite(selectedYear) && selectedYear >= 2000 && selectedYear <= 2100;
    const hasValidMonth = Number.isFinite(selectedMonth) && selectedMonth >= 1 && selectedMonth <= 12;

    // 検索（部分一致）: q=...
    const rawQ = (req.query.q ?? '').toString().trim();
    const q = rawQ.length > 80 ? rawQ.slice(0, 80) : rawQ;
    const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    if (q) {
      const rx = new RegExp(escapeRegExp(q), 'i');
      articlesQuery.$or = [
        { title: rx },
        { gameTitle: rx },
        { developer: rx },
        { genre: rx },
        { platform: rx },
        { tags: rx },
      ];
    }

    const normalizeTag = (t) => String(t || '').trim().replace(/^#/, '');
    const selectedTags = [];

    // Primary: tags=tag1,tag2
    if (req.query.tags) {
      const raw = Array.isArray(req.query.tags) ? req.query.tags.join(',') : String(req.query.tags);
      raw
        .split(',')
        .map(normalizeTag)
        .filter(Boolean)
        .forEach((t) => selectedTags.push(t));
    }

    // Backward compatible: tag=tag1 (or tag=tag1&tag=tag2)
    if (req.query.tag) {
      const raw = Array.isArray(req.query.tag) ? req.query.tag : [req.query.tag];
      raw.map(normalizeTag).filter(Boolean).forEach((t) => selectedTags.push(t));
    }

    const uniqueTags = Array.from(new Set(selectedTags)).slice(0, 10);
    if (uniqueTags.length) {
      articlesQuery.tags = { $in: uniqueTags };
    }

    // 評価フィルター（10段階）: ratings=1,2 / 互換: rating=1 (or rating=1&rating=2)
    const selectedRatings = [];
    const normalizeRating = (r) => {
      const n = parseInt(String(r || '').trim(), 10);
      if (!Number.isFinite(n)) return null;
      if (n < 1 || n > 10) return null;
      return n;
    };

    if (req.query.ratings) {
      const raw = Array.isArray(req.query.ratings) ? req.query.ratings.join(',') : String(req.query.ratings);
      raw
        .split(',')
        .map(normalizeRating)
        .filter((n) => n !== null)
        .forEach((n) => selectedRatings.push(n));
    }

    if (req.query.rating) {
      const raw = Array.isArray(req.query.rating) ? req.query.rating : [req.query.rating];
      raw
        .map(normalizeRating)
        .filter((n) => n !== null)
        .forEach((n) => selectedRatings.push(n));
    }

    const uniqueRatings = Array.from(new Set(selectedRatings)).filter((n) => n >= 1 && n <= 10);
    if (uniqueRatings.length) {
      articlesQuery.rating = { $in: uniqueRatings };
    }

    // 年/月タブ用: 現在の検索条件（年/月以外）で集計
    const baseQueryForBuckets = { ...articlesQuery };

    // 既存の$or（検索）を壊さずに、日付条件は$andに積む
    const andConditions = [];
    if (articlesQuery.$and && Array.isArray(articlesQuery.$and)) {
      andConditions.push(...articlesQuery.$and);
    }

    if (hasValidYear) {
      if (hasValidMonth) {
        const mStart = new Date(Date.UTC(selectedYear, selectedMonth - 1, 1, 0, 0, 0, 0));
        const mEnd = new Date(Date.UTC(selectedYear, selectedMonth, 1, 0, 0, 0, 0));
        andConditions.push({
          $or: [
            { releaseDate: { $gte: mStart, $lt: mEnd } },
            {
              $and: [
                { $or: [{ releaseDate: { $exists: false } }, { releaseDate: null }] },
                { createdAt: { $gte: mStart, $lt: mEnd } },
              ],
            },
          ],
        });
      } else {
        const start = new Date(Date.UTC(selectedYear, 0, 1, 0, 0, 0, 0));
        const end = new Date(Date.UTC(selectedYear + 1, 0, 1, 0, 0, 0, 0));
        andConditions.push({
          $or: [
            { releaseDate: { $gte: start, $lt: end } },
            {
              $and: [
                { $or: [{ releaseDate: { $exists: false } }, { releaseDate: null }] },
                { createdAt: { $gte: start, $lt: end } },
              ],
            },
          ],
        });
      }
    }

    if (andConditions.length) {
      articlesQuery.$and = andConditions;
    } else {
      delete articlesQuery.$and;
    }

    // 年一覧・月一覧（年選択時のみ）
    const yearsAgg = await Article.aggregate([
      { $match: baseQueryForBuckets },
      { $addFields: { _effectiveDate: { $ifNull: ['$releaseDate', '$createdAt'] } } },
      { $project: { y: { $year: '$_effectiveDate' }, m: { $month: '$_effectiveDate' } } },
      { $group: { _id: '$y', count: { $sum: 1 } } },
      { $sort: { _id: -1 } },
    ]);
    const availableYears = (yearsAgg || [])
      .map((r) => (r && r._id != null ? Number(r._id) : null))
      .filter((n) => Number.isFinite(n));

    let availableMonths = [];
    if (hasValidYear) {
      const monthsAgg = await Article.aggregate([
        { $match: baseQueryForBuckets },
        { $addFields: { _effectiveDate: { $ifNull: ['$releaseDate', '$createdAt'] } } },
        { $match: { $expr: { $eq: [{ $year: '$_effectiveDate' }, selectedYear] } } },
        { $group: { _id: { $month: '$_effectiveDate' }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } },
      ]);
      availableMonths = (monthsAgg || [])
        .map((r) => (r && r._id != null ? Number(r._id) : null))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= 12);
    }

    const recommendedTagsAgg = await Article.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $match: { tags: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 12 }
    ]);
    const recommendedTags = (recommendedTagsAgg || []).map((x) => x._id).filter(Boolean);

    // 並び替え（デフォルト: 発売日の新しい順）
    const allowedSorts = ['new', 'old', 'release_new', 'release_old'];
    let sortKey = (req.query.sort || 'release_new').toString();
    if (!allowedSorts.includes(sortKey)) sortKey = 'release_new';
    const sortSpec = (() => {
      switch (sortKey) {
        case 'old':
          return { createdAt: 1, _id: 1 };
        case 'release_new':
          return { releaseDate: -1, createdAt: -1, _id: -1 };
        case 'release_old':
          return { releaseDate: 1, createdAt: -1, _id: -1 };
        case 'new':
        default:
          return { createdAt: -1, _id: -1 };
      }
    })();

    const totalCount = await Article.countDocuments(articlesQuery);
    const totalPages = Math.max(1, Math.ceil(totalCount / per));
    if (page > totalPages) page = totalPages;

    // 0件時の提案（検索語がある場合のみ）
    let suggestDevelopers = [];
    let suggestGenres = [];
    let suggestTags = [];
    try {
      const rawQ = (req.query.q ?? '').toString().trim();
      const q = rawQ.length > 80 ? rawQ.slice(0, 80) : rawQ;
      if (totalCount === 0 && q) {
        const escapeRegExp = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const rx = new RegExp(escapeRegExp(q), 'i');

        const [devRows, genreRows, tagRows] = await Promise.all([
          Article.aggregate([
            { $match: { status: 'published', developer: { $type: 'string', $ne: '', $regex: rx } } },
            { $group: { _id: '$developer', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 5 },
          ]),
          Article.aggregate([
            { $match: { status: 'published', genre: { $type: 'string', $ne: '', $regex: rx } } },
            { $group: { _id: '$genre', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 5 },
          ]),
          Article.aggregate([
            { $match: { status: 'published', tags: { $exists: true, $ne: [] } } },
            { $unwind: '$tags' },
            { $match: { tags: { $type: 'string', $ne: '', $regex: rx } } },
            { $group: { _id: '$tags', count: { $sum: 1 } } },
            { $sort: { count: -1, _id: 1 } },
            { $limit: 8 },
          ]),
        ]);

        suggestDevelopers = (devRows || []).map((r) => String(r._id || '')).filter(Boolean);
        suggestGenres = (genreRows || []).map((r) => String(r._id || '')).filter(Boolean);
        suggestTags = (tagRows || []).map((r) => String(r._id || '')).filter(Boolean);
      }
    } catch (_) {
      suggestDevelopers = [];
      suggestGenres = [];
      suggestTags = [];
    }

    const articles = await Article.find(articlesQuery)
      .populate('author')
      .sort(sortSpec)
      .skip((page - 1) * per)
      .limit(per);

    const heroHtml = `
      <div class="hero">
        <h1>記事一覧</h1>
        <p>公開された記事を発売日の新しい順に表示します。</p>
      </div>
    `;

    res.render('articles/index', {
      title: '記事一覧',
      metaDescription: '公開された記事一覧です。タグやキーワードでレビュー/攻略記事を探せます。',
      articles,
      heroHtml,
      per,
      totalCount,
      page,
      totalPages,
      sortKey,
      recommendedTags,
      selectedTags: uniqueTags,
      selectedRatings: uniqueRatings,
      availableYears,
      availableMonths,
      selectedYear: hasValidYear ? selectedYear : null,
      selectedMonth: hasValidYear && hasValidMonth ? selectedMonth : null,
      suggestDevelopers,
      suggestGenres,
      suggestTags,
      query: req.query
    });
  } catch (err) {
    console.error('記事一覧取得エラー:', err);
    res.status(500).send('記事一覧の表示に失敗しました');
  }
});

// 記事編集フォーム（管理者のみ）
router.get('/:id/edit', ensureAdmin, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    res.render('articles/edit', { article });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

// 記事更新（管理者のみ）
router.put('/:id', ensureAdmin, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    const updateData = { ...req.body };

    // アフィリエイトリンク（DLsite作品URL → dlaf作品リンク）
    if (typeof updateData.affiliateLink !== 'undefined') {
      updateData.affiliateLink = normalizeAffiliateLink(updateData.affiliateLink, { aid: DEFAULT_AID }) || '';
    }
    
    // タグの処理
    if (req.body.tags) {
      updateData.tags = req.body.tags.split(',').map(tag => tag.trim()).filter(tag => tag);
    }
    
    await Article.findByIdAndUpdate(req.params.id, updateData, {
      new: true,
      runValidators: true
    });
    
    res.redirect(`/articles/${req.params.id}`);
  } catch (err) {
    console.error(err);
    res.status(500).send('記事の更新に失敗しました');
  }
});

// 記事削除（管理者のみ）
router.delete('/:id', ensureAdmin, async (req, res) => {
  try {
    const article = await Article.findById(req.params.id);
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    // 記事に関連するコメントも削除
    await Comment.deleteMany({ article: req.params.id });
    await Article.findByIdAndDelete(req.params.id);
    
    res.redirect('/dashboard');
  } catch (err) {
    console.error(err);
    res.status(500).send('記事の削除に失敗しました');
  }
});

// 複数記事の一括削除（管理者のみ）
router.post('/bulk-delete', ensureAdmin, async (req, res) => {
  try {
    const { articleIds } = req.body;
    
    if (!articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '削除する記事を選択してください' 
      });
    }
    
    // 各記事のコメントを削除
    for (const articleId of articleIds) {
      await Comment.deleteMany({ article: articleId });
    }
    
    // 記事を一括削除
    const result = await Article.deleteMany({ 
      _id: { $in: articleIds },
      author: req.user.id // 自分の記事のみ削除可能
    });
    
    res.json({ 
      success: true, 
      deletedCount: result.deletedCount 
    });
  } catch (err) {
    console.error('一括削除エラー:', err);
    res.status(500).json({ 
      success: false, 
      error: '記事の削除に失敗しました' 
    });
  }
});

// 複数記事のステータス一括更新（管理者のみ）
router.post('/bulk-update-status', ensureAdmin, async (req, res) => {
  try {
    const { articleIds, status } = req.body;
    
    if (!articleIds || !Array.isArray(articleIds) || articleIds.length === 0) {
      return res.status(400).json({ 
        success: false, 
        error: '更新する記事を選択してください' 
      });
    }
    
    if (!status || !['published', 'draft'].includes(status)) {
      return res.status(400).json({ 
        success: false, 
        error: '無効なステータスです' 
      });
    }
    
    // 記事のステータスを一括更新
    const result = await Article.updateMany(
      { 
        _id: { $in: articleIds },
        author: req.user.id // 自分の記事のみ更新可能
      },
      { 
        $set: { 
          status: status,
          updatedAt: Date.now()
        } 
      }
    );
    
    res.json({ 
      success: true, 
      updatedCount: result.modifiedCount 
    });
  } catch (err) {
    console.error('一括ステータス更新エラー:', err);
    res.status(500).json({ 
      success: false, 
      error: 'ステータスの更新に失敗しました' 
    });
  }
});

// 下書きの記事を全て公開（管理者のみ）
router.post('/publish-all-drafts', ensureAdmin, async (req, res) => {
  try {
    const result = await Article.updateMany(
      {
        author: req.user.id,
        status: 'draft',
      },
      {
        $set: {
          status: 'published',
          updatedAt: Date.now(),
        },
      }
    );

    res.json({
      success: true,
      updatedCount: result.modifiedCount,
    });
  } catch (err) {
    console.error('下書き一括公開エラー:', err);
    res.status(500).json({
      success: false,
      error: '下書きの一括公開に失敗しました',
    });
  }
});

module.exports = router;
