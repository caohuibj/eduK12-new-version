import { PrismaClient } from '@prisma/client'
import { ADEXI_V2_PACKAGE, validateScalePackage } from '../../src/modules/scale/scale-package.registry'
import { hashScaleDefinition } from '../../src/modules/scale/scale-definition'
import type { AssessmentReferenceSetDefinition } from '../../src/modules/assessment-reference/reference'

const deepEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true
  if (left === null || right === null || typeof left !== 'object' || typeof right !== 'object') return left === right
  if (Array.isArray(left) || Array.isArray(right)) {
    if (!Array.isArray(left) || !Array.isArray(right) || left.length !== right.length) return false
    return left.every((value, index) => deepEqual(value, right[index]))
  }
  const leftRecord = left as Record<string, unknown>
  const rightRecord = right as Record<string, unknown>
  const leftKeys = Object.keys(leftRecord)
  const rightKeys = Object.keys(rightRecord)
  return leftKeys.length === rightKeys.length && leftKeys.every((key) => deepEqual(leftRecord[key], rightRecord[key]))
}

const referenceDefinitionForRow = (row: {
  instrumentType: 'SCALE' | 'COGNITIVE'
  instrumentKey: string
  referenceVersion: string
  status: 'DRAFT' | 'ACTIVE' | 'RETIRED'
  definition: unknown
}): AssessmentReferenceSetDefinition | null => {
  if (!row.definition || typeof row.definition !== 'object') return null
  return {
    ...(row.definition as Record<string, unknown>),
    schemaVersion: 1,
    instrumentType: row.instrumentType === 'SCALE' ? 'scale' : 'cognitive',
    instrumentKey: row.instrumentKey,
    referenceVersion: row.referenceVersion,
    status: row.status,
  } as AssessmentReferenceSetDefinition
}

const seedScaleReferences = async (prisma: PrismaClient, references: AssessmentReferenceSetDefinition[]): Promise<void> => {
  for (const reference of references) {
    const existing = await prisma.assessmentReferenceSet.findUnique({
      where: {
        instrumentType_instrumentKey_referenceVersion: {
          instrumentType: 'SCALE',
          instrumentKey: reference.instrumentKey,
          referenceVersion: reference.referenceVersion,
        },
      },
    })
    const definition = reference as any
    if (!existing) {
      await prisma.assessmentReferenceSet.create({
        data: {
          instrumentType: 'SCALE',
          instrumentKey: reference.instrumentKey,
          referenceVersion: reference.referenceVersion,
          status: reference.status,
          definition,
        },
      })
      console.log(`Scale reference 已创建: ${reference.instrumentKey}/${reference.referenceVersion}`)
      continue
    }

    const existingDefinition = referenceDefinitionForRow(existing)
    if (existing.status === reference.status && existingDefinition && deepEqual(existingDefinition, reference)) {
      console.log(`Scale reference 已存在且一致，跳过（幂等）: ${reference.instrumentKey}/${reference.referenceVersion}`)
      continue
    }
    if (existing.status === 'ACTIVE') {
      throw new Error(`scale reference ${reference.instrumentKey}/${reference.referenceVersion} 已激活且内容不一致；请创建新的 referenceVersion`)
    }
    await prisma.assessmentReferenceSet.update({
      where: { id: existing.id },
      data: { status: reference.status, definition },
    })
    console.log(`Scale reference 已更新: ${reference.instrumentKey}/${reference.referenceVersion}`)
  }
}

/** Seed code-owned standard scale packages without replacing their resource id. */
export async function seedScalePackages(prisma: PrismaClient, adminId: string): Promise<void> {
  const packageValidation = validateScalePackage(ADEXI_V2_PACKAGE)
  if (!packageValidation.valid) {
    throw new Error(`ADEXI v2 package release gate failed: ${packageValidation.issues.filter((issue) => issue.severity === 'error').map((issue) => `${issue.path}: ${issue.message}`).join('; ')}`)
  }

  const definitionHash = hashScaleDefinition(ADEXI_V2_PACKAGE.definition)
  const existing = await prisma.scale.findUnique({
    where: { code: ADEXI_V2_PACKAGE.key },
    select: { id: true, instrumentClass: true, instrumentVersion: true, definition: true, definitionHash: true, status: true, visibility: true },
  })
  const data = {
    name: 'ADEXI 执行功能参与者自评 v2.0.0',
    description: '14 项执行功能参与者自评，包含工作记忆与抑制两个描述性维度。',
    status: 'DRAFT' as const,
    visibility: 'HIDDEN' as const,
    instrumentClass: 'STANDARD' as const,
    instrumentVersion: ADEXI_V2_PACKAGE.instrumentVersion,
    definition: ADEXI_V2_PACKAGE.definition as any,
    definitionHash,
    estimatedTime: 5,
    instruction: '请根据你自己的日常体验作答。没有正确或错误答案；本量表不是诊断工具。',
    tags: ['ADEXI', 'standard-package', 'participant-self-report', 'inhibitory-control'],
  }

  if (!existing) {
    await prisma.scale.create({ data: { code: ADEXI_V2_PACKAGE.key, creatorId: adminId, ...data } })
    console.log(`ADEXI v2 package 已创建为 STANDARD/DRAFT/HIDDEN: code=${ADEXI_V2_PACKAGE.key} version=${ADEXI_V2_PACKAGE.instrumentVersion}`)
  } else if (existing.definitionHash === definitionHash && existing.instrumentVersion === ADEXI_V2_PACKAGE.instrumentVersion && existing.instrumentClass === 'STANDARD' && existing.status === 'DRAFT' && existing.visibility === 'HIDDEN') {
    console.log(`ADEXI v2 package 已存在且一致，跳过（幂等）: code=${ADEXI_V2_PACKAGE.key}`)
  } else {
    const isOldRow = existing.definition === null && existing.instrumentVersion === '1.0.0'
    if (!isOldRow && existing.instrumentClass === 'STANDARD') {
      throw new Error(`scale ${ADEXI_V2_PACKAGE.key} already contains a divergent STANDARD package; create a new instrumentVersion`)
    }

    await prisma.scale.update({ where: { id: existing.id }, data: data as any })
    console.log(`ADEXI 旧资源已原位迁移为 v2 STANDARD/DRAFT/HIDDEN: code=${ADEXI_V2_PACKAGE.key} version=${ADEXI_V2_PACKAGE.instrumentVersion}`)
  }

  await seedScaleReferences(prisma, ADEXI_V2_PACKAGE.references)
}
