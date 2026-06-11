import { AppError } from './app-error';
import { ErrorCode } from './error-codes';

/**
 * Thrown when a courier's external API call fails.
 * The raw courier response is stored for audit but NEVER leaked to the client.
 */
export class CourierError extends AppError {
  public readonly courierCode: string;
  public readonly rawResponse?: unknown;
  public readonly courierStatusCode?: number;

  constructor(opts: {
    courierCode: string;
    message: string;
    courierStatusCode?: number;
    rawResponse?: unknown;
    isClientError?: boolean;
  }) {
    const code = opts.isClientError
      ? ErrorCode.COURIER_CLIENT_ERROR
      : ErrorCode.COURIER_UNAVAILABLE;

    super(code, opts.message);
    this.courierCode = opts.courierCode;
    this.rawResponse = opts.rawResponse;
    this.courierStatusCode = opts.courierStatusCode;
  }
}

export class CourierAuthError extends AppError {
  public readonly courierCode: string;

  constructor(courierCode: string, message = 'Courier authentication failed') {
    super(ErrorCode.COURIER_AUTH_FAILED, message);
    this.courierCode = courierCode;
  }
}
