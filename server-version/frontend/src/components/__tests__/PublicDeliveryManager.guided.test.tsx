import { beforeEach, afterEach, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { PublicDeliveryManager } from '../PublicDeliveryManager'
import { localDateTimeValue } from '../LocalDateTimeInput'

const { api, research } = vi.hoisted(() => ({ api: { get: vi.fn(), post: vi.fn(), delete: vi.fn() }, research: vi.fn() }))
vi.mock('../../api/client', () => ({ default: api, sessionFetch: vi.fn() }))
vi.mock('../AnonymousStudyManager', () => ({ AnonymousStudyManager: () => { research(); return <label>合成研究备注<input defaultValue=""/></label> } }))
const row = { id: 'guided-link', token: null, createdAt: null, expiresAt: '2099-01-01T00:00:00Z', maxUses: 0, usedCount: 0, isActive: true }
beforeEach(() => { vi.clearAllMocks(); api.get.mockResolvedValue({ code: 0, data: { list: [] } }); api.post.mockResolvedValue({ code: 0, data: row }) })
afterEach(() => vi.restoreAllMocks())
async function ready() { await screen.findByText('尚未生成链接') }

it('creates an ordinary link with the same deadline and default quota without opting into advanced rules', async () => {
 render(<PublicDeliveryManager guided family="COMPOSITE" resourceId="synthetic" groupIpEligible maximumExpiry={row.expiresAt}/>)
 await ready()
 expect(screen.getByLabelText('最大参与次数（0 表示不限）')).not.toBeVisible()
 expect(screen.getByRole('button', { name: '生成新链接' })).toBeVisible()
 expect(research).not.toHaveBeenCalled()
 fireEvent.click(screen.getByRole('button', { name: '沿用测评截止时间' }))
 expect(screen.getByLabelText('有效期')).toHaveValue(localDateTimeValue(row.expiresAt))
 fireEvent.click(screen.getByRole('button', { name: '生成新链接' }))
 await waitFor(() => expect(api.post).toHaveBeenCalledWith('/composite-assessments/synthetic/public-tokens', { expiresAt: row.expiresAt.replace('Z', '.000Z'), maxUses: 0 }))
 expect(api.post.mock.calls[0]![1]).not.toHaveProperty('groupIpPolicy')
})

it('keeps old links when an incomplete new link is rejected', async () => {
 api.get.mockResolvedValue({ code: 0, data: { list: [row] } })
 render(<PublicDeliveryManager guided family="COMPOSITE" resourceId="synthetic"/>)
 await screen.findByText('链接地址已隐藏，复制时会重新验证权限。')
 fireEvent.click(screen.getByRole('button', { name: '生成新链接' }))
 expect(await screen.findByRole('alert')).toHaveTextContent('请选择有效期')
 expect(screen.getByRole('button', { name: '复制链接' })).toBeVisible()
 expect(api.post).not.toHaveBeenCalled()
})

it('loads research only after expansion and retains entered values when collapsed', async () => {
 render(<PublicDeliveryManager guided family="COMPOSITE" resourceId="synthetic"/>)
 await ready()
 expect(research).not.toHaveBeenCalled()
 const summary = screen.getByText('同一批匿名参与者，需要多次测评？')
 fireEvent.click(summary)
 const field = await screen.findByLabelText('合成研究备注')
 fireEvent.change(field, { target: { value: '保留本次输入' } })
 fireEvent.click(summary)
 expect(field).not.toBeVisible()
 fireEvent.click(summary)
 expect(field).toBeVisible()
 expect(field).toHaveValue('保留本次输入')
})

it('revalidates the credential when copying a hidden link', async () => {
 api.get.mockResolvedValue({ code: 0, data: { list: [row] } })
 api.post.mockResolvedValue({ code: 0, data: { ...row, token: 'synthetic-guided-token' } })
 const writeText = vi.fn().mockResolvedValue(undefined)
 Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } })
 render(<PublicDeliveryManager guided family="COMPOSITE" resourceId="synthetic"/>)
 await screen.findByText('链接地址已隐藏，复制时会重新验证权限。')
 fireEvent.click(screen.getByRole('button', { name: '复制链接' }))
 await waitFor(() => expect(api.post).toHaveBeenCalledWith('/composite-assessments/synthetic/public-tokens/guided-link/reveal', {}))
 expect(writeText).toHaveBeenCalledWith(window.location.origin + '/public/composite/synthetic-guided-token')
})

it('preserves explicit group-IP and quota settings in the guided form', async () => {
 vi.spyOn(Date, 'now').mockReturnValue(Date.parse('2026-10-20T00:00:00Z'))
 render(<PublicDeliveryManager guided family="COMPOSITE" resourceId="synthetic" groupIpEligible/>)
 await ready()
 fireEvent.click(screen.getByText('参与次数与课堂网络设置'))
 fireEvent.change(screen.getByLabelText('最大参与次数（0 表示不限）'), { target: { value: '12' } })
 fireEvent.click(screen.getByRole('checkbox'))
 fireEvent.change(screen.getByLabelText('窗口时区（IANA）'), { target: { value: 'Asia/Tokyo' } })
 fireEvent.change(screen.getByLabelText('有效期'), { target: { value: localDateTimeValue('2026-10-20T01:00:00Z') } })
 fireEvent.click(screen.getByRole('button', { name: '生成新链接' }))
 await waitFor(() => expect(api.post).toHaveBeenCalledWith('/composite-assessments/synthetic/public-tokens', { expiresAt: '2026-10-20T01:00:00.000Z', maxUses: 12, groupIpPolicy: { schemaVersion: 1, timeZone: 'Asia/Tokyo' } }))
})
