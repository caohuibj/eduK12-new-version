import { cognitiveTaskRoot } from './cognitive-intake-scope.mjs';

export function cognitiveMixedProductScope(entries, readHeadFile, readBaseFile) {
  const taskPath = /^server-version\/(?:backend\/src\/modules\/cognitive\/(?:tasks|generated)\/|frontend\/src\/modules\/cognitive\/(?:tasks|generated)\/)/;
  const sharedSource = file => /^server-version\/(?:backend|frontend)\/src\/.+\.tsx?$/.test(file) && !taskPath.test(file);
  if (!entries.some(e => taskPath.test(e.file)) || !entries.some(e => sharedSource(e.file))) return false;
  const seen = new Set(), tasks = new Set();
  for (const e of entries) {
    if (typeof e.file !== 'string' || /[\\\x00-\x1f\x7f]/.test(e.file) || e.file.split('/').some(p => !p || p === '.' || p === '..') || seen.has(e.file)) return false;
    seen.add(e.file);
    if (e.newMode !== '100644' || !(e.status === 'A' && e.oldMode === '000000' || e.status === 'M' && e.oldMode === '100644')) return false;
    if (e.file.startsWith('server-version/backend/src/modules/cognitive/content-candidates/') || e.file === 'server-version/frontend/src/modules/cognitive/native-runners.tsx') return false;
    const task = e.file.match(/^server-version\/(?:backend|frontend)\/src\/modules\/cognitive\/tasks\/([^/]+)\//)?.[1];
    if (task && task !== 'shared') tasks.add(task);
  }
  if (!tasks.size) return false;
  for (const task of tasks) {
    try {
      const manifest = JSON.parse(readHeadFile?.(cognitiveTaskRoot + task + '/task-package.json'));
      if (manifest?.schemaVersion !== 1 || manifest.task !== task || !Array.isArray(manifest.identities) || !manifest.identities.length) return false;
      const prior = readBaseFile?.(cognitiveTaskRoot + task + '/task-package.json');
      if (prior) {
        const old = JSON.parse(prior);
        const identity = row => [row.testType,row.engineVersion,row.scoringVersion].join('/');
        if (old.identities.some(row=>!manifest.identities.some(next=>identity(next)===identity(row)))) return false;
        if ((old.frontend||[]).some(row=>!(manifest.frontend||[]).some(next=>next.testType===row.testType&&next.engineVersion===row.engineVersion))) return false;
      }
    } catch { return false; }
  }
  return true;
}

const controls=new Set(['.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml',
 '.github/scripts/ci-image-plan.mjs','.github/scripts/ci-image-plan.test.mjs','.github/workflows/ci-images.yml',
 '.github/scripts/cognitive-product-scope.mjs','.github/scripts/cognitive-product.test.mjs','.github/scripts/cognitive-product-check.mjs','.github/workflows/ci-cognitive-product.yml']);
const front='server-version/frontend/src/', back='server-version/backend/src/';
const carriers=new Set(['server-version/backend/Dockerfile',back+'modules/admin-permissions/routes.ts',front+'App.tsx',...['SystemAdminShell.tsx','navigation.ts','systemWorkspace.ts'].map(f=>front+'admin/'+f)]);
function unchangedOutsideIntake(file,before,after){
 if(typeof before!=='string'||typeof after!=='string')return false;
 let normalized=after;
 if(file==='server-version/backend/Dockerfile') normalized=normalized.replace('ARG COGNITIVE_PRODUCT_BUILD=false\n# The directed product job already checks Cognitive manifests and dependencies.\nRUN if [ \"$COGNITIVE_PRODUCT_BUILD\" = true ]; then npx tsc; else npm run build; fi', 'RUN npm run build');
 else if(file===back+'modules/admin-permissions/routes.ts') normalized=normalized
  .replace("import { cognitiveIntakeAdminRouter } from '../cognitive/onboarding/admin.routes'\n",'')
  .replace("adminPermissionsRouter.use('/cognitive-intake', cognitiveIntakeAdminRouter)\n",'');
 else if(file===front+'App.tsx') normalized=normalized
  .replace("const CognitiveIntake = React.lazy(() => import('./admin/CognitiveIntake'))\n",'')
  .replace('          <Route path="/admin/cognitive-intake" element={<AdminAccess system><CognitiveIntake/></AdminAccess>}/>\n','');
 else normalized=normalized.replaceAll(',SYSTEM_COGNITIVE_INTAKE','')
  .replace("export const SYSTEM_COGNITIVE_INTAKE='/admin/cognitive-intake'\n",'')
  .replace("{path:SYSTEM_COGNITIVE_INTAKE,label:'认知入库',section:'system'},",'')
  .replace("  {path:SYSTEM_COGNITIVE_INTAKE,label:'认知入库',Icon:LibraryBig,active:pathname===SYSTEM_COGNITIVE_INTAKE},\n",'');
 return normalized===before;
}
export function cognitiveProductPlan(entries,base,head,readHead,readBase){
 if(!cognitiveMixedProductScope(entries,readHead,readBase))return null;
 for(const e of entries){
  const f=e.file;
  if(carriers.has(f)){if(!unchangedOutsideIntake(f,readBase?.(f),readHead?.(f)))return null;continue;}
  if(controls.has(f)||f==='AGENTS.md'||/^\.agents\/skills\/eduk12-cognitive-intake\//.test(f)||/^docs\/.*\.(md|json|log|txt|csv|tsv)$/.test(f))continue;
  if(/^server-version\/(?:backend|frontend)\/src\/modules\/cognitive\//.test(f)||f.startsWith(back+'__tests__/cognitive/'))continue;
  if([front+'admin/CognitiveIntake.tsx',front+'admin/CognitiveIntake.test.tsx'].includes(f))continue;
  return null;
 }
 return {schema:1,route:'cognitive-product',base,head,files:entries.map(e=>e.file).sort(),
  required:['cognitive-contracts','runner-scorer-freeze-intake','production-images','runtime-scans','sast']};
}
export function cognitiveProductOutputs(p){
 const flags=['maintenance','content','presentation','frontend','frontend_test','documentation','frontend_build','ui_required','visual_hosted','scale','scale_intake_light','cognitive_intake_light','situational','bundle',
 'media2','video_core','media7','situational_video','situational_branching','app_shell','canonical_visual','perf_smoke','ops'];
 return {...Object.fromEntries(flags.map(k=>[k,false])),application_route:p.route,scenario:p.route,cognitive:true,codeql:true,
 cognitive_product_plan:JSON.stringify(p),runner_profile:'hosted',heavy_runner:'["ubuntu-24.04"]',light_runner:'["ubuntu-24.04"]',codeql_runner:'["ubuntu-24.04"]'};
}
