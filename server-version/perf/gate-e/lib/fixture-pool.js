export function requireFixturePool(poolSize, peak) {
  const pool = Number(poolSize);
  const target = Number(peak);
  if (!Number.isSafeInteger(pool) || !Number.isSafeInteger(target) || pool < 0 || target < 1 || pool < target) {
    throw new Error(`fixture pool exhausted: pool=${poolSize} peak=${peak}`);
  }
  return { poolSize: pool, peak: target };
}

export function fixtureIndexForVu(vu) {
  const index = Number(vu) - 1;
  if (!Number.isSafeInteger(index) || index < 0) throw new Error(`invalid VU index: ${vu}`);
  return index;
}
