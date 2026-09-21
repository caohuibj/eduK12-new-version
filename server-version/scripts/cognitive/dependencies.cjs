const fs=require('node:fs'),path=require('node:path'),ts=require('../../backend/node_modules/typescript')
const {ROOT,discover,fail}=require('./manifests.cjs')
function dependencies(file){
 const sf=ts.createSourceFile(file,fs.readFileSync(file,'utf8'),ts.ScriptTarget.Latest,true), refs=[]
 function visit(n){
  if(ts.isImportDeclaration(n)&&!n.importClause?.isTypeOnly&&ts.isStringLiteral(n.moduleSpecifier)){
   const bindings=n.importClause?.namedBindings
   if(!bindings||!ts.isNamedImports(bindings)||!bindings.elements.every(e=>e.isTypeOnly))refs.push(n.moduleSpecifier.text)
  }
  if(ts.isExportDeclaration(n)&&!n.isTypeOnly&&n.moduleSpecifier&&ts.isStringLiteral(n.moduleSpecifier))refs.push(n.moduleSpecifier.text)
  if(ts.isCallExpression(n)&&(n.expression.kind===ts.SyntaxKind.ImportKeyword||n.expression.getText(sf)==='require')){
   if(n.arguments.length!==1||!ts.isStringLiteral(n.arguments[0])) fail('COG_DEPENDENCY_DYNAMIC',file,'nonliteral imports cannot be audited')
   refs.push(n.arguments[0].text)
  }
  ts.forEachChild(n,visit)
 }visit(sf);return refs
}
function guard(root=ROOT,packages=discover(root)){
 const done=new Set(),stack=[]
 function walk(file,kind){
  const id=kind+':'+file
  if(stack.includes(id))fail('COG_DEPENDENCY_CYCLE',path.relative(root,file),stack.join(' -> '))
  if(done.has(id))return
  const rel=path.relative(root,file).split(path.sep).join('/')
  if(kind==='backend'&&(/\/frontend\//.test(rel)||/\/(governance|scientific-maturity|scientific-qualification)\.ts$/.test(rel)||/\.service\.ts$/.test(rel)||/\/cognitive-analysis\//.test(rel)))fail('COG_DEPENDENCY_FORBIDDEN',rel,'execution leaf cannot import UI, governance or services')
  if(kind==='frontend'&&/\/backend\//.test(rel))fail('COG_DEPENDENCY_FORBIDDEN',rel,'runner cannot import backend')
  stack.push(id)
  for(const ref of dependencies(file)){
   if(!ref.startsWith('.')){
    if(ref.startsWith('@/')||ref.startsWith('~/')||ref==='@prisma/client'||ref==='express')fail('COG_DEPENDENCY_FORBIDDEN',rel,ref)
    continue
   }
   const stem=path.resolve(path.dirname(file),ref),target=[stem,stem+'.ts',stem+'.tsx',stem+'/index.ts',stem+'/index.tsx'].find(p=>fs.existsSync(p)&&fs.statSync(p).isFile())
   if(!target)fail('COG_DEPENDENCY_UNRESOLVED',rel,ref)
   if(/\.tsx?$/.test(target))walk(target,kind)
  }
  stack.pop();done.add(id)
 }
 for(const p of packages){walk(path.join(root,p.backendFile),'backend');for(const r of p.runners)walk(path.join(root,r.resolvedFile),'frontend')}
 return done.size
}
module.exports={guard,dependencies}
if(require.main===module){try{console.log(`Cognitive dependency guard: PASS (${guard()} modules)`)}catch(e){console.error(e.message);process.exitCode=1}}
