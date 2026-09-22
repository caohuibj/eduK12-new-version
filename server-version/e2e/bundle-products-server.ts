/** Isolated acceptance server. Never imported by the production entry point. */
import {readFileSync} from 'node:fs'
import {bundleDefinitionProvider} from '../backend/src/modules/bundle-product/service'
import {BundleDefinitionProvider} from '../backend/src/modules/bundle-product/definition-provider'
if(process.env.NODE_ENV!=='test'||process.env.BUNDLE_PRODUCT_ISOLATED_DB!=='1'||!process.env.BUNDLE_PRODUCT_TEST_DATABASE_URL||process.env.BUNDLE_PRODUCT_TEST_DATABASE_URL!==process.env.DATABASE_URL)throw new Error('Explicit isolated test database required')
const fixture=JSON.parse(readFileSync(process.env.BUNDLE_PRODUCT_FIXTURE_FILE||'/tmp/huisurvey-b2-browser-fixture.json','utf8'))
Object.assign(bundleDefinitionProvider,new BundleDefinitionProvider(fixture.entries))
void import('../backend/src/index')
