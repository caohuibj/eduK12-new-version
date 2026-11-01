import {test} from 'node:test';import assert from 'node:assert/strict';import {backendApiFocus,formIntakeFiles,formIntakeTests} from './backend-api-scope.mjs';
const route="// Pending content intake only. Existing approval/trial writes retain step-up below.\nsurveyGovernedToolsRouter.post('/submissions/original-form',handle(req=>service.submitOriginalForm(req.user!.userId,req.body)))\n";
const base={routes:'auth\nsurveyGovernedToolsRouter.use(requireRecentAdminKey)\napproval',service:'import x;\nexport async function governedCatalog() {old()}\nexport async function governedDetail() {detail()}\nexport async function approveGovernedTool() {authority()}',catalog:'header\nexport function discoveryJoin() {old()}\nexport const governedDiscoveryIdentity={};'};
const head={...base,routes:base.routes.replace('surveyGovernedToolsRouter.use',route+'surveyGovernedToolsRouter.use'),service:base.service.replace('{old()}','{labels()}')+'\n/** Save complete native Form content */\nexport function originalFormArtifact() {}',catalog:base.catalog.replace('{old()}','{formLabels()}')};
const entries=Object.values(formIntakeFiles).map(file=>({file,status:'M',oldMode:'100644',newMode:'100644'}));
const readers=(changed=head)=>({readHeadFile:p=>{const key=Object.keys(formIntakeFiles).find(k=>formIntakeFiles[k]===p);return key?changed[key]:'synthetic selected test'},readBaseFile:p=>base[Object.keys(formIntakeFiles).find(k=>formIntakeFiles[k]===p)]});
test('selects only native Form API/catalog intake and fixed focused tests',()=>{assert.equal(backendApiFocus(entries,readers()),'form-intake');assert.equal(formIntakeTests.length,2)});
test('does not admit other routes, core approval changes, missing tests or arbitrary paths',()=>{assert.equal(backendApiFocus(entries,readers({...head,routes:head.routes+'\nnew route'})),null);assert.equal(backendApiFocus(entries,readers({...head,service:head.service.replace('authority()','bypass()')})),null);assert.equal(backendApiFocus([...entries,{file:'server-version/backend/src/middleware/auth.ts',status:'M',oldMode:'100644',newMode:'100644'}],readers()),null);assert.equal(backendApiFocus(entries,{...readers(),readHeadFile:()=>''}),null)});
test('rejects removed or executable files and does not rely on PR numbers',()=>{assert.equal(backendApiFocus([{...entries[0],status:'D',newMode:'000000'}],readers()),null);assert.equal(backendApiFocus([{...entries[0],newMode:'100755'}],readers()),null);assert.equal(backendApiFocus(entries,{}),null)});
test('uses existing backend security jobs and drops only the unrelated full regression for this focus',async()=>{const {requiredChecks}=await import('./merge-gate.mjs');const needs={scope:{outputs:{application_route:'legacy',scenario:'backend',backend_focus:'form-intake'}}};assert.deepEqual(requiredChecks(needs,false),['scope','backend','docker','codeql']);needs.scope.outputs.backend_focus='full';assert.deepEqual(requiredChecks(needs,false),['scope','backend','backend-regression','docker','codeql']);assert.deepEqual(requiredChecks(needs,true),['scope','pr-light-backend'])});

test('actual workflow skips full regression for Form focus and keeps ordinary backend regression',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const text=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 const block=text.slice(text.indexOf('\n  backend-regression:\n'),text.indexOf('\n  frontend-build:'));
 const expression=/^    if: \$\{\{ (.*) \}\}$/m.exec(block)?.[1];assert.ok(expression);
 const selected=(focus,scenario='backend')=>runInNewContext(expression,{needs:{scope:{outputs:{backend_focus:focus,scenario,dependencies_frontend_only:'false',application_route:'legacy',documentation:'false',maintenance:'false',content:'false',frontend:'false',presentation:'false'}}},github:{event_name:'pull_request',ref_name:'synthetic',event:{pull_request:{number:1,draft:false,head:{ref:'synthetic'}}}},vars:{CI_FORCE_FULL:'false'},cancelled:()=>false});
 assert.equal(selected('form-intake'),false);assert.equal(selected('full'),true);assert.equal(selected('full','catalog-discovery'),false);
 assert.match(text,/name: bounded backend API route and actual job selection contracts\n        if: steps\.scope\.outputs\.backend_focus == 'form-intake'/);
});

 test('Form image input reuses existing compilation recipe without changing ordinary backend content checks',async()=>{
 const {readFileSync}=await import('node:fs'),{runInNewContext}=await import('node:vm');
 const text=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8'),block=text.split('\n  docker:\n')[1].split('\n  codeql:\n')[0];
 const expression=/^      catalog_discovery: \$\{\{ (.*) \}\}$/m.exec(block)?.[1];assert.ok(expression);
 const selected=(scenario,backend_focus)=>runInNewContext(expression,{needs:{scope:{outputs:{scenario,backend_focus}}}});
 assert.equal(selected('backend','form-intake'),true);assert.equal(selected('backend','full'),false);assert.equal(selected('catalog-discovery','full'),true);
 assert.match(block,/backend_only: \$\{\{ needs\.scope\.outputs\.scenario == 'backend' \}\}/);
});
