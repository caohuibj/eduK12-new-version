import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {lstatSync,readFileSync} from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';

// This module checks bytes, completeness and exact review bindings. Its caller
// must authenticate the official artifact/job and the separately approved plan.
// Neither a dispatch field nor a reviewer label authenticates dot's approval.
export const sarifLanguages=Object.freeze(['javascript-typescript','python']);
const languageInfo={
  'javascript-typescript':{source:'javascript',pack:'codeql/javascript-queries',suite:'javascript-security-extended.qls'},
  python:{source:'python',pack:'codeql/python-queries',suite:'python-security-extended.qls'},
};
const hex64=/^[a-f0-9]{64}$/,hex40=/^[a-f0-9]{40}$/;
function check(value,code){assert(value,'PR356_SARIF_'+code);}
function text(value){return typeof value==='string'&&value.trim().length>0;}
function object(value){return value!==null&&typeof value==='object'&&!Array.isArray(value);}
export const sha256=bytes=>createHash('sha256').update(bytes).digest('hex');
function canonical(value){
  if(Array.isArray(value))return value.map(canonical);
  if(object(value))return Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])]));
  check(value!==undefined&&!(typeof value==='number'&&!Number.isFinite(value)),'NON_JSON_IDENTITY');
  return value;
}
export const canonicalSHA256=value=>sha256(JSON.stringify(canonical(value)));
function same(actual,expected,code){check(JSON.stringify(canonical(actual))===JSON.stringify(canonical(expected)),code);}
function relativeFile(value){check(text(value)&&!value.includes('\\')&&!path.posix.isAbsolute(value)&&value.split('/').every(p=>p&&p!=='.'&&p!=='..')&&!value.includes('\0'),'ARTIFACT_PATH');return value;}
function json(bytes,code){try{return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));}catch{throw new Error('PR356_SARIF_'+code);}}
function readArtifact(artifact,descriptor){
  check(object(descriptor)&&hex64.test(descriptor.sha256),'ARTIFACT_DESCRIPTOR');
  const name=relativeFile(descriptor.path),value=artifact?.files?.[name];
  check(Buffer.isBuffer(value)||value instanceof Uint8Array,'MISSING_ARTIFACT_BYTES:'+name);
  const bytes=Buffer.from(value);check(sha256(bytes)===descriptor.sha256,'ARTIFACT_DIGEST:'+name);return bytes;
}
function date(value){return text(value)&&Number.isFinite(Date.parse(value));}
function packIdentity(pack){return {name:pack.name,version:pack.version,...(pack.sarifSemanticVersion?{sarifSemanticVersion:pack.sarifSemanticVersion}:{}),treeSHA256:pack.treeSHA256,inventorySHA256:pack.inventory.sha256};}
export function sarifIdentity(expected){
  return {...(expected.executionProfile?{executionProfile:expected.executionProfile}:{}),sourceHead:expected.sourceHead,sourceTree:expected.sourceTree,language:expected.language,category:expected.category,
    cli:{version:expected.cli.version,bundleSHA256:expected.cli.bundleSHA256,versionOutputSHA256:expected.cli.versionOutput.sha256,...(expected.cli.bundleKind?{bundleKind:expected.cli.bundleKind,installationInventorySHA256:expected.cli.installationInventory.sha256}:{})},
    queryPacks:expected.queryPacks.map(packIdentity),querySuite:{name:expected.querySuite.name,packPath:expected.querySuite.packPath,sha256:expected.querySuite.sha256},
    resolvedQueriesSHA256:expected.resolvedQueries.sha256,configSHA256:expected.config.sha256,inputManifestSHA256:expected.sourceInputs.sha256};
}
function validateExpected(e){
  check(object(e)&&e.schemaVersion===1&&hex40.test(e.sourceHead)&&hex40.test(e.sourceTree),'EXPECTED_TARGET');
  check(sarifLanguages.includes(e.language)&&text(e.category),'EXPECTED_LANGUAGE');
  check(object(e.cli)&&text(e.cli.version)&&hex64.test(e.cli.bundleSHA256),'EXPECTED_CLI');
  check(Array.isArray(e.queryPacks)&&e.queryPacks.length>0&&new Set(e.queryPacks.map(p=>p.name)).size===e.queryPacks.length,'EXPECTED_PACKS');
  for(const p of e.queryPacks)check(text(p.name)&&text(p.version)&&hex64.test(p.treeSHA256)&&object(p.inventory),'EXPECTED_PACK_IDENTITY');
  for(const p of e.queryPacks)if(p.sarifSemanticVersion!==undefined)check(p.sarifSemanticVersion===p.version||(p.sarifSemanticVersion.startsWith(p.version+'+')&&hex40.test(p.sarifSemanticVersion.slice(p.version.length+1))),'EXPECTED_PACK_BUILD_IDENTITY');
  check(e.queryPacks.some(p=>p.name===languageInfo[e.language].pack),'LANGUAGE_QUERY_PACK');
  check(e.querySuite?.name==='security-extended'&&e.querySuite.packPath==='codeql-suites/'+languageInfo[e.language].suite,'SECURITY_EXTENDED_SUITE');
  check(object(e.commands)&&Object.keys(e.commands).length>=2,'EXPECTED_COMMANDS');
}
function validateInventory(expected,artifact){
  for(const pack of expected.queryPacks){
    const inventory=json(readArtifact(artifact,pack.inventory),'PACK_INVENTORY_JSON');
    check(inventory.schemaVersion===1&&inventory.name===pack.name&&inventory.version===pack.version&&Array.isArray(inventory.files)&&inventory.files.length>0,'PACK_INVENTORY_IDENTITY');
    if(pack.sarifSemanticVersion!==undefined)check(inventory.sarifSemanticVersion===pack.sarifSemanticVersion,'PACK_BUILD_IDENTITY');
    const names=[];
    for(const f of inventory.files){names.push(relativeFile(f.path));check(hex64.test(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0,'PACK_FILE_IDENTITY');}
    check(new Set(names).size===names.length&&names.includes('qlpack.yml'),'PACK_INVENTORY_FILES');
    check(pack.treeSHA256===canonicalSHA256(inventory.files),'PACK_TREE_DIGEST');
    if(pack.name===languageInfo[expected.language].pack)check(inventory.files.find(f=>f.path===expected.querySuite.packPath)?.sha256===expected.querySuite.sha256,'QUERY_SUITE_PACK_DIGEST');
  }
}
function validateInputs(expected,artifact){
  const inputs=json(readArtifact(artifact,expected.sourceInputs),'INPUT_MANIFEST_JSON');
  check(inputs.sourceHead===expected.sourceHead&&inputs.sourceTree===expected.sourceTree&&Array.isArray(inputs.files)&&inputs.files.length>0,'INPUT_MANIFEST_TARGET');
  const names=[];for(const f of inputs.files){names.push(relativeFile(f.path));check(hex64.test(f.sha256),'INPUT_MANIFEST_FILE');}
  check(new Set(names).size===names.length,'INPUT_MANIFEST_DUPLICATE');
  check(readArtifact(artifact,expected.config).length>0&&readArtifact(artifact,expected.querySuite).length>0,'EMPTY_CONFIG_OR_SUITE');
  const version=json(readArtifact(artifact,expected.cli.versionOutput),'CLI_VERSION_JSON');check(version.version===expected.cli.version,'CLI_VERSION');
  validateInventory(expected,artifact);
  const queries=json(readArtifact(artifact,expected.resolvedQueries),'RESOLVED_QUERIES_JSON');
  check(Array.isArray(queries)&&queries.length>0&&queries.every(q=>text(q)&&q.endsWith('.ql'))&&new Set(queries).size===queries.length,'RESOLVED_QUERIES');
  return queries.length;
}
function incompleteProperties(value){
  if(!object(value))return false;
  return Object.entries(value).some(([k,v])=>(/partial|truncat|cancelled|canceled|incomplete|errorCount|timeout/i.test(k)&&(v===true||(typeof v==='number'&&v>0)||(/^(partial|incomplete|cancelled|canceled|truncated|error|failed)$/i.test(String(v)))))||incompleteProperties(v));
}
function validateActionAnalysis(expected,artifact,receipt){
  check(receipt.profile==='codeql-action-v3'&&receipt.action?.origin==='workflow-step-context-unverified','ACTION_PROFILE');
  for(const kind of ['init','analyze']){
    const actual=receipt.action[kind],wanted=expected.actionSteps?.[kind];
    check(text(wanted?.id)&&text(wanted?.name)&&wanted.uses==='github/codeql-action/'+kind+'@v3','ACTION_STEP_SPEC');
    check(actual?.id===wanted.id&&actual.name===wanted.name&&actual.uses===wanted.uses&&actual.outcome==='success','ACTION_STEP_FAILED');
  }
  check(expected.cli.bundleKind==='installed-tree','ACTION_CLI_IDENTITY_KIND');
  const installed=json(readArtifact(artifact,expected.cli.installationInventory),'ACTION_CLI_INVENTORY');
  check(Array.isArray(installed.files)&&installed.files.length>0&&installed.files.every(f=>text(f.path)&&hex64.test(f.sha256)&&Number.isSafeInteger(f.bytes)&&f.bytes>=0),'ACTION_CLI_FILES');
  installed.files.forEach(f=>relativeFile(f.path));
  check(new Set(installed.files.map(f=>f.path)).size===installed.files.length&&canonicalSHA256(installed.files)===expected.cli.bundleSHA256,'ACTION_CLI_TREE');
  const names=['version','resolve-packs','resolve-queries','starting-packs','database-info'];
  same(Object.keys(expected.commands).sort(),[...names].sort(),'ACTION_METADATA_COMMANDS');
  check(Array.isArray(receipt.metadataCommands),'ACTION_COMMAND_RECEIPTS');
  same(receipt.metadataCommands.map(r=>r.name),names,'ACTION_COMMAND_COVERAGE');
  const fixed={version:['version','--format=json'],'resolve-packs':['resolve','qlpacks','--format=json'],'resolve-queries':['resolve','queries','--format=json',languageInfo[expected.language].pack+':'+expected.querySuite.packPath],'starting-packs':['resolve','queries','--format=startingpacks',languageInfo[expected.language].pack+':'+expected.querySuite.packPath]};
  const stdout={version:expected.cli.versionOutput,'resolve-packs':expected.resolvedPacks,'resolve-queries':expected.resolvedQueries,'starting-packs':expected.startingPacks,'database-info':receipt.database?.info};
  for(const record of receipt.metadataCommands){
    check(record.status==='completed'&&record.exitCode===0&&record.signal===null&&record.truncated===false&&date(record.startedAt)&&date(record.endedAt)&&Date.parse(record.startedAt)<=Date.parse(record.endedAt),'ACTION_METADATA_FAILED');
    same(record.command,expected.commands[record.name],'ACTION_METADATA_COMMAND_IDENTITY');
    check(/^codeql(?:\.exe)?$/.test(path.basename(record.command[0])),'ACTION_METADATA_TOOL');
    if(record.name==='database-info')check(record.command.length===5&&record.command[1]==='resolve'&&record.command[2]==='database'&&text(record.command[3])&&record.command[4]==='--format=json','ACTION_DATABASE_COMMAND');
    else same(record.command.slice(1),fixed[record.name],'ACTION_METADATA_COMMAND');
    same(record.stdout,stdout[record.name],'ACTION_METADATA_STDOUT');readArtifact(artifact,record.stdout);readArtifact(artifact,record.log);
  }
  const packs=json(readArtifact(artifact,expected.resolvedPacks),'ACTION_PACK_RESOLUTION'),starts=json(readArtifact(artifact,expected.startingPacks),'ACTION_STARTING_PACKS');
  check(object(packs)&&Object.keys(packs).length>0&&Array.isArray(starts)&&starts.length>0&&starts.every(text),'ACTION_RESOLUTION_EMPTY');
  const info=json(readArtifact(artifact,receipt.database.info),'ACTION_DATABASE_JSON');
  check(object(info)&&Object.keys(info).length>0&&!incompleteProperties(info),'ACTION_DATABASE_INFO');
  const metadata=new TextDecoder('utf-8',{fatal:true}).decode(readArtifact(artifact,receipt.database.metadata));
  check(!/^inProgress\s*:/m.test(metadata)&&/^creationMetadata\s*:/m.test(metadata),'ACTION_DATABASE_NOT_FINALIZED');
  check(/^primaryLanguage:\s*["']?([^"'\s#]+)["']?\s*$/m.exec(metadata)?.[1]===languageInfo[expected.language].source,'ACTION_DATABASE_LANGUAGE');
  return receipt;
}
function validateAnalysis(expected,artifact,queryCount){
  const receipt=json(readArtifact(artifact,expected.analysis),'ANALYSIS_RECEIPT_JSON');
  check(receipt.schemaVersion===1&&receipt.complete===true&&receipt.partial===false,'ANALYSIS_INCOMPLETE');
  same(receipt.identity,sarifIdentity(expected),'ANALYSIS_IDENTITY');
  check(receipt.sarifSHA256===expected.sarif.sha256&&receipt.resolvedQueryCount===queryCount,'ANALYSIS_RESULT_BINDING');
  if(expected.executionProfile==='codeql-action-v3')return validateActionAnalysis(expected,artifact,receipt);
  check(expected.executionProfile===undefined||expected.executionProfile==='cli-stages','EXECUTION_PROFILE');
  check(Array.isArray(receipt.stages),'ANALYSIS_STAGES');
  const names=receipt.stages.map(s=>s.name);
  check(JSON.stringify(names)===JSON.stringify(['extract','analyze'])||JSON.stringify(names)===JSON.stringify(['extract','run-queries','interpret-results']),'ANALYSIS_STAGE_COVERAGE');
  same(Object.keys(expected.commands).sort(),[...names].sort(),'EXPECTED_STAGE_COVERAGE');
  let end=-Infinity;
  for(const stage of receipt.stages){
    check(stage.status==='completed'&&stage.exitCode===0&&stage.signal===null&&stage.partial===false&&stage.truncated===false,'ANALYSIS_STAGE_FAILED');
    check(date(stage.startedAt)&&date(stage.endedAt)&&Date.parse(stage.startedAt)>=end&&Date.parse(stage.endedAt)>=Date.parse(stage.startedAt),'ANALYSIS_STAGE_TIME');
    end=Date.parse(stage.endedAt);
    check(Array.isArray(stage.command)&&stage.command.length>=3&&stage.command.every(text),'ANALYSIS_COMMAND');
    same(stage.command,expected.commands[stage.name],'ANALYSIS_COMMAND_IDENTITY');
    check(/^codeql(?:\.exe)?$/.test(path.basename(stage.command[0]))&&stage.command[1]==='database','ANALYSIS_COMMAND_TOOL');
    const allowed=stage.name==='extract'?['create','finalize']:stage.name==='analyze'?['analyze']:[stage.name];
    check(allowed.includes(stage.command[2]),'ANALYSIS_COMMAND_STAGE');readArtifact(artifact,stage.log);
  }
  return receipt;
}
function descriptorFor(run,result){
  const components=[run.tool.driver,...(run.tool.extensions??[])];
  const reference=result.rule,componentReference=reference?.toolComponent;
  let component;
  if(componentReference?.index!==undefined){check(Number.isSafeInteger(componentReference.index)&&componentReference.index>=0,'RULE_COMPONENT_INDEX');component=run.tool.extensions?.[componentReference.index];check(component,'RULE_COMPONENT_MISSING');}
  else if(componentReference?.name!==undefined){const matches=components.filter(c=>c.name===componentReference.name);check(matches.length===1,'RULE_COMPONENT_AMBIGUOUS');component=matches[0];}
  else if(result.ruleIndex!==undefined||reference?.index!==undefined)component=run.tool.driver;
  const ruleId=reference?.id??result.ruleId,index=reference?.index??result.ruleIndex;
  check(text(ruleId),'RESULT_RULE_ID');
  if(reference?.id!==undefined&&result.ruleId!==undefined)check(reference.id===result.ruleId,'RESULT_RULE_CONFLICT');
  let rules=component?component.rules??[]:components.flatMap(c=>c.rules??[]);
  if(index!==undefined){check(Number.isSafeInteger(index)&&index>=0&&component&&rules[index]?.id===ruleId,'RESULT_RULE_INDEX');return rules[index];}
  rules=rules.filter(r=>r.id===ruleId);check(rules.length===1,'RESULT_RULE_AMBIGUOUS');return rules[0];
}
function locationFor(run,location){
  check(object(location),'RESULT_LOCATION');
  const p=location.physicalLocation;
  if(!p)return {physicalLocation:null,logicalLocations:location.logicalLocations??[]};
  check(object(p)&&object(p.artifactLocation),'RESULT_PHYSICAL_LOCATION');
  const a=p.artifactLocation;let uri=a.uri;
  if(a.index!==undefined){check(Number.isSafeInteger(a.index)&&a.index>=0&&run.artifacts?.[a.index]?.location,'RESULT_ARTIFACT_INDEX');uri??=run.artifacts[a.index].location.uri;}
  check(text(uri),'RESULT_LOCATION_URI');
  if(p.region!==undefined){check(object(p.region)&&Number.isSafeInteger(p.region.startLine)&&p.region.startLine>0,'RESULT_LOCATION_REGION');for(const k of ['startColumn','endLine','endColumn'])if(p.region[k]!==undefined)check(Number.isSafeInteger(p.region[k])&&p.region[k]>0,'RESULT_LOCATION_REGION');}
  return {uri,uriBaseId:a.uriBaseId??null,region:p.region??null,logicalLocations:location.logicalLocations??[]};
}
function fingerprints(value){
  if(value===undefined)return {};
  check(object(value)&&Object.entries(value).every(([k,v])=>text(k)&&text(v)),'RESULT_FINGERPRINTS');return value;
}
function findingsForRun(run,expected,runIndex){
  check(object(run.tool)&&object(run.tool.driver)&&/^CodeQL(?: command-line toolchain)?$/.test(run.tool.driver.name),'SARIF_TOOL');
  check(run.tool.driver.semanticVersion===expected.cli.version,'SARIF_CLI_VERSION');
  // Native CodeQL 2.27 SARIF omits this nonstandard hint. The Action profile
  // already requires finalized DB primaryLanguage plus the exact language pack.
  // A present contradictory hint remains an error; legacy CLI profiles retain it.
  if(expected.executionProfile!=='codeql-action-v3'||run.properties?.['semmle.sourceLanguage']!==undefined)check(run.properties?.['semmle.sourceLanguage']===languageInfo[expected.language].source,'SARIF_LANGUAGE');
  check(run.automationDetails?.id===expected.category,'SARIF_CATEGORY');
  check(!incompleteProperties(run.properties),'SARIF_PARTIAL');
  check(!run.externalPropertyFileReferences,'SARIF_EXTERNAL_RESULTS');
  check(Array.isArray(run.tool.extensions)&&run.tool.extensions.length>0,'SARIF_QUERY_PACK_METADATA');
  for(const extension of run.tool.extensions){
    const pack=expected.queryPacks.find(p=>p.name===extension.name);
    check(pack&&extension.semanticVersion===(pack.sarifSemanticVersion??pack.version),'SARIF_QUERY_PACK_IDENTITY');
  }
  check(run.tool.extensions.some(x=>x.name===languageInfo[expected.language].pack),'SARIF_LANGUAGE_PACK_MISSING');
  for(const component of [run.tool.driver,...run.tool.extensions]){
    if(component.rules!==undefined){check(Array.isArray(component.rules)&&component.rules.every(r=>object(r)&&text(r.id)),'SARIF_RULES');check(new Set(component.rules.map(r=>r.id)).size===component.rules.length,'SARIF_RULE_DUPLICATE');}
  }
  if(run.invocations!==undefined){
    check(Array.isArray(run.invocations)&&run.invocations.length>0,'SARIF_INVOCATIONS');
    for(const invocation of run.invocations){
      check(invocation.executionSuccessful===true&&(invocation.exitCode===undefined||invocation.exitCode===0)&&!incompleteProperties(invocation.properties),'SARIF_INVOCATION_FAILED');
      for(const key of ['toolExecutionNotifications','toolConfigurationNotifications']){
        if(invocation[key]===undefined)continue;check(Array.isArray(invocation[key]),'SARIF_NOTIFICATIONS');
        for(const n of invocation[key])check(n.level!=='error'&&!/partial|incomplete|truncat|cancelled|canceled|failed|timed[ -]?out/i.test(n.message?.text??''),'SARIF_ANALYSIS_NOTIFICATION');
      }
    }
  }
  if(run.versionControlProvenance!==undefined){check(Array.isArray(run.versionControlProvenance)&&run.versionControlProvenance.length>0,'SARIF_SOURCE_METADATA');for(const vcs of run.versionControlProvenance)check(vcs.revisionId===expected.sourceHead||vcs.revisionId===expected.checkout,'SARIF_SOURCE_HEAD');}
  check(Array.isArray(run.results),'SARIF_RESULTS_MISSING');
  return run.results.map((result,resultIndex)=>{
    check(object(result)&&object(result.message)&&(text(result.message.text)||text(result.message.markdown)||text(result.message.id)),'RESULT_MESSAGE');
    const rule=descriptorFor(run,result),level=result.level??rule.defaultConfiguration?.level??'warning';
    check(['none','note','warning','error'].includes(level),'RESULT_LEVEL');
    const securitySeverity=rule.properties?.['security-severity']??null;
    check(securitySeverity===null||(text(String(securitySeverity))&&Number.isFinite(Number(securitySeverity))&&Number(securitySeverity)>=0&&Number(securitySeverity)<=10),'RESULT_SECURITY_SEVERITY');
    check(result.locations===undefined||Array.isArray(result.locations),'RESULT_LOCATIONS');
    const locations=(result.locations??[]).map(l=>locationFor(run,l)),nativeFingerprints=fingerprints(result.fingerprints),partialFingerprints=fingerprints(result.partialFingerprints),resultSHA256=canonicalSHA256(result);
    return {findingId:canonicalSHA256({language:expected.language,sarifSHA256:expected.sarif.sha256,runIndex,resultIndex,resultSHA256}),language:expected.language,runIndex,resultIndex,ruleId:rule.id,
      severity:{level,originalLevel:result.level??null,defaultLevel:rule.defaultConfiguration?.level??null,securitySeverity,problemSeverity:rule.properties?.['problem.severity']??null},
      locations,message:result.message,nativeFingerprints,partialFingerprints,
      fingerprint:Object.keys(nativeFingerprints).length||Object.keys(partialFingerprints).length?canonicalSHA256({nativeFingerprints,partialFingerprints}):canonicalSHA256({ruleId:rule.id,locations,message:result.message}),
      fingerprintSource:Object.keys(nativeFingerprints).length||Object.keys(partialFingerprints).length?'sarif':'derived-location-message',
      suppressions:result.suppressions??[],baselineState:result.baselineState??null,kind:result.kind??null,resultSHA256};
  });
}
export function validateSarifEvidence(expected,artifact){
  validateExpected(expected);const queryCount=validateInputs(expected,artifact);validateAnalysis(expected,artifact,queryCount);
  const sarif=json(readArtifact(artifact,expected.sarif),'SARIF_JSON');
  check(object(sarif)&&sarif.version==='2.1.0'&&Array.isArray(sarif.runs)&&sarif.runs.length>0,'SARIF_RUNS');
  const findings=sarif.runs.flatMap((run,i)=>findingsForRun(run,expected,i));
  const queryPackSHA256=canonicalSHA256(expected.queryPacks.map(packIdentity));
  return {schemaVersion:1,sourceHead:expected.sourceHead,sourceTree:expected.sourceTree,language:expected.language,suite:'security-extended',
    sarifSHA256:expected.sarif.sha256,analysisSHA256:expected.analysis.sha256,queryPackSHA256,queryCount,runCount:sarif.runs.length,
    findings,resultSetSHA256:canonicalSHA256(findings.map(f=>({findingId:f.findingId,resultSHA256:f.resultSHA256}))),analysisSuccessful:true,zeroFindings:findings.length===0,
    externalDotApprovalRequired:true,reviewAuthentication:'not-established',releaseAuthorized:false};
}
export function validateSarifBundle(manifest,artifact){
  check(manifest?.schemaVersion===1&&hex40.test(manifest.sourceHead)&&hex40.test(manifest.sourceTree),'BUNDLE_TARGET');
  same(Object.keys(manifest.analyses??{}).sort(),[...sarifLanguages].sort(),'TWO_LANGUAGES_REQUIRED');
  const analyses=sarifLanguages.map(language=>{
    const expected=manifest.analyses[language];check(expected.sourceHead===manifest.sourceHead&&expected.sourceTree===manifest.sourceTree&&expected.language===language,'BUNDLE_LANGUAGE_TARGET');
    return validateSarifEvidence(expected,artifact);
  });
  return {schemaVersion:1,sourceHead:manifest.sourceHead,sourceTree:manifest.sourceTree,analyses,findings:analyses.flatMap(a=>a.findings),externalDotApprovalRequired:true,reviewAuthentication:'not-established',releaseAuthorized:false};
}
function applySarifDisposition({plan,phaseId,summary,reviewRecord}){
  check(hex40.test(plan?.head)&&hex40.test(plan?.tree)&&sarifLanguages.includes(summary?.language)&&phaseId==='codeql-'+summary.language,'DISPOSITION_PHASE_TARGET');
  const policy=plan.sarifPolicy;
  check(policy?.state==='fixed'&&object(policy.document)&&hex64.test(policy.sha256),'DISPOSITION_POLICY_PENDING');
  check(policy.sha256===canonicalSHA256(policy.document),'POLICY_DIGEST');
  same(Object.keys(policy.document).sort(),['allowedDispositions','id','schemaVersion'],'POLICY_UNSUPPORTED_FIELDS');
  check(policy.document.schemaVersion===1&&text(policy.document.id)&&Array.isArray(policy.document.allowedDispositions)&&policy.document.allowedDispositions.every(text)&&new Set(policy.document.allowedDispositions).size===policy.document.allowedDispositions.length,'POLICY_DOCUMENT');
  const target={sourceHead:plan.head,sourceTree:plan.tree,language:summary.language,sarifSHA256:summary.sarifSHA256,queryPackSHA256:summary.queryPackSHA256,resultSetSHA256:summary.resultSetSHA256,policySHA256:policy.sha256};
  if(summary.findings.length>0||reviewRecord!==undefined){
    check(reviewRecord?.schemaVersion===1&&text(reviewRecord.reviewer)&&date(reviewRecord.reviewedAt),'FINDINGS_UNREVIEWED');
    same(reviewRecord.target,target,'REVIEW_TARGET');
    // Compact transport only. The authenticated, complete result-set hash above
    // binds the ordered index to both original finding and result identities.
    // Every row is an explicit reviewer decision, never an inferred default.
    if(reviewRecord.encoding!==undefined){
      check(reviewRecord.encoding==='indexed-v1'&&reviewRecord.findings===undefined,'REVIEW_ENCODING');
      check(Array.isArray(reviewRecord.rationales)&&reviewRecord.rationales.length>0&&reviewRecord.rationales.every(text),'REVIEW_RATIONALES');
      const rows=reviewRecord.findingsByIndex;
      check(Array.isArray(rows)&&rows.length===summary.findings.length,'REVIEW_COVERAGE');
      const seen=new Set();
      const findings=rows.map(row=>{
        check(Array.isArray(row)&&row.length===3,'REVIEW_INDEX_ROW');
        const [index,disposition,reason]=row;
        check(Number.isSafeInteger(index)&&index>=0&&index<summary.findings.length&&!seen.has(index),'REVIEW_INDEX');seen.add(index);
        check(Number.isSafeInteger(reason)&&reason>=0&&reason<reviewRecord.rationales.length,'REVIEW_REASON_INDEX');
        const finding=summary.findings[index];
        return {findingId:finding.findingId,resultSHA256:finding.resultSHA256,disposition,rationale:reviewRecord.rationales[reason]};
      });
      reviewRecord={...reviewRecord,findings};
    }else check(reviewRecord.findingsByIndex===undefined&&reviewRecord.rationales===undefined,'REVIEW_ENCODING');
    check(Array.isArray(reviewRecord.findings)&&reviewRecord.findings.length===summary.findings.length&&new Set(reviewRecord.findings.map(f=>f.findingId)).size===reviewRecord.findings.length,'REVIEW_COVERAGE');
    for(const finding of summary.findings){
      const review=reviewRecord.findings.find(r=>r.findingId===finding.findingId);
      check(review?.resultSHA256===finding.resultSHA256&&text(review.rationale)&&policy.document.allowedDispositions.includes(review.disposition),'FINDING_DISPOSITION_REQUIRED');
    }
  }
  return {...target,phaseId,status:'accepted',findings:summary.findings,externalDotApprovalRequired:true,reviewAuthentication:'not-established',releaseAuthorized:false};
}
export function verifySarifDisposition({plan,phase,proof,artifact,reviewRecord}){
  check(hex40.test(plan?.head)&&hex40.test(plan?.tree)&&sarifLanguages.includes(phase?.language)&&phase.id==='codeql-'+phase.language,'PHASE_TARGET');
  check(proof?.phaseId===phase.id&&proof.source?.head===plan.head,'PROOF_TARGET');
  if(proof.source.tree!==undefined)check(proof.source.tree===plan.tree,'PROOF_TREE');
  const expected=phase.sarifEvidence;
  check(expected?.sourceHead===plan.head&&expected.sourceTree===plan.tree&&expected.language===phase.language,'PLAN_TARGET');
  if(expected.checkout!==undefined)check(expected.checkout===plan.checkout,'PLAN_CHECKOUT');
  const summary=validateSarifEvidence(expected,artifact);
  return applySarifDisposition({plan,phaseId:phase.id,summary,reviewRecord});
}

/** Disposition only: the caller must first authenticate and brand the complete
 * official Q artifact and its original analysis summary. This function neither
 * downloads/verifies raw SARIF nor authenticates official origin or dot review. */
export function verifyRecordedSarifDisposition({plan,phaseId,summary,reviewRecord}){
  check(summary?.schemaVersion===1&&summary.phaseId===phaseId&&summary.status==='analysis-complete'&&summary.disposition==='pending','RECORDED_ANALYSIS_STATE');
  check(summary.sourceHead===plan?.head&&summary.sourceTree===plan?.tree&&summary.language===phaseId?.slice(7)&&sarifLanguages.includes(summary.language),'RECORDED_ANALYSIS_TARGET');
  check(summary.suite==='security-extended'&&summary.analysisSuccessful===true&&Number.isSafeInteger(summary.queryCount)&&summary.queryCount>0&&Number.isSafeInteger(summary.runCount)&&summary.runCount>0,'RECORDED_ANALYSIS_COMPLETE');
  for(const key of ['sarifSHA256','analysisSHA256','queryPackSHA256','resultSetSHA256','policySHA256'])check(hex64.test(summary[key]),'RECORDED_ANALYSIS_DIGEST');
  check(Array.isArray(summary.findings)&&summary.zeroFindings===(summary.findings.length===0),'RECORDED_FINDINGS');
  check(new Set(summary.findings.map(f=>f.findingId)).size===summary.findings.length&&summary.findings.every(f=>hex64.test(f.findingId)&&hex64.test(f.resultSHA256)&&f.language===summary.language&&text(f.ruleId)&&object(f.severity)&&['none','note','warning','error'].includes(f.severity.level)&&Array.isArray(f.locations)&&hex64.test(f.fingerprint)),'RECORDED_FINDING_IDENTITY');
  check(summary.resultSetSHA256===canonicalSHA256(summary.findings.map(f=>({findingId:f.findingId,resultSHA256:f.resultSHA256}))),'RECORDED_RESULT_SET');
  check(summary.externalDotApprovalRequired===true&&summary.reviewAuthentication==='not-established'&&summary.releaseAuthorized===false,'RECORDED_AUTHENTICATION_BOUNDARY');
  const decision=applySarifDisposition({plan,phaseId,summary,reviewRecord});
  check(summary.policySHA256===decision.policySHA256,'RECORDED_POLICY_BINDING');
  return decision;
}


// Collection instructions are deliberately read-only. Capturing execution exits
// belongs to the trusted producer wrapper; this module never runs CodeQL.
export const codeqlCollectionInstructions=Object.freeze({
  version:['codeql','version','--format=json'],
  packs:['codeql','resolve','qlpacks','--format=json'],
  queries:{'javascript-typescript':['codeql','resolve','queries','--format=json','codeql/javascript-queries:codeql-suites/javascript-security-extended.qls'],python:['codeql','resolve','queries','--format=json','codeql/python-queries:codeql-suites/python-security-extended.qls']},
  notes:[
    'Retain original version/resolution JSON and the downloaded CodeQL bundle SHA256; never infer a CLI version from an Action tag.',
    'Inventory the actually resolved query and dependency pack roots: sorted regular relative files with byte size and SHA256, including qlpack.yml and the selected suite. Retain each inventory and canonicalSHA256(files) as treeSHA256.',
    'Retain exact generated config and a nonempty input manifest {sourceHead,sourceTree,files:[{path,sha256}]}; bind the separate checkout SHA when a PR merge checkout has the same tree.',
    'The producer must capture each real extract/create-or-finalize and analyze (or run-queries plus interpret-results) subprocess exit, signal, start/end, command and complete log bytes even on failure. Never manufacture complete/exit0 from job success.',
    'Set --sarif-group-rules-by-pack and a per-language --sarif-category. Preserve original SARIF; optional SARIF invocations cannot replace the mandatory execution receipt.',
    'These instructions collect identity only. They do not authorize running scans, activating CI, setting a disposition policy or authenticating dot review.'
  ],
  references:['https://docs.github.com/en/code-security/codeql-cli/codeql-cli-manual/version','https://docs.github.com/en/code-security/codeql-cli/codeql-cli-manual/resolve-qlpacks','https://docs.github.com/en/code-security/codeql-cli/codeql-cli-manual/resolve-queries','https://github.com/github/codeql-action/blob/main/src/codeql.ts'],
});
function localArtifacts(manifest,directory){
  const files={};
  const add=descriptor=>{
    const name=relativeFile(descriptor.path);let current=directory;
    for(const part of name.split('/')){current=path.join(current,part);check(!lstatSync(current).isSymbolicLink(),'SYMLINK_ARTIFACT');}
    check(lstatSync(current).isFile(),'NON_REGULAR_ARTIFACT');files[name]=readFileSync(current);
  };
  for(const e of Object.values(manifest.analyses??{})){
    for(const d of [e.sourceInputs,e.config,e.cli.versionOutput,e.querySuite,e.resolvedQueries,e.sarif,e.analysis,...e.queryPacks.map(p=>p.inventory)])add(d);
    const receipt=json(files[e.analysis.path],'ANALYSIS_RECEIPT_JSON');
    if(e.executionProfile==='codeql-action-v3'){
      for(const d of [e.cli.installationInventory,e.resolvedPacks,e.startingPacks,receipt.database.info,receipt.database.metadata])add(d);
      for(const record of receipt.metadataCommands){add(record.stdout);add(record.log);}
    }else for(const stage of receipt.stages??[])add(stage.log);
  }
  return {files};
}
export function main(argv=process.argv.slice(2)){
  const [command,filename,reviewFilename]=argv;
  if(command==='help'){console.log(JSON.stringify({commands:['validate EXPECTED.json','summary EXPECTED.json','admission EXPECTED.json [REVIEW.json]'],collection:codeqlCollectionInstructions},null,2));return;}
  check(['validate','summary','admission'].includes(command)&&filename&&argv.length<4,'CLI_USAGE');
  const manifest=json(readFileSync(filename),'EXPECTED_JSON'),artifact=localArtifacts(manifest,path.dirname(path.resolve(filename))),summary=validateSarifBundle(manifest,artifact);
  if(command!=='admission'){console.log(JSON.stringify(summary,null,2));return;}
  const reviews=reviewFilename?json(readFileSync(reviewFilename),'REVIEW_JSON'):{};
  const accepted=sarifLanguages.map(language=>verifySarifDisposition({plan:{head:manifest.sourceHead,tree:manifest.sourceTree,checkout:manifest.checkout,sarifPolicy:manifest.sarifPolicy},phase:{id:'codeql-'+language,language,sarifEvidence:manifest.analyses[language]},proof:manifest.proofs?.[language],artifact,reviewRecord:reviews[language]}));
  console.log(JSON.stringify({schemaVersion:1,accepted,externalDotApprovalRequired:true,reviewAuthentication:'not-established',releaseAuthorized:false},null,2));
}
if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){try{main();}catch(error){console.error(JSON.stringify({status:'rejected',error:error.message,releaseAuthorized:false,externalDotApprovalRequired:true}));process.exitCode=1;}}
