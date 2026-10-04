import { beforeEach, describe, expect, it, vi } from 'vitest'
import ExcelJS from 'exceljs'
import { mkdir, writeFile } from 'node:fs/promises'
import path from 'node:path'
const { findUnique } = vi.hoisted(() => ({ findUnique: vi.fn() }))
vi.mock('../../config/database', () => ({
  prisma: { checkin: { findUnique } },
}))
import { checkinController } from '../../controllers/checkinController'
const res = () => {
  const r: any = {}
  r.setHeader = vi.fn()
  r.send = vi.fn()
  r.status = vi.fn(() => r)
  r.json = vi.fn()
  return r
}
describe('actual checkin XLSX image export', () => {
  beforeEach(() => vi.clearAllMocks())
  it('exports one, multiple and no images without object strings or expiring private URLs', async () => {
    const images = [
      [{ assetId: 'private-1', url: '/api/assets/private-1?signature=secret' }],
      ['https://example.test/synthetic.png', { assetId: 'private-2' }],
      [],
    ]
    findUnique.mockResolvedValue({
      course: { title: '课程', creatorId: 'teacher' },
      title: '打卡',
      submissions: images.map((images, i) => ({
        images,
        content: '合成正文' + i,
        student: { username: 'S' + i, nickname: '合成学生' + i },
        createdAt: new Date('2026-10-04T00:00:00Z'),
      })),
    })
    const response = res()
    await checkinController.export(
      {
        user: { userId: 'teacher', role: 'TEACHER' },
        params: { id: 'checkin' },
      } as any,
      response,
    )
    const workbook = new ExcelJS.Workbook()
    await workbook.xlsx.load(response.send.mock.calls[0][0])
    const sheet = workbook.worksheets[0]
    expect(workbook.worksheets).toHaveLength(1)
    expect(sheet.columnCount).toBe(7)
    expect(sheet.getCell('B2').value).toBe('合成学生0')
    expect(sheet.getCell('C2').value).toBe('S0')
    expect(sheet.getCell('D2').value).toBe('合成正文0')
    expect(sheet.getCell('E2').value).toBe(1)
    expect(sheet.getCell('F2').value).toBe(
      '无可导出链接（受保护图片，请登录系统查看）',
    )
    expect(sheet.getCell('E3').value).toBe(2)
    expect(sheet.getCell('F3').value).toBe(
      'https://example.test/synthetic.png\n无可导出链接（受保护图片，请登录系统查看）',
    )
    expect(sheet.getCell('E4').value).toBe(0)
    expect(sheet.getCell('F4').value).toBe('')
    if (process.env.DOTQA_EVIDENCE_DIR) {
      await mkdir(process.env.DOTQA_EVIDENCE_DIR, { recursive: true })
      await writeFile(path.join(process.env.DOTQA_EVIDENCE_DIR, 'synthetic-checkin-export.xlsx'), response.send.mock.calls[0][0])
    }
    expect(JSON.stringify(sheet.getSheetValues())).not.toMatch(
      /object Object|signature=secret/,
    )
  })
  it('rejects another teacher before generating a workbook', async () => {
    findUnique.mockResolvedValue({
      course: { creatorId: 'other' },
      submissions: [],
    })
    const response = res()
    await checkinController.export(
      {
        user: { userId: 'teacher', role: 'TEACHER' },
        params: { id: 'checkin' },
      } as any,
      response,
    )
    expect(response.status).toHaveBeenCalledWith(403)
    expect(response.send).not.toHaveBeenCalled()
  })
})
