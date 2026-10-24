import {performance} from 'node:perf_hooks'
const root=process.env.BENCH_SOURCE_ROOT!;const imp=(p:string)=>import(root+'/'+p)
async function main(){
 const {prisma:db}=await imp('src/config/database.ts');const {default:express}=await imp('node_modules/express/index.js');const {default:helmet}=await imp('node_modules/helmet/index.mjs');const {default:cors}=await imp('node_modules/cors/lib/index.js');
 const {default:training}=await imp('src/modules/composite/composite.routes.ts');const {csrfProtection}=await imp('src/middleware/csrf.ts');const {cacheService}=await imp('src/services/cacheService.ts');const obs=await imp('src/services/runtimeObservability.ts');
 await cacheService.initialize();if(!cacheService.getStatus().connected)throw new Error('Real Redis required');
 const queries:any[]=[];const requests:any[]=[];let stage='';db.$on('query',(e:any)=>queries.push({stage,atMs:performance.now(),durationMs:e.duration,sql:e.query}));
 const app=express();app.use(obs.requestObservabilityMiddleware);app.use((req:any,res:any,next:any)=>{const label=req.method+' '+req.url;stage=label;const cpu=process.cpuUsage(),start=performance.now(),q=queries.length;res.once('finish',()=>{const d=process.cpuUsage(cpu);requests.push({stage:label,status:res.statusCode,elapsedMs:performance.now()-start,cpuMs:(d.user+d.system)/1000,sqlCount:queries.length-q,memory:process.memoryUsage()})});next()});
 app.use(helmet());app.use(cors({origin:['https://training.eduk12.top','https://survey.eduk12.top'],credentials:true}));app.use(express.json({limit:'2mb'}));app.use('/api',csrfProtection);
 app.use('/api/composite-assessments',training);
 app.use((e:any,_req:any,res:any,_next:any)=>{console.error(e);res.status(500).json({code:-1,message:e.message})});
 const server=app.listen(0,'127.0.0.1',()=>process.send?.({ready:true,port:(server.address() as any).port,pid:process.pid,cpu:process.cpuUsage(),memory:process.memoryUsage(),redis:cacheService.getStatus()}));
 process.on('message',async(m:any)=>{if(m.snapshot)process.send?.({id:m.id,cpu:process.cpuUsage(),memory:process.memoryUsage(),requests:[...requests],queries:[...queries],metrics:obs.runtimeMetricLines()});if(m.clear){requests.length=0;queries.length=0}if(m.stop){await cacheService.close();await db.$disconnect();server.close(()=>process.exit(0))}else if(!m.snapshot)process.send?.({id:m.id,ok:true})})
}
main().catch(e=>{console.error(e);process.exit(1)})
