const SCRIPT_DETECTORS: Array<{ code: string; regex: RegExp }> = [
  { code: "hi-IN", regex: /[\u0900-\u097F]/ }, // Devanagari
  { code: "bn-IN", regex: /[\u0980-\u09FF]/ }, // Bengali/Assamese
  { code: "gu-IN", regex: /[\u0A80-\u0AFF]/ }, // Gujarati
  { code: "pa-IN", regex: /[\u0A00-\u0A7F]/ }, // Gurmukhi
  { code: "od-IN", regex: /[\u0B00-\u0B7F]/ }, // Odia
  { code: "ta-IN", regex: /[\u0B80-\u0BFF]/ }, // Tamil
  { code: "te-IN", regex: /[\u0C00-\u0C7F]/ }, // Telugu
  { code: "kn-IN", regex: /[\u0C80-\u0CFF]/ }, // Kannada
  { code: "ml-IN", regex: /[\u0D00-\u0D7F]/ }, // Malayalam
];

export function detectLanguageCodeFromText(input: string): string {
  for (const detector of SCRIPT_DETECTORS) {
    if (detector.regex.test(input)) {
      return detector.code;
    }
  }

  // For Latin/mixed text, default to English.
  return "en-IN";
}
