import { canonicalHash } from '../../assessment-runtime/canonical'
import type { BundleEngineInputV1 } from '../registry'
import type { ProfileModel } from './contract'
import type { ProfileScaleSource } from './sources'

export type ProfileState = 'MATCHED'|'MIXED'|'BOUNDARY'|'UNCLASSIFIED'|'INSUFFICIENT'|'INVALID'|'NOT_APPLICABLE'
export interface ProfileConstruct {
  key:string; evidenceKey:string; label:string; raw:number; coordinate:number; min:number; max:number; orientation:'DIRECT'|'REFLECT'; weight:number; sourceResultHash:string
}
export interface ProfileCandidate {
  profileId:string; distance:number; matchingScore:number; ruleEligible:boolean; fuzzyRuleMembership:number; contributions:Record<string,number>
}
export interface ProfileResult {
  schemaVersion:'bundle-profile-result-v1'; state:ProfileState; profileId:string|null; ruleProfileId:string|null
  constructs:ProfileConstruct[]; candidates:ProfileCandidate[]; margin:number|null; reasons:string[]
  model:{key:string;version:string;hash:string;mappingVersion:string;templateVersion:string;algorithm:string;maturity:'EXPERIMENTAL'}
  trace:{evidenceKeys:string[];sourceResultHashes:string[];supportRefs:string[]}
  uncertainty:{inputCoverage:number;empiricalClassValidation:'NOT_ESTABLISHED';probabilityAvailable:false}
}
const round=(v:number)=>Math.round(v*1e6)/1e6
/** Native adapter: only verified persisted FINAL projections; no raw items, I/O or synthetic flags. */
export function runBundleProfile(model:ProfileModel,input:BundleEngineInputV1):ProfileResult {
  const out:ProfileResult={
    schemaVersion:'bundle-profile-result-v1',state:'INSUFFICIENT',profileId:null,ruleProfileId:null,constructs:[],candidates:[],margin:null,reasons:[],
    model:{key:model.key,version:model.version,hash:canonicalHash(model),mappingVersion:model.mappingVersion,templateVersion:model.templateVersion,algorithm:model.algorithm,maturity:model.maturity},
    trace:{evidenceKeys:[],sourceResultHashes:[],supportRefs:[]},uncertainty:{inputCoverage:0,empiricalClassValidation:'NOT_ESTABLISHED',probabilityAvailable:false},
  }
  const evidence=new Map(input.evidence.map(e=>[e.evidenceKey,e]))
  const applicability=model.applicability
  if('gradeEvidenceKey' in applicability){
    const grade=evidence.get(applicability.gradeEvidenceKey)
    if(!grade || grade.value.state!=='present' || grade.quality!=='interpretable'){
      out.reasons.push('MISSING_GRADE_CONTEXT');return out
    }
    const gradeValue=Number(grade.value.value)
    if(!Number.isInteger(gradeValue) || gradeValue<applicability.minGrade || gradeValue>applicability.maxGrade){
      out.state='NOT_APPLICABLE';out.reasons.push('GRADE_OUT_OF_SCOPE');return out
    }
  }else{
    // Explicit self-declarations select this model's population; they grant no data access.
    for(const key of [applicability.adultEvidenceKey,applicability.teacherEvidenceKey]){
      const fact=evidence.get(key)
      if(!fact || fact.value.state==='missing' || fact.quality==='unavailable'){
        out.reasons.push(key+':MISSING_CONTEXT');return out
      }
      if(fact.value.state==='invalid' || fact.quality==='invalid' ||
        (fact.value.state==='present' && typeof fact.value.value!=='boolean')){
        out.state='INVALID';out.reasons.push(key+':INVALID_CONTEXT');return out
      }
      if(fact.value.state==='not_applicable'){
        out.state='NOT_APPLICABLE';out.reasons.push(key+':CONTEXT_OUT_OF_SCOPE');return out
      }
      if(fact.value.state!=='present' || fact.quality!=='interpretable'){
        out.reasons.push(key+':LIMITED_CONTEXT');return out
      }
      if(fact.value.value!==true){
        out.state='NOT_APPLICABLE';out.reasons.push(key+':CONTEXT_OUT_OF_SCOPE');return out
      }
    }
  }
  let invalid=false
  for(const b of [...model.bindings].sort((a,b)=>a.constructKey.localeCompare(b.constructKey,'en'))){
    const e=evidence.get(b.evidenceKey)
    if(!e || e.value.state==='missing' || e.quality==='unavailable'){out.reasons.push(b.evidenceKey+':MISSING');continue}
    if(e.value.state==='not_applicable'){out.state='NOT_APPLICABLE';out.reasons.push(b.evidenceKey+':NOT_APPLICABLE');return out}
    if(e.quality==='invalid' || e.value.state==='invalid'){invalid=true;out.reasons.push(b.evidenceKey+':INVALID');continue}
    if(e.quality!=='interpretable' || e.value.state!=='present'){out.reasons.push(b.evidenceKey+':LIMITED');continue}
    const s=e.source.kind==='SCALE_SCORE'?input.scaleSources?.find(s=>s.slotKey===(e.source as {slotKey:string}).slotKey):undefined
    const identity=(s as ProfileScaleSource|undefined)?.profileIdentity
    // Missing historical metadata never becomes invented trusted completeness.
    if(!s || !identity){out.reasons.push(b.evidenceKey+':IDENTITY_UNAVAILABLE');continue}
    if(s.instrumentKey!==b.source.instrumentKey || s.instrumentVersion!==b.source.instrumentVersion ||
      identity.runtimeDefinitionHash!==b.source.runtimeDefinitionHash || identity.scoringVersion!==b.source.scoringVersion){
      invalid=true;out.reasons.push(b.evidenceKey+':IDENTITY_MISMATCH');continue
    }
    const score=s.scores.find(s=>s.scoreKey===(e.source as {scoreKey:string}).scoreKey)
    // Exact dependency validation permits only the item-mean scorer. It emits
    // calculated iff every source item is answered; partial means are limited.
    if(!score || score.status!=='calculated'){
      out.reasons.push(b.evidenceKey+':INCOMPLETE');continue
    }
    const raw=e.value.value,t=b.transformation
    if(typeof raw!=='number' || !Number.isFinite(raw) || raw<t.min || raw>t.max){
      invalid=true;out.reasons.push(b.evidenceKey+':OUT_OF_RANGE');continue
    }
    const position=(raw-t.min)/(t.max-t.min),coordinate=t.orientation==='DIRECT'?position:1-position
    out.constructs.push({key:b.constructKey,evidenceKey:b.evidenceKey,label:b.label,raw,coordinate,min:t.min,max:t.max,orientation:t.orientation,weight:b.weight,sourceResultHash:s.sourceResultHash})
  }
  out.uncertainty.inputCoverage=round(out.constructs.length/model.bindings.length)
  out.trace.evidenceKeys=out.constructs.map(c=>c.evidenceKey).sort()
  out.trace.sourceResultHashes=[...new Set(out.constructs.map(c=>c.sourceResultHash))].sort()
  if(invalid || out.constructs.length!==model.bindings.length){out.state=invalid?'INVALID':'INSUFFICIENT';return out}
  return matchProfileConstructs(model,out)
}

/** Guarded weighted L1 math from the independently identified B reference. */
export function matchProfileConstructs(model:ProfileModel,out:ProfileResult):ProfileResult {
  const m=model.matching,sumWeights=out.constructs.reduce((s,c)=>s+c.weight,0)
  const membership=(x:number,band:'LOW'|'HIGH')=>band==='LOW'
    ? x<=m.fuzzyLowPlateauEnd?1:x>=m.fuzzyMidpoint?0:(m.fuzzyMidpoint-x)/(m.fuzzyMidpoint-m.fuzzyLowPlateauEnd)
    : x>=m.fuzzyHighPlateauStart?1:x<=m.fuzzyMidpoint?0:(x-m.fuzzyMidpoint)/(m.fuzzyHighPlateauStart-m.fuzzyMidpoint)
  const candidates=model.profiles.map(p=>{
    const contributions=Object.fromEntries(out.constructs.map(c=>[c.key,c.weight*Math.abs(c.coordinate-p.centers[c.key])/sumWeights]))
    const distance=Object.values(contributions).reduce((a,b)=>a+b,0)
    const ruleEligible=out.constructs.every(c=>p.pattern[c.key]==='LOW'?c.coordinate<=m.lowMax:c.coordinate>=m.highMin)
    return {profileId:p.id,distance,matchingScore:100*(1-distance),ruleEligible,
      fuzzyRuleMembership:Math.min(...out.constructs.map(c=>membership(c.coordinate,p.pattern[c.key]))),contributions}
  }).sort((a,b)=>b.matchingScore-a.matchingScore || a.profileId.localeCompare(b.profileId,'en'))
  const eligible=candidates.filter(c=>c.ruleEligible),top=candidates[0]
  out.ruleProfileId=eligible.length===1?eligible[0].profileId:null
  out.margin=top.matchingScore-candidates[1].matchingScore
  const allExtreme=out.constructs.every(c=>c.coordinate<=m.lowMax || c.coordinate>=m.highMin)
  if(allExtreme && eligible.length===0){out.state='UNCLASSIFIED';out.reasons.push('THEORY_PATTERN_NOT_COVERED')}
  else if(top.matchingScore<m.minimumMatchingScore){out.state='UNCLASSIFIED';out.reasons.push('ABSOLUTE_MATCH_TOO_LOW')}
  else if(out.margin<m.minimumMargin){out.state='MIXED';out.reasons.push('TOP_TWO_TOO_CLOSE')}
  else if(!top.ruleEligible || top.profileId!==out.ruleProfileId){out.state='BOUNDARY';out.reasons.push('RULE_AND_DISTANCE_NOT_ALIGNED')}
  else {out.state='MATCHED';out.profileId=top.profileId}
  // Decisions use full precision. Only the immutable presentation result is rounded.
  out.margin=round(out.margin)
  out.candidates=candidates.map(c=>({...c,distance:round(c.distance),matchingScore:round(c.matchingScore),fuzzyRuleMembership:round(c.fuzzyRuleMembership),contributions:Object.fromEntries(Object.entries(c.contributions).map(([k,v])=>[k,round(v)]))}))
  out.trace.supportRefs=[...new Set(model.profiles.filter(p=>p.id===out.profileId || out.state==='MIXED' && candidates.slice(0,2).some(c=>c.profileId===p.id)).flatMap(p=>p.supportRefs))].sort()
  return out
}
