import type { Prisma } from '@prisma/client'
import { prisma } from '../../config/database'
import type { AuthenticatedPrincipal } from '../../types'
import { resolveEducationProductMemberScope } from '../organization/educationProductAccess'

export type EducationToolEntry = 'SCHOOL' | 'TEACHER'
export type EducationAuthorableToolKind = 'SCALE' | 'FORM' | 'COMPOSITION'

// AccountDomain.SCHOOL is shared identity, not a product selector. Entries are
// server-selected by their authenticated router, never by a request body.
const entryProducts = { SCHOOL: 'HUISCHOOL', TEACHER: 'HUITEACHER' } as const

type EntryContext = {
  [E in EducationToolEntry]: { entry: E; product: typeof entryProducts[E] }
}[EducationToolEntry]

export type EducationToolAuthoringContext = EntryContext & {
  organizationId: string
  membershipId: string
  ownerUserId: string
  defaultVisibility: 'AUTHOR_PRIVATE'
  authorableToolKinds: readonly ['SCALE', 'FORM', 'COMPOSITION']
}

type Input = {
  principal: Pick<AuthenticatedPrincipal, 'userId' | 'accountDomain'>
  organizationId: string
  entry: EducationToolEntry
}
type Database = Prisma.TransactionClient | typeof prisma

/**
 * Current capability resolver, not a persistent grant or cached write permit.
 * Read-only capability routes authenticate the matching product session.
 * Future write services must resolve again inside
 * their mutation transaction and enforce resource ownership/version policy.
 * FORM is an authoring kind here, NOT an alias for a scored scale.
 * This grants no assessment publishing, report access or library approval.
 */
export async function resolveEducationToolAuthoringContext(
  input: Input, db: Database = prisma,
): Promise<EducationToolAuthoringContext | null> {
  if (input.principal.accountDomain !== 'SCHOOL' || !input.principal.userId
    || !input.organizationId || (input.entry !== 'SCHOOL' && input.entry !== 'TEACHER')) return null
  const product = entryProducts[input.entry]
  const member = await resolveEducationProductMemberScope({
    actorUserId: input.principal.userId,
    organizationId: input.organizationId,
    product,
    // School professional authority and Teacher product administration are
    // different entry policies. A Teacher administrator needs no psychology
    // grant; an administrator must never bypass School's professional filter.
    ...(input.entry === 'SCHOOL' ? { requiredCapability: 'PSYCHOLOGY_STAFF' as const } : {}),
  }, db)
  if (!member || (input.entry === 'TEACHER' && !member.productAdmin)) return null
  const entry: EntryContext = input.entry === 'SCHOOL'
    ? { entry: 'SCHOOL', product: 'HUISCHOOL' }
    : { entry: 'TEACHER', product: 'HUITEACHER' }
  return {
    ...entry,
    organizationId: member.organizationId,
    membershipId: member.membershipId,
    ownerUserId: input.principal.userId,
    defaultVisibility: 'AUTHOR_PRIVATE',
    authorableToolKinds: ['SCALE', 'FORM', 'COMPOSITION'],
  }
}

/** Minimal navigation hint. It does not list schools, tools or other members. */
export async function resolveEducationToolAuthoringCapabilities(input: Input, db: Database = prisma): Promise<{
  canAuthor: boolean
  authorableToolKinds: readonly EducationAuthorableToolKind[]
}> {
  const context = await resolveEducationToolAuthoringContext(input, db)
  return { canAuthor: context !== null, authorableToolKinds: context?.authorableToolKinds ?? [] }
}
