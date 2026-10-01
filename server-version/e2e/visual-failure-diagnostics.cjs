const fs = require('node:fs')
const path = require('node:path')
const reportedFailures = new WeakSet()

const escapeData = value => String(value).replace(/%/g, '%25').replace(/\r/g, '%0D').replace(/\n/g, '%0A')

/** Keep failure details readable through check annotations as well as artifacts. */
function reportVisualFailure({ engine, width, url, output, script }, error) {
  if (error && typeof error === 'object') {
    if (reportedFailures.has(error)) return
    reportedFailures.add(error)
  }
  const failure = { engine, width, url, script, message: error.message ?? String(error), stack: error.stack ?? null }
  fs.mkdirSync(output, { recursive: true })
  fs.writeFileSync(path.join(output, `failure-${width}.json`), JSON.stringify(failure, null, 2))
  const message = `${engine} / ${width}px / ${url}\n${failure.stack ?? failure.message}`
  if (process.env.GITHUB_ACTIONS === 'true') console.error(`::error title=Visual interaction failure::${escapeData(message)}`)
  else console.error(message)
}

module.exports = { reportVisualFailure }
