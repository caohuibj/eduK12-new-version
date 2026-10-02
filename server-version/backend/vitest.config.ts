import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    globals: true,
    // Only the test runner may admit framework fixtures; production cannot opt in.
    env: { COGNITIVE_TEST_FIXTURES_ENABLED: 'true' },
    environment: 'node',
    include: ['src/__tests__/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'json', 'html'],
      exclude: [
        'node_modules/',
        'src/__tests__/',
        'prisma/',
        'dist/',
      ],
    },
  },
})
