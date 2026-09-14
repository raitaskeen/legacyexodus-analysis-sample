/**
 * Minimal dependency-free table formatter for LegacyExodus CLI.
 * Uses Unicode box-drawing characters and ANSI-aware string length calculations.
 */

export function stripAnsi(str: string): string {
  // biome-ignore lint/suspicious/noControlCharactersInRegex: Needed for ANSI escape code stripping
  return str.replace(/\x1b\[[0-9;]*m/g, "");
}

export function visibleLength(str: string): number {
  return stripAnsi(str).length;
}

export function isColorEnabled(): boolean {
  if (process.env.NO_COLOR !== undefined && process.env.NO_COLOR !== "") {
    return false;
  }
  if (process.env.CI !== undefined) {
    return false;
  }
  return Boolean(process.stdout?.isTTY);
}

export function colorize(text: string, colorCode: string): string {
  if (!isColorEnabled()) return text;
  return `\x1b[${colorCode}m${text}\x1b[0m`;
}

export function truncateCell(content: string, maxWidth: number): string {
  const visible = visibleLength(content);
  if (visible <= maxWidth) {
    return content;
  }
  if (maxWidth <= 1) {
    return "…";
  }
  const plain = stripAnsi(content);
  return `${plain.slice(0, maxWidth - 1)}…`;
}

export function getTerminalWidth(): number {
  const cols = process.stdout?.columns;
  if (typeof cols === "number" && cols > 20) {
    return cols;
  }
  return 80;
}

function padCell(content: string, width: number): string {
  const visible = visibleLength(content);
  const diff = Math.max(0, width - visible);
  return `${content}${" ".repeat(diff)}`;
}

/**
 * Renders a compact two-column key/value table.
 *
 * Example:
 * ┌─────────────────┬────────────────────┐
 * │ File            │ sample.ts          │
 * │ State           │ RESOLVED           │
 * └─────────────────┴────────────────────┘
 */
export function renderKeyValueTable(
  entries: readonly (readonly [string, string])[],
  maxWidth: number = getTerminalWidth()
): string {
  if (entries.length === 0) return "";

  let keyWidth = 15;
  let valWidth = 18;

  for (const [k, v] of entries) {
    keyWidth = Math.max(keyWidth, visibleLength(k));
    valWidth = Math.max(valWidth, visibleLength(v));
  }

  // Ensure table fits in terminal
  const tableMargin = 7; // borders + spaces: │ (1) + ' ' (1) + ' ' (1) + │ (1) + ' ' (1) + ' ' (1) + │ (1)
  if (keyWidth + valWidth + tableMargin > maxWidth) {
    const available = Math.max(10, maxWidth - keyWidth - tableMargin);
    valWidth = available;
  }

  const lines: string[] = [];

  // Top border
  lines.push(`┌─${"─".repeat(keyWidth)}─┬─${"─".repeat(valWidth)}─┐`);

  // Rows
  for (const [k, v] of entries) {
    const formattedKey = padCell(truncateCell(k, keyWidth), keyWidth);
    const formattedVal = padCell(truncateCell(v, valWidth), valWidth);
    lines.push(`│ ${formattedKey} │ ${formattedVal} │`);
  }

  // Bottom border
  lines.push(`└─${"─".repeat(keyWidth)}─┴─${"─".repeat(valWidth)}─┘`);

  return lines.join("\n");
}

/**
 * Renders a multi-column table with headers and rows.
 *
 * Example:
 * ┌───────┬───────────┬─────────────────┬─────────────────────────┐
 * │ Block │ Reachable │ Statement       │ Next                    │
 * ├───────┼───────────┼─────────────────┼─────────────────────────┤
 * │ entry │ yes       │ IfStatement     │ b1 [true], b2 [false]   │
 * └───────┴───────────┴─────────────────┴─────────────────────────┘
 */
export function renderTable(
  headers: readonly string[],
  rows: readonly (readonly string[])[],
  maxWidth: number = getTerminalWidth()
): string {
  const colCount = headers.length;
  if (colCount === 0) return "";

  const colWidths = headers.map((h) => visibleLength(h));

  for (const row of rows) {
    for (let i = 0; i < colCount; i++) {
      const cell = row[i] ?? "";
      colWidths[i] = Math.max(colWidths[i] ?? 0, visibleLength(cell));
    }
  }

  // Minimum column padding
  const totalBorders = colCount * 3 + 1; // "│ " and " │"
  const totalNaturalWidth = colWidths.reduce((a, b) => a + b, 0) + totalBorders;

  if (totalNaturalWidth > maxWidth) {
    // Shrink the widest columns to fit terminal width
    let excess = totalNaturalWidth - maxWidth;
    while (excess > 0) {
      let maxIdx = 0;
      let maxVal = colWidths[0] ?? 0;
      for (let i = 1; i < colCount; i++) {
        const val = colWidths[i] ?? 0;
        if (val > maxVal) {
          maxVal = val;
          maxIdx = i;
        }
      }
      if (maxVal <= 6) break; // Don't shrink below minimum usable width
      colWidths[maxIdx] = maxVal - 1;
      excess--;
    }
  }

  const lines: string[] = [];

  // Top border
  const topSegments = colWidths.map((w) => "─".repeat(w + 2));
  lines.push(`┌${topSegments.join("┬")}┐`);

  // Header row
  const headerCells = headers.map((h, i) => {
    const w = colWidths[i] ?? visibleLength(h);
    return ` ${padCell(truncateCell(h, w), w)} `;
  });
  lines.push(`│${headerCells.join("│")}│`);

  // Header separator
  const midSegments = colWidths.map((w) => "─".repeat(w + 2));
  lines.push(`├${midSegments.join("┼")}┤`);

  // Data rows
  for (const row of rows) {
    const cells = headers.map((_, i) => {
      const cell = row[i] ?? "";
      const w = colWidths[i] ?? visibleLength(cell);
      return ` ${padCell(truncateCell(cell, w), w)} `;
    });
    lines.push(`│${cells.join("│")}│`);
  }

  // Bottom border
  const botSegments = colWidths.map((w) => "─".repeat(w + 2));
  lines.push(`└${botSegments.join("┴")}┘`);

  return lines.join("\n");
}
