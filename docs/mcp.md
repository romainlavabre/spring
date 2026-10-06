# MCP server

`spring mcp` lets an AI assistant, such as Claude, write and maintain your documentation: read the menu and the pages,
create sections, pages and external links, and edit pages block by block. Ask it to "document the deployment of this
repository in the Infra section, with a timeline of the migration and a table of the environments", then read the result
in the app.

## Install

Claude Code:

```bash
claude mcp add spring -- spring mcp
```

Claude Desktop, in `claude_desktop_config.json`:

```json
{ "mcpServers": { "spring": { "command": "spring", "args": ["mcp"] } } }
```

The server serves the workspaces of the app over stdio, the active one by default. To serve one workspace folder only:

```bash
spring mcp --workspace <folder>
```

Without the app installed, the standalone CLI of each release runs it with Node 20 or later:
`node spring-cli-X.Y.Z.cjs mcp --workspace <folder>`.

## Tools

| Group | Tools |
|---|---|
| Reference | `get_reference`: the conventions, the JSON Schema of every block (generated from the schemas the app validates with) and a complete example page. The server asks the assistant to read it first. |
| Read | `list_workspaces`, `get_tree`, `get_page` (with the ids of the blocks), `search` |
| Sections and links | `create_section`, `update_section`, `create_link`, `update_link` |
| Pages | `create_page` (with its blocks), `update_page` (title, description, icon; all blocks at once if needed) |
| Blocks | `add_block` (after or before a block, inside tabs or a collapsible block, or at the end), `update_block` (replace, or change some fields), `move_block`, `delete_block` |
| Organise | `move_item` (links to moved pages are rewritten), `delete_item`, `add_asset` (copies a local image into the workspace) |
| Check | `validate_page` |

## Rules

- **Every write is validated** against the workspace: a mistake is refused with its place (for example
  `blocks[2].items[4].end: Ends (2026-01) before it starts (2026-05)`), and nothing is written. The assistant fixes it
  and tries again.
- **Blocks have ids**: the assistant edits one block without rewriting the page, and ids it leaves out are generated.
- **Changes show at once** in the app, which watches the workspace, and are committed and pushed a few seconds later.
  Git keeps the history, so anything can be undone.
