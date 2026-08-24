import { MaterialResourceType, UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import {
  listReportPackageDefinitions,
  reportPackageResourceId,
} from './report-package.registry'

export const listReportPackageCatalog = async (userId: string, role: UserRole) => {
  const isAdmin = role === UserRole.ADMIN
  const definitions = listReportPackageDefinitions()
  const grants = isAdmin
    ? []
    : await prisma.materialGrant.findMany({
        where: {
          teacherId: userId,
          resourceType: MaterialResourceType.REPORT_PACKAGE,
        },
        select: { resourceId: true },
      })
  const granted = new Set(grants.map((grant) => grant.resourceId))

  return definitions
    .filter((definition) => isAdmin || (definition.status === 'PUBLISHED' && granted.has(reportPackageResourceId(definition.key, definition.version))))
    .map((definition) => ({
      key: definition.key,
      version: definition.version,
      status: definition.status,
      name: definition.name,
      description: definition.description,
      profiles: definition.profiles,
      estimatedMinutes: definition.estimatedMinutes,
      reportDefinitionVersion: definition.reportDefinitionVersion,
      analysisProtocolKey: definition.analysisProtocolKey,
      analysisProtocolVersion: definition.analysisProtocolVersion,
      audience: definition.audience,
      slots: definition.slots.map((slot) => ({
        key: slot.key,
        label: slot.label,
        position: slot.position,
        required: slot.required,
        type: 'testType' in slot ? 'COGNITIVE' : 'SCALE',
        ...('testType' in slot ? {
          testType: slot.testType,
          configVersion: slot.configVersion,
          engineVersion: slot.engineVersion,
          scoringVersion: slot.scoringVersion,
        } : {
          mappingKey: slot.mappingKey,
          mappingVersion: slot.mappingVersion,
        }),
      })),
      granted: isAdmin || granted.has(reportPackageResourceId(definition.key, definition.version)),
      ...(isAdmin ? { disabledReason: definition.disabledReason ?? null } : {}),
    }))
}
