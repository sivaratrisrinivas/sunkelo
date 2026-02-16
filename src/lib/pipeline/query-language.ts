import { detectSourceLanguageCode } from "../sarvam/translate";
import { detectLanguageCodeFromText } from "../utils/detect-language";

const SARVAM_SUPPORTED_QUERY_LANGUAGES = new Set([
  "en-IN",
  "hi-IN",
  "bn-IN",
  "ta-IN",
  "te-IN",
  "gu-IN",
  "kn-IN",
  "ml-IN",
  "mr-IN",
  "pa-IN",
  "od-IN",
  "as-IN",
  "ur-IN",
  "ne-IN",
  "kok-IN",
  "ks-IN",
  "sd-IN",
  "sa-IN",
  "sat-IN",
  "mni-IN",
  "brx-IN",
  "mai-IN",
  "doi-IN",
]);

export async function detectQueryLanguageCode(text: string): Promise<string> {
  try {
    const detected = await detectSourceLanguageCode(text);
    if (detected && SARVAM_SUPPORTED_QUERY_LANGUAGES.has(detected)) {
      return detected;
    }
  } catch {
    // Fall back to local script-based detection when remote detection fails.
  }

  const fallback = detectLanguageCodeFromText(text);
  return SARVAM_SUPPORTED_QUERY_LANGUAGES.has(fallback) ? fallback : "en-IN";
}
