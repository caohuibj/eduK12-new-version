import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'

const { mockGet, mockPost, authState } = vi.hoisted(() => ({
  mockGet: vi.fn(),
  mockPost: vi.fn(),
  authState: { user: { id: 'teacher-1', role: 'TEACHER' as 'TEACHER' | 'ADMIN' } },
}))

vi.mock('../../api/client', () => ({
  default: { get: mockGet, post: mockPost, delete: vi.fn() },
}))

vi.mock('../../contexts/AuthContext', () => ({
  useAuth: () => ({ user: authState.user }),
}))

import ScaleList from '../ScaleList'

const scale = (overrides: Record<string, unknown> = {}) => ({
  id: 'scale-1',
  code: 'S1',
  name: '焦虑量表',
  description: null,
  status: 'PUBLISHED',
  estimatedTime: 5,
  instruction: null,
  tags: [],
  source: 'owned',
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  creator: { id: 'teacher-1', username: 'tea', nickname: '教师' },
  course: null,
  _count: { items: 1, dimensions: 1, assessments: 0 },
  ...overrides,
})

describe('ScaleList grant badges', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    authState.user = { id: 'teacher-1', role: 'TEACHER' }
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/tags')) return Promise.resolve({ code: 0, data: { tags: [] } })
      return Promise.resolve({ code: 0, data: { list: [scale({ source: 'granted', creator: { id: 'admin-1', username: 'admin', nickname: '管理员' } })], total: 1 } })
    })
  })

  it('hides edit and export for granted scales and shows a read-only badge', async () => {
    render(
      <MemoryRouter>
        <ScaleList />
      </MemoryRouter>
    )
    expect(await screen.findByText('管理员授权 · 只读')).toBeInTheDocument()
    expect(screen.queryByTitle('编辑')).not.toBeInTheDocument()
    expect(screen.queryByTitle('导出数据')).not.toBeInTheDocument()
    expect(screen.queryByTitle('授权给教师')).not.toBeInTheDocument()
  })

  it.each([
    ['DRAFT', 'CUSTOM_DESCRIPTIVE', '编辑'],
    ['PUBLISHED', 'CUSTOM_DESCRIPTIVE', '查看'],
    ['DEPRECATED', 'CUSTOM_DESCRIPTIVE', '查看'],
    ['ARCHIVED', 'CUSTOM_DESCRIPTIVE', '查看'],
    ['DRAFT', 'STANDARD', '查看'],
  ])('offers %s %s only its allowed definition entry', async (status, instrumentClass, action) => {
    mockGet.mockImplementation((url: string) => Promise.resolve({ code: 0, data: url.includes('/tags') ? { tags: [] } : { list: [scale({ status, instrumentClass })], total: 1 } }))
    render(<MemoryRouter><ScaleList /></MemoryRouter>)
    expect(await screen.findByRole('link', { name: `${action} 焦虑量表` })).toHaveAttribute('href', '/scales/scale-1')
    expect(screen.queryByRole('link', { name: `${action === '编辑' ? '查看' : '编辑'} 焦虑量表` })).not.toBeInTheDocument()
  })

  it('lets ADMIN grant and view a published other scale without editing its frozen definition', async () => {
    authState.user = { id: 'admin-1', role: 'ADMIN' }
    mockGet.mockImplementation((url: string) => {
      if (String(url).includes('/tags')) return Promise.resolve({ code: 0, data: { tags: [] } })
      return Promise.resolve({
        code: 0,
        data: {
          list: [scale({
            source: 'other',
            creator: { id: 'teacher-1', username: 'tea', nickname: '教师' },
            _count: { items: 1, dimensions: 1, assessments: 2 },
          })],
          total: 1,
        },
      })
    })
    render(
      <MemoryRouter>
        <ScaleList />
      </MemoryRouter>
    )
    expect(await screen.findByTitle('查看')).toBeInTheDocument()
    expect(screen.queryByTitle('编辑')).not.toBeInTheDocument()
    expect(screen.getByTitle('授权给教师')).toBeInTheDocument()
    expect(screen.queryByText('管理员授权 · 只读')).not.toBeInTheDocument()
  })
})


describe('ScaleList paginated version discovery', () => {
  beforeEach(() => { vi.clearAllMocks(); authState.user = { id: 'teacher-1', role: 'TEACHER' } })
  const open = () => render(<MemoryRouter><ScaleList /></MemoryRouter>)

  it('loads older versions beyond the first 100 without losing existing rows or read-only grants', async () => {
    mockGet.mockImplementation((url: string) => Promise.resolve({ code: 0, data: url.includes('/tags') ? { tags: [] }
      : url.includes('page=2&') ? { list: [scale({id:'old',name:'旧版本',source:'granted'})], total:101 }
      : { list: Array.from({length:100},(_,i)=>scale({id:String(i),name:'量表 '+i})), total:101 } }))
    open()
    await screen.findByText('量表 0')
    fireEvent.click(screen.getByRole('button',{name:'加载更多量表'}))
    await screen.findByText('旧版本')
    expect(mockGet).toHaveBeenCalledWith('/scales?page=2&pageSize=100')
    expect(screen.getByText('量表 0')).toBeInTheDocument()
    expect(screen.getByText('已加载 101 条，共 101 条。')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'加载更多量表'})).not.toBeInTheDocument()
    expect(screen.queryByRole('link',{name:'查看 旧版本'})).not.toBeInTheDocument()
    expect(screen.getByText('管理员授权 · 只读')).toBeInTheDocument()
  })

  it('preserves OR tag filtering while loading additional matching versions', async () => {
    mockGet.mockImplementation((url: string) => Promise.resolve({code:0,data:url.includes('/tags')?{tags:['甲','乙']}
      :url.includes('page=2&')?{list:[scale({id:'old',name:'匹配旧版',tags:['乙']})],total:101}
      :{list:[scale({name:'未匹配',tags:[]})],total:101}}))
    open()
    await screen.findByText('未匹配')
    fireEvent.click(screen.getByText('甲'));fireEvent.click(screen.getByText('乙'))
    expect(screen.getByText('已加载的量表中没有符合当前标签筛选条件的量表。')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'加载更多量表'}))
    expect(await screen.findByText('匹配旧版')).toBeInTheDocument()
    expect(screen.queryByText('未匹配')).not.toBeInTheDocument()
    expect(screen.getByText(/标签筛选适用于已加载量表/)).toBeInTheDocument()
  })

  it.each([
    ['Error instance', new Error('连接中断'), '连接中断'],
    ['normalized HTTP object', { name: 'ApiClientError', message: '服务暂不可用', status: 503, retryable: true }, '服务暂不可用'],
    ['unknown rejection', null, '获取量表列表失败'],
  ])('retries the failed next page for %s and deduplicates rows without clearing the list', async (_kind, failure, message) => {
    let attempts=0
    mockGet.mockImplementation((url:string)=>{
      if(url.includes('/tags'))return Promise.resolve({code:0,data:{tags:[]}})
      if(url.includes('page=2&'))return ++attempts===1?Promise.reject(failure)
        :Promise.resolve({code:0,data:{list:[scale(),scale({id:'older',name:'更旧版本'})],total:101}})
      return Promise.resolve({code:0,data:{list:[scale()],total:101}})
    })
    open();await screen.findByText('焦虑量表')
    fireEvent.click(screen.getByRole('button',{name:'加载更多量表'}))
    expect((await screen.findByRole('alert')).textContent).toBe(`后续量表加载失败：${message}。已加载内容保留。`)
    expect(screen.getByText('焦虑量表')).toBeInTheDocument()
    fireEvent.click(screen.getByRole('button',{name:'重试加载更多量表'}))
    await screen.findByText('更旧版本')
    expect(screen.getAllByText('焦虑量表')).toHaveLength(1)
    expect(mockGet.mock.calls.filter(([url])=>url==='/scales?page=2&pageSize=100')).toHaveLength(2)
  })

  it('does not append stale pagination results after a publication refresh', async () => {
    let resolve!: (value:unknown)=>void
    let refreshed=false
    mockPost.mockImplementation(()=>{refreshed=true;return Promise.resolve({code:0})})
    mockGet.mockImplementation((url:string)=>url.includes('/tags')?Promise.resolve({code:0,data:{tags:[]}})
      :url.includes('page=2&')?new Promise(r=>{resolve=r})
      :Promise.resolve({code:0,data:{list:[scale({status:refreshed?'PUBLISHED':'DRAFT'})],total:refreshed?1:101}}))
    open();await screen.findByText('焦虑量表')
    fireEvent.click(screen.getByRole('button',{name:'加载更多量表'}))
    fireEvent.click(screen.getByRole('button',{name:'发布 焦虑量表'}))
    await screen.findByText('已加载 1 条，共 1 条。')
    await act(async()=>resolve({code:0,data:{list:[scale({id:'late',name:'旧请求版本'})],total:101}}))
    expect(screen.queryByText('旧请求版本')).not.toBeInTheDocument()
    expect(screen.getByText('已加载 1 条，共 1 条。')).toBeInTheDocument()
    expect(screen.queryByRole('button',{name:'加载更多量表'})).not.toBeInTheDocument()
  })

  it('ignores a late page response after the list unmounts', async () => {
    let resolve!: (value:unknown)=>void
    mockGet.mockImplementation((url:string)=>url.includes('/tags')?Promise.resolve({code:0,data:{tags:[]}})
      :url.includes('page=2&')?new Promise(r=>{resolve=r}):Promise.resolve({code:0,data:{list:[scale()],total:101}}))
    const view=open();await screen.findByText('焦虑量表')
    fireEvent.click(screen.getByRole('button',{name:'加载更多量表'}))
    expect(screen.getByRole('button',{name:'正在加载更多量表…'})).toBeDisabled()
    view.unmount()
    await act(async()=>resolve({code:0,data:{list:[scale({id:'late',name:'过期版本'})],total:101}}))
    expect(screen.queryByText('过期版本')).not.toBeInTheDocument()
  })
})
