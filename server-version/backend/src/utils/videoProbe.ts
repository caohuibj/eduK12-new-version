import { spawn } from 'node:child_process'
import { registerWorkerSubprocess, workerShutdownCancellationRequested, WorkerShutdownCancellationError } from '../workers/workerSubprocessRegistry'

export type VideoProbeMetadata = { streams: Array<{ codec_type?: string; codec_name?: string; width?: number; height?: number }>; format?: { duration?: number | string } }
/** Resolve only after real subprocess close, including timeout/shutdown kills. */
export function probeVideo(file: string, timeoutMs = 30_000): Promise<VideoProbeMetadata> {
  if (workerShutdownCancellationRequested()) return Promise.reject(new WorkerShutdownCancellationError())
  return new Promise((resolve, reject) => {
    const child = spawn(process.env.FFPROBE_PATH || 'ffprobe', ['-v', 'error', '-show_entries', 'stream=codec_type,codec_name,width,height:format=duration', '-of', 'json', file], { stdio: ['ignore', 'pipe', 'pipe'] })
    let output = '', failure: Error | undefined, hardKill: ReturnType<typeof setTimeout> | undefined
    let closed!: () => void
    const tracked = new Promise<void>(done => { closed = done })
    const stop = (reason: Error) => {
      failure ??= reason
      child.kill('SIGTERM')
      hardKill ??= setTimeout(() => child.kill('SIGKILL'), 2_000)
      hardKill.unref?.()
    }
    const unregister = registerWorkerSubprocess('video-probe', signal => child.kill(signal), tracked)
    const timer = setTimeout(() => stop(new Error('视频探测超时')), timeoutMs)
    timer.unref?.()
    child.stdout.on('data', (chunk: Buffer) => {
      if (failure) return
      if (Buffer.byteLength(output) + chunk.length > 64 * 1024) stop(new Error('视频探测结果超过限制'))
      else output += chunk.toString('utf8')
    })
    child.stderr.resume()
    child.once('error', error => { failure = error })
    child.once('close', code => {
      clearTimeout(timer); if (hardKill) clearTimeout(hardKill)
      unregister(); closed()
      if (workerShutdownCancellationRequested()) return reject(new WorkerShutdownCancellationError())
      if (failure || code !== 0) return reject(failure || new Error('视频探测失败'))
      try {
        const data = JSON.parse(output)
        if (!Array.isArray(data.streams)) throw new Error('视频探测结果无效')
        resolve(data)
      } catch (error) { reject(error) }
    })
  })
}
