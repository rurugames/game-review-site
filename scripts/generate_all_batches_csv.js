const path = require('path');

const { generateNextBatch } = require('./generate_next_batch_csv');

function usageAndExit() {
  console.log('Usage: node scripts/generate_all_batches_csv.js <YYYY-MM>');
  console.log('Example: node scripts/generate_all_batches_csv.js 2025-12');
  process.exit(1);
}

async function main() {
  const yearMonth = process.argv[2];
  if (!yearMonth || !/^\d{4}-\d{2}$/.test(yearMonth)) usageAndExit();

  let generated = 0;
  let lastPart = null;

  // safety hard cap
  const maxIterations = 1000;

  for (let i = 0; i < maxIterations; i++) {
    const result = await generateNextBatch(yearMonth);
    if (!result) break;

    generated++;
    lastPart = result.part;

    if (result.validation.bad !== 0 || result.validation.rows !== result.batchIds.length) {
      throw new Error(
        `Validation failed for ${path.basename(result.outPath)}: rows=${result.validation.rows}, bad=${result.validation.bad}`
      );
    }

    // keep logs small
    if (generated === 1 || generated % 10 === 0) {
      console.log(`Generated ${generated} files... (latest part=${result.part})`);
    }
  }

  if (generated === 0) {
    console.log('No remaining games to process.');
    return;
  }

  console.log(`Done. Generated ${generated} CSV files. Last part=${lastPart}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
