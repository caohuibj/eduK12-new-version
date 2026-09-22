import { instrumentContentSchema, publicationContentDigest, type SituationalInstrumentSourceV1 } from './schema'

export async function verifyGitHubPublicationReview(source: SituationalInstrumentSourceV1, get: (route: string) => Promise<any>, contentAt: (sha: string, path: string) => unknown): Promise<void> {
  const review = source.publication.review
  if (source.publication.releaseStatus !== 'PUBLISHED' || review?.kind !== 'github-review') return
  const match = review.reviewUrl.match(/\/pull\/(\d+)#pullrequestreview-(\d+)$/)!
  const base = '/repos/caohuibj/eduK12-new-version'
  const pr = await get(`${base}/pulls/${match[1]}`)
  const approval = await get(`${base}/pulls/${match[1]}/reviews/${match[2]}`)
  if (approval.state !== 'APPROVED' || approval.user?.type !== 'User' || approval.user?.login === pr.user?.login || pr.base?.repo?.full_name !== 'caohuibj/eduK12-new-version') throw new Error('Publication requires an independent human approval on this repository')
  const permission = await get(`${base}/collaborators/${encodeURIComponent(approval.user.login)}/permission`)
  if (!['write', 'maintain', 'admin'].includes(permission.permission)) throw new Error('Publication reviewer lacks repository write permission')
  let last = approval
  for (let page = 1; ; page++) {
    const reviews = await get(`${base}/pulls/${match[1]}/reviews?per_page=100&page=${page}`)
    for (const candidate of reviews) if (candidate.user?.login === approval.user.login && candidate.id > last.id && candidate.state !== 'COMMENTED') last = candidate
    if (reviews.length < 100) break
  }
  if (last.state !== 'APPROVED') throw new Error('Publication approval was superseded or dismissed')
  const id = source.content.identity
  const p = `server-version/backend/src/modules/situational/instruments/${id.instrumentKey}/${id.instrumentVersion}/instrument.json`
  const approvedContent = instrumentContentSchema.parse(contentAt(approval.commit_id, p))
  if (publicationContentDigest(approvedContent) !== review.contentDigest || review.contentDigest !== publicationContentDigest(source.content)) throw new Error('Publication review does not cover current content')
}

/** Verify scientific approvals even for DRAFT content; publication is orthogonal. */
export async function verifyGitHubScientificReview(source: SituationalInstrumentSourceV1, get: (route: string) => Promise<any>, contentAt: (sha: string, path: string) => unknown): Promise<void> {
  const { evaluateSituationalScientificGovernance, scientificEvidenceDigest } = await import('./scientific-governance')
  const { scientificSchema } = await import('./scientific-schema')
  const { hashSituationRuntimeDefinition } = await import('../situation-runtime-definition')
  const decision = evaluateSituationalScientificGovernance(source)
  if (!decision.valid) throw new Error(decision.errors.join(','))
  const review = source.scientific.review
  if (!review) return
  const match = review.reviewUrl.match(/\/pull\/(\d+)#pullrequestreview-(\d+)$/)!
  const base = '/repos/caohuibj/eduK12-new-version'
  const pr = await get(`${base}/pulls/${match[1]}`)
  const approval = await get(`${base}/pulls/${match[1]}/reviews/${match[2]}`)
  if (approval.state !== 'APPROVED' || approval.user?.type !== 'User' || approval.user?.login === pr.user?.login || pr.base?.repo?.full_name !== 'caohuibj/eduK12-new-version') throw new Error('Scientific promotion requires independent human approval')
  if (approval.user.login !== review.reviewer || Date.parse(approval.submitted_at) !== Date.parse(review.reviewedAt)) throw new Error('Scientific reviewer/time does not match GitHub')
  const permission = await get(`${base}/collaborators/${encodeURIComponent(approval.user.login)}/permission`)
  if (!['write', 'maintain', 'admin'].includes(permission.permission)) throw new Error('Scientific reviewer lacks repository write permission')
  let last = approval
  for (let page = 1; ; page++) {
    const reviews = await get(`${base}/pulls/${match[1]}/reviews?per_page=100&page=${page}`)
    for (const candidate of reviews) if (candidate.user?.login === approval.user.login && candidate.id > last.id && candidate.state !== 'COMMENTED') last = candidate
    if (reviews.length < 100) break
  }
  if (last.state !== 'APPROVED') throw new Error('Scientific approval was superseded or dismissed')
  const id = source.content.identity
  const root = `server-version/backend/src/modules/situational/instruments/${id.instrumentKey}/${id.instrumentVersion}`
  const content = instrumentContentSchema.parse(contentAt(approval.commit_id, `${root}/instrument.json`))
  const declaration = scientificSchema.parse(contentAt(approval.commit_id, `${root}/scientific.json`))
  if (content.identity.instrumentKey !== id.instrumentKey || content.identity.instrumentVersion !== id.instrumentVersion || hashSituationRuntimeDefinition(content.definition) !== decision.executionRef.definitionHash || scientificEvidenceDigest(declaration) !== scientificEvidenceDigest(source.scientific)) throw new Error('Scientific approval does not cover current execution and evidence')
}
