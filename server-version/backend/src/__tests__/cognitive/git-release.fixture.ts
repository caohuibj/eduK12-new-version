import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

export const approvedVisibility = {
  schemaVersion:1,policyVersion:'test-release',unknownAudience:'DENY',
  audiences:{respondent:{numericScores:true,references:false,scoreDerivedLabels:false,
    individualInterpretations:false,educationalContent:true,artwork:false}},
}
export function cognitiveDeclarationFixture(versionPrefix='fictional'){
  const root=mkdtempSync(join(tmpdir(),'cognitive-git-input-')),key='gonogo',dir=join(root,key)
  mkdirSync(join(dir,'parameters'),{recursive:true})
  mkdirSync(join(dir,'reports'),{recursive:true})
  const version=(suffix:string)=>versionPrefix+'-'+suffix
  const parameter={schemaVersion:1,toolKey:key,version:version('p1'),engineVersion:'1.0.0',scoringVersion:'1.0.0',
    config:{totalTrials:120,nogoRatio:.25,stimulusMs:800,isiMs:500,validRtFloorMs:100}}
  const report={schemaVersion:1,toolKey:key,version:version('r1'),parameterVersion:parameter.version,
    name:'Synthetic report',instruction:'Synthetic instructions',introduction:'Synthetic plain language guidance.',
    practicalTips:['Use the same testing conditions.'],disclaimer:'Synthetic score is not a diagnosis.',
    reportVisibility:approvedVisibility,template:{title:'Synthetic report',blocks:[{type:'METRIC',metricKey:'hitRate',display:'RAW'}]}}
  const releases=[{version:version('release1'),parameterVersion:parameter.version,reportVersion:report.version,
    profile:'standard',allowedEntries:['TRAINING','SURVEY'],state:'ONLINE'},
    {version:version('release2'),parameterVersion:parameter.version,reportVersion:version('r2'),
      profile:'standard',allowedEntries:['TRAINING','SURVEY'],state:'WITHDRAWN',replaces:version('release1')}]
  const set=(path:string,value:unknown)=>writeFileSync(join(dir,path),JSON.stringify(value))
  set('parameters/'+parameter.version+'.json',parameter)
  set('reports/'+report.version+'.json',report)
  set('reports/'+version('r2')+'.json',{...report,version:version('r2'),name:'Synthetic report update'})
  const write=()=>set('releases.json',{schemaVersion:1,toolKey:key,releases})
  write()
  return {root,key,parameter,report,releases,set,write,version}
}
