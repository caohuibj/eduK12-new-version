/**
 * 轻量 Web Audio 管线：听觉任务共用（纯音合成，无音频素材文件）。
 *
 * 浏览器要求 AudioContext 在用户手势后才能出声；prepareAudioContext 必须在
 * 点击/按键等手势事件内调用。刺激调度（何时播什么）由种子确定性生成，
 * 本模块只负责"发声"这一渲染层，不参与计分事实。
 */

export interface CognitiveAudio {
  context: AudioContext
  /** baseLatency + outputLatency（毫秒；环境未上报时为 null），随试次留痕供审查。 */
  latencyMs: number | null
}

let cached: CognitiveAudio | null = null

export const prepareAudioContext = async (): Promise<CognitiveAudio | null> => {
  if (cached) {
    if (cached.context.state === 'suspended') {
      try { await cached.context.resume() } catch { /* 保持已缓存实例 */ }
    }
    return cached
  }
  try {
    const ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
    if (!ctor) return null
    const context = new ctor()
    if (context.state === 'suspended') {
      try { await context.resume() } catch { /* 交给下一次手势 */ }
    }
    const base = typeof context.baseLatency === 'number' && Number.isFinite(context.baseLatency) ? context.baseLatency : 0
    const output = (context as AudioContext & { outputLatency?: number }).outputLatency
    const latencyMs = typeof output === 'number' && Number.isFinite(output)
      ? Math.round((base + output) * 1000)
      : base > 0 ? Math.round(base * 1000) : null
    cached = { context, latencyMs }
    return cached
  } catch {
    return null
  }
}

/** 播放一次纯音：sine 波 + 10ms 起音 / 40ms 收音包络，避免咔哒声。 */
export const playTone = (audio: CognitiveAudio, frequencyHz: number, durationMs: number, delayMs = 0): void => {
  const { context } = audio
  const startAt = context.currentTime + delayMs / 1000
  const attackS = 0.01
  const releaseS = 0.04
  const durationS = durationMs / 1000
  const oscillator = context.createOscillator()
  const gain = context.createGain()
  oscillator.type = 'sine'
  oscillator.frequency.setValueAtTime(frequencyHz, startAt)
  gain.gain.setValueAtTime(0.0001, startAt)
  gain.gain.exponentialRampToValueAtTime(0.5, startAt + attackS)
  gain.gain.setValueAtTime(0.5, startAt + Math.max(attackS, durationS - releaseS))
  gain.gain.exponentialRampToValueAtTime(0.0001, startAt + durationS)
  oscillator.connect(gain)
  gain.connect(context.destination)
  oscillator.start(startAt)
  oscillator.stop(startAt + durationS + 0.05)
}
