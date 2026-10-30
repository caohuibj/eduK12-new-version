import {readFileSync,writeFileSync} from 'node:fs'
import {createHash} from 'node:crypto'
import {checkSelectedSource,readSelectedSource} from '/workspace/eduK12-jdr-work/server-version/backend/scripts/scale-intake-selected-check.ts'
const root='/workspace/eduK12-jdr-work/'
const file='server-version/backend/src/modules/scale/instruments/bat12_2020_en/1.0.0/instrument.ts'
const source=await readSelectedSource(file,p=>readFileSync(root+p,'utf8'))
const result=checkSelectedSource(source)
const output={node:process.version,argv:process.argv,cwd:process.cwd(),result,sourceSHA256:createHash('sha256').update(readFileSync(root+file.replace('instrument.ts','source.json'))).digest('hex'),status:'SELECTED_SOURCE_CONTRACT_PASS',limits:['No DB installation/publication, deployment, browser or scientific/rights approval','Only BAT12 selected scorer and report consumer; previously passed CBI/HSE tools not replayed']}
writeFileSync('/workspace/bundle-inputs/jdr-bat12-slice-20261030/selected-result.json',JSON.stringify(output,null,2)+'\n')
console.log(JSON.stringify(output))
