const threatPrefix=/^[\s\u200B\u200C\u200D\u202A-\u202E\uFEFF]*[=+@-]/
export const protectCsvCell=(raw:unknown):string=>{
  if(raw===null||raw===undefined)return ''
  if(typeof raw!=='string'&&typeof raw!=='number'&&typeof raw!=='boolean')
    throw new Error('CSV field must be scalar')
  if(typeof raw==='number'){
    if(!Number.isFinite(raw))throw new Error('CSV numbers must be finite')
    // A true numeric -2.5 is research data, never an Excel formula.
    return String(raw)
  }
  const value=String(raw)
  // Adding a literal apostrophe survives quoted CSV parsers and prevents
  // spreadsheet formula execution, at the cost of a documented text prefix.
  return threatPrefix.test(value)?"'"+value:value
}
