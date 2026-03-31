import { classNames } from "../../util/lang"
import { pathToRoot } from "../../util/path"
import { QuartzComponent, QuartzComponentConstructor, QuartzComponentProps } from "../types"

type MirrorQuote = {
  text: string
  speaker: string
  role: string
  makeBold?: boolean
}

function normalizeQuoteText(text: string): string {
  return text.trim().replace(/^[“”"']+|[“”"']+$/g, "")
}

function formatSpeakerRole(speaker: string, role: string): string {
  const trimmedSpeaker = speaker.trim()
  const trimmedRole = role.trim().replace(/[.]+$/, "")
  return `${trimmedSpeaker} - ${trimmedRole}.`
}

export default (() => {
  const MirrorQuotesPage: QuartzComponent = ({ fileData, displayClass }: QuartzComponentProps) => {
    const quotes = (fileData.mirrorQuotes ?? []) as MirrorQuote[]
    const classes: string[] = fileData.frontmatter?.cssclasses ?? []
    const backHref = fileData.slug ? pathToRoot(fileData.slug) : "."
    const className = classNames(
      displayClass,
      ...classes,
      "popover-hint",
      "mirror-quotes-container",
    )

    if (quotes.length === 0) {
      return (
        <article class={className} data-mirror-quotes-layout="">
          <div class="mirror-quotes-empty">No quotes found.</div>
          <a class="mirror-back-link" href={backHref}>
            back
          </a>
        </article>
      )
    }

    return (
      <article class={className} data-mirror-quotes-layout="">
        <div class="pilcrow-testimonial-row">
          {quotes.map((quote) => (
            <article
              class={classNames("pilcrow-quote", quote.makeBold ? "pilcrow-quote--highlight" : "")}
              key={`${quote.speaker}-${quote.role}-${quote.text}`}
            >
              <p>"{normalizeQuoteText(quote.text)}"</p>
              <span>{formatSpeakerRole(quote.speaker, quote.role)}</span>
            </article>
          ))}
        </div>
        <a class="mirror-back-link" href={backHref}>
          back
        </a>
      </article>
    )
  }

  return MirrorQuotesPage
}) satisfies QuartzComponentConstructor
