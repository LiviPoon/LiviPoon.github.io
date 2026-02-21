import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

const goatcounterWebsiteId = process.env.GOATCOUNTER_WEBSITE_ID ?? "livipoon"
const goatcounterHost = process.env.GOATCOUNTER_HOST

const config: QuartzConfig = {
  configuration: {
    pageTitle: "Livi Poon",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
    analytics: {
      provider: "goatcounter",
      websiteId: goatcounterWebsiteId,
      ...(goatcounterHost ? { host: goatcounterHost } : {}),
    },
    locale: "en-US",
    baseUrl: "www.livipoon.com",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        header: "Playfair Display",
        body: "Figtree",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#f7f5f2",
          lightgray: "#dfdbd6",
          gray: "#b4aea8",
          darkgray: "#5a5450",
          dark: "#1f1b19",
          secondary: "#359AD4",
          tertiary: "#206C97",
          highlight: "rgba(53, 92, 125, 0.12)",
          textHighlight: "#ffe38a88",
        },
        darkMode: {
          light: "#1a1715",
          lightgray: "#3d3733",
          gray: "#6e6660",
          darkgray: "#d5cec8",
          dark: "#f2eeea",
          secondary: "#8eb4d3",
          tertiary: "#9dc1a8",
          highlight: "rgba(142, 180, 211, 0.16)",
          textHighlight: "#b7a20088",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate({
        priority: ["frontmatter", "git", "filesystem"],
      }),
      Plugin.SyntaxHighlighting({
        theme: {
          light: "github-light",
          dark: "github-dark",
        },
        keepBackground: false,
      }),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.TableOfContents(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
      Plugin.Latex({ renderEngine: "katex" }),
    ],
    filters: [Plugin.RemoveDrafts()],
    emitters: [
      Plugin.AliasRedirects(),
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.FolderPage(),
      Plugin.Masonry(),
      Plugin.TagPage(),
      Plugin.ContentIndex({
        enableSiteMap: true,
        enableRSS: true,
      }),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.CNAME(),
      Plugin.Favicon(),
      Plugin.NotFoundPage(),
      Plugin.CustomOgImages(),
    ],
  },
}

export default config
