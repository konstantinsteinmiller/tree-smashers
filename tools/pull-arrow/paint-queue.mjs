#!/usr/bin/env node
/**
 * Paint queue for the pull-arrow ornament — one text-only Gemini job through
 * tools/art-desk/paint.mjs (cross-process lock + throttle), then pack.mjs.
 *
 *   node tools/pull-arrow/paint-queue.mjs [--force] [--dry] [--no-pack]
 *
 * Prompt → art-sheets/pull-arrow/pull-arrow.prompt.txt; painting →
 * art-sheets/painted/pull-arrow.png (skipped when it exists). Log: art-sheets/pull-arrow-queue.log
 */
import { join } from 'node:path'
import { ART, PAINTED, runQueue } from '../sprite-pack/lib.mjs'
import { prompt } from './prompts.mjs'

runQueue({
  tool: 'pull-arrow',
  jobs: [{ name: 'pull-arrow', prompt: prompt(), promptFile: join(ART, 'pull-arrow', 'pull-arrow.prompt.txt'), out: join(PAINTED, 'pull-arrow.png') }]
})
