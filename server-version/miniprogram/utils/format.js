function formatDate(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}

function formatTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const year = date.getFullYear()
  const month = String(date.getMonth() + 1).padStart(2, '0')
  const day = String(date.getDate()).padStart(2, '0')
  const hour = String(date.getHours()).padStart(2, '0')
  const minute = String(date.getMinutes()).padStart(2, '0')
  return `${year}-${month}-${day} ${hour}:${minute}`
}

function formatStatus(deadline, submitted) {
  if (submitted) {
    return { text: '已提交', class: 'submitted' }
  }
  if (!deadline) {
    return { text: '进行中', class: 'ongoing' }
  }
  const now = new Date()
  const end = new Date(deadline)
  if (now > end) {
    return { text: '已截止', class: 'expired' }
  }
  return { text: '进行中', class: 'ongoing' }
}

function formatRelativeTime(dateStr) {
  if (!dateStr) return ''
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return '刚刚'
  if (minutes < 60) return `${minutes}分钟前`
  if (hours < 24) return `${hours}小时前`
  if (days < 30) return `${days}天前`
  return formatDate(dateStr)
}

/**
 * 判断是否为新内容（N天内创建）
 * @param {string} dateStr - 创建时间
 * @param {number} days - 天数阈值，默认3天
 */
function isNew(dateStr, days = 3) {
  if (!dateStr) return false
  const date = new Date(dateStr)
  const now = new Date()
  const diff = now - date
  return diff < days * 24 * 60 * 60 * 1000
}

module.exports = {
  formatDate,
  formatTime,
  formatStatus,
  formatRelativeTime,
  isNew
}
