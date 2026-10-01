/** Local-only synthetic preview corpus. Does not connect to a database or publish anything. */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { listCognitiveRegistryEntries, requireCognitiveRegistryEntry } from '../../backend/src/modules/cognitive/cognitive.registry'
import { getCognitiveV2TaskDefinition } from '../../backend/src/modules/cognitive/v2/registry'
import { projectThreeLayerReport } from '../../backend/src/modules/cognitive/v2/report'
import { resolveParticipantPresentation } from '../../backend/src/modules/cognitive/participant-presentation'
import { mergeProfileConfig } from '../../backend/src/modules/cognitive/profile-freeze'
import { cognitiveSeeds } from '../../backend/src/modules/cognitive/generated/seeds'
import { sstSequence } from '../../backend/src/modules/cognitive/randomization'
import type { CognitiveProfile } from '../../backend/src/modules/cognitive/v2/types'

const output = process.argv[2]
if (!output) throw new Error('Usage: tsx report-reading-preview.ts <output-directory>')
mkdirSync(output, { recursive: true })
const tasksRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../backend/src/modules/cognitive/tasks')
const corpus: Array<{ key: string; label: string; synthetic: true; report: ReturnType<typeof projectThreeLayerReport> }> = []

const add = (key: string, label: string, testType: string, scoringVersion: string, input: { config: unknown; trials: unknown[]; randomSeed?: string }, profile: CognitiveProfile | null) => {
  const entry = requireCognitiveRegistryEntry(testType, '1.0.0', scoringVersion)
  const task = getCognitiveV2TaskDefinition(testType, '1.0.0', scoringVersion)!
  const scored = task.scorer(input as never)
  corpus.push({ key, label, synthetic: true, report: projectThreeLayerReport({
    testType, engineVersion: '1.0.0', scoringVersion, configVersion: scoringVersion, protocolSignature: 'synthetic-local-preview', profile,
    participantPresentation: resolveParticipantPresentation(entry), definition: task.report, metrics: scored.metrics, score: scored,
    metricDefinitions: task.metrics, qualityDefinitions: task.quality,
    reportCaveats: profile ? entry.profiles[profile]!.reportCaveats : ['模拟作答，用于开发视觉检查；非真实学生数据。'],
    trials: input.trials, config: input.config as Record<string, unknown>,
  }) })
}
const reactionEntry = requireCognitiveRegistryEntry('reaction', '1.0.0', '1.1.0')
const reactionSeed = cognitiveSeeds.find(s => s.testType === 'reaction' && s.configVersion === '1.1.0')!
const reactionConfig = mergeProfileConfig(reactionEntry, reactionSeed.config, 'standard')
const rts = [280, 305, 310, 295, 330, 315, 300, 290, null, 340, 325, 310, 300, 320, 355, 305, 295, 310, null, 335]
for (const state of ['valid', 'limited', 'insufficient', 'empty']) {
  add(`reaction-${state}`, `反应时 · ${state === 'valid' ? '有效' : state === 'limited' ? '中断' : state === 'insufficient' ? '5/20 有效' : '无有效记录'}`, 'reaction', '1.1.0', {
    config: reactionConfig, trials: rts.map((rtMs, trialIndex) => ({ trialIndex, payload: { foreperiodMs: 800, rtMs: state === 'empty' || state === 'insufficient' && trialIndex >= 5 ? null : rtMs, prematureCount: state === 'valid' && trialIndex === 4 ? 1 : 0, interrupted: state === 'limited' && trialIndex === 4, inputMode: 'pointer' } })),
  }, 'standard')
}
const memoryEntry = requireCognitiveRegistryEntry('memory', '1.0.0', '1.1.0')
const memorySeed = cognitiveSeeds.find(s => s.testType === 'memory' && s.configVersion === '1.1.0')!
const memoryConfig = mergeProfileConfig(memoryEntry, memorySeed.config, 'standard') as { startLength: number; maxLength: number }
const memoryTrials: unknown[] = []
for (let length = memoryConfig.startLength; length <= 7; length++) for (let attempt = 1; attempt <= 2; attempt++) {
  const sequence = Array.from({ length }, (_, i) => (i + length) % 10)
  memoryTrials.push({ trialIndex: memoryTrials.length, payload: { length, trialWithinLevel: attempt, sequence, response: length === 7 ? Array(length).fill(0) : sequence, responseDurationMs: length * 350, interrupted: false } })
}
add('memory-standard', '数字记忆 · 标准协议', 'memory', '1.1.0', { config: memoryConfig, trials: memoryTrials }, 'standard')
const sstEntry = requireCognitiveRegistryEntry('sst', '1.0.0', '1.0.0')
const sstSeed = cognitiveSeeds.find(s => s.testType === 'sst')!
for (const profile of ['experience', 'standard', 'research'] as const) {
  const config = mergeProfileConfig(sstEntry, sstSeed.config, profile) as { totalTrials: number; stopRatio: number; ssdStartMs: number; ssdStepMs: number; ssdMinMs: number; ssdMaxMs: number }
  const randomSeed = `report-preview-sst-${profile}`
  let ssd = config.ssdStartMs; let stopIndex = 0
  const trials = sstSequence(randomSeed, config.totalTrials, config.stopRatio).map((want, trialIndex) => {
    const stop = want.trialType === 'stop'; const success = stop && stopIndex++ % 2 === 1
    const payload = { ...want, response: success ? null : want.goStimulus, rtMs: success ? null : stop ? 300 : 420, ssdMs: stop ? ssd : null, stopSignalPresented: stop, interrupted: false }
    if (stop) ssd = Math.min(config.ssdMaxMs, Math.max(config.ssdMinMs, ssd + (success ? config.ssdStepMs : -config.ssdStepMs)))
    return { trialIndex, payload }
  })
  add(`sst-${profile}`, `停止信号 · ${profile === 'experience' ? '短程' : profile === 'standard' ? '标准' : '科研'}协议`, 'sst', '1.0.0', { config, trials, randomSeed }, profile)
}
for (const entry of listCognitiveRegistryEntries().filter(e => e.testType !== 'fake')) {
  const file = path.join(tasksRoot, entry.testType, 'fixtures', `${entry.engineVersion}-${entry.scoringVersion}.json`)
  const fixture = JSON.parse(readFileSync(file, 'utf8')).cases[0]
  add(`identity-${entry.testType}-${entry.scoringVersion}`, `${entry.name} · ${entry.scoringVersion}（回归样例）`, entry.testType, entry.scoringVersion, fixture.input, null)
}
writeFileSync(path.join(output, 'preview-corpus.json'), JSON.stringify(corpus, null, 2))
console.log(`Generated ${corpus.length} actual-scorer synthetic report previews`)
