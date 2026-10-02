/**
 * GS-T7 word-overlap grounding metric, shared by bench/gs-t7.ts and evals/grounding.
 * A claim is grounded if every number token is in the source and at least 60% of
 * its content tokens appear in the source.
 */

export const GROUNDING_OVERLAP = 0.6;

export type ClaimJudgement = {
  claim: string;
  grounded: boolean;
  overlap: number;
  missingNumbers: string[];
};

export const STOPWORDS = new Set(
  `a an the and or but if then than so as at by for from in into of on onto to with without
   is are was were be been being it its this that these those they them their you your we our
   he she his her very more most less least also just can could should would will
   has have had do does did about over under again still only other another both each few
   many much such same own too when where which who whom why how`.split(/\s+/),
);

export const WORD_NUMBERS: Record<string, string> = {
  one: "1",
  two: "2",
  three: "3",
  four: "4",
  five: "5",
  six: "6",
  seven: "7",
  eight: "8",
  nine: "9",
  ten: "10",
  twelve: "12",
};

export const BARE_NUMBER_UNITS = new Set([
  "mah",
  "ah",
  "wh",
  "kwh",
  "w",
  "kw",
  "mw",
  "hz",
  "khz",
  "mhz",
  "ghz",
  "mp",
  "mm",
  "cm",
  "km",
  "kg",
  "gb",
  "tb",
  "mb",
  "kb",
]);

export function isNumberToken(token: string): boolean {
  return /^\d+(?:\.\d+)?[a-z]*$/.test(token);
}

export function tokenize(text: string): string[] {
  const normalized = text
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, " ")
    .replace(/([a-z])\.(?=\d)/g, "$1 ")
    .replace(/(\d),(?=\d)/g, "$1");
  const tokens: string[] = [];
  for (const raw of normalized.split(/[^a-z0-9.]+/)) {
    const token = raw.replace(/^\.+|\.+$/g, "");
    if (token.length === 0) {
      continue;
    }
    const asNumber = WORD_NUMBERS[token];
    if (asNumber) {
      tokens.push(asNumber);
      continue;
    }
    const bound = /^(\d+(?:\.\d+)?)([a-z].*)$/.exec(token);
    if (bound && bound[1] && bound[2]) {
      tokens.push(token);
      if (BARE_NUMBER_UNITS.has(bound[2])) {
        tokens.push(bound[1]);
      }
    } else {
      tokens.push(token);
    }
  }
  return tokens;
}

export function contentTokens(text: string): string[] {
  return tokenize(text).filter(
    (token) => (token.length > 2 || token === "no") && !STOPWORDS.has(token),
  );
}

export function numberTokens(text: string): string[] {
  return tokenize(text).filter((token) => isNumberToken(token));
}

export function judgeClaim(claim: string, sourceText: string): ClaimJudgement {
  const sourceTokenSet = new Set(contentTokens(sourceText));
  const sourceNumberSet = new Set(numberTokens(sourceText));
  const claimTokens = contentTokens(claim);
  const nums = numberTokens(claim);
  const missingNumbers = nums.filter((num) => !sourceNumberSet.has(num));
  const overlapCount = claimTokens.filter((token) => sourceTokenSet.has(token)).length;
  const overlap = claimTokens.length === 0 ? 0 : overlapCount / claimTokens.length;
  const grounded = missingNumbers.length === 0 && overlap >= GROUNDING_OVERLAP;
  return { claim, grounded, overlap: Number(overlap.toFixed(4)), missingNumbers };
}
