import { prisma } from "../lib/prisma";
import { ApiError } from "../lib/errors";

export async function generateInvoiceNumber(params: {
  userId: string;
  issuedDate: Date;
}): Promise<string> {
  const year = params.issuedDate.getUTCFullYear();

  return prisma.$transaction(async (tx) => {
    const settings = await tx.invoiceNumberSettings.upsert({
      where: { userId: params.userId },
      create: { userId: params.userId },
      update: {},
    });

    const sequence = await tx.invoiceNumberSequence.upsert({
      where: { settingsId_year: { settingsId: settings.id, year } },
      create: { settingsId: settings.id, year, nextNumber: 2 },
      update: { nextNumber: { increment: 1 } },
    });

    const usedNumber = sequence.nextNumber - 1;
    if (usedNumber <= 0) {
      throw new ApiError("Failed to generate invoice number", 500);
    }

    const padded = String(usedNumber).padStart(settings.padding, "0");
    return `${settings.prefix}${settings.separator}${year}${settings.separator}${padded}`;
  });
}
