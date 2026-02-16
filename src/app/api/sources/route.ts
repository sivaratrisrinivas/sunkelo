import { NextRequest, NextResponse } from "next/server";

import { scrapeAllSources } from "@/lib/firecrawl/scraper";
import { normalizeSourcesToEnglish } from "@/lib/pipeline/normalize-sources";

type SourcesRequestBody = {
  productSlug?: string;
  product?: string;
};

function slugToProductName(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ");
}

export async function POST(request: NextRequest) {
  const body = (await request.json().catch(() => ({}))) as SourcesRequestBody;
  const rawSlug = body.productSlug?.trim();
  const rawProduct = body.product?.trim();

  if (!rawSlug && !rawProduct) {
    return NextResponse.json({ error: "productSlug or product is required" }, { status: 400 });
  }

  const productName = rawProduct ?? slugToProductName(rawSlug ?? "");
  const sources = await scrapeAllSources(productName);
  const normalized = await normalizeSourcesToEnglish(sources);

  return NextResponse.json(
    {
      product: productName,
      productSlug: rawSlug ?? productName.toLowerCase().replace(/\s+/g, "-"),
      sources: normalized,
      sourceCount: normalized.length,
    },
    { status: 200 },
  );
}
