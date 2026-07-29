# Indent to Headings

Indent to Headings converts plain indented outlines into Markdown headings in Obsidian.

It is designed for notes that start as quick plain text:

```txt
Project plan
  Research
    Read papers
    Collect notes
  Build
    Prototype
    Test
```

and turns them into structured Markdown:

```md
# Project plan
## Research
Read papers
Collect notes
## Build
Prototype
Test
```

The converter is safe to rerun. Existing Markdown headings are preserved, so you can convert a note once, add another rough outline later, and run the command again without rewriting the finished sections.

## Features

- Convert selected text, the whole note, the current outline block, or marked blocks.
- Preserve existing Markdown headings.
- Treat leaf lines as body text by default.
- Optionally write leaf lines as bullets.
- Preserve existing bullets, numbered markers, and task checkboxes on leaf lines.
- Skip fenced code blocks.
- Preview a conversion before applying it.
- Use marked blocks for precise conversion:

```md
<!-- indent-to-headings:start -->
Project
  Build
    Prototype
<!-- indent-to-headings:end -->
```

## Commands

- `Convert indented outline to headings`
- `Convert current outline block to headings`
- `Convert marked outline blocks to headings`
- `Preview indent to headings conversion`

The ribbon button runs `Convert indented outline to headings`.

## Settings

- `Base heading level`: heading level used for top-level plain lines when there is no nearby heading.
- `Spaces per indent`: how many leading spaces count as one indent level.
- `Leaf lines as text`: only lines with children become headings.
- `Minimum children for heading`: require one, two, or three direct child lines before a line becomes a heading.
- `Leaf text style`: write leaves as plain text or bullets.
- `Preserve leaf list markers`: keep existing list markers on leaf lines.
- `Strip list markers from headings`: remove list markers before creating headings.
- `Preserve blank lines`: keep blank lines in converted output.
- `Prefer marked blocks`: if marked blocks exist, the main command only converts inside them.

## Manual Installation

1. Download `manifest.json`, `main.js`, and `styles.css` from the latest release.
2. Put them in `<vault>/.obsidian/plugins/indent-to-headings/`.
3. Reload Obsidian.
4. Enable `Indent to Headings` in Community plugins.

## Development

```bash
npm install
npm run dev
```

For a production build:

```bash
npm run build
```

For tests:

```bash
npm test
```

## Release

1. Update `manifest.json`.
2. Run `npm version patch`, `npm version minor`, or `npm version major`.
3. Push the commit and matching tag.
4. The GitHub release workflow attaches `manifest.json`, `main.js`, and `styles.css`.

## Community Directory Submission

The repository is prepared for Obsidian Community plugin submission.

Submit this repository URL:

```txt
https://github.com/musel25/indent-to-headings
```

Final submission must be completed by the repository owner because it requires signing in, linking GitHub, and accepting the Obsidian developer policies.

1. Sign in to <https://community.obsidian.md>.
2. Link the GitHub account that owns this repository.
3. Open `Plugins` -> `New plugin`.
4. Enter the repository URL above.
5. Confirm the developer policies and submit.
6. Address any automated review feedback.

The current release is ready for review:

- Root `README.md`, `LICENSE`, `manifest.json`, and `versions.json` exist.
- `manifest.json.version` is `1.3.0`.
- GitHub release `1.3.0` exists.
- Release assets include `main.js`, `manifest.json`, and `styles.css`.
- `versions.json` maps plugin version `1.3.0` to minimum Obsidian version `1.5.0`.
