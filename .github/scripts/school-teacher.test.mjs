import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {validateCandidate,requireSuccess,sha256,rawDiffFingerprint,BRANCH,REPOSITORY,JOBS,schoolTeacherPlan,schoolTeacherOutputs} from './school-teacher-scope.mjs';
import {inspectHistoricalCase,requireReviewedCase,verifyTestReport,safeDiagnostic,reviewedCases,safeNpmAudit,requireNpmAuditSuccess,auditComponents,requireNoHistoricalAcceptance,verifyExecutionInputs} from './school-teacher-checks.mjs';
const draft=JSON.parse(readFileSync(new URL('./school-teacher-bindings.json',import.meta.url)));
const fixture=()=>{const evidence=Buffer.from('{}'), b={...draft,enabled:true,blockers:[],base:'1'.repeat(40),productHead:'2'.repeat(40),frontendTree:'4'.repeat(40),backendTree:'5'.repeat(40),source:{'server-version/frontend/src/example.ts':{before:'6'.repeat(40),after:'7'.repeat(40)}},controlBefore:{'.github/scripts/school-teacher-bindings.json':null},evidenceSha256:sha256(evidence),review:{completed:true,originalExecutionSigned:false},backendBuildDecision:'fresh-once',backendBuildReason:'Final generated client changed',backendBuildInputsChanged:['server-version/backend/prisma/schema.prisma'],execution:{...draft.execution,finalized:true}};
 const o={event:'pull_request',branch:BRANCH,repository:REPOSITORY,draft:false,forceFull:false,base:b.base,sourceHead:'8'.repeat(40),checkoutHead:'9'.repeat(40),sourceTree:'a'.repeat(40),checkoutTree:'a'.repeat(40),frontendTree:b.frontendTree,backendTree:b.backendTree,productFrontendTree:b.frontendTree,productBackendTree:b.backendTree,entries:[{file:'server-version/frontend/src/example.ts',oldMode:'100644',newMode:'100644',oldBlob:'6'.repeat(40),newBlob:'7'.repeat(40),status:'M'},{file:'.github/scripts/school-teacher-bindings.json',oldMode:'000000',newMode:'100644',oldBlob:'0'.repeat(40),newBlob:'b'.repeat(40),status:'A'}]};return {b,o,evidence}};
test('explicitly disabled candidate fails closed',()=>{const {b,o,evidence}=fixture();assert.doesNotThrow(()=>validateCandidate(b,o,evidence));b.enabled=false;assert.throws(()=>validateCandidate(b,o,evidence),/Candidate not independently frozen/)});
test('exact actual PR source independent from product snapshot and checkout SHA',()=>{const {b,o,evidence}=fixture();const p=validateCandidate(b,o,evidence);assert.equal(p.sourceHead,o.sourceHead);assert.notEqual(p.product,p.sourceHead)});
for(const [key,value]of [['base','0'.repeat(40)],['checkoutTree','0'.repeat(40)],['frontendTree','0'.repeat(40)],['backendTree','0'.repeat(40)],['productFrontendTree','0'.repeat(40)],['branch','work/other'],['repository','foreign/repo'],['draft',true],['event','workflow_dispatch'],['forceFull',true]])test('reject '+key,()=>{const {b,o,evidence}=fixture();o[key]=value;assert.throws(()=>validateCandidate(b,o,evidence))});
test('evidence tampering rejected',()=>{const {b,o}=fixture();assert.throws(()=>validateCandidate(b,o,Buffer.from('bad')))});
for(const mutation of ['unknown','missing','mode','blob','before','duplicate'])test('full raw boundary rejects '+mutation,()=>{const {b,o,evidence}=fixture();if(mutation==='unknown')o.entries[0].file='server-version/unknown.ts';if(mutation==='missing')o.entries.pop();if(mutation==='mode')o.entries[0].newMode='120000';if(mutation==='blob')o.entries[0].newBlob='c'.repeat(40);if(mutation==='before')o.entries[1].oldBlob='c'.repeat(40);if(mutation==='duplicate')o.entries[1]={...o.entries[0]};assert.throws(()=>validateCandidate(b,o,evidence))});
test('backend unreviewed reuse cannot trigger fresh fallback',()=>{const {b,o,evidence}=fixture();b.backendBuildDecision='verified-official-input-identical';assert.throws(()=>validateCandidate(b,o,evidence))});
test('final review and final selections required',()=>{const {b,o,evidence}=fixture();b.execution.finalized=false;assert.throws(()=>validateCandidate(b,o,evidence))});
for(const result of ['skipped','cancelled','failure',undefined])test('nested aggregate rejects '+result,()=>{const needs=Object.fromEntries(JOBS.map(id=>[id,{result:'success'}]));needs.connected.result=result;assert.throws(()=>requireSuccess({requiredJobs:JOBS},needs))});
test('nested aggregate rejects missing or extra jobs',()=>{assert.throws(()=>requireSuccess({requiredJobs:JOBS},{}));assert.throws(()=>requireSuccess({requiredJobs:[]},{extra:{result:'success'}}))});
test('nested aggregate all exact success',()=>assert.equal(requireSuccess({requiredJobs:JOBS},Object.fromEntries(JOBS.map(id=>[id,{result:'success'}]))),true));
test('raw diff binds complete bytes and refuses duplicate paths',()=>{const row=':100644 100644 '+'1'.repeat(40)+' '+'2'.repeat(40)+' M\0server-version/example.ts\0',bytes=Buffer.from(row);assert.equal(rawDiffFingerprint(bytes),sha256(bytes));assert.throws(()=>rawDiffFingerprint(Buffer.from(row+row)));assert.throws(()=>rawDiffFingerprint(Buffer.from('')))});
test('passed case in failed unsigned invocation remains unadmitted',()=>{const raw=Buffer.from(JSON.stringify({success:false,testResults:[{assertionResults:[{fullName:'Synthetic case',status:'passed'}]}]}));const g={originalExecutionSigned:false,ciExecuted:false,reviewStatus:'UNREVIEWED_GAP'},r={sha256:sha256(raw),cases:[{name:'Synthetic case',status:'passed'}]};const result=inspectHistoricalCase(g,r,0,raw);assert.equal(result.invocationSuccess,false);assert.equal(result.admitted,false);assert.throws(()=>requireReviewedCase(g,r,0,result))});
test('original report byte tampering rejected',()=>assert.throws(()=>inspectHistoricalCase({originalExecutionSigned:false,ciExecuted:false},{sha256:'0'.repeat(64),cases:[]},0,Buffer.from('{}'))));
for(const status of ['failed','pending','skipped'])test('review cannot admit '+status,()=>{const digest='a'.repeat(64),g={reviewStatus:'INDEPENDENTLY_REVIEWED',reviewSha256:digest,inputClosure:{sha256:digest},admittedCaseKeys:[digest+':0']};assert.throws(()=>requireReviewedCase(g,{sha256:digest},0,{status}))});
const report=()=>({success:true,numFailedTests:0,testResults:[{assertionResults:[{fullName:'actual',status:'passed'},{fullName:'not-selected',status:'skipped'}]}]});
test('test reporter requires exact passed and filtered matrix',()=>assert.equal(verifyTestReport(report(),{expectedPassed:['actual'],expectedFiltered:['not-selected']}).passed,1));
test('test reporter refuses unexpected skip',()=>assert.throws(()=>verifyTestReport(report(),{expectedPassed:['actual'],expectedFiltered:[]})));
test('test reporter refuses zero match',()=>assert.throws(()=>verifyTestReport({success:true,numFailedTests:0,testResults:[]},{expectedPassed:[],expectedFiltered:[]})));
test('test reporter refuses failed teardown even with passed case',()=>{const r=report();r.success=false;assert.throws(()=>verifyTestReport(r,{expectedPassed:['actual'],expectedFiltered:['not-selected']}))});
test('workflow has actual phases and strict aggregate, no old reuse or security downgrade',()=>{const w=readFileSync(new URL('../workflows/ci-school-teacher.yml',import.meta.url),'utf8');for(const phase of ['admission','frontend','backend','migrate','postgres','restore','browser-report','audit','aggregate'])assert(w.includes('school-teacher-checks.mjs '+phase));assert(w.includes('needs: [admission, frontend, connected, security]'));assert(!/no-sandbox|ignoreHTTPSErrors|sysctl|school-teacher-browser-control|school-teacher-browser-reuse/.test(w));assert(!w.includes('DRAFT_NOT_EXECUTABLE'))});

test('diagnostics allow only code locations and compiler codes, never credentials or assertion values',()=>{const s=JSON.stringify(safeDiagnostic('postgresql://user:secret@127.0.0.1/db Cookie: session=secret Authorization: Bearer secret password=secret token=secret at src/safe.ts:13:2 error TS1234: secret'));assert(!s.includes('secret'));assert(s.includes('src/safe.ts:13:2'));assert(s.includes('TS1234'))});

const safeGroup=()=>({originalExecutionSigned:false,ciExecuted:false,reviewStatus:'INDEPENDENTLY_REVIEWED',reviewSha256:'a'.repeat(64),inputClosure:{sha256:'b'.repeat(64)},admittedCaseKeys:['c'.repeat(64)+':0'],reports:[{sha256:'c'.repeat(64),invocationSuccess:false,cases:[{name:'reviewed passing assertion',status:'passed'},{name:'historical failure',status:'failed'}]}]});
test('safe historical index preserves failed invocation and unsigned identity',()=>{const [r]=reviewedCases(safeGroup());assert.equal(r.invocationSuccess,false);assert.equal(r.originalRawVerifiedByCI,false);assert.equal(r.originalExecutionSigned,false);assert.equal(r.ciExecuted,false);assert.equal(r.admitted,true)});
test('safe historical index refuses compressed raw data and arbitrary messages',()=>{const g=safeGroup();g.reports[0].gzipBase64='forbidden';assert.throws(()=>reviewedCases(g))});
test('safe historical index refuses nonexistent admission keys',()=>{const g=safeGroup();g.admittedCaseKeys.push('d'.repeat(64)+':0');assert.throws(()=>reviewedCases(g))});
test('safe historical index refuses admitting known failed assertion',()=>{const g=safeGroup();g.admittedCaseKeys=['c'.repeat(64)+':1'];assert.throws(()=>reviewedCases(g))});

test('fresh artifact handoff is browser-step-only after both successful verifies',()=>{
 const w=readFileSync(new URL('../workflows/ci-school-teacher.yml',import.meta.url),'utf8');
 const verify=w.indexOf('      - name: verify both compiled artifacts against this SHA, run and lock');
 const browser=w.indexOf('      - name: execute real School Teacher journey with sandboxed official Chrome');
 assert(verify>=0&&browser>verify);
 const beforeBrowser=w.slice(verify,browser),browserStep=w.slice(browser,w.indexOf('      - name:',browser+10));
 assert(beforeBrowser.includes('node .github/scripts/ci-artifact.mjs verify frontend'));
 assert(beforeBrowser.includes('node .github/scripts/ci-artifact.mjs verify backend'));
 assert(browserStep.includes("        env:\n          SCHOOL_TEACHER_ARTIFACTS_VERIFIED: '1'\n"));
 assert(browserStep.includes('run: node server-version/e2e/school-teacher-browser.cjs'));
 assert.equal((w.match(/SCHOOL_TEACHER_ARTIFACTS_VERIFIED/g)||[]).length,1);
 assert(!/continue-on-error|reused-builds\.json|school-teacher-browser-reuse/.test(w));
 assert(!beforeBrowser.includes('if: always()'));
});

const routeFixture=()=>{const f=fixture(),{b,o}=f;const values={[b.base+':server-version/frontend/src/example.ts']:'6'.repeat(40),[o.checkoutHead+':server-version/frontend/src/example.ts']:'7'.repeat(40),[o.checkoutHead+':.github/scripts/school-teacher-bindings.json']:'b'.repeat(40),[o.sourceHead+'^{tree}']:o.sourceTree,[o.checkoutHead+'^{tree}']:o.checkoutTree,[o.checkoutHead+':server-version/frontend']:b.frontendTree,[o.checkoutHead+':server-version/backend']:b.backendTree,[b.productHead+':server-version/frontend']:b.frontendTree,[b.productHead+':server-version/backend']:b.backendTree};return {...f,env:{CI_EVENT:'pull_request',CI_HEAD_REF:BRANCH,CI_SOURCE_HEAD:o.sourceHead,CI_PR_REPOSITORY:REPOSITORY,CI_IS_DRAFT:'false'},read:(_cmd,key)=>{assert(key in values,'Unexpected read '+key);return values[key]}}};
test('school route leaves unrelated Survey entries unselected',()=>{const f=routeFixture();assert.equal(schoolTeacherPlan([],f.b.base,f.o.checkoutHead,f.read,{...f.env,CI_HEAD_REF:'work/survey-visual-20261022'},f.b,f.evidence),null)});
test('school route known branch cannot lose marker and fall through',()=>{const f=routeFixture();assert.throws(()=>schoolTeacherPlan([],f.b.base,f.o.checkoutHead,f.read,f.env,f.b,f.evidence))});
test('school route refuses dispatch before legacy probe even without marker',()=>{const f=routeFixture();assert.throws(()=>schoolTeacherPlan([],f.b.base,f.o.checkoutHead,f.read,{...f.env,CI_EVENT:'workflow_dispatch'},f.b,f.evidence))});
test('school route exact PR uses event source tree and matches direct plan',()=>{const f=routeFixture();assert.deepEqual(schoolTeacherPlan(f.o.entries,f.b.base,f.o.checkoutHead,f.read,f.env,f.b,f.evidence),validateCandidate(f.b,f.o,f.evidence))});
for(const change of [{CI_FORCE_FULL:'true'},{CI_IS_DRAFT:'true'},{CI_PR_REPOSITORY:'untrusted/repo'}])test('school route rejects event override '+Object.keys(change)[0],()=>{const f=routeFixture();assert.throws(()=>schoolTeacherPlan(f.o.entries,f.b.base,f.o.checkoutHead,f.read,{...f.env,...change},f.b,f.evidence))});
test('school route exact postmerge main classifies without accepting a different branch',()=>{const f=routeFixture();assert.equal(schoolTeacherPlan(f.o.entries,f.b.base,f.o.checkoutHead,f.read,{...f.env,CI_EVENT:'push',CI_HEAD_REF:'main'},f.b,f.evidence).head,f.o.checkoutHead);assert.throws(()=>schoolTeacherPlan(f.o.entries,f.b.base,f.o.checkoutHead,f.read,{...f.env,CI_EVENT:'push',CI_HEAD_REF:BRANCH},f.b,f.evidence))});
test('school route outputs disable unrelated Situational acceptance but retain real CodeQL',()=>{const p={route:'school-teacher'},o=schoolTeacherOutputs(p,{accept_media:true});assert.equal(o.situational,false);assert.equal(o.run_performance_tests,false);assert.equal(o.accept_media,false);assert.equal(o.codeql,true);assert.equal(o.application_route,'school-teacher');assert.equal(o.school_teacher_plan,JSON.stringify(p))});
test('school route integration preserves existing Survey route and exact gate recheck',()=>{const scope=readFileSync(new URL('./content-scope.mjs',import.meta.url),'utf8'),gate=readFileSync(new URL('./merge-gate.mjs',import.meta.url),'utf8'),ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');assert(scope.indexOf('const schoolTeacher=')<scope.indexOf('const surveyWorkspace='));assert(scope.includes('surveyWorkspaceOutputs(surveyWorkspace)'));assert(gate.includes("return ['scope','school-teacher','codeql']"));assert(gate.includes('recomputed-school-teacher-plan'));assert(gate.includes('recomputed-survey-workspace-plan'));assert(ci.includes('uses: ./.github/workflows/ci-survey-workspace.yml'));assert(ci.includes('uses: ./.github/workflows/ci-school-teacher.yml'));assert(ci.includes('work/school-teacher-review-20261022'));assert(ci.includes("application_route == 'school-teacher' && 'paths: [server-version/backend/src, server-version/frontend/src, server-version/e2e, .github/scripts]'"))});

test('School Teacher CodeQL entry requires a ready pull request and preserves required SAST',()=>{
 const workflow=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const job=workflow.slice(workflow.indexOf('\n  codeql:\n'));
 const line=job.split('\n').find(line=>line.startsWith('    if: '));
 assert(line?.startsWith('    if: ${{ ')&&line.endsWith(' }}'));
 const expression=line.slice('    if: ${{ '.length,-' }}'.length);
 const evaluate=new Function('github','needs','vars','cancelled','fromJSON','contains','return ('+expression+');');
 const permits=(event,draft,route,cancelled=false)=>evaluate({event_name:event,event:{pull_request:{draft}}},{scope:{outputs:{application_route:route,codeql:'true',scenario:'school-teacher'}}},{CI_FORCE_FULL:'false'},()=>cancelled,JSON.parse,(haystack,needle)=>haystack.includes(needle));
 assert.equal(permits('pull_request',false,'school-teacher'),true);
 assert.equal(permits('pull_request',true,'school-teacher'),false);
 for(const event of ['push','workflow_dispatch'])assert.equal(permits(event,false,'school-teacher'),false);
 assert.equal(permits('pull_request',false,'school-teacher',true),false);
 assert.equal(permits('pull_request',false,'unrelated-route'),false);
 for(const route of ['survey-workspace','training-appearance','legacy'])assert.equal(permits('pull_request',false,route),true);
 const gate=readFileSync(new URL('./merge-gate.mjs',import.meta.url),'utf8');
 assert(gate.includes("if(scope.application_route==='school-teacher')return ['scope','school-teacher','codeql'];"));
 assert(gate.includes("filter(name => needs[name]?.result !== 'success')"));
});

const syntheticAudit=(severity='high')=>({auditReportVersion:2,metadata:{vulnerabilities:{info:0,low:0,moderate:0,high:severity==='high'?1:0,critical:0,total:severity==='high'?1:0}},vulnerabilities:severity==='high'?{fixture:{name:'fixture',severity:'high',range:'>=1.0.0 <2.0.0',via:[{source:123,url:'https://github.com/advisories/GHSA-abcd-efgh-ijkl',severity:'high',range:'<2.0.0'}]}}:{}});
test('audit JSON preserves public package advisory severity and HIGH CRITICAL failure',()=>{const r=safeNpmAudit(JSON.stringify(syntheticAudit()),new Set(['fixture']));assert.equal(r.vulnerabilities[0].name,'fixture');assert.equal(r.vulnerabilities[0].range,'>=1.0.0 <2.0.0');assert.equal(r.vulnerabilities[0].advisories[0].advisoryId,'GHSA-abcd-efgh-ijkl');assert.throws(()=>requireNpmAuditSuccess(1,r));assert.throws(()=>requireNpmAuditSuccess(0,r));const clean=safeNpmAudit(JSON.stringify(syntheticAudit('none')),new Set());assert.doesNotThrow(()=>requireNpmAuditSuccess(0,clean));assert.throws(()=>requireNpmAuditSuccess(1,clean))});
test('audit JSON excludes arbitrary messages credentials environment URLs and unknown packages',()=>{const input=syntheticAudit();input.error={code:'E401',summary:'token=private',detail:'postgresql://private'};input.environment='private';input.vulnerabilities.fixture.range='https://private';input.vulnerabilities.fixture.via=[{source:42,url:'https://github.com/advisories/GHSA-abcd-efgh-ijkl?token=private',title:'private',severity:'high',range:'password=private'}];input.vulnerabilities.private={severity:'high',range:'*'};const r=safeNpmAudit(JSON.stringify(input),new Set(['fixture']));assert.equal(r.errorCode,'E401');assert.equal(r.vulnerabilities.length,1);assert.equal(r.vulnerabilities[0].range,null);assert.deepEqual(r.vulnerabilities[0].advisories,[{source:42,severity:'high'}]);assert(!JSON.stringify(r).includes('private'));input.error.code='E_PRIVATE_TOKEN';assert.equal(safeNpmAudit(JSON.stringify(input),new Set(['fixture'])).errorCode,'UNRECOGNIZED_ERROR');assert.throws(()=>requireNpmAuditSuccess(0,r))});
test('audit JSON rejects unparseable absent counts and inconsistent successful output',()=>{for(const raw of ['not json','null','{}',JSON.stringify({auditReportVersion:2,metadata:{vulnerabilities:{high:0}}})])assert.throws(()=>requireNpmAuditSuccess(0,safeNpmAudit(raw,new Set())));const invalid=syntheticAudit('none');invalid.metadata.vulnerabilities.total=3;assert.throws(()=>requireNpmAuditSuccess(0,safeNpmAudit(JSON.stringify(invalid),new Set())))});

test('Frontend cross-tree types prepare backend dependencies and generated client before checks',()=>{
 const workflow=readFileSync(new URL('../workflows/ci-school-teacher.yml',import.meta.url),'utf8');
 const job=workflow.slice(workflow.indexOf('\n  frontend:\n'),workflow.indexOf('\n  connected:\n'));
 const prep=job.indexOf('working-directory: server-version/backend');
 const checks=job.indexOf('school-teacher-checks.mjs frontend');
 assert(prep>0&&checks>prep);
 const commands=job.slice(prep,checks);
 assert(commands.includes('npm ci --ignore-scripts\n          npm run db:generate'));
 assert.equal((job.match(/npm run db:generate/g)||[]).length,1);
 assert(!/prisma migrate|checks.mjs backend|vitest/.test(job));
 assert(job.includes('server-version/frontend/package-lock.json')&&job.includes('server-version/backend/package-lock.json'));
});

test('both component audits execute and retain exact failure before strict aggregate rejection',()=>{
 for(const failed of [['frontend'],['backend'],['frontend','backend']]){const seen=[],reports=[];assert.throws(()=>auditComponents(['frontend','backend'],c=>{seen.push(c);if(failed.includes(c))throw Error('private diagnostic')},r=>reports.push(r)));assert.deepEqual(seen,['frontend','backend']);assert.equal(reports[0].status,'FAILED');assert.deepEqual(reports[0].components.map(r=>r.status),['frontend','backend'].map(c=>failed.includes(c)?'FAILED':'PASSED'));assert(!JSON.stringify(reports).includes('private'))}
 const reports=[];assert.doesNotThrow(()=>auditComponents(['frontend','backend'],()=>{},r=>reports.push(r)));assert.equal(reports[0].status,'PASSED');
});
test('component audit aggregate rejects missing duplicate and reversed component sets',()=>{for(const components of [[],['frontend'],['backend'],['frontend','frontend'],['backend','frontend']])assert.throws(()=>auditComponents(components,()=>assert.fail('must reject before execution'),()=>assert.fail('must not emit success')))});
test('dependency-updated admission refuses every historical acceptance',()=>{assert.doesNotThrow(()=>requireNoHistoricalAcceptance({schemaVersion:1,acceptedGroups:[]}));for(const e of [{schemaVersion:1,acceptedGroups:[safeGroup()]},{schemaVersion:1},{schemaVersion:1,acceptedGroups:[],groups:[]}])assert.throws(()=>requireNoHistoricalAcceptance(e))});
test('configured source inventory rejects a missing lint test fixture or npm script',()=>{
 const read=p=>p.endsWith('/package.json')?JSON.stringify({scripts:{build:'vite build','db:generate':'prisma generate'}}):'source';assert.doesNotThrow(()=>verifyExecutionInputs(draft,read));
 for(const target of ['server-version/frontend/'+draft.execution.frontend.lintFiles[0],'server-version/frontend/'+draft.execution.frontend.batches[0].files[0],'server-version/e2e/school-teacher-fixture.cjs'])assert.throws(()=>verifyExecutionInputs(draft,p=>{if(p===target)throw Error('missing');return read(p)}));assert.throws(()=>verifyExecutionInputs(draft,p=>p==='server-version/frontend/package.json'?'{}':read(p)));
});

test('updated dependency candidate executes four brand and two sanitizer assertions rather than admitting history',()=>{const batches=draft.execution.frontend.batches;assert.equal(batches.reduce((n,b)=>n+b.expectedPassed.length,0),23);const brand=batches.find(b=>b.files.includes('src/huiteacher/TeacherBrand.test.tsx')),sanitizer=batches.find(b=>b.files.includes('src/utils/__tests__/sanitize.test.ts'));assert.equal(brand.expectedPassed.length,4);assert.deepEqual(brand.expectedFiltered,[]);assert.deepEqual(sanitizer.expectedPassed,['sanitizeHtml removes script, event handler, javascript URL, SVG, and style payloads','sanitizeHtml preserves ordinary formatting text']);assert.deepEqual(sanitizer.expectedFiltered,[]);requireNoHistoricalAcceptance(JSON.parse(readFileSync(new URL('./school-teacher-evidence.json',import.meta.url))))});
