import { writeFileSync } from 'node:fs'
import { cognitiveSeeds } from '../../backend/src/modules/cognitive/generated/seeds'

const output = process.argv[2]
if (!output) throw new Error('Usage: review-fixes-preview-data.ts <seeds-json-output>')
writeFileSync(output, JSON.stringify(cognitiveSeeds))
