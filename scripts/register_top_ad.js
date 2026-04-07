require('dotenv').config();
const mongoose = require('mongoose');
const AdTag = require('../models/AdTag');

async function main() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected.');

        const adCode = `<!-- admax -->\n<script src="https://adm.shinobi.jp/s/7348e803afafe18515a14b0735c50729"></script>\n<!-- admax -->`;

        const result = await AdTag.findOneAndUpdate(
            { keyword: 'top_page' },
            { 
                adHtml: adCode,
                isActive: true 
            },
            { upsert: true, new: true }
        );

        console.log('✅ トップページ専用の広告枠をDBに登録しました！');
    } catch (err) {
        console.error('❌ エラーが発生しました:', err);
    } finally {
        mongoose.disconnect();
    }
}

main();