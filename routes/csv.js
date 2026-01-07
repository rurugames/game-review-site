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
const { normalizeAffiliateLink, DEFAULT_AID } = require('../lib/dlsiteAffiliate');

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
router.post('/import', ensureAuth, ensureAdmin, upload.any(), async (req, res) => {
  try {
    const uploadedFiles = (Array.isArray(req.files) ? req.files : []).slice();
    if (!uploadedFiles.length) {
      return res.status(400).json({ error: 'ファイルが選択されていません' });
    }

    // .csvのみ対象（大文字拡張子も許可）。取り込み順はファイル名（originalname）昇順。
    const decorated = uploadedFiles.map((f, idx) => ({ f, idx }));
    decorated.sort((a, b) => {
      const an = String(a.f.originalname || '').toLowerCase();
      const bn = String(b.f.originalname || '').toLowerCase();
      const c = an.localeCompare(bn);
      return c !== 0 ? c : (a.idx - b.idx);
    });

    let importCount = 0;
    let errorCount = 0;
    const errors = [];

    const safeUnlink = (p) => {
      try {
        fs.unlink(p, (err) => {
          if (err) console.error('ファイル削除エラー:', err);
        });
      } catch (_) {}
    };

    const parseDateLoose = (s) => {
      const raw = String(s || '').trim();
      if (!raw) return null;
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return d;
      // YYYY-MM-DD 以外の軽いゆらぎを許容（YYYY/MM/DD）
      const m = raw.match(/^(\d{4})[\/-](\d{1,2})[\/-](\d{1,2})/);
      if (m) {
        const y = Number(m[1]);
        const mo = Number(m[2]);
        const da = Number(m[3]);
        const dd = new Date(Date.UTC(y, mo - 1, da));
        return isNaN(dd.getTime()) ? null : dd;
      }
      return null;
    };

    const importOneCsv = async (file) => {
      const originalname = String(file.originalname || '');
      const ext = path.extname(originalname).toLowerCase();
      if (ext !== '.csv') {
        errorCount++;
        errors.push(`SKIP: CSV以外のため無視しました: ${originalname}`);
        safeUnlink(file.path);
        return;
      }

      try {
        const stream = fs.createReadStream(file.path)
          .pipe(csv({
            skipEmptyLines: true,
            mapHeaders: ({ header }) => String(header || '').replace(/^\uFEFF/, '').trim(),
          }));

        for await (const row of stream) {
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
              errors.push(`行スキップ: 必須不足（タイトル/ゲームタイトル/本文）: ${originalname}`);
              continue;
            }

            const tagsArray = normalizedRow.tags
              ? String(normalizedRow.tags).split(',').map(tag => tag.trim()).filter(tag => tag)
              : [];

            const releaseDate = normalizedRow.releaseDate ? parseDateLoose(normalizedRow.releaseDate) : null;

            await Article.create({
              title: normalizedRow.title,
              gameTitle: normalizedRow.gameTitle,
              description: normalizedRow.description || '',
              content: normalizedRow.content, // Markdownのまま保存
              genre: normalizedRow.genre || 'アドベンチャー',
              rating: parseInt(normalizedRow.rating) || 3,
              imageUrl: normalizedRow.imageUrl || '',
              status: normalizedRow.status || 'draft',
              releaseDate,
              tags: tagsArray,
              affiliateLink: normalizeAffiliateLink(normalizedRow.affiliateLink || '', { aid: DEFAULT_AID }) || '',
              author: req.user.id
            });

            importCount++;
          } catch (itemError) {
            errorCount++;
            const title = row && (row.title || row['タイトル']) ? String(row.title || row['タイトル']) : '（不明）';
            errors.push(`エラー: ${originalname} / ${title} - ${itemError.message}`);
          }
        }
      } catch (e) {
        errorCount++;
        errors.push(`CSV読み込みエラー: ${originalname} - ${e.message || e}`);
      } finally {
        safeUnlink(file.path);
      }
    };

    for (const { f } of decorated) {
      // ファイル名昇順で順に取り込み（品質優先のため直列）
      await importOneCsv(f);
    }

    res.json({
      success: true,
      importCount,
      errorCount,
      errors: errors.slice(0, 10)
    });
  } catch (error) {
    console.error('インポートエラー:', error);
    res.status(500).json({ error: 'インポートに失敗しました' });
  }
});

module.exports = router;
