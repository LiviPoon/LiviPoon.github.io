import fs from "fs"
import path from "path"
// @ts-ignore
import clipboardScript from "./scripts/clipboard.inline"
// @ts-ignore
import backgroundMusicScript from "./scripts/backgroundMusic.inline"
// @ts-ignore
import siteVisitCounterScript from "./scripts/siteVisitCounter.inline"
import clipboardStyle from "./styles/clipboard.scss"
import backgroundMusicStyle from "./styles/backgroundMusic.scss"
import siteVisitCounterStyle from "./styles/siteVisitCounter.scss"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "./types"
import { concatenateResources } from "../util/resources"
import { FilePath, slugifyFilePath } from "../util/path"

const audioExtensions = new Set([".mp3", ".m4a", ".aac", ".wav", ".ogg", ".flac"])
const preferredFirstTrack = "reality piano cover for lovers.mp3"

function getBackgroundSongs(): string[] {
  const songsDir = path.join(process.cwd(), "content", "songs")
  if (!fs.existsSync(songsDir)) {
    return []
  }

  const files = fs.readdirSync(songsDir, { withFileTypes: true })
  return files
    .filter((entry) => entry.isFile())
    .map((entry) => entry.name)
    .filter((fileName) => audioExtensions.has(path.extname(fileName).toLowerCase()))
    .sort((a, b) => {
      const aPreferred = a.toLowerCase() === preferredFirstTrack
      const bPreferred = b.toLowerCase() === preferredFirstTrack
      if (aPreferred && !bPreferred) return -1
      if (!aPreferred && bPreferred) return 1
      return a.localeCompare(b)
    })
    .map((fileName) => `/${slugifyFilePath(`songs/${fileName}` as FilePath)}`)
}

const backgroundSongs = getBackgroundSongs()

const Body: QuartzComponent = ({ children }: QuartzComponentProps) => {
  return (
    <div id="quartz-body" data-background-songs={JSON.stringify(backgroundSongs)}>
      {children}
    </div>
  )
}

Body.afterDOMLoaded = concatenateResources(
  clipboardScript,
  backgroundMusicScript,
  siteVisitCounterScript,
)
Body.css = concatenateResources(clipboardStyle, backgroundMusicStyle, siteVisitCounterStyle)

export default (() => Body) satisfies QuartzComponentConstructor
