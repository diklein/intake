#!/usr/bin/env node
/**
 * Builds the Chrome Web Store package from extension/ with a Chrome-tuned
 * manifest: the `nativeMessaging` permission is stripped. Only the Safari
 * build uses native messaging (vault writes route through the containing
 * Mac app); Chrome writes via the File System Access API, and shipping the
 * unused permission both trips a CWS justification requirement and adds a
 * "Communicate with cooperating native applications" install warning.
 * The shared source manifest keeps the permission for the Safari appex.
 *
 * Usage: node scripts/package-chrome.mjs
 * Output: launch/intake-chrome-<version>.zip
 */

import { execSync } from 'node:child_process'
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..')

const stage = mkdtempSync(join(tmpdir(), 'intake-chrome-'))
cpSync(join(ROOT, 'extension'), stage, { recursive: true, filter: (src) => !/\/\.[^/]*$/.test(src) })

const manifestPath = join(stage, 'manifest.json')
const manifest = JSON.parse(readFileSync(manifestPath, 'utf-8'))
manifest.permissions = manifest.permissions.filter((p) => p !== 'nativeMessaging')
writeFileSync(manifestPath, JSON.stringify(manifest, null, 2) + '\n')

const out = join(ROOT, 'launch', `intake-chrome-${manifest.version}.zip`)
if (existsSync(out)) rmSync(out)
execSync(`cd '${stage}' && zip -rq '${out}' .`)
rmSync(stage, { recursive: true, force: true })

console.log(`wrote launch/intake-chrome-${manifest.version}.zip (permissions: ${manifest.permissions.join(', ')})`)
