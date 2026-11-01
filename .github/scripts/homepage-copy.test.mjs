import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {execFileSync} from 'node:child_process';
import {classifyChanges,acceptanceFor} from './content-scope.mjs';
import {admitsCopy,portalCopy,featureCopy,admitsHeadingAssertion,portalFile,featuresFile,assertionFile,publicPresentation,publicRouteBoundary,publicRenderBoundary} from './homepage-copy-scope.mjs';
const oldPortal=`export default function Home(){return <div><p className="training-eyebrow">旧眉题</p><h1 id="training-title">旧标题，<br />旧结语。</h1><p className="training-portal-description">旧描述，<br />旧次行。</p><a href="/login">登录</a></div>}`;
const newPortal=oldPortal.replace('旧眉题','新眉题').replace('旧标题','新标题');
const oldFeatures=`export const schoolFeatures=[{path:'/features/positive-campus',title:'旧校园',icon:Icon,description:'描述'}]`;
const newFeatures=oldFeatures.replace('旧校园','新校园');
const oldTest="expect(screen.getByRole('heading', { name: /旧标题，.*旧结语。/ })).toBeInTheDocument()\nassertions unchanged";
const newTest=oldTest.replace('旧标题','新标题');
const entry=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const texts={base:{[portalFile]:oldPortal,[featuresFile]:oldFeatures,[assertionFile]:oldTest},head:{[portalFile]:newPortal,[featuresFile]:newFeatures,[assertionFile]:newTest}};
const read=(ref,file)=>texts[ref][file];
test('literal copy and exactly its heading assertion qualify together',()=>{
 assert.equal(admitsCopy([portalFile,featuresFile,assertionFile].map(entry),read),true);
 assert.equal(admitsCopy([entry(featuresFile)],read),true);
 assert.equal(admitsCopy([entry(portalFile)],read),true);
 assert.equal(admitsHeadingAssertion(oldTest,newTest,oldPortal,newPortal),true);
 assert.deepEqual(portalCopy(newPortal).copy.heading,['新标题，','旧结语。']);
 assert.equal(featureCopy(newFeatures).title,'新校园');
});
test('attributes, links, markup, expressions and side effects cannot masquerade as copy',()=>{
 for(const after of [newPortal.replace('/login','/admin'),newPortal.replace('<br />',''),newPortal.replace('新标题，','{fetch("/api")}'),newPortal.replace('新标题，','<script>alert(1)</script>'),newPortal+'\nfetch("/api")',newPortal.replace('id="training-title"','id="training-title" onClick={act}'),newPortal.replace('新眉题','&amp;')]){
  assert.equal(admitsCopy([entry(portalFile)],(ref)=>ref==='base'?oldPortal:after),false,after);
 }
 for(const after of [newFeatures.replace('Icon','Other'),newFeatures.replace('/features/positive-campus','/admin'),newFeatures.replace("'新校园'","getTitle()"),newFeatures+'\nsideEffect()'])
  assert.equal(admitsCopy([entry(featuresFile)],ref=>ref==='base'?oldFeatures:after),false,after);
});
test('no unknown application, dependency, permission, mode or test weakening is admitted',()=>{
 for(const file of ['server-version/backend/src/routes/auth.ts','server-version/backend/prisma/schema.prisma','server-version/frontend/package.json','server-version/frontend/src/school/SchoolApp.tsx','.github/workflows/ci-backend.yml','unknown'])
  assert.equal(admitsCopy([entry(portalFile),entry(file)],read),false,file);
 for(const patch of [{status:'D',newMode:'000000'},{status:'T',newMode:'120000'},{newMode:'100755'},{oldMode:'120000'},{status:'A',oldMode:'000000'}])
  assert.equal(admitsCopy([{...entry(portalFile),...patch}],read),false);
 assert.equal(admitsCopy([entry(assertionFile)],read),false);
 assert.equal(admitsCopy([],read),false);
 assert.equal(admitsHeadingAssertion(oldTest,newTest+'\nother assertion removed',oldPortal,newPortal),false);
 assert.equal(admitsHeadingAssertion(oldTest,newTest.replace('toBeInTheDocument','toBeTruthy'),oldPortal,newPortal),false);
});


import {requiredChecks,failedChecks} from './merge-gate.mjs';
const planFixture={schema:1,route:'homepage-copy',base:'a'.repeat(40),head:'b'.repeat(40),changed:['frontend'],pages:[{page:'school',title:'新校园'}],toolsChanged:true,required:['copy-boundary','frontend-candidate','runtime-scan','homepage-browser','sast']};
const flags=Object.fromEntries(['media2','media7','situational_video','situational_branching','video_core','app_shell','canonical_visual','perf_smoke','ops'].map(k=>[k,'false']));
const scopeOutputs={...flags,application_route:'homepage-copy',scenario:'homepage-copy',homepage_copy_plan:JSON.stringify(planFixture)};
test('ready copy gate demands exact candidate and changed-tool SAST success',()=>{
 const needs={scope:{result:'success',outputs:scopeOutputs},'homepage-copy':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','homepage-copy','codeql']);
 assert.deepEqual(failedChecks(needs,false),[]);
 assert.deepEqual(requiredChecks(needs,true),['scope']);
 for(const job of ['scope','homepage-copy','codeql'])for(const result of ['failure','cancelled','skipped',undefined])
  assert.ok(failedChecks({...needs,[job]:{...needs[job],result}},false).includes(job));
 for(const patch of [{homepage_copy_plan:'{}'},{homepage_copy_plan:'invalid'}, {scenario:'frontend'}, {ops:'true'},
  {homepage_copy_plan:JSON.stringify({...planFixture,head:'HEAD'})},
  {homepage_copy_plan:JSON.stringify({...planFixture,changed:['backend']})},
  {homepage_copy_plan:JSON.stringify({...planFixture,required:['homepage-browser']})}])
  assert.ok(failedChecks({...needs,scope:{result:'success',outputs:{...scopeOutputs,...patch}}},false).includes('scope'));
 const pure={...scopeOutputs,homepage_copy_plan:JSON.stringify({...planFixture,toolsChanged:false,required:planFixture.required.slice(0,-1)})};
 assert.deepEqual(requiredChecks({scope:{outputs:pure}},false),['scope','homepage-copy']);
});
test('copy route is exclusive with all backend, database and unrelated consumers',()=>{
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const job=name=>ci.split('\n  '+name+':\n')[1]?.split(/\n  [a-z][a-z0-9-]*:\n/)[0]||'';
 for(const name of ['backend','backend-browser-build','backend-regression','frontend-build','frontend','browser','docker','accept-media','accept-ui','accept-visual','accept-perf','accept-ops','miniprogram','pr-light-backend','pr-light-frontend'])
  assert.match(job(name),/application_route == 'legacy'/,name);
 assert.match(job('homepage-copy'),/draft == false/);
 assert.match(job('merge-gate'),/homepage-copy/);
 assert.match(readFileSync(new URL('./merge-gate.mjs',import.meta.url),'utf8'),/recomputed-homepage-copy-plan/);
 assert.match(job('codeql'),/homepage-copy.*toolsChanged/);
 assert.match(job('codeql'),/paths: \[server-version\/frontend\/src, .github\/scripts\/homepage-copy-scope.mjs/);
 const candidate=readFileSync(new URL('./homepage-copy-candidate.py',import.meta.url),'utf8');
 const workflow=readFileSync(new URL('../workflows/ci-homepage-copy.yml',import.meta.url),'utf8');
 const browser=readFileSync(new URL('./homepage-copy-browser.mjs',import.meta.url),'utf8');
 assert.match(candidate,/p\['changed'\] == \['frontend'\]/);
 assert.doesNotMatch(candidate,/server-version\/backend|prisma|postgres|redis/);
 assert.equal((candidate.match(/'--target','build'/g)||[]).length,1);
 assert.match(candidate,/npx vitest run/);assert.doesNotMatch(candidate,/vitest related/);
 assert.match(candidate,/RepoDigests/);
 assert.match(candidate,/'docker','save'/);
 assert.match(candidate,/imageTarSha256/);
 assert.match(workflow,/--severity HIGH,CRITICAL/);
 assert.match(workflow,/recheck exact diff/);
 assert.match(browser,/checks.image/);
 assert.match(browser,/MAP training.eduk12.top 127.0.0.1/);
 assert.match(browser,/MAP school.eduk12.top 127.0.0.1/);
 assert.match(browser,/route.abort/);
 assert.match(browser,/browser-failure.png/);
 assert.match(job('scope'),/homepage-copy' && github.event_name == 'pull_request'/);
 assert.match(browser,/actual scanned Nginx image/);
 assert.match(browser,/finally/);
});

const staticFile='server-version/frontend/src/survey/SurveyFeaturePage.tsx';
const staticBefore="export function Page(){return <main><h1>旧说明</h1><a href='/login'>登录</a></main>}";
const staticAfter=staticBefore.replace('旧说明','新说明');
test('public presentation admits markup and data while retaining runtime behavior',()=>{
 assert.equal(publicRenderBoundary(staticBefore,staticAfter),true);
 assert.deepEqual(publicPresentation([entry(staticFile)],ref=>ref==='base'?staticBefore:staticAfter),{pages:[{page:'survey',static:true}],executable:true});
 for(const after of [staticAfter+";fetch('/api/auth')",staticAfter+";export * from '../api/auth'",staticAfter+";import '../api/origins'",staticAfter.replace('<main>','<main dangerouslySetInnerHTML={{__html:source}}>'),staticAfter+";while(true){}"])
  assert.equal(publicRenderBoundary(staticBefore,after),false,after);
 const auth="import {useAuth} from '../contexts/AuthContext';export function Page(){const {user}=useAuth();const href=user?.role==='TEACHER'?'/teacher':'/login';return <a href={href}>说明</a>}";
 assert.equal(publicRenderBoundary(auth,auth.replace('说明','新说明')),true);
 assert.equal(publicRenderBoundary(auth,auth.replace("'TEACHER'","'STUDENT'")),false);
 for(const file of ['server-version/frontend/src/api/auth.ts','server-version/frontend/package.json','server-version/backend/prisma/schema.prisma'])
  assert.equal(publicPresentation([entry(staticFile),entry(file)],()=>staticAfter),null,file);
});
test('public App branch preserves the authenticated application body',()=>{
 const before="import {teacherFeatures} from './teacher-features'\nexport default function HuiteacherApp(){const user=useSession();return <Workspace user={user}/>}";
 const after="import {teacherFeatures} from './teacher-features'\nimport {HuiteacherFeaturePage} from './HuiteacherFeaturePage'\nexport default function HuiteacherApp(){const feature=teacherFeatures.find(item=>item.path===window.location.pathname);return feature?<HuiteacherFeaturePage feature={feature}/>:<HuiteacherApplication/>}\nfunction HuiteacherApplication(){const user=useSession();return <Workspace user={user}/>}";
 // The pre-existing feature import is left in place for both sides in this fixture.
 assert.equal(publicRouteBoundary('huiteacher',before,after),true);
 assert.equal(publicRouteBoundary('huiteacher',before,after.replace('useSession()','skipSession()')),false);
 assert.equal(publicRouteBoundary('huiteacher',before,after.replace('item.path===window.location.pathname','true')),false);
});
test('executable public rendering keeps SAST and selected failure cannot pass',()=>{
 const p={...planFixture,toolsChanged:false,sast:true};const outputs={...scopeOutputs,homepage_copy_plan:JSON.stringify(p)};
 const needs={scope:{result:'success',outputs},'homepage-copy':{result:'success'},codeql:{result:'success'}};
 assert.deepEqual(requiredChecks(needs,false),['scope','homepage-copy','codeql']);assert.deepEqual(failedChecks(needs,false),[]);
 for(const result of ['skipped','failure','cancelled',undefined])assert.ok(failedChecks({...needs,codeql:{result}},false).includes('codeql'));
});

test('real workflow conditions select only public candidate and SAST for executable public pages',()=>{
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const block=name=>ci.split('\n  '+name+':\n')[1]?.split(/\n  [a-z][a-z0-9-]*:\n/)[0]||'';
 const outputs={...scopeOutputs,content:'false',frontend:'true',frontend_build:'true',codeql:'true',homepage_copy_plan:JSON.stringify({...planFixture,toolsChanged:false,sast:true})};
 const needs=new Proxy({scope:{result:'success',outputs}},{get:(value,key)=>value[key]||{result:'skipped',outputs:{}}}),github={event_name:'pull_request',ref_name:'feature/public',event:{pull_request:{number:1234,draft:false,head:{ref:'feature/public'}}}};
 for(const name of ['homepage-copy','codeql','backend','backend-browser-build','backend-regression','frontend','frontend-build','browser','docker','accept-perf','accept-ops']) {
  const expression=block(name).match(/^    if: \$\{\{ (.+) \}\}$/m)?.[1];assert.ok(expression,name);
  const selected=new Function('needs','github','vars','cancelled','fromJSON','contains',`return (${expression.replace(/needs\.([a-z][a-z0-9-]*)/g,(_,key)=>'needs['+JSON.stringify(key)+']')})`)(needs,github,{CI_FORCE_FULL:'false'},()=>false,JSON.parse,(list,item)=>list.includes(item));
  assert.equal(Boolean(selected),['homepage-copy','codeql'].includes(name),name);
 }
});

test('passive CUA notes retain the CSS-only route and CSS does not run TypeScript lint/types',()=>{
 const css='server-version/frontend/src/components/catalog-discovery.css';
 assert.equal(classifyChanges([entry(css),entry('docs/cua-catalog-empty.md')]).presentation,true);
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const visual=ci.split('\n  visual:\n')[1].split('\n  survey-review:')[0];
 assert.match(visual,/npm run build/);assert.doesNotMatch(visual,/npm run lint|npm run typecheck|npm test/);
});
