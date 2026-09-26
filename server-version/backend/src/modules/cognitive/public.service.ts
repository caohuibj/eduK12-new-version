import { randomBytes } from 'crypto'
import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { MAX_TOKEN_USES } from '../../constants'
import { createAccessToken, createRecoveryCredential, hashRecoveryToken } from '../../services/anonymousAccess'
import {
  decryptPublicAccessToken,
  encryptPublicAccessToken,
  hashPublicAccessToken,
} from '../../services/publicAccessTokenCrypto'
import { decryptCognitivePayload, encryptCognitivePayload } from './cognitive.security'
import { requireCognitiveRegistryEntry } from './cognitive.registry'
import { hashResolvedConfig } from './profile-freeze'
import * as sessionService from './session.service'
import * as trialService from './trial.service'
import * as completionService from './completion.service'
import * as finalSubmitService from './final-submit.service'
import { lockSession } from './session-lock'
import { BAD_REQUEST, CONFLICT, FORBIDDEN, NOT_FOUND } from './cognitive.errors'
import { isCompositeWrapper } from './assignment.access'

const assertWindow = (token: { isActive: boolean; expiresAt: Date; maxUses: number; usedCount: number }) => {
  if (!token.isActive) throw FORBIDDEN('Public link is disabled')
  if (token.expiresAt.getTime() < Date.now()) throw FORBIDDEN('Public link has expired')
  if (token.maxUses > 0 && token.usedCount >= token.maxUses) throw CONFLICT('Public link reached its maximum uses')
}

const loadToken = async (value: string) => {
  const tokenHash = hashPublicAccessToken(value)
  let token = await prisma.cognitiveAccessToken.findUnique({
    where: { tokenHash },
    include: { assignment: { include: { config: true, course: true } } },
  })
  if (!token) {
    // Compatibility lookup for legacy rows during the explicit backfill
    // window. New rows have token=NULL and are resolved by tokenHash.
    token = await prisma.cognitiveAccessToken.findUnique({
      where: { token: value },
      include: { assignment: { include: { config: true, course: true } } },
    })
    if (token?.tokenHash && token.tokenHash !== tokenHash) token = null
  }
  if (!token) throw NOT_FOUND('Public link not found')
  if (token.assignment.status !== 'PUBLISHED' || token.assignment.config.status !== 'PUBLISHED') {
    throw FORBIDDEN('Cognitive assignment is not publicly available')
  }
  if (isCompositeWrapper(token.assignment) || token.assignment.course?.isLibrary) {
    throw FORBIDDEN('此认知任务仅用于综合测评，不能单独作答或公开分发')
  }
  return token as any
}

const validateAssignment = (assignment: any) => {
  if (assignment.opensAt && assignment.opensAt.getTime() > Date.now()) throw BAD_REQUEST('Cognitive assignment has not opened')
  if (assignment.dueAt && assignment.dueAt.getTime() < Date.now()) throw BAD_REQUEST('Cognitive assignment is past due')
  const config = assignment.config
  const entry = requireCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
  if (assignment.resolvedConfigSnapshotEncrypted) {
    const thawed = decryptCognitivePayload<unknown>(assignment.resolvedConfigSnapshotEncrypted)
    const parsed = entry.configSchema.safeParse(thawed)
    if (!parsed.success) throw BAD_REQUEST('冻结的 Profile 配置与任务 schema 不匹配')
    if (assignment.resolvedConfigHash && hashResolvedConfig(parsed.data) !== assignment.resolvedConfigHash) {
      throw BAD_REQUEST('冻结的 Profile 配置校验失败')
    }
    return { config, parsedConfig: parsed.data, snapshotEncrypted: assignment.resolvedConfigSnapshotEncrypted as string }
  }
  const parsed = entry.configSchema.safeParse(config.config)
  if (!parsed.success) throw BAD_REQUEST('Cognitive config does not match its registry schema')
  return { config, parsedConfig: parsed.data, snapshotEncrypted: encryptCognitivePayload(parsed.data) }
}

export const getPublicAssignmentInfo = async (tokenValue: string) => {
  const token = await loadToken(tokenValue)
  assertWindow(token)
  validateAssignment(token.assignment)
  return {
    title: token.assignment.title,
    instruction: token.assignment.instruction,
    testType: token.assignment.config.testType,
    maxAttempts: token.assignment.maxAttempts,
    expiresAt: token.expiresAt,
    maxUses: token.maxUses,
    usedCount: token.usedCount,
  }
}

export const startPublicSession = async (tokenValue: string, recoveryToken?: string) => {
  const token = await loadToken(tokenValue)
  if (isCompositeWrapper(token.assignment)) {
    throw FORBIDDEN('此认知任务仅用于综合测评，不能单独作答或公开分发')
  }
  if (recoveryToken) {
    const recoveryTokenHash = hashRecoveryToken(recoveryToken)
    const existing = await prisma.cognitiveSession.findFirst({ where: { accessTokenId: token.id, recoveryTokenHash, userId: null } })
    if (existing) {
      return { session: await sessionService.getPublicSession(recoveryTokenHash, existing.id), recoveryToken: null, anonymousCode: existing.anonymousCode }
    }
    throw FORBIDDEN('Invalid recovery credential')
  }
  assertWindow(token)
  const { config, parsedConfig } = validateAssignment(token.assignment)
  const credential = createRecoveryCredential()
  const created = await prisma.$transaction(async (tx) => {
    const claimed = await tx.cognitiveAccessToken.updateMany({
      where: { id: token.id, isActive: true, expiresAt: { gt: new Date() }, OR: [{ maxUses: 0 }, { usedCount: { lt: token.maxUses } }] },
      data: { usedCount: { increment: 1 } },
    })
    if (claimed.count !== 1) throw CONFLICT('Public link reached its maximum uses')
    const unifiedSnapshot = await sessionService.createUnifiedCognitiveSessionConfigSnapshot({
      db: tx as any,
      testType: config.testType,
      configVersion: config.configVersion,
      engineVersion: config.engineVersion,
      scoringVersion: config.scoringVersion,
      config: parsedConfig,
    })
    return tx.cognitiveSession.create({
      data: {
        userId: null,
        participantKey: credential.participantKey,
        participantSnapshotEncrypted: encryptCognitivePayload({ anonymousCode: credential.anonymousCode }),
        assignmentId: token.assignment.id,
        accessTokenId: token.id,
        recoveryTokenHash: credential.hash,
        anonymousCode: credential.anonymousCode,
        configId: config.id,
        testType: config.testType,
        attemptNo: 1,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        configVersion: config.configVersion,
        configSnapshotEncrypted: unifiedSnapshot.encrypted,
        engineVersion: config.engineVersion,
        scoringVersion: config.scoringVersion,
        randomSeed: randomBytes(16).toString('hex'),
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
      },
    })
  })
  return { session: await sessionService.getPublicSession(credential.hash, created.id), recoveryToken: credential.token, anonymousCode: credential.anonymousCode }
}

export const getSession = async (sessionId: string, recoveryToken: string) =>
  sessionService.getPublicSession(hashRecoveryToken(recoveryToken), sessionId)

export const appendTrial = async (sessionId: string, recoveryToken: string, input: { trialIndex: number; payload?: unknown }) =>
  trialService.appendTrialForPublic(sessionId, hashRecoveryToken(recoveryToken), input)

export const appendTrials = async (
  sessionId: string,
  recoveryToken: string,
  inputs: Array<{ trialIndex: number; payload?: unknown }>,
) => trialService.appendTrialsForPublic(sessionId, hashRecoveryToken(recoveryToken), inputs)

export const completeSession = async (sessionId: string, recoveryToken: string) =>
  completionService.completeSessionForPublic(sessionId, hashRecoveryToken(recoveryToken))

export const submitSessionFinal = async (
  sessionId: string,
  recoveryToken: string,
  input: Omit<Parameters<typeof finalSubmitService.submitCognitiveSessionFinalForPublic>[0], 'sessionId'>,
) => finalSubmitService.submitCognitiveSessionFinalForPublic(
  { sessionId, ...input },
  hashRecoveryToken(recoveryToken),
)

/**
 * Replace an anonymous legacy/in-progress session with a fresh final-only
 * attempt. The old row and its trials remain readable for historical reports;
 * only the new recovery credential can write the replacement session.
 */
export const restartPublicSession = async (sessionId: string, recoveryToken: string) => {
  const recoveryTokenHash = hashRecoveryToken(recoveryToken)
  const current = await prisma.cognitiveSession.findUnique({
    where: { id: sessionId },
    include: {
      assignment: { include: { config: true, course: true } },
      accessToken: true,
    },
  })
  if (!current) throw NOT_FOUND('CognitiveSession not found')
  if (current.userId !== null || current.recoveryTokenHash !== recoveryTokenHash) {
    throw FORBIDDEN('Recovery credential does not own this session')
  }
  if (current.compositeAttemptId) {
    throw CONFLICT('综合测评中的认知任务必须重启整个综合测评')
  }
  if (current.status !== 'IN_PROGRESS') throw BAD_REQUEST('Only an IN_PROGRESS session can be restarted')
  if (!current.assignment || !current.accessToken) throw BAD_REQUEST('Public session is missing its access link')
  if (!current.accessToken.isActive || current.accessToken.expiresAt.getTime() < Date.now()) {
    throw FORBIDDEN('Public link is disabled or expired')
  }
  if (current.assignment.status !== 'PUBLISHED' || current.assignment.config.status !== 'PUBLISHED') {
    throw FORBIDDEN('Cognitive assignment is not publicly available')
  }
  if (isCompositeWrapper(current.assignment) || current.assignment.course?.isLibrary) {
    throw FORBIDDEN('此认知任务仅用于综合测评，不能单独作答或公开分发')
  }

  const validated = validateAssignment(current.assignment)
  const used = await prisma.cognitiveSession.count({
    where: { assignmentId: current.assignmentId, participantKey: current.participantKey },
  })
  if (used >= current.assignment.maxAttempts) throw CONFLICT('Maximum attempts reached for this assignment')

  const credential = createRecoveryCredential()
  const created = await prisma.$transaction(async (tx) => {
    const locked = await lockSession(tx, sessionId)
    if (!locked) throw NOT_FOUND('CognitiveSession not found')
    if (locked.status !== 'IN_PROGRESS') throw CONFLICT('Session is no longer IN_PROGRESS')

    const retiredAt = new Date()
    const retired = await tx.cognitiveSession.updateMany({
      where: { id: sessionId, status: 'IN_PROGRESS' },
      data: { status: 'ABANDONED', finishedAt: retiredAt },
    })
    if (retired.count !== 1) throw CONFLICT('Session is no longer IN_PROGRESS')

    const unifiedSnapshot = await sessionService.createUnifiedCognitiveSessionConfigSnapshot({
      db: tx as any,
      testType: validated.config.testType,
      configVersion: validated.config.configVersion,
      engineVersion: validated.config.engineVersion,
      scoringVersion: validated.config.scoringVersion,
      config: validated.parsedConfig,
    })

    return tx.cognitiveSession.create({
      data: {
        userId: null,
        participantKey: locked.participantKey,
        participantSnapshotEncrypted: locked.participantSnapshotEncrypted,
        assignmentId: locked.assignmentId,
        accessTokenId: current.accessTokenId,
        recoveryTokenHash: credential.hash,
        anonymousCode: locked.anonymousCode,
        configId: validated.config.id,
        testType: validated.config.testType,
        attemptNo: locked.attemptNo + 1,
        status: 'IN_PROGRESS',
        deliveryMode: 'FINAL_ONLY',
        configVersion: validated.config.configVersion,
        configSnapshotEncrypted: unifiedSnapshot.encrypted,
        engineVersion: validated.config.engineVersion,
        scoringVersion: validated.config.scoringVersion,
        randomSeed: randomBytes(16).toString('hex'),
        runtimeGeneration: 'UNIFIED_V1',
        compiledRuntimeHash: unifiedSnapshot.compiledRuntime.compiledRuntimeHash,
      },
    })
  })

  return {
    session: await sessionService.getPublicSession(credential.hash, created.id),
    recoveryToken: credential.token,
    anonymousCode: created.anonymousCode,
  }
}

export const createAccessTokenForAssignment = async (userId: string, role: UserRole, assignmentId: string, expiresAt: string, maxUses: number) => {
  if (!Number.isSafeInteger(maxUses) || maxUses < 0 || maxUses > MAX_TOKEN_USES) throw BAD_REQUEST('maxUses is invalid')
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: assignmentId }, include: { course: { select: { isLibrary: true } } } })
  if (!assignment) throw NOT_FOUND('Cognitive assignment not found')
  if (role !== UserRole.ADMIN && (role !== UserRole.TEACHER || assignment.createdBy !== userId)) throw FORBIDDEN('Not the creator of this assignment')
  if (assignment.status !== 'PUBLISHED') throw BAD_REQUEST('Only published assignments can create public links')
  if (isCompositeWrapper(assignment) || assignment.course?.isLibrary) throw BAD_REQUEST('此认知任务仅用于综合测评，不能单独作答或公开分发')
  const expiry = new Date(expiresAt)
  if (!Number.isFinite(expiry.getTime()) || expiry.getTime() <= Date.now()) throw BAD_REQUEST('expiresAt must be in the future')
  const rawToken = createAccessToken()
  const record = await prisma.cognitiveAccessToken.create({
    data: {
      assignmentId,
      token: null,
      tokenHash: hashPublicAccessToken(rawToken),
      tokenEncrypted: encryptPublicAccessToken(rawToken),
      createdBy: userId,
      expiresAt: expiry,
      maxUses,
    },
  })
  return { id: record.id, token: rawToken, expiresAt: record.expiresAt, maxUses: record.maxUses, usedCount: record.usedCount }
}

export const listAccessTokens = async (userId: string, role: UserRole, assignmentId: string) => {
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('Cognitive assignment not found')
  if (role !== UserRole.ADMIN && (role !== UserRole.TEACHER || assignment.createdBy !== userId)) throw FORBIDDEN('Not the creator of this assignment')
  const records = await prisma.cognitiveAccessToken.findMany({
    where: { assignmentId },
    orderBy: { createdAt: 'desc' },
    select: {
      id: true,
      token: true,
      tokenEncrypted: true,
      expiresAt: true,
      maxUses: true,
      usedCount: true,
      isActive: true,
      createdAt: true,
    },
  })
  return records.map(({ token, tokenEncrypted, ...record }) => ({
    ...record,
    token: token || (tokenEncrypted ? decryptPublicAccessToken(tokenEncrypted) : null),
  }))
}

export const disableAccessToken = async (userId: string, role: UserRole, assignmentId: string, tokenId: string) => {
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('Cognitive assignment not found')
  if (role !== UserRole.ADMIN && (role !== UserRole.TEACHER || assignment.createdBy !== userId)) throw FORBIDDEN('Not the creator of this assignment')
  const token = await prisma.cognitiveAccessToken.findUnique({ where: { id: tokenId } })
  if (!token || token.assignmentId !== assignmentId) throw NOT_FOUND('Public link not found')
  await prisma.cognitiveAccessToken.update({ where: { id: tokenId }, data: { isActive: false } })
}
