const assert = require('node:assert/strict')

function assertApiSuccess(status, body, operation) {
  // Keep the response envelope in failures instead of masking it with a null dereference.
  const detail = `${operation}: HTTP ${status}, ${JSON.stringify(body)}`
  assert.equal(status, 200, detail)
  assert.equal(body?.code, 0, detail)
  assert.ok(body.data != null, detail)
  return body.data
}
module.exports = { assertApiSuccess }
