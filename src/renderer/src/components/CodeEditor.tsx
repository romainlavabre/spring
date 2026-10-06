// CodeMirror 6 editor: Markdown, JSON or any language of the code blocks,
// loaded on demand. Follows the theme of the app.
import { indentWithTab } from '@codemirror/commands'
import { LanguageDescription } from '@codemirror/language'
import { languages } from '@codemirror/language-data'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { Compartment, EditorState, type Extension } from '@codemirror/state'
import { oneDark } from '@codemirror/theme-one-dark'
import { EditorView, keymap, placeholder as placeholderExtension } from '@codemirror/view'
import { basicSetup } from 'codemirror'
import { useEffect, useRef } from 'react'
import { useApp } from '../store'
import { cn } from './ui'

const LANGUAGE_NAMES: Record<string, string> = {
  bash: 'shell',
  sh: 'shell',
  ts: 'typescript',
  js: 'javascript',
  yml: 'yaml',
  docker: 'dockerfile',
  hcl: 'properties',
  csharp: 'c#',
  py: 'python'
}

async function languageExtension(language: string): Promise<Extension> {
  if (language === 'markdown') return markdown({ base: markdownLanguage, codeLanguages: languages })
  const name = LANGUAGE_NAMES[language] ?? language
  const description = LanguageDescription.matchLanguageName(languages, name, true)
  return description ? await description.load() : []
}

const lightTheme = EditorView.theme({
  '&': { backgroundColor: 'var(--panel)', color: 'var(--fg)' },
  '.cm-gutters': { backgroundColor: 'var(--panel-2)', color: 'var(--muted)', border: 'none' },
  '.cm-activeLine': { backgroundColor: 'rgba(0,0,0,0.03)' },
  '.cm-activeLineGutter': { backgroundColor: 'rgba(0,0,0,0.05)' }
})

const baseTheme = EditorView.theme({
  '.cm-content': { padding: '8px 0' },
  '.cm-line': { padding: '0 10px' }
})

export function CodeEditor({
  value,
  onChange,
  language = 'markdown',
  minHeight = 80,
  maxHeight = 520,
  placeholder,
  autoFocus,
  lineNumbers = language !== 'markdown',
  className,
  label
}: {
  value: string
  onChange: (value: string) => void
  language?: string
  minHeight?: number
  maxHeight?: number
  placeholder?: string
  autoFocus?: boolean
  lineNumbers?: boolean
  className?: string
  label?: string
}) {
  const host = useRef<HTMLDivElement>(null)
  const view = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const languageSlot = useRef(new Compartment())
  const themeSlot = useRef(new Compartment())
  const theme = useApp((s) => s.theme)
  onChangeRef.current = onChange

  useEffect(() => {
    if (!host.current) return
    const editor = new EditorView({
      parent: host.current,
      state: EditorState.create({
        doc: value,
        extensions: [
          basicSetup,
          keymap.of([indentWithTab]),
          baseTheme,
          EditorView.lineWrapping,
          EditorView.theme({
            '&': { minHeight: `${minHeight}px`, maxHeight: `${maxHeight}px` },
            '.cm-scroller': { overflow: 'auto' },
            ...(lineNumbers ? {} : { '.cm-gutters': { display: 'none' } })
          }),
          placeholder ? placeholderExtension(placeholder) : [],
          languageSlot.current.of([]),
          themeSlot.current.of(useApp.getState().theme === 'dark' ? oneDark : lightTheme),
          EditorView.contentAttributes.of(label ? { 'aria-label': label } : {}),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) onChangeRef.current(update.state.doc.toString())
          })
        ]
      })
    })
    view.current = editor
    if (autoFocus) editor.focus()
    return () => {
      editor.destroy()
      view.current = null
    }
    // The editor is created once; value, language and theme follow below.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    let alive = true
    void languageExtension(language).then((extension) => {
      if (alive) view.current?.dispatch({ effects: languageSlot.current.reconfigure(extension) })
    })
    return () => {
      alive = false
    }
  }, [language])

  useEffect(() => {
    view.current?.dispatch({ effects: themeSlot.current.reconfigure(theme === 'dark' ? oneDark : lightTheme) })
  }, [theme])

  useEffect(() => {
    const editor = view.current
    if (!editor) return
    const current = editor.state.doc.toString()
    if (current !== value) editor.dispatch({ changes: { from: 0, to: current.length, insert: value } })
  }, [value])

  return <div ref={host} className={cn('cm-host selectable', className)} data-language={language} />
}
