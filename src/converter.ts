export const START_MARKER = "<!-- indent-to-headings:start -->";
export const END_MARKER = "<!-- indent-to-headings:end -->";

export type LeafTextStyle = "plain" | "bullet";

export interface IndentToHeadingsSettings {
  baseHeadingLevel: number;
  spacesPerIndent: number;
  leafLinesAsText: boolean;
  minimumChildrenForHeading: number;
  stripListMarkers: boolean;
  preserveLeafListMarkers: boolean;
  leafTextStyle: LeafTextStyle;
  preserveBlankLines: boolean;
  preferMarkedBlocks: boolean;
}

type LineKind = "blank" | "code" | "heading" | "plain";

interface ParsedLine {
  original: string;
  kind: LineKind;
  content?: string;
  headingLevel?: number;
  indentLevel?: number;
  listMarker?: string;
}

interface OutlineBlock {
  baseHeadingLevel: number;
  baseIndentLevel: number;
}

interface OutlineStackItem {
  indentLevel: number;
  headingLevel: number;
}

interface ConversionResult {
  text: string;
  changed: boolean;
  markedBlocksFound: number;
}

interface ConvertOptions {
  onlyMarkedBlocks?: boolean;
}

interface Fence {
  marker: "`" | "~";
  length: number;
}

export const DEFAULT_SETTINGS: IndentToHeadingsSettings = {
  baseHeadingLevel: 1,
  spacesPerIndent: 2,
  leafLinesAsText: true,
  minimumChildrenForHeading: 1,
  stripListMarkers: true,
  preserveLeafListMarkers: true,
  leafTextStyle: "plain",
  preserveBlankLines: true,
  preferMarkedBlocks: false,
};

export function convertIndentedOutline(
  text: string,
  settings: IndentToHeadingsSettings,
  options: ConvertOptions = {}
): ConversionResult {
  const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
  const markedBlocksFound = countMarkedBlocks(text);
  const shouldConvertMarkedOnly = options.onlyMarkedBlocks || (settings.preferMarkedBlocks && markedBlocksFound > 0);
  const converted = shouldConvertMarkedOnly
    ? convertMarkedBlocks(text, settings, lineEnding)
    : convertPlainText(text, settings, lineEnding);

  return {
    text: converted,
    changed: converted !== text,
    markedBlocksFound,
  };
}

export function convertPlainText(text: string, settings: IndentToHeadingsSettings, lineEnding?: string): string {
  const ending = lineEnding ?? (text.includes("\r\n") ? "\r\n" : "\n");
  const parsedLines = parseLines(text, settings);
  const converted = convertParsedLines(parsedLines, settings)
    .filter((line): line is string => settings.preserveBlankLines || line !== null);

  return converted.join(ending);
}

export function convertMarkedBlocks(text: string, settings: IndentToHeadingsSettings, lineEnding?: string): string {
  const ending = lineEnding ?? (text.includes("\r\n") ? "\r\n" : "\n");
  const lines = text.split(/\r?\n/);
  const output: string[] = [];
  let blockLines: string[] | null = null;

  for (const line of lines) {
    if (line.trim() === START_MARKER) {
      output.push(line);
      blockLines = [];
      continue;
    }

    if (line.trim() === END_MARKER && blockLines) {
      output.push(convertPlainText(blockLines.join(ending), settings, ending));
      output.push(line);
      blockLines = null;
      continue;
    }

    if (blockLines) {
      blockLines.push(line);
    } else {
      output.push(line);
    }
  }

  if (blockLines) {
    output.push(...blockLines);
  }

  return output.join(ending);
}

export function countMarkedBlocks(text: string): number {
  const lines = text.split(/\r?\n/);
  let open = false;
  let count = 0;

  for (const line of lines) {
    if (!open && line.trim() === START_MARKER) {
      open = true;
      continue;
    }

    if (open && line.trim() === END_MARKER) {
      count += 1;
      open = false;
    }
  }

  return count;
}

function parseLines(text: string, settings: IndentToHeadingsSettings): ParsedLine[] {
  const lines = text.split(/\r?\n/);
  const parsedLines: ParsedLine[] = [];
  let activeFence: Fence | null = null;

  for (const original of lines) {
    const fence = readFence(original);

    if (activeFence) {
      parsedLines.push({ original, kind: "code" });

      if (fence && fence.marker === activeFence.marker && fence.length >= activeFence.length) {
        activeFence = null;
      }

      continue;
    }

    if (fence) {
      activeFence = fence;
      parsedLines.push({ original, kind: "code" });
      continue;
    }

    parsedLines.push(parseLine(original, settings));
  }

  return parsedLines;
}

function parseLine(original: string, settings: IndentToHeadingsSettings): ParsedLine {
  if (original.trim() === "") {
    return { original, kind: "blank" };
  }

  const headingMatch = original.match(/^\s{0,3}(#{1,6})\s+\S/);
  if (headingMatch) {
    return {
      original,
      kind: "heading",
      headingLevel: headingMatch[1].length,
    };
  }

  const { indentLevel, contentStart } = readIndent(original, settings.spacesPerIndent);
  const rawContent = original.slice(contentStart).trim();
  const normalized = normalizeContent(rawContent, settings.stripListMarkers);

  return {
    original,
    kind: "plain",
    indentLevel,
    content: normalized.content,
    listMarker: normalized.listMarker,
  };
}

function convertParsedLines(parsedLines: ParsedLine[], settings: IndentToHeadingsSettings): Array<string | null> {
  const output: Array<string | null> = [];
  let outlineStack: OutlineStackItem[] = [];
  let outlineBlock: OutlineBlock | null = null;

  parsedLines.forEach((line, index) => {
    if (line.kind === "blank") {
      output.push(settings.preserveBlankLines ? line.original : null);
      return;
    }

    if (line.kind === "code" || line.kind === "heading") {
      outlineStack = [];
      outlineBlock = null;
      output.push(line.original);
      return;
    }

    if (!line.content) {
      output.push(settings.preserveBlankLines ? "" : null);
      return;
    }

    while (outlineStack.length > 0 && outlineStack[outlineStack.length - 1].indentLevel >= line.indentLevel!) {
      outlineStack.pop();
    }

    const shouldBecomeHeading = !settings.leafLinesAsText || hasEnoughIndentedChildren(index, parsedLines, settings);

    if (shouldBecomeHeading) {
      if (!outlineBlock || outlineStack.length === 0) {
        outlineBlock = createOutlineBlock(index, line, parsedLines, settings);
      }

      const headingLevel = clamp(
        outlineBlock.baseHeadingLevel + line.indentLevel! - outlineBlock.baseIndentLevel,
        1,
        6
      );

      output.push(`${"#".repeat(headingLevel)} ${line.content}`);
      outlineStack.push({ indentLevel: line.indentLevel!, headingLevel });
      return;
    }

    if (outlineStack.length > 0) {
      output.push(formatLeafLine(line, settings));
      return;
    }

    outlineBlock = null;
    output.push(line.original);
  });

  return output;
}

function createOutlineBlock(
  index: number,
  line: ParsedLine,
  parsedLines: ParsedLine[],
  settings: IndentToHeadingsSettings
): OutlineBlock {
  const previousHeading = findPreviousHeading(index, parsedLines);
  const previousMeaningfulLine = findPreviousMeaningfulLine(index, parsedLines);
  let baseHeadingLevel = settings.baseHeadingLevel;

  if (previousHeading) {
    baseHeadingLevel = previousMeaningfulLine && previousMeaningfulLine.kind === "heading"
      ? previousHeading.headingLevel! + 1
      : previousHeading.headingLevel!;
  }

  return {
    baseHeadingLevel: clamp(baseHeadingLevel, 1, 6),
    baseIndentLevel: line.indentLevel!,
  };
}

function hasEnoughIndentedChildren(
  index: number,
  parsedLines: ParsedLine[],
  settings: IndentToHeadingsSettings
): boolean {
  const current = parsedLines[index];
  const requiredChildren = Math.max(1, settings.minimumChildrenForHeading);
  let childIndentLevel: number | null = null;
  let childCount = 0;

  for (let nextIndex = index + 1; nextIndex < parsedLines.length; nextIndex += 1) {
    const next = parsedLines[nextIndex];

    if (next.kind === "blank") {
      continue;
    }

    if (next.kind === "code" || next.kind === "heading" || next.indentLevel! <= current.indentLevel!) {
      return childCount >= requiredChildren;
    }

    if (childIndentLevel === null) {
      childIndentLevel = next.indentLevel!;
    }

    if (next.indentLevel === childIndentLevel && next.content) {
      childCount += 1;
    }

    if (childCount >= requiredChildren) {
      return true;
    }
  }

  return childCount >= requiredChildren;
}

function findPreviousHeading(index: number, parsedLines: ParsedLine[]): ParsedLine | null {
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previous = parsedLines[previousIndex];

    if (previous.kind === "heading") {
      return previous;
    }
  }

  return null;
}

function findPreviousMeaningfulLine(index: number, parsedLines: ParsedLine[]): ParsedLine | null {
  for (let previousIndex = index - 1; previousIndex >= 0; previousIndex -= 1) {
    const previous = parsedLines[previousIndex];

    if (previous.kind !== "blank" && previous.kind !== "code" && previous.content !== "") {
      return previous;
    }
  }

  return null;
}

function formatLeafLine(line: ParsedLine, settings: IndentToHeadingsSettings): string {
  if (settings.preserveLeafListMarkers && line.listMarker) {
    return `${line.listMarker}${line.content}`;
  }

  if (settings.leafTextStyle === "bullet") {
    return `- ${line.content}`;
  }

  return line.content!;
}

function readIndent(line: string, spacesPerIndent: number): { indentLevel: number; contentStart: number } {
  let indentLevel = 0;
  let spaces = 0;
  let index = 0;

  while (index < line.length) {
    const char = line[index];

    if (char === "\t") {
      indentLevel += 1;
      spaces = 0;
      index += 1;
      continue;
    }

    if (char === " ") {
      spaces += 1;
      if (spaces === spacesPerIndent) {
        indentLevel += 1;
        spaces = 0;
      }
      index += 1;
      continue;
    }

    break;
  }

  return { indentLevel, contentStart: index };
}

function normalizeContent(content: string, stripListMarkers: boolean): { content: string; listMarker?: string } {
  let normalized = content.replace(/^#{1,6}\s+/, "");
  const listMarkerMatch = normalized.match(/^((?:[-*+]|\d+[.)])\s+(?:\[[ xX]\]\s+)?)?(.+)$/);
  const listMarker = listMarkerMatch?.[1];

  if (stripListMarkers && listMarker) {
    normalized = normalized.slice(listMarker.length);
  }

  return {
    content: normalized.trim(),
    listMarker,
  };
}

function readFence(line: string): Fence | null {
  const match = line.match(/^\s{0,3}(`{3,}|~{3,})/);

  if (!match) {
    return null;
  }

  const fence = match[1];
  return {
    marker: fence[0] as "`" | "~",
    length: fence.length,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
