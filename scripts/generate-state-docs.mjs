// Writes docs/STATE_MACHINES.md from src/lib/stateMachines.js. Run: npm run docs:states
import { writeFileSync } from 'node:fs'
import { renderStateMachineDocs } from '../src/lib/stateMachineDocs.js'
writeFileSync(new URL('../docs/STATE_MACHINES.md', import.meta.url), renderStateMachineDocs())
console.log('docs/STATE_MACHINES.md written')
