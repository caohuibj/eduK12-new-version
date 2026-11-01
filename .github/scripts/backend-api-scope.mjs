// Bounded backend API profiles reuse the backend lane; no PR IDs or hash pins.
export const formIntakeFiles={service:'server-version/backend/src/modules/survey/governed-tool.service.ts',routes:'server-version/backend/src/modules/survey/governed-tool.routes.ts',catalog:'server-version/backend/src/modules/survey/catalog-discovery.ts'};
export const formIntakeTests=['src/__tests__/survey/original-form-intake.test.ts','src/__tests__/survey/original-form-http.postgres.integration.test.ts'];
const controls=new Set(['.github/scripts/backend-api-scope.mjs','.github/scripts/backend-api-scope.test.mjs','.github/scripts/content-scope.mjs','.github/scripts/merge-gate.mjs','.github/workflows/ci.yml','.github/workflows/ci-backend.yml']);
const route="// Pending content intake only. Existing approval/trial writes retain step-up below.\nsurveyGovernedToolsRouter.post('/submissions/original-form',handle(req=>service.submitOriginalForm(req.user!.userId,req.body)))\n";
const imports=["import {catalogClassificationTags} from '../scale/library/catalog-discovery'\n","import {z} from 'zod'\n","import sourceTagLabels from '../scale/library/catalog-tag-labels.json'\n","import {catalogClassificationTags,catalogTagFacets} from '../scale/library/catalog-discovery'\n","import {formDraftSchema} from '../assessment-core/form/definition'\n"];
function withoutRange(text,start,end){const a=text.indexOf(start),b=text.indexOf(end,a);if(a<0||b<0)throw Error('Missing bounded source range');return text.slice(0,a)+text.slice(b);}
function serviceCore(text){const tail=text.indexOf('\n/** Save complete native Form content');if(tail>=0)text=text.slice(0,tail);for(const i of imports)text=text.replace(i,'');return withoutRange(text,'export async function governedCatalog(','export async function governedDetail(').trim();}
export function backendApiFocus(entries,readers={}){
 if(!entries.length||!readers.readHeadFile||!readers.readBaseFile)return null;
 const allowed=new Set([...Object.values(formIntakeFiles),...formIntakeTests.map(p=>'server-version/backend/'+p),...controls]);
 if(!entries.some(e=>Object.values(formIntakeFiles).includes(e.file))||entries.some(e=>!allowed.has(e.file)||e.newMode!=='100644'||!(e.status==='A'&&e.oldMode==='000000'||e.status==='M'&&e.oldMode==='100644')))return null;
 try{
  const base=k=>readers.readBaseFile(formIntakeFiles[k]),head=k=>readers.readHeadFile(formIntakeFiles[k]);
  if(head('routes').replace(route,'')!==base('routes').replace(route,''))return null;
  if(!head('routes').includes(route)||serviceCore(head('service'))!==serviceCore(base('service')))return null;
  if(withoutRange(head('catalog'),'export function discoveryJoin(','export const governedDiscoveryIdentity')!==withoutRange(base('catalog'),'export function discoveryJoin(','export const governedDiscoveryIdentity'))return null;
  for(const file of formIntakeTests)if(!readers.readHeadFile('server-version/backend/'+file))return null;
  return 'form-intake';
 }catch{return null;}
}
