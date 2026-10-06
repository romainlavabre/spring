// Syntax highlighting with Shiki, light and dark colors at once (the CSS
// picks one), loaded on first use. The JavaScript regex engine avoids
// WebAssembly, which the content security policy forbids.
import type { HighlighterGeneric, ShikiTransformer } from 'shiki'

type Highlighter = HighlighterGeneric<string, string>

let highlighter: Promise<Highlighter> | null = null

const ALIASES: Record<string, string> = {
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  js: 'javascript',
  ts: 'typescript',
  yml: 'yaml',
  py: 'python',
  rb: 'ruby',
  kt: 'kotlin',
  tf: 'hcl',
  terraform: 'hcl',
  dockerfile: 'docker',
  'c#': 'csharp',
  cs: 'csharp',
  ps: 'powershell',
  ps1: 'powershell',
  md: 'markdown',
  txt: 'text',
  plain: 'text'
}

async function load(): Promise<Highlighter> {
  const [{ createHighlighter }, { createJavaScriptRegexEngine }] = await Promise.all([import('shiki'), import('shiki/engine/javascript')])
  return (await createHighlighter({
    themes: ['github-light', 'github-dark-dimmed'],
    langs: [],
    engine: createJavaScriptRegexEngine({ forgiving: true })
  })) as unknown as Highlighter
}

/** Line numbers of "2-4,8". */
export function parseLines(spec: string | undefined): Set<number> {
  const lines = new Set<number>()
  for (const part of (spec ?? '').split(',')) {
    const [from, to] = part.trim().split('-').map(Number)
    if (!from) continue
    for (let n = from; n <= (to || from); n++) lines.add(n)
  }
  return lines
}

export function normalizeLang(lang: string): string {
  const lower = lang.trim().toLowerCase()
  return ALIASES[lower] ?? lower
}

/** HTML of the highlighted code; plain when the language is unknown. */
export async function highlight(code: string, lang: string, highlighted?: string): Promise<string> {
  highlighter ??= load()
  const shiki = await highlighter
  const { bundledLanguages } = await import('shiki')
  let language = normalizeLang(lang)
  if (language !== 'text' && !shiki.getLoadedLanguages().includes(language)) {
    if (language in bundledLanguages) await shiki.loadLanguage(language as never)
    else language = 'text'
  }
  const marked = parseLines(highlighted)
  const transformer: ShikiTransformer = {
    line(node, line) {
      if (marked.has(line)) this.addClassToHast(node, 'highlighted')
    }
  }
  return shiki.codeToHtml(code, {
    lang: language,
    themes: { light: 'github-light', dark: 'github-dark-dimmed' },
    defaultColor: false,
    transformers: [transformer]
  })
}

/** Languages offered in the editor. */
export const COMMON_LANGUAGES = [
  'text',
  'bash',
  'powershell',
  'json',
  'yaml',
  'toml',
  'xml',
  'html',
  'css',
  'javascript',
  'typescript',
  'tsx',
  'java',
  'kotlin',
  'python',
  'go',
  'rust',
  'php',
  'ruby',
  'csharp',
  'sql',
  'graphql',
  'docker',
  'hcl',
  'nginx',
  'ini',
  'diff',
  'markdown'
]
