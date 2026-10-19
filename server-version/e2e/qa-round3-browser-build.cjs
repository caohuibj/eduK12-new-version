// This synthetic fixture exercises Cognitive UI, matching the official browser job.
// Bare esbuild has no Vite environment injection. Keep every consumed flag explicit.
module.exports = Object.freeze({
  'process.env.NODE_ENV': '"production"',
  'import.meta.env.DEV': 'false',
  'import.meta.env.VITE_COGNITIVE_MODULE_ENABLED': '"true"',
})
