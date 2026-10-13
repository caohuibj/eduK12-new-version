import { afterEach, describe, expect, it, vi } from 'vitest'
import { mkdtemp, writeFile, chmod, rm } from 'node:fs/promises'
import path from 'node:path'
import { tmpdir } from 'node:os'
import { probeVideo } from '../../utils/videoProbe'
import { activeWorkerSubprocessCount } from '../../workers/workerSubprocessRegistry'
const dirs: string[] = []
afterEach(async () => { vi.unstubAllEnvs(); await Promise.all(dirs.splice(0).map(dir => rm(dir, { recursive: true, force: true }))) })
async function executable(script: string) {
  const dir = await mkdtemp(path.join(tmpdir(), 'probe-lifecycle-')); dirs.push(dir)
  const file = path.join(dir, 'probe')
  await writeFile(file, '#!/usr/bin/env node\n'+script); await chmod(file, 0o700)
  vi.stubEnv('FFPROBE_PATH', file)
}
describe('bounded real ffprobe subprocess lifecycle', () => {
  it('returns bounded metadata after the real child closes', async () => {
    await executable(`console.log(JSON.stringify({streams:[{codec_type:'video',codec_name:'h264',width:640,height:480}],format:{duration:12}}))`)
    expect(await probeVideo('/synthetic/local-file')).toMatchObject({ format: { duration: 12 } })
    expect(activeWorkerSubprocessCount()).toBe(0)
  })
  it('retains ownership through timeout and SIGKILL until a TERM-ignoring child actually exits', async () => {
    await executable(`process.on('SIGTERM',()=>{});setInterval(()=>{},50)`)
    const pending = probeVideo('/synthetic/local-file', 250)
    await new Promise(resolve => setTimeout(resolve, 300))
    expect(activeWorkerSubprocessCount()).toBe(1)
    await expect(pending).rejects.toThrow('超时')
    expect(activeWorkerSubprocessCount()).toBe(0)
  })
  it('fails closed on oversized output and invalid/missing metadata', async () => {
    await executable(`process.stdout.write('x'.repeat(100000))`)
    await expect(probeVideo('/synthetic/local-file')).rejects.toThrow()
    expect(activeWorkerSubprocessCount()).toBe(0)
  })
})
