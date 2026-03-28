import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

const config: QuartzConfig = {
  configuration: {
    pageTitle: "Livi Poon",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: false,
    analytics: {
      provider: "goatcounter",
      websiteId: "livipoon",
      host: "goatcounter.com",
    },
    locale: "en-US",
    baseUrl: "www.livipoon.com",
    ignorePatterns: ["private", "templates", ".obsidian"],
    defaultDateType: "modified",
    theme: {
      fontOrigin: "googleFonts",
      cdnCaching: true,
      typography: {
        title: "Playfair Display",
        header: "Playfair Display",
        body: "Figtree",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#f6f6f3",
          lightgray: "#c8d1b8",
          gray: "#588157",
          darkgray: "#1a1a1a",
          dark: "#111111",
          secondary: "#588157",
          tertiary: "#3a5a40",
          highlight: "rgba(163, 177, 138, 0.18)",
          textHighlight: "rgba(163, 177, 138, 0.40)",
        },
        darkMode: {
          light: "#344e41",
          lightgray: "#3a5a40",
          gray: "#a3b18a",
          darkgray: "#dde5db",
          dark: "#f6f6f3",
          secondary: "#a3b18a",
          tertiary: "#c8d1b8",
          highlight: "rgba(163, 177, 138, 0.20)",
          textHighlight: "rgba(163, 177, 138, 0.35)",
        },
      },
    },
  },
  plugins: {
    transformers: [
      Plugin.FrontMatter(),
      Plugin.CreatedModifiedDate(),
      Plugin.ObsidianFlavoredMarkdown({ enableInHtmlEmbed: false }),
      Plugin.GitHubFlavoredMarkdown(),
      Plugin.CrawlLinks({ markdownLinkResolution: "shortest" }),
      Plugin.Description(),
    ],
    filters: [],
    emitters: [
      Plugin.ComponentResources(),
      Plugin.ContentPage(),
      Plugin.ContentIndex(),
      Plugin.Masonry(),
      Plugin.AliasRedirects(),
      Plugin.FolderPage(),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
