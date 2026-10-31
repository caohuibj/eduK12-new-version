import { z } from 'zod'

/**
 * COG-Intelligence Roadmap v2.0 PR2 — matRiks 离线生成题库的 JSON schema。
 *
 * 生成物由 tools/matrix-generation/generate-matrices.R 离线产出并提交入库；
 * 运行时只读取（渲染 + 服务端正确性推导），R 不进请求链路。
 * 题库授权元数据由 PR1 的 banks/bank-meta.ts 承载（消费方合并声明）。
 */

export const matrixCellSvgSchema = z.string().refine(
  (value) => value.startsWith('<svg') && value.includes('</svg>') && !value.includes('>NA<'),
  { message: 'malformed cell svg' },
)

export const matrixResponseSchema = z.object({
  name: z.enum([
    'correct',
    'r_diag', 'r_left', 'r_top',
    'wp_copy', 'wp_matrix', 'difference',
    'ic_neg', 'ic_flip', 'ic_size', 'ic_inc',
  ]),
  svg: matrixCellSvgSchema,
})

export const matrixBankItemSchema = z
  .object({
    itemId: z.string().regex(/^matgen-(child|std)-[a-z]+(-[a-z]+)?-\d{3}$/),
    matrixType: z.enum(['2x2', '3x3']),
    hrules: z.enum(['identity', 'shape', 'rotate', 'shade', 'size']),
    vrules: z.enum(['identity', 'shape', 'rotate', 'shade', 'size']),
    ruleTags: z.array(z.enum(['identity', 'shape', 'rotate', 'shade', 'size'])).min(1),
    cells: z.array(matrixCellSvgSchema),
    responses: z.array(matrixResponseSchema).min(7),
    correctResponseIndex: z.literal(0),
  })
  .strict()
  .refine((item) => {
    const shown = item.matrixType === '2x2' ? 3 : 8
    return item.cells.length === shown
  }, { message: 'cells must exclude the query cell (8 for 3x3, 3 for 2x2)', path: ['cells'] })

export const matrixBankFileSchema = z
  .object({
    schemaVersion: z.literal(1),
    generator: z.string().min(1),
    seed: z.number().int(),
    generatedAtUtc: z.string().regex(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/),
    provenance: z.string().min(1),
    coverage: z.object({
      byMatrixType: z.record(z.string(), z.number().int()),
      byRuleTag: z.record(z.string(), z.number().int()),
      failedPlans: z.array(z.string()),
    }),
    items: z.array(matrixBankItemSchema).min(12),
  })
  .strict()

export type MatrixResponse = z.infer<typeof matrixResponseSchema>
export type MatrixBankItem = z.infer<typeof matrixBankItemSchema>
export type MatrixBankFile = z.infer<typeof matrixBankFileSchema>
