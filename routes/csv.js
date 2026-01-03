const express = require('express');
const router = express.Router();
const multer = require('multer');
const csv = require('csv-parser');
const { createObjectCsvWriter } = require('csv-writer');
const fs = require('fs');
const path = require('path');
const { ensureAuth, ensureAdmin } = require('../middleware/auth');
const Article = require('../models/Article');
const { marked } = require('marked');

// Markdown設定
marked.setOptions({
  breaks: true, // 改行を<br>に変換
  gfm: true, // GitHub Flavored Markdown
});

// ファイルアップロード設定
const upload = multer({ dest: 'uploads/' });

// uploadsフォルダがなければ作成
if (!fs.existsSync('uploads')) {
  fs.mkdirSync('uploads');
}

// @desc    CSV管理ページ表示
// @route   GET /csv
router.get('/', ensureAuth, ensureAdmin, (req, res) => {
  res.render('csv/index', {
    title: 'CSV インポート/エクスポート'
  });
});

// @desc    記事をCSVエクスポート
// @route   GET /csv/export
router.get('/export', ensureAuth, ensureAdmin, async (req, res) => {
  try {
    const articles = await Article.find({ author: req.user.id })
      .sort({ createdAt: -1 })
      .lean();

    if (articles.length === 0) {
      return res.status(404).json({ error: '記事が見つかりません' });
    }

    // CSVファイル名
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-').substring(0, 19);
    const filename = `articles_export_${timestamp}.csv`;
    const filepath = path.join('uploads', filename);

    // CSV Writer設定（BOM付きUTF-8で出力）
    const csvWriter = createObjectCsvWriter({
      path: filepath,
      header: [
        { id: 'id', title: 'ID' },
        { id: 'title', title: 'タイトル' },
        { id: 'gameTitle', title: 'ゲームタイトル' },
        { id: 'description', title: '説明' },
        { id: 'content', title: '本文' },
        { id: 'genre', title: 'ジャンル' },
        { id: 'rating', title: '評価' },
        { id: 'imageUrl', title: '画像URL' },
        { id: 'status', title: 'ステータス' },
        { id: 'createdAt', title: '作成日' }
      ],
      encoding: 'utf8'
    });

    // データを整形
    const records = articles.map(article => ({
      id: article._id.toString(),
      title: article.title || '',
      gameTitle: article.gameTitle || '',
      description: article.description || '',
      content: article.content || '',
      genre: article.genre || '',
      rating: article.rating || 0,
      imageUrl: article.imageUrl || '',
      status: article.status || 'draft',
      createdAt: article.createdAt ? article.createdAt.toISOString() : ''
    }));

    await csvWriter.writeRecords(records);

    // ファイルをダウンロード
    res.download(filepath, filename, (err) => {
      if (err) {
        console.error('ダウンロードエラー:', err);
      }
      // ダウンロード後にファイル削除
      fs.unlink(filepath, (unlinkErr) => {
        if (unlinkErr) console.error('ファイル削除エラー:', unlinkErr);
      });
    });
  } catch (error) {
    console.error('エクスポートエラー:', error);
    res.status(500).json({ error: 'エクスポートに失敗しました' });
  }
});

// @desc    CSVから記事をインポート
// @route   POST /csv/import
router.post('/import', ensureAuth, ensureAdmin, upload.single('csvFile'), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'ファイルが選択されていません' });
    }

    const results = [];
    const filepath = req.file.path;

    // CSVファイルを読み込み（BOM対応）
    fs.createReadStream(filepath)
      .pipe(csv({ 
        skipEmptyLines: true,
        mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim() // BOM/空白を削除
      }))
      .on('data', (data) => results.push(data))
      .on('end', async () => {
        try {
          let importCount = 0;
          let errorCount = 0;
          const errors = [];

          for (const row of results) {
            try {
              // キー名を正規化（日本語ヘッダーに対応）
              const normalizedRow = {
                id: row['ID'] || row['id'],
                title: row['タイトル'] || row['title'],
                gameTitle: row['ゲームタイトル'] || row['gameTitle'],
                description: row['説明'] || row['description'],
                content: row['本文'] || row['content'],
                genre: row['ジャンル'] || row['genre'],
                rating: row['評価'] || row['rating'],
                imageUrl: row['画像URL'] || row['imageUrl'],
                status: row['ステータス'] || row['status'],
                releaseDate: row['発売日'] || row['releaseDate'],
                tags: row['タグ'] || row['tags'],
                affiliateLink: row['アフィリエイトリンク'] || row['affiliateLink']
              };
              
              // 必須フィールドチェック
              if (!normalizedRow.title || !normalizedRow.gameTitle || !normalizedRow.content) {
                errorCount++;
                errors.push(`行スキップ: タイトル、ゲームタイトル、本文は必須です`);
                continue;
              }

              // Markdownをそのまま保存（表示時に変換）
              
              // タグを配列に変換（カンマ区切り）
              const tagsArray = normalizedRow.tags 
                ? normalizedRow.tags.split(',').map(tag => tag.trim()).filter(tag => tag)
                : [];

              // 記事を作成
              await Article.create({
                title: normalizedRow.title,
                gameTitle: normalizedRow.gameTitle,
                description: normalizedRow.description || '',
                content: normalizedRow.content, // Markdownのまま保存
                genre: normalizedRow.genre || 'アドベンチャー',
                rating: parseInt(normalizedRow.rating) || 3,
                imageUrl: normalizedRow.imageUrl || '',
                status: normalizedRow.status || 'draft',
                releaseDate: normalizedRow.releaseDate ? new Date(normalizedRow.releaseDate) : null,
                tags: tagsArray,
                affiliateLink: normalizedRow.affiliateLink || '',
                author: req.user.id
              });

              importCount++;
            } catch (itemError) {
              errorCount++;
              errors.push(`エラー: ${row.title || row['タイトル']} - ${itemError.message}`);
            }
          }

          // アップロードファイルを削除
          fs.unlink(filepath, (err) => {
            if (err) console.error('ファイル削除エラー:', err);
          });

          res.json({
            success: true,
            importCount,
            errorCount,
            errors: errors.slice(0, 10) // 最初の10件のエラーのみ返す
          });
        } catch (error) {
          console.error('インポート処理エラー:', error);
          res.status(500).json({ error: 'インポート処理に失敗しました' });
        }
      })
      .on('error', (error) => {
        console.error('CSV読み込みエラー:', error);
        fs.unlink(filepath, (err) => {
          if (err) console.error('ファイル削除エラー:', err);
        });
        res.status(500).json({ error: 'CSVファイルの読み込みに失敗しました' });
      });
  } catch (error) {
    console.error('インポートエラー:', error);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

module.exports = router;
