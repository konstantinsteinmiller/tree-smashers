#!/usr/bin/env node
/**
 * Paint queue for the directional-armour tiles — text-only Gemini jobs
 * through tools/art-desk/paint.mjs (cross-process lock + throttle), then pack.
 *
 *   node tools/armor-art/paint-queue.mjs [--force] [--dry] [--no-pack]
 *
 * Jobs: `armor-tiles` (blade plate + weak patch → pack.mjs) and `armor-bulwark`
 * (the tank bulwark → pack-bulwark.mjs). Prompts → art-sheets/armor-art/*.prompt.txt;
 * paintings → art-sheets/painted/<job>.png (skipped when they exist: re-runs resume).
 * Stops on SIGNED_OUT (10) / QUOTA (11). Log: art-sheets/armor-art-queue.log
 */
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { ART, PAINTED, ROOT, runQueue } from '../sprite-pack/lib.mjs'
import { bulwarkPrompt, prompt } from './prompts.mjs'

runQueue({
  tool: 'armor-art',
  jobs: [
    { name: 'armor-tiles', prompt: prompt(), promptFile: join(ART, 'armor-art', 'armor-tiles.prompt.txt'), out: join(PAINTED, 'armor-tiles.png') },
    { name: 'armor-bulwark', prompt: bulwarkPrompt(), promptFile: join(ART, 'armor-art', 'armor-bulwark.prompt.txt'), out: join(PAINTED, 'armor-bulwark.png') }
  ]
})

if (!process.argv.includes('--dry') && !process.argv.includes('--no-pack')) {
  const p = spawnSync(process.execPath, [join(ROOT, 'tools', 'armor-art', 'pack-bulwark.mjs')], { cwd: ROOT, encoding: 'utf-8', stdio: ['ignore', 'pipe', 'inherit'] })
  console.log(`bulwark pack: exit ${p.status} ${(p.stdout ?? '').trim().split('\n').pop() ?? ''}`)
}
