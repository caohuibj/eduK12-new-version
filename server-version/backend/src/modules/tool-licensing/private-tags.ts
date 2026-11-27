import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { AdminPermissionError } from '../admin-permissions/service'
import type { ToolLicenseProduct } from './contracts'
import { readStoredToolTags, tagView, toolTagChangeFields, writeStoredToolTags } from './tag-storage'

const change = z.strictObject(toolTagChangeFields)
const privateToolKey = (toolId:string) => 'private:'+toolId

// Call only after the portal verifies the tool and the current author's rights.
export async function readPrivateToolTags(tx:Prisma.TransactionClient, product:ToolLicenseProduct, toolId:string) {
  return tagView(await readStoredToolTags(tx,product,privateToolKey(toolId)))
}

export async function writePrivateToolTags(tx:Prisma.TransactionClient, product:ToolLicenseProduct,
  toolId:string, actorId:string, raw:unknown,
) {
  const parsed=change.safeParse(raw)
  if(!parsed.success)throw new AdminPermissionError(400,'工具标签请求格式不合法，请核对标签和修订')
  const {tags,expectedRevision}=parsed.data
  return tagView(await writeStoredToolTags(tx,product,privateToolKey(toolId),actorId,tags,expectedRevision))
}
