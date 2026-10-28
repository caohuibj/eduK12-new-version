const path=require('node:path'),fs=require('node:fs')
const root=path.resolve(__dirname,'../../../../../..')
const esbuild=require(path.join(root,'server-version/frontend/node_modules/esbuild'))
const out='/workspace/scratch/cognitive-plan-ant/frontend/site'
fs.mkdirSync(out,{recursive:true})
const built=esbuild.buildSync({entryPoints:[path.join(__dirname,'preview-entry.tsx')],bundle:true,platform:'browser',format:'iife',
 outfile:path.join(out,'ant-preview.js'),nodePaths:[path.join(root,'server-version/frontend/node_modules')],
 jsx:'automatic',define:{'process.env.NODE_ENV':'"development"'},metafile:true,
 write:true,logLevel:'warning'})
fs.writeFileSync(path.join(out,'metafile.json'),JSON.stringify(built.metafile,null,2)+'\n')
fs.writeFileSync(path.join(out,'index.html'),'<!doctype html><html lang="zh"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>ANT cloud synthetic candidate review</title><link rel="stylesheet" href="/ant-preview.css"><style>html,body{margin:0;background:#F8FAFC}#fixture-note{position:fixed;left:4px;top:2px;z-index:99;background:white;color:#4B5563;border:1px solid #64748B;padding:2px 5px;font:10px system-ui;pointer-events:none}</style></head><body><span id="fixture-note">SYNTHETIC FIXTURE · 未物理校准 · 云端候选预览</span><div id="root"></div><script src="/ant-preview.js"></script></body></html>')
console.log('Built isolated ANT cloud review fixture at '+out)
