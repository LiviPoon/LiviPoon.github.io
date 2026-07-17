import { QuartzFilterPlugin } from "../types"

/** Keep Quartz responsible only for the homepage shell, Art, Thoughts, and their indexes. */
export const QuartzPages: QuartzFilterPlugin = () => ({
  name: "QuartzPages",
  shouldPublish(_ctx, [_tree, vfile]) {
    const slug = vfile.data.slug
    // Keep the root Markdown record only to satisfy Quartz's home-page invariant. The standalone
    // PortfolioRoot emitter and native overlay replace its HTML output.
    return (
      typeof slug === "string" &&
      (slug === "index" ||
        slug === "art/index" ||
        slug === "blog/index" ||
        slug.startsWith("blog/"))
    )
  },
})
