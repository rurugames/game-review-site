const express = require('express');
const router = express.Router();
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const Article = require('../models/Article');
const dlsiteService = require('../services/dlsiteService');
const aiService = require('../services/aiService');

// @desc    記事自動生成ページ表示
// @route   GET /generator
router.get('/', ensureAuth, ensureAdmin, (req, res) => {
  res.render('generator/index', {
    title: '記事自動生成'
  });
});

// @desc    指定年月のゲーム取得
// @route   POST /generator/fetch-games
router.post('/fetch-games', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const { year, month } = req.body;
    
    if (!year || !month) {
      return res.status(400).json({ error: '年月を指定してください' });
    }

    // DLsiteから指定年月のR18 PCゲームを取得
    const allGames = await dlsiteService.fetchGamesByMonth(year, month);
    const totalCount = allGames.length;
    
    // 既に記事が存在するゲームタイトルを取得
    const existingArticles = await Article.find({
      gameTitle: { $in: allGames.map(game => game.title) }
    }).select('gameTitle');
    
    const existingGameTitles = new Set(existingArticles.map(article => article.gameTitle));
    
    // 既に記事が存在しないゲームのみフィルタリング
    const games = allGames.filter(game => !existingGameTitles.has(game.title));
    
    res.json({ 
      success: true, 
      games,
      displayCount: games.length,
      totalCount: totalCount,
      filteredCount: totalCount - games.length
    });
  } catch (error) {
    console.error('ゲーム取得エラー:', error);
    res.status(500).json({ error: 'ゲーム情報の取得に失敗しました' });
  }
});

// @desc    選択したゲームの記事を自動生成
// @route   POST /generator/generate
router.post('/generate', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const { games } = req.body;
    
    if (!games || !Array.isArray(games) || games.length === 0) {
      return res.status(400).json({ error: '生成するゲームを選択してください' });
    }

    const generatedArticles = [];
    
    for (const game of games) {
      try {
        // AIで記事内容を生成
        const articleContent = await aiService.generateArticle(game);
        
        // 記事を保存
        const article = await Article.create({
          title: articleContent.title,
          gameTitle: game.title,
          description: articleContent.description,
          content: articleContent.content,
          genre: game.genre || 'アドベンチャー',
          rating: articleContent.rating || 4,
          imageUrl: game.imageUrl || '',
          author: req.user.id,
          status: 'draft' // 下書きとして保存
        });
        
        generatedArticles.push({
          id: article._id,
          title: article.title,
          gameTitle: article.gameTitle
        });
      } catch (error) {
        console.error(`${game.title}の記事生成エラー:`, error);
      }
    }
    
    res.json({ 
      success: true, 
      articles: generatedArticles,
      count: generatedArticles.length
    });
  } catch (error) {
    console.error('記事生成エラー:', error);
    res.status(500).json({ error: '記事の生成に失敗しました' });
  }
});

module.exports = router;
