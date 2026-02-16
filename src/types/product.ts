export type Product = {
  id: number;
  brand: string;
  model: string;
  slug: string;
  priceRange?: string | null;
  isTrending: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type NewProductInput = {
  brand: string;
  model: string;
  slug: string;
  priceRange?: string | null;
  isTrending?: boolean;
};
