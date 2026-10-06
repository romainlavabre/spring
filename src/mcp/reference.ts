// What an assistant needs to write good pages: the conventions, the JSON
// Schema of every block (generated from the zod schemas the app validates
// with) and a complete example.
import { z } from 'zod'
import { BLOCK_SCHEMAS, BLOCK_TYPES, COLORS, pageSchema, type BlockType } from '../core/blocks/schema'
import { BLOCK_LABELS, EXAMPLE_PAGE } from '../core/blocks/templates'
import { stableJson } from '../core/layout/json'

export const REFERENCE_TOPICS = ['overview', 'blocks', 'example', ...BLOCK_TYPES] as const
export type ReferenceTopic = (typeof REFERENCE_TOPICS)[number]

const OVERVIEW = `# Writing Spring documentation

A workspace is a git repository of documentation, shown as a menu:
- sections (folders) hold pages, sub-sections and external links, at any depth;
- the root of the menu may hold pages and links too;
- paths are slugs joined by "/", e.g. "infra" (a section), "infra/kubernetes" (a page), "links/grafana" (a link).
  The parent of a root item is "".

A page is a title, an optional description and icon, and a list of typed blocks.
Every block has an "id" (lowercase letters, digits, dashes; unique in the page) and a "type".
Leave the id out when adding a block: one is generated and returned.
Edit pages block by block (add_block, update_block, move_block, delete_block): get_page shows the ids.

Block types:
${BLOCK_TYPES.map((type) => `- ${type}: ${BLOCK_LABELS[type].hint}`).join('\n')}

Conventions:
- Markdown (GitHub-flavored) is used in text, callout, steps, cards, timeline descriptions and "md" table columns.
- Link to another page with [label](page:section/page) or [label](page:section/page#heading-anchor);
  links to missing pages are refused. External links are plain https:// URLs.
- Inline extras in Markdown: :badge[Prod]{color=red}, :kbd[Ctrl+C].
- Colors are named: ${COLORS.join(', ')}.
- Icons are Lucide names in kebab-case: server, database, git-branch, shield-check, rocket, book-open, users, cloud…
- Dates are YYYY, YYYY-MM or YYYY-MM-DD. Timeline phases have start and end; milestones and events only a start. The start is optional: undated items keep the order they are written in a vertical timeline (dated ones are sorted by date only when every item has a date), and a Gantt chart lists them under the chart.
- Images: add_asset copies a local image into the workspace, then an image block shows it.
- Headings ## and ### of text blocks build the table of contents of the page: start sections of a page with them.

Make it beautiful and scannable: a short intro, then headings; tables for comparisons and inventories;
a timeline for history or plans (gantt with lanes for schedules); steps for procedures; code blocks
with a title for commands and files; callouts for warnings; cards for links to related pages and tools.

Changes are written to the workspace folder: the Spring app shows them at once and commits them at its next sync.

Topics of get_reference: ${REFERENCE_TOPICS.join(', ')}.`

function jsonSchema(schema: z.ZodType): unknown {
  return z.toJSONSchema(schema, { io: 'input', unrepresentable: 'any' })
}

export function reference(topic: ReferenceTopic = 'overview'): string {
  if (topic === 'overview') return OVERVIEW
  if (topic === 'example') return `A complete page (JSON, as create_page takes its blocks):\n\n${stableJson(EXAMPLE_PAGE)}`
  if (topic === 'blocks') {
    return `JSON Schema of a page, every block type included:\n\n${JSON.stringify(jsonSchema(pageSchema), null, 1)}`
  }
  const type = topic as BlockType
  const example = EXAMPLE_PAGE.blocks.find((b) => b.type === type)
  return [
    `# ${type} — ${BLOCK_LABELS[type].hint}`,
    '',
    'JSON Schema:',
    JSON.stringify(jsonSchema(BLOCK_SCHEMAS[type]), null, 1),
    ...(example ? ['', 'Example:', stableJson(example)] : [])
  ].join('\n')
}
