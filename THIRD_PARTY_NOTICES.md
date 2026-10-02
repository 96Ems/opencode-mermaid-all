# Third-party notices

## `vendor/merman` (OpenCode)

The `vendor/merman` directory is copied from the OpenCode repository
(`packages/merman`), which is released under the MIT License:

- https://github.com/anomalyco/opencode

It renders the six diagram families that OpenCode already ships natively
(`flowchart`, `sequenceDiagram`, `stateDiagram`, `gantt`, `gitGraph`,
`timeline`). We vendor a copy so this plugin can keep those renderings when it
takes over the `mermaid` code-block renderer.

That package in turn derives from `kitlangton/merman`
(https://github.com/kitlangton/merman), also MIT.

## Runtime dependencies

- `@opencode/plugin` — OpenCode, MIT
- `@opentui/core` — OpenTUI, MIT (provided by the OpenCode host runtime)
- `entities` — MIT
- `string-width` — MIT
