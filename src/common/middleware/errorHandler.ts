import { NextFunction, Request, Response } from 'express';
import { ZodError } from 'zod';
import { Prisma } from '@prisma/client';
import { AppError } from '../errors/AppError';
import { ErrorCode } from '../errors/errorCodes';
import { logger } from '../logger';
import { isProduction } from '../../config/env';

export function notFoundHandler(req: Request, res: Response): void {
  res.status(404).json({
    success: false,
    error: {
      code: ErrorCode.RESOURCE_NOT_FOUND,
      message: `Route not found: ${req.method} ${req.originalUrl}`,
    },
    requestId: req.requestId,
  });
}

// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function errorHandler(err: unknown, req: Request, res: Response, _next: NextFunction): void {
  let appError: AppError;

  if (err instanceof AppError) {
    appError = err;
  } else if (err instanceof ZodError) {
    appError = AppError.validation('Invalid request', err.flatten());
  } else if (err instanceof Prisma.PrismaClientKnownRequestError) {
    appError = mapPrismaError(err);
  } else {
    appError = AppError.internal();
  }

  const isServerError = appError.statusCode >= 500;
  const logPayload = {
    requestId: req.requestId,
    userId: req.userId,
    route: req.originalUrl,
    method: req.method,
    statusCode: appError.statusCode,
    code: appError.code,
    err: isServerError ? err : undefined,
  };

  if (isServerError) {
    logger.error(logPayload, appError.message);
  } else {
    logger.warn(logPayload, appError.message);
  }

  res.status(appError.statusCode).json({
    success: false,
    error: {
      code: appError.code,
      message: isServerError && isProduction ? 'Internal server error' : appError.message,
      ...(appError.details ? { details: appError.details } : {}),
    },
    requestId: req.requestId,
  });
}

function mapPrismaError(err: Prisma.PrismaClientKnownRequestError): AppError {
  switch (err.code) {
    case 'P2002':
      return AppError.duplicate('A resource with these values already exists');
    case 'P2025':
      return AppError.notFound();
    case 'P2003':
      return AppError.validation('Related resource does not exist');
    default:
      return AppError.internal();
  }
}
