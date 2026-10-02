import { Plugin } from "@opencode/plugin/tui"
import { createMermaidAllRenderer } from "./renderer.js"

export default Plugin.define({
  id: "user.mermaid-all",
  setup(context) {
    const renderer = createMermaidAllRenderer(context.renderer, () => ({
      theme: context.theme as never,
      mode: context.themeMode,
    }))
    context.markdown.registerCodeBlockRenderer("mermaid", renderer)
  },
})
