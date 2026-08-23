// Round 1 PR7 browser gate:
// teacher creates and publishes an experience-profile P1 task -> student completes every
// formal trial -> result/history -> teacher downloads summary and research exports.
const assert = require('assert/strict')
const { execFileSync } = require('child_process')
const fs = require('fs')
const path = require('path')
const { chromium } = require('../backend/node_modules/playwright-core')
const bcrypt = require('../backend/node_modules/bcryptjs')

const SERVER_DIR = path.resolve(__dirname, '..')
const ENV_FILE = process.env.COGNITIVE_GATE_ENV_FILE || path.join(SERVER_DIR, '.env')
const BASE_URL = process.env.COGNITIVE_E2E_BASE_URL || 'http://127.0.0.1'
const SHOT_DIR = path.join(SERVER_DIR, 'docs', 'e2e-round1-screenshots')
const DOWNLOAD_DIR = process.env.COGNITIVE_E2E_DOWNLOAD_DIR || '/tmp/cognitive-round1-e2e-downloads'
const configuredBrowserExecutable = process.env.COGNITIVE_E2E_BROWSER_EXECUTABLE
const browserCandidates = configuredBrowserExecutable
  ? [configuredBrowserExecutable]
  : [
      chromium.executablePath(),
      '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
      '/usr/bin/google-chrome',
      '/usr/bin/google-chrome-stable',
      '/usr/bin/chromium',
      '/usr/bin/chromium-browser',
    ]
const BROWSER_EXECUTABLE = browserCandidates.find((candidate) => fs.existsSync(candidate))

const TEACHER_ID = '70000000-0000-4000-8000-000000000701'
const STUDENT_ID = '70000000-0000-4000-8000-000000000702'
const COURSE_ID = '70000000-0000-4000-8000-000000000703'
const ENROLLMENT_ID = '70000000-0000-4000-8000-000000000704'
const TEACHER_USERNAME = 'round1e2eteacher'
const STUDENT_USERNAME = 'round1e2estudent'
const E2E_PASSWORD = 'round1-e2e-pass'
const COURSE_TITLE = 'Round 1 PR7 E2E Course'
const COURSE_CODE = 'R1PR7E2E'
const assignmentTitle = `PR7 GoNoGo Experience ${Date.now()}`

fs.mkdirSync(SHOT_DIR, { recursive: true })
fs.mkdirSync(DOWNLOAD_DIR, { recursive: true })

const compose = (...args) => execFileSync(
  'docker',
  ['compose', '--env-file', ENV_FILE, ...args],
  { cwd: SERVER_DIR, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] },
)

const installFixture = () => {
  assert.ok(fs.existsSync(ENV_FILE), `Gate env file not found: ${ENV_FILE}`)
  const passwordHash = bcrypt.hashSync(E2E_PASSWORD, 10)
  const sql = `
    INSERT INTO users (id, username, password_hash, role, nickname, is_active, is_frozen, teacher_approved, created_at, updated_at)
    VALUES
      ('${TEACHER_ID}', '${TEACHER_USERNAME}', '${passwordHash}', 'TEACHER', 'Round 1 E2E Teacher', true, false, true, now(), now()),
      ('${STUDENT_ID}', '${STUDENT_USERNAME}', '${passwordHash}', 'STUDENT', 'Round 1 E2E Student', true, false, true, now(), now())
    ON CONFLICT (username) DO UPDATE SET
      password_hash = EXCLUDED.password_hash,
      role = EXCLUDED.role,
      is_active = true,
      is_frozen = false,
      teacher_approved = true,
      updated_at = now();

    INSERT INTO courses (id, title, description, status, course_code, creator_id, created_at, updated_at, is_recruiting, is_library)
    VALUES ('${COURSE_ID}', '${COURSE_TITLE}', 'PR7 browser gate fixture', 'PUBLISHED', '${COURSE_CODE}', '${TEACHER_ID}', now(), now(), true, false)
    ON CONFLICT (id) DO UPDATE SET
      title = EXCLUDED.title,
      status = 'PUBLISHED',
      creator_id = EXCLUDED.creator_id,
      is_recruiting = true,
      is_library = false,
      updated_at = now();

    INSERT INTO course_students (id, course_id, student_id, status, joined_at)
    VALUES ('${ENROLLMENT_ID}', '${COURSE_ID}', '${STUDENT_ID}', 'ACTIVE', now())
    ON CONFLICT (course_id, student_id) DO UPDATE SET status = 'ACTIVE';
  `
  compose('exec', '-T', 'postgres', 'psql', '-U', 'ptool', '-d', 'ptool', '-v', 'ON_ERROR_STOP=1', '-c', sql)
}

const login = async (page, route, username) => {
  await page.goto(`${BASE_URL}${route}`)
  await page.getByPlaceholder('请输入用户名').fill(username)
  await page.getByPlaceholder('请输入密码').fill(E2E_PASSWORD)
  await Promise.all([
    page.waitForURL((url) => !url.pathname.includes('login'), {
      timeout: 60000,
      waitUntil: 'domcontentloaded',
    }),
    page.getByRole('button', { name: '登录', exact: true }).click(),
  ])
}

const chooseOptionContaining = async (select, requiredParts) => {
  const options = await select.locator('option').evaluateAll((nodes) => nodes.map((node) => ({
    value: node.value,
    text: node.textContent || '',
  })))
  const match = options.find((option) => requiredParts.every((part) => option.text.includes(part)))
  assert.ok(match, `Missing select option containing: ${requiredParts.join(', ')}`)
  await select.selectOption(match.value)
  return match
}

const createAndPublish = async (page) => {
  await login(page, '/teacher/account-login', TEACHER_USERNAME)
  await page.goto(`${BASE_URL}/cognitive-assignments`)
  await page.getByRole('heading', { name: '认知任务' }).waitFor({ state: 'visible', timeout: 15000 })
  await page.getByRole('button', { name: /新建认知任务/ }).click()
  await page.getByPlaceholder('标题').fill(assignmentTitle)

  const selects = page.locator('select')
  await chooseOptionContaining(selects.nth(0), [COURSE_TITLE, COURSE_CODE])
  await chooseOptionContaining(selects.nth(1), ['gonogo', '1.0.0'])
  await page.waitForFunction(() => {
    const profile = document.querySelectorAll('select')[2]
    return profile instanceof HTMLSelectElement && !profile.disabled
  })
  await selects.nth(2).selectOption('experience')
  await page.getByText('体验版，结果仅供体验。').waitFor({ state: 'visible' })
  await page.screenshot({ path: path.join(SHOT_DIR, '01-teacher-profile-create.png'), fullPage: true })

  await Promise.all([
    page.waitForURL('**/cognitive-assignments/**', { timeout: 15000 }),
    page.getByRole('button', { name: '保存草稿' }).click(),
  ])
  const assignmentId = page.url().split('/cognitive-assignments/')[1]
  assert.ok(assignmentId, 'Assignment id missing after teacher create')
  await page.getByText(/^草稿/).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: /发布/ }).click()
  await page.getByText(/^已发布/).waitFor({ state: 'visible', timeout: 15000 })
  await page.screenshot({ path: path.join(SHOT_DIR, '02-teacher-published.png'), fullPage: true })
  return assignmentId
}

const runPractice = async (page) => {
  const responseButton = page.getByRole('button', { name: 'respond' })
  await page.getByRole('button', { name: '开始练习' }).click()
  for (let index = 0; index < 4; index += 1) {
    await page.getByText(`练习 ${index + 1} / 4`, { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    const expectedClass = index % 2 === 0 ? 'bg-green-500' : 'bg-red-500'
    await page.waitForFunction((className) => document.querySelector('[aria-label="respond"]')?.classList.contains(className), expectedClass)
    if (index % 2 === 0) {
      await page.waitForTimeout(150)
      await responseButton.click()
    }
    await page.getByText('正确', { exact: true }).waitFor({ state: 'visible', timeout: 5000 })
  }
  await page.getByText('练习正确 4 / 4', { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: '开始正式测验' }).click()
}

const runFormalGonogo = async (page) => {
  const responseButton = page.getByRole('button', { name: 'respond' })
  for (let trialIndex = 0; trialIndex < 40; trialIndex += 1) {
    await page.getByText(`试次 ${trialIndex + 1} / 40`, { exact: true }).waitFor({ state: 'visible', timeout: 10000 })
    await page.waitForFunction(() => {
      const button = document.querySelector('[aria-label="respond"]')
      return button?.classList.contains('bg-green-500') || button?.classList.contains('bg-red-500')
    })
    if (trialIndex === 0) {
      await page.screenshot({ path: path.join(SHOT_DIR, '03-student-formal-trial.png'), fullPage: true })
    }
    const className = await responseButton.getAttribute('class')
    if (className?.includes('bg-green-500')) {
      await page.waitForTimeout(150)
      await responseButton.click()
    }
  }
  await page.getByRole('button', { name: '完成测评' }).waitFor({ state: 'visible', timeout: 10000 })
  await page.getByRole('button', { name: '完成测评' }).click()
}

const completeAsStudent = async (browser) => {
  const context = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  const page = await context.newPage()
  const pageErrors = []
  page.on('pageerror', (error) => pageErrors.push(error.message))
  await login(page, '/student/login', STUDENT_USERNAME)
  await page.goto(`${BASE_URL}/student/cognitive`)
  await page.getByText(assignmentTitle, { exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  await page.getByText(assignmentTitle, { exact: true }).click()
  await page.waitForURL('**/student/cognitive/assignments/**', { timeout: 10000 })
  await page.getByRole('button', { name: /开始测评/ }).click()
  await page.waitForURL('**/student/cognitive/sessions/**', { timeout: 15000 })
  const sessionId = page.url().split('/sessions/')[1]
  assert.ok(sessionId, 'Session id missing after student start')
  await page.getByRole('button', { name: '开始测评', exact: true }).click()
  await page.getByRole('heading', { name: 'Go/No-Go' }).waitFor({ state: 'visible', timeout: 10000 })
  await runPractice(page)
  await runFormalGonogo(page)

  await page.waitForURL('**/result', { timeout: 15000 })
  await page.getByText('数据质量', { exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  const resultText = await page.locator('body').innerText()
  for (const required of ['体验版', '数据质量', '主要指标', '次级指标', '简要解释', '方法说明', '任务表现指数']) {
    assert.ok(resultText.includes(required), `Result is missing section: ${required}`)
  }
  assert.doesNotMatch(resultText, /参考位置\s*\d|百分位|percentile|超过全国\s*\d+%/i)
  await page.screenshot({ path: path.join(SHOT_DIR, '03-student-result.png'), fullPage: true })

  await page.goto(`${BASE_URL}/student/cognitive/history`)
  await page.getByText(assignmentTitle, { exact: true }).waitFor({ state: 'visible', timeout: 15000 })
  await page.screenshot({ path: path.join(SHOT_DIR, '04-student-history.png'), fullPage: true })
  assert.deepEqual(pageErrors, [], `Student page errors: ${pageErrors.join('; ')}`)
  await context.close()
  return sessionId.split(/[/?#]/)[0]
}

const saveDownload = async (page, buttonName, outputName) => {
  const [download] = await Promise.all([
    page.waitForEvent('download', { timeout: 30000 }),
    page.getByRole('button', { name: buttonName, exact: true }).click(),
  ])
  const destination = path.join(DOWNLOAD_DIR, outputName)
  await download.saveAs(destination)
  assert.ok(fs.statSync(destination).size > 0, `${buttonName} produced an empty file`)
  return destination
}

const verifyExports = async (page, assignmentId) => {
  await page.goto(`${BASE_URL}/cognitive-assignments/${assignmentId}`)
  await page.getByText(/^已发布/).waitFor({ state: 'visible', timeout: 15000 })

  const summaryPath = await saveDownload(page, '导出摘要', 'round1-summary.csv')
  const summary = fs.readFileSync(summaryPath, 'utf8')
  for (const header of ['A_profile', 'A_metric_definition_version', 'A_quality_interpretable']) {
    assert.ok(summary.includes(header), `Summary export is missing ${header}`)
  }
  assert.ok(summary.includes('experience'), 'Summary export did not freeze the experience profile')
  assert.ok(!summary.split(/\r?\n/, 1)[0].includes('U_name'), 'Teacher summary export was not anonymized')

  const zipPath = await saveDownload(page, '科研长表 ZIP', 'round1-research.zip')
  const entries = execFileSync('unzip', ['-Z1', zipPath], { encoding: 'utf8' }).trim().split(/\r?\n/)
  for (const expected of ['sessions.csv', 'metrics.csv', 'trials.csv', 'manifest.json', 'data_dictionary.xlsx', 'README.txt']) {
    assert.ok(entries.includes(expected), `Research ZIP is missing ${expected}`)
  }
  const manifest = JSON.parse(execFileSync('unzip', ['-p', zipPath, 'manifest.json'], { encoding: 'utf8' }))
  assert.equal(manifest.assignmentId, assignmentId)
  assert.equal(manifest.sessionCount, 1)
  assert.equal(manifest.trialRowCount, 40)
  assert.equal(manifest.randomizationAlgorithmVersion, 'seq-v1.0.0')
  const researchSessions = execFileSync('unzip', ['-p', zipPath, 'sessions.csv'], { encoding: 'utf8' })
  assert.ok(researchSessions.includes('experience'), 'Research sessions did not freeze the experience profile')

  const xlsxPath = await saveDownload(page, '科研工作簿 XLSX', 'round1-research.xlsx')
  assert.equal(fs.readFileSync(xlsxPath).subarray(0, 2).toString(), 'PK', 'Research XLSX is not a valid ZIP-based workbook')
  const workbookXml = execFileSync('unzip', ['-p', xlsxPath, 'xl/workbook.xml'], { encoding: 'utf8' })
  for (const sheet of ['Summary', 'Metrics', 'Trials', 'Dictionary', 'Methods']) {
    assert.ok(workbookXml.includes(`name="${sheet}"`), `Research XLSX is missing ${sheet}`)
  }
  await page.screenshot({ path: path.join(SHOT_DIR, '05-teacher-exports.png'), fullPage: true })
  return { summaryPath, zipPath, xlsxPath }
}

const verifyDatabase = (assignmentId, sessionId) => {
  const sql = `
    SELECT json_build_object(
      'assignmentStatus', a.status,
      'profile', a.profile,
      'profileDefinitionVersion', a.profile_definition_version,
      'configFrozen', a.resolved_config_snapshot_encrypted IS NOT NULL,
      'configHashFrozen', a.resolved_config_hash IS NOT NULL,
      'reportFrozen', a.resolved_report_snapshot_encrypted IS NOT NULL,
      'sessionStatus', s.status,
      'testType', s.test_type,
      'configVersion', s.config_version,
      'engineVersion', s.engine_version,
      'scoringVersion', s.scoring_version,
      'trialCount', count(t.id)
    )
    FROM cognitive_assignments a
    JOIN cognitive_sessions s ON s.assignment_id = a.id
    LEFT JOIN cognitive_trials t ON t.session_id = s.id
    WHERE a.id = '${assignmentId}' AND s.id = '${sessionId}'
    GROUP BY a.id, s.id;
  `
  const raw = compose('exec', '-T', 'postgres', 'psql', '-U', 'ptool', '-d', 'ptool', '-tAc', sql).trim()
  const evidence = JSON.parse(raw)
  assert.deepEqual(evidence, {
    assignmentStatus: 'PUBLISHED',
    profile: 'experience',
    profileDefinitionVersion: '1.0.0',
    configFrozen: true,
    configHashFrozen: true,
    reportFrozen: true,
    sessionStatus: 'COMPLETED',
    testType: 'gonogo',
    configVersion: '1.0.0',
    engineVersion: '1.0.0',
    scoringVersion: '1.0.0',
    trialCount: 40,
  })
  return evidence
}

const main = async () => {
  installFixture()
  assert.ok(BROWSER_EXECUTABLE, `Browser executable not found; checked: ${browserCandidates.join(', ')}`)
  const browser = await chromium.launch({ headless: true, executablePath: BROWSER_EXECUTABLE })
  const teacherContext = await browser.newContext({ viewport: { width: 1440, height: 1000 }, acceptDownloads: true })
  const teacherPage = await teacherContext.newPage()
  const pageErrors = []
  teacherPage.on('pageerror', (error) => pageErrors.push(error.message))
  try {
    const assignmentId = await createAndPublish(teacherPage)
    const sessionId = await completeAsStudent(browser)
    const downloads = await verifyExports(teacherPage, assignmentId)
    const database = verifyDatabase(assignmentId, sessionId)
    assert.deepEqual(pageErrors, [], `Teacher page errors: ${pageErrors.join('; ')}`)
    console.log(JSON.stringify({ assignmentTitle, assignmentId, sessionId, database, downloads, screenshots: SHOT_DIR }, null, 2))
    console.log('Round 1 browser E2E: PASS')
  } finally {
    await teacherContext.close()
    await browser.close()
  }
}

main().catch((error) => {
  console.error('Round 1 browser E2E: FAIL')
  console.error(error.stack || error.message)
  process.exit(1)
})
