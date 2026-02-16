export type Review = {
  id: number;
  productId: number;
  languageCode: string;
  summary: string;
  tldr: string;
  verdict: "buy" | "skip" | "wait";
  confidenceScore: number;
  pros: string[];
  cons: string[];
  bestFor?: string | null;
  sources: Array<{ title: string; url: string; type?: "blog" | "ecommerce" | "youtube" }>;
  createdAt: Date;
};

export type ReviewTranslation = {
  id: number;
  reviewId: number;
  languageCode: string;
  summary: string;
  tldr: string;
  audioUrl?: string | null;
  createdAt: Date;
};
