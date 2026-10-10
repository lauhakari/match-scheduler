// Current checks supersede the original review-only harness.
import { spawnSync } from 'node:child_process'
import { readdirSync } from 'node:fs'
const files = readdirSync('tests').filter(name => name.endsWith('.test.js')).map(name => `tests/${name}`)
const result = spawnSync(process.execPath, ['--test', ...files], { stdio: 'inherit' })
process.exitCode = result.status ?? 1
