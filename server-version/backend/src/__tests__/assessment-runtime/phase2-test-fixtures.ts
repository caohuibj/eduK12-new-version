import { randomUUID } from 'node:crypto'
import { listScalePackages } from '../../modules/scale/scale-package.registry'
import { hashScaleDefinition } from '../../modules/scale/scale-definition'
import { SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE } from '../../modules/situational/packages/sjt-assertiveness-golden-zh-cn-v1'
import { hashSituationRuntimeDefinition } from '../../modules/situational/situation-runtime-definition'
import { getCognitiveV2TaskDefinition } from '../../modules/cognitive/v2/registry'
import { createSessionConfigSnapshot } from '../../modules/cognitive/v2/session-snapshot'
import { hashResolvedConfig } from '../../modules/cognitive/profile-freeze'
import {
  compileCognitiveRuntime,
  compileScaleRuntime,
  compileSituationRuntime,
} from '../../modules/assessment-runtime/compiler'
import {
  compositeFormSectionDefinitionHash,
  mapCompositeSection,
} from '../../modules/assessment-runtime/form-section-definition'
import type { CompositePublicationSlotV1 } from '../../modules/assessment-runtime/composite-publication-plan'

const REPORT_META = {
  reportVersion: '1.0.0',
  referenceMode: 'none' as const,
}

export function buildFourFamilyTestSlots() {
  const scalePkg = listScalePackages().find(p => p.goldenCases.some(c => c.expected.quality))!
  const scaleDefHash = hashScaleDefinition(scalePkg.definition)
  const scaleItemId = randomUUID()
  const scaleRuntime = compileScaleRuntime({
    instrumentKey: scalePkg.key,
    instrumentVersion: scalePkg.instrumentVersion,
    definition: scalePkg.definition,
    sourceDefinitionHash: scaleDefHash,
  })

  const formSectionId = randomUUID()
  const formItemId = randomUUID()
  const formSection = mapCompositeSection({
    id: formSectionId,
    title: '基本背景',
    description: '用于常模匹配',
    position: 0,
    contextSection: true,
    items: [{
      id: formItemId,
      formType: 'single_choice',
      formLabel: '年级',
      formPlaceholder: null,
      formOptions: [
        { value: '7', label: '七年级' },
        { value: '8', label: '八年级' },
        { value: '9', label: '九年级' },
      ],
      contextKey: 'gradeLevel',
      required: true,
      position: 0,
      formSectionPosition: 0,
    }],
  })
  const formDefHash = compositeFormSectionDefinitionHash(formSection)

  const sjtPkg = SJT_ASSERTIVENESS_GOLDEN_ZH_CN_V1_PACKAGE
  const sjtDefHash = hashSituationRuntimeDefinition(sjtPkg.definition)
  const sjtItemId = randomUUID()
  const sjtRuntime = compileSituationRuntime({
    instrumentKey: sjtPkg.key,
    instrumentVersion: sjtPkg.instrumentVersion,
    definition: sjtPkg.definition,
    sourceDefinitionHash: sjtDefHash,
  })

  const cogItemId = randomUUID()
  const cogDef = getCognitiveV2TaskDefinition('gonogo', '1.0.0', '1.0.0')!
  const cogConfig = {
    totalTrials: 8,
    nogoRatio: 0.25 as const,
    stimulusMs: 800,
    isiMs: 500,
    validRtFloorMs: 100,
    report: REPORT_META,
  }
  const cogRuntime = compileCognitiveRuntime({ definition: cogDef, instrumentVersion: '1.0.0' })
  const cogSnapshot = createSessionConfigSnapshot({
    definition: cogDef,
    configVersion: '1.0.0',
    config: cogConfig,
    runtime: {
      runtimeGeneration: 'UNIFIED_V1',
      compiledRuntime: cogRuntime,
      referenceBindings: [],
    },
  })

  const slots: CompositePublicationSlotV1[] = [
    {
      slotKey: `form:${formSectionId}`,
      unitType: 'FORM_SECTION',
      sectionId: formSectionId,
      title: formSection.title,
      description: formSection.description,
      required: true,
      position: 0,
      contextSection: true,
      definitionHash: formDefHash,
      section: formSection,
    },
    {
      slotKey: `scale:${scaleItemId}`,
      unitType: 'SCALE',
      itemId: scaleItemId,
      scaleId: randomUUID(),
      instrumentKey: scalePkg.key,
      instrumentVersion: scalePkg.instrumentVersion,
      name: scalePkg.key,
      title: scalePkg.key,
      required: true,
      position: 1,
      definitionHash: scaleDefHash,
      definition: scalePkg.definition,
      compiledRuntime: scaleRuntime,
      referenceSets: scalePkg.references,
    },
    {
      slotKey: `situational:${sjtItemId}`,
      unitType: 'SITUATIONAL',
      itemId: sjtItemId,
      instrumentKey: sjtPkg.key,
      instrumentVersion: sjtPkg.instrumentVersion,
      title: sjtPkg.definition.source.title,
      required: true,
      position: 2,
      definitionHash: sjtDefHash,
      definition: sjtPkg.definition,
      compiledRuntime: sjtRuntime,
    },
    {
      slotKey: `cognitive:${cogItemId}`,
      unitType: 'COGNITIVE',
      itemId: cogItemId,
      testType: 'gonogo',
      title: 'Go/No-Go',
      required: true,
      position: 3,
      definitionHash: cogSnapshot.configHash,
      resolvedConfigHash: hashResolvedConfig(cogConfig),
      profile: 'standard',
      sessionSnapshot: cogSnapshot,
      compiledRuntime: cogRuntime,
    },
  ]

  return {
    slots,
    scalePkg,
    sjtPkg,
    formSectionId,
    formItemId,
    scaleItemId,
    sjtItemId,
    cogItemId,
    scaleDefHash,
    formDefHash,
    sjtDefHash,
    cogDefHash: cogSnapshot.configHash,
  }
}
