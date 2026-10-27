const fs = require('fs'), path = require('path'), { pathToFileURL } = require('url'), crypto = require('crypto')
const root = path.resolve(__dirname, '../../../../../..'), outDir = '/tmp/voice-candidate-preview'
async function main() {
  const { build } = await import(pathToFileURL(path.join(root, 'server-version/frontend/node_modules/vite/dist/node/index.js')).href)
  const { default: react } = await import(pathToFileURL(path.join(root, 'server-version/frontend/node_modules/@vitejs/plugin-react/dist/index.js')).href)
  if (!process.argv.includes('--inventory-existing')) await build({ root: path.join(root, 'server-version/frontend'), configFile: false, plugins: [react()], build: { outDir, emptyOutDir: true, minify: false, rollupOptions: { input: path.join(__dirname, 'preview-entry.tsx'), output: { entryFileNames: 'voice-entry.js', assetFileNames: '[name]-[hash][extname]' } } } })
  const names = fs.readdirSync(outDir), styles = names.filter(x => x.endsWith('.css'))
  fs.writeFileSync(path.join(outDir, 'index.html'), `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Voice candidate — synthetic local ports</title>${styles.map(x => `<link rel="stylesheet" href="/${x}">`).join('')}<div id="root"></div><script type="module" src="/voice-entry.js"></script>`)
  const files = fs.readdirSync(outDir).filter(name => fs.statSync(path.join(outDir, name)).isFile() && (/^03-.*\.wav$/.test(name) || name.endsWith('.css') || ['voice-entry.js', 'index.html'].includes(name))).map(name => ({ name, bytes: fs.statSync(path.join(outDir, name)).size, sha256: crypto.createHash('sha256').update(fs.readFileSync(path.join(outDir, name))).digest('hex') }))
  fs.writeFileSync(path.join(__dirname, 'preview-build.json'), JSON.stringify({ kind: 'ISOLATED_CANDIDATE_ONLY_NOT_APP_BUILD', files, outputDirectory: outDir, syntheticPorts: true, inventoryExistingBuild: process.argv.includes('--inventory-existing'), note: 'Initial build compiled successfully then inventory failed on copied public directories; only this consumer resumed. Copied unrelated public files are neither routed nor included.' }, null, 2))
}
main().catch(e => { console.error(e); process.exitCode = 1 })
