import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { prisma } from "../lib/prisma";
import { parseBody } from "../lib/validation";
import { ApiError } from "../lib/errors";

export const invoiceNumberingRouter = Router();

invoiceNumberingRouter.get(
  "/:userId",
  asyncHandler(async (req, res) => {
    const userId = z.string().min(1).parse(req.params.userId);

    const settings = await prisma.invoiceNumberSettings.findUnique({ where: { userId } });
    if (!settings) {
      res.json({ userId, prefix: "INV", separator: "-", padding: 4 });
      return;
    }

    res.json(settings);
  })
);

invoiceNumberingRouter.put(
  "/:userId",
  asyncHandler(async (req, res) => {
    const userId = z.string().min(1).parse(req.params.userId);

    const body = parseBody(
      req,
      z.object({
        prefix: z.string().min(1).max(10).optional(),
        separator: z.string().min(1).max(3).optional(),
        padding: z.number().int().min(1).max(12).optional(),
      })
    );

    if (Object.keys(body).length === 0) {
      throw new ApiError("No fields provided", 422);
    }

    const updated = await prisma.invoiceNumberSettings.upsert({
      where: { userId },
      create: { userId, ...body },
      update: { ...body },
    });

    res.json(updated);
  })
);
