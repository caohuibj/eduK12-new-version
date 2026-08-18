function getVideoType(url) {
  if (!url) return 'unknown'
  if (url.includes('bilibili.com') || url.includes('b23.tv')) {
    return 'bilibili'
  }
  if (url.includes('youtube.com') || url.includes('youtu.be')) {
    return 'youtube'
  }
  if (url.includes('myqcloud.com')) {
    return 'cos'
  }
  return 'local'
}

function isPlayableInMiniProgram(url) {
  const type = getVideoType(url)
  return type === 'cos' || type === 'bilibili' || type === 'local'
}

function getBilibiliEmbedUrl(url) {
  const bvMatch = url.match(/BV[a-zA-Z0-9]+/)
  if (bvMatch) {
    return `https://player.bilibili.com/player.html?bvid=${bvMatch[0]}&page=1&high_quality=1&danmaku=0`
  }
  return null
}

module.exports = {
  getVideoType,
  isPlayableInMiniProgram,
  getBilibiliEmbedUrl
}
