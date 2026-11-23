// Resolve the existing Vite ?url import in this standalone esbuild fixture.
// Serve the real installed worker bytes; this is not a renderer/worker mock.
const path = require('node:path')
const worker = Object.freeze({
  url: '/qa-assets/pdf.worker.min.mjs',
  file: require.resolve('pdfjs-dist/build/pdf.worker.min.mjs', { paths: [path.join(__dirname, '../frontend')] }),
  contentType: 'text/javascript',
})
const urlAssetPlugin = {
  name: 'qa-round3-vite-url',
  setup(build) {
    build.onResolve({ filter: /^pdfjs-dist\/build\/pdf\.worker\.min\.mjs\?url$/ }, () => ({ path: worker.file, namespace: 'qa-round3-url' }))
    build.onLoad({ filter: /.*/, namespace: 'qa-round3-url' }, () => ({ contents: 'export default ' + JSON.stringify(worker.url), loader: 'js' }))
  },
}
module.exports = { worker, urlAssetPlugin }
