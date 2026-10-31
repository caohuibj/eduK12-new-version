import { describe, expect, it } from 'vitest'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { calibrationSnapshotSchema, isCalibrationReferenceAllowed } from '../../modules/cognitive/banks/calibration-snapshot-schema'
import { cognitiveBankMetaSchema } from '../../modules/cognitive/banks/bank-meta'

/**
 * COG-Intelligence Roadmap v2.0 PR5 — 标定快照与证据纪律。
 * 提交入库的仿真快照验证管线正确性（参数回收）；真实标定在 B1 试测样本
 * 到位后用同一管线（--input）产出。
 */
const SNAPSHOT_PATH = path.resolve('../tools/irt-calibration/calibration-snapshot.json')

describe('IRT calibration snapshot (roadmap v2.0 PR5)', () => {
  const snapshot = calibrationSnapshotSchema.parse(JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')))

  it('validates the committed simulation snapshot with recovery diagnostics', () => {
    expect(snapshot.status).toBe('SIMULATION_ONLY')
    expect(snapshot.model).toBe('2PL')
    expect(snapshot.sample).toMatchObject({ n: 1000, itemCount: 20 })
    expect(snapshot.items).toHaveLength(20)
    const recovery = snapshot.diagnostics.parameterRecovery as { rA: number; rB: number; rmseB: number }
    expect(recovery.rA).toBeGreaterThanOrEqual(0.8)
    expect(recovery.rB).toBeGreaterThanOrEqual(0.9)
    expect(recovery.rmseB).toBeLessThanOrEqual(0.4)
  })

  it('keeps simulation snapshots out of bank references and reports', () => {
    expect(isCalibrationReferenceAllowed(snapshot)).toBe(false)
    expect(() =>
      cognitiveBankMetaSchema.parse({
        stimulusSetVersion: 'matgen-bank-v1.0.0',
        source: 'generated',
        license: 'internal-generated',
        calibrationRef: { calibrationVersion: snapshot.calibrationVersion },
      }),
    ).not.toThrow() // schema 层不做状态判定；引用许可由 isCalibrationReferenceAllowed 消费方把关
    expect(isCalibrationReferenceAllowed({ ...snapshot, status: 'PILOT_CALIBRATED', provenance: 'real sample' })).toBe(true)
    expect(isCalibrationReferenceAllowed({ ...snapshot, status: 'VALIDATED', provenance: 'real sample' })).toBe(false)
    expect(isCalibrationReferenceAllowed({
      ...snapshot, status: 'VALIDATED', provenance: 'real sample', evidenceReviewRef: 'scientific-review/pilot1',
    })).toBe(true)
  })

  it('requires independent evidence identity before declaring VALIDATED', () => {
    const base = JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8'))
    base.items = base.items.map(({ trueA: _a, trueB: _b, ...item }: Record<string, unknown>) => item)
    base.status = 'VALIDATED'
    base.provenance = 'real pilot data'
    expect(calibrationSnapshotSchema.safeParse(base).success).toBe(false)
    base.evidenceReviewRef = 'scientific-review/pilot1'
    expect(calibrationSnapshotSchema.safeParse(base).success).toBe(true)
  })

  it('rejects true-parameter leakage into non-simulation snapshots', () => {
    const leaking = { ...JSON.parse(readFileSync(SNAPSHOT_PATH, 'utf8')), status: 'PILOT_CALIBRATED', provenance: 'real sample' }
    expect(calibrationSnapshotSchema.safeParse(leaking).success).toBe(false)
  })
})
