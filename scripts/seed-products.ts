import { getDbClient } from "@/lib/db/client";
import { getRedisClient } from "@/lib/cache/client";
import { toSlug } from "@/lib/utils/slug";

type PhoneSeed = {
  brand: string;
  model: string;
  priceRange: string;
};

const phones: PhoneSeed[] = [
  { brand: "Apple", model: "iPhone 16", priceRange: "INR 79,900 - 89,900" },
  { brand: "Apple", model: "iPhone 16 Plus", priceRange: "INR 89,900 - 99,900" },
  { brand: "Apple", model: "iPhone 16 Pro", priceRange: "INR 119,900 - 139,900" },
  { brand: "Apple", model: "iPhone 16 Pro Max", priceRange: "INR 139,900 - 159,900" },
  { brand: "Samsung", model: "Galaxy S24", priceRange: "INR 74,999 - 84,999" },
  { brand: "Samsung", model: "Galaxy S24 Plus", priceRange: "INR 99,999 - 109,999" },
  { brand: "Samsung", model: "Galaxy S24 Ultra", priceRange: "INR 129,999 - 149,999" },
  { brand: "Samsung", model: "Galaxy A55", priceRange: "INR 35,999 - 42,999" },
  { brand: "Samsung", model: "Galaxy M15", priceRange: "INR 12,999 - 16,999" },
  { brand: "Samsung", model: "Galaxy F55", priceRange: "INR 26,999 - 31,999" },
  { brand: "Xiaomi", model: "Redmi Note 15", priceRange: "INR 18,999 - 23,999" },
  { brand: "Xiaomi", model: "Redmi Note 15 Pro", priceRange: "INR 24,999 - 29,999" },
  { brand: "Xiaomi", model: "Redmi Note 15 Pro+", priceRange: "INR 29,999 - 34,999" },
  { brand: "Xiaomi", model: "Xiaomi 14", priceRange: "INR 69,999 - 79,999" },
  { brand: "Xiaomi", model: "Poco X7", priceRange: "INR 19,999 - 24,999" },
  { brand: "Xiaomi", model: "Poco F7", priceRange: "INR 29,999 - 35,999" },
  { brand: "OnePlus", model: "OnePlus 12", priceRange: "INR 64,999 - 74,999" },
  { brand: "OnePlus", model: "OnePlus 12R", priceRange: "INR 39,999 - 45,999" },
  { brand: "OnePlus", model: "OnePlus Nord 4", priceRange: "INR 29,999 - 34,999" },
  { brand: "OnePlus", model: "OnePlus Nord CE 4", priceRange: "INR 22,999 - 27,999" },
  { brand: "OnePlus", model: "OnePlus Open", priceRange: "INR 129,999 - 149,999" },
  { brand: "Google", model: "Pixel 9", priceRange: "INR 79,999 - 89,999" },
  { brand: "Google", model: "Pixel 9 Pro", priceRange: "INR 109,999 - 124,999" },
  { brand: "Google", model: "Pixel 8a", priceRange: "INR 49,999 - 54,999" },
  { brand: "Google", model: "Pixel Fold", priceRange: "INR 154,999 - 169,999" },
  { brand: "Vivo", model: "Vivo X100", priceRange: "INR 63,999 - 72,999" },
  { brand: "Vivo", model: "Vivo V30 Pro", priceRange: "INR 39,999 - 45,999" },
  { brand: "Vivo", model: "iQOO 12", priceRange: "INR 52,999 - 59,999" },
  { brand: "Vivo", model: "iQOO Neo 9 Pro", priceRange: "INR 34,999 - 39,999" },
  { brand: "Vivo", model: "Vivo T3", priceRange: "INR 18,999 - 21,999" },
  { brand: "Oppo", model: "Find X8", priceRange: "INR 74,999 - 84,999" },
  { brand: "Oppo", model: "Reno 12 Pro", priceRange: "INR 36,999 - 42,999" },
  { brand: "Oppo", model: "F27 Pro+", priceRange: "INR 27,999 - 32,999" },
  { brand: "Oppo", model: "A3 Pro", priceRange: "INR 16,999 - 21,999" },
  { brand: "Nothing", model: "Phone (2)", priceRange: "INR 39,999 - 44,999" },
  { brand: "Nothing", model: "Phone (2a)", priceRange: "INR 23,999 - 27,999" },
  { brand: "Nothing", model: "Phone (3)", priceRange: "INR 49,999 - 55,999" },
  { brand: "Motorola", model: "Edge 50 Pro", priceRange: "INR 31,999 - 37,999" },
  { brand: "Motorola", model: "Edge 50 Fusion", priceRange: "INR 21,999 - 25,999" },
  { brand: "Motorola", model: "Razr 50 Ultra", priceRange: "INR 99,999 - 119,999" },
  { brand: "Realme", model: "GT 6", priceRange: "INR 35,999 - 42,999" },
  { brand: "Realme", model: "Narzo 70 Pro", priceRange: "INR 18,999 - 22,999" },
  { brand: "Realme", model: "12 Pro+", priceRange: "INR 29,999 - 34,999" },
  { brand: "Infinix", model: "GT 20 Pro", priceRange: "INR 23,999 - 27,999" },
  { brand: "Infinix", model: "Note 40 Pro", priceRange: "INR 19,999 - 24,999" },
  { brand: "Tecno", model: "Camon 30 Premier", priceRange: "INR 29,999 - 35,999" },
  { brand: "Tecno", model: "Pova 6 Pro", priceRange: "INR 17,999 - 21,999" },
  { brand: "Lava", model: "Agni 2", priceRange: "INR 21,999 - 25,999" },
  { brand: "Nokia", model: "XR21", priceRange: "INR 42,999 - 49,999" },
  { brand: "Honor", model: "Magic 6 Pro", priceRange: "INR 89,999 - 104,999" },
];

const ALIAS_TTL_SECONDS = 30 * 24 * 60 * 60;

function buildAliases(phone: PhoneSeed): string[] {
  const aliases = new Set<string>();
  const full = `${phone.brand} ${phone.model}`;
  const normalizedFull = toSlug(full);
  const normalizedModel = toSlug(phone.model);
  if (normalizedFull) aliases.add(normalizedFull);
  if (normalizedModel) aliases.add(normalizedModel);

  const shortModelMatch = phone.model.match(/\b([A-Za-z]+)\s*([0-9]{1,3})\b/);
  if (shortModelMatch) {
    aliases.add(toSlug(`${shortModelMatch[1]} ${shortModelMatch[2]}`));
    aliases.add(toSlug(shortModelMatch[2]));
  }

  const compactGalaxy = phone.model.match(/Galaxy\s+([A-Z])\s*([0-9]{1,3})/i);
  if (compactGalaxy) {
    aliases.add(toSlug(`${compactGalaxy[1]}${compactGalaxy[2]}`));
  }

  return Array.from(aliases).filter(Boolean);
}

async function main() {
  const sql = getDbClient();
  const redis = getRedisClient();
  const topTrendingCount = 10;
  let aliasCount = 0;

  for (let index = 0; index < phones.length; index += 1) {
    const phone = phones[index];
    const slug = toSlug(`${phone.brand} ${phone.model}`);

    await sql`
      INSERT INTO products (brand, model, slug, price_range, is_trending, updated_at)
      VALUES (${phone.brand}, ${phone.model}, ${slug}, ${phone.priceRange}, ${index < topTrendingCount}, NOW())
      ON CONFLICT (slug)
      DO UPDATE SET
        brand = EXCLUDED.brand,
        model = EXCLUDED.model,
        price_range = EXCLUDED.price_range,
        is_trending = EXCLUDED.is_trending,
        updated_at = NOW()
    `;

    const aliases = buildAliases(phone);
    for (const alias of aliases) {
      await redis.set(`product:alias:${alias}`, slug, {
        ex: ALIAS_TTL_SECONDS,
      });
      aliasCount += 1;
    }
  }

  console.log(
    `Seeded ${phones.length} products (${topTrendingCount} trending) and ${aliasCount} aliases.`,
  );
}

main().catch((error) => {
  console.error("Failed to seed products", error);
  process.exit(1);
});
