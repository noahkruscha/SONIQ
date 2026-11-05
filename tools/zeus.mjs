/**
 * Runs the Zeus CLI with its private modules on NODE_PATH.
 *
 * Recent Node versions no longer resolve the CLI's bundled `zeppos-app-utils`
 * through its internal alias, so `zeus build` fails with MODULE_NOT_FOUND.
 * This wrapper is only a build helper; it does not touch the Mini Program.
 */
import { spawnSync } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const privateModules = path.join(root, 'node_modules', '@zeppos', 'zeus-cli', 'private-modules')
const cli = path.join(root, 'node_modules', '@zeppos', 'zeus-cli', 'bin', 'main.js')

const env = { ...process.env }
env.NODE_PATH = [privateModules, env.NODE_PATH].filter(Boolean).join(path.delimiter)

const result = spawnSync(process.execPath, [cli, ...process.argv.slice(2)], {
  cwd: root,
  stdio: 'inherit',
  env,
})

if (result.error) {
  console.error(result.error.message)
  process.exit(1)
}
process.exit(result.status === null ? 1 : result.status)
