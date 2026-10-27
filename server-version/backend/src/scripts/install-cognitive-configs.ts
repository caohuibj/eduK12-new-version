import {readFileSync} from 'node:fs'
import {prisma} from '../config/database'
import {installCognitiveConfigs,planCognitiveConfigInstall} from '../modules/cognitive/onboarding/install'

async function main(){
  const args=process.argv.slice(2)
  if(args.some(arg=>arg.startsWith('--')&&!['--input','--actor','--apply'].includes(arg)))throw Error('Unknown argument')
  const value=(name:string)=>{const i=args.indexOf(name),v=i<0?undefined:args[i+1];if(!v||v.startsWith('--'))throw Error(`Required ${name}`);return v}
  const input=JSON.parse(readFileSync(value('--input'),'utf8')),actor=value('--actor')
  const result=await (args.includes('--apply')?installCognitiveConfigs(prisma,input,actor):planCognitiveConfigInstall(prisma,input,actor))
  process.stdout.write(JSON.stringify(result,null,2)+'\n')
  if(result.hasBlocked)process.exitCode=2
}
void main().catch(error=>{console.error(error instanceof Error?error.message:'Cognitive installation failed');process.exitCode=1}).finally(()=>prisma.$disconnect())
