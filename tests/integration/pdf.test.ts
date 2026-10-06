// PDF export through the app binary (`spring export`), on the demo workspace:
// the same components as the app render the pages, Chromium prints them.
import { spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, readFileSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { basename, join, resolve } from 'node:path'
import { PDFParse } from 'pdf-parse'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { seedDemo } from '../../e2e/demo'
import { tempRoot } from '../unit/helpers'

const APP = resolve(__dirname, '../..')
// The electron package resolves to the path of its binary.
const ELECTRON = createRequire(import.meta.url)('electron') as string

let root: string
let workspace: string

beforeAll(() => {
  if (!existsSync(join(APP, 'out/main/index.js'))) throw new Error('Build the app first: npm run build')
  root = tempRoot('spring-pdf-')
  workspace = join(root, 'docs')
  seedDemo(workspace)
})

afterAll(() => {
  rmSync(root, { recursive: true, force: true })
})

function exportPdf(path: string, file: string): { status: number | null; stdout: string; stderr: string } {
  return spawnSync(ELECTRON, [APP, 'export', path, '-o', file, '--workspace', workspace], {
    cwd: root,
    env: { ...process.env, SPRING_DATA_DIR: join(root, 'data') },
    encoding: 'utf8',
    timeout: 90_000
  })
}

async function textOf(file: string): Promise<{ text: string; pages: number }> {
  // SPRING_PDF_OUT=<folder> keeps the PDFs, to look at them.
  if (process.env.SPRING_PDF_OUT) copyFileSync(file, join(process.env.SPRING_PDF_OUT, basename(file)))
  const parser = new PDFParse({ data: readFileSync(file) })
  const result = await parser.getText()
  await parser.destroy()
  return { text: result.text, pages: result.total }
}

describe('spring export', () => {
  it('prints a page with its blocks unfolded', async () => {
    const file = join(root, 'kubernetes.pdf')
    const run = exportPdf('infra/kubernetes', file)
    expect(run.stderr).not.toContain('spring:')
    expect(run.status).toBe(0)
    expect(run.stdout).toContain(`PDF written to ${file}`)
    const { text } = await textOf(file)
    for (const expected of [
      'Kubernetes',
      'How the services run on the managed cluster',
      'Deployment freeze',
      'Helm charts',
      'Go live',
      'Waiting for the auditor.',
      'Environments',
      'staging.acme.io',
      'replicaCount',
      'Get the credentials',
      // Every tab and the collapsible block are printed.
      'Architecture',
      'Diagram image',
      'The data already lives in BigQuery.'
    ]) {
      // Some titles are in capitals by CSS.
      expect(text.toLowerCase()).toContain(expected.toLowerCase())
    }
  })

  it('prints a section with a cover and its contents', async () => {
    const file = join(root, 'infra.pdf')
    expect(exportPdf('infra', file).status).toBe(0)
    const { text, pages } = await textOf(file)
    expect(pages).toBeGreaterThanOrEqual(3)
    expect(text).toContain('Clusters, networks and environments')
    expect(text.indexOf('VPN')).toBeGreaterThan(-1)
    expect(text).toContain('WireGuard')
  })

  it('explains what cannot be exported', () => {
    const missing = exportPdf('nowhere', join(root, 'x.pdf'))
    expect(missing.status).toBe(1)
    expect(missing.stderr).toContain('Nothing at "nowhere"')
    const link = exportPdf('liens-externes/grafana', join(root, 'y.pdf'))
    expect(link.stderr).toContain('A link cannot be exported')
  })
})
