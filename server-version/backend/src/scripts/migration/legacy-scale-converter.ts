/**
 * Convert a legacy ptool scale (config JSON + scale_items + dimensions +
 * item_dimensions) into the new ScaleDefinitionV2 JSON shape.
 *
 * Faithful-content rules:
 * - response sets come from legacy config.labels (value = numeric score);
 * - reverse items are preserved via the V2 `reverse` transform (the scorer
 *   derives the inverted value from the response set, matching the legacy
 *   `points - value` behaviour for symmetric sets);
 * - legacy dimensions become V2 `dimension` scores fed by item weights
 *   (legacy scoring_method 'sum' with per-item weights from item_dimensions);
 * - report content is minimal and explicitly descriptive: the migrated scale
 *   is a content shell whose historical RESULTS stay in the legacy archive
 *   and are never re-scored by the new engine.
 */

export interface LegacyScaleRow {
  id: string
  code: string
  name: string
  description: string | null
  config: Record<string, unknown> | null
  estimated_time: number | null
  instruction: string | null
  tags: string[] | null
}

export interface LegacyScaleItemRow {
  item_code: string
  content: string
  type: string
  reverse: boolean
  required: boolean
  weight: string | number
  sort_order: number
  options: Array<{ label?: string; value?: number | string }> | null
  randomize_options: boolean
}

export interface LegacyDimensionRow {
  id: string
  code: string
  name: string
  description: string | null
  scoring_method: string | null
  weight: string | number
}

export interface LegacyItemDimensionRow {
  item_id: string
  dimension_id: string
  weight: string | number
  reverse: boolean
}

export interface LegacyScaleInputs {
  scale: LegacyScaleRow
  items: LegacyScaleItemRow[]
  dimensions: LegacyDimensionRow[]
  itemDimensions: (LegacyItemDimensionRow & { item_code: string })[]
}

const num = (v: unknown): number | null => {
  if (v === null || v === undefined) return null
  const n = typeof v === 'number' ? v : Number(v)
  return Number.isFinite(n) ? n : null
}

export const convertLegacyScaleDefinition = (inputs: LegacyScaleInputs): Record<string, unknown> => {
  const { scale, items, dimensions, itemDimensions } = inputs
  const config = (scale.config ?? {}) as {
    labels?: Array<{ label?: string; value?: number | string }>
    randomizeItems?: boolean
  }

  const labels = Array.isArray(config.labels) && config.labels.length > 0
    ? config.labels
    : (items[0]?.options ?? [])
  const responseSetKey = `legacy_${scale.code}_0_5`.replace(/[^a-z0-9_]/gi, '_').toLowerCase()
  const responseSets = [{
    key: responseSetKey,
    options: labels
      .map((entry) => ({
        value: String(entry.value),
        label: String(entry.label ?? entry.value),
        score: num(entry.value) ?? 0,
      }))
      .filter((o) => o.label.length > 0),
  }].filter((set) => set.options.length >= 2)

  const sortedItems = [...items].sort((a, b) => a.sort_order - b.sort_order)
  const definitionItems = sortedItems.map((item) => ({
    itemCode: item.item_code,
    content: item.content,
    type: item.type || 'single',
    required: item.required,
    sortOrder: item.sort_order,
    responseSetKey: responseSets[0]?.key ?? responseSetKey,
    randomizeOptions: item.randomize_options,
  }))

  const itemRuleFor = (item: LegacyScaleItemRow) => ({
    itemCode: item.item_code,
    transform: item.reverse ? ({ type: 'reverse' } as const) : ({ type: 'identity' } as const),
  })

  const totalScore = {
    key: 'raw_total',
    type: 'total' as const,
    label: '原始分（旧系统口径）',
    description: `旧系统 ${scale.code} 原始分：加权和（含反向题），仅用于与归档结果对照；历史结果不重算。`,
    direction: 'higher_is_more' as const,
    canonical: true,
    displayPrecision: 2,
    missingPolicy: { type: 'complete_required' } as const,
    source: {
      type: 'items' as const,
      items: sortedItems.map((item) => ({
        itemCode: item.item_code,
        weight: num(item.weight) ?? 1,
      })),
      aggregation: 'weighted_sum' as const,
    },
  }

  const dimensionScores = dimensions.map((dimension) => {
    const linked = itemDimensions.filter((link) => link.dimension_id === dimension.id)
    const weightByCode = new Map(linked.map((link) => [link.item_code, num(link.weight) ?? 1]))
    const sourceItems = sortedItems
      .filter((item) => weightByCode.has(item.item_code))
      .map((item) => ({ itemCode: item.item_code, weight: weightByCode.get(item.item_code) ?? 1 }))
    return {
      key: `dim_${dimension.code}`,
      type: 'dimension' as const,
      label: dimension.name,
      description: dimension.description ?? undefined,
      direction: 'higher_is_more' as const,
      canonical: false,
      displayPrecision: 2,
      missingPolicy: { type: 'complete_required' } as const,
      source: {
        type: 'items' as const,
        items: sourceItems.length > 0
          ? sourceItems
          : sortedItems.map((item) => ({ itemCode: item.item_code, weight: num(item.weight) ?? 1 })),
        aggregation: (dimension.scoring_method === 'average' ? 'weighted_mean' : 'weighted_sum') as 'weighted_sum' | 'weighted_mean',
      },
    }
  })

  const scoreList = [totalScore, ...dimensionScores]

  return {
    schemaVersion: 2,
    legacyContent: { ...inputs, reviewRequired: true }, // Preserve ambiguous legacy scoring/configuration for review.
    respondentType: 'participant_self_report',
    source: {
      title: scale.name,
      citation: `Migrated from legacy ptool scale ${scale.code} (ptool @ 2b9a11d9).`,
    },
    license: {
      status: 'unknown',
      redistribution: 'restricted',
      note: 'Migrated legacy content: verify redistribution rights before any new publication.',
    },
    display: { randomizeItems: config.randomizeItems === true },
    responseSets,
    items: definitionItems,
    scoring: {
      scoringVersion: '1.0.0',
      itemRules: sortedItems.map(itemRuleFor),
      defaultMissingPolicy: { type: 'complete_required' },
      scores: scoreList,
    },
    report: {
      reportVersion: '1.0.0',
      primaryScoreKeys: ['raw_total'],
      scoreOrder: scoreList.map((score) => score.key),
      interpretations: [{
        scoreKey: 'raw_total',
        headline: `${scale.name} 原始分（历史迁移，描述性）`,
        summary: '本量表由旧系统迁移而来；历史测评结果保存在历史归档中，未经新引擎重算。',
        bands: [],
        guidance: [
          { category: 'reflection', text: '历史结果仅供参考，请结合学生在当前系统中的新测评综合了解。' },
        ],
      }],
      limitations: [
        '迁移内容：旧系统维度分数不构成新系统常模或诊断结论。',
        '历史测评结果在历史归档中原样保存，本定义仅供内容延续。',
      ],
      disclaimer: '本量表由旧系统迁移而来；结果仅描述性展示，不构成诊断或常模比较。',
    },
    referencePolicy: { type: 'none' },
  }
}
