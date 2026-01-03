const express = require('express');
const router = express.Router();
const Article = require('../models/Article');
const Comment = require('../models/Comment');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const { marked } = require('marked');

// Markedの設定
marked.setOptions({
  breaks: true,
  gfm: true
});

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
    const article = await Article.findById(req.params.id)
      .populate('author');
    
    if (!article) {
      return res.status(404).send('記事が見つかりません');
    }
    
    // コメントを取得
    const comments = await Comment.find({ article: req.params.id })
      .populate('author')
      .sort({ createdAt: -1 });
    
    // 閲覧数を増加
    article.views += 1;
    await article.save();
    
    // MarkdownをHTMLに変換（既にHTMLの場合はそのまま使用）
    const articleWithHtml = article.toObject();
    
    if (article.content && article.content.includes('<')) {
      // すでにHTMLの場合はそのまま使用
      articleWithHtml.contentHtml = article.content;
    } else {
      // Markdownの場合は変換
      articleWithHtml.contentHtml = marked.parse(article.content || '');
    }

    // SEO
    const title = articleWithHtml.title || articleWithHtml.gameTitle || '記事';
    const metaDescription = String(articleWithHtml.description || '').trim().slice(0, 160);
    const ogImage = articleWithHtml.imageUrl || undefined;
    const authorName = (articleWithHtml.author && articleWithHtml.author.displayName) ? articleWithHtml.author.displayName : 'R18Hub';
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
    
    res.render('articles/show', { title, metaDescription, ogType: 'article', ogImage, jsonLd, article: articleWithHtml, comments });
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

    const recommendedTagsAgg = await Article.aggregate([
      { $match: { status: 'published' } },
      { $unwind: '$tags' },
      { $match: { tags: { $type: 'string', $ne: '' } } },
      { $group: { _id: '$tags', count: { $sum: 1 } } },
      { $sort: { count: -1, _id: 1 } },
      { $limit: 12 }
    ]);
    const recommendedTags = (recommendedTagsAgg || []).map((x) => x._id).filter(Boolean);

    // 並び替え（最小実装: 公開日時の新しい順/古い順）
    const allowedSorts = ['new', 'old', 'release_new', 'release_old'];
    let sortKey = (req.query.sort || 'new').toString();
    if (!allowedSorts.includes(sortKey)) sortKey = 'new';
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

    const articles = await Article.find(articlesQuery)
      .populate('author')
      .sort(sortSpec)
      .skip((page - 1) * per)
      .limit(per);

    const heroHtml = `
      <div class="hero">
        <h1>記事一覧</h1>
        <p>公開された記事を新しい順に表示します。</p>
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

module.exports = router;
