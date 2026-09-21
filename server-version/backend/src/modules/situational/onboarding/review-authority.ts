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
