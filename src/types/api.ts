import type { PipelineErrorCode, QueryStatus } from "./pipeline";

export type StatusEvent = {
  status: QueryStatus;
  context?: Record<string, unknown>;
};

export type ApiError = {
  code: PipelineErrorCode;
  message: string;
};
