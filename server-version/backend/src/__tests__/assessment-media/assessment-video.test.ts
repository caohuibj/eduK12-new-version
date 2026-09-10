import { PassThrough } from 'node:stream'
import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const { mockDb, localPathRef, mockGetCOSSignedUrl } = vi.hoisted(() => ({
  mockDb: { storedAsset: { findUnique: vi.fn() } },
  localPathRef: { value: '' },
  mockGetCOSSignedUrl: vi.fn(),
}))

vi.mock('../../config/database', () => ({ prisma: mockDb }))
vi.mock('../../services/assetStorage', () => ({
  getLocalAssetPath: () => localPathRef.value,
}))
vi.mock('../../utils/cos', () => ({ getCOSSignedUrl: mockGetCOSSignedUrl }))

import {
  assessmentVideoPresentationAssetReferences,
  assessmentVideoPresentationSchema,
} from '../../modules/assessment-media/assessment-video'
import {
  assessmentMediaCapabilityInternals,
  verifyAssessmentMediaCapability,
} from '../../modules/assessment-media/assessment-media-capability'
import {
  parseAssessmentSingleByteRange,
  serveAssessmentMediaCapabilityContent,
} from '../../modules/assessment-media/assessment-video-delivery'

const { createAssessmentMediaCapability } = assessmentMediaCapabilityInternals
const digest = 'a'.repeat(64)
const videoAsset = { assetId: 'video-asset', contentHash: digest, mimeType: 'video/mp4' as const }
const posterAsset = { assetId: 'poster-asset', contentHash: 'b'.repeat(64), mimeType: 'image/png' as const }
const captionAsset = { assetId: 'caption-asset', contentHash: 'c'.repeat(64), mimeType: 'text/vtt' as const }

const presentation = () => ({
  schemaVersion: 1 as const,
  video: videoAsset,
  poster: posterAsset,
  captions: [{
    asset: captionAsset,
    kind: 'captions' as const,
    srcLang: 'zh-CN',
    label: '简体中文',
    default: true,
  }],
  transcript: { language: 'zh-CN', text: '示例文字稿' },
  title: '示例视频',
})

const storedVideo = (overrides: Record<string, unknown> = {}) => ({
  id: videoAsset.assetId,
  objectKey: 'assets/video-asset.mp4',
  provider: 'local',
  mimeType: videoAsset.mimeType,
  sizeBytes: 10,
  sha256: digest,
  deletedAt: null,
  ...overrides,
})

const request = (method = 'GET', range?: string) => ({
  method,
  header: (name: string) => name.toLowerCase() === 'range' ? range : undefined,
})

const responseStream = () => {
  const stream = new PassThrough() as PassThrough & {
    status: ReturnType<typeof vi.fn>
    setHeader: ReturnType<typeof vi.fn>
  }
  let statusCode = 200
  const headers = new Map<string, string>()
  stream.status = vi.fn((code: number) => {
    statusCode = code
    return stream
  })
  stream.setHeader = vi.fn((name: string, value: string | number) => {
    headers.set(name.toLowerCase(), String(value))
    return stream
  })
  const chunks: Buffer[] = []
  stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)))
  return {
    stream,
    headers,
    status: () => statusCode,
    body: () => Buffer.concat(chunks),
  }
}

let tempDir = ''

beforeEach(async () => {
  vi.clearAllMocks()
  tempDir = await mkdtemp(path.join(os.tmpdir(), 'assessment-video-'))
  localPathRef.value = path.join(tempDir, 'video.mp4')
  await writeFile(localPathRef.value, Buffer.from('0123456789'))
  mockDb.storedAsset.findUnique.mockResolvedValue(storedVideo())
  mockGetCOSSignedUrl.mockResolvedValue('https://cos.example.test/video')
})

afterEach(async () => {
  await rm(tempDir, { recursive: true, force: true })
  vi.unstubAllGlobals()
})

describe('Assessment video contract', () => {
  it('binds video, poster, caption, and accessibility transcript without a mutable Video id', () => {
    const parsed = assessmentVideoPresentationSchema.parse(presentation())
    expect(parsed.video.assetId).toBe('video-asset')
    expect(parsed.captions?.[0]?.asset.mimeType).toBe('text/vtt')
    expect(parsed.transcript?.text).toBe('示例文字稿')
    expect(assessmentVideoPresentationAssetReferences(parsed).map((asset) => asset.assetId)).toEqual([
      'video-asset',
      'poster-asset',
      'caption-asset',
    ])
  })

  it('rejects mutable/external identities, unsupported video MIME, and multiple default tracks', () => {
    expect(assessmentVideoPresentationSchema.safeParse({
      ...presentation(),
      video: { ...videoAsset, assetId: 'https://example.com/video.mp4' },
    }).success).toBe(false)
    expect(assessmentVideoPresentationSchema.safeParse({
      ...presentation(),
      video: { ...videoAsset, mimeType: 'video/quicktime' },
    }).success).toBe(false)
    expect(assessmentVideoPresentationSchema.safeParse({
      ...presentation(),
      captions: [presentation().captions[0], { ...presentation().captions[0], asset: { ...captionAsset, assetId: 'caption-2' } }],
    }).success).toBe(false)
  })
})

describe('Assessment media capability', () => {
  it('signs exact scope, audience, kind, asset identity, and expiry without carrying recovery credentials', () => {
    const issued = createAssessmentMediaCapability({
      scopeId: 'attempt:123',
      audience: 'public',
      kind: 'video',
      asset: videoAsset,
      ttlSeconds: 60,
      nowSeconds: 100,
    })
    expect(issued.url).not.toContain('recovery')
    const verified = verifyAssessmentMediaCapability(issued.token, 120)
    expect(verified).toMatchObject({
      scopeId: 'attempt:123',
      audience: 'public',
      kind: 'video',
      asset: videoAsset,
      expiresAt: 160,
    })
  })

  it('rejects tampering, expiry, and kind/MIME mismatch', () => {
    const issued = createAssessmentMediaCapability({
      scopeId: 'attempt:123', audience: 'authenticated', kind: 'video', asset: videoAsset, ttlSeconds: 10, nowSeconds: 100,
    })
    expect(() => verifyAssessmentMediaCapability(`${issued.token}x`, 101)).toThrow()
    expect(() => verifyAssessmentMediaCapability(issued.token, 110)).toThrow(/expired/u)
    expect(() => createAssessmentMediaCapability({
      scopeId: 'attempt:123', audience: 'authenticated', kind: 'caption', asset: videoAsset,
    })).toThrow()
  })
})

describe('Assessment video Range delivery', () => {
  it.each([
    [undefined, null],
    ['bytes=0-3', { start: 0, end: 3 }],
    ['bytes=6-', { start: 6, end: 9 }],
    ['bytes=-4', { start: 6, end: 9 }],
    ['bytes=0-999', { start: 0, end: 9 }],
  ])('parses single range %s', (header, expected) => {
    expect(parseAssessmentSingleByteRange(header, 10)).toEqual(expected)
  })

  it.each(['items=0-1', 'bytes=10-11', 'bytes=4-2', 'bytes=0-1,4-5', 'bytes=-0'])('rejects invalid/multi range %s', (header) => {
    expect(() => parseAssessmentSingleByteRange(header, 10)).toThrow()
  })

  it('serves full local GET as 200 with seek headers', async () => {
    const issued = createAssessmentMediaCapability({ scopeId: 'a', audience: 'authenticated', kind: 'video', asset: videoAsset })
    const response = responseStream()
    const finished = new Promise<void>((resolve, reject) => {
      response.stream.once('finish', resolve)
      response.stream.once('error', reject)
    })
    await serveAssessmentMediaCapabilityContent({ token: issued.token, req: request() as never, res: response.stream as never, db: mockDb as never })
    await finished
    expect(response.status()).toBe(200)
    expect(response.headers.get('accept-ranges')).toBe('bytes')
    expect(response.headers.get('content-length')).toBe('10')
    expect(response.body().toString()).toBe('0123456789')
  })

  it('serves single-range GET as 206 and supports a later seek range with the same capability', async () => {
    const issued = createAssessmentMediaCapability({ scopeId: 'a', audience: 'public', kind: 'video', asset: videoAsset })
    for (const [rangeHeader, expectedBody, expectedContentRange] of [
      ['bytes=0-3', '0123', 'bytes 0-3/10'],
      ['bytes=6-9', '6789', 'bytes 6-9/10'],
    ] as const) {
      const response = responseStream()
      const finished = new Promise<void>((resolve, reject) => {
        response.stream.once('finish', resolve)
        response.stream.once('error', reject)
      })
      await serveAssessmentMediaCapabilityContent({
        token: issued.token,
        req: request('GET', rangeHeader) as never,
        res: response.stream as never,
        db: mockDb as never,
      })
      await finished
      expect(response.status()).toBe(206)
      expect(response.headers.get('content-range')).toBe(expectedContentRange)
      expect(response.body().toString()).toBe(expectedBody)
    }
  })

  it('returns 416 with Content-Range for unsatisfiable or multi-range requests', async () => {
    const issued = createAssessmentMediaCapability({ scopeId: 'a', audience: 'authenticated', kind: 'video', asset: videoAsset })
    for (const rangeHeader of ['bytes=99-100', 'bytes=0-1,4-5']) {
      const response = responseStream()
      await serveAssessmentMediaCapabilityContent({
        token: issued.token,
        req: request('GET', rangeHeader) as never,
        res: response.stream as never,
        db: mockDb as never,
      })
      expect(response.status()).toBe(416)
      expect(response.headers.get('content-range')).toBe('bytes */10')
    }
  })

  it('answers HEAD without streaming a body', async () => {
    const issued = createAssessmentMediaCapability({ scopeId: 'a', audience: 'authenticated', kind: 'video', asset: videoAsset })
    const response = responseStream()
    await serveAssessmentMediaCapabilityContent({
      token: issued.token,
      req: request('HEAD', 'bytes=2-5') as never,
      res: response.stream as never,
      db: mockDb as never,
    })
    expect(response.status()).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
    expect(response.headers.get('content-length')).toBe('4')
    expect(response.body().length).toBe(0)
  })

  it('fails closed when the StoredAsset identity no longer matches the signed frozen reference', async () => {
    mockDb.storedAsset.findUnique.mockResolvedValue(storedVideo({ sha256: 'd'.repeat(64) }))
    const issued = createAssessmentMediaCapability({ scopeId: 'a', audience: 'authenticated', kind: 'video', asset: videoAsset })
    await expect(serveAssessmentMediaCapabilityContent({
      token: issued.token,
      req: request() as never,
      res: responseStream().stream as never,
      db: mockDb as never,
    })).rejects.toMatchObject({ reason: 'IDENTITY_MISMATCH' })
  })

  it('proxies COS ranges while preserving the same outward 206 contract', async () => {
    mockDb.storedAsset.findUnique.mockResolvedValue(storedVideo({ provider: 'cos' }))
    const fetchMock = vi.fn().mockResolvedValue(new Response(new Uint8Array([2, 3, 4, 5]), { status: 206 }))
    vi.stubGlobal('fetch', fetchMock)
    const issued = createAssessmentMediaCapability({ scopeId: 'a', audience: 'public', kind: 'video', asset: videoAsset })
    const response = responseStream()
    const finished = new Promise<void>((resolve, reject) => {
      response.stream.once('finish', resolve)
      response.stream.once('error', reject)
    })
    await serveAssessmentMediaCapabilityContent({
      token: issued.token,
      req: request('GET', 'bytes=2-5') as never,
      res: response.stream as never,
      db: mockDb as never,
    })
    await finished
    expect(fetchMock).toHaveBeenCalledWith('https://cos.example.test/video', { headers: { Range: 'bytes=2-5' } })
    expect(response.status()).toBe(206)
    expect(response.headers.get('content-range')).toBe('bytes 2-5/10')
  })
})
