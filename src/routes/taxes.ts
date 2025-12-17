import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { parseBody } from "../lib/validation";

// Define TaxType locally as it was removed from Prisma Schema for SQLite compatibility
const TaxType = {
  VAT: 'VAT',
  GST: 'GST',
  CUSTOM: 'CUSTOM',
} as const;

export const taxesRouter = Router();

const createTaxSchema = z.object({
  name: z.string().min(1),
  rate: z.number().min(0),
  type: z.nativeEnum(TaxType),
  country: z.string().min(1).optional(),
});

const updateTaxSchema = createTaxSchema.partial();

taxesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createTaxSchema);

    const tax = await prisma.tax.create({
      data: {
        name: body.name,
        rate: body.rate,
        type: body.type,
        country: body.country,
      },
    });

    res.status(201).json(tax);
  })
);

taxesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const taxes = await prisma.tax.findMany({ orderBy: [{ createdAt: "desc" }] });
    res.json(taxes);
  })
);

taxesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    const body = parseBody(req, updateTaxSchema);

    const existing = await prisma.tax.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError("Tax rule not found", 404);
    }

    const updated = await prisma.tax.update({ where: { id }, data: body });
    res.json(updated);
  })
);

taxesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);

    const existing = await prisma.tax.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError("Tax rule not found", 404);
    }

    await prisma.tax.delete({ where: { id } });
    res.status(204).send();
  })
);
