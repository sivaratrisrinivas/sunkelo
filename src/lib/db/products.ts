import { getDbClient } from "./client";
import type { NewProductInput, Product } from "@/types/product";

type ProductRow = {
  id: string;
  brand: string;
  model: string;
  slug: string;
  price_range: string | null;
  is_trending: boolean;
  created_at: string;
  updated_at: string;
};

function mapRow(row: ProductRow): Product {
  return {
    id: Number(row.id),
    brand: row.brand,
    model: row.model,
    slug: row.slug,
    priceRange: row.price_range,
    isTrending: row.is_trending,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
  };
}

export async function createProduct(input: NewProductInput): Promise<Product> {
  const sql = getDbClient();
  const rows = (await sql`
    INSERT INTO products (brand, model, slug, price_range, is_trending)
    VALUES (${input.brand}, ${input.model}, ${input.slug}, ${input.priceRange ?? null}, ${input.isTrending ?? false})
    RETURNING id, brand, model, slug, price_range, is_trending, created_at, updated_at
  `) as ProductRow[];

  return mapRow(rows[0]);
}

export async function getBySlug(slug: string): Promise<Product | null> {
  const sql = getDbClient();
  const rows = (await sql`
    SELECT id, brand, model, slug, price_range, is_trending, created_at, updated_at
    FROM products
    WHERE slug = ${slug}
    LIMIT 1
  `) as ProductRow[];

  return rows[0] ? mapRow(rows[0]) : null;
}

export async function listTrending(limit = 10): Promise<Product[]> {
  const sql = getDbClient();
  const rows = (await sql`
    SELECT id, brand, model, slug, price_range, is_trending, created_at, updated_at
    FROM products
    WHERE is_trending = TRUE
    ORDER BY updated_at DESC
    LIMIT ${limit}
  `) as ProductRow[];

  return rows.map(mapRow);
}

export async function setTrending(slug: string, isTrending: boolean): Promise<void> {
  const sql = getDbClient();
  await sql`
    UPDATE products
    SET is_trending = ${isTrending}, updated_at = NOW()
    WHERE slug = ${slug}
  `;
}

export async function upsertProductBySlug(input: {
  slug: string;
  brand?: string | null;
  model: string;
  priceRange?: string | null;
  isTrending?: boolean;
}): Promise<Product> {
  const sql = getDbClient();
  const brand = input.brand?.trim() || "Unknown";
  const model = input.model.trim() || input.slug;
  const rows = (await sql`
    INSERT INTO products (brand, model, slug, price_range, is_trending)
    VALUES (${brand}, ${model}, ${input.slug}, ${input.priceRange ?? null}, ${input.isTrending ?? false})
    ON CONFLICT (slug)
    DO UPDATE SET
      brand = EXCLUDED.brand,
      model = EXCLUDED.model,
      price_range = COALESCE(products.price_range, EXCLUDED.price_range),
      updated_at = NOW()
    RETURNING id, brand, model, slug, price_range, is_trending, created_at, updated_at
  `) as ProductRow[];

  return mapRow(rows[0]);
}
