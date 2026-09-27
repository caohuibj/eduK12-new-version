import { afterEach, describe, expect, it, vi } from 'vitest'

const load = async () => {
  vi.resetModules()
  return import('../../config/runtimeResources')
}

describe('runtime resource config', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('applies validated operator video/export/shutdown knobs', async () => {
    vi.stubEnv('VIDEO_RESOLUTION', '720p')
    vi.stubEnv('VIDEO_PRESET', 'faster')
    vi.stubEnv('VIDEO_CRF', '24')
    vi.stubEnv('VIDEO_BITRATE', '1200k')
    vi.stubEnv('VIDEO_AUDIO_BITRATE', '128k')
    vi.stubEnv('VIDEO_CONCURRENCY', '3')
    vi.stubEnv('EXPORT_CONCURRENCY', '2')
    vi.stubEnv('WORKER_SHUTDOWN_TIMEOUT_SECONDS', '45')
    const { runtimeResourceConfig } = await load()
    expect(runtimeResourceConfig).toMatchObject({
      videoResolution: '720p',
      videoPreset: 'faster',
      videoCrf: 24,
      videoBitrate: '1200k',
      videoAudioBitrate: '128k',
      videoConcurrency: 3,
      exportConcurrency: 2,
      workerShutdownTimeoutSeconds: 45,
    })
  })

  it('fails closed on invalid resource configuration instead of silently falling back', async () => {
    vi.stubEnv('VIDEO_CONCURRENCY', '500')
    await expect(load()).rejects.toThrow(/VIDEO_CONCURRENCY/)
  })
})
