import { asset, type Plan } from './generated/protocol'
import { digestBytes } from './contracts'
const urls = import.meta.glob('./recordings/*.wav', { eager: true, query: '?url', import: 'default' }) as Record<string, string>
export interface LoadedVoice { url: string; sha256: string; dispose(): void }
export type MediaLoader = (plan: Plan, signal: AbortSignal) => Promise<LoadedVoice>
/** Ordinary asset integrity/loading, not a hearing or timing preflight. */
export const loadVoice: MediaLoader = async (p, signal) => {
  const a = asset(p.assetId), url = urls['./recordings/' + a.file]
  if (!url) throw Error('Missing voice recording')
  const response = await fetch(url, { signal })
  if (!response.ok) throw Error('Voice recording unavailable')
  const bytes = new Uint8Array(await response.arrayBuffer())
  if (signal.aborted || bytes.length !== a.bytes || digestBytes(bytes) !== a.sha256) throw Error('Voice recording integrity mismatch')
  const objectUrl = URL.createObjectURL(new Blob([bytes], { type: 'audio/wav' }))
  return { url: objectUrl, sha256: a.sha256, dispose: () => URL.revokeObjectURL(objectUrl) }
}
