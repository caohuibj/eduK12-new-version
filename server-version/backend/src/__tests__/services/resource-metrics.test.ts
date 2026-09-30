import { expect, it, vi } from 'vitest'
import { createQueueMetricSampler, prismaPoolMetricLines } from '../../services/resourceMetrics'
it('exposes actual engine pool and wait metrics without arbitrary text', async () => {
  const lines = await prismaPoolMetricLines({ $metrics: { prometheus: async () => 'prisma_pool_connections_busy 3\nprisma_client_queries_wait 2\nsecret_token 123\n# private text' } })
  expect(lines).toContain('prisma_pool_connections_busy 3')
  expect(lines).toContain('prisma_client_queries_wait 2')
  expect(lines.join(' ')).not.toMatch(/secret|private/)
  expect(await prismaPoolMetricLines({})).toEqual(['ptool_prisma_pool_metrics_available 0'])
})
it('does not queue unbounded Redis work during a stuck refresh and recovers later', async () => {
  let resolve!: (value: Record<string, number>) => void
  const queue = { getJobCounts: vi.fn(() => new Promise<Record<string, number>>(r => { resolve = r })) }
  const sample = createQueueMetricSampler({ export: queue }, 5)
  await Promise.all(Array.from({ length: 10 }, () => sample()))
  expect(queue.getJobCounts).toHaveBeenCalledTimes(1)
  resolve({ waiting: 2, active: 1, secret: 77 })
  await new Promise(r => setTimeout(r, 0))
  const lines = await sample()
  expect(lines).toContain('ptool_bull_jobs{queue="export",state="waiting"} 2')
  expect(lines.join(' ')).not.toContain('secret')
})
