const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const GalleryImage = require('../models/GalleryImage');
require('dotenv').config();

const UPLOADS_DIR = path.join(__dirname, '../uploads/gallery');

// フォルダが存在しない場合は作成
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}

// 接続情報チェック
if (!process.env.R2_ACCOUNT_ID) {
  console.error('[Error] R2_ACCOUNT_ID が .env に設定されていません。');
  process.exit(1);
}

// R2クライアント設定
const s3Client = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  forcePathStyle: true, // <--- これが必須（R2のSSLエラーを防ぐため）
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  }
});

const uploadImageToR2 = async (filePath, fileName) => {
  const fileContent = fs.readFileSync(filePath);
  const ext = path.extname(fileName).toLowerCase();
  
  // mimeタイプの簡易判定
  let contentType = 'application/octet-stream';
  if (ext === '.png') contentType = 'image/png';
  if (ext === '.jpg' || ext === '.jpeg') contentType = 'image/jpeg';
  if (ext === '.gif') contentType = 'image/gif';
  if (ext === '.webp') contentType = 'image/webp';

  const r2Key = `gallery/${Date.now()}-${encodeURIComponent(fileName)}`;
  
  const uploadParams = {
    Bucket: process.env.R2_BUCKET_NAME || 'mytool-gallery',
    Key: r2Key,
    Body: fileContent,
    ContentType: contentType,
  };

  await s3Client.send(new PutObjectCommand(uploadParams));

  // 公開URLの構築 (R2_PUBLIC_DOMAIN はカスタムドメイン or R2.dev URL)
  let publicUrl = '';
  if (process.env.R2_PUBLIC_DOMAIN) {
    const domain = process.env.R2_PUBLIC_DOMAIN.replace(/\/$/, "");
    publicUrl = `${domain}/${r2Key}`;
  } else {
    // PUBLIC DOMAINがない場合はとりあえず、API側のURLやプレースホルダー
    // 現実的にはR2側のカスタムドメイン設定次第なので、プロンプトで案内が必要。
    publicUrl = `https://<R2_PUBLIC_DOMAIN_NOT_SET>/${r2Key}`;
    console.warn(`[Warning] R2_PUBLIC_DOMAIN が未設定のため、URLが不完全です: ${publicUrl}`);
  }

  return { r2Key, publicUrl };
};

const processUploads = async () => {
  try {
    const files = fs.readdirSync(UPLOADS_DIR);
    
    // 画像らしきファイルだけ選別
    const imageFiles = files.filter(f => /.*\.(jpg|jpeg|png|gif|webp)$/i.test(f));
    
    if (imageFiles.length === 0) {
      console.log('アップロード待ちの画像ファイルがありません。');
      return;
    }

    console.log(`${imageFiles.length} 件の画像を R2 にアップロードします...`);

    // MongoDB 接続
    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });
    console.log('MongoDB: Connected');

    for (const file of imageFiles) {
      const filePath = path.join(UPLOADS_DIR, file);
      console.log(`[Upload] -> ${file} を処理中...`);
      
      try {
        // アップロード
        const { r2Key, publicUrl } = await uploadImageToR2(filePath, file);
        
        // title は拡張子を除いたファイル名をデフォルトとする
        const title = path.basename(file, path.extname(file));

        // DB登録
        const imageDoc = new GalleryImage({
          title: title,
          r2Url: publicUrl,
          r2Key: r2Key,
          description: '',
          tags: ['gallery']
        });
        
        await imageDoc.save();
        console.log(`[Success] -> ${file} の R2 アップロード & DB 登録完了: ${publicUrl}`);
        
        // 成功したらローカルのファイルを削除
        fs.unlinkSync(filePath);
        console.log(`[Clean] -> ローカルファイルを削除しました: ${file}`);
        
      } catch (err) {
        console.error(`[Error] -> ${file} の処理に失敗しました:`, err);
      }
    }

    console.log('すべてのアップロード処理が完了しました。');

  } catch (error) {
    console.error('処理スクリプト全体でエラーが発生しました:', error);
  } finally {
    // mongoose 切断
    if (mongoose.connection.readyState !== 0) {
      await mongoose.disconnect();
      console.log('MongoDB: Disconnected');
    }
  }
};

processUploads();
