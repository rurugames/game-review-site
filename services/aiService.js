const OpenAI = require('openai');

class AIService {
  constructor() {
    // OpenAI APIキーは環境変数から取得
    this.openai = process.env.OPENAI_API_KEY ? new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    }) : null;
  }

  formatPrice(price) {
    if (price === null || price === undefined) return '-';
    const n = typeof price === 'number' ? price : Number(price);
    if (!Number.isFinite(n)) return '-';
    return `${n}円`;
  }

  /**
   * ゲーム情報から記事を自動生成
   * @param {Object} game - ゲーム情報
   * @returns {Object} 生成された記事内容
   */
  async generateArticle(game) {
    try {
      if (!this.openai) {
        // APIキーが設定されていない場合はサンプル記事を返す
        return this.generateSampleArticle(game);
      }

      const prompt = this.createPrompt(game);
      
      const completion = await this.openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
          {
            role: "system",
            content: "あなたはR18 PC同人ゲームの専門レビュアー兼攻略ライターです。プレイヤーに役立つ詳細な攻略情報と魅力的なレビューを執筆します。"
          },
          {
            role: "user",
            content: prompt
          }
        ],
        temperature: 0.7,
        max_tokens: 2000
      });

      const generatedText = completion.choices[0].message.content;
      
      return this.parseGeneratedContent(generatedText, game);
    } catch (error) {
      console.error('AI記事生成エラー:', error);
      return this.generateSampleArticle(game);
    }
  }

  /**
   * プロンプトを作成
   * @param {Object} game 
   * @returns {string}
   */
  createPrompt(game) {
    return `
以下のR18 PC同人ゲームについて、攻略・レビュー記事を作成してください。

【ゲーム情報】
タイトル: ${game.title}
サークル: ${game.circle}
ジャンル: ${game.genre}
発売日: ${game.releaseDate}
価格: ${this.formatPrice(game.price)}

【記事の構成】
1. 記事タイトル（魅力的で検索されやすいもの）
2. 概要（200文字程度）
3. 本文（以下の内容を含む）
   - ゲームの特徴と魅力
   - ストーリー概要
   - ゲームシステムの説明
   - 攻略のポイント
   - おすすめプレイヤー層
   - 総合評価とまとめ

【出力形式】
---TITLE---
記事タイトル
---DESCRIPTION---
概要文
---CONTENT---
本文（マークダウン形式）
---RATING---
評価点数（5点満点で小数点1桁、例: 4.5）
`;
  }

  /**
   * 生成されたコンテンツを解析
   * @param {string} text 
   * @param {Object} game 
   * @returns {Object}
   */
  parseGeneratedContent(text, game) {
    const titleMatch = text.match(/---TITLE---\s*(.*?)\s*---/s);
    const descriptionMatch = text.match(/---DESCRIPTION---\s*(.*?)\s*---/s);
    const contentMatch = text.match(/---CONTENT---\s*(.*?)\s*(?:---RATING---|$)/s);
    const ratingMatch = text.match(/---RATING---\s*([\d.]+)/);

    return {
      title: titleMatch ? titleMatch[1].trim() : `【攻略・レビュー】${game.title}`,
      description: descriptionMatch ? descriptionMatch[1].trim() : game.description,
      content: contentMatch ? contentMatch[1].trim() : this.generateDefaultContent(game),
      rating: ratingMatch ? parseFloat(ratingMatch[1]) : 4.0
    };
  }

  /**
   * サンプル記事を生成（APIキー未設定時）
   * @param {Object} game 
   * @returns {Object}
   */
  generateSampleArticle(game) {
    return {
      title: `【攻略・レビュー】${game.title} - 完全攻略ガイド`,
      description: `${game.releaseDate}にリリースされた${game.circle}の新作${game.genre}ゲーム「${game.title}」の詳細レビューと攻略情報をお届けします。`,
      content: this.generateDefaultContent(game),
      rating: 4.0
    };
  }

  /**
   * デフォルトコンテンツを生成
   * @param {Object} game 
   * @returns {string}
   */
  generateDefaultContent(game) {
    return `
## ゲーム概要

**${game.title}**は、${game.circle}が${game.releaseDate}にリリースした${game.genre}ジャンルのR18 PC同人ゲームです。

### 基本情報

- **タイトル**: ${game.title}
- **サークル**: ${game.circle}
- **ジャンル**: ${game.genre}
- **発売日**: ${game.releaseDate}
- **価格**: ${this.formatPrice(game.price)}

## ゲームの特徴

このゲームは${game.genre}ジャンルの特徴を活かした独自のゲームシステムを採用しています。

### 主な魅力ポイント

1. **魅力的なキャラクター**: 個性豊かなキャラクターが登場
2. **やりこみ要素**: 充実したコンテンツボリューム
3. **操作性**: 直感的で分かりやすいUI

## 攻略のポイント

### 序盤攻略

ゲーム開始時は、まず基本的なシステムに慣れることが重要です。

### 中盤攻略

中盤以降は、効率的な進め方を意識しましょう。

### 終盤攻略

終盤では、これまで培ったテクニックを活用します。

## 総合評価

**${game.title}**は、${game.genre}ジャンルのファンにおすすめできる作品です。

### おすすめプレイヤー

- ${game.genre}ジャンルが好きな方
- ${game.circle}の作品が好きな方
- やりこみ要素を求める方

## まとめ

魅力的な要素が詰まった本作品を、ぜひプレイしてみてください。
`;
  }
}

module.exports = new AIService();
