/**
 * Minimal Prisma repository transactions for SafetyCase persistence.
 * Worker wakeups must load from Postgres inside a transaction — never trust Bull body.
 * Prep 17.1: createCaseAtomic handles P2002; processWakeupAtomically claims ledger first.
 */
import { randomUUID } from 'node:crypto'
import type { Prisma, PrismaClient } from '@prisma/client'
import { safetyFail } from './errors'
import { applySafetyWakeup } from './wakeup'
import type {
  SafetyCaseEventV1,
  SafetyCaseRecordV1,
  SafetyPolicyTemplateV1,
  SafetyWakeupBullPayloadV1,
  SafetyWakeupLedgerEntryV1,
} from './types'

type Tx = Prisma.TransactionClient

const toIso = (value: Date): string => value.toISOString()

const isPrismaUniqueViolation = (err: unknown): boolean => (
  typeof err === 'object' && err !== null && (err as { code?: string }).code === 'P2002'
)

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

const mapLedgerRow = (row: {
  wakeupJobId: string
  caseId: string
  kind: string
  fireAt: Date
  status: string
  createdAt: Date
  processedAt: Date | null
}): SafetyWakeupLedgerEntryV1 => ({
  wakeupJobId: row.wakeupJobId,
  caseId: row.caseId,
  kind: row.kind as SafetyWakeupLedgerEntryV1['kind'],
  fireAt: toIso(row.fireAt),
  status: row.status as SafetyWakeupLedgerEntryV1['status'],
  createdAt: toIso(row.createdAt),
  processedAt: row.processedAt ? toIso(row.processedAt) : null,
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
    try {
      return await this.prisma.$transaction(async (tx) => {
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
    } catch (error) {
      // Concurrent create races on unique idempotencyKey → reread existing.
      if (!isPrismaUniqueViolation(error)) throw error
      const existing = await this.prisma.safetyCase.findUnique({
        where: { idempotencyKey: input.safetyCase.idempotencyKey },
      })
      if (!existing) throw error
      return { created: false, safetyCase: mapSafetyCaseRowToDomain(existing) }
    }
  }

  /**
   * Authority path: claim ledger first, then apply.
   * Concurrent same wakeupJobId → one ESCALATED event only.
   */
  async processWakeupAtomically(input: {
    payload: SafetyWakeupBullPayloadV1
    now?: string
  }): Promise<{
    safetyCase: SafetyCaseRecordV1 | null
    duplicate: boolean
    tooEarly: boolean
    escalated: boolean
  }> {
    return this.prisma.$transaction(async (tx: Tx) => {
      const now = input.now ?? new Date().toISOString()
      const row = await tx.safetyCase.findUnique({ where: { id: input.payload.caseId } })
      const caseCache = row ? mapSafetyCaseRowToDomain(row) : null
      if (!caseCache) {
        return { safetyCase: null, duplicate: false, tooEarly: false, escalated: false }
      }

      const fireAt = input.payload.kind === 'ACK_TIMEOUT'
        ? caseCache.ackDueAt
        : caseCache.disposeDueAt
      const nowMs = Date.parse(now)
      const fireMs = Date.parse(fireAt)
      if (Number.isFinite(nowMs) && Number.isFinite(fireMs) && nowMs < fireMs) {
        return { safetyCase: caseCache, duplicate: false, tooEarly: true, escalated: false }
      }

      const existingLedgerRow = await tx.safetyWakeupLedger.findUnique({
        where: { wakeupJobId: input.payload.wakeupJobId },
      })
      let claimed = false
      let ledgerForApply: SafetyWakeupLedgerEntryV1 | null = null
      if (existingLedgerRow) {
        if (existingLedgerRow.status === 'SCHEDULED') {
          const updated = await tx.safetyWakeupLedger.updateMany({
            where: { wakeupJobId: input.payload.wakeupJobId, status: 'SCHEDULED' },
            data: { status: 'FIRED', processedAt: new Date(now) },
          })
          claimed = updated.count === 1
        } else {
          claimed = false
        }
        ledgerForApply = mapLedgerRow({
          ...existingLedgerRow,
          status: claimed ? 'FIRED' : existingLedgerRow.status,
          processedAt: claimed ? new Date(now) : existingLedgerRow.processedAt,
        })
      } else {
        try {
          const created = await tx.safetyWakeupLedger.create({
            data: {
              id: randomUUID(),
              wakeupJobId: input.payload.wakeupJobId,
              caseId: input.payload.caseId,
              kind: input.payload.kind,
              fireAt: new Date(fireAt),
              status: 'FIRED',
              createdAt: new Date(now),
              processedAt: new Date(now),
            },
          })
          claimed = true
          ledgerForApply = mapLedgerRow(created)
        } catch (error) {
          if (!isPrismaUniqueViolation(error)) throw error
          claimed = false
          const raced = await tx.safetyWakeupLedger.findUnique({
            where: { wakeupJobId: input.payload.wakeupJobId },
          })
          ledgerForApply = raced ? mapLedgerRow(raced) : null
        }
      }

      const priorEscalationRow = await tx.safetyCaseEvent.findFirst({
        where: { wakeupJobId: input.payload.wakeupJobId, type: 'ESCALATED' },
      })
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

      if (!claimed) {
        return {
          safetyCase: caseCache,
          duplicate: true,
          tooEarly: false,
          escalated: false,
        }
      }

      // Claim already won — do not pass FIRED ledger into apply (would false-duplicate).
      const applied = applySafetyWakeup({
        safetyCase: caseCache,
        payload: input.payload,
        existingLedger: ledgerForApply && ledgerForApply.status === 'SCHEDULED'
          ? ledgerForApply
          : (ledgerForApply
            ? { ...ledgerForApply, status: 'SCHEDULED', processedAt: null }
            : null),
        priorEscalationForJob: priorEscalation,
        now,
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
        try {
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
        } catch (error) {
          if (!isPrismaUniqueViolation(error)) throw error
          return {
            safetyCase: caseCache,
            duplicate: true,
            tooEarly: false,
            escalated: false,
          }
        }
      }
      await tx.safetyWakeupLedger.upsert({
        where: { wakeupJobId: applied.ledger.wakeupJobId },
        create: {
          id: randomUUID(),
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
        tooEarly: false,
        escalated: applied.event?.type === 'ESCALATED',
      }
    })
  }

  /**
   * @deprecated Prefer processWakeupAtomically.
   */
  async processWakeupInTransaction(input: {
    caseId: string
    wakeupJobId: string
    kind: 'ACK_TIMEOUT' | 'DISPOSE_TIMEOUT'
  }): Promise<{ safetyCase: SafetyCaseRecordV1; duplicate: boolean }> {
    const result = await this.processWakeupAtomically({
      payload: {
        caseId: input.caseId,
        wakeupJobId: input.wakeupJobId,
        kind: input.kind,
      },
    })
    if (!result.safetyCase) {
      return safetyFail('SAFETY_INPUT', 'safety case not found')
    }
    return { safetyCase: result.safetyCase, duplicate: result.duplicate }
  }
}

export const createPrismaSafetyRepository = (prisma: PrismaClient): PrismaSafetyRepository => (
  new PrismaSafetyRepository(prisma)
)
