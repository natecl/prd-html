---
name: prd-html
description: Render a finalized PRD (Product Requirements Document) into a self-contained interactive HTML view — rich formatting, collapsible sections, checkable Definition-of-Done items, auto-generated Mermaid diagrams, and an in-page chat panel backed by `claude -p` (the user's Claude Code subscription, no API key) for discussing and editing the PRD. Use after a PRD is finalized (the Feature Development Workflow invokes this automatically), or when the user asks to visualize / interact with / chat about a PRD as HTML.
---

# prd-html — interactive PRD viewer

Turns a PRD markdown file into a single self-contained `.html` the user can read,
visualize (with diagrams), and chat about — where the chat agent can also edit the
PRD. The chat runs on the user's **Claude Code subscription** via `claude -p`, not
the paid Anthropic API.

## When to run

- Automatically when a PRD is finalized in the Feature Development Workflow (see the
  global `~/.claude/CLAUDE.md`).
- When the user asks to "visualize the PRD", "make an HTML PRD", "chat about the PRD", etc.

## Files in this skill

- `template.html` — the chrome (marked.js + mermaid.js from CDN, chat panel). Has
  `{{TITLE}}`, `{{PRD_PATH}}`, `{{PRD_JSON}}` placeholders.
- `generate.js` — deterministic packer: PRD `.md` → self-contained `.html`. No deps.
- `serve.js` — local server (127.0.0.1) that serves the HTML and proxies the chat
  panel to `claude -p`. No deps.

## Steps to render a PRD

1. **Save the PRD** to `<repo>/docs/prd/<feature-slug>.md` (create `docs/prd/` if
   needed). Add `docs/prd/` to the repo's `.gitignore` if it isn't already (these
   are local working artifacts).

2. **Author the diagrams.** Append (or update) a `## Diagrams` section to the `.md`
   with **two** Mermaid fenced code blocks derived from the PRD content:
   - a **phase / vertical-slice dependency graph** (`graph TD`) showing the build order;
   - a **user-story map** (`graph LR`) from the PRD's user stories.
   Keep them small and accurate to the PRD. They live in the markdown so they render
   on `file://` and survive edits. Example:
   ````
   ## Diagrams

   ### Phase / vertical-slice graph
   ```mermaid
   graph TD
     P1[Phase 1: ...] --> P2[Phase 2: ...]
   ```

   ### User-story map
   ```mermaid
   graph LR
     U[User] --> S1[...]
   ```
   ````
   Tip: write Definition-of-Done items as GitHub task list items (`- [ ] ...`) so
   they render as interactive checkboxes.

3. **Generate the HTML:**
   ```
   node ~/.claude/skills/prd-html/generate.js <repo>/docs/prd/<slug>.md
   ```
   Writes `<repo>/docs/prd/<slug>.html`.

4. **Tell the user** how to use it:
   - Open the `.html` directly to read/visualize (chat disabled on `file://`).
   - To enable chat:
     ```
     node ~/.claude/skills/prd-html/serve.js <repo>/docs/prd/<slug>.html
     ```
     then open http://127.0.0.1:4317 . The chat can both discuss and **edit** the PRD.

## How the chat works (subscription, not API)

`serve.js` spawns `claude -p` per message — your Claude Code subscription, no
`ANTHROPIC_API_KEY`, no per-token billing. It runs from the nearest git repo root
with `--permission-mode acceptEdits` and `--allowedTools Read,Edit,Glob,Grep`
(no Bash). It maintains one conversation via `--session-id` / `--resume`, and seeds
the PRD's path into the system prompt so replies are PRD-aware. Responses **stream
token-by-token** to the panel over SSE. It loads only user settings
(`--setting-sources user`) so the host repo's hooks and CLAUDE.md don't fire inside
the chat agent (otherwise the repo's own Stop/`/learn` hooks bleed into replies).
After each turn the page re-fetches the PRD and re-renders, so edits show up live.

- Model = whatever Claude Code is configured to use (pass `--model` in `serve.js` to override).
- One server instance = one PRD = one chat session. Default port 4317 (`serve.js <html> [port]`).
- **Scope note:** `acceptEdits` auto-applies file edits; the system prompt restricts
  the agent to the PRD file, and Bash is disallowed, but Edit reach is technically the
  repo. Fine for a personal tool; don't point it at a repo you don't trust.

## Tests

`node --test` (from the skill dir) runs `test/generate.test.js` against
`test/sample.prd.md`.
