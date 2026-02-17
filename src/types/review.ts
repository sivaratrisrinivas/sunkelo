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
  sources: Array<{
    title: string;
    url: string;
    type?: "blog" | "ecommerce" | "youtube";
    site?: "amazon" | "flipkart" | "myntra" | "ajio" | "unknown";
    productTitle?: string;
    price?: string;
    currency?: string;
    overallRating?: number;
    ratingsCount?: number;
    reviewsCount?: number;
    reviewSampleCount?: number;
    averageReviewRating?: number;
    sentimentBreakdown?: {
      positive: number;
      negative: number;
      neutral: number;
      mixed: number;
    };
  }>;
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
