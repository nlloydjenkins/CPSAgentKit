/**
 * Markdown utilities: template detection and section extraction.
 */

/**
 * Check whether a markdown string is just the empty template
 * (headings, HTML comments, placeholder dashes, empty tables, checkboxes)
 * with no real authored content.
 */
export function isTemplateOnly(md: string): boolean {
  const lines = md.split(/\r?\n/);
  for (const raw of lines) {
    const line = raw.trim();
    if (line === "") {
      continue;
    } // blank line
    if (line.startsWith("#")) {
      continue;
    } // heading
    if (line.startsWith("<!--")) {
      continue;
    } // HTML comment
    if (/^[\|\-\s:]+$/.test(line)) {
      continue;
    } // table separator row
    if (/^\|(\s*\|)+$/.test(line)) {
      continue;
    } // empty table data row (any column count)
    if (/^\|[\w\s|]+\|$/.test(line)) {
      continue;
    } // table header row (words only)
    if (line === "-") {
      continue;
    } // placeholder list item
    if (/^-\s+\*\*[^*]+:\*\*/.test(line)) {
      continue;
    } // bold-label list item
    if (/^-\s*\[[ x]\]/.test(line)) {
      continue;
    } // checkbox
    if (/^\d+\.$/.test(line)) {
      continue;
    } // placeholder ordered list item
    // If we get here, this line has real content
    return false;
  }
  return true;
}

/** Extract the body of a level-2 markdown section with the given heading. */
export function extractMarkdownSection(md: string, heading: string): string {
  const escapedHeading = heading.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const sectionRegex = new RegExp(
    `^##\\s+${escapedHeading}\\s*$([\\s\\S]*?)(?=^##\\s+|$)`,
    "m",
  );
  return md.match(sectionRegex)?.[1]?.trim() ?? "";
}
