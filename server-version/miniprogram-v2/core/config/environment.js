// Configure isolated HTTPS acceptance services before importing into DevTools.
// A develop/trial build cannot silently use the release service.
module.exports = {
  origins: {develop:'',trial:'',release:'https://eduk12.top'},
}
