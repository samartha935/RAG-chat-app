/**
 * A basic recursive character text splitter.
 * It tries to split on double newlines, then single newlines, then spaces, and finally by character.
 */
export function chunkText(
  text: string,
  maxSize: number = 512,
  overlap: number = 50
): string[] {
  const separators = ["\n\n", "\n", " ", ""];

  function split(textToSplit: string): string[] {
    // If the text is already small enough, return it
    if (textToSplit.length <= maxSize) {
      return [textToSplit];
    }

    // Find the best separator to use
    let activeSeparator = "";
    for (const sep of separators) {
      if (sep === "") {
        activeSeparator = sep;
        break;
      }
      if (textToSplit.includes(sep)) {
        activeSeparator = sep;
        break;
      }
    }

    // Split the text
    const splits =
      activeSeparator === ""
        ? Array.from(textToSplit) // split by char
        : textToSplit.split(activeSeparator);

    const goodSplits: string[] = [];

    // Recursively split any chunks that are still too large
    for (const s of splits) {
      if (s.length > maxSize) {
        goodSplits.push(...split(s));
      } else {
        goodSplits.push(s);
      }
    }

    const combinedChunks: string[] = [];
    const currentChunk: string[] = [];
    let currentLength = 0;

    for (const s of goodSplits) {
      const sepLen = currentChunk.length > 0 ? activeSeparator.length : 0;

      // If adding this piece exceeds max size, we push current chunk to final list
      if (currentLength + sepLen + s.length > maxSize) {
        if (currentChunk.length > 0) {
          combinedChunks.push(currentChunk.join(activeSeparator));
        }

        // Apply overlap: remove from the start of currentChunk until there's enough space
        // While current chunk exceeds overlap, keep removing
        while (
          currentLength > 0 &&
          (currentLength > overlap || currentLength + sepLen + s.length > maxSize)
        ) {
          currentLength -=
            currentChunk[0].length +
            (currentChunk.length > 1 ? activeSeparator.length : 0);
          currentChunk.shift();
        }
      }

      currentChunk.push(s);
      currentLength += s.length + (currentChunk.length > 1 ? activeSeparator.length : 0);
    }

    // Add whatever is left
    if (currentChunk.length > 0) {
      combinedChunks.push(currentChunk.join(activeSeparator));
    }

    return combinedChunks;
  }

  return split(text);
}
