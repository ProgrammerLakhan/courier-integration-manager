import { type ErrorCode, HTTP_STATUS } from './error-codes';

export interface ErrorDetail {
  field?: string;
  message: string;
}

export class AppError extends Error {
  public readonly code: ErrorCode;
  public readonly statusCode: number;
  public readonly details?: ErrorDetail[] | Record<string, unknown>;
  public readonly isOperational: boolean;

  constructor(
    code: ErrorCode,
    message: string,
    details?: ErrorDetail[] | Record<string, unknown>,
    isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.statusCode = HTTP_STATUS[code] ?? 500;
    this.details = details;
    this.isOperational = isOperational;
    Error.captureStackTrace(this, this.constructor);
  }

  /**
   * Build the normalized JSON response body for this error.
   */
  toResponse(requestId: string) {
    return {
      success: false,
      error: {
        code: this.code,
        message: this.message,
        details: this.details,
        request_id: requestId,
        timestamp: new Date().toISOString(),
      },
    };
  }
}
