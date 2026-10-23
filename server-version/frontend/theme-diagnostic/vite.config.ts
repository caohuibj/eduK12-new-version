import {createRequire} from 'node:module'
import {resolve,dirname} from 'node:path'
import {fileURLToPath,pathToFileURL} from 'node:url'
const root=dirname(fileURLToPath(import.meta.url))
const frontend=resolve(process.env.EDU_THEME_FRONTEND||resolve(root,'..'))
const require=createRequire(resolve(frontend,'package.json'))
export default async function config(){
 const {default:react}=await import(pathToFileURL(require.resolve('@vitejs/plugin-react')).href)
 return {
 root,publicDir:resolve(frontend,'public'),plugins:[react()],
 resolve:{alias:{'@source':resolve(frontend,'src'),react:resolve(frontend,'node_modules/react'),'react-dom':resolve(frontend,'node_modules/react-dom')},dedupe:['react','react-dom']},
 css:{postcss:frontend},
 server:{host:'127.0.0.1',port:5179,strictPort:true,fs:{allow:[root,frontend]}},
 build:{outDir:resolve(root,'../theme-diagnostic-dist'),emptyOutDir:true},
 preview:{host:'127.0.0.1',port:5179,strictPort:true},
}
}
