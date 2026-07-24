import { Request, Response, NextFunction } from "express";

export class AppError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.name = "AppError";
  }
}

function isAppError(err: any): err is AppError {
  return (
    err &&
    typeof err.statusCode === "number" &&
    typeof err.code === "string"
  );
}

export function errorHandler(
  err: any,
  req: Request,
  res: Response,
  next: NextFunction
) {
  const statusCode = isAppError(err) ? err.statusCode : 500;
  const code = isAppError(err) ? err.code : "INTERNAL_ERROR";
  const message = isAppError(err) ? err.message : "Something went wrong";

  req.log?.error({ err, requestId: req.id }, "Request failed");
  res.status(statusCode).json({
    error: {
      code,
      message,
      requestId: req.id,
    },
  });
}