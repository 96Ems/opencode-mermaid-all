# opencode-mermaid-all

Render **every** Mermaid diagram type in the [OpenCode](https://opencode.ai) v2 TUI.

OpenCode ships a built-in Mermaid renderer for `flowchart`, `sequenceDiagram`,
`stateDiagram`, `gantt`, `gitGraph` and `timeline`. Everything else falls back
to the raw code block. `mermaid-all` registers its own `mermaid` code-block
renderer (external plugins win "last-wins" over the built-in one) and adds the
**16 missing families**.

## Coverage — 22 types

| Family | Rendered by |
| --- | --- |
| `flowchart` / `graph` | vendored OpenCode engine (`vendor/merman`) |
| `sequenceDiagram` | vendored OpenCode engine |
| `stateDiagram-v2` | vendored OpenCode engine |
| `gantt` | vendored OpenCode engine |
| `gitGraph` | vendored OpenCode engine |
| `timeline` | vendored OpenCode engine |
| `classDiagram` | this plugin |
| `erDiagram` | this plugin |
| `journey` | this plugin |
| `pie` | this plugin |
| `quadrantChart` | this plugin |
| `requirementDiagram` | this plugin |
| `C4Context` / `C4Container` / … | this plugin |
| `mindmap` | this plugin |
| `zenuml` | this plugin |
| `sankey-beta` | this plugin |
| `xychart-beta` | this plugin |
| `block-beta` | this plugin |
| `packet-beta` | this plugin |
| `kanban` | this plugin |
| `architecture-beta` | this plugin |
| `radar-beta` | this plugin |

Unknown or invalid diagrams fall back to the original source block.

## How it works

```
message → markdown code block ("mermaid")
        → user.mermaid-all renderer
             ├─ vendored engine  → flowchart/sequence/state/gantt/gitGraph/timeline
             └─ findFamily()     → the 16 extra families → Canvas
        → StyledText → host TextRenderable → TUI
```

- `src/plugin.ts` registers the renderer on the `mermaid` language.
- `src/renderer.ts` tries the vendored engine first, then the extra families.
- `src/families/` contains the 16 hand-written renderers (`charts`, `boxes`, `flows`).
- `src/core/canvas.ts` is a small character grid with semantic style names.
- `src/renderable.ts` turns the canvas into a host `TextRenderable` (horizontal
  scroll on drag, like the built-in renderer).
- `src/palette.ts` maps the host theme onto a small, defensive color palette.

## Install

```sh
git clone https://github.com/96Ems/opencode-mermaid-all
cd opencode-mermaid-all
./install.sh
```

`install.sh` copies the plugin into `~/.config/opencode/plugins/mermaid-all`, the
shim into `~/.config/opencode/shims/opentui-core`, updates
`~/.config/opencode/package.json`, and runs `bun install`. Then restart OpenCode.

### Manual install

Add to `~/.config/opencode/package.json`:

```json
{
  "dependencies": {
    "@opencode-ai/plugin": "1.18.16",
    "@opencode/plugin": "2.0.22",
    "@opentui/core": "file:./shims/opentui-core",
    "entities": "7.0.1",
    "string-width": "^7.2.0"
  }
}
```

Copy `mermaid-all/` into `~/.config/opencode/plugins/` and `shims/opentui-core/`
into `~/.config/opencode/shims/`, then run `bun install` in `~/.config/opencode`.

## Why the `@opentui/core` shim

External plugins that create OpenTUI renderables must use the **host's**
`@opentui/core` instance. If a plugin imports its own copy, the renderable's
class identity differs from the host's and OpenTUI crashes on teardown:

```
Error: remove expects a renderable child object
```

`shims/opentui-core` re-exports the host core through OpenTUI's runtime module
id, so plugin renderables share the host's class identities:

```js
export * from "opentui:runtime-module:%40opentui%2Fcore"
```

Two pitfalls this works around:

- Keeping the shim in a **plugin-local `node_modules`** breaks resolution of the
  plugin's own bare imports (`Cannot find package '@opencode/plugin'`). Keep it at
  the config level, wired with `"file:./shims/opentui-core"`.
- A plain `"@opentui/core": "0.5.14"` install gives the plugin its own copy and
  brings the crash back.

## Why the palette is defensive

The built-in engine's palette helper reads a **resolved-theme** shape
(`theme.text.default`, `theme.background.default`, `theme.categorical`) that the
public plugin `context.theme` does not provide. Calling it throws
(`undefined is not an object (evaluating 'input.text.r')`) and takes the whole
TUI down. `src/palette.ts` therefore reads the theme defensively, never throws,
and falls back to default colors; the vendored palette helper is never called.

## Develop

```sh
bun test/render.ts   # prints every family's plain-text rendering
```

## License

MIT — see [LICENSE](./LICENSE). `vendor/merman` is MIT, copied from OpenCode;
see [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md).
