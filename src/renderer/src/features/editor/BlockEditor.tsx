// The form of each block type, shown under the block while it is edited.
import { ImagePlus } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  CALLOUT_VARIANTS,
  type Block,
  type CalloutBlock,
  type CardsBlock,
  type CodeBlock,
  type CodeGroupBlock,
  type DetailsBlock,
  type ImageBlock,
  type MermaidBlock,
  type StepsBlock,
  type TabsBlock,
  type TextBlock
} from '@core/blocks/schema'
import { api, errorMessage } from '../../lib/bridge'
import { toast } from '../../components/feedback'
import { CodeEditor } from '../../components/CodeEditor'
import { IconPicker } from '../../components/IconPicker'
import { Button } from '../../components/ui'
import { COMMON_LANGUAGES } from '../../doc/highlight'
import { useActiveRepo } from '../workspace/useWorkspace'
import { ColorField, Label, ListEditor, Row, SelectField, TextField, Toggle } from './fields'
import { TableEditor } from './TableEditor'
import { TimelineEditor } from './TimelineEditor'

export function BlockEditor<B extends Block>({ block, onChange }: { block: B; onChange: (block: B) => void }) {
  const set = onChange as (block: Block) => void
  switch (block.type) {
    case 'text':
      return <TextEditor block={block} onChange={set} />
    case 'callout':
      return <CalloutEditor block={block} onChange={set} />
    case 'code':
      return <CodeBlockEditor block={block} onChange={set} />
    case 'codeGroup':
      return <CodeGroupEditor block={block} onChange={set} />
    case 'table':
      return <TableEditor block={block} onChange={set} />
    case 'timeline':
      return <TimelineEditor block={block} onChange={set} />
    case 'steps':
      return <StepsEditor block={block} onChange={set} />
    case 'cards':
      return <CardsEditor block={block} onChange={set} />
    case 'tabs':
      return <TabsEditor block={block} onChange={set} />
    case 'details':
      return <DetailsEditor block={block} onChange={set} />
    case 'mermaid':
      return <MermaidEditor block={block} onChange={set} />
    case 'image':
      return <ImageEditor block={block} onChange={set} />
    case 'divider':
      return <p className="text-xs text-muted">A divider has nothing to set.</p>
  }
}

const MARKDOWN_HINT = '## Heading · **bold** · [link](page:section/page) · `code` · - list · :badge[Prod]{color=red} · :kbd[Ctrl+C]'

export function MarkdownField({ value, onChange, label, minHeight = 120, autoFocus }: { value: string; onChange: (md: string) => void; label?: string; minHeight?: number; autoFocus?: boolean }) {
  return (
    <div className="flex flex-col gap-1">
      {label && <Label>{label}</Label>}
      <CodeEditor value={value} onChange={onChange} language="markdown" minHeight={minHeight} placeholder="Write in Markdown…" autoFocus={autoFocus} label={label ?? 'Markdown'} />
    </div>
  )
}

function TextEditor({ block, onChange }: { block: TextBlock; onChange: (block: TextBlock) => void }) {
  return (
    <div className="flex flex-col gap-1.5">
      <MarkdownField value={block.md} onChange={(md) => onChange({ ...block, md })} minHeight={160} autoFocus />
      <p className="font-mono text-[10.5px] text-muted">{MARKDOWN_HINT}</p>
    </div>
  )
}

function CalloutEditor({ block, onChange }: { block: CalloutBlock; onChange: (block: CalloutBlock) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Row>
        <SelectField label="Kind" value={block.variant} options={CALLOUT_VARIANTS} onChange={(variant) => onChange({ ...block, variant })} width={140} />
        <TextField label="Title" value={block.title ?? ''} onChange={(title) => onChange({ ...block, title: title || undefined })} />
      </Row>
      <MarkdownField value={block.md} onChange={(md) => onChange({ ...block, md })} minHeight={90} autoFocus />
    </div>
  )
}

function LanguageField({ value, onChange }: { value: string; onChange: (lang: string) => void }) {
  return (
    <label className="flex w-40 flex-col gap-1">
      <Label>Language</Label>
      <input list="spring-languages" className="h-8 rounded-md border border-border bg-bg px-2 font-mono text-xs outline-none focus:border-accent" value={value} onChange={(e) => onChange(e.target.value)} aria-label="Language" />
      <datalist id="spring-languages">
        {COMMON_LANGUAGES.map((lang) => (
          <option key={lang} value={lang} />
        ))}
      </datalist>
    </label>
  )
}

function CodeBlockEditor({ block, onChange }: { block: CodeBlock; onChange: (block: CodeBlock) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <Row>
        <LanguageField value={block.lang} onChange={(lang) => onChange({ ...block, lang })} />
        <TextField label="Title (file name)" value={block.title ?? ''} onChange={(title) => onChange({ ...block, title: title || undefined })} mono />
        <TextField
          label="Highlight lines"
          value={block.highlight ?? ''}
          onChange={(highlight) => onChange({ ...block, highlight: highlight.trim() || undefined })}
          placeholder="2-4,8"
          width={130}
          mono
        />
        <Toggle label="Line numbers" checked={!!block.lineNumbers} onChange={(lineNumbers) => onChange({ ...block, lineNumbers: lineNumbers || undefined })} />
      </Row>
      <CodeEditor value={block.code} onChange={(code) => onChange({ ...block, code })} language={block.lang} minHeight={120} autoFocus label="Code" />
    </div>
  )
}

function CodeGroupEditor({ block, onChange }: { block: CodeGroupBlock; onChange: (block: CodeGroupBlock) => void }) {
  return (
    <ListEditor
      items={block.items}
      min={1}
      addLabel="Add a variant"
      onChange={(items) => onChange({ ...block, items })}
      create={() => ({ label: 'New', lang: 'bash', code: '' })}
      render={(item, update) => (
        <div className="flex flex-col gap-2">
          <Row>
            <TextField label="Tab" value={item.label} onChange={(label) => update({ ...item, label })} width={180} />
            <LanguageField value={item.lang} onChange={(lang) => update({ ...item, lang })} />
          </Row>
          <CodeEditor value={item.code} onChange={(code) => update({ ...item, code })} language={item.lang} minHeight={70} label={`Code ${item.label}`} />
        </div>
      )}
    />
  )
}

function StepsEditor({ block, onChange }: { block: StepsBlock; onChange: (block: StepsBlock) => void }) {
  return (
    <ListEditor
      items={block.steps}
      min={1}
      addLabel="Add a step"
      onChange={(steps) => onChange({ ...block, steps })}
      create={() => ({ title: '', md: '' })}
      render={(step, update, i) => (
        <div className="flex flex-col gap-2">
          <TextField label={`Step ${i + 1}`} value={step.title} onChange={(title) => update({ ...step, title })} />
          <MarkdownField value={step.md} onChange={(md) => update({ ...step, md })} minHeight={60} />
        </div>
      )}
    />
  )
}

function CardsEditor({ block, onChange }: { block: CardsBlock; onChange: (block: CardsBlock) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <SelectField
        label="Columns"
        value={String(block.columns ?? 'auto')}
        options={['auto', '2', '3', '4']}
        onChange={(columns) => onChange({ ...block, columns: columns === 'auto' ? undefined : (Number(columns) as 2 | 3 | 4) })}
        width={120}
      />
      <ListEditor<CardsBlock['cards'][number]>
        items={block.cards}
        min={1}
        addLabel="Add a card"
        onChange={(cards) => onChange({ ...block, cards })}
        create={() => ({ title: 'Card' })}
        render={(card, update) => (
          <div className="flex flex-col gap-2">
            <Row>
              <TextField label="Title" value={card.title} onChange={(title) => update({ ...card, title })} />
              <TextField label="Link" value={card.href ?? ''} onChange={(href) => update({ ...card, href: href || undefined })} placeholder="page:infra/k8s or https://…" mono />
            </Row>
            <ColorField value={card.color} onChange={(color) => update({ ...card, color })} />
            <details className="text-xs">
              <summary className="cursor-pointer text-muted">Icon {card.icon ? `(${card.icon})` : ''}</summary>
              <div className="mt-2">
                <IconPicker value={card.icon ?? ''} onChange={(icon) => update({ ...card, icon: icon || undefined })} />
              </div>
            </details>
            <MarkdownField value={card.md ?? ''} onChange={(md) => update({ ...card, md: md || undefined })} minHeight={50} />
          </div>
        )}
      />
    </div>
  )
}

function TabsEditor({ block, onChange }: { block: TabsBlock; onChange: (block: TabsBlock) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <p className="text-xs text-muted">Name the tabs here; add blocks to a tab from the preview above, with the + inside it.</p>
      <ListEditor
        items={block.tabs}
        min={1}
        addLabel="Add a tab"
        onChange={(tabs) => onChange({ ...block, tabs })}
        create={() => ({ label: `Tab ${block.tabs.length + 1}`, blocks: [] })}
        render={(tab, update) => (
          <Row>
            <TextField label="Tab" value={tab.label} onChange={(label) => update({ ...tab, label })} />
            <span className="pb-2 text-xs text-muted">{tab.blocks.length} blocks</span>
          </Row>
        )}
      />
    </div>
  )
}

function DetailsEditor({ block, onChange }: { block: DetailsBlock; onChange: (block: DetailsBlock) => void }) {
  return (
    <div className="flex flex-col gap-2">
      <Row>
        <TextField label="Summary" value={block.summary} onChange={(summary) => onChange({ ...block, summary })} />
        <Toggle label="Open by default" checked={!!block.open} onChange={(open) => onChange({ ...block, open: open || undefined })} />
      </Row>
      <p className="text-xs text-muted">Add blocks inside from the preview above, with the + inside it.</p>
    </div>
  )
}

function MermaidEditor({ block, onChange }: { block: MermaidBlock; onChange: (block: MermaidBlock) => void }) {
  return (
    <div className="flex flex-col gap-3">
      <CodeEditor value={block.source} onChange={(source) => onChange({ ...block, source })} language="text" minHeight={140} autoFocus label="Diagram source" />
      <Row>
        <TextField label="Caption" value={block.caption ?? ''} onChange={(caption) => onChange({ ...block, caption: caption || undefined })} />
        <a className="pb-2 text-xs text-accent hover:underline" href="https://mermaid.js.org/intro/syntax-reference.html" target="_blank" rel="noreferrer">
          Mermaid syntax
        </a>
      </Row>
    </div>
  )
}

function ImageEditor({ block, onChange }: { block: ImageBlock; onChange: (block: ImageBlock) => void }) {
  const repo = useActiveRepo()
  const { data: assets = [], refetch } = useQuery({ queryKey: ['assets', repo?.id], queryFn: () => api.assets.list() })
  const pick = async (): Promise<void> => {
    try {
      const asset = await api.assets.pick()
      if (asset) {
        await refetch()
        onChange({ ...block, asset })
      }
    } catch (error) {
      toast(errorMessage(error), 'error')
    }
  }
  return (
    <div className="flex flex-col gap-3">
      <Row>
        <SelectField
          label="Image"
          value={block.asset}
          options={[{ value: '', label: assets.length ? 'Choose an image…' : 'No image yet' }, ...assets.map((asset) => ({ value: asset, label: asset }))]}
          onChange={(asset) => onChange({ ...block, asset })}
          width={260}
        />
        <Button size="sm" icon={<ImagePlus className="size-3.5" />} onClick={() => void pick()} className="mb-0.5">
          Add an image…
        </Button>
        <SelectField
          label="Width"
          value={block.width ?? 'full'}
          options={['small', 'medium', 'full']}
          onChange={(width) => onChange({ ...block, width: width === 'full' ? undefined : width })}
          width={110}
        />
      </Row>
      <Row>
        <TextField label="Caption" value={block.caption ?? ''} onChange={(caption) => onChange({ ...block, caption: caption || undefined })} />
        <TextField label="Alternative text" value={block.alt ?? ''} onChange={(alt) => onChange({ ...block, alt: alt || undefined })} />
      </Row>
      <p className="text-xs text-muted">Tip: paste an image (Ctrl+V) anywhere in the page to add it.</p>
    </div>
  )
}
