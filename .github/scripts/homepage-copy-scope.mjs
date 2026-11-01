import {execFileSync} from 'node:child_process';
import {createRequire} from 'node:module';
import {pathToFileURL} from 'node:url';
const require = createRequire(new URL('../release-tools/package.json', import.meta.url));
const frontend = 'server-version/frontend/';
export const portalFile = frontend + 'src/training/TrainingPortal.tsx';
export const featuresFile = frontend + 'src/school/school-features.ts';
export const assertionFile = frontend + 'src/training/TrainingScreens.test.tsx';
export const copyTools = new Set([
  '.github/scripts/homepage-copy-scope.mjs', '.github/scripts/homepage-copy.test.mjs',
  '.github/scripts/homepage-copy-candidate.py', '.github/scripts/homepage-copy-browser.mjs',
  '.github/workflows/ci-homepage-copy.yml', '.github/scripts/content-scope.mjs',
  '.github/scripts/merge-gate.mjs', '.github/workflows/ci.yml', 'docs/release/README.md',
  '.github/workflows/scale-onboarding-boundary.yml', '.github/scripts/content-workflows.test.mjs',
  '.github/scripts/school-teacher-native.test.mjs',
  '.github/workflows/ci-frontend.yml', '.github/scripts/content-scope.test.mjs',
  'server-version/scripts/release/policy.mjs', 'docs/ci-runner-policy.md',
]);
const git = (...args) => execFileSync('git', args, {encoding:'utf8'}).trim();
const source = (ref, file) => execFileSync('git', ['show', `${ref}:${file}`], {encoding:'utf8'});
const plainText = text => text.trim().length > 0 && !/[\r\n<>{}&\\]/u.test(text);
const mask = (text, ranges) => ranges.toSorted((a,b) => b.start-a.start)
  .reduce((value, range) => value.slice(0,range.start)+'COPY'+value.slice(range.end), text);

// Only existing literal hero text can differ. Imports, expressions, links,
// attributes, markup, line breaks and all other bytes must remain identical.
export function portalCopy(text) {
  const ts = require('typescript');
  const ast = ts.createSourceFile(portalFile, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  if (ast.parseDiagnostics.length) return null;
  const ranges = [], copy = {};
  const targets = {'training-eyebrow':'eyebrow','training-title':'heading','training-portal-description':'description'};
  let invalid = false;
  function visit(node) {
    if (ts.isJsxElement(node)) {
      for (const attribute of node.openingElement.attributes.properties) {
        if (!ts.isJsxAttribute(attribute) || !['id','className'].includes(attribute.name.text)
          || !attribute.initializer || !ts.isStringLiteral(attribute.initializer)) continue;
        const key = targets[attribute.initializer.text];
        if (!key) continue;
        if (copy[key]) {invalid=true; continue;}
        copy[key] = [];
        for (const child of node.children) {
          if (ts.isJsxText(child) && plainText(child.text)) {
            ranges.push({start:child.pos,end:child.end}); copy[key].push(child.text);
          } else if (!(ts.isJsxSelfClosingElement(child) && child.tagName.getText(ast)==='br'
            && !child.attributes.properties.length)) invalid=true;
        }
        if (!copy[key].length) invalid=true;
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast);
  return !invalid && Object.keys(copy).length===3 ? {shape:mask(text,ranges),copy} : null;
}
export function featureCopy(text) {
  const ts = require('typescript');
  const ast = ts.createSourceFile(featuresFile,text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TS);
  if (ast.parseDiagnostics.length) return null;
  const ranges=[], titles=[];
  function visit(node) {
    if (ts.isObjectLiteralExpression(node)) {
      const property = name => node.properties.find(p => ts.isPropertyAssignment(p) && p.name.getText(ast)===name);
      const path=property('path'), title=property('title');
      if (path && ts.isStringLiteral(path.initializer) && path.initializer.text==='/features/positive-campus'
        && title && ts.isStringLiteral(title.initializer) && plainText(title.initializer.text)) {
        ranges.push({start:title.initializer.getStart(ast),end:title.initializer.end}); titles.push(title.initializer.text);
      }
    }
    ts.forEachChild(node,visit);
  }
  visit(ast);
  return titles.length===1 ? {shape:mask(text,ranges),title:titles[0]} : null;
}
const headingAssertion = heading => `expect(screen.getByRole('heading', { name: /${heading.map(text=>text.replace(/[.*+?^${}()|[\]\\/]/g,'\\$&')).join('.*')}/ })).toBeInTheDocument()`;
export function admitsHeadingAssertion(before, after, oldPortal, newPortal) {
  const old=portalCopy(oldPortal), next=portalCopy(newPortal);
  if (!old || !next) return false;
  const oldLine=headingAssertion(old.copy.heading), newLine=headingAssertion(next.copy.heading);
  return oldLine!==newLine && before.split(oldLine).length===2 && after===before.replace(oldLine,newLine);
}
export function admitsCopy(entries, read) {
  if (!entries.length || !entries.some(e=>[portalFile,featuresFile].includes(e.file))) return false;
  for (const e of entries) {
    if (e.newMode!=='100644' || !((e.status==='M' && e.oldMode==='100644')
      || (copyTools.has(e.file) && e.status==='A' && e.oldMode==='000000'))) return false;
    if (copyTools.has(e.file)) continue;
    if (![portalFile,featuresFile,assertionFile].includes(e.file)) return false;
    const before=read('base',e.file), after=read('head',e.file);
    if (e.file===assertionFile) {
      if (!entries.some(x=>x.file===portalFile) || !admitsHeadingAssertion(before,after,read('base',portalFile),read('head',portalFile))) return false;
    } else {
      const parse=e.file===portalFile?portalCopy:featureCopy;
      const old=parse(before), next=parse(after);
      if (!old || !next || old.shape!==next.shape) return false;
    }
  }
  return true;
}
export function homepageCopyPlan(entries,base,head) {
  if (!/^[a-f0-9]{40}$/.test(base) || !/^[a-f0-9]{40}$/.test(head)) throw Error('Full source SHAs required');
  const read=(ref,file)=>source(ref==='base'?base:head,file);
  if(entries.some(e=>e.newMode!=='100644'||!(e.status==='M'&&e.oldMode==='100644'||e.status==='A'&&e.oldMode==='000000')))return null;
  const presentation=publicPresentation(entries,read);
  if (!presentation && !admitsCopy(entries,read)) return null;
  if (git('rev-parse',`${base}:server-version/backend`)!==git('rev-parse',`${head}:server-version/backend`)) return null;
  const pages=presentation?.pages || [];
  if (!presentation && entries.some(e=>e.file===portalFile)) pages.push({page:'training',...portalCopy(source(head,portalFile)).copy});
  if (!presentation && entries.some(e=>e.file===featuresFile)) pages.push({page:'school',title:featureCopy(source(head,featuresFile)).title});
  const toolsChanged=entries.some(e=>copyTools.has(e.file));
  const sast=toolsChanged||presentation?.executable===true;
  return {schema:1,route:'homepage-copy',base,head,changes:entries,changed:['frontend'],pages,toolsChanged,sast,
    frontendTree:git('rev-parse',`${head}:server-version/frontend`),
    required:['copy-boundary','frontend-candidate','runtime-scan','homepage-browser',...(sast?['sast']:[])]};
}


// Public presentation is a source boundary, not a PR/hash exemption. Existing
// non-rendering behavior stays exact; new code is limited to static rendering,
// document titles and navigation. App integration preserves the business body.
const publicFiles = new Map([
 ['school', ['SchoolLanding.tsx','SchoolFeaturePage.tsx','school-features.ts','school-landing.css']],
 ['huiteacher', ['HuiteacherLanding.tsx','HuiteacherFeaturePage.tsx','teacher-features.ts','huiteacher-landing.css']],
 ['survey', ['SurveyLanding.tsx','SurveyFeaturePage.tsx','survey-features.ts','survey-landing.css','survey-public-pages.css']],
 ['training', ['TrainingPortal.tsx','TrainingFeaturePage.tsx','featureContent.ts','training-portal-refresh.css']],
].flatMap(([product,files])=>files.map(file=>[frontend+'src/'+product+'/'+file, product==='huiteacher'?'teacher':product])));
for(const file of ['FeatureGuide.tsx','feature-guide.css']) publicFiles.set(frontend+'src/components/public-guides/'+file,'shared');
const parse = text => {
 const ts=require('typescript'), ast=ts.createSourceFile('public.tsx',text,ts.ScriptTarget.Latest,true,ts.ScriptKind.TSX);
 return ast.parseDiagnostics.length ? null : ast;
};
const compact = text => {const ast=parse(text);return ast?require('typescript').createPrinter({removeComments:true}).printFile(ast):null;};
const tokens = text => { const ts=require('typescript'), ast=parse(text), out=[];if(!ast)return null;function visit(n){const children=n.getChildren(ast);if(children.length)children.forEach(visit);else if(![ts.SyntaxKind.SemicolonToken,ts.SyntaxKind.EndOfFileToken,ts.SyntaxKind.SyntaxList].includes(n.kind)&&!(n.kind===ts.SyntaxKind.JsxText&&!n.getText(ast).trim()))out.push([n.kind,n.getText(ast)]);}visit(ast);return JSON.stringify(out); };
const publicImport = name => new Set(['react','lucide-react',
 '../components/public-guides/FeatureGuide','./SchoolLanding','./SchoolMark','./TeacherBrand','./SurveyBrand','./TrainingPublicHeader',
 '../components/product-theme/ProductThemeControl','../components/product-theme/useProductTheme',
 './SurveyAppearance','./survey-appearance-links','../products/origins','./school-features','./teacher-features','./survey-features','./featureContent',
]).has(name) || /^\.\/[a-zA-Z0-9_-]+\.(?:css|webp)$/.test(name);

export function publicRenderBoundary(before,after,{sameNonRendering=false}={}) {
 const ts=require('typescript');
 function behavior(text) {
  const ast=parse(text);if(!ast)return null;
  const opaque=[];let invalid=false;
  const identities=new Set(['user','auth','session','api','token','returnTo','signedIn']);
  const identityDependent=n=>{
   let found=false;
   function inspect(child){if(ts.isIdentifier(child)&&identities.has(child.text))found=true;ts.forEachChild(child,inspect);}
   inspect(n);return found;
  };
  // Track aliases of existing identity-dependent values without treating static
  // feature/theme predicates as authentication or permission control flow.
  function bindings(n){
   if(ts.isVariableDeclaration(n)&&n.initializer&&identityDependent(n.initializer))
    for(const name of n.name.getText(ast).match(/[A-Za-z_$][\w$]*/g)||[])identities.add(name);
   ts.forEachChild(n,bindings);
  }
  bindings(ast);
  function visit(n) {
   const condition=ts.isIfStatement(n)?n.expression:ts.isConditionalExpression(n)?n.condition:
    ts.isBinaryExpression(n)&&[ts.SyntaxKind.AmpersandAmpersandToken,ts.SyntaxKind.BarBarToken,ts.SyntaxKind.QuestionQuestionToken].includes(n.operatorToken.kind)?n.left:null;
   if(condition&&identityDependent(condition))opaque.push(condition.getText(ast));
   if(ts.isExportDeclaration(n)&&n.moduleSpecifier&&!n.isTypeOnly)invalid=true;
   if(ts.isWhileStatement(n)||ts.isDoStatement(n)||ts.isForStatement(n)||ts.isForInStatement(n)||ts.isForOfStatement(n)||ts.isWithStatement(n))invalid=true;
   if(ts.isImportDeclaration(n)) {
    if(!n.importClause?.isTypeOnly && !publicImport(n.moduleSpecifier.text)) opaque.push(n.getText(ast));
   }
   if(ts.isJsxOpeningElement(n)||ts.isJsxSelfClosingElement(n)) {
    if(['script','iframe','object','embed'].includes(n.tagName.getText(ast)))invalid=true;
   }
   if(ts.isJsxAttribute(n)&&n.name.getText(ast)==='dangerouslySetInnerHTML')invalid=true;
   if(ts.isPropertyAccessExpression(n)&&['cookie','localStorage','sessionStorage'].includes(n.name.text))invalid=true;
   if(ts.isIdentifier(n)&&['fetch','XMLHttpRequest','eval','Function','globalThis','localStorage','sessionStorage'].includes(n.text))invalid=true;
   if(ts.isCallExpression(n)) {
    const name=n.expression.getText(ast);
    const render=/\.(?:map|find|toUpperCase|toLowerCase)$/.test(name);
    const title=name==='useEffect' && tokens(compact(n.getText(ast)))===tokens(compact('useEffect(()=>{const previous=document.title;document.title=`${feature.title} | ${product}`;return()=>{document.title=previous}},[feature.title,product])'));
    const navigation=name==='window.location.assign' && n.arguments.length===1 && (/^['"]\/(?:login|register)?['"]$/.test(n.arguments[0].getText(ast)) || n.arguments[0].getText(ast)==='`/#${id}`');
    if(!render && !title && !navigation && name!=='useProductTheme')opaque.push(n.getText(ast));
   }
   if(ts.isBinaryExpression(n)&&n.operatorToken.kind>=ts.SyntaxKind.FirstAssignment&&n.operatorToken.kind<=ts.SyntaxKind.LastAssignment) {
    if(n.left.getText(ast)!=='document.title')opaque.push(n.getText(ast));
   }
   if(ts.isAwaitExpression(n)||ts.isNewExpression(n)||ts.isThrowStatement(n)||ts.isDeleteExpression(n)||ts.isPostfixUnaryExpression(n))opaque.push(n.getText(ast));
   // Keep login/role/returnTo and other runtime computations exact, including
   // conditional strings with no function calls. Static content has no such state.
   if(ts.isVariableDeclaration(n)&&n.initializer&&!ts.isArrowFunction(n.initializer)&&!ts.isFunctionExpression(n.initializer)) {
    const value=n.initializer.getText(ast);
    if(/\b(?:user|auth|session|api|token|returnTo)\b/.test(value))opaque.push(n.getText(ast));
   }
   ts.forEachChild(n,visit);
  }
  visit(ast);return invalid?null:opaque.map(compact);
 }
 if(sameNonRendering) {
  const shape=text=>{
   const tree=parse(text);if(!tree)return null;
   const result=ts.transform(tree,[context=>root=>ts.visitNode(root,function visit(node){
    if(ts.isJsxElement(node)||ts.isJsxSelfClosingElement(node)||ts.isJsxFragment(node))return ts.factory.createIdentifier('PRESENTATION');
    return ts.visitEachChild(node,visit,context);
   })]);
   try{return tokens(ts.createPrinter({removeComments:true}).printFile(result.transformed[0]));}finally{result.dispose();}
  };
  if(before==null||shape(before)!==shape(after))return false;
 }
 const next=behavior(after);if(!next)return false;
 const old=before==null?[]:behavior(before);if(!old)return false;
 // Removing the Teacher landing's old local explanation dialog is safe; it
 // does not change onEnter or any authenticated workspace implementation.
 const localDialog = x => /^(?:import \{ useRef, useState \} from 'react';|useRef<|useState\(features\[0\]\)|setFeature\(|about\.current|aboutTitle\.current|openFeature\(|onEnter\(\);|event.target === event.currentTarget)/.test(x||'');
 return JSON.stringify(old.filter(x=>!localDialog(x)).map(tokens))===JSON.stringify(next.filter(x=>!localDialog(x)).map(tokens));
}
export function publicRouteBoundary(product,before,after) {
 const app=product==='school'?'School':'Huiteacher', features=product==='school'?'schoolFeatures':'teacherFeatures';
 const shell=`export default function ${app}App(){const feature=${features}.find(item=>item.path===window.location.pathname);return feature?<${app}FeaturePage feature={feature}/>:<${app}Application/>}`;
 const ts=require('typescript'), ast=parse(after);if(!ast)return false;
 const wrapper=ast.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===app+'App');
 if(!wrapper||tokens(compact(wrapper.getText(ast)))!==tokens(compact(shell)))return false;
 const clean=text=>{
  let s=text.replace(new RegExp(`import \\{${app}FeaturePage\\} from './${app}FeaturePage'\\n?`),'');
  if(product!=='school')s=s.replace(/import \{teacherFeatures\} from '.\/teacher-features'\n?/,'');
  const tree=parse(s);if(!tree)return null;
  const route=tree.statements.find(n=>ts.isFunctionDeclaration(n)&&n.name?.text===app+'App');
  if(route&&s.includes(app+'Application/'))s=s.slice(0,route.pos)+s.slice(route.end);
  s=s.replace(`export default function ${app}App()`,`function ${app}Application()`);
  if(product==='school') {
   s=s.replace(/schoolFeatures\.some\(feature=>feature\.path===window\.location\.pathname\)\?'feature':'home'/,"'home'")
    .replace(/  const activeFeature=schoolFeatures\.find\(feature=>feature\.path===window\.location\.pathname\)\n/,'')
    .replace(/document\.title=screen==='feature'&&activeFeature\?`\$\{activeFeature\.title\} \| School`:'School'/,"document.title='School'")
    .replace(/\[screen,activeFeature\]/,'[screen]')
    .replace(/\{!loading&&!user&&screen==='feature'&&activeFeature&&<section className="hs-feature-blank" aria-label=\{`\$\{activeFeature.title\}介绍页面`\}>\s*<h1 className="hs-visually-hidden">\{activeFeature.title\}<\/h1>\s*<\/section>\}/,'');
  }
  return tokens(compact(s));
 };
 return clean(before)===clean(after);
}
export function publicPresentation(entries,read) {
 const pages=new Set();let executable=false;
 for(const e of entries) {
  if(copyTools.has(e.file)||/^docs\/cua-[a-zA-Z0-9_-]+\.md$/.test(e.file)||/^docs\/development\/[a-zA-Z0-9_./-]+\.md$/.test(e.file))continue;
  let page=publicFiles.get(e.file);
  const app=e.file.match(/^server-version\/frontend\/src\/(school|huiteacher)\/(?:School|Huiteacher)App\.tsx$/);
  if(app) {
   page=app[1]==='school'?'school':'teacher';
   if(e.status!=='M'||!publicRouteBoundary(app[1],read('base',e.file),read('head',e.file)))return null;
  } else if(!page)return null;
  else if(/\.tsx?$/.test(e.file)) {
   // The registration form shares SchoolLanding's file, but is not public copy.
   if(e.file.endsWith('/SchoolLanding.tsx')) {
    const declaration=text=>parse(text)?.statements.find(n=>n.name?.text==='SchoolCodeRegistration')?.getText();
    if(compact(declaration(read('base',e.file))||'')!==compact(declaration(read('head',e.file))||''))return null;
   }
   if(!publicRenderBoundary(e.status==='A'?null:read('base',e.file),read('head',e.file)))return null;
  }
  executable ||= /\.tsx?$/.test(e.file);
  if(page==='shared')for(const p of ['school','teacher'])pages.add(p);else pages.add(page);
 }
 if(!pages.size)return null;
 return {pages:[...pages].sort().map(page=>({page,static:true})),executable};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {changedEntries}=await import('./content-scope.mjs');
  const [base,head]=process.argv.slice(2);
  console.log(JSON.stringify(homepageCopyPlan(changedEntries(base,head),base,head)));
}
