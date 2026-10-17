/**
 * Synthetic fixture for e2e/survey-candidate-browser.cjs. Run with Node 24 in
 * the already-built backend image (mount this file; do not rebuild the image):
 *
 * SURVEY_CANDIDATE_ISOLATED=1 \
 * SURVEY_CANDIDATE_FIXTURE=/private/fixture.json \
 * node /app/scripts/survey-candidate-fixture.ts
 *
 * DATABASE_URL_ADMIN (preferred) or DATABASE_URL must name the disposable
 * survey_candidate_ci_test DB on the isolated host-network loopback service.
 * SURVEY_CI_SOURCE_SHA is the exact 40-hex candidate commit. Set browser origins
 * with SURVEY_CANDIDATE_SURVEY_URL and SURVEY_CANDIDATE_ADMIN_URL (HTTPS,
 * canonical hosts, optional isolated proxy port).
 * Migrations must already be applied. JWT_SECRET, SURVEY_MFA_ENCRYPTION_KEY,
 * DATA_ENCRYPTION_KEY and all runtime settings must match the candidate API.
 * The output contains synthetic credentials: mode 0600, NEVER upload it.
 * It creates only actors, one unpublished project, four unpublished drafts,
 * and one synthetic published Form source. Browser UI owns grants/import,
 * wave composition/publication, every participant response and both FINALs.
 * Cleanup is destruction of this disposable DB/container, not production SQL.
 */
const assert = require('node:assert/strict')
const fs = require('node:fs')
const path = require('node:path')
const { randomUUID, randomBytes, createCipheriv } = require('node:crypto')
const dns = require('node:dns').promises

async function main() {
  assert.equal(process.env.SURVEY_CANDIDATE_ISOLATED, '1', 'Explicit isolated-candidate opt-in required')
  process.env.DATABASE_URL = process.env.DATABASE_URL_ADMIN || process.env.DATABASE_URL
  const database = new URL(process.env.DATABASE_URL || '')
  assert.equal(database.pathname, '/survey_candidate_ci_test', 'Only the disposable survey_candidate_ci_test DB is allowed')
  const host = database.hostname.replace(/^\[|\]$/g, '')
  assert(['localhost', '127.0.0.1', '::1'].includes(host), 'DB must use the isolated host-network loopback service')
  const addresses = await dns.lookup(host, { all: true })
  assert(addresses.length && addresses.every(({ address }) => address === '::1' || address === '127.0.0.1'),
    'DB resolves outside loopback')
  const output = path.resolve(process.env.SURVEY_CANDIDATE_FIXTURE || '')
  assert(process.env.SURVEY_CANDIDATE_FIXTURE, 'SURVEY_CANDIDATE_FIXTURE is required')
  assert(!fs.existsSync(output), 'Refuse to replace a previously issued fixture')
  assert(/^[a-f0-9]{64}$/i.test(process.env.SURVEY_MFA_ENCRYPTION_KEY || ''), 'A synthetic MFA encryption key is required')
  const backend = path.resolve(process.env.SURVEY_CANDIDATE_BACKEND_ROOT || (fs.existsSync('/app/dist/config/database.js') ? '/app' : path.join(__dirname, '..')))
  const { prisma } = require(path.join(backend, 'dist/config/database.js'))
  const { generateToken } = require(path.join(backend, 'dist/utils/jwt.js'))
  const { hashPassword } = require(path.join(backend, 'dist/utils/password.js'))
  const { createDraft, updateDraft, validateDraftForPreview } = require(path.join(backend, 'dist/modules/survey/builder.service.js'))
  const surveyUrl = new URL(process.env.SURVEY_CANDIDATE_SURVEY_URL || 'https://survey.eduk12.top')
  const adminUrl = new URL(process.env.SURVEY_CANDIDATE_ADMIN_URL || 'https://training.eduk12.top')
  assert.equal(surveyUrl.hostname, 'survey.eduk12.top')
  assert.equal(adminUrl.hostname, 'training.eduk12.top')
  for (const url of [surveyUrl, adminUrl]) {
    assert.equal(url.protocol, 'https:', 'A trusted test certificate is required, never disable certificate checks')
    assert(!url.username && !url.password && url.pathname === '/' && !url.search && !url.hash)
  }
  assert(/^[a-f0-9]{40}$/.test(process.env.SURVEY_CI_SOURCE_SHA || ''), 'Exact candidate source SHA required')
  const runId = randomUUID().slice(0, 8)
  const adminPassword = 'Candidate1!' + randomBytes(18).toString('hex')
  const secret = randomBytes(20), iv = randomBytes(12)
  const cipher = createCipheriv('aes-256-gcm', Buffer.from(process.env.SURVEY_MFA_ENCRYPTION_KEY, 'hex'), iv)
  const encrypted = Buffer.concat([cipher.update(secret), cipher.final()])
  const secretCipher = [iv, cipher.getAuthTag(), encrypted].map(x => x.toString('base64url')).join('.')
  const options = [{ optionKey: 'a', label: 'Synthetic A' }, { optionKey: 'b', label: 'Synthetic B' }]
  const definitions = {
    FORM: { schemaVersion: 1, pages: [1, 2].map(n => ({ pageKey: 'p' + n, title: 'Synthetic Form page ' + n,
      questions: [{ itemKey: 'q' + n, type: 'SINGLE', prompt: 'Synthetic Form question ' + n,
        required: true, options, rows: [] }] })) },
    SCALE: { schemaVersion: 1, presentationMode: 'ONE_BY_ONE', respondentType: 'participant_self_report',
      responseOptions: options.map((o, i) => ({ ...o, score: i ? 3 : 1 })),
      dimensions: [{ dimensionKey: 'd', label: 'Synthetic descriptive scale', direction: 'descriptive' }],
      aggregation: 'sum', items: [1, 2].map(n => ({ itemKey: 'q' + n, prompt: 'Synthetic Scale question ' + n,
        required: true, reverse: n === 2, dimensionKeys: ['d'] })) },
    SJT: { schemaVersion: 2, respondentType: 'participant_self_report', title: 'Synthetic scenes', author: 'Synthetic fixture',
      sourceNote: 'Self-authored synthetic software acceptance data only', licenseStatus: 'self_authored',
      redistribution: 'allowed', orderPolicy: 'FIXED', metrics: [{ metricKey: 'm', label: 'Descriptive', direction: 'descriptive' }],
      scoring: { modelKey: 'AUTHOR_KEY_SUM', modelVersion: '1', sourceNote: 'Synthetic scoring key' },
      scenes: [1, 2].map(n => ({ sceneKey: 'scene' + n, title: 'Synthetic Scene ' + n,
        stimulus: 'A fictional software-check scenario; no personal information.',
        questions: [{ questionKey: 'q' + n, prompt: 'Synthetic SJT question ' + n, responseType: 'SINGLE',
          required: true, allowRefusal: true, options: options.map((o, i) => ({ ...o, contributions: { m: i ? 3 : 1 } })) }] })) },
    COGNITIVE: { schemaVersion: 1, templateKey: 'gonogo-software-frame-v1',
      feedback: { mode: 'DESCRIPTIVE', metricKeys: ['hitRate', 'goMedianRtMs'], release: 'AFTER_FINAL' } },
  }
  try {
    const admin = await prisma.user.create({ data: { username: 'candidate_admin_' + runId,
      passwordHash: await hashPassword(adminPassword), role: 'ADMIN', platformRole: 'SYSTEM_ADMIN', accountDomain: 'LEGACY' } })
    const researcher = await prisma.user.create({ data: { username: 'candidate_researcher_' + runId,
      passwordHash: await hashPassword('Unused1!' + randomBytes(18).toString('hex')), role: 'STUDENT', accountDomain: 'SURVEY' } })
    await prisma.surveyAccount.create({ data: { userId: researcher.id, loginName: researcher.username, normalizedLogin: researcher.username } })
    await prisma.surveyResearcherGrant.create({ data: { userId: researcher.id, grantedBy: admin.id, status: 'ACTIVE' } })
    await prisma.surveyMfaCredential.create({ data: { userId: researcher.id, enabled: true, secretCipher, enabledAt: new Date() } })
    const project = await prisma.surveyProject.create({ data: { id: randomUUID(), ownerUserId: researcher.id,
      title: 'Synthetic candidate study ' + runId, description: 'Isolated CI browser fixture, no real participants.', collectionMode: 'SINGLE_UNLINKED' } })
    const instruments = []
    for (const [kind, definition] of Object.entries(definitions)) {
      let draft = await createDraft(researcher.id, project.id, { requestId: randomUUID(), kind,
        instrumentKey: kind.toLowerCase(), title: 'Synthetic ' + kind })
      draft = await updateDraft(researcher.id, project.id, draft.id, { revision: draft.revision, title: draft.title, definition })
      const validation = await validateDraftForPreview(researcher.id, project.id, draft.id)
      assert.equal(validation.ok, true, 'Synthetic ' + kind + ' must compile through candidate code')
      instruments.push({ id: draft.id, kind, key: draft.instrumentKey, title: draft.title })
    }
    const questionnaire = await prisma.questionnaire.create({ data: { code: 'candidate_source_' + runId,
      name: 'Synthetic granted Form ' + runId, status: 'PUBLISHED', creatorId: admin.id } })
    const section = await prisma.questionnaireFormSection.create({ data: { questionnaireId: questionnaire.id,
      title: 'Synthetic granted Form ' + runId, position: 0, contextSection: false } })
    await prisma.questionnaireFormItem.create({ data: { questionnaireId: questionnaire.id, sectionId: section.id,
      type: 'single_choice', label: 'Synthetic catalog category', required: true, position: 0, sectionPosition: 0,
      options: [{ value: 'yes', label: 'Yes' }, { value: 'no', label: 'No' }] } })
    const token = (user, domain, mfa = false) => generateToken({ userId: user.id, username: user.username,
      role: user.role, accountDomain: domain, tokenVersion: user.tokenVersion,
      ...(mfa ? { mfaVerifiedAt: Math.floor(Date.now() / 1000) } : {}) })
    const cookies = (name, value, domain) => [{ name, value, domain, path: '/', httpOnly: true, secure: true, sameSite: 'Lax' }]
    const fixture = { schemaVersion: 1, isolated: true, sourceCommit: process.env.SURVEY_CI_SOURCE_SHA, runId, createdAt: new Date().toISOString(),
      surveyUrl: surveyUrl.origin, adminUrl: adminUrl.origin,
      project: { id: project.id, title: project.title }, instruments,
      sourceForm: { id: 'questionnaire:' + section.id, title: section.title },
      researcher: { id: researcher.id, username: researcher.username, totpSecretBase64: secret.toString('base64') },
      adminPassword, adminCookies: cookies('ptool_session', token(admin, 'LEGACY'), 'training.eduk12.top'),
      researcherCookies: cookies('huisurvey_research_session', token(researcher, 'SURVEY', true), 'survey.eduk12.top') }
    fs.mkdirSync(path.dirname(output), { recursive: true, mode: 0o700 })
    fs.writeFileSync(output, JSON.stringify(fixture, null, 2), { flag: 'wx', mode: 0o600 })
    fs.chmodSync(output, 0o600)
    console.log(JSON.stringify({ fixtureCreated: true, schemaVersion: 1, runId, unpublishedTools: instruments.length,
      credentials: 'Private fixture only; do not upload fixture or browser storage' }))
  } finally { await prisma.$disconnect() }
}
main().catch(error => { console.error('Synthetic Survey fixture failed:', error.message); process.exitCode = 1 })
