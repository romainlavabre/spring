# Workspaces and git sync

A workspace is a git repository of documentation. Use one per team, client or product: there is no limit, and each one
syncs with its own remote.

## Add a workspace

Open the workspace menu at the top of the sidebar, then **Add workspace…**:

- **Create new**: an empty workspace in the data folder of the app (or a folder you choose). Link it to a remote later
  with **Set remote**.
- **Clone a repository**: the documentation your team shares. SSH URLs use your SSH agent, HTTPS URLs your git credential
  helper; the app never asks for a password.
- **Open a folder**: an existing git repository, or any folder.

**Switch to** another workspace from the same menu. The app remembers the last page you read in each one.

## What is in a workspace

```
spring.json                         name of the workspace
theme.css                           optional: CSS applied over the theme, in the app and the PDFs
assets/                             images
sections/
  infra/
    section.yaml                    title, description, icon, order
    kubernetes.page.json            a page: title, description, icon and its blocks
    reseau/                         a sub-section, any depth
      section.yaml
      vpn.page.json
  liens-externes/
    section.yaml
    grafana.link.yaml               an external link of the menu: title and URL
  home.page.json                    pages and links may also sit at the root of the menu
```

Every page is validated when it is written: an id used twice, a timeline item in an unknown lane, a phase ending before
it starts, a link to a page that does not exist or a missing image is refused, with the place of the mistake. Run
`spring validate` in a workspace to check every page, in a CI job for example.

## Sync

- **Every change is committed** with a message saying what changed ("Add page "VPN"", "Move "kubernetes" to
  "platform""), then **pushed** a moment later.
- Files changed **outside the app** (by Claude through MCP, or in an editor) show up at once, and are committed and
  pushed a few seconds after the last change.
- The app **pulls** when you switch to a workspace and every 5 minutes; the **Sync** button does it at once.
- Workspaces always live on the `master` branch: a clone whose default branch is `main` is moved to `master`.
- **Conflicts**: when a file was changed both here and on the remote, the sync stops and **Resolve** lists the files.
  Keep yours or theirs, file by file; nothing is lost until you choose.

## Undo

Every change is a commit: `git log` in the workspace folder shows the history, and `git revert` or
`git checkout <commit> -- <file>` brings back what was deleted.
