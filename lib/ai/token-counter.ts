/**
 * Rough token estimator for Cerebras API budgeting.
 * English text: ~1.3 tokens per word, or ~0.25 tokens per character.
 * This is conservative (overestimates slightly) to stay under limits.
 */
export function estimateTokens(text: string): number {
  // Split by whitespace for word count
  const words = text.trim().split(/\s+/).length;
  // Characters / 4 is a common heuristic
  const byChars = Math.ceil(text.length / 3.5);
  // Take the higher estimate to be safe
  return Math.max(byChars, Math.ceil(words * 1.4));
}

export function estimatePages(
  text: string,
  wordsPerPage: number = 500,
): number {
  const words = text.trim().split(/\s+/).length;
  return Math.ceil(words / wordsPerPage);
}

/**
 * Split text into chunks that fit within a token budget.
 * Default: 50,000 tokens input budget (leaving ~15k for prompt + response)
 */
export function splitByTokenBudget(
  text: string,
  maxTokensPerChunk: number = 50000,
  overlapWords: number = 200,
): string[] {
  const estimatedTokens = estimateTokens(text);
  if (estimatedTokens <= maxTokensPerChunk) return [text];

  // Target character count per chunk (conservative: ~3.5 chars/token)
  const targetChars = Math.floor(maxTokensPerChunk * 3.2);
  const overlapChars = overlapWords * 5;

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + targetChars, text.length);
    let breakPoint = end;

    if (end < text.length) {
      // Look for sentence boundary in last 500 chars of chunk
      const searchWindow = text.slice(Math.max(start, end - 500), end);
      const lastSentence = Math.max(
        searchWindow.lastIndexOf(". "),
        searchWindow.lastIndexOf("! "),
        searchWindow.lastIndexOf("? "),
        searchWindow.lastIndexOf("\n\n"),
      );
      if (lastSentence > 0) {
        breakPoint = Math.max(start, end - 500) + lastSentence + 1;
      }
    }

    chunks.push(text.slice(start, breakPoint).trim());
    start = breakPoint - overlapChars;
    if (start >= breakPoint) start = breakPoint;
  }

  return chunks.filter((c) => c.length > 0);
}
