import fs from "fs"
import path from "path"
import { Root } from "hast"
import sharp from "sharp"
import { Node } from "unist"
import { visit } from "unist-util-visit"
import { defaultContentPageLayout, sharedPageComponents } from "../../../quartz.layout"
import { FullPageLayout } from "../../cfg"
import BodyConstructor from "../../components/Body"
import FooterConstructor from "../../components/Footer"
import HeaderConstructor from "../../components/Header"
import MasonryPage from "../../components/pages/MasonryPage"
import { pageResources, renderPage } from "../../components/renderPage"
import { QuartzComponentProps } from "../../components/types"
import { QuartzEmitterPlugin } from "../types"
import { BuildCtx } from "../../util/ctx"
import { FilePath, FullSlug, joinSegments, pathToRoot, slugifyFilePath } from "../../util/path"
import { StaticResources } from "../../util/resources"
import { QuartzPluginData } from "../vfile"
import { write } from "./helpers"

const DEFAULT_IMAGE_WIDTH = 800
const DEFAULT_IMAGE_HEIGHT = 600
const IMAGE_EXTENSIONS = new Set([".jpg", ".jpeg", ".png", ".gif", ".webp", ".svg"])
const masonryWikilinkRegex = /^!?\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]*)?\]\]$/

export interface MasonryImage {
  src: string
  alt: string
  width: number
  height: number
}

async function imageSizeFromFile(filePath: string): Promise<{ width: number; height: number }> {
  try {
    const metadata = await sharp(filePath).metadata()
    return {
      width: metadata.width ?? DEFAULT_IMAGE_WIDTH,
      height: metadata.height ?? DEFAULT_IMAGE_HEIGHT,
    }
  } catch {
    return { width: DEFAULT_IMAGE_WIDTH, height: DEFAULT_IMAGE_HEIGHT }
  }
}

function parseMasonryReference(ref: string): string | null {
  const trimmed = ref.trim()
  if (!trimmed) return null

  const wikilinkMatch = masonryWikilinkRegex.exec(trimmed)
  if (wikilinkMatch) {
    return wikilinkMatch[1].trim()
  }

  return trimmed
}

function getReferenceCandidates(targetPath: string): string[] {
  const normalized = targetPath.replace(/^\/+|\/+$/g, "")
  if (!normalized) return []

  const withoutExt = normalized.replace(/\.(md|html)$/i, "")
  const candidates = new Set<string>([withoutExt, `${withoutExt}/index`])

  if (/\.[A-Za-z0-9]+$/.test(normalized)) {
    candidates.add(slugifyFilePath(normalized as FilePath))
  } else {
    candidates.add(slugifyFilePath(`${normalized}.md` as FilePath))
    candidates.add(slugifyFilePath(`${normalized}/index.md` as FilePath))
  }

  return [...candidates]
}

function findReferencedTree(
  targetPath: string,
  contentBySlug: Map<string, { tree: Root; relativePath: string }>,
): { tree: Root; relativePath: string } | undefined {
  for (const candidate of getReferenceCandidates(targetPath)) {
    const tree = contentBySlug.get(candidate)
    if (tree) return tree
  }

  return undefined
}

async function extractImagesFromTree(
  tree: Root,
  contentRoot: string,
  pageRelativeDir: string,
): Promise<MasonryImage[]> {
  const imageNodes: Array<{
    src: string
    alt: string
    width?: number
    height?: number
    sourcePath?: string
  }> = []

  visit(tree, "element", (node: any) => {
    if (node.tagName !== "img") return
    const src = node.properties?.src
    if (typeof src !== "string" || src.length === 0) return

    const widthProp = node.properties?.width
    const heightProp = node.properties?.height

    let width: number | undefined
    let height: number | undefined

    if (typeof widthProp === "number") {
      width = widthProp
    } else if (typeof widthProp === "string") {
      width = Number.parseInt(widthProp, 10)
    }

    if (typeof heightProp === "number") {
      height = heightProp
    } else if (typeof heightProp === "string") {
      height = Number.parseInt(heightProp, 10)
    }

    let sourcePath: string | undefined
    if (!/^https?:\/\//i.test(src)) {
      const cleanedPath = decodeURIComponent(src).split(/[?#]/)[0]
      if (cleanedPath.length > 0) {
        sourcePath = cleanedPath.startsWith("/")
          ? path.join(contentRoot, cleanedPath.replace(/^\/+/, ""))
          : path.resolve(contentRoot, pageRelativeDir, cleanedPath)
      }
    }

    imageNodes.push({
      src,
      alt: (node.properties?.alt as string) || "",
      width,
      height,
      sourcePath,
    })
  })

  return Promise.all(
    imageNodes.map(async (node) => {
      if (node.width && node.height) {
        return {
          src: node.src,
          alt: node.alt,
          width: node.width,
          height: node.height,
        }
      }

      if (node.sourcePath && fs.existsSync(node.sourcePath)) {
        const dimensions = await imageSizeFromFile(node.sourcePath)
        return {
          src: node.src,
          alt: node.alt,
          width: dimensions.width,
          height: dimensions.height,
        }
      }

      return {
        src: node.src,
        alt: node.alt,
        width: DEFAULT_IMAGE_WIDTH,
        height: DEFAULT_IMAGE_HEIGHT,
      }
    }),
  )
}

function deduplicateImages(images: MasonryImage[]): MasonryImage[] {
  const seen = new Set<string>()
  const deduplicated: MasonryImage[] = []

  for (const image of images) {
    if (seen.has(image.src)) continue
    seen.add(image.src)
    deduplicated.push(image)
  }

  return deduplicated
}

async function extractImagesFromDirectory(
  dirPath: string,
  contentRoot: string,
): Promise<MasonryImage[]> {
  const cleanDirPath = dirPath.replace(/^\/+|\/+$/g, "")
  if (!cleanDirPath) return []

  const fullPath = path.join(contentRoot, cleanDirPath)

  try {
    const stat = await fs.promises.stat(fullPath)
    if (!stat.isDirectory()) return []
  } catch {
    return []
  }

  const entries = await fs.promises.readdir(fullPath, { withFileTypes: true })
  const imageEntries = entries.filter((entry) => {
    if (!entry.isFile()) return false
    const ext = path.extname(entry.name).toLowerCase()
    return IMAGE_EXTENSIONS.has(ext)
  })

  return Promise.all(
    imageEntries.map(async (entry) => {
      const relativePath = path.posix.join(cleanDirPath.replace(/\\/g, "/"), entry.name)
      const slugifiedPath = slugifyFilePath(relativePath as FilePath)
      const filePath = path.join(fullPath, entry.name)
      const dimensions = await imageSizeFromFile(filePath)
      const extension = path.extname(entry.name)

      return {
        src: `/${slugifiedPath}`,
        alt: path.basename(entry.name, extension),
        width: dimensions.width,
        height: dimensions.height,
      }
    }),
  )
}

async function processMasonry(
  ctx: BuildCtx,
  tree: Node,
  fileData: QuartzPluginData,
  allFiles: QuartzPluginData[],
  contentBySlug: Map<string, { tree: Root; relativePath: string }>,
  opts: FullPageLayout,
  resources: StaticResources,
) {
  const slug = fileData.slug!
  const cfg = ctx.cfg.configuration
  const currentPageRelativeDir = path.dirname(fileData.relativePath ?? "")

  const currentPageImages = await extractImagesFromTree(
    tree as Root,
    ctx.argv.directory,
    currentPageRelativeDir,
  )
  const referencedImages: MasonryImage[] = []
  const masonryRefs = fileData.frontmatter?.masonry

  if (Array.isArray(masonryRefs)) {
    for (const ref of masonryRefs) {
      if (typeof ref !== "string") continue

      const targetPath = parseMasonryReference(ref)
      if (!targetPath) continue

      const directoryImages = await extractImagesFromDirectory(targetPath, ctx.argv.directory)
      if (directoryImages.length > 0) {
        referencedImages.push(...directoryImages)
        continue
      }

      const referencedContent = findReferencedTree(targetPath, contentBySlug)
      if (!referencedContent) continue

      const linkedImages = await extractImagesFromTree(
        referencedContent.tree,
        ctx.argv.directory,
        path.dirname(referencedContent.relativePath),
      )
      referencedImages.push(...linkedImages)
    }
  }

  const allImages = deduplicateImages([...currentPageImages, ...referencedImages])

  const imagesJsonSlug = `${slug}.images` as FullSlug
  await write({ ctx, content: JSON.stringify(allImages), slug: imagesJsonSlug, ext: ".json" })

  const pageData: QuartzPluginData = {
    ...fileData,
    masonryImages: allImages,
    masonryJsonPath: joinSegments(pathToRoot(slug), `${slug}.images.json`),
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

export const Masonry: QuartzEmitterPlugin<Partial<FullPageLayout>> = (userOpts) => {
  const opts: FullPageLayout = {
    ...sharedPageComponents,
    ...defaultContentPageLayout,
    ...userOpts,
    pageBody: MasonryPage(),
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
    name: "Masonry",
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
      const contentBySlug = new Map<string, { tree: Root; relativePath: string }>()

      for (const [tree, file] of content) {
        const slug = file.data.slug
        if (!slug) continue
        contentBySlug.set(slug, {
          tree,
          relativePath: file.data.relativePath ?? "",
        })
      }

      for (const [tree, file] of content) {
        if (file.data.frontmatter?.layout !== "masonry") continue
        yield processMasonry(ctx, tree, file.data, allFiles, contentBySlug, opts, resources)
      }
    },
    async *partialEmit(ctx, content, resources, changeEvents) {
      const allFiles = content.map((item) => item[1].data)
      const contentBySlug = new Map<string, { tree: Root; relativePath: string }>()

      for (const [tree, file] of content) {
        const slug = file.data.slug
        if (!slug) continue
        contentBySlug.set(slug, {
          tree,
          relativePath: file.data.relativePath ?? "",
        })
      }

      const changedSlugs = new Set<string>()
      for (const changeEvent of changeEvents) {
        if (!changeEvent.file) continue
        if (changeEvent.type === "add" || changeEvent.type === "change") {
          changedSlugs.add(changeEvent.file.data.slug!)
        }
      }

      for (const [tree, file] of content) {
        const slug = file.data.slug!
        if (!changedSlugs.has(slug)) continue
        if (file.data.frontmatter?.layout !== "masonry") continue
        yield processMasonry(ctx, tree, file.data, allFiles, contentBySlug, opts, resources)
      }
    },
  }
}

declare module "vfile" {
  interface DataMap {
    masonryImages: MasonryImage[]
    masonryJsonPath: string
  }
}
