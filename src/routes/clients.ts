import { Router } from "express";
import { type Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { parseBody, parseQuery } from "../lib/validation";

// Define InvoiceStatus locally as it was removed from Prisma Schema for SQLite compatibility
const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;

export const clientsRouter = Router();

const createClientSchema = z.object({
  name: z.string().min(1),
  email: z.string().email().optional(),
  phone: z.string().min(1).optional(),
  address: z.string().min(1).optional(),
  taxId: z.string().min(1).optional(),
  companyName: z.string().min(1).optional(),
  country: z.string().min(1).optional(),
});

const updateClientSchema = createClientSchema.partial();

clientsRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createClientSchema);

    const client = await prisma.client.create({ data: body });
    res.status(201).json(client);
  })
);

clientsRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parseQuery(
      req,
      z.object({
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
      })
    );

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const [total, clients] = await prisma.$transaction([
      prisma.client.count(),
      prisma.client.findMany({
        orderBy: [{ createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
      }),
    ]);

    res.json({ total, page, pageSize, data: clients });
  })
);

clientsRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);

    const client = await prisma.client.findUnique({
      where: { id },
      include: {
        invoices: {
          orderBy: [{ issuedDate: "desc" }, { createdAt: "desc" }],
          take: 50,
          select: {
            id: true,
            invoiceNumber: true,
            status: true,
            issuedDate: true,
            dueDate: true,
            subtotal: true,
            tax: true,
            total: true,
            createdAt: true,
          },
        },
      },
    });

    if (!client) {
      throw new ApiError("Client not found", 404);
    }

    res.json(client);
  })
);

clientsRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    const body = parseBody(req, updateClientSchema);

    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError("Client not found", 404);
    }

    const updated = await prisma.client.update({ where: { id }, data: body });
    res.json(updated);
  })
);

clientsRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);

    const existing = await prisma.client.findUnique({ where: { id } });
    if (!existing) {
      throw new ApiError("Client not found", 404);
    }

    const invoiceCount = await prisma.invoice.count({ where: { clientId: id } });
    if (invoiceCount > 0) {
      throw new ApiError("Client cannot be deleted while invoices exist", 400);
    }

    await prisma.client.delete({ where: { id } });
    res.status(204).send();
  })
);

clientsRouter.get(
  "/:id/invoices",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);

    const query = parseQuery(
      req,
      z.object({
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
        status: z.nativeEnum(InvoiceStatus).optional(),
      })
    );

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const client = await prisma.client.findUnique({ where: { id } });
    if (!client) {
      throw new ApiError("Client not found", 404);
    }

    const where: Prisma.InvoiceWhereInput = {
      clientId: id,
      ...(query.status ? { status: query.status } : {}),
    };

    const [total, invoices] = await prisma.$transaction([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: [{ issuedDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: { items: true },
      }),
    ]);

    res.json({ total, page, pageSize, data: invoices });
  })
);
