/** Fixed leaf entry prevents top-level-await parent/task import cycles. */
import {workerMain} from './c25-c26-worker-runtime.mjs'
try{await workerMain()}catch(error){console.error('C26_WORKER_FAILED',error.name);process.exitCode=1;if(process.connected)process.disconnect()}
