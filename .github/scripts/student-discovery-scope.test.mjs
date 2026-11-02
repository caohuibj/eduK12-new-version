import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {studentDiscoveryScope,studentDiscoveryChecks as recipe} from './student-discovery-scope.mjs';
import {catalogDiscoveryScope} from './catalog-discovery-scope.mjs';
import {requiredChecks,failedChecks} from './merge-gate.mjs';
const change=file=>({file,status:'M',oldMode:'100644',newMode:'100644'});
const service='server-version/backend/src/modules/composite/composite.service.ts';
const controller='server-version/backend/src/modules/composite/composite.controller.ts';
const tasks='server-version/backend/src/services/studentTasks.ts';
const front=recipe.sources.filter(f=>![service,controller,tasks].includes(f));
const base={
 [service]:'prefix\nexport const listAvailableForStudent = async()=>{}\nconst assertStudentEligibility = ()=>{}',
 [controller]:'prefix\n  async available() { return 1 },\n  async startAttempt() {}',
 [tasks]:'listAvailableForStudent(userId, now.getTime(), options.courseId)',
 ...Object.fromEntries(front.map(f=>[f,"get('/available', { params: { courseId } })"])),
};
const head={...base,[service]:base[service].replace('async()=>{}','async()=>{ return [] }'),[controller]:base[controller].replace('return 1','return 2'),[tasks]:base[tasks].replace('options.courseId)','options.courseId, true)'),...Object.fromEntries(front.map(f=>[f,base[f].replace('courseId }',"courseId, view: 'summary' }")]))};
const readers=(candidate=head)=>({readBaseFile:f=>base[f],readHeadFile:f=>candidate[f]});
test('catalog reader reuses existing jobs and keeps shared composite writes outside this route',()=>{
 const entries=recipe.sources.map(change);
 assert(studentDiscoveryScope(entries,readers()));assert(catalogDiscoveryScope(entries,readers()));
 assert(!studentDiscoveryScope(entries));
 assert(!studentDiscoveryScope([...entries,change('server-version/backend/prisma/schema.prisma')],readers()));
 assert(!studentDiscoveryScope(entries,readers({...head,[service]:head[service].replace('assertStudentEligibility = ()=>{}','assertStudentEligibility = ()=>{return true}') })));
 assert(!studentDiscoveryScope(entries,readers({...head,[controller]:head[controller].replace('startAttempt() {}','startAttempt() {return 1}') })));
 assert(!studentDiscoveryScope(entries,readers({...head,[tasks]:head[tasks]+'; allowAll()'})));
 assert(!studentDiscoveryScope([{...entries[0],status:'D',newMode:'000000'}],readers()));
});
test('the selected recipe covers scope, legacy state, real PostgreSQL and frontend consumers',()=>{
 assert(recipe.backendChecks.postgresFiles.includes('src/__tests__/composite/student-archived-availability.postgres.integration.test.ts'));
 assert(recipe.backendChecks.unitFiles.includes('src/__tests__/composite/copy.service.test.ts'));
 const ci=readFileSync(new URL('../workflows/ci.yml',import.meta.url),'utf8');
 assert.match(ci,/STUDENT_DISCOVERY: \$\{\{ needs.scope.outputs.student_discovery \}\}/);
 assert.match(ci,/TRAINING_ARCHIVE_TEST_DATABASE_URL:/);
 assert.match(ci,/bundle_runtime == 'true' \|\| needs.scope.outputs.student_discovery == 'true'/);
 assert.match(ci,/student_discovery: \$\{\{ needs.scope.outputs.student_discovery == 'true' \}\}/);
 assert.deepEqual(requiredChecks({scope:{outputs:{scenario:'catalog-discovery'}}},false),['scope','catalog-discovery','frontend','docker','codeql']);
});
