require('dotenv').config();

const mongoose = require('mongoose');
const DailyOutboundClick = require('../models/DailyOutboundClick');

function parseArgs(argv) {
  const out = {
    days: 7,
    limit: 20,
    section: 'all',
  };

  for (const a of argv.slice(2)) {
    if (a === '--help' || a === '-h') out.help = true;
    else if (a.startsWith('--days=')) out.days = Number(a.split('=')[1]);
    else if (a.startsWith('--limit=')) out.limit = Number(a.split('=')[1]);
    else if (a.startsWith('--section=')) out.section = String(a.split('=')[1] || '').trim() || 'all';
  }
  return out;
}

function getJstDateKey(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat('ja-JP', {
      timeZone: 'Asia/Tokyo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    }).formatToParts(now);
    const y = parts.find((p) => p.type === 'year')?.value;
    const m = parts.find((p) => p.type === 'month')?.value;
    const d = parts.find((p) => p.type === 'day')?.value;
    if (y && m && d) return `${y}-${m}-${d}`;
  } catch (_) {}
  return new Date(now).toISOString().slice(0, 10);
}

function addJstDays(dateKey, deltaDays) {
  // dateKey: YYYY-MM-DD in JST; treat as JST midnight
  const [y, m, d] = String(dateKey).split('-').map((v) => Number(v));
  if (!y || !m || !d) return dateKey;
  // Create UTC time representing JST midnight
  const utc = Date.UTC(y, m - 1, d, -9, 0, 0);
  const dt = new Date(utc + deltaDays * 24 * 60 * 60 * 1000);
  return getJstDateKey(dt);
}

function buildDateKeys(days) {
  const n = Math.max(1, Math.min(365, Number(days) || 7));
  const today = getJstDateKey();
  const keys = [];
  for (let i = 0; i < n; i++) {
    keys.push(addJstDays(today, -i));
  }
  return keys;
}

function printHelp() {
  console.log('Usage: node scripts/print_fc2_clicks.js [--days=7] [--limit=20] [--section=all|latest|popular]');
  console.log('Env: MONGODB_URI is required');
}

async function main() {
  const args = parseArgs(process.argv);
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  const uri = String(process.env.MONGODB_URI || '').trim();
  if (!uri) {
    printHelp();
    console.error('\nERROR: MONGODB_URI is not set');
    process.exit(1);
  }

  const days = Math.max(1, Math.min(365, Number(args.days) || 7));
  const limit = Math.max(1, Math.min(200, Number(args.limit) || 20));
  const section = String(args.section || 'all').toLowerCase();
  const dateKeys = buildDateKeys(days);

  await mongoose.connect(uri);

  const match = {
    kind: 'fc2',
    date: { $in: dateKeys },
  };
  if (section !== 'all') match.section = section;

  const rows = await DailyOutboundClick.aggregate([
    { $match: match },
    {
      $addFields: {
        groupKey: {
          $cond: [
            { $gt: [{ $strLenCP: { $ifNull: ['$videoId', ''] } }, 0] },
            '$videoId',
            '$url',
          ],
        },
      },
    },
    {
      $group: {
        _id: { section: '$section', key: '$groupKey', pos: '$pos' },
        count: { $sum: '$count' },
        lastTs: { $max: '$lastTs' },
        anyUrl: { $first: '$url' },
      },
    },
    { $sort: { count: -1 } },
    { $limit: limit },
  ]);

  const rangeLabel = `${dateKeys[dateKeys.length - 1]} .. ${dateKeys[0]} (JST)`;
  console.log(`FC2 outbound clicks top ${limit} | days=${days} | section=${section} | range=${rangeLabel}`);
  console.log('');

  if (!rows || rows.length === 0) {
    console.log('No data');
    return;
  }

  const pad = (s, n) => {
    const t = String(s);
    return t.length >= n ? t : t + ' '.repeat(n - t.length);
  };

  for (const r of rows) {
    const sec = r && r._id ? r._id.section : '';
    const key = r && r._id ? r._id.key : '';
    const pos = r && r._id ? r._id.pos : 0;
    const c = r && typeof r.count === 'number' ? r.count : 0;
    const last = r && r.lastTs ? new Date(r.lastTs).toISOString() : '';
    const posLabel = pos ? `#${pos}` : '';
    const url = r && r.anyUrl ? r.anyUrl : '';
    console.log(`${pad(sec, 7)}  ${pad(posLabel, 4)}  ${pad(c, 6)}  ${last}  ${key}  ${url}`);
  }
}

main()
  .then(() => mongoose.disconnect().catch(() => {}))
  .catch(async (e) => {
    console.error(e && e.stack ? e.stack : e);
    try { await mongoose.disconnect(); } catch (_) {}
    process.exit(1);
  });
