// Read-only security floor for an explicitly selected code rollback. This does
// not install an image or restore a database; operators still bind the actual
// immutable running/candidate artifact to these exact source commits.
import {execFileSync} from 'node:child_process'
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()
const candidate=process.argv[2]
if(!/^[a-f0-9]{40}$/.test(candidate||''))throw new Error('Exact candidate SHA required')
const current=git('rev-parse','HEAD')
const securityPaths=[
 'server-version/backend/src/middleware/auth.ts','server-version/backend/src/modules/organization/principal.ts',
 'server-version/backend/src/modules/admin-permissions','server-version/backend/src/controllers/authController.ts',
 'server-version/backend/src/controllers/userController.ts','server-version/backend/src/services/courseStudentPasswordResetService.ts',
 'server-version/backend/src/services/socketService.ts','server-version/backend/src/services/exportJobService.ts',
 'server-version/backend/src/services/assessmentExportWorker.ts','server-version/backend/src/workers/exportBatchTask.ts',
 'server-version/backend/src/modules/survey/governance.service.ts','server-version/backend/src/modules/survey/catalog.service.ts','server-version/backend/src/modules/survey/platform.routes.ts',
 'server-version/backend/src/modules/huiteacher/platform.routes.ts','server-version/backend/src/modules/huiteacher/scaleLicense.service.ts','server-version/backend/src/modules/huiteacher/personalScaleGrant.service.ts',
 'server-version/backend/src/modules/organization/educationProductGovernance.ts','server-version/backend/src/scripts/admin-security-bootstrap.ts',
 'server-version/backend/src/scripts/migration/import-plan.ts','server-version/backend/src/scripts/migration/import-legacy-data.ts',
 'server-version/backend/prisma','server-version/backend/scripts/runtime-table-policy.json','server-version/backend/src/types/index.ts',
 'server-version/backend/package.json','server-version/backend/package-lock.json',
 'server-version/frontend/src/admin','server-version/frontend/src/pages/AdminLogin.tsx','server-version/frontend/src/pages/FirstLoginPasswordChange.tsx',
 'server-version/frontend/src/api/auth.ts','server-version/frontend/src/contexts/AuthContext.tsx',
]
if(git('status','--porcelain','--',...securityPaths))throw new Error('Commit the reviewed security inputs first')
const identity=ref=>git('ls-tree','-r',ref,'--',...securityPaths)
if(identity(current)!==identity(candidate)){
 console.error(JSON.stringify({result:'DENIED',reason:'Candidate changes the current authority/session/migration security floor',current,candidate,databaseRestoreAllowed:false}));process.exitCode=1
}else console.log(JSON.stringify({result:'PASS',current,candidate,securityInputsIdentical:true,databaseRestoreAllowed:false}))
