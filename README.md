# prd-html

A [Claude Code](https://claude.com/claude-code) skill that renders a finalized
**PRD** (Product Requirements Document) into a single, self-contained interactive
HTML view — rich formatting, collapsible sections, checkable Definition-of-Done
items, auto-generated **Mermaid** diagrams, and an in-page **chat panel** for
discussing *and editing* the PRD.

The chat is backed by `claude -p` — your Claude Code **subscription**, not the
metered Anthropic API. No `ANTHROPIC_API_KEY`, no per-token billing.

## What you get

- **One self-contained `.html` per PRD** — open it directly to read/visualize.
- **Diagrams** — a phase / vertical-slice dependency graph and a user-story map,
  authored from the PRD content as Mermaid blocks in the markdown.
- **Interactive doc** — collapsible `##`/`###` sections and checkable
  Definition-of-Done items (persisted in `localStorage`).
- **Chat that can edit** — run the bundled server and the page gets a chat panel.
  Ask questions or request edits; the agent edits the PRD `.md` directly and the
  page re-renders live.

## Install

Clone into your Claude Code skills directory:

```sh
git clone https://github.com/natecl/prd-html.git ~/.claude/skills/prd-html
```

That's it — `/prd-html` is now available in Claude Code. (No dependencies; pure Node
built-ins + two CDN scripts for rendering.)

## Use

Point the generator at a PRD markdown file:

```sh
node ~/.claude/skills/prd-html/generate.js path/to/prd.md
# → path/to/prd.html
```

Open `prd.html` to read and visualize. To enable the chat panel:

```sh
node ~/.claude/skills/prd-html/serve.js path/to/prd.html
# → http://127.0.0.1:4317
```

Or just invoke `/prd-html` inside Claude Code and let it author the diagrams,
generate, and tell you the run command.

## How the chat works

`serve.js` spawns `claude -p` per message (your subscription). It runs from the
nearest git repo root with:

- `--permission-mode acceptEdits --allowedTools Read,Edit,Glob,Grep` (no Bash),
- `--setting-sources user` so the host repo's hooks/CLAUDE.md don't bleed into the
  chat agent,
- one conversation maintained via `--session-id` / `--resume`,
- responses streamed token-by-token to the panel over SSE.

The PRD's path is seeded into the system prompt, so replies are PRD-aware and edits
land on the right file.

## Security notes

This is a **local, single-user** tool. The server binds `127.0.0.1` and the `/chat`
endpoint rejects cross-site / DNS-rebinding requests via a Host+Origin allowlist.

- The chat agent runs with `acceptEdits` and the `Edit` tool — its reach is the repo
  root, constrained by the system prompt to the PRD file. Don't point it at a repo
  you don't trust.
- The viewer renders PRD markdown without a sanitizer — fine for self-authored PRDs;
  add one if you ever render untrusted content.

## Files

| File | Purpose |
|---|---|
| `SKILL.md` | The Claude Code skill definition + instructions. |
| `template.html` | The viewer chrome (marked.js + mermaid.js, chat UI). |
| `generate.js` | Deterministic packer: PRD `.md` → self-contained `.html`. |
| `serve.js` | Localhost server + `claude -p` chat proxy. |
| `test/` | `node --test` suite for `generate.js`. |

## Tests

```sh
cd ~/.claude/skills/prd-html && node --test
```

## License

MIT — see [LICENSE](LICENSE).
