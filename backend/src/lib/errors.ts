export class AppError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }

  static badRequest(message: string, details?: unknown) {
    return new AppError(400, "BAD_REQUEST", message, details);
  }

  static unauthorized(message = "Unauthorized") {
    return new AppError(401, "UNAUTHORIZED", message);
  }

  static forbidden(message = "Forbidden") {
    return new AppError(403, "FORBIDDEN", message);
  }

  static notFound(message = "Not found") {
    return new AppError(404, "NOT_FOUND", message);
  }

  static conflict(message = "Conflict", details?: unknown) {
    return new AppError(409, "CONFLICT", message, details);
  }

  static tooManyRequests(message = "Too many requests", details?: unknown) {
    return new AppError(429, "RATE_LIMITED", message, details);
  }

  static payloadTooLarge(message = "Payload too large", details?: unknown) {
    return new AppError(413, "PAYLOAD_TOO_LARGE", message, details);
  }

  static internal(message = "Internal server error", details?: unknown) {
    return new AppError(500, "INTERNAL_ERROR", message, details);
  }
}
