#!/usr/bin/env node
/**
 * Split the combined Stage 4/5 fixture pool into per-rate, per-class band files
 * so each k6 process only parses the small slice it needs (avoids the OOM that
 * combined-file parsing caused on the cognitive sweep).
 *
 * Input:  final-submit-fixtures.json (groups formNormal/formLarge)
 * Output: e4s-form-<cls>-<rate>s-r1.json = { <group>: [ slice ], ... }
 * Each run consumes warmupCap(75) + rate*30 fresh, disjoint fixtures.
 */
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';

const SRC = process.env.FIX_SRC || '/workspace/eduk12-pr49-cloud-results/e4s/final-submit-fixtures.json';
const OUTDIR = process.env.FIX_OUT || '/workspace/eduk12-pr49-cloud-results/e4s/bands';
const RATES = (process.env.E4_RATES || '25 40 55 70 85 100 115').split(' ').map(Number);
const warmupCap = 75; // ceil(5/s * 10s * 1.5)

const data = JSON.parse(readFileSync(SRC, 'utf8'));
mkdirSync(OUTDIR, { recursive: true });

const classes = ['formNormal', 'formLarge'];
let ok = true;
for (const cls of classes) {
  const group = data[cls];
  if (!Array.isArray(group) || group.length === 0) { console.error(`WARN: group ${cls} empty`); continue; }
  let offset = 0;
  let consumed = 0;
  let remaining = group.length;
  for (const rate of RATES) {
    const take = warmupCap + rate * 30;
    if (offset + take > group.length) {
      console.error(`ABORT ${cls} rate=${rate}: pool exhausted offset=${offset} need=${offset + take} pool=${group.length}`);
      ok = false; continue;
    }
    const slice = group.slice(offset, offset + take);
    const outPath = join(OUTDIR, `e4s-form-${cls}-${rate}s-r1.json`);
    writeFileSync(outPath, JSON.stringify({ [cls]: slice }));
    offset += take; consumed += take; remaining = group.length - offset;
    console.log(`${cls} rate=${rate} wrote ${slice.length} fixtures -> ${outPath} (remaining=${remaining})`);
  }
  console.log(`${cls}: consumed=${consumed}/${group.length} left=${remaining}`);
}
console.log(ok ? 'SPLIT_OK' : 'SPLIT_HAD_ERRORS');