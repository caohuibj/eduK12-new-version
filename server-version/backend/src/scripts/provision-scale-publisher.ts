async function main() {
  if (process.argv.length !== 3 || process.argv[2] !== '--apply') {
    throw new Error('Usage: npm run scale:provision-publisher -- --apply')
  }
  if (!process.env.DATABASE_URL?.trim()) throw new Error('An explicit ops DATABASE_URL is required')
  const { prisma } = await import('../config/database')
  try {
    const { ensureGitScalePublisher } = await import('../modules/scale/onboarding/git-release-actor')
    console.log(await ensureGitScalePublisher(prisma))
  } finally {
    await prisma.$disconnect()
  }
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : 'Git release identity provisioning failed')
  process.exitCode = 1
})
