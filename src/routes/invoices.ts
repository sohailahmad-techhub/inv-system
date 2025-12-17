import { Router } from "express";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import { asyncHandler } from "../lib/asyncHandler";
import { ApiError } from "../lib/errors";
import { prisma } from "../lib/prisma";
import { parseBody, parseQuery } from "../lib/validation";
import { computeInvoiceItems, computeTotals } from "../services/invoiceTotals";
import { generateInvoiceNumber } from "../services/invoiceNumbering";
import { generateInvoicePdf } from "../services/pdfGenerator";

// Define InvoiceStatus locally as it was removed from Prisma Schema for SQLite compatibility
const InvoiceStatus = {
  DRAFT: 'DRAFT',
  SENT: 'SENT',
  PAID: 'PAID',
  OVERDUE: 'OVERDUE',
  CANCELLED: 'CANCELLED',
} as const;

export const invoicesRouter = Router();

const invoiceItemSchema = z.object({
  description: z.string().min(1),
  quantity: z.number().int().positive(),
  rate: z.number().positive(),
  discount: z.number().min(0).max(100).optional(),
  taxable: z.boolean().optional(),
});

const createInvoiceSchema = z.object({
  clientId: z.string().min(1),
  userId: z.string().min(1),
  items: z.array(invoiceItemSchema).min(1),
  status: z.nativeEnum(InvoiceStatus).optional(),
  issuedDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().optional(),
  notes: z.string().optional(),
  logo: z.string().url().optional(),
  currencyCode: z.string().min(1).optional(),
  language: z.string().min(1).optional(),
  templateId: z.string().min(1).optional(),
  taxId: z.string().min(1).optional(),
});

const updateInvoiceSchema = z.object({
  clientId: z.string().min(1).optional(),
  items: z.array(invoiceItemSchema).min(1).optional(),
  status: z.nativeEnum(InvoiceStatus).optional(),
  issuedDate: z.coerce.date().optional(),
  dueDate: z.coerce.date().nullable().optional(),
  notes: z.string().nullable().optional(),
  logo: z.string().url().nullable().optional(),
  currencyCode: z.string().min(1).nullable().optional(),
  language: z.string().min(1).nullable().optional(),
  templateId: z.string().min(1).nullable().optional(),
  taxId: z.string().min(1).nullable().optional(),
});

invoicesRouter.post(
  "/",
  asyncHandler(async (req, res) => {
    const body = parseBody(req, createInvoiceSchema);

    const client = await prisma.client.findUnique({ where: { id: body.clientId } });
    if (!client) {
      throw new ApiError("Client not found", 404);
    }

    const issuedDate = body.issuedDate ?? new Date();

    const taxRule = body.taxId
      ? await prisma.tax.findUnique({ where: { id: body.taxId } })
      : null;
    if (body.taxId && !taxRule) {
      throw new ApiError("Tax rule not found", 404);
    }

    if (body.templateId) {
      const template = await prisma.invoiceTemplate.findUnique({ where: { id: body.templateId } });
      if (!template) {
        throw new ApiError("Template not found", 404);
      }
    }

    if (body.currencyCode) {
      const currency = await prisma.currency.findUnique({ where: { code: body.currencyCode } });
      if (!currency) {
        throw new ApiError("Currency not found", 404);
      }
    }

    const computedItems = computeInvoiceItems(body.items);
    const taxRate = taxRule?.rate ?? new Prisma.Decimal(0);
    const totals = computeTotals(computedItems, taxRate);

    const invoiceNumber = await generateInvoiceNumber({ userId: body.userId, issuedDate });

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        clientId: body.clientId,
        userId: body.userId,
        status: body.status ?? InvoiceStatus.DRAFT,
        issuedDate,
        dueDate: body.dueDate,
        notes: body.notes,
        logo: body.logo,
        currencyCode: body.currencyCode,
        language: body.language,
        templateId: body.templateId,
        taxId: body.taxId,
        subtotal: totals.subtotal,
        tax: totals.tax,
        total: totals.total,
        items: {
          create: computedItems.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            rate: i.rate,
            discount: i.discount,
            taxable: i.taxable,
            amount: i.amount,
          })),
        },
      },
      include: {
        client: true,
        items: true,
        template: true,
        taxRule: true,
        currency: true,
      },
    });

    res.status(201).json(invoice);
  })
);

invoicesRouter.get(
  "/stats",
  asyncHandler(async (req, res) => {
    const query = parseQuery(
      req,
      z.object({
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        userId: z.string().min(1).optional(),
      })
    );

    const where: Prisma.InvoiceWhereInput = {
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? {
            issuedDate: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const byStatus = await prisma.invoice.groupBy({
      by: ["status"],
      where,
      _count: { _all: true },
      _sum: { total: true },
    });

    const paid = await prisma.invoice.aggregate({
      where: { ...where, status: InvoiceStatus.PAID },
      _sum: { total: true },
      _count: { _all: true },
    });

    const outstanding = await prisma.invoice.aggregate({
      where: { ...where, status: { in: [InvoiceStatus.SENT, InvoiceStatus.OVERDUE] } },
      _sum: { total: true },
      _count: { _all: true },
    });

    res.json({
      byStatus,
      paid: {
        count: paid._count._all,
        total: paid._sum.total ?? new Prisma.Decimal(0),
      },
      outstanding: {
        count: outstanding._count._all,
        total: outstanding._sum.total ?? new Prisma.Decimal(0),
      },
    });
  })
);

invoicesRouter.get(
  "/",
  asyncHandler(async (req, res) => {
    const query = parseQuery(
      req,
      z.object({
        status: z.nativeEnum(InvoiceStatus).optional(),
        clientId: z.string().min(1).optional(),
        from: z.coerce.date().optional(),
        to: z.coerce.date().optional(),
        userId: z.string().min(1).optional(),
        page: z.coerce.number().int().min(1).optional(),
        pageSize: z.coerce.number().int().min(1).max(100).optional(),
      })
    );

    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 20;

    const where: Prisma.InvoiceWhereInput = {
      ...(query.status ? { status: query.status } : {}),
      ...(query.clientId ? { clientId: query.clientId } : {}),
      ...(query.userId ? { userId: query.userId } : {}),
      ...(query.from || query.to
        ? {
            issuedDate: {
              ...(query.from ? { gte: query.from } : {}),
              ...(query.to ? { lte: query.to } : {}),
            },
          }
        : {}),
    };

    const [total, invoices] = await prisma.$transaction([
      prisma.invoice.count({ where }),
      prisma.invoice.findMany({
        where,
        orderBy: [{ issuedDate: "desc" }, { createdAt: "desc" }],
        skip: (page - 1) * pageSize,
        take: pageSize,
        include: {
          client: true,
          items: true,
        },
      }),
    ]);

    res.json({ total, page, pageSize, data: invoices });
  })
);

invoicesRouter.get(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        items: true,
        template: true,
        taxRule: true,
        currency: true,
      },
    });

    if (!invoice) {
      throw new ApiError("Invoice not found", 404);
    }

    res.json(invoice);
  })
);

invoicesRouter.put(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);
    const body = parseBody(req, updateInvoiceSchema);

    const existing = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!existing) {
      throw new ApiError("Invoice not found", 404);
    }

    if (existing.status === InvoiceStatus.PAID) {
      throw new ApiError("Paid invoices cannot be updated", 400);
    }

    const clientId = body.clientId ?? existing.clientId;
    if (body.clientId) {
      const client = await prisma.client.findUnique({ where: { id: clientId } });
      if (!client) {
        throw new ApiError("Client not found", 404);
      }
    }

    const taxId = body.taxId === undefined ? existing.taxId : body.taxId;
    const taxRule = taxId ? await prisma.tax.findUnique({ where: { id: taxId } }) : null;
    if (taxId && !taxRule) {
      throw new ApiError("Tax rule not found", 404);
    }

    const templateId = body.templateId === undefined ? existing.templateId : body.templateId;
    if (templateId) {
      const template = await prisma.invoiceTemplate.findUnique({ where: { id: templateId } });
      if (!template) {
        throw new ApiError("Template not found", 404);
      }
    }

    const currencyCode = body.currencyCode === undefined ? existing.currencyCode : body.currencyCode;
    if (currencyCode) {
      const currency = await prisma.currency.findUnique({ where: { code: currencyCode } });
      if (!currency) {
        throw new ApiError("Currency not found", 404);
      }
    }

    const computedItems = body.items
      ? computeInvoiceItems(body.items)
      : existing.items.map((i) => ({
          description: i.description,
          quantity: i.quantity,
          rate: i.rate,
          discount: i.discount,
          taxable: i.taxable,
          amount: i.amount,
        }));

    const taxRate = taxRule?.rate ?? new Prisma.Decimal(0);
    const totals = computeTotals(computedItems, taxRate);

    const invoice = await prisma.$transaction(async (tx) => {
      if (body.items) {
        await tx.invoiceItem.deleteMany({ where: { invoiceId: existing.id } });
      }

      return tx.invoice.update({
        where: { id: existing.id },
        data: {
          clientId,
          status: body.status,
          issuedDate: body.issuedDate,
          dueDate: body.dueDate === undefined ? undefined : body.dueDate,
          notes: body.notes === undefined ? undefined : body.notes,
          logo: body.logo === undefined ? undefined : body.logo,
          currencyCode: body.currencyCode === undefined ? undefined : body.currencyCode,
          language: body.language === undefined ? undefined : body.language,
          templateId: body.templateId === undefined ? undefined : body.templateId,
          taxId: body.taxId === undefined ? undefined : body.taxId,
          subtotal: totals.subtotal,
          tax: totals.tax,
          total: totals.total,
          ...(body.items
            ? {
                items: {
                  create: computedItems.map((i) => ({
                    description: i.description,
                    quantity: i.quantity,
                    rate: i.rate,
                    discount: i.discount,
                    taxable: i.taxable,
                    amount: i.amount,
                  })),
                },
              }
            : {}),
        },
        include: {
          client: true,
          items: true,
          template: true,
          taxRule: true,
          currency: true,
        },
      });
    });

    res.json(invoice);
  })
);

invoicesRouter.delete(
  "/:id",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);

    const invoice = await prisma.invoice.findUnique({ where: { id } });
    if (!invoice) {
      throw new ApiError("Invoice not found", 404);
    }

    if (invoice.status !== InvoiceStatus.DRAFT) {
      throw new ApiError("Only draft invoices can be deleted", 400);
    }

    await prisma.invoice.delete({ where: { id } });
    res.status(204).send();
  })
);

invoicesRouter.post(
  "/:id/duplicate",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: { items: true },
    });

    if (!invoice) {
      throw new ApiError("Invoice not found", 404);
    }

    const now = new Date();
    const issuedDate = now;

    const dueDate =
      invoice.dueDate && invoice.issuedDate
        ? new Date(issuedDate.getTime() + (invoice.dueDate.getTime() - invoice.issuedDate.getTime()))
        : invoice.dueDate;

    const invoiceNumber = await generateInvoiceNumber({ userId: invoice.userId, issuedDate });

    const created = await prisma.invoice.create({
      data: {
        invoiceNumber,
        clientId: invoice.clientId,
        userId: invoice.userId,
        status: InvoiceStatus.DRAFT,
        issuedDate,
        dueDate,
        notes: invoice.notes,
        logo: invoice.logo,
        currencyCode: invoice.currencyCode,
        language: invoice.language,
        templateId: invoice.templateId,
        taxId: invoice.taxId,
        subtotal: invoice.subtotal,
        tax: invoice.tax,
        total: invoice.total,
        items: {
          create: invoice.items.map((i) => ({
            description: i.description,
            quantity: i.quantity,
            rate: i.rate,
            discount: i.discount,
            taxable: i.taxable,
            amount: i.amount,
          })),
        },
      },
      include: {
        client: true,
        items: true,
        template: true,
        taxRule: true,
        currency: true,
      },
    });

    res.status(201).json(created);
  })
);

invoicesRouter.post(
  "/:id/generate-pdf",
  asyncHandler(async (req, res) => {
    const id = z.string().min(1).parse(req.params.id);

    const invoice = await prisma.invoice.findUnique({
      where: { id },
      include: {
        client: true,
        items: true,
        template: true,
        taxRule: true,
        currency: true,
      },
    });

    if (!invoice) {
      throw new ApiError("Invoice not found", 404);
    }

    const pdfBuffer = await generateInvoicePdf(invoice);

    res.set({
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="invoice-${invoice.invoiceNumber}.pdf"`,
      "Content-Length": pdfBuffer.length.toString(),
    });

    res.send(pdfBuffer);
  })
);
