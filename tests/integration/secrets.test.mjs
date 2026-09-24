import assert from 'node:assert/strict'
import { execFile as execFileCallback } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { test } from 'node:test'

const execFile = promisify(execFileCallback)
const repositoryRoot = new URL('../../', import.meta.url)

const signatures = [
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],
  ['AWS access key', /AKIA[0-9A-Z]{16}/],
  [
    'GitHub token',
    new RegExp(['g', '(?:hp|ho|hu|hs|hr)', '_[A-Za-z0-9]{36,}'].join('')),
  ],
  ['GitLab token', new RegExp(['gl', 'pat-', '[A-Za-z0-9_-]{20,}'].join(''))],
  ['Slack token', new RegExp(['xo', '[abprs]-', '[A-Za-z0-9-]{20,}'].join(''))],
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  [
    'Stripe live key',
    new RegExp(['sk', '_live_', '[0-9A-Za-z]{16,}'].join('')),
  ],
]

async function trackedFiles() {
  const { stdout } = await execFile('git', ['ls-files', '-z'], {
    cwd: repositoryRoot,
    encoding: 'buffer',
    maxBuffer: 10 * 1024 * 1024,
  })
  return stdout.toString('utf8').split('\0').filter(Boolean)
}

test('tracked files contain no credential files or recognizable secret material', async () => {
  const files = await trackedFiles()
  const credentialFiles = files.filter((path) => {
    const name = path.split('/').at(-1)
    return (
      name === '.env' ||
      name === '.npmrc' ||
      name === '.pypirc' ||
      /\.(?:pem|p12|pfx|key|keystore)$/i.test(name)
    )
  })
  assert.deepEqual(
    credentialFiles,
    [],
    `tracked credential files: ${credentialFiles.join(', ')}`,
  )

  const findings = []
  for (const path of files) {
    const data = await readFile(new URL(path, repositoryRoot))
    if (data.length > 2 * 1024 * 1024 || data.includes(0)) continue
    const text = data.toString('utf8')
    for (const [label, signature] of signatures) {
      if (signature.test(text)) findings.push(`${path}: ${label}`)
    }
  }

  assert.deepEqual(
    findings,
    [],
    `possible committed secrets:\n${findings.join('\n')}`,
  )
})
