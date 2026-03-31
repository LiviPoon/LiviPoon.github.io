import fs from "fs"
import path from "path"
import { Root } from "hast"
import { Node } from "unist"
import { defaultContentPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { FullPageLayout } from "../../cfg"
import BodyConstructor from "../../components/Body"
import FooterConstructor from "../../components/Footer"
import HeaderConstructor from "../../components/Header"
import MirrorQuotesPage from "../../components/pages/MirrorQuotesPage"
import { pageResources, renderPage } from "../../components/renderPage"
import { QuartzComponentProps } from "../../components/types"
import { QuartzEmitterPlugin } from "../types"
import { BuildCtx } from "../../util/ctx"
import { pathToRoot } from "../../util/path"
import { StaticResources } from "../../util/resources"
import { QuartzPluginData } from "../vfile"
import { write } from "./helpers"

export interface MirrorQuote {
  text: string
  speaker: string
  role: string
  makeBold?: boolean
}

function normalizeRelativePath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\/+/, "")
}

function asTrimmedString(value: unknown): string | null {
  if (typeof value !== "string") return null
  const trimmed = value.trim()
  return trimmed.length > 0 ? trimmed : null
}

function normalizeMirrorQuote(entry: unknown): MirrorQuote | null {
  if (!entry || typeof entry !== "object") return null
  const candidate = entry as {
    text?: unknown
    speaker?: unknown
    role?: unknown
    "make-bold"?: unknown
    makeBold?: unknown
    bold?: unknown
  }
  const text = asTrimmedString(candidate.text)
  const speaker = asTrimmedString(candidate.speaker)
  const role = asTrimmedString(candidate.role)
  const makeBold =
    candidate["make-bold"] === true || candidate.makeBold === true || candidate.bold === true

  if (!text || !speaker || !role) return null

  return {
    text,
    speaker,
    role,
    makeBold,
  }
}

function parseMirrorQuotes(raw: unknown): MirrorQuote[] {
  if (!Array.isArray(raw)) return []

  const parsed: MirrorQuote[] = []
  for (const entry of raw) {
    const normalized = normalizeMirrorQuote(entry)
    if (!normalized) continue
    parsed.push(normalized)
  }

  return parsed
}

function getDefaultQuotesPath(fileData: QuartzPluginData): string {
  const relativePath = normalizeRelativePath(fileData.relativePath ?? "")
  const directory = path.posix.dirname(relativePath)
  if (!directory || directory === ".") {
    return "mirror-quotes.json"
  }

  return `${directory}/mirror-quotes.json`
}

function getConfiguredQuotesPath(fileData: QuartzPluginData): string {
  const configuredPath = fileData.frontmatter?.mirrorQuotes
  if (typeof configuredPath === "string" && configuredPath.trim().length > 0) {
    return normalizeRelativePath(configuredPath.trim())
  }

  return getDefaultQuotesPath(fileData)
}

async function loadMirrorQuotes(ctx: BuildCtx, fileData: QuartzPluginData): Promise<MirrorQuote[]> {
  const relativeJsonPath = getConfiguredQuotesPath(fileData)
  const absoluteJsonPath = path.join(ctx.argv.directory, relativeJsonPath)

  try {
    const jsonRaw = await fs.promises.readFile(absoluteJsonPath, "utf8")
    const parsed = JSON.parse(jsonRaw) as unknown
    return parseMirrorQuotes(parsed)
  } catch (error) {
    console.warn(
      `[MirrorQuotes] Unable to load quotes for "${fileData.slug}" from "${relativeJsonPath}".`,
      error,
    )
    return []
  }
}

async function processMirrorQuotes(
  ctx: BuildCtx,
  tree: Node,
  fileData: QuartzPluginData,
  allFiles: QuartzPluginData[],
  opts: FullPageLayout,
  resources: StaticResources,
) {
  const slug = fileData.slug!
  const cfg = ctx.cfg.configuration
  const mirrorQuotes = await loadMirrorQuotes(ctx, fileData)

  const pageData: QuartzPluginData = {
    ...fileData,
    mirrorQuotes,
  }

  const externalResources = pageResources(pathToRoot(slug), resources)
  const componentData: QuartzComponentProps = {
    ctx,
    fileData: pageData,
    externalResources,
    cfg,
    children: [],
    tree: tree as Root,
    allFiles,
  }

  const html = renderPage(cfg, slug, componentData, opts, externalResources)
  return write({ ctx, content: html, slug, ext: ".html" })
}

export const MirrorQuotes: QuartzEmitterPlugin<Partial<FullPageLayout>> = (userOpts) => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultContentPageLayout,
    ...userOpts,
    pageBody: MirrorQuotesPage(),
    beforeBody: [],
    left: [],
    right: [],
    afterBody: [],
    footer: FooterConstructor(),
  }

  const { head: Head, header, beforeBody, pageBody, afterBody, left, right, footer: Footer } = opts
  const Header = HeaderConstructor()
  const Body = BodyConstructor()

  return {
    name: "MirrorQuotes",
    getQuartzComponents() {
      return [
        Head,
        Header,
        Body,
        ...header,
        ...beforeBody,
        pageBody,
        ...afterBody,
        ...left,
        ...right,
        Footer,
      ]
    },
    async *emit(ctx, content, resources) {
      const allFiles = content.map((item) => item[1].data)

      for (const [tree, file] of content) {
        if (file.data.frontmatter?.layout !== "mirror-quotes") continue
        yield processMirrorQuotes(ctx, tree, file.data, allFiles, opts, resources)
      }
    },
    async *partialEmit(ctx, content, resources, changeEvents) {
      const allFiles = content.map((item) => item[1].data)
      const changedSlugs = new Set<string>()
      const changedJsonPaths = new Set<string>()

      for (const changeEvent of changeEvents) {
        const normalizedPath = normalizeRelativePath(changeEvent.path)
        if (normalizedPath.endsWith(".json")) {
          changedJsonPaths.add(normalizedPath)
        }

        if (changeEvent.file && (changeEvent.type === "add" || changeEvent.type === "change")) {
          changedSlugs.add(changeEvent.file.data.slug!)
        }
      }

      for (const [tree, file] of content) {
        if (file.data.frontmatter?.layout !== "mirror-quotes") continue

        const slug = file.data.slug!
        const jsonPath = getConfiguredQuotesPath(file.data)
        if (!changedSlugs.has(slug) && !changedJsonPaths.has(jsonPath)) continue
        yield processMirrorQuotes(ctx, tree, file.data, allFiles, opts, resources)
      }
    },
  }
}

declare module "vfile" {
  interface DataMap {
    mirrorQuotes: MirrorQuote[]
  }
}
