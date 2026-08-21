import { ErrorCode } from './errorCodes';

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly details?: unknown;
  public readonly isOperational = true;

  constructor(statusCode: number, code: ErrorCode, message: string, details?: unknown) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
    Object.setPrototypeOf(this, new.target.prototype);
    Error.captureStackTrace(this, this.constructor);
  }

  static validation(message = 'Invalid request', details?: unknown): AppError {
    return new AppError(400, ErrorCode.VALIDATION_ERROR, message, details);
  }

  static authRequired(message = 'Authentication required'): AppError {
    return new AppError(401, ErrorCode.AUTH_REQUIRED, message);
  }

  static invalidCredentials(message = 'Invalid credentials'): AppError {
    return new AppError(401, ErrorCode.INVALID_CREDENTIALS, message);
  }

  static sessionExpired(message = 'Session expired'): AppError {
    return new AppError(401, ErrorCode.SESSION_EXPIRED, message);
  }

  static sessionRevoked(message = 'Session revoked'): AppError {
    return new AppError(401, ErrorCode.SESSION_REVOKED, message);
  }

  static accountSuspended(message = 'Account is suspended'): AppError {
    return new AppError(403, ErrorCode.ACCOUNT_SUSPENDED, message);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(404, ErrorCode.RESOURCE_NOT_FOUND, message);
  }

  static forbidden(message = 'Access denied'): AppError {
    return new AppError(403, ErrorCode.RESOURCE_FORBIDDEN, message);
  }

  static conflict(code: ErrorCode, message: string, details?: unknown): AppError {
    return new AppError(409, code, message, details);
  }

  static scheduleConflict(message = 'Schedule conflict detected', details?: unknown): AppError {
    return new AppError(409, ErrorCode.SCHEDULE_CONFLICT, message, details);
  }

  static duplicate(message = 'Resource already exists', details?: unknown): AppError {
    return new AppError(409, ErrorCode.DUPLICATE_RESOURCE, message, details);
  }

  static invalidState(message = 'Operation not valid for current state'): AppError {
    return new AppError(422, ErrorCode.INVALID_STATE, message);
  }

  static rateLimited(message = 'Too many requests'): AppError {
    return new AppError(429, ErrorCode.RATE_LIMITED, message);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(500, ErrorCode.INTERNAL_ERROR, message);
  }

  static serviceUnavailable(message = 'Service unavailable'): AppError {
    return new AppError(503, ErrorCode.SERVICE_UNAVAILABLE, message);
  }
}
