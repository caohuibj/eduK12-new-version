type MetricsDatabase = { $metrics?: { prometheus: () => Promise<string> } }
type QueueCounts = { getJobCounts: (...states: string[]) => Promise<object> }
const allowed = /^prisma_(?:client_queries|datasource_queries|pool_connections)[a-z_]*(?:\{[^\n]*\})? /
/** Engine metrics contain only numeric pool/query aggregates, never SQL or data. */
export const prismaPoolMetricLines = async (db: MetricsDatabase): Promise<string[]> => {
  try {
    if (!db.$metrics) throw new Error('Unavailable')
    const text = await db.$metrics.prometheus()
    return ['ptool_prisma_pool_metrics_available 1', ...text.split('\n').filter(line => allowed.test(line))]
  } catch { return ['ptool_prisma_pool_metrics_available 0'] }
}
/** One refresh at a time, even across Redis outages; scrapes never accumulate offline commands. */
export const createQueueMetricSampler = (queues: Record<string, QueueCounts>, timeoutMs = 500) => {
  let inFlight: Promise<string[]> | undefined
  let cached: string[] = ['ptool_bull_metrics_available 0']
  let updated = 0
  return async (): Promise<string[]> => {
    if (!inFlight && Date.now() - updated >= 5000) {
      inFlight = Promise.all(Object.entries(queues).map(async ([name, queue]) => {
        const counts = await queue.getJobCounts('waiting', 'active', 'delayed', 'failed')
        return Object.entries(counts).filter(([state, value]) => ['waiting', 'active', 'delayed', 'failed'].includes(state) && Number.isSafeInteger(value) && value >= 0)
          .map(([state, value]) => `ptool_bull_jobs{queue="${name}",state="${state}"} ${value}`)
      })).then(rows => ['ptool_bull_metrics_available 1', ...rows.flat()], () => ['ptool_bull_metrics_available 0'])
        .then(lines => { cached = lines; updated = Date.now(); return lines })
        .finally(() => { inFlight = undefined })
    }
    if (!inFlight) return cached
    let timer: ReturnType<typeof setTimeout> | undefined
    try { return await Promise.race([inFlight, new Promise<string[]>(resolve => { timer = setTimeout(() => resolve(['ptool_bull_metrics_available 0']), timeoutMs) })]) }
    finally { if (timer) clearTimeout(timer) }
  }
}
