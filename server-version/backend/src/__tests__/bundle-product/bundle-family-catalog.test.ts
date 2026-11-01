import {afterEach,expect,it,vi} from 'vitest'
import {createCodeBundleDefinitionProvider} from '../../modules/bundle-product/code-catalog'
import {createBundleProductService} from '../../modules/bundle-product/service'
vi.mock('../../config/database',()=>({prisma:{$queryRaw:vi.fn(async()=>[]),bundlePackageRelease:{findUnique:vi.fn(async()=>null)}}}))
afterEach(()=>vi.unstubAllEnvs())
it('current paginated catalog preserves child parent and teacher DRAFT identities without claiming private sources are executable',async()=>{
 vi.stubEnv('BUNDLE_PRODUCTS_ENABLED','true')
 const service=createBundleProductService(createCodeBundleDefinitionProvider())
 const result=await service.catalog({userId:'synthetic-admin',role:'ADMIN'},{pagination:{page:1,pageSize:20,skip:0,take:20},filters:{keyword:'child_chexi_'}})
 expect(result.list.map(x=>x.bundleKey)).toEqual(['child_chexi_parent_zh_cn_v1','child_chexi_teacher_zh_cn_v1'])
 for(const row of result.list){expect(row.status).toBe('DRAFT');expect(row.canInstantiate).toBe(false);expect(row.publicationBlockers.length).toBeGreaterThan(0)}
 expect(result.hasMore).toBe(false)
})
