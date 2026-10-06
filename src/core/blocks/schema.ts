// Pages are lists of typed blocks. These zod schemas are the single source of
// truth: the app's editors, the MCP server (and the JSON Schema it serves to
// assistants), the validation and the tests all use them.
import { z } from 'zod'

export const BLOCK_ID = /^[a-z0-9][a-z0-9-]{0,39}$/

/** Named colors: the theme turns them into tints that read well in light and dark. */
export const COLORS = ['red', 'orange', 'amber', 'green', 'teal', 'blue', 'violet', 'pink', 'gray'] as const
export type Color = (typeof COLORS)[number]

/** YYYY, YYYY-MM or YYYY-MM-DD. */
export const DATE_PATTERN = /^\d{4}(-(0[1-9]|1[0-2])(-(0[1-9]|[12]\d|3[01]))?)?$/

const blockId = z
  .string()
  .regex(BLOCK_ID, 'Block ids are 1-40 lowercase letters, digits and dashes, e.g. "intro" or "b-3k9x"')
  .describe('Unique in the page, stable: MCP edits and links (#id) target blocks by id')
const markdown = z.string().describe('GitHub-flavored Markdown; links to pages are written [text](page:section/page)')
const color = z.enum(COLORS)
const date = z.string().regex(DATE_PATTERN, 'Dates are YYYY, YYYY-MM or YYYY-MM-DD')

// ---------------------------------------------------------------- leaf blocks

export const textBlockSchema = z
  .object({ id: blockId, type: z.literal('text'), md: markdown })
  .describe('Prose: headings (## and ### feed the table of contents), lists, quotes, links, inline code, :badge[text]{color=green}, :kbd[Ctrl+C]')

export const CALLOUT_VARIANTS = ['info', 'tip', 'success', 'warning', 'danger', 'note'] as const
export const calloutBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('callout'),
    variant: z.enum(CALLOUT_VARIANTS).default('info'),
    title: z.string().optional(),
    md: markdown
  })
  .describe('A highlighted box: info, tip, success, warning, danger or note')

export const codeBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('code'),
    lang: z.string().default('text').describe('Language for highlighting: bash, ts, java, yaml, json, sql, dockerfile, hcl…'),
    title: z.string().optional().describe('File name or caption shown above the code'),
    code: z.string(),
    highlight: z
      .string()
      .regex(/^\s*(\d+(-\d+)?)(\s*,\s*\d+(-\d+)?)*\s*$/, 'Lines to highlight, e.g. "3" or "2-4,8"')
      .optional(),
    lineNumbers: z.boolean().optional()
  })
  .describe('Code with syntax highlighting and a copy button')

export const codeGroupBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('codeGroup'),
    items: z
      .array(z.object({ label: z.string().min(1), lang: z.string().default('text'), code: z.string() }))
      .min(1)
      .describe('One tab per variant, e.g. the same command for bash, PowerShell and Docker')
  })
  .describe('Several code snippets shown as tabs')

export const TABLE_COLUMN_TYPES = ['text', 'md', 'number', 'date', 'badge', 'code', 'check'] as const
export const tableBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('table'),
    caption: z.string().optional(),
    columns: z
      .array(
        z.object({
          id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/, 'Column ids are letters, digits, dashes and underscores'),
          title: z.string(),
          type: z.enum(TABLE_COLUMN_TYPES).default('text').describe('md renders inline Markdown; check renders yes/true/x/1 as ✓'),
          align: z.enum(['left', 'center', 'right']).optional(),
          width: z.number().int().min(40).max(800).optional().describe('Pixels'),
          colors: z.record(z.string(), color).optional().describe('Badge columns: color of each value, e.g. {"Prod":"red"}')
        })
      )
      .min(1),
    rows: z
      .array(z.record(z.string(), z.string()))
      .describe('One object per row, keyed by column id; values are strings (numbers too)'),
    headerGroups: z
      .array(z.object({ title: z.string(), span: z.number().int().min(1) }))
      .optional()
      .describe('A header row above the column titles; spans add up to the number of columns'),
    striped: z.boolean().optional(),
    compact: z.boolean().optional()
  })
  .describe('A table with typed columns')

export const TIMELINE_STATUSES = ['done', 'current', 'planned', 'blocked'] as const
export const TIMELINE_KINDS = ['phase', 'milestone', 'event'] as const
export const timelineBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('timeline'),
    view: z.enum(['vertical', 'gantt']).default('vertical').describe('vertical: a story, newest last; gantt: a schedule with lanes'),
    title: z.string().optional(),
    lanes: z
      .array(z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/), title: z.string(), color: color.optional() }))
      .default([])
      .describe('Rows of the Gantt view (teams, streams); items without lane go to a row of their own'),
    items: z
      .array(
        z.object({
          id: z.string().regex(/^[A-Za-z0-9_-]{1,40}$/),
          title: z.string().min(1),
          kind: z.enum(TIMELINE_KINDS).default('event').describe('phase: has an end; milestone: a point, a diamond in Gantt; event: a point'),
          start: date
            .optional()
            .describe('Optional. Undated items keep their place in a vertical timeline; a Gantt chart lists them under the chart'),
          end: date.optional().describe('Phases only, with a start; inclusive'),
          lane: z.string().optional(),
          actor: z.string().optional().describe('Optional: who does it, e.g. "CTO" or "Lead dev"; for the steps of a procedure'),
          status: z
            .enum(TIMELINE_STATUSES)
            .optional()
            .describe('Optional: progress of the item; leave it out where progress means nothing, as in a procedure'),
          description: markdown.optional(),
          link: z.string().optional().describe('https://… or page:section/page'),
          dependsOn: z.array(z.string()).optional().describe('Ids of items that must finish first: drawn as arrows in Gantt')
        })
      )
      .min(1),
    today: z.boolean().optional().describe('Draw a line at the current date (default true)')
  })
  .describe('A timeline: vertical story or Gantt schedule with lanes, phases, milestones and dependencies')

export const stepsBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('steps'),
    steps: z.array(z.object({ title: z.string().min(1), md: markdown.default('') })).min(1)
  })
  .describe('A numbered procedure')

export const cardsBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('cards'),
    columns: z.union([z.literal(2), z.literal(3), z.literal(4)]).optional(),
    cards: z
      .array(
        z.object({
          title: z.string().min(1),
          md: markdown.optional(),
          icon: z.string().optional().describe('Lucide icon name in kebab-case, e.g. server, git-branch, shield-check'),
          href: z.string().optional().describe('https://… or page:section/page'),
          color: color.optional()
        })
      )
      .min(1)
  })
  .describe('A grid of cards, often links to pages or tools')

export const mermaidBlockSchema = z
  .object({ id: blockId, type: z.literal('mermaid'), source: z.string().min(1), caption: z.string().optional() })
  .describe('A Mermaid diagram: flowchart, sequenceDiagram, erDiagram, classDiagram, stateDiagram…')

export const imageBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('image'),
    asset: z.string().min(1).describe('File name in the assets folder of the workspace (add_asset)'),
    alt: z.string().optional(),
    caption: z.string().optional(),
    width: z.enum(['small', 'medium', 'full']).optional()
  })
  .describe('An image of the workspace assets')

export const dividerBlockSchema = z.object({ id: blockId, type: z.literal('divider') }).describe('A horizontal separator')

// ------------------------------------------------------------ container blocks

export interface TabsBlock {
  id: string
  type: 'tabs'
  tabs: { label: string; blocks: Block[] }[]
}

export interface DetailsBlock {
  id: string
  type: 'details'
  summary: string
  open?: boolean
  blocks: Block[]
}

export type TextBlock = z.infer<typeof textBlockSchema>
export type CalloutBlock = z.infer<typeof calloutBlockSchema>
export type CodeBlock = z.infer<typeof codeBlockSchema>
export type CodeGroupBlock = z.infer<typeof codeGroupBlockSchema>
export type TableBlock = z.infer<typeof tableBlockSchema>
export type TimelineBlock = z.infer<typeof timelineBlockSchema>
export type StepsBlock = z.infer<typeof stepsBlockSchema>
export type CardsBlock = z.infer<typeof cardsBlockSchema>
export type MermaidBlock = z.infer<typeof mermaidBlockSchema>
export type ImageBlock = z.infer<typeof imageBlockSchema>
export type DividerBlock = z.infer<typeof dividerBlockSchema>

export type Block =
  | TextBlock
  | CalloutBlock
  | CodeBlock
  | CodeGroupBlock
  | TableBlock
  | TimelineBlock
  | StepsBlock
  | CardsBlock
  | MermaidBlock
  | ImageBlock
  | DividerBlock
  | TabsBlock
  | DetailsBlock

export type BlockType = Block['type']

const blocksList: z.ZodType<Block[]> = z.lazy(() => z.array(blockSchema))

export const tabsBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('tabs'),
    tabs: z.array(z.object({ label: z.string().min(1), blocks: blocksList })).min(1)
  })
  .describe('Tabs, each holding its own blocks')

export const detailsBlockSchema = z
  .object({
    id: blockId,
    type: z.literal('details'),
    summary: z.string().min(1),
    open: z.boolean().optional(),
    blocks: blocksList
  })
  .describe('A collapsible section holding blocks')

export const BLOCK_SCHEMAS = {
  text: textBlockSchema,
  callout: calloutBlockSchema,
  code: codeBlockSchema,
  codeGroup: codeGroupBlockSchema,
  table: tableBlockSchema,
  timeline: timelineBlockSchema,
  steps: stepsBlockSchema,
  cards: cardsBlockSchema,
  mermaid: mermaidBlockSchema,
  image: imageBlockSchema,
  divider: dividerBlockSchema,
  tabs: tabsBlockSchema,
  details: detailsBlockSchema
} as const

export const BLOCK_TYPES = Object.keys(BLOCK_SCHEMAS) as BlockType[]

export const blockSchema: z.ZodType<Block> = z.discriminatedUnion('type', [
  textBlockSchema,
  calloutBlockSchema,
  codeBlockSchema,
  codeGroupBlockSchema,
  tableBlockSchema,
  timelineBlockSchema,
  stepsBlockSchema,
  cardsBlockSchema,
  mermaidBlockSchema,
  imageBlockSchema,
  dividerBlockSchema,
  tabsBlockSchema,
  detailsBlockSchema
]) as unknown as z.ZodType<Block>

// ---------------------------------------------------------- pages and the menu

export const pageSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(500).optional().describe('One line under the title, also shown in search results'),
  icon: z.string().optional().describe('Lucide icon name in kebab-case'),
  order: z.number().optional(),
  blocks: z.array(blockSchema)
})
export type Page = z.infer<typeof pageSchema>

export const sectionSchema = z.object({
  title: z.string().trim().min(1).max(200),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
  order: z.number().optional()
})
export type Section = z.infer<typeof sectionSchema>

export const linkSchema = z.object({
  title: z.string().trim().min(1).max(200),
  url: z.string().regex(/^(https?|mailto):/i, 'External links start with https://, http:// or mailto:'),
  description: z.string().max(500).optional(),
  icon: z.string().optional(),
  order: z.number().optional()
})
export type Link = z.infer<typeof linkSchema>
