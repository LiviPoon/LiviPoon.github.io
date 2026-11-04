# Content conventions

- Markdown with YAML frontmatter: `title`, `description`, `tags`, dates.
- Obsidian-flavored (wikilinks, callouts) and GitHub-flavored markdown supported.
- Raw HTML is allowed; the homepage (`content/index.md`) uses lots of it.
- Custom tag: `<page-break></page-break>`.
- Images → `content/images/`; soundscape audio → `portfolio-src/soundscape/`; fonts → `content/fonts/`.
- Links resolve with "shortest" path matching.
- Ignored folders: `private/`, `templates/`, `.obsidian/`. Use `draft: true` to hide a page.
- Blog posts: `content/blog/<Title>.md`; many have long descriptive filenames.
- Large media (7MB photos, mp3s) are already committed—prefer compressing new assets.

See also: [../features/pages.md](../features/pages.md), [../features/habits.md](../features/habits.md)
