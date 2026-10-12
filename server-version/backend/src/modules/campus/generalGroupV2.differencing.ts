/**
 * School general V2 overlap compares the actual canonical FINAL contributors,
 * never the invited/frozen Run roster. Identities remain server-side and the
 * permanent release record stores only a digest.
 */
export function exactGeneralContributors(manifest:unknown, expectedN:unknown):string[] {
  if(!Number.isInteger(expectedN)||typeof expectedN!=='number'||expectedN<5
    ||!Array.isArray(manifest)||manifest.length!==expectedN)
    throw new Error('CAMPUS_GENERAL_CONTRIBUTORS_INVALID')
  const ids=manifest.map(entry=>{
    if(!entry||typeof entry!=='object'||Array.isArray(entry)
      ||typeof entry.subjectUserId!=='string'||!entry.subjectUserId)
      throw new Error('CAMPUS_GENERAL_CONTRIBUTORS_INVALID')
    return entry.subjectUserId as string
  })
  if(new Set(ids).size!==ids.length)throw new Error('CAMPUS_GENERAL_CONTRIBUTORS_INVALID')
  return ids.sort()
}

/**
 * An identical or disjoint population cannot reveal a single changed person's
 * contribution by subtracting comparable aggregate results. With partial
 * overlap, suppress only when one side has an identifiable 1–4-person delta.
 * Separate resources are compared by the caller only when exact family/key/
 * version matches. Standard mode never enables this additional restriction.
 */
export function unsafeComparableGeneralOverlap(
  current:readonly string[],prior:readonly string[],minDelta=5,
):boolean{
  const other=new Set(prior)
  let common=0
  for(const userId of current)if(other.has(userId))common++
  const currentOnly=current.length-common
  const priorOnly=prior.length-common
  return common>0&&((currentOnly>0&&currentOnly<minDelta)
    ||(priorOnly>0&&priorOnly<minDelta))
}
