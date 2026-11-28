import { afterEach, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import GovernedToolsWorkspace from './GovernedToolsWorkspace'

const { admin } = vi.hoisted(() => ({ admin: vi.fn() }))
vi.mock('../../api/surveyGovernance', async () => ({
  ...await vi.importActual('../../api/surveyGovernance'),
  governedRequest: admin,
}))
vi.mock('../../admin/AdminStepUp', () => ({ default: () => <p>Identity verification</p> }))
afterEach(() => { cleanup(); admin.mockReset() })

it('copies an exact Form C from the governed catalog and submits a preview-bound R-only update', async () => {
  const hash = 'a'.repeat(64)
  const definition = { schemaVersion: 2, pages: [{ pageKey: 'page', title: 'Background', questions: [
    { itemKey: 'why', type: 'SHORT_TEXT', prompt: 'Synthetic Form field', required: false, options: [], rows: [] },
  ] }] }
  const row = {
    id: 'frozen-form', title: 'Published Form', family: 'FORM', toolKey: 'FORM:original:fixture_form',
    versions: { content: '1.0.0', parameters: null, report: '1.0.0' }, blockers: [], components: [], state: 'ONLINE',
  }
  admin.mockImplementation(async (_scope: string, path: string) => {
    if (path.startsWith('/catalog?family=FORM')) return { list: [row], hasMore: false }
    if (path === '/versions/frozen-form') return { ...row, snapshot: {}, reference: {}, trials: [] }
    if (path === '/form-templates/frozen-form/revision') return {
      base: { releaseId: row.id, hash },
      content: { schemaVersion: 1, toolKey: 'fixture_form', version: '1.0.0', title: row.title, definition,
        statement: 'Synthetic test', classificationTags: [], reference: {},
        dataCeiling: { schemaVersion: 1, policyVersion: '1.0.0', unknownAudience: 'DENY', audiences: {} },
      },
      report: { version: '1.0.0', template: { blocks: [{ type: 'TEXT', text: 'Former completion' }], limitations: [] } },
    }
    if (path === '/form-templates/preview') return { previewHash: 'b'.repeat(64), blockers: [], definition,
      effectiveDisclosure: { audiences: {} } }
    return { list: [], hasMore: false }
  })
  render(<GovernedToolsWorkspace/>)
  fireEvent.click(screen.getByRole('button', { name: '表单' }))
  fireEvent.click(await screen.findByText('Published Form', { exact: true }))
  const copy = await screen.findByRole('button', { name: '复制表单版本' })
  await waitFor(() => expect(copy).toBeEnabled())
  fireEvent.click(copy)
  await screen.findByText(/已复制冻结题本/)
  const panel = within(screen.getByText('编制标准表单模板').closest('details')!)
  expect(panel.getByLabelText('题本版本')).toHaveValue('1.0.0')
  fireEvent.change(panel.getByLabelText('发布版本'), { target: { value: '1.1.0' } })
  fireEvent.change(panel.getByLabelText('报告版本'), { target: { value: '2.0.0' } })
  fireEvent.change(panel.getByLabelText('完成说明'), { target: { value: 'New completion' } })
  fireEvent.click(panel.getByRole('button', { name: '核对字段与披露范围' }))
  fireEvent.click(await panel.findByRole('button', { name: '提交审核' }))
  await waitFor(() => expect(admin).toHaveBeenCalledWith('survey-tools', '/form-templates/submissions', expect.objectContaining({
    base: { releaseId: row.id, hash }, expectedPreviewHash: 'b'.repeat(64), releaseKey: '1.1.0',
    content: expect.objectContaining({ version: '1.0.0', definition }),
    report: expect.objectContaining({ version: '2.0.0', contentVersion: '1.0.0',
      template: expect.objectContaining({ blocks: [{ type: 'TEXT', text: 'New completion' }] }) }),
  })))
  expect(admin.mock.calls.some((call) => call[1] === '/versions/frozen-form/review')).toBe(false)
})
