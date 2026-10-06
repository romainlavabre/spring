// The menu of a workspace: sections holding pages, sub-sections and external links.

/** Paths are relative to the sections folder, without extension: "infra/kubernetes". */
export type TreeNode = SectionNode | PageNode | LinkNode

export interface SectionNode {
  kind: 'section'
  path: string
  title: string
  description?: string
  icon?: string
  order: number
  children: TreeNode[]
}

export interface PageNode {
  kind: 'page'
  path: string
  title: string
  description?: string
  icon?: string
  order: number
}

export interface LinkNode {
  kind: 'link'
  path: string
  title: string
  url: string
  description?: string
  icon?: string
  order: number
}

export function parentPath(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : ''
}

export function baseName(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

export function joinPath(parent: string, name: string): string {
  return parent ? `${parent}/${name}` : name
}

/** Every node, depth first. */
export function flattenTree(nodes: TreeNode[]): TreeNode[] {
  return nodes.flatMap((node) => (node.kind === 'section' ? [node, ...flattenTree(node.children)] : [node]))
}

export function findNode(nodes: TreeNode[], path: string): TreeNode | null {
  return flattenTree(nodes).find((node) => node.path === path) ?? null
}

/** Pages in menu order: the first one is the home page. */
export function pagesInOrder(nodes: TreeNode[]): PageNode[] {
  return flattenTree(nodes).filter((node): node is PageNode => node.kind === 'page')
}

/** Titles of the sections above a node, for breadcrumbs. */
export function breadcrumbs(nodes: TreeNode[], path: string): SectionNode[] {
  const trail: SectionNode[] = []
  let level = nodes
  for (const part of path.split('/').slice(0, -1)) {
    const section = level.find((n): n is SectionNode => n.kind === 'section' && n.path.endsWith(part) && baseName(n.path) === part)
    if (!section) break
    trail.push(section)
    level = section.children
  }
  return trail
}
