import { Router } from "express";
import { invoicesRouter } from "./invoices";
import { clientsRouter } from "./clients";
import { taxesRouter } from "./taxes";
import { currenciesRouter } from "./currencies";
import { templatesRouter } from "./templates";
import { invoiceNumberingRouter } from "./invoiceNumbering";

export const routes = Router();

routes.use("/invoices", invoicesRouter);
routes.use("/clients", clientsRouter);
routes.use("/taxes", taxesRouter);
routes.use("/currencies", currenciesRouter);
routes.use("/templates", templatesRouter);
routes.use("/invoice-numbering", invoiceNumberingRouter);
