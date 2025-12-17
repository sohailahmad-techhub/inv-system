import type { NextFunction, Request, Response } from 'express';

export type HttpError = Error & {
  statusCode?: number;
};

export function errorHandler(
  err: HttpError,
  _req: Request,
  res: Response,
  _next: NextFunction
) {
  const statusCode = err.statusCode && err.statusCode >= 400 ? err.statusCode : 500;

  if (statusCode >= 500) {
    console.error(err);
  }

  res.status(statusCode).json({
    error: {
      message: err.message || 'Internal Server Error'
    }
  });
}
