import { z } from "zod";

import { getRedisClient } from "../cache/client";
import { getBySlug } from "../db/products";
import { createChatCompletion } from "../sarvam/chat";
import { toSlug } from "../utils/slug";

const entityResponseSchema = z.object({
  intent: z.enum(["product_review", "unsupported"]),
  brand: z.string().nullable().optional(),
  model: z.string().nullable().optional(),
  variant: z.string().nullable().optional(),
});

export type ExtractedEntity = {
  intent: "product_review" | "unsupported";
  brand: string | null;
  model: string | null;
  variant: string | null;
  slug: string | null;
  productName: string | null;
};

const ENTITY_SYSTEM_PROMPT =
  'You are a phone product entity extractor. Return ONLY JSON with shape {"intent":"product_review"|"unsupported","brand":"string|null","model":"string|null","variant":"string|null"}. If query is not about a phone review intent, return {"intent":"unsupported","brand":null,"model":null,"variant":null}.';

function extractJson(value: string): string {
  const start = value.indexOf("{");
  const end = value.lastIndexOf("}");
  if (start === -1 || end === -1 || end <= start) {
    throw new Error("Entity extractor did not return JSON");
  }
  return value.slice(start, end + 1);
}

export async function extractIntentAndEntity(query: string): Promise<ExtractedEntity> {
  const content = await createChatCompletion({
    model: "sarvam-m",
    temperature: 0.1,
    messages: [
      { role: "system", content: ENTITY_SYSTEM_PROMPT },
      { role: "user", content: query },
    ],
  });

  const raw = entityResponseSchema.parse(JSON.parse(extractJson(content)));
  if (raw.intent === "unsupported") {
    return {
      intent: "unsupported",
      brand: null,
      model: null,
      variant: null,
      slug: null,
      productName: null,
    };
  }

  const brand = raw.brand?.trim() || null;
  const model = raw.model?.trim() || null;
  const variant = raw.variant?.trim() || null;
  const name = [brand, model, variant].filter(Boolean).join(" ").trim();
  const slug = name ? toSlug(name) : toSlug(query);

  return {
    intent: "product_review",
    brand,
    model,
    variant,
    slug: slug || null,
    productName: name || null,
  };
}

export async function resolveCanonicalSlug(input: {
  transcript: string;
  extractedSlug: string;
}): Promise<string> {
  try {
    const redis = getRedisClient();
    const normalizedAlias = toSlug(input.transcript);
    const aliasValue = await redis.get<string>(`product:alias:${normalizedAlias}`);
    if (aliasValue) {
      return aliasValue;
    }
  } catch {
    // Redis alias cache is optional during local/dev verification.
  }

  const existing = await getBySlug(input.extractedSlug);
  if (existing) {
    return existing.slug;
  }

  return input.extractedSlug;
}
