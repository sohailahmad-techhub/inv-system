import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { parseBody } from "../lib/validation";

export const currenciesRouter = Router();

const createCurrencySchema = z.object({
  code: z.string().min(3).max(10).transform((s) => s.toUpperCase()),
  symbol: z.string().min(1).max(8),
  exchangeRate: z.number().positive().optional(),
  isDefault: z.boolean().optional(),
});

const updateCurrencySchema = z
  .object({
    symbol: z.string().min(1).max(8).optional(),
    exchangeRate: z.number().positive().optional(),
    isDefault: z.boolean().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, { message: "No fields provided" });

currenciesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createCurrencySchema);

    const created = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.currency.updateMany({ data: { isDefault: false }, where: {} });
      }

      return tx.currency.create({
        data: {
          code: body.code,
          symbol: body.symbol,
          exchangeRate: body.exchangeRate ?? 1,
          isDefault: body.isDefault ?? false,
        },
      });
    });

    res.status(201).json(created);
  })
);

currenciesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const currencies = await prisma.currency.findMany({ orderBy: [{ isDefault: "desc" }, { code: "asc" }] });
    res.json(currencies);
  })
);

currenciesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    const body = parseBody(req, updateCurrencySchema);

    const existing = await prisma.currency.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError("Currency not found", 404);
    }

    const updated = await prisma.$transaction(async (tx) => {
      if (body.isDefault) {
        await tx.currency.updateMany({ data: { isDefault: false }, where: {} });
      }

      return tx.currency.update({ where: { id }, data: body });
    });

    res.json(updated);
  })
);
