const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const GalleryComment = require('../models/GalleryComment');
const DailyOutboundClick = require('../models/DailyOutboundClick');
const DailyArticleView = require('../models/DailyArticleView');
const { ensureAdmin } = require('../middleware/auth');

const JST_MS = 9 * 60 * 60 * 1000;
const MS_DAY = 24 * 60 * 60 * 1000;

function jstDaysList(count, offsetDays = 0) {
  const s = new Date(Date.now() + JST_MS).toISOString().slice(0, 10);
  const [y, m, d] = s.split('-').map(Number);
  const endMs = Date.UTC(y, m - 1, d) - JST_MS - offsetDays * MS_DAY;
  return Array.from({ length: count }, (_, i) =>
    new Date(endMs - (count - 1 - i) * MS_DAY + JST_MS).toISOString().slice(0, 10)
  );
}

router.get('/', ensureAdmin, async (req, res) => {
  try {
    const PERIOD = 30;
    const thisMonthDays = jstDaysList(PERIOD);
    const lastMonthDays = jstDaysList(PERIOD, PERIOD);
    const sevenDaysAgo  = new Date(Date.now() - 7  * MS_DAY);
    const sixtyDaysAgo  = new Date(Date.now() - 60 * MS_DAY);

    // --- Panel 1: アウトバウンドクリック (FC2/FANZA) ---
    const [clicksThisRaw, clicksLastRaw, topSectionsRaw, clicksByDayRaw] = await Promise.all([
      DailyOutboundClick.aggregate([
        { $match: { date: { $in: thisMonthDays } } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ]),
      DailyOutboundClick.aggregate([
        { $match: { date: { $in: lastMonthDays } } },
        { $group: { _id: null, total: { $sum: '$count' } } },
      ]),
      DailyOutboundClick.aggregate([
        { $match: { date: { $in: thisMonthDays } } },
        { $group: { _id: { kind: '$kind', section: '$section' }, total: { $sum: '$count' } } },
        { $sort: { total: -1 } },
        { $limit: 10 },
      ]),
      DailyOutboundClick.aggregate([
        { $match: { date: { $in: thisMonthDays } } },
        { $group: { _id: '$date', total: { $sum: '$count' } } },
        { $sort: { _id: 1 } },
      ]),
    ]);

    const clicksThis = (clicksThisRaw[0] && clicksThisRaw[0].total) || 0;
    const clicksLast = (clicksLastRaw[0] && clicksLastRaw[0].total) || 0;
    const clickChangePct = clicksLast > 0
      ? ((clicksThis - clicksLast) / clicksLast * 100)
      : null;

    const clickDayMap = new Map((clicksByDayRaw || []).map(r => [r._id, r.total]));
    const clickTrend  = thisMonthDays.map(d => ({ day: d, total: clickDayMap.get(d) || 0 }));
    const topSections = (topSectionsRaw || []).map(r => ({
      kind:    (r._id && r._id.kind)    || '',
      section: (r._id && r._id.section) || '',
      total:   r.total || 0,
    }));

    // --- Panel 2: 記事パフォーマンス ---
    const [articles, pvAgg] = await Promise.all([
      Article.find()
        .sort({ createdAt: -1 })
        .limit(200)
        .select('title gameTitle status createdAt updatedAt')
        .lean(),
      DailyArticleView.aggregate([
        { $match: { day: { $in: thisMonthDays } } },
        { $group: { _id: '$article', pv: { $sum: '$views' } } },
      ]),
    ]);

    const pvMap = new Map((pvAgg || []).map(r => [String(r._id), r.pv]));
    const enrichedArticles = (articles || []).map(a => {
      const pv30 = pvMap.get(String(a._id)) || 0;
      const stale = new Date(a.updatedAt || a.createdAt) < sixtyDaysAgo;
      return { ...a, pv30, needsRefresh: pv30 >= 30 && stale };
    }).sort((a, b) => b.pv30 - a.pv30);

    // --- Panel 3: 今日のアクション ---
    const [unreadCount, galleryCommentCount, draftCount, recentComments] = await Promise.all([
      Comment.countDocuments({ parent: { $ne: null }, seenByParentAuthorAt: null }),
      GalleryComment.countDocuments({ createdAt: { $gte: sevenDaysAgo } }),
      Article.countDocuments({ status: 'draft' }),
      Comment.find({})
        .sort({ createdAt: -1 })
        .limit(5)
        .populate('article', 'title _id')
        .populate('author', 'displayName')
        .lean(),
    ]);

    const needsRefreshArticles = enrichedArticles.filter(a => a.needsRefresh).slice(0, 5);
    const totalActions = (unreadCount > 0 ? 1 : 0) +
                         (galleryCommentCount > 0 ? 1 : 0) +
                         (needsRefreshArticles.length > 0 ? 1 : 0);

    res.render('dashboard', {
      title: 'ダッシュボード',
      // Panel 1
      clicksThis, clicksLast, clickChangePct, clickTrend, topSections,
      // Panel 2
      enrichedArticles,
      // Panel 3
      unreadCount, galleryCommentCount, draftCount, recentComments,
      needsRefreshArticles, totalActions,
      period: PERIOD,
    });
  } catch (err) {
    console.error('dashboard error:', err);
    res.status(500).send('サーバーエラーが発生しました');
  }
});

module.exports = router;
