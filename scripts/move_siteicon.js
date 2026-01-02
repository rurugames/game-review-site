const fs = require('fs');
const path = require('path');

const workspaceRoot = path.resolve(__dirname, '..');
const src = path.join(workspaceRoot, 'siteicon.png');
const destDir = path.join(workspaceRoot, 'public', 'images');
const dest = path.join(destDir, 'siteicon.png');

(async () => {
  try {
    await fs.promises.access(src);
  } catch (err) {
    console.error('Source file not found:', src);
    console.error('Please place siteicon.png in the project root (mytool) before running this script.');
    process.exit(1);
  }

  try {
    await fs.promises.mkdir(destDir, { recursive: true });
    await fs.promises.copyFile(src, dest);
    console.log('Copied siteicon.png to', dest);
    console.log('If you want, you can remove the original file at', src);
  } catch (err) {
    console.error('Failed to copy file:', err);
    process.exit(1);
  }
})();
