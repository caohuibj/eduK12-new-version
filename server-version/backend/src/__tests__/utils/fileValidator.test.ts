import { describe, expect, it } from 'vitest'
import { detectMimeType, validateFileMagic } from '../../utils/fileValidator'

describe('file magic validation', () => {
  it('detects genuine PDF content from the %PDF- header', () => {
    const pdf = Buffer.from('%PDF-1.7\n1 0 obj\n')

    expect(detectMimeType(pdf)).toBe('application/pdf')
    expect(validateFileMagic(pdf, 'application/pdf')).toBe(true)
  })

  it('rejects a client-labelled PDF whose content is not PDF', () => {
    const fakePdf = Buffer.from('<html><body>not a pdf</body></html>')

    expect(detectMimeType(fakePdf)).toBeNull()
    expect(validateFileMagic(fakePdf, 'application/pdf')).toBe(false)
  })
})
