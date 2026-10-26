/** Single-tool contract probe; no platform test suite, CI, DB or publication. */
import assert from 'node:assert/strict'
import React from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import content from '../../src/modules/situational/instruments/chinese-aig-study3/1.0.0/instrument.json'
import publication from '../../src/modules/situational/instruments/chinese-aig-study3/1.0.0/publication.json'
import scientific from '../../src/modules/situational/instruments/chinese-aig-study3/1.0.0/scientific.json'
import selected from '../../../../docs/public-library/sjt/chinese-aig-study3/selected-study3.json'
import { instrumentSourceSchema, projectSituationPackage } from '../../src/modules/situational/onboarding/schema'
import { validateSituationPackage } from '../../src/modules/situational/situation-package'
import { scoreSituationalModel } from '../../src/modules/situational/situation-model-resolver'
import { asLinearSituationDefinition, runnerSituationRuntimeDefinition } from '../../src/modules/situational/situation-runtime-definition'
import { deriveAuthoritativeSituationalTrajectory, projectReachableSituationDefinitionForScoring } from '../../src/modules/situational/situation-trajectory'
import { selectPublishedSituationPackage } from '../../src/modules/situational/situation-package.registry'
import SituationalReportCard from '../../../frontend/src/modules/reporting/SituationalReportCard'

const source = instrumentSourceSchema.parse({ content, publication, scientific })
const pkg = projectSituationPackage(source)
const validation = validateSituationPackage(pkg)
assert.equal(validation.valid, true, JSON.stringify(validation.issues))
const d = source.content.definition
assert.equal(d.schemaVersion, 2)
assert.equal(d.scoring.model?.modelKey, 'AUTHOR_KEY_SUM')
assert.equal(d.scoring.model?.expertKey?.length, 160)
assert.equal(d.report.narrative, undefined)
assert.equal(d.scoring.publishedMetrics.length, 5)
assert.ok(d.scoring.publishedMetrics.every(m => m.direction === 'descriptive'))
assert.equal(source.scientific.review, undefined)
assert.equal(source.publication.review, undefined)
assert.equal(source.publication.releaseStatus, 'DRAFT')
assert.equal(selectPublishedSituationPackage([pkg], pkg.key, pkg.instrumentVersion), undefined)
assert.equal(selectPublishedSituationPackage([pkg], pkg.key), undefined)
assert.equal(d.scenes.length, 40)
for (const [i, scene] of d.scenes.entries()) {
  const item = selected.items[i]!
  assert.equal(scene.sceneKey, item.id)
  assert.equal(scene.stimulus.type, 'TEXT_V1')
  assert.equal(scene.stimulus.text, item.scenario)
  const channel = scene.channels[0]!
  assert.equal(channel.purpose, 'BEHAVIOR_TENDENCY')
  assert.equal(channel.responseType, 'SINGLE_CHOICE')
  if (channel.responseType !== 'SINGLE_CHOICE') throw new Error('single-choice required')
  assert.deepEqual(channel.options.map(o => ({ key: o.optionKey, text: o.label })), item.options.map(o => ({ key: o.key, text: o.text })))
  for (const o of item.options) assert.equal(d.scoring.model?.expertKey?.find(k => k.sceneKey === item.id && k.optionKey === o.key)?.contribution, o.contribution)
}
for (const fixture of source.content.goldenCases) {
  const trajectory = deriveAuthoritativeSituationalTrajectory(d, fixture.responses)
  assert.equal(trajectory.reachedTerminal, true)
  assert.deepEqual(trajectory.sceneKeys, selected.items.map(x => x.id))
  const result = scoreSituationalModel(projectReachableSituationDefinitionForScoring(d, trajectory), fixture.responses)
  assert.deepEqual(Object.fromEntries(result.metrics.map(m => [m.key, m.value])), fixture.expected.metrics)
  assert.ok(result.metrics.every(m => m.range?.min === 0 && m.range?.max === 8))
}
const allA = source.content.goldenCases[0]!.responses
for (const facet of d.scoring.publishedMetrics) {
  const missingId = d.scoring.model?.expertKey?.find(k => k.metricKey === facet.key)?.sceneKey
  const partial = scoreSituationalModel(asLinearSituationDefinition(d), allA.filter(r => r.sceneKey !== missingId))
  assert.equal(partial.metrics.find(m => m.key === facet.key)?.value, null)
  assert.ok(partial.metrics.filter(m => m.key !== facet.key).every(m => m.value === 8))
  assert.equal(partial.quality.status, 'invalid')
}
const runner = JSON.stringify(runnerSituationRuntimeDefinition(d))
assert.ok(!runner.includes('expertKey') && !runner.includes('contribution'))
const result = scoreSituationalModel(asLinearSituationDefinition(d), allA)
const markup = renderToStaticMarkup(<SituationalReportCard report={{ itemId: 'study3-contract', type: 'SITUATIONAL', kind: 'situational', label: d.source.title ?? null, metrics: result.metrics, metricOrder: d.report.metricOrder, interpretations: d.report.interpretations, disclaimer: d.report.disclaimer }} />)
for (const m of d.scoring.publishedMetrics) assert.ok(markup.includes(m.label))
assert.equal((markup.match(/原始范围 0–8/g) ?? []).length, 5)
assert.ok(!markup.includes('原始范围 0–100'))
assert.ok(!markup.includes('正确答案'))
assert.ok(markup.includes('各指标独立阅读'))
assert.ok(!d.scoring.publishedMetrics.some(m => /total|overall/i.test(m.key)))
console.log(JSON.stringify({ status: 'PASS', schemaAndV2Package: true, exactItems: 40, exactOptionKeys: 160, goldenCases: 5, missingFacetCases: 5, publishedSelectorRejectsDraft: true, renderedRawFacetMetrics: 5, runnerHidesKeys: true, runtimeChanges: false }))
