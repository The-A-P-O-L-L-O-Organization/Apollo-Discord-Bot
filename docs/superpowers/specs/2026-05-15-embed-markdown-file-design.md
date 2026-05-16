# Embed Markdown File Rendering

## Overview

Add a `file` attachment option to the existing `/embed` command that accepts a `.md` file and parses its markdown content into structured embed fields.

## Design

### Command Changes

Add a single optional attachment option to `/embed`:

```
/embed file:<.md file> [title] [description] [color] [image] ...
```

- `file` — attachment option, accepts `.md` files only (validated by extension)
- All existing options (`title`, `description`, `color`, `image`, `thumbnail`, `footer`, `author`, `url`, `timestamp`) continue to work and take precedence over parsed content

### Markdown Parsing Rules

1. **First `# Heading`** → embed title (only if `title` option not provided)
2. **Content before first heading** → embed description (only if `description` option not provided)
3. **`## Heading` / `### Heading`** → field name
4. **Content between headings** → field value for the preceding heading
5. **Code blocks, lists, bold, italic, links** — preserved as-is (Discord's native markdown rendering handles formatting inside field values)
6. **Empty lines between paragraphs** — collapsed into single newlines

### Embed Limit Handling

Discord embed constraints:
- Title: 256 chars max
- Description: 4096 chars max
- Field name: 1024 chars max
- Field value: 1024 chars max
- Total fields: 25 max
- Total embed: 6000 chars

Truncation strategy:
- If a field value exceeds 1024 chars, truncate at the last word boundary before 1024 and append `…`
- If total fields exceed 25, stop parsing and log a warning
- If title/description overflow would occur from parsed content, the content is truncated similarly
- A footer note `Rendered from <filename>` is added

### Validation

- Reject non-`.md` extensions with an ephemeral error message
- Reject files larger than 100KB
- Reject empty files
- File reading done via `fetch(attachment.url)` in the command handler

### Error Handling

- Network errors reading the attachment → ephemeral error "Could not read the attached file"
- Parse errors (malformed content) → graceful fallback, render what's parseable

## Implementation Plan

1. Add `file` attachment option to `/embed` slash command definition
2. Add `parseMarkdownToEmbed(content, filename)` utility in the command file
3. Modify `execute()` to:
   a. Check if `file` option is present
   b. Validate `.md` extension and file size
   c. Read file content from attachment URL
   d. Parse markdown into embed fields
   e. Merge with manually-provided options (manual takes precedence)
   f. Handle embed limit truncation
4. Add tests for markdown parsing and embed field generation
