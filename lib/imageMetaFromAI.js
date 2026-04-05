/**
 * OpenAI Vision API を使って画像からアニメ/ゲームキャラ名と作品名を自動判定する。
 * OPENAI_API_KEY が未設定の場合は unknown を返す。
 *
 * 返却される analysis オブジェクト:
 *   { type: 'anime'|'game'|'unknown', characterName: string|null, seriesName: string|null }
 */

const MIME_MAP = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
};

function mimeFromExt(ext) {
  return MIME_MAP[(ext || '').toLowerCase()] || 'image/jpeg';
}

/**
 * OpenAI Vision で判定する。
 * 現在はR18かどうかの判定のみを行う。
 * @param {Buffer} imageBuffer
 * @param {string} mimeType  例: 'image/jpeg'
 * @returns {Promise<{type: string}>}
 */
async function analyzeImage(imageBuffer, mimeType) {
  if (!process.env.OPENAI_API_KEY) {
    return { type: 'normal' };
  }

  const OpenAI = require('openai');
  const client = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  const base64 = imageBuffer.toString('base64');

  try {
    const response = await client.chat.completions.create({
      model: 'gpt-4o',
      messages: [{
        role: 'user',
        content: [
          {
            type: 'text',
            text: [
              'この画像を分析してください。',
              'センシティブな内容（R18等）が含まれているかどうか判断し、',
              '以下のJSON形式のみで返答してください（前後の文章・コードブロック不要）:',
              '{"type":"r18" または "normal"}',
            ].join('\n'),
          },
          {
            type: 'image_url',
            image_url: {
              url: `data:${mimeType};base64,${base64}`,
              detail: 'low',
            },
          },
        ],
      }],
      max_tokens: 100,
    });

    const raw = response.choices[0].message.content
      .trim()
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[AI] 解析失敗: ${err.message}`);
    return { type: 'normal' };
  }
}

/**
 * 解析結果とカウンタからタイトル・タグを生成する。
 *
 * @param {{ type: string }} analysis
 * @param {Object} counters - 各フォルダごとの { normal: number, r18: number } を持つオブジェクト
 * @param {string} folderName
 * @returns {{ title: string, tags: string[] }}
 */
function buildMeta(analysis, counters, folderName) {
  const fName = folderName || 'その他';
  if (!counters[fName]) {
    counters[fName] = { normal: 0, r18: 0 };
  }

  if (analysis.type === 'r18') {
    counters[fName].r18++;
    return { 
      title: `${fName} R18-${counters[fName].r18}`, 
      tags: folderName ? [folderName, 'R18'] : ['R18'] 
    };
  }

  counters[fName].normal++;
  return { 
    title: `${fName} ${counters[fName].normal}`, 
    tags: folderName ? [folderName] : [] 
  };
}

/**
 * DB に既に登録されているタイトルから各フォルダの最大値を調べてカウンタを初期化する。
 * @param {import('mongoose').Model} GalleryImage
 * @returns {Promise<Object>}
 */
async function initCounters(GalleryImage) {
  const docs = await GalleryImage.find({}, 'title').lean();

  const counters = {};
  for (const doc of docs) {
    const title = doc.title;
    const r18Match = title.match(/^(.*?) R18-(\d+)$/);
    if (r18Match) {
      const folderName = r18Match[1];
      const num = parseInt(r18Match[2], 10);
      counters[folderName] = counters[folderName] || { normal: 0, r18: 0 };
      counters[folderName].r18 = Math.max(counters[folderName].r18, num);
      continue;
    }

    const normalMatch = title.match(/^(.*?) (\d+)$/);
    if (normalMatch) {
      const folderName = normalMatch[1];
      const num = parseInt(normalMatch[2], 10);
      counters[folderName] = counters[folderName] || { normal: 0, r18: 0 };
      counters[folderName].normal = Math.max(counters[folderName].normal, num);
    }
  }
  return counters;
}

/** API レート制限回避用スリープ */
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { analyzeImage, buildMeta, initCounters, mimeFromExt, sleep };
