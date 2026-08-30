import { describe, expect, it } from 'vitest'
import { createAttachmentSchema } from '../../utils/attachmentSchema'

describe('attachment schema', () => {
  it('accepts server-issued asset references and HTTPS external URLs', () => {
    const schema = createAttachmentSchema(false)
    expect(schema.safeParse({ type: 'library', assetId: 'asset-1', title: '视频' }).success).toBe(true)
    expect(schema.safeParse('https://www.youtube.com/watch?v=abc').success).toBe(true)
  })

  it('rejects iframe/HTML injection and arbitrary unbound objects', () => {
    const schema = createAttachmentSchema(false)
    expect(schema.safeParse('<iframe src="https://evil.example"></iframe>').success).toBe(false)
    expect(schema.safeParse({ url: 'https://evil.example/video.mp4' }).success).toBe(false)
    expect(schema.safeParse('http://example.com/video.mp4').success).toBe(false)
  })

  it('allows legacy local paths only during the migration window', () => {
    expect(createAttachmentSchema(true).safeParse('/uploads/videos/example.mp4').success).toBe(true)
    expect(createAttachmentSchema(true).safeParse({ url: '/uploads/documents/legacy.pdf', title: '旧文档' }).success).toBe(true)
    expect(createAttachmentSchema(false).safeParse('/uploads/videos/example.mp4').success).toBe(false)
    expect(createAttachmentSchema(true).safeParse('/uploads/../secrets.txt').success).toBe(false)
    expect(createAttachmentSchema(true).safeParse('/uploads/%2e%2e/secrets.txt').success).toBe(false)
    expect(createAttachmentSchema(true).safeParse('/uploads/%5c..%5csecrets.txt').success).toBe(false)
    expect(createAttachmentSchema(true).safeParse('/uploads/%zz/secrets.txt').success).toBe(false)
  })
})
