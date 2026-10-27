import { inflateRawSync } from 'node:zlib'
type XlsxLimits = { bytes: number; entries: number; part: number; total: number }

/** Bound actual decompression before the workbook reader; declarations alone are insufficient. */
export function validateBoundedXlsxContainer(buffer: Buffer, limits: Partial<XlsxLimits> = {}): Map<string, Buffer> {
  const max = { bytes: 2 * 1024 * 1024, entries: 200, part: 8 * 1024 * 1024, total: 12 * 1024 * 1024, ...limits }
  if (buffer.length > max.bytes || buffer.length < 22) throw new Error('模板大小上限为 2 MB')
  let end = -1
  for (let i = buffer.length - 22; i >= Math.max(0, buffer.length - 65557); i--)
    if (buffer.readUInt32LE(i) === 0x06054b50) {
      end = i
      break
    }
  if (
    end < 0 ||
    end + 22 + buffer.readUInt16LE(end + 20) !== buffer.length ||
    buffer.readUInt16LE(end + 4) ||
    buffer.readUInt16LE(end + 6)
  )
    throw new Error('无效或不支持的 Excel 容器')
  const count = buffer.readUInt16LE(end + 10),
    directory = buffer.readUInt32LE(end + 16),
    size = buffer.readUInt32LE(end + 12)
  if (count > max.entries || directory + size !== end || buffer.readUInt16LE(end + 8) !== count)
    throw new Error('模板容器超限')
  let cursor = directory,
    total = 0
  const names = new Set<string>(),
    files = new Map<string, Buffer>()
  for (let i = 0; i < count; i++) {
    if (cursor + 46 > end || buffer.readUInt32LE(cursor) !== 0x02014b50) throw new Error('无效目录')
    const flags = buffer.readUInt16LE(cursor + 8),
      method = buffer.readUInt16LE(cursor + 10),
      compressed = buffer.readUInt32LE(cursor + 20),
      uncompressed = buffer.readUInt32LE(cursor + 24)
    const nameLength = buffer.readUInt16LE(cursor + 28),
      extra = buffer.readUInt16LE(cursor + 30),
      comment = buffer.readUInt16LE(cursor + 32),
      local = buffer.readUInt32LE(cursor + 42)
    if (cursor + 46 + nameLength + extra + comment > end) throw new Error('无效目录范围')
    const name = buffer.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8')
    if (
      names.has(name) ||
      !/^[a-zA-Z0-9_./\[\]-]+$/.test(name) ||
      name.includes('..') ||
      name.startsWith('/') ||
      flags & 1 ||
      ![0, 8].includes(method) ||
      uncompressed > max.part ||
      compressed > buffer.length ||
      local + 30 > directory ||
      buffer.readUInt32LE(local) !== 0x04034b50
    )
      throw new Error('不支持的模板内容')
    names.add(name)
    const start = local + 30 + buffer.readUInt16LE(local + 26) + buffer.readUInt16LE(local + 28)
    if (start + compressed > directory) throw new Error('无效压缩范围')
    const bytes = buffer.subarray(start, start + compressed)
    const decoded =
      method === 8 ? inflateRawSync(bytes, { maxOutputLength: max.part }) : bytes
    files.set(name, decoded)
    total += decoded.length
    if (decoded.length !== uncompressed || total > max.total) throw new Error('模板解压超限')
    if (
      /vba|externalLinks|embeddings/i.test(name) ||
      (name.endsWith('.rels') &&
        /TargetMode\s*=\s*["']External["']/i.test(decoded.toString('utf8')))
    )
      throw new Error('模板不可含宏、嵌入文件或外部链接')
    cursor += 46 + nameLength + extra + comment
  }
  if (cursor !== end || !names.has('xl/workbook.xml')) throw new Error('不是受支持的 Excel 模板')
  return files
}
