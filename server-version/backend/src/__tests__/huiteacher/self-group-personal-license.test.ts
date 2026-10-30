import {it,expect,vi} from 'vitest'
import type {Prisma} from '@prisma/client'
import {releasedTeacherScaleEntry} from '../../modules/huiteacher/scaleLicense.service'

it('does not reinterpret an organization GROUP resource as a standalone personal Scale entitlement',async()=>{
 const query=vi.fn(),db={$queryRaw:query} as unknown as Prisma.TransactionClient
 await expect(releasedTeacherScaleEntry(db,{family:'SCALE',key:'teacher-scale:00000000-0000-4000-8000-000000000001:GROUP',version:'1.0.1'})).rejects.toMatchObject({statusCode:403,code:'HUITEACHER_SCALE_IDENTITY_INVALID'})
 expect(query).not.toHaveBeenCalled()
})
