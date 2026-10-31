import { z } from 'zod'

/**
 * COG-Intelligence Roadmap v2.0 PR5 — calibrationVersion 快照 schema。
 *
 * 规则（roadmap §二/§三）：
 *  - 标定参数以 calibrationVersion 独立版本化、只追加，不覆盖原始作答。
 *  - status 是证据状态：SIMULATION_ONLY（仿真验证，禁止进入任何被试报告
 *    或参考带）→ PILOT_CALIBRATED（真实试测样本标定）→ VALIDATED
 *    （含 DIF/局部依赖检查，roadmap B2 完成后才可由使用方升入）。
 *  - bank-meta 的 calibrationRef 只允许引用非 SIMULATION_ONLY 的快照
 *    （当前仓库尚无真实数据集，故不应出现引用）。
 */

export const calibrationStatusValues = ['SIMULATION_ONLY', 'PILOT_CALIBRATED', 'VALIDATED'] as const
export type CalibrationStatus = (typeof calibrationStatusValues)[number]

export const calibrationItemSchema = z
  .object({
    itemId: z.string().min(1),
    a: z.number().finite(),
    b: z.number().finite(),
    pCorrect: z.number().min(0).max(1).optional(),
    itemTotalR: z.number().finite().optional(),
    trueA: z.number().finite().optional(),
    trueB: z.number().finite().optional(),
  })
  .strict()

export const calibrationSnapshotSchema = z
  .object({
    schemaVersion: z.literal(1),
    calibrationVersion: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*$/),
    status: z.enum(calibrationStatusValues),
    model: z.enum(['1PL', '2PL']),
    estimation: z.string().min(1),
    seed: z.number().int().optional(),
    sample: z
      .object({
        n: z.number().int().positive(),
        itemCount: z.number().int().positive(),
        population: z.string().min(1),
      })
      .strict(),
    items: z.array(calibrationItemSchema).min(1),
    diagnostics: z.record(z.string(), z.unknown()),
    generatedAtUtc: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    provenance: z.string().min(1),
  })
  .strict()
  .refine(
    (snapshot) => snapshot.status !== 'SIMULATION_ONLY' || snapshot.provenance.includes('SIMULATION ONLY'),
    { message: 'SIMULATION_ONLY snapshots must carry an explicit simulation provenance', path: ['provenance'] },
  )
  .refine(
    (snapshot) => snapshot.status === 'SIMULATION_ONLY' || snapshot.items.every((item) => item.trueA === undefined && item.trueB === undefined),
    { message: 'true generating parameters only exist in simulation snapshots', path: ['items'] },
  )

export type CalibrationItem = z.infer<typeof calibrationItemSchema>
export type CalibrationSnapshot = z.infer<typeof calibrationSnapshotSchema>

/** bank-meta.calibrationRef 是否允许引用该快照（roadmap：仿真快照不得进入题库引用）。 */
export const isCalibrationReferenceAllowed = (snapshot: CalibrationSnapshot): boolean =>
  snapshot.status !== 'SIMULATION_ONLY'
