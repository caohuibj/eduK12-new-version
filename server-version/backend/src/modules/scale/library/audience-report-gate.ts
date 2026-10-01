import type { ScaleDefinitionV2, DefinitionIssue } from '../scale-definition'
/** Structural and editorial publication checks, outside FINAL. */
export function validateAudienceReport(definition: ScaleDefinitionV2): DefinitionIssue[] {
 if (!definition.versionAxes) return [] // legacy migration is explicit, never invalidate historical content
 const issues: DefinitionIssue[]=[]
 const fail=(path:string,message:string)=>issues.push({path:'report.'+path,message,severity:'error'})
 const r=definition.report,c=r.audienceContract
 if(!c || c.locale!==definition.versionAxes.locale) fail('audienceContract','AUDIENCE_LANGUAGE_QC_REQUIRED')
 if(!r.limitations.length) fail('limitations','REPORT_BOUNDARIES_REQUIRED')
 for(const key of r.primaryScoreKeys){
  const entries=r.interpretations.filter(x=>x.scoreKey===key)
  if(entries.length!==1){fail('interpretations','REPORT_SCORE_COVERAGE_REQUIRED');continue}
  const e=entries[0]
  const variants=[{summary:e.summary,guidance:e.guidance},...e.bands]
  variants.forEach((v,i)=>{
   if(v.summary.length<100) fail(`interpretations.${key}.${i}`,'REPORT_UNDERSTANDABLE_EXPLANATION_REQUIRED')
   if(!v.guidance.some(x=>x.category==='reflection') || !v.guidance.some(x=>x.category==='strategy' || x.category==='support')) fail(`interpretations.${key}.${i}`,'REPORT_REFLECTION_ACTION_REQUIRED')
   if(/你的能力很差|你没有天赋|你的心态不好|你必须参加补习|老师不喜欢这门课|你的智力较低|全国常模/.test(v.summary+v.guidance.map(x=>x.text).join(''))) fail(`interpretations.${key}.${i}`,'REPORT_UNSUPPORTED_LABEL_FORBIDDEN')
  })
  if(new Set(e.bands.map(b=>b.key)).size!==e.bands.length) fail('bands','REPORT_BAND_KEYS_DUPLICATE')
 }
 return issues
}
