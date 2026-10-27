import type { ScaleCustomScorer, ScaleScoreValue } from '../../../scale-scoring'

// Preserve bullying's observed direction in its subscale while reversing only
// the same three responses in the 30-item school-climate sum.
export const delawareClimateScorer: ScaleCustomScorer = ({ definition, itemScores }) => {
  const byItem = new Map(itemScores.map(item => [item.itemCode, item.baseScore]))
  const reversed = new Set(['DSCS-09', 'DSCS-14', 'DSCS-26'])
  const scores: ScaleScoreValue[] = definition.scoring.scores.map(score => {
    if (score.source.type !== 'items' || !score.range) throw new Error('Invalid Delaware score definition')
    const expectedItems = score.source.items.map(item => item.itemCode)
    const answeredItems = expectedItems.filter(code => byItem.has(code))
    const complete = answeredItems.length === expectedItems.length
    const values = answeredItems.map(code => {
      const value = byItem.get(code)!
      return score.key === 'climate_total' && reversed.has(code) ? 5 - value : value
    })
    const value = complete ? (score.key === 'climate_total' ? values.reduce((a,b) => a+b, 0) : values.reduce((a,b) => a+b, 0) / values.length) : null
    return { key: score.key, type: score.type, label: score.label, description: score.description, direction: score.direction, canonical: score.canonical, displayPrecision: score.displayPrecision, value, range: score.range, expectedItems, answeredItems, status: complete ? 'calculated' : 'not_calculable', prorated: false }
  })
  return { scores }
}
