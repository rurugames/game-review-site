require('dotenv').config();
const mongoose = require('mongoose');
const AdTag = require('../models/AdTag');

async function main() {
    try {
        await mongoose.connect(process.env.MONGODB_URI);
        console.log('MongoDB connected.');

        const adCode = `<!-- admax -->\n<script src="https://adm.shinobi.jp/s/a375258e0b8bf88ef4360abfb4e8f886"></script>\n<!-- admax -->`;

        const result = await AdTag.findOneAndUpdate(
            { keyword: 'default' },
            { 
                adHtml: adCode,
                isActive: true 
            },
            { upsert: true, new: true }
        );

        console.log('✅ デフォルトの広告枠（忍者AdMax）をDBに登録しました！');
    } catch (err) {
        console.error('❌ エラーが発生しました:', err);
    } finally {
        mongoose.disconnect();
    }
}

main();