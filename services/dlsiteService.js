const axios = require('axios');
const cheerio = require('cheerio');
let puppeteer = null;
const mongoose = require('mongoose');
const GameDetailCache = require('../models/GameDetailCache');
const CacheGCLog = require('../models/CacheGCLog');

class DLsiteService {
  constructor() {
    this.baseURL = 'https://www.dlsite.com';
    this.headers = {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8',
      'Accept-Language': 'ja,en-US;q=0.7,en;q=0.3',
    };
    // simple in-memory cache for per-game details to avoid refetching
    this.detailsCache = new Map();
    // make these configurable defaults
    this.concurrentFetchLimit = 8; // default concurrency
    this.detailsCacheTTL = 1 * 60 * 60 * 1000; // 1 hour TTL
  }

  _isMongoConnected() {
    try {
      return Boolean(mongoose?.connection && mongoose.connection.readyState === 1);
    } catch {
      return false;
    }
  }

  /**
   * 指定した年月に発売されたゲーム一覧を取得
   * - デフォルトはDLsite実取得（スクレイピング）
   * - 明示的に許可した場合のみサンプルデータにフォールバック
   *
   * @param {number|string} year
   * @param {number|string} month
    * @param {{ allowSample?: boolean, forceRefreshDetails?: boolean }} [options]
   */
  async fetchGamesByMonth(year, month, options = {}) {
    const parsedYear = Number(year);
    const parsedMonth = Number(month);

    if (!Number.isFinite(parsedYear) || !Number.isFinite(parsedMonth)) {
      throw new Error(`Invalid year/month: year=${year}, month=${month}`);
    }
    if (parsedMonth < 1 || parsedMonth > 12) {
      throw new Error(`Invalid month: ${month}`);
    }

    const allowSample = Boolean(options.allowSample) || process.env.DLSITE_ALLOW_SAMPLE === '1';
    const forceRefreshDetails = Boolean(options.forceRefreshDetails);

    try {
      return await this.fetchFromDLsite(parsedYear, parsedMonth, { forceRefreshDetails });
    } catch (err) {
      if (allowSample) {
        console.warn('fetchGamesByMonth: falling back to sample games because allowSample is enabled');
        return this.generateSampleGames(parsedYear, parsedMonth);
      }
      throw err;
    }
  }
  /**
   * HTTP fetch helper with retries and exponential backoff + jitter
   * @param {string} url
   * @param {object} opts - axios options
   * @param {number} retries
   * @param {number} baseDelay - ms
   */
  async fetchWithRetry(url, opts = {}, retries = 3, baseDelay = 1000) {
    let attempt = 0;
    while (true) {
      try {
        return await axios.get(url, Object.assign({}, { headers: this.headers, timeout: 15000, maxRedirects: 5 }, opts));
      } catch (err) {
        attempt++;
        if (attempt > retries) throw err;
        // exponential backoff with jitter
        const backoff = baseDelay * Math.pow(2, attempt - 1);
        const jitter = Math.floor(Math.random() * Math.min(1000, backoff));
        const wait = backoff + jitter;
        console.warn(`fetchWithRetry: ${url} failed (attempt ${attempt}), retrying in ${wait}ms`);
        await this.sleep(wait);
      }
    }
  }
  generateSampleGames(year, month) {
    const genres = ['RPG', 'アドベンチャー', 'シミュレーション', 'アクション', 'パズル'];
    const circles = [
      '月夜の魔法使い', 'Eternal Dream', 'PixelHeart', 
      'CrystalSoft', 'MoonLight Games', 'StarDust Studio',
      'DreamFactory', 'SilverWing', 'GoldenLeaf'
    ];
    
    const gameTitles = [
      '魔界の迷宮', '異世界転生RPG', '学園アドベンチャー', 
      '戦国シミュレーション', '探索型ダンジョン', 'サバイバルクエスト',
      '恋愛シミュレーション', '謎解きアドベンチャー', 'タワーディフェンス',
      'ローグライク', 'カードバトル', '育成シミュレーション'
    ];
    
    const games = [];
    // 年月に基づいてシード値を生成（同じ年月なら同じゲームセット）
    const seed = year * 100 + month;
    const seededRandom = (index) => {
      // 簡易的な擬似乱数生成（シード値に基づく）
      const x = Math.sin(seed * 12345 + index * 67890) * 10000;
      return x - Math.floor(x);
    };
    
    const gameCount = Math.floor(seededRandom(0) * 10) + 8; // 8-18個のゲーム
    
    for (let i = 0; i < gameCount; i++) {
      const day = Math.floor(seededRandom(i + 100) * 28) + 1;
      const genreIndex = Math.floor(seededRandom(i + 200) * genres.length);
      const circleIndex = Math.floor(seededRandom(i + 300) * circles.length);
      const titleIndex = Math.floor(seededRandom(i + 400) * gameTitles.length);
      const price = Math.floor(seededRandom(i + 500) * 2000) + 500;
      
      // RJ番号を年月に基づいて生成
      const rjNumber = 1000000 + (seed * 100) + i;
      
      games.push({
        id: `RJ${rjNumber}`,
        title: `${gameTitles[titleIndex]}～${year}年${month}月版～`,
        circle: circles[circleIndex],
        genre: genres[genreIndex],
        releaseDate: `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`,
        price: price,
        imageUrl: `https://via.placeholder.com/300x200?text=${encodeURIComponent(gameTitles[titleIndex])}`,
        description: `${year}年${month}月に${circles[circleIndex]}がリリースした${genres[genreIndex]}ジャンルのR18 PC同人ゲームです。`,
        tags: ['R18', 'PC', '同人ゲーム']
      });
    }
    
    // リリース日の降順でソート
    games.sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
    
    return games;
  }

  /**
   * 実際のDLsiteからゲーム情報を取得（ページネーション対応）
   * @param {number} year 
   * @param {number} month 
   * @param {{ forceRefreshDetails?: boolean }} [options]
   * @returns {Array}
   */
  async fetchFromDLsite(year, month, options = {}) {
    const inMonthGames = [];
    const forceRefreshDetails = Boolean(options.forceRefreshDetails);

    const pad2 = (n) => String(n).padStart(2, '0');
    const lastDay = new Date(year, month, 0).getDate();
    const targetStart = `${year}-${pad2(month)}-01`;
    const targetEnd = `${year}-${pad2(month)}-${pad2(lastDay)}`;

    let page = 1;
    let hasMorePages = true;
    let foundAnyInRange = false;
    let olderStreak = 0;
    const maxOlderStreak = 60; // 月初より古い作品がこれだけ連続したら終了
    const maxPagesHardCap = 200; // 無限ループ防止

    console.log(`📅 対象期間: ${year}年${month}月 (${targetStart} 〜 ${targetEnd})`);

    // DLsiteの新着同人ゲーム一覧URL（work_type_category=gameでゲームのみ、1ページ100件）
    const baseSearchURL = `${this.baseURL}/maniax/fsr/=/work_category%5B0%5D/doujin/order/release_d/work_type_category%5B0%5D/game/options%5B0%5D/JPN/per_page/100`;

    const mapWithConcurrency = async (items, limit, fn) => {
      const results = new Array(items.length);
      let next = 0;
      const worker = async () => {
        while (true) {
          const i = next++;
          if (i >= items.length) return;
          try {
            results[i] = await fn(items[i], i);
          } catch (e) {
            results[i] = null;
          }
        }
      };
      const n = Math.max(1, Math.min(limit, items.length));
      await Promise.all(Array.from({ length: n }, () => worker()));
      return results;
    };

    while (hasMorePages && page <= maxPagesHardCap) {
      const searchURL = `${baseSearchURL}/page/${page}`;

      try {
        console.log(`\n🔍 ページ ${page} を取得中...`);

        // レート制限のため少し待機
        await this.sleep(1500);

        const response = await this.fetchWithRetry(searchURL, { timeout: 15000 }, 3, 1000);
        const $ = cheerio.load(response.data);

        // DLsiteの商品リストセレクター
        const itemSelectors = [
          '.n_worklist_item',
          '.search_result_img_box_inner',
          'li[id^="search_result_"]',
          'ul.n_worklist > li'
        ];

        let items = null;
        for (const selector of itemSelectors) {
          const found = $(selector);
          if (found.length > 0) {
            items = found;
            console.log(`✅ ${items.length} 件のアイテムを発見`);
            break;
          }
        }

        if (!items || items.length === 0) {
          console.log('⚠️ これ以上のページはありません');
          hasMorePages = false;
          break;
        }

        const workIdsInOrder = [];
        items.each((_, element) => {
          try {
            const $item = $(element);
            let workId = null;
            const linkHref = $item.find('a[href*="/work/"]').first().attr('href');
            if (linkHref) {
              const match = linkHref.match(/\/(RJ\d+)/);
              if (match) workId = match[1];
            }
            if (!workId) {
              const idAttr = $item.attr('id');
              if (idAttr) {
                const match = idAttr.match(/(RJ\d+)/);
                if (match) workId = match[1];
              }
            }
            if (workId) workIdsInOrder.push(workId);
          } catch (e) {
            // ignore
          }
        });

        if (workIdsInOrder.length === 0) {
          console.log('⚠️ このページで作品IDが取得できませんでした');
          hasMorePages = false;
          break;
        }

        const detailsList = await mapWithConcurrency(
          workIdsInOrder,
          this.concurrentFetchLimit,
          async (workId) => await this.fetchGameDetails(workId, { forceRefresh: forceRefreshDetails })
        );

        let addedThisPage = 0;
        for (const details of detailsList) {
          if (!details || !details.id || !details.title) continue;

          const rd = details.releaseDate || '';
          if (rd && rd >= targetStart && rd <= targetEnd) {
            inMonthGames.push(details);
            addedThisPage++;
            foundAnyInRange = true;
            olderStreak = 0;
            continue;
          }

          if (rd && rd < targetStart) {
            // release_d の降順を前提に、月初より古い作品が続いたら打ち切る
            if (foundAnyInRange) {
              olderStreak++;
              if (olderStreak >= maxOlderStreak) {
                hasMorePages = false;
                break;
              }
            }
            continue;
          }

          // rd が targetEnd より新しい、または rd 不明: 続行
          if (foundAnyInRange) {
            olderStreak = 0;
          }
        }

        console.log(`📊 このページで ${addedThisPage} 件を対象月として追加（累計: ${inMonthGames.length} 件）`);

        if (!hasMorePages) {
          console.log('✅ 月初より古い作品が続いたため終了');
          break;
        }

        page++;
      } catch (error) {
        console.error(`❌ ページ ${page} の取得エラー:`, error.message);
        hasMorePages = false;
      }
    }

    if (inMonthGames.length > 0) {
      inMonthGames.sort((a, b) => String(b.releaseDate || '').localeCompare(String(a.releaseDate || '')));
      console.log(`\n✅ ${year}年${month}月のゲームを合計 ${inMonthGames.length} 件取得しました`);
    } else {
      console.warn(`\n⚠️ ${year}年${month}月のゲームが見つかりませんでした`);
    }

    return inMonthGames;
  }

  /**
   * 日付文字列をパース
   * @param {string} dateText 
   * @param {number} year 
   * @param {number} month 
   * @returns {string}
   */
  parseDate(dateText, year, month) {
    const hasYearMonth = Number.isFinite(Number(year)) && Number.isFinite(Number(month));
    if (!dateText) {
      return hasYearMonth ? `${year}-${String(month).padStart(2, '0')}-15` : '';
    }
    
    // YYYY/MM/DD または YYYY年MM月DD日 形式を探す
    const match = dateText.match(/(\d{4})[\/年](\d{1,2})[\/月](\d{1,2})/);
    if (match) {
      return `${match[1]}-${String(match[2]).padStart(2, '0')}-${String(match[3]).padStart(2, '0')}`;
    }
    
    // MM/DD形式の場合
    const match2 = dateText.match(/(\d{1,2})[\/月](\d{1,2})/);
    if (match2) {
      if (!Number.isFinite(Number(year))) return '';
      return `${year}-${String(match2[1]).padStart(2, '0')}-${String(match2[2]).padStart(2, '0')}`;
    }
    
    // デフォルト
    return hasYearMonth ? `${year}-${String(month).padStart(2, '0')}-15` : '';
  }

  /**
   * タイトルからジャンルを推測
   * @param {string} title 
   * @returns {string}
   */
  detectGenre(title) {
    const titleLower = title.toLowerCase();
    
    if (titleLower.includes('rpg') || title.includes('ＲＰＧ')) return 'RPG';
    if (titleLower.includes('slg') || title.includes('SLG') || title.includes('シミュレーション')) return 'シミュレーション';
    if (titleLower.includes('adv') || title.includes('ADV') || title.includes('アドベンチャー') || title.includes('ノベル')) return 'アドベンチャー';
    if (titleLower.includes('act') || title.includes('ACT') || title.includes('アクション')) return 'アクション';
    if (title.includes('パズル') || title.includes('puzzle')) return 'パズル';
    if (title.includes('育成')) return 'シミュレーション';
    if (title.includes('脱出') || title.includes('探索')) return 'アドベンチャー';
    
    return 'アドベンチャー'; // デフォルト
  }

  /**
   * テキストをクリーンアップ
   * @param {string} text 
   * @returns {string}
   */
  cleanText(text) {
    if (!text) return '';
    return text.replace(/\s+/g, ' ').trim();
  }

  /**
   * 待機処理
   * @param {number} ms 
   * @returns {Promise}
   */
  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * 実際のDLsite APIまたはスクレイピング実装用のメソッド
   * 注意: DLsiteの利用規約を確認し、適切な方法で実装してください
   */
  async fetchFromDLsiteAPI(year, month) {
    // TODO: 実際のAPI実装
    // DLsite Affiliate APIなどを使用する場合はここに実装
    throw new Error('DLsite API実装が必要です');
  }

  /**
   * ゲーム詳細情報を取得
   * @param {string} gameId - ゲームID (例: RJ123456)
   * @param {{ forceRefresh?: boolean }} [options]
   * @returns {Object} ゲーム詳細情報
   */
  async fetchGameDetails(gameId, options = {}) {
    try {
      const forceRefresh = Boolean(options && options.forceRefresh);

      // check memory cache first
      const cached = !forceRefresh ? this.detailsCache.get(gameId) : null;
      if (cached && (Date.now() - cached.ts) < this.detailsCacheTTL) {
        return cached.details;
      }

      // check persistent cache (MongoDB) only when connected
      if (!forceRefresh && this._isMongoConnected()) {
        try {
          const rec = await GameDetailCache.findOne({ gameId }).lean();
          if (rec && rec.ts && (Date.now() - new Date(rec.ts).getTime() < this.detailsCacheTTL)) {
            // populate memory cache for faster reuse
            this.detailsCache.set(gameId, { ts: Date.now(), details: rec.details });
            return rec.details;
          }
        } catch (e) {
          // DB cache read failed — continue to fetch from DLsite
          console.warn('GameDetailCache read failed:', e && e.message ? e.message : e);
        }
      }

      const url = `${this.baseURL}/maniax/work/=/product_id/${gameId}.html`;
      await this.sleep(800); // レート制限 (politeness)
      const start = Date.now();
      const response = await this.fetchWithRetry(url, { timeout: 10000 }, 3, 800);
      const fetchDur = Date.now() - start;
      
      const $ = cheerio.load(response.data);
      
      // タイトル
      const title = $('#work_name, .work_name, h1[id*="work"]').first().text().trim();
      
      // サークル名
      const circle = $('span[class*="maker"] a, .maker_name a').first().text().trim();
      
      // 説明文
      const description = $('.work_parts_area, .summary, [class*="introduction"]').first().text().trim();
      
      // 画像: data-src / data-original / src / srcset / meta og:image を順に試す
      let imageUrl = '';
      const imgSelectors = ['.slider_item img', '.work_slider img', '#work_left img', '.work_img img', '.work_main img', '.pd_img img'];
      for (const sel of imgSelectors) {
        const img = $(sel).first();
        if (img && img.length) {
          imageUrl = img.attr('data-src') || img.attr('data-original') || img.attr('data-lazy-src') || img.attr('data-lazy') || img.attr('src') || '';
          if (imageUrl && imageUrl.trim()) break;
          const srcset = img.attr('srcset') || '';
          if (srcset) {
            // srcset の最初の URL を使う
            const first = srcset.split(',')[0].trim().split(' ')[0];
            if (first) {
              imageUrl = first;
              break;
            }
          }
        }
      }

      // meta og:image を確認
      if (!imageUrl) {
        const og = $('meta[property="og:image"]').attr('content') || $('meta[name="og:image"]').attr('content') || '';
        if (og) imageUrl = og;
      }

      // link rel=image_src を確認
      if (!imageUrl) {
        const linkImg = $('link[rel="image_src"]').attr('href') || '';
        if (linkImg) imageUrl = linkImg;
      }

      imageUrl = imageUrl || '';
      imageUrl = imageUrl.trim();
      if (imageUrl && imageUrl.startsWith('//')) {
        imageUrl = 'https:' + imageUrl;
      }
      
      // 価格（Vue描画の場合は data-price がHTMLに含まれるため最優先で取得）
      /** @type {number|null} */
      let price = null;
      let priceText = '';

      // 0) data-price / data-official_price（GA4用hidden divなど）
      const gaNode = $(`.ga4_event_item_${gameId}[data-price], .ga4_event_item_${gameId}[data-official_price], [data-product_id='${gameId}'][data-price], [data-product_id='${gameId}'][data-official_price]`).first();
      if (gaNode && gaNode.length) {
        const raw = (gaNode.attr('data-price') || gaNode.attr('data-official_price') || '').trim();
        if (raw) {
          const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
          if (Number.isFinite(n)) price = n;
        }
      }

      // 0-b) Vue componentのdata属性にpriceが入るケース
      if (price === null) {
        const compNode = $(`template[data-vue-component='product-price'][data-product-id='${gameId}'], [data-vue-component='product-price'][data-product-id='${gameId}']`).first();
        if (compNode && compNode.length) {
          const raw = (compNode.attr('data-price') || compNode.attr('data-official_price') || '').trim();
          if (raw) {
            const n = parseInt(raw.replace(/[^0-9]/g, ''), 10);
            if (Number.isFinite(n)) price = n;
          }
        }
      }

      // 1) 情報テーブルの th/td から取得（最優先）
      const priceThLabels = [
        'サークル設定価格',
        '価格',
        '販売価格',
        '通常価格'
      ];
      if (price === null) {
        for (const label of priceThLabels) {
          const t = $(`th:contains(\"${label}\")`).first().next('td').text().trim();
          if (t) {
            priceText = t;
            break;
          }
        }
      }

      // 2) 汎用セレクタでフォールバック
      if (price === null && !priceText) {
        const priceSelectors = [
          '.work_price',
          '.price',
          'dd:contains("価格")',
          'span.price',
          '.work_info .price',
          '[itemprop="price"]'
        ];
        for (const sel of priceSelectors) {
          const t = $(sel).first().text();
          if (t && t.trim().length > 0) {
            priceText = t.trim();
            break;
          }
        }
      }

      // 3) テキストから数値を抽出（取得できない場合は null のまま）
      if (price === null && priceText) {
        const normalized = String(priceText).replace(/\s+/g, ' ').trim();
        if (normalized.includes('無料')) {
          price = 0;
        } else {
          const cleaned = normalized.replace(/[^0-9,]/g, '').replace(/,/g, '');
          const m = cleaned.match(/(\d+)/);
          if (m) {
            price = parseInt(m[1], 10);
            if (!Number.isFinite(price)) price = null;
          }
        }
      }
      
      // 発売日
      const releaseDateText = $('th:contains("販売日"), th:contains("配信開始日")').next('td').text().trim();
      const releaseDate = this.parseDate(releaseDateText);
      
      // ジャンル
      const genreText = $('th:contains("ジャンル")').next('td').text().trim();
      const genre = genreText || this.detectGenre(title);
      
      const detailsObj = {
        id: gameId,
        title: this.cleanText(title),
        circle: this.cleanText(circle),
        description: this.cleanText(description).substring(0, 500),
        imageUrl: imageUrl,
        price: price,
        releaseDate: releaseDate,
        genre: genre,
        dlsiteUrl: url,
        tags: ['R18', 'PC', '同人ゲーム']
      };

      // cache in-memory and persist to MongoDB (best-effort)
      try {
        this.detailsCache.set(gameId, { ts: Date.now(), details: detailsObj });
      } catch (e) {}
      if (this._isMongoConnected()) {
        try {
          await GameDetailCache.updateOne({ gameId }, { $set: { details: detailsObj, ts: new Date() } }, { upsert: true });
        } catch (e) {
          console.warn('GameDetailCache write failed:', e && e.message ? e.message : e);
        }
      }

      console.log(`fetchGameDetails ${gameId} took ${fetchDur}ms`);
      return detailsObj;
    } catch (error) {
      console.error('ゲーム詳細取得エラー:', error);
      throw error;
    }
  }

  // store details in cache
  _cacheDetails(gameId, details) {
    try {
      this.detailsCache.set(gameId, { ts: Date.now(), details });
    } catch (e) {
      // ignore cache errors
    }
  }

  /**
   * DLsite人気ランキングTop10を取得
   */
  async fetchPopularRanking(maxItems = 10, onProgress = null) {
    try {
      const url = 'https://www.dlsite.com/maniax/works/type/=/work_type_category/game/order/trend';
      console.log('DLsite人気ランキング取得中:', url);

      // 直接ページHTMLを取得（fetchFromDLsite は年月ベースの別処理のため使用しない）
      let html = '';
      try {
        const resp = await this.fetchWithRetry(url, { timeout: 15000 }, 3, 1000);
        html = resp.data || '';
      } catch (fetchErr) {
        console.warn('ランキングページの取得に失敗しました（静的取得）:', fetchErr.message || fetchErr);
        html = '';
      }
      const $ = cheerio.load(html);

      // まずRJコードのみ収集（最大10件）
      const rjList = [];
      const seen = new Set();
      const links = $('a[href*="/product_id/"]');
      console.log('DLsite: product links found:', links.length);

      links.each((i, linkElem) => {
        if (rjList.length >= maxItems) return;
        try {
          const $link = $(linkElem);
          const linkHref = $link.attr('href') || '';
          const rjMatch = linkHref.match(/\/product_id\/(RJ\d+)(?:\.html)?/);
          if (!rjMatch) return;
          const rjCode = rjMatch[1];
          if (seen.has(rjCode)) return;
          seen.add(rjCode);
          rjList.push(rjCode);
        } catch (err) {
          // ignore
        }
      });

      // フォールバック: dl 要素から直接取得
      if (rjList.length === 0) {
        console.log('DLsite: product links not found, trying dl.work_img_main fallback');
        const fallbacks = $('dl.work_img_main');
        fallbacks.each((idx, element) => {
          if (rjList.length >= maxItems) return;
          try {
            const $item = $(element);
            const linkHref = $item.find('a[href*="/product_id/"]').attr('href') || '';
            const rjMatch = linkHref.match(/\/product_id\/(RJ\d+)(?:\.html)?/);
            const rjCode = rjMatch ? rjMatch[1] : null;
            if (rjCode && !seen.has(rjCode)) {
              seen.add(rjCode);
              rjList.push(rjCode);
            }
          } catch (fbErr) {
            // ignore
          }
        });
      }

      // フォールバック: puppeteer（JSレンダリング）
      if (rjList.length === 0) {
        try {
          console.log('ランキングが空のためpuppeteerでレンダリングを試みます...');
          // puppeteer がインストールされていない場合は明示的にエラーを出す
          if (!puppeteer) {
            try {
              puppeteer = require('puppeteer');
            } catch (reqErr) {
              console.error('puppeteer が見つかりません。依存関係をインストールしてください:', reqErr.message || reqErr);
              throw reqErr;
            }
          }
          const browser = await puppeteer.launch({ headless: true, args: ['--no-sandbox', '--disable-setuid-sandbox'] });
          const page = await browser.newPage();
          await page.setUserAgent(this.headers['User-Agent']);
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          html = await page.content();
          await browser.close();
          const $$ = cheerio.load(html);
          const renderedLinks = $$('a[href*="/product_id/"]');
          console.log('puppeteer: product links found:', renderedLinks.length);
          renderedLinks.each((i, linkElem) => {
            if (rjList.length >= maxItems) return;
            try {
              const $link = $$(linkElem);
              const linkHref = $link.attr('href') || '';
              const rjMatch = linkHref.match(/\/product_id\/(RJ\d+)(?:\.html)?/);
              if (!rjMatch) return;
              const rjCode = rjMatch[1];
              if (seen.has(rjCode)) return;
              seen.add(rjCode);
              rjList.push(rjCode);
            } catch (err) {
              // ignore
            }
          });
        } catch (ppErr) {
          console.error('puppeteerによるレンダリング取得失敗:', ppErr.message || ppErr);
        }
      }

      // rjList を元に個別ページから詳細を取得して最終結果を作成
      // 並列取得（concurrency）を採用して速度改善
      const self = this;
      const limit = Math.max(1, Math.min(this.concurrentFetchLimit, Math.min(rjList.length, maxItems)));
      const jobs = rjList.slice(0, maxItems);
      const results = new Array(jobs.length);
      const timings = [];

      let idx = 0;
      const workers = Array.from({ length: limit }, async () => {
        while (true) {
          const i = idx++;
          if (i >= jobs.length) break;
          const rj = jobs[i];
          const t0 = Date.now();
          try {
            const details = await self.fetchGameDetails(rj);
            // results
            results[i] = {
              rank: i + 1,
              rjCode: rj,
              title: details.title || '',
              circle: details.circle || '',
              imageUrl: details.imageUrl || '',
              genre: details.genre || self.detectGenre(details.title || ''),
              price: (typeof details.price === 'number' ? details.price : 0),
              dlsiteUrl: details.dlsiteUrl || `https://www.dlsite.com/maniax/work/=/product_id/${rj}.html`
            };
          } catch (detErr) {
            console.error('詳細取得失敗:', rj, detErr && detErr.message ? detErr.message : detErr);
            results[i] = null;
          }
          const took = Date.now() - t0;
          timings.push(took);
          // progress callback: count non-null results
          try { if (typeof onProgress === 'function') onProgress(results.filter(Boolean).length); } catch (e) {}
          // small polite delay
          await self.sleep(120);
        }
      });

      await Promise.all(workers);
      const games = results.filter(Boolean);
      if (timings.length) {
        const sum = timings.reduce((a,b)=>a+b,0);
        const avg = Math.round(sum / timings.length);
        console.log(`fetchPopularRanking detail fetch timings: count=${timings.length}, avg=${avg}ms`);
      }

      console.log('取得したランキングゲーム数:', games.length);
      games.forEach(g => {
        console.log(`#${g.rank} ${g.rjCode} ${g.title} [${g.genre || 'ジャンル不明'}]`);
      });
      const missingImages = games.filter(g => !g.imageUrl || g.imageUrl.length === 0).length;
      console.log(`ランキング中 画像未取得の件数: ${missingImages} / ${games.length}`);
      return games;
    } catch (error) {
      console.error('DLsite人気ランキング取得エラー:', error);
      throw error;
    }
  }

  // --- Runtime configuration setters/getters ---
  setConcurrency(n) {
    const v = Number(n) || 1;
    this.concurrentFetchLimit = Math.max(1, Math.floor(v));
    console.log(`DLsiteService: concurrentFetchLimit set to ${this.concurrentFetchLimit}`);
    return this.concurrentFetchLimit;
  }

  setDetailsCacheTTL(ms) {
    const v = Number(ms) || 0;
    // store in milliseconds; minimum 1 minute
    this.detailsCacheTTL = Math.max(60 * 1000, Math.floor(v));
    console.log(`DLsiteService: detailsCacheTTL set to ${this.detailsCacheTTL} ms`);
    return this.detailsCacheTTL;
  }

  getDetailsCacheTTL() {
    return this.detailsCacheTTL;
  }

  getSettings() {
    return {
      concurrency: this.concurrentFetchLimit,
      detailsCacheTTL: this.detailsCacheTTL
    };
  }

  // start periodic cache GC that deletes GameDetailCache older than TTL
  startCacheGC(intervalMs = 10 * 60 * 1000) {
    try {
      if (this._gcHandle) return; // already running
      this._gcHandle = setInterval(async () => {
        try {
          const cutoff = new Date(Date.now() - this.detailsCacheTTL);
          const res = await GameDetailCache.deleteMany({ ts: { $lt: cutoff } });
          const deleted = (res && typeof res.deletedCount !== 'undefined') ? res.deletedCount : 0;
          if (deleted > 0) {
            console.log(`CacheGC: deleted ${deleted} GameDetailCache records older than ${cutoff.toISOString()}`);
          }
          try {
            await CacheGCLog.create({ ts: new Date(), deletedCount: deleted });
          } catch (e) {
            console.warn('CacheGC: failed to write GC log', e && e.message ? e.message : e);
          }
        } catch (e) {
          console.warn('CacheGC: error during GC', e && e.message ? e.message : e);
        }
      }, intervalMs);
      // run one immediate pass
      (async () => {
        try {
          const cutoff = new Date(Date.now() - this.detailsCacheTTL);
          const res = await GameDetailCache.deleteMany({ ts: { $lt: cutoff } });
          const deleted = (res && typeof res.deletedCount !== 'undefined') ? res.deletedCount : 0;
          if (deleted > 0) {
            console.log(`CacheGC(initial): deleted ${deleted} GameDetailCache records older than ${cutoff.toISOString()}`);
          }
          try {
            await CacheGCLog.create({ ts: new Date(), deletedCount: deleted });
          } catch (e) {
            console.warn('CacheGC(initial): failed to write GC log', e && e.message ? e.message : e);
          }
        } catch (e) {
          console.warn('CacheGC(initial) error', e && e.message ? e.message : e);
        }
      })();
      console.log('CacheGC: started with interval', intervalMs);
    } catch (e) {
      console.warn('CacheGC: failed to start', e && e.message ? e.message : e);
    }
  }

  stopCacheGC() {
    if (this._gcHandle) {
      clearInterval(this._gcHandle);
      this._gcHandle = null;
      console.log('CacheGC: stopped');
    }
  }

  // Run one GC pass immediately and return deleted count
  async runGCNow() {
    try {
      const cutoff = new Date(Date.now() - this.detailsCacheTTL);
      const res = await GameDetailCache.deleteMany({ ts: { $lt: cutoff } });
      const deleted = (res && typeof res.deletedCount !== 'undefined') ? res.deletedCount : 0;
      try {
        await CacheGCLog.create({ ts: new Date(), deletedCount: deleted });
      } catch (e) {
        console.warn('runGCNow: failed to write GC log', e && e.message ? e.message : e);
      }
      console.log(`runGCNow: deleted ${deleted} records older than ${cutoff.toISOString()}`);
      return { deletedCount: deleted, cutoff: cutoff.toISOString() };
    } catch (e) {
      console.error('runGCNow error', e && e.message ? e.message : e);
      throw e;
    }
  }
}

module.exports = new DLsiteService();
