import { getRedisClient } from "./client";
import { REVIEW_CACHE_TTL_DAYS, LOCALIZED_CACHE_TTL_DAYS } from "@/lib/utils/constants";
import type { SynthesizedReview } from "@/lib/pipeline/synthesize";

const ALIAS_TTL_DAYS = 30;

function daysTtl(days: number): number {
    return days * 24 * 60 * 60;
}

// ---------------------------------------------------------------------------
// Review cache (English base review keyed by product slug)
// ---------------------------------------------------------------------------

export type CachedReview = SynthesizedReview & {
    reviewId?: number | null;
    productId?: number | null;
};

export async function getCachedReview(slug: string): Promise<CachedReview | null> {
    try {
        const redis = getRedisClient();
        const data = await redis.get<CachedReview>(`review:${slug}`);
        return data ?? null;
    } catch (error) {
        console.error("[cache] getCachedReview failed", { slug, error });
        return null;
    }
}

export async function setCachedReview(slug: string, data: CachedReview): Promise<void> {
    try {
        const redis = getRedisClient();
        await redis.set(`review:${slug}`, data, { ex: daysTtl(REVIEW_CACHE_TTL_DAYS) });
        console.info("[cache] setCachedReview", { slug, ttlDays: REVIEW_CACHE_TTL_DAYS });
    } catch (error) {
        console.error("[cache] setCachedReview failed", { slug, error });
    }
}

// ---------------------------------------------------------------------------
// Localized cache (translated review + audio URL keyed by slug + language)
// ---------------------------------------------------------------------------

export type CachedLocalized = {
    review: SynthesizedReview;
    audioUrl: string | null;
    durationSeconds: number | null;
    ttsLanguageCode: string;
};

export async function getCachedLocalized(
    slug: string,
    languageCode: string,
): Promise<CachedLocalized | null> {
    try {
        const redis = getRedisClient();
        const data = await redis.get<CachedLocalized>(`localized:${slug}:${languageCode}`);
        return data ?? null;
    } catch (error) {
        console.error("[cache] getCachedLocalized failed", { slug, languageCode, error });
        return null;
    }
}

export async function setCachedLocalized(
    slug: string,
    languageCode: string,
    data: CachedLocalized,
): Promise<void> {
    try {
        const redis = getRedisClient();
        await redis.set(`localized:${slug}:${languageCode}`, data, {
            ex: daysTtl(LOCALIZED_CACHE_TTL_DAYS),
        });
        console.info("[cache] setCachedLocalized", { slug, languageCode, ttlDays: LOCALIZED_CACHE_TTL_DAYS });
    } catch (error) {
        console.error("[cache] setCachedLocalized failed", { slug, languageCode, error });
    }
}

// ---------------------------------------------------------------------------
// Alias cache (product name alias → canonical slug)
// ---------------------------------------------------------------------------

export async function getAlias(alias: string): Promise<string | null> {
    try {
        const redis = getRedisClient();
        const slug = await redis.get<string>(`alias:${alias.toLowerCase()}`);
        return slug ?? null;
    } catch (error) {
        console.error("[cache] getAlias failed", { alias, error });
        return null;
    }
}

export async function setAlias(alias: string, canonicalSlug: string): Promise<void> {
    try {
        const redis = getRedisClient();
        await redis.set(`alias:${alias.toLowerCase()}`, canonicalSlug, {
            ex: daysTtl(ALIAS_TTL_DAYS),
        });
    } catch (error) {
        console.error("[cache] setAlias failed", { alias, canonicalSlug, error });
    }
}
