/** Every non-2xx response has this shape: { error: { code, message, fields?, requestId } } */
export type ErrorCode =
  | 'VALIDATION_FAILED'
  | 'BAD_REQUEST'
  | 'OTP_INVALID'
  | 'OTP_EXPIRED'
  | 'OTP_TOO_MANY_ATTEMPTS'
  | 'UNAUTHENTICATED'
  | 'TOKEN_EXPIRED'
  | 'TOKEN_INVALID'
  | 'INVALID_CREDENTIALS'
  | 'EMAIL_NOT_VERIFIED'
  | 'ACCOUNT_LOCKED'
  | 'FORBIDDEN'
  | 'ACCOUNT_SUSPENDED'
  | 'ACCOUNT_BLOCKED'
  | 'ACCOUNT_DELETED'
  | 'ONBOARDING_REQUIRED'
  | 'NOT_FOUND'
  | 'CONFLICT'
  | 'EMAIL_TAKEN'
  | 'USERNAME_TAKEN'
  | 'ALREADY_MEMBER'
  | 'REQUEST_PENDING'
  | 'PASSWORD_NOT_SET'
  | 'FILE_TOO_LARGE'
  | 'UNSUPPORTED_MEDIA'
  | 'RATE_LIMITED'
  | 'SERVICE_UNAVAILABLE'
  | 'INTERNAL';

export class AppError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly code: ErrorCode,
    message: string,
    public readonly fields?: Record<string, string>,
    public readonly headers?: Record<string, string>,
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  validation: (message: string, fields?: Record<string, string>) => new AppError(400, 'VALIDATION_FAILED', message, fields),
  badRequest: (message: string, code: ErrorCode = 'BAD_REQUEST') => new AppError(400, code, message),
  unauthenticated: (message = 'Sign in to continue', code: ErrorCode = 'UNAUTHENTICATED') => new AppError(401, code, message),
  forbidden: (message = 'You do not have permission to do this', code: ErrorCode = 'FORBIDDEN') => new AppError(403, code, message),
  notFound: (what = 'Resource') => new AppError(404, 'NOT_FOUND', `${what} not found`),
  conflict: (message: string, code: ErrorCode = 'CONFLICT') => new AppError(409, code, message),
  tooMany: (message: string, retryAfterSeconds?: number) =>
    new AppError(429, 'RATE_LIMITED', message, undefined, retryAfterSeconds ? { 'retry-after': String(retryAfterSeconds) } : undefined),
  unavailable: (message: string) => new AppError(503, 'SERVICE_UNAVAILABLE', message),
};
