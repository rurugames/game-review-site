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
 * OpenAI Vision でキャラ情報を解析する
 * @param {Buffer} imageBuffer
 * @param {string} mimeType  例: 'image/jpeg'
 * @returns {Promise<{type: string, characterName: string|null, seriesName: string|null}>}
 */
async function analyzeImage(imageBuffer, mimeType) {
  if (!process.env.OPENAI_API_KEY) {
    return { type: 'unknown', characterName: null, seriesName: null };
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
              'アニメまたはゲームのキャラクターが描かれているか判断し、',
              '以下のJSON形式のみで返答してください（前後の文章・コードブロック不要）:',
              '{"type":"anime" か "game" か "unknown","characterName":"キャラ名（不明ならnull）","seriesName":"作品名・シリーズ名（不明ならnull）"}',
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
      max_tokens: 150,
    });

    const raw = response.choices[0].message.content
      .trim()
      .replace(/^```json?\s*/i, '')
      .replace(/```\s*$/, '')
      .trim();
    return JSON.parse(raw);
  } catch (err) {
    console.warn(`[AI] 解析失敗: ${err.message}`);
    return { type: 'unknown', characterName: null, seriesName: null };
  }
}

/**
 * 解析結果とカウンタからタイトル・タグを生成する。
 * counters は呼び出し元が管理する { anime: number, game: number } オブジェクト。
 * この関数が適宜インクリメントする。
 *
 * @param {{ type: string, characterName: string|null, seriesName: string|null }} analysis
 * @param {{ anime: number, game: number }} counters
 * @returns {{ title: string, tags: string[] }}
 */
function buildMeta(analysis, counters) {
  const { type, characterName, seriesName } = analysis;

  if (characterName) {
    const tags = [characterName];
    if (seriesName) tags.push(seriesName);
    return { title: characterName, tags };
  }

  if (type === 'game') {
    counters.game += 1;
    return { title: `ゲーム${counters.game}`, tags: ['ゲーム'] };
  }

  // anime または unknown はアニメ扱い
  counters.anime += 1;
  return { title: `アニメ${counters.anime}`, tags: ['アニメ'] };
}

/**
 * DB に既に登録されている「アニメN」「ゲームN」の最大値を調べてカウンタを初期化する。
 * @param {import('mongoose').Model} GalleryImage
 * @returns {Promise<{ anime: number, game: number }>}
 */
async function initCounters(GalleryImage) {
  const docs = await GalleryImage.find(
    { title: { $regex: /^(アニメ|ゲーム)\d+$/ } },
    'title'
  ).lean();

  let anime = 0;
  let game = 0;
  for (const doc of docs) {
    const am = doc.title.match(/^アニメ(\d+)$/);
    const gm = doc.title.match(/^ゲーム(\d+)$/);
    if (am) anime = Math.max(anime, parseInt(am[1], 10));
    if (gm) game = Math.max(game, parseInt(gm[1], 10));
  }
  return { anime, game };
}

/** API レート制限回避用スリープ */
const sleep = ms => new Promise(r => setTimeout(r, ms));

module.exports = { analyzeImage, buildMeta, initCounters, mimeFromExt, sleep };
