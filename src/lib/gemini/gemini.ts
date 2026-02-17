import type { SynthesizedReview } from "@/lib/pipeline/synthesize";
import { getDisplayName } from "@/lib/utils/languages";

const GEMINI_API_URL = "https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent";

function buildPrompt(languageName: string): string {
    return `
You are writing a short, conversational audio script summarizing a product review for a listener.
Write as if you're a knowledgeable friend explaining the product — natural, warm, opinionated.
IMPORTANT: Write the ENTIRE script in ${languageName}. The listener speaks ${languageName}.

Rules:
- Keep it under 150 words (roughly 60 seconds when spoken).
- Start with the product verdict and why — don't say "Here is a review" or anything robotic.
- Mention 2-3 key pros and 1-2 key cons naturally in sentences, not as lists.
- End with who it's best for.
- Do NOT use bullet points, headings, or markdown — this is spoken text.
- Do NOT mention source names, URLs, or scores.
- Sound like a real person, not a press release.
- The ENTIRE output must be in ${languageName}. Do NOT mix languages.
`.trim();
}

function buildReviewContext(review: SynthesizedReview, productName: string): string {
    return [
        `Product: ${productName}`,
        `Verdict: ${review.verdict}`,
        `Confidence: ${Math.round(review.confidenceScore * 100)}%`,
        `Summary: ${review.summary}`,
        `Pros: ${review.pros.join(", ")}`,
        `Cons: ${review.cons.join(", ")}`,
        `Best for: ${review.bestFor}`,
    ].join("\n");
}

export async function generateAudioScript(params: {
    review: SynthesizedReview;
    productName: string;
    languageCode: string;
}): Promise<string> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
        throw new Error("GEMINI_API_KEY not set");
    }

    const languageName = getDisplayName(params.languageCode);
    const prompt = buildPrompt(languageName);
    const context = buildReviewContext(params.review, params.productName);

    console.info("[gemini] requesting audio script", {
        productName: params.productName,
        languageCode: params.languageCode,
        languageName,
        model: "gemini-2.0-flash",
    });

    const response = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            contents: [
                {
                    parts: [
                        { text: `${prompt}\n\n${context}` },
                    ],
                },
            ],
            generationConfig: {
                temperature: 0.7,
                maxOutputTokens: 300,
            },
        }),
    });

    if (!response.ok) {
        const body = await response.text().catch(() => "");
        console.error("[gemini] API error", {
            status: response.status,
            body: body.slice(0, 200),
        });
        throw new Error(`Gemini API error ${response.status}: ${body.slice(0, 200)}`);
    }

    const data = (await response.json()) as {
        candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
        }>;
    };

    const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) {
        throw new Error("Gemini returned empty response");
    }

    console.info("[gemini] audio script generated", {
        productName: params.productName,
        languageCode: params.languageCode,
        scriptLength: text.length,
        scriptPreview: text.slice(0, 80),
    });

    return text;
}
