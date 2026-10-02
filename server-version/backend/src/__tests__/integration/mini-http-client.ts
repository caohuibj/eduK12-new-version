import {createRequire} from 'node:module'
import {expect} from 'vitest'
const require=createRequire(import.meta.url)
const {createRuntime}=require('../../../../miniprogram-v2/app/bootstrap/index.js')
export const nativeRequire=require
export function miniHttpClient(baseUrl:string){
 const stored=new Map(),calls:any[]=[]
 const platform={canIUse:()=>true,request(options:any){calls.push(options);const url=new URL(options.url);void fetch(baseUrl+url.pathname+url.search,{method:options.method,headers:{...options.header,'Content-Type':'application/json'},body:['GET','HEAD'].includes(options.method)?undefined:JSON.stringify(options.data)}).then(async res=>options.success({statusCode:res.status,header:Object.fromEntries(res.headers),cookies:res.headers.getSetCookie(),data:await res.json()})).catch(options.fail)},getNetworkType(o:any){o.success({networkType:'wifi'})},onNetworkStatusChange(){},setStorage(o:any){expect(o.encrypt).toBe(true);stored.set(o.key,structuredClone(o.data));o.success({})},getStorage(o:any){expect(o.encrypt).toBe(true);if(stored.has(o.key))o.success({data:structuredClone(stored.get(o.key))});else o.fail({errMsg:'getStorage:fail data not found'})},removeStorage(o:any){stored.delete(o.key);o.success({})}}
 const runtime=createRuntime(platform,'https://mini-http-fixture.example')
 return {runtime,stored,calls,platform}
}
export function assertMiniTestDatabase(url:string){
 const fixture=new URL(url),actual=new URL(process.env.DATABASE_URL??'')
 if(fixture.host!==actual.host||fixture.pathname!==actual.pathname)throw new Error('HTTP fixture must use selected test datasource')
 const release=process.env.RELEASE_VERIFY_LOCAL==='true'&&['localhost','127.0.0.1'].includes(fixture.hostname)&&fixture.pathname==='/eduk12_release'
 const ci=process.env.CI==='true'&&['localhost','127.0.0.1'].includes(fixture.hostname)&&fixture.pathname==='/ptool'
 if(!/test|ci/i.test(fixture.pathname)&&!ci&&!release)throw new Error('requires isolated test database')
}
