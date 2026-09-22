import { verifyPackageFixtures } from '../modules/assessment-bundle/onboarding/fixtures'
import path from 'node:path'
import fs from 'node:fs'
import { discoverPackages, generatePackages, loadPackage, writePackage } from '../modules/assessment-bundle/onboarding/loader'
import { scaffoldPackage } from '../modules/assessment-bundle/onboarding/template'
import { hashDeclarativePackage } from '../modules/assessment-bundle/onboarding/contract'
import { dependencyBlockers } from '../modules/assessment-bundle/onboarding/dependencies'
const root=path.resolve(__dirname,'../modules/assessment-bundle/packages'),generated=path.resolve(__dirname,'../modules/assessment-bundle/generated/packages.json')
async function main(){
  const [command,...args]=process.argv.slice(2)
  if(command==='scaffold'){if(args.length!==2)throw new Error('Usage: scaffold <bundle_key> <new-directory>');writePackage(path.resolve(args[1]),scaffoldPackage(args[0]));return {ok:true,status:'DRAFT'}}
  if(command==='generate'||command==='manifest-check')return {ok:true,count:generatePackages(root,generated,command==='manifest-check').length}
  if(command==='check'){const packages=args[0]?[loadPackage(path.resolve(args[0]))]:discoverPackages(root);packages.forEach(verifyPackageFixtures);const blockers=packages.flatMap(p=>dependencyBlockers(p));if(blockers.length)throw new Error(blockers.join('; '));return {ok:true,packages:packages.map(p=>({key:p.manifest.definition.bundleKey,hash:hashDeclarativePackage(p)}))}}
  if(command==='preview'){const p=loadPackage(path.resolve(args[0]));return {ok:true,contentHash:hashDeclarativePackage(p),definition:p.manifest.definition,rules:p.rules,report:p.report,blockers:dependencyBlockers(p),publication:'Requires installation and independent signed approval'}}
  const {PrismaClient}=await import('@prisma/client'),db=new PrismaClient()
  try{
    const release=await import('../modules/bundle-product/package-release')
    if(command==='install'){if(args.length!==2)throw new Error('Usage: install <directory> <admin-user-id>');const row=await release.installPackage(db,args[1],loadPackage(path.resolve(args[0])));return {ok:true,id:row.id,status:row.status,contentHash:row.contentHash}}
    if(command==='publish'){if(args.length!==4)throw new Error('Usage: publish <key> <version> <admin-user-id> <signed-review.json>');const row=await release.publishPackage(db,args[2],args[0],args[1],JSON.parse(fs.readFileSync(args[3],'utf8')));return {ok:true,status:row.status,contentHash:row.contentHash}}
    if(command==='hold'||command==='retire'){if(args.length!==3)throw new Error('Usage: hold|retire <key> <version> <admin-user-id>');const row=await release.changePackageStatus(db,args[2],args[0],args[1],command==='hold'?'HOLD':'RETIRED');return {ok:true,status:row.status}}
    throw new Error('Unknown Bundle onboarding command')
  }finally{await db.$disconnect()}
}
main().then(result=>console.log(JSON.stringify(result,null,2))).catch(error=>{console.error(JSON.stringify({ok:false,blockers:[error.message]}));process.exitCode=1})
