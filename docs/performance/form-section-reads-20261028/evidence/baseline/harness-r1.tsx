import { appendFileSync } from 'node:fs'
import { createServer, type Server } from 'node:http'
import { createHash } from 'node:crypto'
import { gzipSync } from 'node:zlib'
import { act, cleanup, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { createMemoryRouter, RouterProvider } from 'react-router-dom'
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest'
import apiClient from '../../api/client'
import FormSectionManager from '../FormSectionManager'

// Keep the real editor, section manager and API envelope/session interceptors.
// Only unrelated optional editor surfaces are replaced. HTTP data is synthetic;
// this suite does not establish real backend authentication or authorization.
vi.mock('../ScaleSelector', () => ({ ScaleSelector: () => <p>合成量表选择器</p> }))
vi.mock('../PublicDeliveryManager', () => ({ PublicDeliveryManager: () => <p>合成令牌管理</p> }))
import GeneralQuestionnaireEdit from '../../pages/teacher/GeneralQuestionnaireEdit'

type Item = { id: string; label?: string; formLabel?: string; contextKey: string | null; sectionId?: string; formSectionId?: string; position: number }
type Section = { id: string; title: string; position: number; contextSection: boolean; items: Item[] }
const basePaths = ['/general-questionnaires/q', '/questionnaires/q', '/composite-assessments/q']
const original = { get: apiClient.get, post: apiClient.post, put: apiClient.put, delete: apiClient.delete }
const envelope = (data: unknown) => ({ code: 0, message: '成功', data })
const metadata = { id: 'q', code: 'synthetic', name: '合成普通问卷', description: '', instruction: '', status: 'DRAFT', estimatedTime: 5 }
const fixture = (composite: boolean): Section[] => [
  { id: 'context', title: '背景信息', position: 0, contextSection: true, items: [{ id: 'context-field', label: '背景字段', formLabel: '背景字段', contextKey: 'gradeLevel', position: 0 }] },
  ...[1, 2].map(n => ({
    id: `section-${n}`, title: `分区${n}`, position: n, contextSection: false,
    items: Array.from({ length: 20 }, (_, i) => ({
      id: `field-${n}-${i}`, [composite ? 'formLabel' : 'label']: `合成字段 ${n}-${i}：请描述本次学习体验`,
      contextKey: null, [composite ? 'formSectionId' : 'sectionId']: `section-${n}`, position: n * 20 + i,
      type: 'text_input', formType: 'text_input', required: true, options: null, placeholder: null,
      sectionPosition: i, formSectionPosition: i,
    })),
  })),
]
let sections: Section[]
let server: Server, origin: string
let failedSuffix: string | null = null
let requests: Array<{ method: string; path: string; status: number; rawBytes: number; gzipBodyBytes: number }>
let unexpected: string[]
let basePath: string

beforeAll(async () => {
  server = createServer((req, res) => {
    const url = new URL(req.url!, 'http://127.0.0.1')
    let status = 200, body: unknown
    const suffix = url.pathname.slice(`/api${basePath}`.length)
    if (req.method === 'GET' && url.pathname.startsWith(`/api${basePath}`)) {
      if (suffix === failedSuffix) { status = 503; body = { code: 503, message: '合成暂时不可用', data: null } }
      else if (suffix === '') body = envelope(metadata)
      else if (suffix === '/form-sections') body = envelope({ list: sections })
      else if (suffix === '/form-items') body = envelope({ list: sections.flatMap(section => section.items) })
      else if (suffix === '/content') body = envelope({ units: sections.map(section => ({ type: 'form-section', id: section.id, label: section.title, position: section.position, itemCount: section.items.length, contextSection: section.contextSection })) })
      else if (suffix === '/scales') body = envelope({ list: [] })
    } else if (req.method === 'GET' && url.pathname === '/api/scales' && url.search === '?status=PUBLISHED&page=1&pageSize=100') {
      body = envelope({ list: [] })
    } else if (req.method === 'POST' && suffix === '/form-sections/section-2/items/field-1-0') {
      const source = sections.find(section => section.id === 'section-1')!
      const moved = source.items.find(item => item.id === 'field-1-0')!
      source.items = source.items.filter(item => item !== moved)
      sections.find(section => section.id === 'section-2')!.items.push({ ...moved, sectionId: 'section-2', formSectionId: 'section-2' })
      body = envelope({})
    }
    if (body === undefined) {
      unexpected.push(`${req.method} ${url.pathname}${url.search}`)
      status = 404; body = { code: 404, message: 'Unexpected synthetic request', data: null }
    }
    const raw = Buffer.from(JSON.stringify(body)), compressed = gzipSync(raw, { level: 1 })
    requests.push({ method: req.method!, path: url.pathname + url.search, status, rawBytes: raw.length, gzipBodyBytes: compressed.length })
    res.writeHead(status, { 'Content-Type': 'application/json', 'Content-Encoding': 'gzip', 'Content-Length': compressed.length, 'Cache-Control': 'no-store' })
    res.end(compressed)
  })
  await new Promise<void>(resolve => server.listen(0, '127.0.0.1', resolve))
  const address = server.address()
  if (!address || typeof address === 'string') throw new Error('Loopback fixture did not bind')
  origin = `http://127.0.0.1:${address.port}`
})
afterAll(async () => { await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve())) })
beforeEach(() => {
  basePath = basePaths[0]
  sections = fixture(false)
  failedSuffix = null; requests = []; unexpected = []
  // Node fetch is the actual HTTP transport. Cookies here are synthetic and
  // only avoid an unrelated CSRF bootstrap in mutation-contract cases.
  document.cookie = 'ptool_csrf=synthetic-fixture; path=/'
  for (const method of ['get', 'post', 'put', 'delete'] as const) {
    if (method === 'get' || method === 'delete') vi.spyOn(apiClient, method).mockImplementation((url, config) => original[method](url, { ...config, baseURL: origin + '/api', adapter: 'fetch' }))
    else vi.spyOn(apiClient, method).mockImplementation((url, data, config) => original[method](url, data, { ...config, baseURL: origin + '/api', adapter: 'fetch' }))
  }
})
afterEach(() => { cleanup(); vi.restoreAllMocks(); expect(unexpected).toEqual([]) })

const field1 = '合成字段 1-0：请描述本次学习体验'
const field2 = '合成字段 2-0：请描述本次学习体验'
const target = () => screen.getByRole('combobox', { name: '向分区2添加字段' })
const ready = () => screen.findByRole('combobox', { name: '向分区2添加字段' })
function record(name: string, started: number, cpu: NodeJS.CpuUsage) {
  const result = {
    label: process.env.FORM_SECTION_MEASURE_LABEL || 'candidate', name,
    fixtureSha256: createHash('sha256').update(JSON.stringify(fixture(basePath.startsWith('/composite')))).digest('hex'),
    requests: [...requests], getCount: requests.filter(r => r.method === 'GET').length,
    gzipBodyBytes: requests.reduce((n, r) => n + r.gzipBodyBytes, 0),
    componentReadyMs: performance.now() - started, nodeCpuMicros: process.cpuUsage(cpu),
    nodeHeapUsed: process.memoryUsage().heapUsed,
    scope: 'actual loopback HTTP gzip response bodies and React/jsdom consumer; synthetic data; no browser cache, backend auth, SQL or production latency qualification',
  }
  if (process.env.FORM_SECTION_MEASURE_OUTPUT) appendFileSync(process.env.FORM_SECTION_MEASURE_OUTPUT, JSON.stringify(result) + '\n')
}

describe('canonical section field source over synthetic HTTP', () => {
  it.each(basePaths)('measures initial shared manager at %s', async path => {
    basePath = path; sections = fixture(path.startsWith('/composite'))
    const started = performance.now(), cpu = process.cpuUsage()
    render(<FormSectionManager basePath={path} />)
    await ready()
    expect(within(target()).getByRole('option', { name: field1 })).toBeInTheDocument()
    expect(within(target()).queryByRole('option', { name: field2 })).toBeNull()
    expect(within(target()).queryByRole('option', { name: '背景字段' })).toBeNull()
    record(path, started, cpu)
  })

  it('measures the real ordinary editor basic, content and cached tab revisit', async () => {
    const user = userEvent.setup()
    const router = createMemoryRouter([{ path: '/general-questionnaires/:id/edit', element: <GeneralQuestionnaireEdit /> }], { initialEntries: ['/general-questionnaires/q/edit'] })
    render(<RouterProvider router={router} />)
    const name = await screen.findByLabelText('问卷名称 *')
    expect(requests.map(r => r.path)).toEqual(['/api/general-questionnaires/q'])
    await user.clear(name); await user.type(name, '保留的基本信息草稿')
    const started = performance.now(), cpu = process.cpuUsage()
    await user.click(screen.getByRole('button', { name: '内容编排' }))
    await ready()
    record('ordinary-editor-first-content', started, cpu)
    const beforeRevisit = requests.length
    await user.click(screen.getByRole('button', { name: '基本信息' }))
    expect(screen.getByLabelText('问卷名称 *')).toHaveValue('保留的基本信息草稿')
    await user.click(screen.getByRole('button', { name: '内容编排' }))
    expect(target()).toBeVisible()
    expect(requests).toHaveLength(beforeRevisit)
    await act(async () => { await router.dispose() })
  })

  it.each(basePaths)('uses only sections and order and refreshes canonical membership after a move at %s', async path => {
    basePath = path; sections = fixture(path.startsWith('/composite'))
    render(<FormSectionManager basePath={path} />)
    await ready()
    expect(requests.map(r => r.path)).toEqual([`/api${path}/form-sections`, `/api${path}/content`])
    await userEvent.selectOptions(target(), 'field-1-0')
    await waitFor(() => expect(within(target()).queryByRole('option', { name: field1 })).toBeNull())
    expect(within(screen.getByRole('combobox', { name: '向分区1添加字段' })).getByRole('option', { name: field1 })).toBeInTheDocument()
    expect(requests.filter(r => r.method === 'POST').map(r => r.path)).toEqual([`/api${path}/form-sections/section-2/items/field-1-0`])
    expect(requests.filter(r => r.method === 'GET')).toHaveLength(4)
    expect(requests.some(r => r.path.endsWith('/form-items'))).toBe(false)
  })

  it('uses the refreshed section list for newly available fields', async () => {
    const view = render(<FormSectionManager basePath={basePath} refreshKey={0} />)
    await ready()
    sections[1].items.push({ id: 'new-field', label: '新增字段', contextKey: null, position: 99 })
    view.rerender(<FormSectionManager basePath={basePath} refreshKey={1} />)
    expect(await within(await ready()).findByRole('option', { name: '新增字段' })).toBeInTheDocument()
    expect(requests.filter(r => r.method === 'GET')).toHaveLength(4)
  })

  it.each(['/form-sections', '/content'])('keeps a failed %s distinguishable from an empty section list', async suffix => {
    failedSuffix = suffix
    render(<FormSectionManager basePath={basePath} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('合成暂时不可用')
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(requests).toHaveLength(2)
  })

  it('keeps published/read-only section management non-mutating', async () => {
    render(<FormSectionManager basePath={basePath} readOnly />)
    expect(await screen.findByText(field1)).toBeInTheDocument()
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(screen.queryByRole('button', { name: '新增区段' })).toBeNull()
    expect(requests.every(r => r.method === 'GET')).toBe(true)
  })
})
