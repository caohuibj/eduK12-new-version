import fs from 'node:fs'
import path from 'node:path'
import { parseDeclarativePackage, PACKAGE_LIMITS, type DeclarativePackage } from './contract'

const required = ['manifest.json','evidence-map.json','rules.json','report.json','scientific.json','publication.json']
const optional = ['context.json', 'fixtures']
function readJson(file: string): unknown {
  const stat = fs.lstatSync(file)
  if (!stat.isFile() || stat.isSymbolicLink() || stat.size > PACKAGE_LIMITS.bytes) throw new Error('PACKAGE_FILE_REJECTED:'+file)
  try { return JSON.parse(fs.readFileSync(file,'utf8')) } catch { throw new Error('PACKAGE_JSON_INVALID:'+file) }
}
export function loadPackage(directory: string): DeclarativePackage {
  if (fs.lstatSync(directory).isSymbolicLink()) throw new Error('PACKAGE_SYMLINK_REJECTED')
  for (const name of fs.readdirSync(directory)) {
    if (![...required,...optional].includes(name)) throw new Error('PACKAGE_UNKNOWN_FILE:'+name)
  }
  const content = Object.fromEntries(required.map(name=>[name,readJson(path.join(directory,name))]))
  const fixtureDir = path.join(directory,'fixtures')
  if (fs.lstatSync(fixtureDir).isSymbolicLink()) throw new Error('PACKAGE_SYMLINK_REJECTED')
  const names = ['valid','missing','invalid','not-applicable']
  if (fs.readdirSync(fixtureDir).some(n => !names.map(x=>x+'.json').includes(n))) throw new Error('PACKAGE_UNKNOWN_FIXTURE')
  const fixtures = Object.fromEntries(names.map(name=>[name,readJson(path.join(fixtureDir,name+'.json'))]))
  const raw = {schemaVersion:1,fixtures,manifest:content['manifest.json'],evidence:content['evidence-map.json'],rules:content['rules.json'],report:content['report.json'],scientific:content['scientific.json'],publication:content['publication.json'],
    ...(fs.existsSync(path.join(directory,'context.json'))?{context:readJson(path.join(directory,'context.json'))}:{})}
  return parseDeclarativePackage(raw)
}
export function discoverPackages(root: string): DeclarativePackage[] {
  if (!fs.existsSync(root)) return []
  const result: DeclarativePackage[] = []
  const seen = new Set<string>()
  const children = (dir:string) => fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name))
  for (const key of children(root)) {
    if (!key.isDirectory() || key.isSymbolicLink()) throw new Error('PACKAGE_DIRECTORY_REQUIRED:'+key.name)
    for (const version of children(path.join(root,key.name))) {
      if (!version.isDirectory() || version.isSymbolicLink()) throw new Error('PACKAGE_DIRECTORY_REQUIRED:'+version.name)
      const pack = loadPackage(path.join(root,key.name,version.name))
      const def=pack.manifest.definition
      if (def.bundleKey!==key.name || def.bundleVersion!==version.name) throw new Error('PACKAGE_DIRECTORY_IDENTITY_MISMATCH')
      const id=def.bundleKey+'@'+def.bundleVersion
      if(seen.has(id)) throw new Error('PACKAGE_DUPLICATE:'+id)
      seen.add(id); result.push(pack)
    }
  }
  return result
}
export function generatePackages(root: string, output: string, check = false) {
  const packages = discoverPackages(root)
  const bytes = JSON.stringify(packages,null,2)+'\n'
  if(check) { if(!fs.existsSync(output)||fs.readFileSync(output,'utf8')!==bytes) throw new Error('BUNDLE_MANIFEST_DRIFT') }
  else { fs.mkdirSync(path.dirname(output),{recursive:true});fs.writeFileSync(output,bytes) }
  return packages
}
export function writePackage(directory: string, pack: DeclarativePackage) {
  parseDeclarativePackage(pack)
  if(fs.existsSync(directory))throw new Error('PACKAGE_DIRECTORY_EXISTS')
  fs.mkdirSync(directory,{recursive:true})
  fs.mkdirSync(path.join(directory,'fixtures'))
  for(const [name,fixture] of Object.entries(pack.fixtures))fs.writeFileSync(path.join(directory,'fixtures',name+'.json'),JSON.stringify(fixture,null,2)+'\n')
  for(const [name,content] of Object.entries({'manifest.json':pack.manifest,'evidence-map.json':pack.evidence,'rules.json':pack.rules,'report.json':pack.report,'scientific.json':pack.scientific,'publication.json':pack.publication,...(pack.context?{'context.json':pack.context}:{})})) fs.writeFileSync(path.join(directory,name),JSON.stringify(content,null,2)+'\n')
}
