# Docs site

The documentation is written in the Markdown files in `doc/` and built into a static site by `build.mjs`. This folder owns the design and the build, not the content. The design and build are taken from [community-bot](https://github.com/frinfo702/community-bot)'s docs.

```bash
bun run docs:build   # doc/*.md -> doc/dist
bun run docs:dev     # build, then serve doc/dist at http://localhost:4321
DOCS_BASE=/forwardfig/docs/ bun run docs:build   # as deployed to GitHub Pages
```

## Files

| Path | Purpose |
| --- | --- |
| `build.mjs` | Reads frontmatter, renders Markdown with `marked`, draws the live figures, writes the search index, checks internal links, concatenates `styles/`. Runs on Bun, which imports `src/` directly. |
| `serve.mjs` | Local static server for the build output. |
| `styles/` | Five ordered files (base, layout, content, chrome, responsive), concatenated into one `style.css`. |
| `assets/` | Self-hosted fonts (Instrument Sans, JetBrains Mono, OFL), favicon, `main.js` (search, copy buttons, mobile navigation, scrollspy), the robin photo the image examples use. |

## Live figures

A code block fenced as ` ```ts figure ` is run at build time with every export of the library in scope; it must define `fig`. The figure is drawn above the code in the dark theme, so every figure on the site is the output of the code beside it. A broken example fails the build.

## Pages

Each page needs `title`, `group` (`Start`, `Guide` or `Reference`), `order` and `description` in its frontmatter, plus an optional `nav`. Adding a page is adding a Markdown file.
