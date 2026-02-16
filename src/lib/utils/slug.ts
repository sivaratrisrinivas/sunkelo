const NON_WORD_PATTERN = /[^\p{Letter}\p{Number}]+/gu;

export function toSlug(value: string): string {
  return value
    .trim()
    .normalize("NFKD")
    .replace(/\+/g, " plus ")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(NON_WORD_PATTERN, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}
