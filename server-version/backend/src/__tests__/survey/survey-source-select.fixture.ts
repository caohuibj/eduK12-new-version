// Apply Prisma-style nested selects so FINAL fixtures cannot hide missing fields.
export function selectSurveyFixtureRecord<T>(record:T,select?:unknown):T{
  if(!select||record===null||typeof record!=='object')return structuredClone(record)
  if(Array.isArray(record))return record.map(value=>selectSurveyFixtureRecord(value,select)) as T
  const fields=record as Record<string,unknown>
  return Object.fromEntries(Object.entries(select as Record<string,unknown>).flatMap(([key,spec])=>{
    if(spec===true)return [[key,structuredClone(fields[key])]]
    if(spec&&typeof spec==='object')return [[key,
      selectSurveyFixtureRecord(fields[key],(spec as {select?:unknown}).select)]]
    return []
  })) as T
}

export function surveyFixtureSql(parts:TemplateStringsArray|{strings:string[]}):string{
  return ('strings' in parts?parts.strings:parts).join('')
}
