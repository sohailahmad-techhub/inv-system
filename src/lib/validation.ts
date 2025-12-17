import { z, type ZodSchema } from "zod";
import type { Request } from "express";
import { ApiError } from "./errors";

export function parseBody<T>(req: Request, schema: ZodSchema<T>): T {
  const result = schema.safeParse(req.body);
  if (!result.success) {
    throw new ApiError("Validation error", 422, result.error.flatten());
  }
  return result.data;
}

export function parseQuery<T>(req: Request, schema: ZodSchema<T>): T {
  const result = schema.safeParse(req.query);
  if (!result.success) {
    throw new ApiError("Validation error", 422, result.error.flatten());
  }
  return result.data;
}

export const cuidSchema = z.string().min(1);
