import type { ScrapedReviewSource } from "./scraper";

const MAX_SOURCE_CONTENT_CHARS = 2000;
const ECOMMERCE_REVIEW_SENTENCE_LIMIT = 14;

const BOILERPLATE_PATTERNS = [
  /privacy policy/gi,
  /terms (of service|and conditions)/gi,
  /cookie(s)? (policy|preferences)/gi,
  /subscribe to (our )?newsletter/gi,
  /sign in to (continue|read more)/gi,
  /advertisement/gi,
  /sponsored/gi,
  /related (articles|posts)/gi,
];

function stripMarkdown(input: string): string {
  return (
    input
      // Remove images and links while preserving visible text.
      .replace(/!\[[^\]]*]\([^)]*\)/g, " ")
      .replace(/\[([^\]]+)]\([^)]*\)/g, "$1")
      // Remove code fences and inline code markers.
      .replace(/`{1,3}/g, " ")
      // Remove headings, bullets, blockquotes, tables.
      .replace(/^[>#*|\-+]+\s*/gm, " ")
      .replace(/\|/g, " ")
  );
}

function normalizeWhitespace(input: string): string {
  return input
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

function stripBoilerplate(input: string): string {
  let cleaned = input;
  for (const pattern of BOILERPLATE_PATTERNS) {
    cleaned = cleaned.replace(pattern, " ");
  }
  return cleaned;
}

function truncateAtSentenceBoundary(input: string, maxChars: number): string {
  if (input.length <= maxChars) {
    return input;
  }

  const candidate = input.slice(0, maxChars);
  const punctuationIndexes = [candidate.lastIndexOf("."), candidate.lastIndexOf("!"), candidate.lastIndexOf("?")];
  const cutoff = Math.max(...punctuationIndexes);

  if (cutoff >= Math.floor(maxChars * 0.6)) {
    return candidate.slice(0, cutoff + 1).trim();
  }

  return candidate.trim();
}

function extractReviewSentences(input: string): string {
  const sentences = input
    .split(/(?<=[.!?])\s+/)
    .map((sentence) => sentence.trim())
    .filter(Boolean);

  if (!sentences.length) {
    return input;
  }

  const reviewSignal =
    /(review|rating|star|customer|buyer|verified|purchase|value for money|quality|delivery|fit|size|comfortable|defect|return|exchange|pros|cons|good|bad)/i;
  const picked = sentences.filter((sentence) => reviewSignal.test(sentence));
  const selected = (picked.length >= 3 ? picked : sentences).slice(0, ECOMMERCE_REVIEW_SENTENCE_LIMIT);
  return selected.join(" ");
}

export function parseReviewMarkdown(markdown: string): string {
  const withoutMarkdown = stripMarkdown(markdown);
  const withoutBoilerplate = stripBoilerplate(withoutMarkdown);
  const normalized = normalizeWhitespace(withoutBoilerplate);
  return truncateAtSentenceBoundary(normalized, MAX_SOURCE_CONTENT_CHARS);
}

export function parseScrapedSource(source: ScrapedReviewSource): ScrapedReviewSource {
  const parsedContent = parseReviewMarkdown(source.content);
  if (source.type === "ecommerce") {
    return {
      ...source,
      content: truncateAtSentenceBoundary(extractReviewSentences(parsedContent), MAX_SOURCE_CONTENT_CHARS),
    };
  }

  return {
    ...source,
    content: parsedContent,
  };
}

export const FIRECRAWL_SOURCE_CONTENT_LIMIT = MAX_SOURCE_CONTENT_CHARS;
