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
          light: "#ffffff",
          lightgray: "#e0e0e0",
          gray: "#888888",
          darkgray: "#333333",
          dark: "#000000",
          secondary: "#000000",
          tertiary: "#555555",
          highlight: "rgba(0, 0, 0, 0.06)",
          textHighlight: "rgba(0, 0, 0, 0.12)",
        },
        darkMode: {
          light: "#000000",
          lightgray: "#262626",
          gray: "#7a7a7a",
          darkgray: "#d4d4d4",
          dark: "#ffffff",
          secondary: "#ffffff",
          tertiary: "#b5b5b5",
          highlight: "rgba(255, 255, 255, 0.08)",
          textHighlight: "rgba(255, 255, 255, 0.22)",
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
      Plugin.MirrorQuotes(),
      Plugin.AliasRedirects(),
      Plugin.FolderPage(),
      Plugin.Assets(),
      Plugin.Static(),
      Plugin.NotFoundPage(),
    ],
  },
}

export default config
