/**
 * Minimal Prisma repository transactions for SafetyCase persistence.
 * Worker wakeups must load from Postgres inside a transaction — never trust Bull body.
 */
import type { Prisma, PrismaClient } from '@prisma/client'
import { safetyFail } from './errors'
import type {
  SafetyCaseEventV1,
  SafetyCaseRecordV1,
  SafetyPolicyTemplateV1,
  SafetyWakeupLedgerEntryV1,
} from './types'

type Tx = Prisma.TransactionClient

const toIso = (value: Date): string => value.toISOString()

export const mapSafetyCaseRowToDomain = (row: {
  id: string
  policyKey: string
  policyVersion: string
  status: string
  subjectUserId: string
  primaryOwnerUserId: string
  backupOwnerUserIds: string[]
  triggerSourceKind: string
  triggerSourceHash: string
  triggerSourceRecordId: string | null
  triggerBundleKey: string | null
  triggerBundleVersion: string | null
  triggerNotesJson: unknown
  idempotencyKey: string
  priorCaseId: string | null
  acknowledgedAt: Date | null
  disposedAt: Date | null
  ackDueAt: Date
  disposeDueAt: Date
  createdAt: Date
  updatedAt: Date
}): SafetyCaseRecordV1 => ({
  schemaVersion: 1,
  caseId: row.id,
  policyKey: row.policyKey,
  policyVersion: row.policyVersion,
  status: row.status as SafetyCaseRecordV1['status'],
  subjectUserId: row.subjectUserId,
  primaryOwnerUserId: row.primaryOwnerUserId,
  backupOwnerUserIds: [...row.backupOwnerUserIds],
  trigger: {
    sourceKind: row.triggerSourceKind as SafetyCaseRecordV1['trigger']['sourceKind'],
    sourceHash: row.triggerSourceHash,
    bundleKey: row.triggerBundleKey,
    bundleVersion: row.triggerBundleVersion,
    sourceRecordId: row.triggerSourceRecordId,
    safetyFlag: true,
    notes: Array.isArray(row.triggerNotesJson)
      ? (row.triggerNotesJson as string[])
      : [],
  },
  idempotencyKey: row.idempotencyKey,
  createdAt: toIso(row.createdAt),
  updatedAt: toIso(row.updatedAt),
  acknowledgedAt: row.acknowledgedAt ? toIso(row.acknowledgedAt) : null,
  disposedAt: row.disposedAt ? toIso(row.disposedAt) : null,
  ackDueAt: toIso(row.ackDueAt),
  disposeDueAt: toIso(row.disposeDueAt),
  priorCaseId: row.priorCaseId,
})

export class PrismaSafetyRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async upsertPolicyTemplate(policy: SafetyPolicyTemplateV1): Promise<void> {
    await this.prisma.safetyPolicyTemplate.upsert({
      where: {
        policyKey_policyVersion: {
          policyKey: policy.policyKey,
          policyVersion: policy.policyVersion,
        },
      },
      create: {
        id: `${policy.policyKey}:${policy.policyVersion}`,
        policyKey: policy.policyKey,
        policyVersion: policy.policyVersion,
        status: policy.status,
        name: policy.name,
        acknowledgeWithinMs: policy.acknowledgeWithinMs,
        disposeWithinMs: policy.disposeWithinMs,
        escalationChainJson: policy.escalationChain,
        productionTriggerEnabled: policy.productionTriggerEnabled,
        testOnlyAuthoritativeFixture: policy.testOnlyAuthoritativeFixture,
        createdByUserId: policy.createdByUserId,
        approvedByUserId: policy.approvedByUserId,
        createdAt: new Date(policy.createdAt),
        updatedAt: new Date(policy.updatedAt),
      },
      update: {
        status: policy.status,
        name: policy.name,
        acknowledgeWithinMs: policy.acknowledgeWithinMs,
        disposeWithinMs: policy.disposeWithinMs,
        escalationChainJson: policy.escalationChain,
        productionTriggerEnabled: policy.productionTriggerEnabled,
        testOnlyAuthoritativeFixture: policy.testOnlyAuthoritativeFixture,
        approvedByUserId: policy.approvedByUserId,
        updatedAt: new Date(policy.updatedAt),
      },
    })
  }

  async createCaseAtomic(input: {
    safetyCase: SafetyCaseRecordV1
    event: SafetyCaseEventV1
  }): Promise<{ created: boolean; safetyCase: SafetyCaseRecordV1 }> {
    return this.prisma.$transaction(async (tx) => {
      const existing = await tx.safetyCase.findUnique({
        where: { idempotencyKey: input.safetyCase.idempotencyKey },
      })
      if (existing) {
        return { created: false, safetyCase: mapSafetyCaseRowToDomain(existing) }
      }
      const created = await tx.safetyCase.create({
        data: {
          id: input.safetyCase.caseId,
          policyKey: input.safetyCase.policyKey,
          policyVersion: input.safetyCase.policyVersion,
          status: input.safetyCase.status,
          subjectUserId: input.safetyCase.subjectUserId,
          primaryOwnerUserId: input.safetyCase.primaryOwnerUserId,
          backupOwnerUserIds: input.safetyCase.backupOwnerUserIds,
          triggerSourceKind: input.safetyCase.trigger.sourceKind,
          triggerSourceHash: input.safetyCase.trigger.sourceHash,
          triggerSourceRecordId: input.safetyCase.trigger.sourceRecordId,
          triggerBundleKey: input.safetyCase.trigger.bundleKey,
          triggerBundleVersion: input.safetyCase.trigger.bundleVersion,
          triggerNotesJson: input.safetyCase.trigger.notes,
          idempotencyKey: input.safetyCase.idempotencyKey,
          priorCaseId: input.safetyCase.priorCaseId,
          acknowledgedAt: null,
          disposedAt: null,
          ackDueAt: new Date(input.safetyCase.ackDueAt),
          disposeDueAt: new Date(input.safetyCase.disposeDueAt),
          createdAt: new Date(input.safetyCase.createdAt),
          updatedAt: new Date(input.safetyCase.updatedAt),
        },
      })
      await tx.safetyCaseEvent.create({
        data: {
          id: input.event.eventId,
          caseId: input.event.caseId,
          type: input.event.type,
          actorUserId: input.event.actorUserId,
          at: new Date(input.event.at),
          note: input.event.note,
          wakeupJobId: input.event.wakeupJobId,
        },
      })
      return { created: true, safetyCase: mapSafetyCaseRowToDomain(created) }
    })
  }

  /**
   * Worker entry: transaction → load case → check wakeupJobId processed →
   * apply domain transition → persist. Bull payload must be ID-only.
   */
  async processWakeupInTransaction(input: {
    caseId: string
    wakeupJobId: string
    kind: 'ACK_TIMEOUT' | 'DISPOSE_TIMEOUT'
    apply: (args: {
      safetyCase: SafetyCaseRecordV1
      existingLedger: SafetyWakeupLedgerEntryV1 | null
      priorEscalation: SafetyCaseEventV1 | null
    }) => {
      safetyCase: SafetyCaseRecordV1
      event: SafetyCaseEventV1 | null
      ledger: SafetyWakeupLedgerEntryV1
    }
  }): Promise<{ safetyCase: SafetyCaseRecordV1; duplicate: boolean }> {
    return this.prisma.$transaction(async (tx: Tx) => {
      const row = await tx.safetyCase.findUnique({ where: { id: input.caseId } })
      if (!row) {
        return safetyFail('SAFETY_INPUT', 'safety case not found')
      }
      const existingLedgerRow = await tx.safetyWakeupLedger.findUnique({
        where: { wakeupJobId: input.wakeupJobId },
      })
      const priorEscalationRow = await tx.safetyCaseEvent.findFirst({
        where: { wakeupJobId: input.wakeupJobId, type: 'ESCALATED' },
      })
      const existingLedger: SafetyWakeupLedgerEntryV1 | null = existingLedgerRow
        ? {
            wakeupJobId: existingLedgerRow.wakeupJobId,
            caseId: existingLedgerRow.caseId,
            kind: existingLedgerRow.kind as SafetyWakeupLedgerEntryV1['kind'],
            fireAt: toIso(existingLedgerRow.fireAt),
            status: existingLedgerRow.status as SafetyWakeupLedgerEntryV1['status'],
            createdAt: toIso(existingLedgerRow.createdAt),
            processedAt: existingLedgerRow.processedAt ? toIso(existingLedgerRow.processedAt) : null,
          }
        : null
      const priorEscalation: SafetyCaseEventV1 | null = priorEscalationRow
        ? {
            eventId: priorEscalationRow.id,
            caseId: priorEscalationRow.caseId,
            type: priorEscalationRow.type as SafetyCaseEventV1['type'],
            actorUserId: priorEscalationRow.actorUserId,
            at: toIso(priorEscalationRow.at),
            note: priorEscalationRow.note,
            wakeupJobId: priorEscalationRow.wakeupJobId,
          }
        : null

      const applied = input.apply({
        safetyCase: mapSafetyCaseRowToDomain(row),
        existingLedger,
        priorEscalation,
      })

      await tx.safetyCase.update({
        where: { id: applied.safetyCase.caseId },
        data: {
          status: applied.safetyCase.status,
          acknowledgedAt: applied.safetyCase.acknowledgedAt
            ? new Date(applied.safetyCase.acknowledgedAt)
            : null,
          disposedAt: applied.safetyCase.disposedAt
            ? new Date(applied.safetyCase.disposedAt)
            : null,
          updatedAt: new Date(applied.safetyCase.updatedAt),
        },
      })
      if (applied.event) {
        await tx.safetyCaseEvent.create({
          data: {
            id: applied.event.eventId,
            caseId: applied.event.caseId,
            type: applied.event.type,
            actorUserId: applied.event.actorUserId,
            at: new Date(applied.event.at),
            note: applied.event.note,
            wakeupJobId: applied.event.wakeupJobId,
          },
        })
      }
      await tx.safetyWakeupLedger.upsert({
        where: { wakeupJobId: applied.ledger.wakeupJobId },
        create: {
          wakeupJobId: applied.ledger.wakeupJobId,
          caseId: applied.ledger.caseId,
          kind: applied.ledger.kind,
          fireAt: new Date(applied.ledger.fireAt),
          status: applied.ledger.status,
          createdAt: new Date(applied.ledger.createdAt),
          processedAt: applied.ledger.processedAt
            ? new Date(applied.ledger.processedAt)
            : null,
        },
        update: {
          status: applied.ledger.status,
          processedAt: applied.ledger.processedAt
            ? new Date(applied.ledger.processedAt)
            : null,
        },
      })
      return {
        safetyCase: applied.safetyCase,
        duplicate: applied.event === null && applied.ledger.status === 'DUPLICATE_NOOP',
      }
    })
  }
}

export const createPrismaSafetyRepository = (prisma: PrismaClient): PrismaSafetyRepository => (
  new PrismaSafetyRepository(prisma)
)
