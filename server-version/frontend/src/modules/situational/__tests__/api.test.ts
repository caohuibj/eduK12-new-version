import apiClient from '../../../api/client'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { embeddedSituationalApi, publicEmbeddedSituationalApi, situationalApi } from '../api'

describe('Situational embedded asset client', () => {
  afterEach(() => vi.restoreAllMocks())

  it('loads authenticated embedded assets through the API path', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('png', {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }))

    await embeddedSituationalApi('parent-1', 'item-1').loadAsset('child-1', 'asset-1')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/composite-assessments/attempts/parent-1/items/item-1/situational/child-1/assets/asset-1/content',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
  })

  it('preserves the recovery token for public embedded asset loads', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response('png', {
      status: 200,
      headers: { 'Content-Type': 'image/png' },
    }))

    await publicEmbeddedSituationalApi('parent-1', 'item-1', 'recovery-token').loadAsset('child-1', 'asset-1')

    expect(fetchMock).toHaveBeenCalledWith(
      '/api/public/composite-assessments/attempts/parent-1/items/item-1/situational/child-1/assets/asset-1/content',
      expect.objectContaining({ credentials: 'same-origin' }),
    )
    const requestInit = fetchMock.mock.calls[0]?.[1]
    expect(new Headers(requestInit?.headers).get('X-Recovery-Token')).toBe('recovery-token')
  })
})

// Role-specific entry points must not send teacher attempts through the student routes.
it('uses the dedicated teacher API only on the teacher participant surface',async()=>{
  const getMock=vi.spyOn(apiClient,'get').mockResolvedValue({code:0,message:'ok',data:{list:[]}})
  try {
    window.history.replaceState({},'', '/teacher/situational')
    await situationalApi.listInstruments()
    expect(getMock).toHaveBeenLastCalledWith('/teacher/situational/instruments')
    window.history.replaceState({},'', '/student/situational')
    await situationalApi.listInstruments()
    expect(getMock).toHaveBeenLastCalledWith('/situational/instruments')
  } finally {window.history.replaceState({},'', '/');vi.restoreAllMocks()}
})
