import type { ScaleLibraryEntry } from '../../api/scaleLibrary'

// Display labels for the existing catalog constructDomainSchema, not a new taxonomy.
export const SCALE_CONSTRUCT_DOMAIN_OPTIONS = [
  ['WELL_BEING', '身心健康'],
  ['EXECUTIVE_FUNCTION', '执行功能'],
  ['SELF_REGULATION', '自我调节'],
  ['SOCIAL_EMOTIONAL', '社会情绪'],
  ['SCHOOL_BELONGING', '学校归属感'],
  ['MOTIVATION', '动机'],
  ['SELF_EFFICACY', '自我效能'],
  ['RESILIENCE', '心理韧性'],
  ['PERSONALITY', '人格'],
  ['BEHAVIORAL_DIFFICULTIES', '行为与困难'],
  ['SCHOOL_CLIMATE', '学校氛围'],
  ['ENGAGEMENT', '投入'],
  ['PARENT_OBSERVATION', '家长观察'],
  ['TEACHER_OBSERVATION', '教师观察'],
] as const

export function ScaleLibraryClassification({ construct }: { construct?: ScaleLibraryEntry['construct'] }) {
  if (!construct) return null
  const domains = [...new Set([construct.primaryDomain, ...(construct.secondaryDomains ?? [])].filter(Boolean))]
  const overlapTags = [...new Set(construct.constructOverlapTags ?? [])]
  if (!domains.length && !overlapTags.length) return null
  return <div role="group" aria-label="构念与交叉标签" className="mt-3 flex flex-wrap gap-2 text-sm">
    {domains.map(domain => {
      const label = SCALE_CONSTRUCT_DOMAIN_OPTIONS.find(([key]) => key === domain)?.[1] ?? domain
      return <span key={domain} aria-label={`构念：${label}`} className="max-w-full break-words rounded bg-gray-100 px-2 py-1 text-gray-700">{label}</span>
    })}
    {overlapTags.map(tag => <span key={tag} aria-label={`交叉标签：${tag}`} className="max-w-full break-words rounded bg-blue-50 px-2 py-1 text-blue-800">{tag}</span>)}
  </div>
}
