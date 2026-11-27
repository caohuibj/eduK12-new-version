import type { Prisma } from '@prisma/client'
import { z } from 'zod'
import { AdminPermissionError } from '../admin-permissions/service'
import type { ToolLicenseProduct } from './contracts'

type Tag = { key: string; label: string }
export type StoredToolTags = { revision: number; labels: Tag[] }
const normalize = (label: string) => label.normalize('NFKC').trim().replace(/\s+/gu, ' ')
export const toolTagInput = z.string().max(160).transform(normalize)
  .refine(value => Boolean(value) && [...value].length <= 40 && !/\p{Cc}/u.test(value))
  .transform(label => ({ key: label.toLowerCase(), label }))
const toolTagSetInput = z.array(z.string().max(160)).max(20).transform(values =>
  values.map(normalize).filter(Boolean),
).pipe(z.array(toolTagInput)).transform(tags => [...new Map(tags.map(tag => [tag.key, tag])).values()])
export const toolTagChangeFields = {
  tags: toolTagSetInput,
  expectedRevision: z.number().int().min(0).max(2_147_483_646),
}
export const tagView = ({labels,revision}:StoredToolTags) => ({tags:labels.map(tag=>tag.label),revision})

export async function readStoredToolTags(tx: Prisma.TransactionClient, product: ToolLicenseProduct, key: string) {
  const [row] = await tx.$queryRaw<StoredToolTags[]>`
    SELECT labels,revision FROM tool_catalog_tag_sets WHERE product=${product} AND tool_key=${key}`
  return row ?? {labels:[],revision:0}
}

export async function writeStoredToolTags(tx: Prisma.TransactionClient, product: ToolLicenseProduct,
  key: string, actorId: string, tags: Tag[], expectedRevision: number,
) {
  const [current] = await tx.$queryRaw<StoredToolTags[]>`
    SELECT labels,revision FROM tool_catalog_tag_sets WHERE product=${product} AND tool_key=${key} FOR UPDATE`
  const revision = current?.revision ?? 0
  const labels = current?.labels ?? []
  const unchanged = labels.length===tags.length && labels.every((tag,index) =>
    tag.key===tags[index].key && tag.label===tags[index].label)
  const conflict = () => new AdminPermissionError(409,'这项工具的标签已变化，请刷新核对后再保存')
  if (revision!==expectedRevision && !(revision===expectedRevision+1 && unchanged)) throw conflict()
  if (unchanged) return {labels,revision}
  const serialized = JSON.stringify(tags)
  const next = revision+1
  if (revision===0) {
    const inserted = await tx.$executeRaw`
      INSERT INTO tool_catalog_tag_sets (product,tool_key,labels,revision,updated_by)
      VALUES (${product},${key},${serialized}::jsonb,${next},${actorId})
      ON CONFLICT (product,tool_key) DO NOTHING`
    if (inserted!==1) throw conflict()
  } else {
    await tx.$executeRaw`
      UPDATE tool_catalog_tag_sets SET labels=${serialized}::jsonb,revision=${next},
        updated_by=${actorId},updated_at=clock_timestamp()
      WHERE product=${product} AND tool_key=${key}`
  }
  return {labels:tags,revision:next}
}
