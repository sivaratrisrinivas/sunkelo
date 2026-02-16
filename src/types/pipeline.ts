export type QueryStatus =
  | "idle"
  | "listening"
  | "understood"
  | "searching"
  | "analyzing"
  | "done"
  | "error";

export type PipelineErrorCode =
  | "NOT_A_PRODUCT"
  | "NO_REVIEWS"
  | "RATE_LIMITED"
  | "STT_FAILED"
  | "SERVICE_UNAVAILABLE"
  | "INVALID_INPUT"
  | "UNKNOWN";

export type QueryContext = {
  transcript?: string;
  languageCode?: string;
  product?: string;
  cached?: boolean;
};
