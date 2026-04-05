/**
 * Extract a quoted argument value from a string like: key="value"
 * Handles escaped quotes within values (e.g., key="say \"hello\"")
 * Supports triple-quote for multi-line content: key="""content with "quotes" inside"""
 */
export function extractQuotedArg(args: string, key: string): string | undefined {
  // First try: triple-quote for large/multi-line content (must check before double-quote)
  const tripleRegex = new RegExp(`${key}="""([\\s\\S]*?)"""`, "i");
  const tripleMatch = tripleRegex.exec(args);
  if (tripleMatch) return tripleMatch[1];

  // Standard: match key="value" allowing escaped quotes inside
  const regex = new RegExp(`${key}="((?:[^"\\\\]|\\\\.)*)"`, "i");
  const match = regex.exec(args);
  if (match) return match[1].replace(/\\"/g, '"');

  // Fallback for content with unescaped quotes: grab from key=" to the last "
  // Only used when the key is the last arg (common for "content" and "body" fields)
  const fallbackRegex = new RegExp(`${key}="([\\s\\S]+)"\\s*$`, "i");
  const fallbackMatch = fallbackRegex.exec(args);
  if (fallbackMatch) return fallbackMatch[1];

  return undefined;
}
