const mongoose = require('mongoose');
const GalleryImage = require('../models/GalleryImage');
require('dotenv').config();

const fileName = '00035-2398744998.png';
const publicUrl = process.env.R2_PUBLIC_DOMAIN.replace(/\/\$/, '') + '/' + fileName;

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  try {
    const doc = new GalleryImage({
      title: '手動アップロードテスト',
      r2Url: publicUrl,
      r2Key: fileName,
      description: 'Cloudflare画面からの直接アップロードテストです',
      tags: ['テスト']
    });
    await doc.save();
    console.log('DB登録成功！このURLで直接画像にアクセスできます: ' + publicUrl);
  } catch (err) {
    if(err.code === 11000) {
      console.log('既に登録済みです: ' + publicUrl);
    } else {
      console.error('DB登録エラー:', err);
    }
  } finally {
    mongoose.disconnect();
  }
});
