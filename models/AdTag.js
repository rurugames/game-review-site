const mongoose = require('mongoose');

const adTagSchema = new mongoose.Schema({
  keyword: { 
    type: String, 
    required: true,
    unique: true,
    description: "マッチさせるタグ名（例: '女神のカフェテラス'や'default'）"
  },
  adHtml: { 
    type: String, 
    required: true,
    description: "ASPから取得した広告のHTML（scriptタグなど含む）"
  },
  isActive: { 
    type: Boolean, 
    default: true 
  }
}, { timestamps: true });

module.exports = mongoose.model('AdTag', adTagSchema);
