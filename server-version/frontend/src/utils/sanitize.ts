import DOMPurify from 'dompurify'

/**
 * 净化 HTML 内容，防止 XSS 攻击
 * 只允许基本的文本格式化标签
 */
export const sanitizeHtml = (html: string | null | undefined): string => {
  if (!html) return ''
  
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: ['b', 'i', 'em', 'strong', 'p', 'br', 'ul', 'ol', 'li', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'span', 'div', 'a'],
    ALLOWED_ATTR: ['class', 'href', 'target', 'rel'],
    ALLOWED_URI_REGEXP: /^https:\/\//i,
    KEEP_CONTENT: true
  })
}

/**
 * 净化纯文本内容（去除所有 HTML 标签）
 */
export const sanitizeText = (html: string | null | undefined): string => {
  if (!html) return ''
  
  return DOMPurify.sanitize(html, {
    ALLOWED_TAGS: [],
    ALLOWED_ATTR: [],
    KEEP_CONTENT: true
  })
}
