import { describe, it, expect } from 'vitest'
import { readFileSync } from 'node:fs'
import { createHash } from 'node:crypto'
import { resolve } from 'node:path'
import { createVoiceSnapshot } from '../../modules/cognitive/content-candidates/voice-emotion-cues/package'
import { config, plan, observe, manifest, type Raw, type Plan, type Choice } from '../../modules/cognitive/content-candidates/voice-emotion-cues/protocol'
import { VOICE_ASSETS, MATERIALS_HASH } from '../../modules/cognitive/content-candidates/voice-emotion-cues/materials'
import { scoreVoice, envelope } from '../../modules/cognitive/content-candidates/voice-emotion-cues/scorer'
import { projectReport, isPublicReport, reportText } from '../../modules/cognitive/content-candidates/voice-emotion-cues/report'
import { scoreVoiceSubmission } from '../../modules/cognitive/content-candidates/voice-emotion-cues/submission'
import { computeConfigSnapshotHash as digest } from '../../modules/cognitive/v2/canonical'
const seed = 'voice-synthetic-research'
function raw(p: Plan, choice: Choice = p.emotion, rt = 100): Raw {
  const t = p.index * 10000
  return { plan: p, startedAtPerfMs: t, endedAtPerfMs: t + 5000 + rt, events: [{ kind: 'play', at: t }, { kind: 'ended', at: t + 5000 }, { kind: 'down', at: t + 5000, token: 'touch:1', choice, input: 'touch' }, { kind: 'up', at: t + 5000 + rt, token: 'touch:1', choice, input: 'touch' }] }
}
function score(rows: Raw[], profile: 'research' | 'experience' = 'experience') { const session = createVoiceSnapshot(profile); return scoreVoice({ session, config: session.config, randomSeed: seed, trials: rows.map(envelope) }) }
describe('voice emotion candidate authority', () => {
  it('freezes 24 cells, four research speakers and disjoint practice; verifies all actual original WAV bytes and material hashes', () => {
    expect(digest(VOICE_ASSETS)).toBe(MATERIALS_HASH)
    for (const profile of ['experience', 'research'] as const) {
      const c = config(profile), rows = plan(c, seed)
      expect(rows).toEqual(plan(c, seed)); expect(plan(c, 'different seed')).not.toEqual(rows)
      expect(rows).toHaveLength(c.totalTrials); expect(new Set(rows.map(p => p.assetId)).size).toBe(c.totalTrials)
      expect(new Set(rows.map(p => p.condition)).size).toBe(24)
      for (let b = 0; b < c.totalTrials / 24; b++) expect(new Set(rows.filter(p => p.block === b).map(p => p.condition)).size).toBe(24)
      for (const condition of new Set(rows.map(p => p.condition))) expect(new Set(rows.filter(p => p.condition === condition).map(p => p.actor)).size).toBe(profile === 'research' ? 4 : 1)
      for (const actor of [1, 2, 3, 4]) expect(rows.filter(p => p.actor === actor)).toHaveLength(c.totalTrials / 4)
      for (let r = 0; r < 2; r++) expect(plan(c, seed, 'practice', r).every(p => p.actor === r + 5 && !rows.some(t => t.assetId === p.assetId))).toBe(true)
    }
    for (const a of VOICE_ASSETS) {
      const bytes = readFileSync(resolve('../frontend/src/modules/cognitive/tasks/voice-emotion-cues/recordings', a.file))
      expect(bytes.length).toBe(a.bytes); expect(createHash('sha256').update(bytes).digest('hex')).toBe(a.sha256)
      expect(bytes.subarray(0, 4).toString()).toBe('RIFF'); expect(bytes.subarray(8, 12).toString()).toBe('WAVE')
    }
    expect(() => plan({ ...config('experience'), totalTrials: 12 }, seed)).toThrow()
  })
  it('uses first completed fresh activation; preserves true zero, none/skip/interruption, null, signed differences and three-state public allowlists', () => {
    const ps = plan(config('experience'), seed), rows = ps.map(p => raw(p)), all = projectReport(score(rows))
    expect(all).toMatchObject({ state: 'interpretable', overall: { matched: 24, total: 24 } })
    const early = raw(ps[0]); early.events = [{ kind: 'down', at: 0, choice: ps[0].emotion, input: 'keyboard', token: 'Enter' }, { kind: 'play', at: 1 }, { kind: 'ended', at: 5000 }, { kind: 'up', at: 5010, choice: ps[0].emotion, input: 'keyboard', token: 'Enter' }, { kind: 'activate', at: 5100, choice: 'none', input: 'assistive' }]
    expect(observe(early)).toMatchObject({ choice: 'none', responseAt: 5100, outcome: 'answered' })
    const zero = score(ps.map(p => raw(p, 'none', 0)))
    expect(zero.quality.state).toBe('interpretable'); expect(zero.metrics.medianPostPlaybackMs).toBe(0); expect(projectReport(zero).overall).toEqual({ matched: 0, total: 24 })
    for (const positive of [false, true]) {
      const v = score(ps.map(p => raw(p, (p.intensity === 'strong') === positive ? p.emotion : 'none')))
      expect(v.metrics.signedStrongMinusNormal).toBe(positive ? 1 : -1)
    }
    const missingIndex = rows.findIndex(r => r.plan.intensity === 'normal'), missing = structuredClone(rows)
    missing[missingIndex] = { ...missing[missingIndex], events: [{ kind: 'skip', at: missing[missingIndex].endedAtPerfMs }] }
    const partial = projectReport(score(missing)); expect(partial).toMatchObject({ state: 'limited', overall: null, intensity: { normal: null, strong: { matched: 12, total: 12 } } })
    expect(reportText(partial)).not.toContain('24/24'); expect(() => reportText({ ...partial, confusion: {} })).toThrow()
    expect(isPublicReport({ ...partial, completed: 12, skipped: 12, intensity: { normal: { matched: 1, total: 12 }, strong: { matched: 1, total: 12 } } })).toBe(false)
    const invalid = projectReport(score([])); expect(invalid).toMatchObject({ state: 'invalid', overall: null, completed: 0, intensity: { normal: null, strong: null } }); expect(reportText(invalid)).not.toContain('你的0/')
    expect(score([]).metrics.observedProportion).toBeNull(); expect(score([]).metrics.medianPostPlaybackMs).toBeNull()
    expect(isPublicReport({ ...invalid, overall: { matched: 0, total: 0 } })).toBe(false)
    const interrupted = structuredClone(rows); interrupted[0] = { ...interrupted[0], events: [{ kind: 'play', at: 0 }, { kind: 'interrupt', at: 5100, reason: 'hidden' }] }; expect(score(interrupted).quality.state).toBe('limited')
    const tampered = structuredClone(rows); tampered[0].events.push({ kind: 'activate', at: tampered[0].endedAtPerfMs, input: 'assistive', choice: 'none' }); expect(() => score(tampered)).toThrow()
    const identity = structuredClone(rows); identity[0].plan.actor = 24; expect(() => score(identity)).toThrow()
  })
  it('accepts an exact 96-trial FINAL with real practice records and rejects forged completion, crossed realms, missing practice and post-freeze mutations', () => {
    const session = createVoiceSnapshot('research'), plans = manifest(session.config, seed), contextKey = 'voice-backend-synthetic', realm = { timeOriginMs: 12345, pageInstanceId: 'synthetic-page' }, mh = digest(plans)
    const records = [...plans.practice[0], ...plans.formal].map((p, index) => {
      const r = raw(p); const shift = index * 10000 - p.index * 10000; r.startedAtPerfMs += shift; r.endedAtPerfMs += shift; r.events.forEach(e => e.at += shift)
      const d = { contextKey, language: 'zh' as const, configHash: session.configHash, protocolSignature: session.protocolSignature, manifestHash: mh, realm, recordKey: `${p.phase}:${p.round}:${p.index}`, raw: r }; return { ...d, recordDigest: digest(d) }
    })
    const base = { contextKey, language: 'zh' as const, configHash: session.configHash, protocolSignature: session.protocolSignature, manifestHash: mh, recordDigests: records.map(r => r.recordDigest), formalCount: 96, practiceCount: 3, termination: 'completed', terminationReason: null }
    const call = { contextKey, language: 'zh' as const, session, randomSeed: seed, realm, drafts: records, claim: { ...base, finalPayloadDigest: digest(base) } }
    expect(scoreVoiceSubmission(call).report).toMatchObject({ state: 'interpretable', overall: { matched: 96, total: 96 } })
    expect(() => scoreVoiceSubmission({ ...call, language: 'en' })).toThrow()
    expect(() => scoreVoiceSubmission({ ...call, realm: { ...realm, pageInstanceId: 'another' } })).toThrow()
    expect(() => scoreVoiceSubmission({ ...call, drafts: records.slice(3) })).toThrow()
    const forged = structuredClone(call); forged.session.config.reportDefinitionVersion = 'another'; expect(() => scoreVoiceSubmission(forged)).toThrow()
    const changed = structuredClone(call); changed.drafts[4].raw.events[0].at++; expect(() => scoreVoiceSubmission(changed)).toThrow()
  })
})
