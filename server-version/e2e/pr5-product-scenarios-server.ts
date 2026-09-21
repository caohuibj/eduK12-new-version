/** Isolated CI/local server entry point; production index never imports this file. */
import { readFileSync } from 'node:fs'
import { createRelationalProductRegistry, relationalProductRegistry } from '../backend/src/modules/assessment-relational/product-registry'
if (process.env.NODE_ENV !== 'test' || process.env.PR5_SCENARIOS_ENABLED !== 'true') {
  throw new Error('PR5 scenario server requires explicit test mode')
}
const fixture = JSON.parse(readFileSync(process.env.PR5_SCENARIOS_FIXTURE || '/tmp/eduk12-pr5-scenarios.json', 'utf8'))
Object.assign(relationalProductRegistry, createRelationalProductRegistry(fixture.entries))
void import('../backend/src/index')
