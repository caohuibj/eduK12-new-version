import path from 'node:path'
import { execFileSync } from 'node:child_process'
import { instrumentSourceSchema } from '../modules/situational/onboarding/schema'
import { evaluateSituationalPublicationGate } from '../modules/situational/onboarding/publication-gate'
import { immutableReleaseIssues, publicationReviewIssues } from '../modules/situational/onboarding/instrument-registry'
import { verifyGitHubPublicationReview } from '../modules/situational/onboarding/review-authority'
import { classifySituationalPath } from '../modules/situational/onboarding/path-policy'

const repo = execFileSync('git', ['rev-parse', '--show-toplevel'], { encoding: 'utf8' }).trim()
const backend = path.join(repo, 'server-version/backend')
const prefix = 'server-version/backend/src/modules/situational/instruments/'
const args = process.argv.slice(2)
const option = (name: string) => args.includes(name) ? args[args.indexOf(name) + 1] : undefined
const git = (...a: string[]) => execFileSync('git', a, { cwd: repo, encoding: 'utf8' })
async function main() {
  const switches = new Set(['--all', '--json', '--content-only', '--verify-reviews'])
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--base') { i++; continue }
    if (!switches.has(args[i]!)) throw new Error(`Unknown onboarding option: ${args[i]}`)
  }
  const { discoverSources } = await import('../../scripts/generate-situational-instruments.mjs')
  const base = option('--base')
  if ((args.includes('--content-only') || args.includes('--base')) && (!base || !/^[a-f0-9]{40}$/.test(base))) throw new Error('--base requires a full 40-character commit SHA')
  if (base) git('cat-file', '-e', `${base}^{commit}`)
  const raw = discoverSources(path.join(repo, prefix))
  const sources = raw.map((s) => instrumentSourceSchema.parse({ content: s.content, publication: s.publication, scientific: s.scientific }))
  const blockers: string[] = []
  if (args.includes('--verify-reviews')) {
    if (!process.env.GITHUB_TOKEN || !base) throw new Error('--verify-reviews requires GITHUB_TOKEN and --base')
    const get = async (route: string) => {
      const response = await fetch('https://api.github.com' + route, { signal: AbortSignal.timeout(15000), headers: { Authorization: `Bearer ${process.env.GITHUB_TOKEN}`, Accept: 'application/vnd.github+json' } })
      if (!response.ok) throw new Error(`GitHub review verification failed: HTTP ${response.status}`)
      return response.json()
    }
    for (const source of sources) {
      const id = source.content.identity
      const p = `${prefix}${id.instrumentKey}/${id.instrumentVersion}/publication.json`
      let prior: unknown
      try { prior = JSON.parse(git('show', `${base}:${p}`)) } catch { prior = null }
      if (JSON.stringify(prior) !== JSON.stringify(source.publication)) {
        try { await verifyGitHubPublicationReview(source, get, (sha, p) => JSON.parse(git('show', `${sha}:${p}`))) }
        catch (e) { blockers.push(`REVIEW_AUTHORITY:${id.instrumentKey}:${String(e)}`) }
      }
    }
  }
  try { execFileSync(process.execPath, [path.join(backend, 'scripts/generate-situational-instruments.mjs'), '--check'], { cwd: backend, stdio: 'pipe' }) } catch { blockers.push('MANIFEST_DRIFT') }
  for (const source of sources) blockers.push(...publicationReviewIssues(source).map(i => `${source.content.identity.instrumentKey}:${i}`))
  if (base) {
    const priorPaths = git('ls-tree', '-r', '--name-only', base, '--', prefix).split('\n').filter(p => p.endsWith('/instrument.json'))
    const prior = priorPaths.map(p => {
      const read = (name: string) => JSON.parse(git('show', `${base}:${p.replace('instrument.json', name + '.json')}`))
      return instrumentSourceSchema.parse({ content: read('instrument'), publication: read('publication'), scientific: read('scientific') })
    })
    blockers.push(...immutableReleaseIssues(prior, sources))
    if (args.includes('--content-only')) {
      const paths = [...git('diff', '--name-only', '-z', base, '--').split('\0'), ...git('ls-files', '--others', '--exclude-standard', '-z').split('\0')].filter(Boolean)
      blockers.push(...paths.filter(p => classifySituationalPath(p) === 'SHARED_CORE').map(p => `SHARED_CORE_CHANGE:${p}`))
    }
  }
  const decisions = sources.map(s => ({ releaseStatus: s.publication.releaseStatus, ...evaluateSituationalPublicationGate(s) }))
  const ok = !blockers.length && decisions.every(d => d.releaseStatus !== 'PUBLISHED' || d.eligibleToPublish)
  const output = { schemaVersion: 1, ok, blockers, decisions }
  console.log(args.includes('--json') ? JSON.stringify(output, null, 2) : [ok ? 'PASS' : 'BLOCKED', ...blockers, ...decisions.map(d => `${d.identity?.instrumentKey}: ${d.releaseStatus}, eligible=${d.eligibleToPublish}, contentDigest=${d.publicationContentDigest}`)].join('\n'))
  if (!ok) process.exitCode = 1
}
main().catch(e => { console.error(String(e)); process.exitCode = 1 })
