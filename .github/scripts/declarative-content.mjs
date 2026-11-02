import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {posix} from 'node:path';
import {fileURLToPath} from 'node:url';
import {renderManifest} from '../../server-version/backend/scripts/generate-situational-instruments.mjs';

const require=createRequire(new URL('../release-tools/package.json',import.meta.url));
const inspectScaleContent=(...args)=>require(fileURLToPath(new URL('../../server-version/backend/scripts/scale-onboarding-check.mjs',import.meta.url))).inspectScaleContent(...args);
const backend='server-version/backend/';
const scaleRoot=backend+'src/modules/scale/instruments/';
const situationalRoot=backend+'src/modules/situational/instruments/';
const scaleIndex=backend+'src/modules/scale/onboarding/instruments.generated.ts';
const situationalIndex=backend+'src/modules/situational/onboarding/instruments.generated.ts';
const wrapper=/^server-version\/backend\/src\/modules\/scale\/instruments\/([a-z][a-z0-9_]*)\/(\d+\.\d+\.\d+)\/instrument\.ts$/;
const situationalSource=/^server-version\/backend\/src\/modules\/situational\/instruments\/[a-z][a-z0-9]*(?:-[a-z0-9]+)*\/(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\/instrument\.json$/;

/** The selected-source reader's existing bounded imports/const checks. */
export function inspectSelectedScaleImports(ts,tree,file) {
 let jsonBinding;
 const declarations=[];
 for(const statement of tree.statements){
  if(ts.isImportDeclaration(statement)){
   const clause=statement.importClause;if(clause?.isTypeOnly)continue;
   assert.equal(statement.moduleSpecifier.text,'./source.json',`UNSUPPORTED_CONTENT_IMPORT:${file}`);
   assert.ok(clause?.name&&!clause.namedBindings&&!jsonBinding,`UNSUPPORTED_JSON_WRAPPER:${file}`);
   jsonBinding=clause.name.text;
  }else{
   assert.ok(ts.isVariableStatement(statement)&&(statement.declarationList.flags&ts.NodeFlags.Const),`UNSUPPORTED_DECLARATION:${file}`);
   declarations.push(...statement.declarationList.declarations);
  }
 }
 return {jsonBinding,declarations};
}

function scaleRegistryShape(text,rows,ts) {
 if(typeof text!=='string')return null;
 const file=scaleIndex.slice(backend.length),tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 if(tree.parseDiagnostics.length)return null;
 const paths=rows.map(row=>posix.relative(posix.dirname(scaleIndex),row.file).replace(/\.ts$/,''));
 if(inspectScaleContent(file,text,{[file]:paths}).length)return null;
 const imports=tree.statements.filter(statement=>ts.isImportDeclaration(statement)&&!statement.importClause?.isTypeOnly);
 if(imports.length!==paths.length)return null;
 for(let i=0;i<imports.length;i++){
  const statement=imports[i],bindings=statement.importClause?.namedBindings;
  if(statement.attributes||statement.assertClause||!ts.isStringLiteral(statement.moduleSpecifier)||statement.moduleSpecifier.text!==paths[i]||statement.importClause.name||!bindings||!ts.isNamedImports(bindings)||bindings.elements.length!==1)return null;
  const binding=bindings.elements[0];
  if(binding.isTypeOnly||binding.propertyName?.text!=='SCALE_INSTRUMENT_SOURCE'||binding.name.text!=='source'+i)return null;
 }
 const names=new Set();
 for(const statement of tree.statements){
  if(ts.isImportDeclaration(statement))continue;
  if(!ts.isVariableStatement(statement)||!(statement.declarationList.flags&ts.NodeFlags.Const)||statement.declarationList.declarations.length!==1)return null;
  const declaration=statement.declarationList.declarations[0],name=declaration.name;
  if(!ts.isIdentifier(name)||names.has(name.text)||!['GENERATED_EXECUTABLE_SCALE_PACKAGES','GENERATED_SCALE_SCORER_PLUGINS','GENERATED_SCALE_INSTRUMENT_SOURCES'].includes(name.text))return null;
  names.add(name.text);
  if(name.text!=='GENERATED_SCALE_INSTRUMENT_SOURCES'&&(!declaration.initializer||!ts.isArrayLiteralExpression(declaration.initializer)||declaration.initializer.elements.length))return null;
 }
 if(names.size!==3)return null;
 let arrays=0;
 const statements=tree.statements.filter(statement=>!imports.includes(statement)).map(statement=>{
  if(!ts.isVariableStatement(statement))return statement;
  const declarations=statement.declarationList.declarations.map(declaration=>{
   if(!ts.isIdentifier(declaration.name)||declaration.name.text!=='GENERATED_SCALE_INSTRUMENT_SOURCES')return declaration;
   const value=declaration.initializer;
   if(!(statement.declarationList.flags&ts.NodeFlags.Const)||!value||!ts.isArrayLiteralExpression(value)||value.elements.length!==rows.length||value.elements.some((node,i)=>!ts.isIdentifier(node)||node.text!=='source'+i))throw Error('Unknown registry array');
   arrays++;
   return ts.factory.updateVariableDeclaration(declaration,declaration.name,declaration.exclamationToken,declaration.type,ts.factory.createArrayLiteralExpression());
  });
  return ts.factory.updateVariableStatement(statement,statement.modifiers,ts.factory.updateVariableDeclarationList(statement.declarationList,declarations));
 });
 return arrays===1?ts.createPrinter({removeComments:true}).printFile(ts.factory.updateSourceFile(tree,statements)):null;
}

export function declarationReaders(base,head='HEAD') {
 const git=(...args)=>execFileSync('git',args,{encoding:'utf8',maxBuffer:32*1024*1024});
 const read=ref=>file=>{try{return git('show',`${ref}:${file}`);}catch{return null;}};
 const list=ref=>()=>git('ls-tree','-rz','--full-tree',ref,'--',scaleRoot,situationalRoot).split('\0').filter(Boolean).map(row=>{
  const match=/^(\d{6}) blob [a-f0-9]{40}\t(.+)$/.exec(row);assert.ok(match);return {mode:match[1],file:match[2]};
 });
 return {readHeadFile:read(head),readBaseFile:read(base),listHeadFiles:list(head),listBaseFiles:list(base)};
}

function pureScaleWrapper(file,read,ts) {
 const match=wrapper.exec(file),text=read(file);if(!match||typeof text!=='string')return false;
 if(inspectScaleContent(file.slice(backend.length),text,{}).length)return false;
 const tree=ts.createSourceFile(file,text,ts.ScriptTarget.Latest,true);
 if(tree.parseDiagnostics.length)return false;
 if(tree.statements.some(statement=>ts.isImportDeclaration(statement)&&(statement.attributes||statement.assertClause)))return false;
 const {jsonBinding,declarations}=inspectSelectedScaleImports(ts,tree,file);
 if(!jsonBinding||declarations.length!==1)return false;
 const declaration=declarations[0],statement=declaration.parent.parent;
 if(!ts.isIdentifier(declaration.name)||declaration.name.text!=='SCALE_INSTRUMENT_SOURCE'||!statement.modifiers?.some(m=>m.kind===ts.SyntaxKind.ExportKeyword))return false;
 let value=declaration.initializer;
 while(value&&(ts.isAsExpression(value)||ts.isTypeAssertionExpression(value)||ts.isParenthesizedExpression(value)||ts.isSatisfiesExpression(value)))value=value.expression;
 if(!value||!ts.isIdentifier(value)||value.text!==jsonBinding)return false;
 const source=JSON.parse(read(file.replace(/instrument\.ts$/,'source.json')));
 return source?.identity?.instrumentKey===match[1]&&source.identity.instrumentVersion===match[2]
  &&!source.executable?.definition?.scoring?.scorerKey&&!source.executable?.scorerPlugins?.length;
}

/** Conservative selection only. Schema/scoring/publication checks remain owned by content CI. */
export function verifiedDeclarativeContent(entries,readers,domainFor) {
 try{
  if(!entries.length||!readers.readHeadFile||new Set(entries.map(e=>e.file)).size!==entries.length)return false;
  const selected=new Set(),registries=[];
  let headFiles;
  for(const entry of entries){
   const file=entry.file,domain=domainFor(file);
   if(!['scale','situational','bundle'].includes(domain)||entry.newMode!=='100644'||!(entry.status==='A'&&entry.oldMode==='000000'||entry.status==='M'&&entry.oldMode==='100644'))return false;
   if(file===scaleIndex||file===situationalIndex){registries.push(file);continue;}
   if(wrapper.test(file)){selected.add(file);continue;}
   if(/\.(md|txt)$/.test(file))continue;
   if(!file.endsWith('.json'))return false;
   const text=readers.readHeadFile(file);if(typeof text!=='string')return false;JSON.parse(text);
   if(file.startsWith(scaleRoot)&&file.endsWith('/source.json'))selected.add(file.replace(/source\.json$/,'instrument.ts'));
  }
  if(registries.length){
   if(!readers.listHeadFiles||!readers.listBaseFiles||!readers.readBaseFile)return false;
   const head=headFiles=readers.listHeadFiles(),base=readers.listBaseFiles();
   for(const index of registries){
    const scale=index===scaleIndex,root=scale?scaleRoot:situationalRoot,suffix=scale?'/instrument.ts':'/instrument.json';
    const inventory=rows=>rows.filter(row=>row.file.startsWith(root)&&row.file.endsWith(suffix)).sort((a,b)=>a.file<b.file?-1:a.file>b.file?1:0);
    const current=inventory(head),previous=inventory(base);
    if([...current,...previous].some(row=>row.mode!=='100644'||!(scale?wrapper:situationalSource).test(row.file)))return false;
    if(scale){
     const ts=require('typescript'),before=scaleRegistryShape(readers.readBaseFile(index),previous,ts),after=scaleRegistryShape(readers.readHeadFile(index),current,ts);
     if(!before||before!==after)return false;
     // The unchanged mandatory content job still runs the original generator's exact-byte check.
    }else{
     const render=rows=>renderManifest(rows.map(row=>({relative:row.file.slice(root.length,-'/instrument.json'.length)})));
     if(readers.readHeadFile(index)!==render(current)||readers.readBaseFile(index)!==render(previous))return false;
    }
    if(scale){const old=new Set(previous.map(row=>row.file));for(const row of current)if(!old.has(row.file))selected.add(row.file);}
    else for(const row of current)for(const name of ['instrument','publication','scientific']){
     const file=row.file.replace(/instrument\.json$/,name+'.json');
     if(!head.some(entry=>entry.file===file&&entry.mode==='100644'))return false;
     JSON.parse(readers.readHeadFile(file));
    }
   }
  }
  if(selected.size){
   if(!readers.listHeadFiles)return false;
   headFiles??=readers.listHeadFiles();
   for(const file of selected)for(const path of [file,file.replace(/instrument\.ts$/,'source.json')])if(!headFiles.some(row=>row.file===path&&row.mode==='100644'))return false;
  }
  const ts=selected.size?require('typescript'):null;
  return [...selected].every(file=>pureScaleWrapper(file,readers.readHeadFile,ts));
 }catch{return false;}
}
