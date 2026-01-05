const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();

const Comment = require('../models/Comment');
const User = require('../models/User');
const { ensureAuth } = require('../middleware/auth');
const { isAdminEmail } = require('../lib/admin');

function canViewUserPage(req, userId) {
  try {
    if (!req.user) return false;
    if (String(req.user.id) === String(userId)) return true;
    return !!(req.user && isAdminEmail(req.user.email));
  } catch (_) {
    return false;
  }
}

// /users/me -> /users/:id
router.get('/me', ensureAuth, (req, res) => {
  res.redirect(`/users/${req.user.id}`);
});

// ユーザーページ（ログイン必須。自分 or 管理者のみ）
router.get('/:id', ensureAuth, async (req, res) => {
  try {
    const userId = String(req.params.id || '').trim();
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).send('ユーザーIDが不正です');
    }
    if (!canViewUserPage(req, userId)) {
      return res.status(403).send('アクセス権限がありません');
    }

    const profileUser = await User.findById(userId).lean();
    if (!profileUser) {
      return res.status(404).send('ユーザーが見つかりません');
    }

    const uid = new mongoose.Types.ObjectId(userId);

    // 自分の「親コメント」一覧（記事ごとのコメント起点）
    const myParentComments = await Comment.find({ author: uid, parent: null })
      .sort({ createdAt: -1, _id: -1 })
      .populate('article', 'title gameTitle')
      .lean();

    const parentIds = (myParentComments || []).map((c) => c._id).filter(Boolean);

    // 自分の親コメントへの返信（＝通知対象）
    let replies = [];
    if (parentIds.length) {
      replies = await Comment.find({ parent: { $in: parentIds } })
        .sort({ createdAt: 1, _id: 1 })
        .populate('author', 'displayName email image')
        .lean();
    }

    const repliesByParent = new Map();
    let unreadRepliesCount = 0;
    (replies || []).forEach((r) => {
      const pid = r && r.parent ? String(r.parent) : '';
      if (!pid) return;
      const arr = repliesByParent.get(pid) || [];
      const isSelfReply = r && r.author && (String(r.author._id || r.author) === String(uid));
      const isUnread = !isSelfReply && !r.seenByParentAuthorAt;
      if (isUnread) unreadRepliesCount += 1;
      arr.push({ ...r, _isUnread: isUnread });
      repliesByParent.set(pid, arr);
    });

    const commentThreads = (myParentComments || []).map((c) => {
      const id = c && c._id ? String(c._id) : '';
      const threadReplies = repliesByParent.get(id) || [];
      const hasUnread = threadReplies.some((r) => r && r._isUnread);
      return { ...c, replies: threadReplies, _hasUnread: hasUnread };
    });

    // 既読化: 自分のページ閲覧時のみ、未読返信を既読化（表示は「既読化前」の状態で出す）
    if (String(req.user.id) === String(userId) && parentIds.length) {
      setImmediate(async () => {
        try {
          await Comment.updateMany(
            { parent: { $in: parentIds }, author: { $ne: uid }, seenByParentAuthorAt: null },
            { $set: { seenByParentAuthorAt: new Date() } }
          );
        } catch (_) {}
      });
    }

    res.render('users/show', {
      title: 'マイページ',
      profileUser,
      commentThreads,
      unreadRepliesCount,
    });
  } catch (err) {
    console.error(err);
    res.status(500).send('サーバーエラー');
  }
});

module.exports = router;
