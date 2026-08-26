import { describe, expect, it } from 'vitest'
import { isPublicAddress, validateRemoteUrl } from '../../utils/videoDownloader'

describe('video downloader SSRF guard', () => {
  it('accepts public unicast addresses', () => {
    expect(isPublicAddress('8.8.8.8')).toBe(true)
    expect(isPublicAddress('2001:4860:4860::8888')).toBe(true)
  })

  it('rejects private, loopback, link-local, and unspecified addresses', () => {
    for (const address of [
      '10.0.0.1',
      '172.16.0.1',
      '192.168.1.1',
      '127.0.0.1',
      '169.254.169.254',
      '0.0.0.0',
      '::1',
      'fc00::1',
      'fe80::1',
    ]) {
      expect(isPublicAddress(address), address).toBe(false)
    }
  })

  it('rejects a URL that resolves to a private address', async () => {
    await expect(validateRemoteUrl('http://127.0.0.1/video.mp4')).rejects.toThrow(/非公网地址/)
  })

  it('rejects credentials and non-standard ports before any download', async () => {
    await expect(validateRemoteUrl('https://user:pass@example.com/video.mp4')).rejects.toThrow(/凭据/)
    await expect(validateRemoteUrl('http://example.com:8080/video.mp4')).rejects.toThrow(/端口/)
  })
})
