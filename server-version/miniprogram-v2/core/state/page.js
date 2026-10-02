const STATES = ['idle','loading','ready','empty','error','refreshing','submitting']
function pageState(status, values = {}) {
  if (!STATES.includes(status)) throw new Error('未知页面状态')
  return Object.assign({status, errorMessage: ''}, values)
}
module.exports = { STATES, pageState }
