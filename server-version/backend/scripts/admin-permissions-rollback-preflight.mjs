// Read-only security floor for an explicitly selected code rollback. This does
// not install an image or restore a database; operators still bind the actual
// immutable running/candidate artifact to these exact source commits.
import {execFileSync} from 'node:child_process'
const git=(...args)=>execFileSync('git',args,{encoding:'utf8'}).trim()
const candidate=process.argv[2]
if(!/^[a-f0-9]{40}$/.test(candidate||''))throw new Error('Exact candidate SHA required')
const current=git('rev-parse','HEAD')
const securityPaths=[
 'server-version/backend/src','server-version/backend/prisma',
 'server-version/backend/scripts/runtime-table-policy.json',
 'server-version/backend/package.json','server-version/backend/package-lock.json',
 'server-version/frontend/src/admin','server-version/frontend/src/App.tsx',
 'server-version/frontend/src/pages/AdminLogin.tsx','server-version/frontend/src/pages/FirstLoginPasswordChange.tsx',
 'server-version/frontend/src/api/auth.ts','server-version/frontend/src/contexts/AuthContext.tsx',
 'server-version/frontend/src/components/app-shell/AppShell.tsx','server-version/frontend/src/components/app-shell/navigation.ts',
 'server-version/frontend/src/components/app-shell/access.ts','server-version/frontend/src/types/index.ts',
 'server-version/frontend/src/pages/admin/EducationProductGovernance.tsx','server-version/frontend/src/pages/admin/SurveyResearchersAdmin.tsx',
 'server-version/frontend/src/pages/CourseStudents.tsx','server-version/frontend/src/pages/StudentManagement.tsx',
]
if(git('status','--porcelain','--',...securityPaths))throw new Error('Commit the reviewed security inputs first')
const identity=ref=>git('ls-tree','-r',ref,'--',...securityPaths).split('\n').filter(line=>!line.includes('/__tests__/')&&!/\.(test|spec)\.[cm]?[jt]sx?$/.test(line)).join('\n')
if(identity(current)!==identity(candidate)){
 console.error(JSON.stringify({result:'DENIED',reason:'Candidate changes the current authority/session/migration security floor',current,candidate,databaseRestoreAllowed:false}));process.exitCode=1
}else console.log(JSON.stringify({result:'PASS',current,candidate,securityInputsIdentical:true,databaseRestoreAllowed:false}))
