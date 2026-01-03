const express = require('express');
const router = express.Router();

const youtubeApi = require('../services/youtubeDataApiService');

router.get('/', async (req, res) => {
  const youtubeChannelId = process.env.YOUTUBE_CHANNEL_ID || '';
  const youtubeRecommendedPlaylistId = process.env.YOUTUBE_RECOMMENDED_PLAYLIST_ID || '';

  let latestVideos = [];
  let recommendedVideos = [];

  try {
    if (youtubeChannelId) {
      latestVideos = await youtubeApi.fetchLatestVideosByChannel(youtubeChannelId, { limit: 5 });
    }

    if (youtubeRecommendedPlaylistId) {
      // 重複除外があるので少し多めに取得
      recommendedVideos = await youtubeApi.fetchVideosByPlaylist(youtubeRecommendedPlaylistId, { limit: 25 });
    } else {
      // プレイリスト未指定時はチャンネル内の人気順をおすすめとして使う
      recommendedVideos = youtubeChannelId
        ? await youtubeApi.fetchPopularVideosByChannel(youtubeChannelId, { limit: 25 })
        : [];
    }

    // 新着とおすすめの重複を除外
    const latestIds = new Set((latestVideos || []).map((v) => v && v.id).filter(Boolean));
    recommendedVideos = (recommendedVideos || []).filter((v) => v && v.id && !latestIds.has(v.id)).slice(0, 5);
  } catch (e) {
    latestVideos = [];
    recommendedVideos = [];

    try {
      if (e && e.code === 'YOUTUBE_API_KEY_MISSING') {
        console.warn('YouTube disabled: missing YOUTUBE_API_KEY');
      } else {
        console.warn('YouTube API fetch failed:', {
          message: e && e.message ? e.message : String(e),
          code: e && e.code ? e.code : null,
          httpStatus: e && e.httpStatus ? e.httpStatus : null,
          youtubeStatus: e && e.youtubeStatus ? e.youtubeStatus : null,
          youtubeReason: e && e.youtubeReason ? e.youtubeReason : null,
        });
      }
    } catch (_) {}
  }

  res.render('videos/index', {
    title: '動画',
    metaDescription: 'YouTubeの新着動画・おすすめ動画を表示します。',
    latestVideos,
    recommendedVideos,
    youtubeChannelId,
  });
});

module.exports = router;
