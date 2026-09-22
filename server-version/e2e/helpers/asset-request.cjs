// Production frontend bundles use /assets/*.js too. Only /api/.../assets/...
// endpoints deliver protected instrument media; inspect the URL path, not query text.
const isAssetApiGet = request => {
  const pathname = new URL(request.url()).pathname
  return request.method() === 'GET' && pathname.startsWith('/api/') && pathname.includes('/assets/')
}
module.exports = { isAssetApiGet }
