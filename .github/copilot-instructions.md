# Copilot Workspace Instructions

このワークスペースでは、ギャラリー運用の依頼を**専用エージェント前提で処理しない**。

- 「ギャラリーに追加して」「ギャラリーを追加して」などの依頼は、通常の Copilot チャットとして扱う
- `.github/agents` にギャラリー専用エージェントが存在しない前提で進める
- [GALLERY_UPLOAD_PROMPT.md](GALLERY_UPLOAD_PROMPT.md) が添付されていても、専用エージェント起動を仮定しない
- 画像確認が必要な場合でも、`view_image` を全件一括で使わず、少数ずつ段階的に確認する
- まず前提確認を行い、必要なら `scripts/upload_gallery.js` `scripts/sync_r2_gallery.js` `scripts/download_r2_gallery.js` を通常の手順で実行する
- `uploads/gallery/` は未処理画像の一時置き場として扱い、反映確認後は `uploads/gallery_archive/YYYY-MM-DD/` へ退避する
- 退避後も `uploads/gallery/` 側のシリーズフォルダは削除せず残す
- [GALLERY_UPLOAD_PROMPT.md](GALLERY_UPLOAD_PROMPT.md) を添付して「ギャラリーを追加して」と依頼された場合は、通常チャットのままアップロード実行から退避までを1回の依頼で続けて行う
- `http://localhost:3000/gallery` の確認に失敗しても、アップロード結果にエラーがなければその旨を報告し、退避まで進めてよい