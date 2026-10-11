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
  if (!admitsCopy(entries,(ref,file)=>source(ref==='base'?base:head,file))) return null;
  if (git('rev-parse',`${base}:server-version/backend`)!==git('rev-parse',`${head}:server-version/backend`)) return null;
  const pages=[];
  if (entries.some(e=>e.file===portalFile)) pages.push({page:'training',...portalCopy(source(head,portalFile)).copy});
  if (entries.some(e=>e.file===featuresFile)) pages.push({page:'school',title:featureCopy(source(head,featuresFile)).title});
  const toolsChanged=entries.some(e=>copyTools.has(e.file));
  return {schema:1,route:'homepage-copy',base,head,changes:entries,changed:['frontend'],pages,toolsChanged,
    frontendTree:git('rev-parse',`${head}:server-version/frontend`),
    required:['copy-boundary','frontend-candidate','runtime-scan','homepage-browser',...(toolsChanged?['sast']:[])]};
}
if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  const {changedEntries}=await import('./content-scope.mjs');
  const [base,head]=process.argv.slice(2);
  console.log(JSON.stringify(homepageCopyPlan(changedEntries(base,head),base,head)));
}
