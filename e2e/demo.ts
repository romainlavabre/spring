// A documentation workspace using every block type: the e2e tests and the
// screenshots of the docs start from it.
import { execFileSync } from 'node:child_process'
import { writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DocStore } from '../src/core/layout/store'
import { ensureWorkspaceLayout } from '../src/core/layout/workspace'

// A 1x1 red PNG, enough to show an image block.
const PIXEL = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z/C/HgAGgwJ/lK3Q6wAAAABJRU5ErkJggg==', 'base64')

export function seedDemo(dir: string, name = 'Acme docs'): void {
  ensureWorkspaceLayout(dir, name)
  const store = new DocStore(dir)
  store.createSection('', { title: 'Infra', icon: 'server', description: 'Clusters, networks and environments' })
  store.createSection('', { title: 'Process', icon: 'workflow' })
  store.createSection('', { title: 'Liens externes', icon: 'link' })
  store.createSection('infra', { title: 'Réseau', icon: 'network' })

  store.createPage('infra/reseau', {
    title: 'VPN',
    icon: 'shield-check',
    description: 'Reaching the private networks',
    blocks: [{ id: 'intro', type: 'text', md: '## Access\nThe VPN uses **WireGuard**. Ask :kbd[@ops] for a key.' }]
  })
  store.addAsset({ name: 'architecture.png', data: PIXEL })

  store.createPage('infra', {
    title: 'Kubernetes',
    icon: 'container',
    description: 'How the services run on the managed cluster',
    order: 5,
    blocks: [
      {
        id: 'intro',
        type: 'text',
        md: '## Overview\nThe services run on **GKE**, one namespace per environment. Read [the VPN page](page:infra/reseau/vpn) to reach the cluster.\n\nStatus: :badge[Production]{color=green} :badge[Migrating]{color=amber}\n\n- Autoscaling between 3 and 12 nodes\n- Images built by the CI, signed\n- Secrets in Secret Manager'
      },
      { id: 'freeze', type: 'callout', variant: 'warning', title: 'Deployment freeze', md: 'No deployment on Friday afternoons.' },
      {
        id: 'plan',
        type: 'timeline',
        view: 'gantt',
        title: 'Migration plan',
        lanes: [
          { id: 'infra', title: 'Infra', color: 'blue' },
          { id: 'dev', title: 'Dev', color: 'violet' },
          { id: 'ops', title: 'Ops', color: 'teal' }
        ],
        items: [
          { id: 'cluster', title: 'Cluster setup', kind: 'phase', start: '2026-01-05', end: '2026-02-20', lane: 'infra', status: 'done' },
          { id: 'network', title: 'Network', kind: 'phase', start: '2026-02-01', end: '2026-03-15', lane: 'infra', status: 'done' },
          { id: 'charts', title: 'Helm charts', kind: 'phase', start: '2026-02-23', end: '2026-05-10', lane: 'dev', status: 'current', dependsOn: ['cluster'] },
          { id: 'tests', title: 'Load tests', kind: 'phase', start: '2026-05-01', end: '2026-06-15', lane: 'ops', status: 'planned', dependsOn: ['charts'] },
          { id: 'golive', title: 'Go live', kind: 'milestone', start: '2026-06-22', lane: 'ops', status: 'planned', dependsOn: ['tests'] },
          { id: 'audit', title: 'Security audit', kind: 'phase', start: '2026-04-01', end: '2026-04-30', lane: 'infra', status: 'blocked', description: 'Waiting for the auditor.' },
          { id: 'decommission', title: 'Decommission the old VMs', kind: 'phase', lane: 'infra', status: 'planned' },
          { id: 'retro', title: 'Retrospective', kind: 'milestone', lane: 'ops', status: 'planned' }
        ]
      },
      {
        id: 'envs',
        type: 'table',
        caption: 'Environments',
        columns: [
          { id: 'env', title: 'Environment', type: 'badge', colors: { Production: 'red', Staging: 'amber', Dev: 'blue' } },
          { id: 'url', title: 'URL', type: 'md' },
          { id: 'nodes', title: 'Nodes', type: 'number' },
          { id: 'ha', title: 'HA', type: 'check' },
          { id: 'since', title: 'Since', type: 'date' }
        ],
        rows: [
          { env: 'Production', url: '[app.acme.io](https://app.acme.io)', nodes: '6', ha: 'yes', since: '2026-03-02' },
          { env: 'Staging', url: '[staging.acme.io](https://staging.acme.io)', nodes: '2', ha: 'no', since: '2026-02-10' },
          { env: 'Dev', url: '[dev.acme.io](https://dev.acme.io)', nodes: '1', ha: 'no', since: '2026-01-20' }
        ],
        striped: true
      },
      {
        id: 'deploy',
        type: 'codeGroup',
        items: [
          { label: 'Helm', lang: 'bash', code: 'helm upgrade --install api ./charts/api \\\n  --namespace prod --values values/prod.yaml' },
          { label: 'kubectl', lang: 'bash', code: 'kubectl -n prod rollout restart deployment/api' }
        ]
      },
      {
        id: 'values',
        type: 'code',
        lang: 'yaml',
        title: 'values/prod.yaml',
        highlight: '3-4',
        lineNumbers: true,
        code: 'replicaCount: 3\nimage:\n  repository: europe-docker.pkg.dev/acme/api\n  tag: "2026.06.1"\nresources:\n  limits:\n    memory: 512Mi'
      },
      {
        id: 'howto',
        type: 'steps',
        steps: [
          { title: 'Log in', md: 'Run `gcloud auth login`.' },
          { title: 'Get the credentials', md: 'Run `gcloud container clusters get-credentials prod --region europe-west1`.' },
          { title: 'Check', md: 'Run `kubectl get nodes`: every node is **Ready**.' }
        ]
      },
      {
        id: 'more',
        type: 'tabs',
        tabs: [
          { label: 'Architecture', blocks: [{ id: 'flow', type: 'mermaid', source: 'flowchart LR\n  U[Users] --> LB[Load balancer]\n  LB --> I[Ingress]\n  I --> A[API]\n  A --> D[(Postgres)]', caption: 'Request path' }] },
          { label: 'Diagram image', blocks: [{ id: 'img', type: 'image', asset: 'architecture.png', caption: 'Architecture', width: 'small' }] }
        ]
      },
      { id: 'faq', type: 'details', summary: 'Why GKE rather than EKS?', blocks: [{ id: 'why', type: 'text', md: 'The data already lives in BigQuery.' }] },
      { id: 'sep', type: 'divider' },
      {
        id: 'related',
        type: 'cards',
        cards: [
          { title: 'VPN', md: 'Reach the private networks.', icon: 'shield-check', href: 'page:infra/reseau/vpn', color: 'teal' },
          { title: 'Grafana', md: 'Dashboards and alerts.', icon: 'gauge', href: 'https://grafana.acme.io', color: 'amber' }
        ]
      }
    ]
  })

  store.createPage('process', {
    title: 'Release',
    icon: 'rocket',
    description: 'From a merged pull request to production',
    blocks: [
      { id: 'intro', type: 'text', md: '## History\nHow the release process came to be.' },
      {
        id: 'history',
        type: 'timeline',
        view: 'vertical',
        lanes: [{ id: 'team', title: 'Team', color: 'pink' }],
        items: [
          { id: 'a', title: 'Manual releases', kind: 'event', start: '2024-03', status: 'done', description: 'Every Thursday, by hand.' },
          { id: 'b', title: 'CI pipelines', kind: 'phase', start: '2025-01', end: '2025-04', status: 'done', lane: 'team' },
          { id: 'c', title: 'Continuous delivery', kind: 'milestone', start: '2026-02-15', status: 'current', actor: 'Lead dev', link: 'page:infra/kubernetes' },
          { id: 'd', title: 'Canary releases', kind: 'event', start: '2026-09', status: 'planned' }
        ]
      }
    ]
  })

  store.createPage('process', {
    title: 'Production access',
    icon: 'key-round',
    description: 'Who grants what, in which order',
    blocks: [
      {
        id: 'access',
        type: 'timeline',
        view: 'vertical',
        items: [
          { id: 'request', title: 'Request the access', kind: 'event', actor: 'Developer', description: 'Open a ticket with the project and the role.' },
          { id: 'approve', title: 'Approve the request', kind: 'event', actor: 'Lead dev' },
          { id: 'grant', title: 'Grant the access', kind: 'milestone', actor: 'CTO', description: 'Valid for 90 days.' }
        ]
      }
    ]
  })

  store.createLink('liens-externes', { title: 'Grafana', url: 'https://grafana.acme.io', icon: 'gauge' })
  store.createLink('liens-externes', { title: 'Status page', url: 'https://status.acme.io', icon: 'activity' })
  writeFileSync(join(dir, 'theme.css'), '/* Workspace styles */\n')
}

/** The demo as a git repository, ready to be cloned by the app. */
export function seedDemoRepository(dir: string, remote: string): void {
  seedDemo(dir)
  const git = (...args: string[]): string => execFileSync('git', args, { cwd: dir, encoding: 'utf8' })
  git('init', '--initial-branch=master')
  git('add', '.')
  git('-c', 'user.name=Seed', '-c', 'user.email=seed@example.com', 'commit', '-m', 'Seed the documentation')
  git('remote', 'add', 'origin', remote)
  git('push', 'origin', 'master')
}
