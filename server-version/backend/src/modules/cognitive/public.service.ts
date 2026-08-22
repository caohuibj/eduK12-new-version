import { randomBytes } from 'crypto'
import { UserRole } from '@prisma/client'
import { prisma } from '../../config/database'
import { createAccessToken, createRecoveryCredential, hashRecoveryToken } from '../../services/anonymousAccess'
import { encryptCognitivePayload } from './cognitive.security'
import { requireCognitiveRegistryEntry } from './cognitive.registry'
import * as sessionService from './session.service'
import * as trialService from './trial.service'
import * as completionService from './completion.service'
import { BAD_REQUEST, CONFLICT, FORBIDDEN, NOT_FOUND } from './cognitive.errors'
import { isCompositeWrapper } from './assignment.access'

const assertWindow = (token: { isActive: boolean; expiresAt: Date; maxUses: number; usedCount: number }) => {
  if (!token.isActive) throw FORBIDDEN('Public link is disabled')
  if (token.expiresAt.getTime() < Date.now()) throw FORBIDDEN('Public link has expired')
  if (token.maxUses > 0 && token.usedCount >= token.maxUses) throw CONFLICT('Public link reached its maximum uses')
}

const loadToken = async (value: string) => {
  const token = await prisma.cognitiveAccessToken.findUnique({
    where: { token: value },
    include: { assignment: { include: { config: true, course: true } } },
  })
  if (!token) throw NOT_FOUND('Public link not found')
  if (token.assignment.status !== 'PUBLISHED' || token.assignment.config.status !== 'PUBLISHED') {
    throw FORBIDDEN('Cognitive assignment is not publicly available')
  }
  return token as any
}

const validateAssignment = (assignment: any) => {
  if (assignment.opensAt && assignment.opensAt.getTime() > Date.now()) throw BAD_REQUEST('Cognitive assignment has not opened')
  if (assignment.dueAt && assignment.dueAt.getTime() < Date.now()) throw BAD_REQUEST('Cognitive assignment is past due')
  const config = assignment.config
  const entry = requireCognitiveRegistryEntry(config.testType, config.engineVersion, config.scoringVersion)
  const parsed = entry.configSchema.safeParse(config.config)
  if (!parsed.success) throw BAD_REQUEST('Cognitive config does not match its registry schema')
  return { config, parsedConfig: parsed.data }
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
        configVersion: config.configVersion,
        configSnapshotEncrypted: encryptCognitivePayload(parsedConfig),
        engineVersion: config.engineVersion,
        scoringVersion: config.scoringVersion,
        randomSeed: randomBytes(16).toString('hex'),
      },
    })
  })
  return { session: await sessionService.getPublicSession(credential.hash, created.id), recoveryToken: credential.token, anonymousCode: credential.anonymousCode }
}

export const getSession = async (sessionId: string, recoveryToken: string) =>
  sessionService.getPublicSession(hashRecoveryToken(recoveryToken), sessionId)

export const appendTrial = async (sessionId: string, recoveryToken: string, input: { trialIndex: number; payload?: unknown }) =>
  trialService.appendTrialForPublic(sessionId, hashRecoveryToken(recoveryToken), input)

export const completeSession = async (sessionId: string, recoveryToken: string) =>
  completionService.completeSessionForPublic(sessionId, hashRecoveryToken(recoveryToken))

export const createAccessTokenForAssignment = async (userId: string, role: UserRole, assignmentId: string, expiresAt: string, maxUses: number) => {
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('Cognitive assignment not found')
  if (role !== UserRole.ADMIN && (role !== UserRole.TEACHER || assignment.createdBy !== userId)) throw FORBIDDEN('Not the creator of this assignment')
  if (assignment.status !== 'PUBLISHED') throw BAD_REQUEST('Only published assignments can create public links')
  if (isCompositeWrapper(assignment)) throw BAD_REQUEST('此认知任务仅用于综合测评，不能单独作答或公开分发')
  const expiry = new Date(expiresAt)
  if (expiry.getTime() <= Date.now()) throw BAD_REQUEST('expiresAt must be in the future')
  const record = await prisma.cognitiveAccessToken.create({ data: { assignmentId, token: createAccessToken(), createdBy: userId, expiresAt: expiry, maxUses } })
  return { id: record.id, token: record.token, expiresAt: record.expiresAt, maxUses: record.maxUses, usedCount: record.usedCount }
}

export const listAccessTokens = async (userId: string, role: UserRole, assignmentId: string) => {
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('Cognitive assignment not found')
  if (role !== UserRole.ADMIN && (role !== UserRole.TEACHER || assignment.createdBy !== userId)) throw FORBIDDEN('Not the creator of this assignment')
  return prisma.cognitiveAccessToken.findMany({ where: { assignmentId }, orderBy: { createdAt: 'desc' }, select: { id: true, token: true, expiresAt: true, maxUses: true, usedCount: true, isActive: true, createdAt: true } })
}

export const disableAccessToken = async (userId: string, role: UserRole, assignmentId: string, tokenId: string) => {
  const assignment = await prisma.cognitiveAssignment.findUnique({ where: { id: assignmentId } })
  if (!assignment) throw NOT_FOUND('Cognitive assignment not found')
  if (role !== UserRole.ADMIN && (role !== UserRole.TEACHER || assignment.createdBy !== userId)) throw FORBIDDEN('Not the creator of this assignment')
  const token = await prisma.cognitiveAccessToken.findUnique({ where: { id: tokenId } })
  if (!token || token.assignmentId !== assignmentId) throw NOT_FOUND('Public link not found')
  await prisma.cognitiveAccessToken.update({ where: { id: tokenId }, data: { isActive: false } })
}
