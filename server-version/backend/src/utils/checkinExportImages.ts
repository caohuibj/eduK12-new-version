/** Private asset capabilities expire and must not be persisted in a workbook. */
export function checkinExportImages(value: unknown): {
  count: number
  references: string
} {
  const images = Array.isArray(value) ? value : []
  return {
    count: images.length,
    references: images
      .map((image) => {
        if (typeof image === 'string') {
          try {
            const url = new URL(image)
            if (['https:', 'http:'].includes(url.protocol)) return url.href
          } catch {
            /* Not a usable legacy URL. */
          }
        }
        return '无可导出链接（受保护图片，请登录系统查看）'
      })
      .join('\n'),
  }
}
