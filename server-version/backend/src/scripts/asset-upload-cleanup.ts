// The privileged host wrapper passes environment through stdin, never argv/files.
async function main() {
  if (process.argv.slice(2).join(' ') !== '--run') throw new Error('COMMAND_REFUSED')
  const chunks: Buffer[] = []; let bytes = 0
  for await (const part of process.stdin) { const chunk = Buffer.from(part); bytes += chunk.length; if (bytes > 65536) throw new Error('INPUT_TOO_LARGE'); chunks.push(chunk) }
  const input = JSON.parse(Buffer.concat(chunks).toString('utf8'))
  if (!input.environment || Object.values(input.environment).some(value => typeof value !== 'string')) throw new Error('ENVIRONMENT_REQUIRED')
  Object.assign(process.env, input.environment)
  const { cleanupPendingAssetUploads } = await import('../services/assetUploadDeduplication')
  const { prisma } = await import('../config/database')
  try { console.log(JSON.stringify({ status: 'SUCCESS', ...await cleanupPendingAssetUploads() })) } finally { await prisma.$disconnect() }
}
main().catch(() => { console.error(JSON.stringify({ status: 'FAILED', error: 'ASSET_UPLOAD_CLEANUP_FAILED' })); process.exitCode = 1 })

export {}
