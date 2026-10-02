// Only allowlisted operational fields. No answers, usernames, bodies, URLs or capabilities.
function createTelemetry() {
  const events = []
  return {
    record(event) {
      events.push({kind: String(event.kind || '').slice(0,32), status: Number(event.status) || 0, durationMs: Math.max(0,Number(event.durationMs) || 0)})
      if (events.length > 50) events.shift()
    },
    snapshot: () => events.map(event => Object.assign({}, event)),
    clear: () => { events.length = 0 },
  }
}
module.exports = { createTelemetry }
