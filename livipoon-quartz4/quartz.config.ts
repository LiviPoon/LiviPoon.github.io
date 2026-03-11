import { QuartzConfig } from "./quartz/cfg"
import * as Plugin from "./quartz/plugins"

const config: QuartzConfig = {
  configuration: {
    pageTitle: "Livi Poon",
    pageTitleSuffix: "",
    enableSPA: true,
    enablePopovers: true,
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
        header: "Playfair Display",
        body: "Figtree",
        code: "IBM Plex Mono",
      },
      colors: {
        lightMode: {
          light: "#F6F6F3",
          lightgray: "#3A3335",
          gray: "#8B8586",
          darkgray: "#5A5356",
          dark: "#3A3335",
          secondary: "#4EA5D9",
          tertiary: "#1D6087",
          highlight: "rgba(100, 141, 229, 0.18)",
          textHighlight: "rgba(252, 176, 186, 0.48)",
        },
        darkMode: {
          light: "#3A3335",
          lightgray: "#575052",
          gray: "#8C8486",
          darkgray: "#DCE2CF",
          dark: "#F9FDED",
          secondary: "#4EA5D9",
          tertiary: "#648DE5",
          highlight: "rgba(100, 141, 229, 0.2)",
          textHighlight: "rgba(252, 176, 186, 0.42)",
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
