const axios = require('axios');
const cheerio = require('cheerio');

const ids = ['RJ01538912', 'RJ01538655', 'RJ01538601', 'RJ01538533', 'RJ01535889'];

async function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

(async () => {
  for (const id of ids) {
    try {
      const url = `https://www.dlsite.com/maniax/work/=/product_id/${id}.html`;
      const response = await axios.get(url, {
        headers: {
          'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        },
        timeout: 10000
      });
      const $ = cheerio.load(response.data);
      const dateText = $('th:contains("販売日")').next('td').text().trim();
      console.log(`${id},${dateText}`);
    } catch (e) {
      console.log(`${id},取得失敗: ${e.message}`);
    }
    await delay(1000);
  }
})();
