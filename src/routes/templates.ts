import { Router } from "express";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { parseBody } from "../lib/validation";

export const templatesRouter = Router();

const createTemplateSchema = z.object({
  name: z.string().min(1),
  layout: z.string().min(1),
  fields: z.unknown(),
  css: z.string().optional(),
});

const updateTemplateSchema = createTemplateSchema.partial().refine((v) => Object.keys(v).length > 0, {
  message: "No fields provided",
});

templatesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createTemplateSchema);

    const template = await prisma.invoiceTemplate.create({
      data: {
        name: body.name,
        layout: body.layout,
        fields: body.fields,
        css: body.css,
      },
    });

    res.status(201).json(template);
  })
);

templatesRouter.get(
  "/",
  asyncHandler(async (_req, res) => {
    const templates = await prisma.invoiceTemplate.findMany({ orderBy: [{ createdAt: "desc" }] });
    res.json(templates);
  })
);

templatesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    const body = parseBody(req, updateTemplateSchema);

    const existing = await prisma.invoiceTemplate.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError("Template not found", 404);
    }

    const updated = await prisma.invoiceTemplate.update({ where: { id }, data: body });
    res.json(updated);
  })
);
