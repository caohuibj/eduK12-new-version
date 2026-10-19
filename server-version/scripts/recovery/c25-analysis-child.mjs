/** Fixed leaf CLI: the shared export module must finish ESM evaluation before
 * childMain dynamically imports HTTP, which itself imports that shared module.
 * Nothing imports this entry. All prerequisites and work deadlines stay there. */
import {childMain} from './c25-analysis-export.mjs'
import {publicFailure} from './c25-client.mjs'

await childMain().catch(error=>{
 console.error(JSON.stringify(publicFailure(error)));process.exitCode=1
})
