import { Response } from 'express';

export function sendSuccess<T>(res: Response, data: T, status = 200, meta?: Record<string, unknown>): void {
  res.status(status).json({
    success: true,
    data,
    ...(meta ? { meta } : {}),
  });
}

export function sendCreated<T>(res: Response, data: T, meta?: Record<string, unknown>): void {
  sendSuccess(res, data, 201, meta);
}

export function sendNoContent(res: Response): void {
  res.status(204).send();
}
