import {describe,it,expect,afterEach} from 'vitest'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import {createHash} from 'node:crypto'
import {scaffoldPackage} from '../../modules/assessment-bundle/onboarding/template'
import {discoverPackages,writePackage,generatePackages,loadPackage} from '../../modules/assessment-bundle/onboarding/loader'
import {dependencyBlockers} from '../../modules/assessment-bundle/onboarding/dependencies'
const roots:string[]=[]
const fresh=()=>{const dir=fs.mkdtempSync(path.join(os.tmpdir(),'b3-loader-'));roots.push(dir);return dir}
afterEach(()=>{for(const dir of roots.splice(0))fs.rmSync(dir,{recursive:true,force:true})})
describe('content discovery and core-diff guard',()=>{
  it('discovers new names deterministically while handwritten modules remain byte-identical',()=>{
    const root=fresh(),packages=path.join(root,'packages'),output=path.join(root,'generated.json')
    const core=path.resolve(__dirname,'../../modules')
    function digest(dir:string):string {return createHash('sha256').update(fs.readdirSync(dir,{withFileTypes:true}).sort((a,b)=>a.name.localeCompare(b.name)).map(e=>e.isDirectory()?digest(path.join(dir,e.name)):fs.readFileSync(path.join(dir,e.name)).toString('base64')).join('\n')).digest('hex')}
    const before=digest(core)
    for(const key of ['unknown_b','unknown_a'])writePackage(path.join(packages,key,'1.0.0'),scaffoldPackage(key))
    expect(discoverPackages(packages).map(p=>p.manifest.definition.bundleKey)).toEqual(['unknown_a','unknown_b'])
    generatePackages(packages,output);const first=fs.readFileSync(output,'utf8')
    generatePackages(packages,output);expect(fs.readFileSync(output,'utf8')).toBe(first)
    generatePackages(packages,output,true);expect(digest(core)).toBe(before)
    fs.writeFileSync(output,'[]');expect(()=>generatePackages(packages,output,true)).toThrow('DRIFT')
  })
  it('rejects executable files, symlinks, incorrect directory identities and unknown dependencies',()=>{
    const root=fresh(),dir=path.join(root,'unknown','1.0.0');writePackage(dir,scaffoldPackage('unknown'))
    fs.writeFileSync(path.join(dir,'plugin.ts'),'throw new Error()');expect(()=>loadPackage(dir)).toThrow('UNKNOWN_FILE');fs.unlinkSync(path.join(dir,'plugin.ts'))
    fs.renameSync(path.join(dir,'rules.json'),path.join(root,'rules.json'));fs.symlinkSync(path.join(root,'rules.json'),path.join(dir,'rules.json'));expect(()=>loadPackage(dir)).toThrow('FILE_REJECTED')
    const p=scaffoldPackage('another');p.manifest.definition.slots[0].instrumentVersion='999.0.0';expect(dependencyBlockers(p)).not.toEqual([])
    const second=fresh();writePackage(path.join(second,'wrong','1.0.0'),scaffoldPackage('another'));expect(()=>discoverPackages(second)).toThrow('IDENTITY_MISMATCH')
  })
})
