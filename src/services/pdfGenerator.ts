
import puppeteer from 'puppeteer';
import QRCode from 'qrcode';
import { Prisma, Invoice, Client, InvoiceItem, InvoiceTemplate, Currency, Tax } from '@prisma/client';

type InvoiceWithDetails = Invoice & {
  client: Client;
  items: InvoiceItem[];
  template: InvoiceTemplate | null;
  currency: Currency | null;
  taxRule: Tax | null;
};

// --- Translations ---

const translations: Record<string, Record<string, string>> = {
  en: {
    invoice: 'INVOICE',
    billTo: 'Bill To',
    shipTo: 'Ship To',
    invoiceNumber: 'Invoice No',
    date: 'Date',
    dueDate: 'Due Date',
    description: 'Description',
    quantity: 'Qty',
    rate: 'Rate',
    amount: 'Amount',
    subtotal: 'Subtotal',
    tax: 'Tax',
    total: 'Total',
    paymentTerms: 'Payment Terms',
    notes: 'Notes',
    discount: 'Discount',
    paymentLink: 'Scan to Pay',
  },
  es: {
    invoice: 'FACTURA',
    billTo: 'Facturar a',
    shipTo: 'Enviar a',
    invoiceNumber: 'Nº Factura',
    date: 'Fecha',
    dueDate: 'Fecha Vencimiento',
    description: 'Descripción',
    quantity: 'Cant',
    rate: 'Precio',
    amount: 'Importe',
    subtotal: 'Subtotal',
    tax: 'Impuestos',
    total: 'Total',
    paymentTerms: 'Términos de Pago',
    notes: 'Notas',
    discount: 'Descuento',
    paymentLink: 'Escanear para Pagar',
  },
  fr: {
    invoice: 'FACTURE',
    billTo: 'Facturer à',
    shipTo: 'Expédier à',
    invoiceNumber: 'N° Facture',
    date: 'Date',
    dueDate: 'Date d\'échéance',
    description: 'Description',
    quantity: 'Qté',
    rate: 'Prix',
    amount: 'Montant',
    subtotal: 'Sous-total',
    tax: 'TVA',
    total: 'Total',
    paymentTerms: 'Conditions de paiement',
    notes: 'Notes',
    discount: 'Remise',
    paymentLink: 'Scanner pour payer',
  },
  de: {
    invoice: 'RECHNUNG',
    billTo: 'Rechnung an',
    shipTo: 'Lieferung an',
    invoiceNumber: 'Rechnungs-Nr.',
    date: 'Datum',
    dueDate: 'Fälligkeitsdatum',
    description: 'Beschreibung',
    quantity: 'Menge',
    rate: 'Preis',
    amount: 'Betrag',
    subtotal: 'Zwischensumme',
    tax: 'Steuer',
    total: 'Gesamt',
    paymentTerms: 'Zahlungsbedingungen',
    notes: 'Notizen',
    discount: 'Rabatt',
    paymentLink: 'Zum Bezahlen scannen',
  },
  zh: {
    invoice: '发票',
    billTo: '收票人',
    shipTo: '收货人',
    invoiceNumber: '发票号码',
    date: '日期',
    dueDate: '截止日期',
    description: '描述',
    quantity: '数量',
    rate: '单价',
    amount: '金额',
    subtotal: '小计',
    tax: '税额',
    total: '总计',
    paymentTerms: '付款条款',
    notes: '备注',
    discount: '折扣',
    paymentLink: '扫码支付',
  },
  // Add other languages as needed (Arabic, Hindi per ticket)
  ar: {
    invoice: 'فاتورة',
    billTo: 'إلى',
    shipTo: 'شحن إلى',
    invoiceNumber: 'رقم الفاتورة',
    date: 'التاريخ',
    dueDate: 'تاريخ الاستحقاق',
    description: 'الوصف',
    quantity: 'الكمية',
    rate: 'السعر',
    amount: 'المبلغ',
    subtotal: 'المجموع الفرعي',
    tax: 'الضريبة',
    total: 'المجموع',
    paymentTerms: 'شروط الدفع',
    notes: 'ملاحظات',
    discount: 'خصم',
    paymentLink: 'مسح للدفع',
  },
  hi: {
    invoice: 'चालान',
    billTo: 'बिल सेवा में',
    shipTo: 'शिप्पिंग सेवा में',
    invoiceNumber: 'चालान संख्या',
    date: 'दिनांक',
    dueDate: 'देय तिथि',
    description: 'विवरण',
    quantity: 'मात्रा',
    rate: 'दर',
    amount: 'राशि',
    subtotal: 'उपयोग',
    tax: 'कर',
    total: 'कुल',
    paymentTerms: 'भुगतान की शर्तें',
    notes: 'टिप्पणियाँ',
    discount: 'छूट',
    paymentLink: 'भुगतान के लिए स्कैन करें',
  }
};

// --- Helpers ---

const formatCurrency = (amount: Prisma.Decimal | number, currencyCode: string = 'USD', locale: string = 'en-US') => {
  return new Intl.NumberFormat(locale, {
    style: 'currency',
    currency: currencyCode,
  }).format(Number(amount));
};

const formatDate = (date: Date, locale: string = 'en-US') => {
  return new Intl.DateTimeFormat(locale, {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  }).format(date);
};

// --- Templates ---

const getBaseStyles = () => `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;600;700&family=Playfair+Display:wght@700&family=Roboto+Mono:wght@400&display=swap');
  
  body {
    font-family: 'Inter', sans-serif;
    color: #333;
    line-height: 1.5;
    margin: 0;
    padding: 0;
    -webkit-print-color-adjust: exact;
  }
  .page-container {
    padding: 40px;
    max-width: 800px;
    margin: 0 auto;
  }
  .header {
    display: flex;
    justify-content: space-between;
    margin-bottom: 40px;
  }
  .logo {
    max-width: 150px;
    max-height: 80px;
    object-fit: contain;
  }
  .invoice-title {
    font-size: 32px;
    font-weight: 700;
    text-transform: uppercase;
  }
  .meta-grid {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 20px;
    margin-bottom: 40px;
  }
  .client-info h3, .company-info h3 {
    font-size: 14px;
    text-transform: uppercase;
    color: #666;
    margin-bottom: 5px;
  }
  .table-container {
    margin-bottom: 30px;
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    text-align: left;
    padding: 10px;
    font-size: 12px;
    text-transform: uppercase;
    color: #666;
    border-bottom: 2px solid #eee;
  }
  td {
    padding: 10px;
    border-bottom: 1px solid #eee;
  }
  .text-right { text-align: right; }
  .totals {
    width: 300px;
    margin-left: auto;
  }
  .total-row {
    display: flex;
    justify-content: space-between;
    padding: 5px 10px;
  }
  .total-row.final {
    font-weight: 700;
    font-size: 18px;
    border-top: 2px solid #333;
    margin-top: 10px;
    padding-top: 10px;
  }
  .footer {
    margin-top: 60px;
    padding-top: 20px;
    border-top: 1px solid #eee;
    font-size: 12px;
    color: #666;
    display: flex;
    justify-content: space-between;
    align-items: flex-end;
  }
  .qr-code {
    text-align: center;
  }
  .qr-code img {
    width: 100px;
    height: 100px;
  }
`;

// Template: Modern Clean
const templateModernClean = (data: any, t: any) => `
  <style>
    ${getBaseStyles()}
    .invoice-title { color: #2563eb; }
    th { color: #2563eb; border-bottom-color: #2563eb; }
  </style>
  <div class="page-container">
    <div class="header">
      <div>
        ${data.logo ? `<img src="${data.logo}" class="logo" />` : `<h1>${data.companyName || 'Company Name'}</h1>`}
      </div>
      <div class="text-right">
        <div class="invoice-title">${t.invoice}</div>
        <div>${t.invoiceNumber}: ${data.invoiceNumber}</div>
        <div>${t.date}: ${data.issuedDate}</div>
        ${data.dueDate ? `<div>${t.dueDate}: ${data.dueDate}</div>` : ''}
      </div>
    </div>

    <div class="meta-grid">
      <div class="company-info">
        <h3>From</h3>
        <div>${data.companyName || 'Our Company'}</div>
        <div>${data.companyAddress || ''}</div>
        <div>${data.companyEmail || ''}</div>
      </div>
      <div class="client-info">
        <h3>${t.billTo}</h3>
        <div>${data.clientName}</div>
        <div>${data.clientAddress || ''}</div>
        <div>${data.clientEmail || ''}</div>
        ${data.clientTaxId ? `<div>Tax ID: ${data.clientTaxId}</div>` : ''}
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>${t.description}</th>
            <th class="text-right">${t.quantity}</th>
            <th class="text-right">${t.rate}</th>
            <th class="text-right">${t.amount}</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item: any) => `
            <tr>
              <td>${item.description}</td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${item.rate}</td>
              <td class="text-right">${item.amount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="total-row">
        <span>${t.subtotal}</span>
        <span>${data.subtotal}</span>
      </div>
      <div class="total-row">
        <span>${t.tax} (${data.taxRate}%)</span>
        <span>${data.tax}</span>
      </div>
      <div class="total-row final">
        <span>${t.total}</span>
        <span>${data.total}</span>
      </div>
    </div>

    <div class="footer">
      <div>
        ${data.notes ? `<div><strong>${t.notes}:</strong><br/>${data.notes}</div>` : ''}
        <div style="margin-top: 20px;">
            ${data.companyName || 'Company'} | ${data.companyEmail || ''}
        </div>
      </div>
      <div class="qr-code">
        ${data.qrCode ? `<img src="${data.qrCode}" /><br/>` : ''}
        <small>${t.paymentLink}</small>
      </div>
    </div>
  </div>
`;

// Template: Professional
const templateProfessional = (data: any, t: any) => `
  <style>
    ${getBaseStyles()}
    body { font-family: 'Times New Roman', serif; }
    .header { background: #f8f9fa; padding: 20px; border-bottom: 2px solid #333; }
    .invoice-title { font-family: 'Arial', sans-serif; color: #333; }
    th { background: #333; color: #fff; border: none; padding: 12px; }
    td { border-bottom: 1px solid #ddd; }
    .page-container { padding: 0; max-width: 100%; }
    .content-wrapper { padding: 40px; max-width: 800px; margin: 0 auto; }
  </style>
  <div class="page-container">
    <div class="header">
      <div class="content-wrapper" style="padding: 0; margin-bottom: 0;">
        <div style="display: flex; justify-content: space-between; align-items: center;">
             ${data.logo ? `<img src="${data.logo}" class="logo" />` : `<h1>${data.companyName}</h1>`}
             <div class="text-right">
                <h1 style="margin: 0;">${t.invoice}</h1>
                <div>#${data.invoiceNumber}</div>
             </div>
        </div>
      </div>
    </div>

    <div class="content-wrapper">
        <div class="meta-grid">
            <div>
                <strong>From:</strong><br/>
                ${data.companyName}<br/>
                ${data.companyAddress || ''}
            </div>
            <div>
                <strong>${t.billTo}:</strong><br/>
                ${data.clientName}<br/>
                ${data.clientAddress || ''}<br/>
                ${data.clientTaxId ? `Tax ID: ${data.clientTaxId}` : ''}
            </div>
        </div>
        
        <div style="margin-bottom: 30px;">
            <strong>${t.date}:</strong> ${data.issuedDate} &nbsp;|&nbsp; 
            <strong>${t.dueDate}:</strong> ${data.dueDate || '-'}
        </div>

        <div class="table-container">
          <table>
            <thead>
              <tr>
                <th>${t.description}</th>
                <th class="text-right">${t.quantity}</th>
                <th class="text-right">${t.rate}</th>
                <th class="text-right">${t.amount}</th>
              </tr>
            </thead>
            <tbody>
              ${data.items.map((item: any) => `
                <tr>
                  <td>${item.description}</td>
                  <td class="text-right">${item.quantity}</td>
                  <td class="text-right">${item.rate}</td>
                  <td class="text-right">${item.amount}</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </div>

        <div class="totals">
          <div class="total-row">
            <span>${t.subtotal}</span>
            <span>${data.subtotal}</span>
          </div>
          <div class="total-row">
            <span>${t.tax}</span>
            <span>${data.tax}</span>
          </div>
          <div class="total-row final">
            <span>${t.total}</span>
            <span>${data.total}</span>
          </div>
        </div>
        
        <div class="footer">
            <div style="flex: 1;">
                 ${data.notes ? `<p>${data.notes}</p>` : ''}
            </div>
            <div class="qr-code">
                 ${data.qrCode ? `<img src="${data.qrCode}" />` : ''}
            </div>
        </div>
    </div>
  </div>
`;

// Template: Creative
const templateCreative = (data: any, t: any) => `
  <style>
    ${getBaseStyles()}
    body { font-family: 'Playfair Display', serif; }
    .header { background: #6366f1; color: white; padding: 40px; margin: -40px -40px 40px -40px; }
    .invoice-title { color: white; }
    .client-info h3, .company-info h3 { color: #6366f1; }
    th { color: #6366f1; border-bottom: 2px solid #6366f1; }
    .total-row.final { border-top: 2px solid #6366f1; color: #6366f1; }
    .logo { background: white; padding: 10px; border-radius: 4px; }
  </style>
  <div class="page-container">
    <div class="header">
      <div style="display: flex; justify-content: space-between; align-items: center;">
        <div>
           ${data.logo ? `<img src="${data.logo}" class="logo" />` : `<h1>${data.companyName}</h1>`}
        </div>
        <div class="text-right">
           <div class="invoice-title">${t.invoice}</div>
           <div>#${data.invoiceNumber}</div>
        </div>
      </div>
    </div>

    <div class="meta-grid">
      <div class="client-info">
        <h3>${t.billTo}</h3>
        <div style="font-size: 1.2em; font-weight: bold;">${data.clientName}</div>
        <div>${data.clientAddress || ''}</div>
      </div>
      <div class="text-right">
        <div><strong>${t.date}:</strong> ${data.issuedDate}</div>
        <div><strong>${t.dueDate}:</strong> ${data.dueDate}</div>
      </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>${t.description}</th>
            <th class="text-right">${t.quantity}</th>
            <th class="text-right">${t.rate}</th>
            <th class="text-right">${t.amount}</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item: any) => `
            <tr>
              <td>
                <div style="font-weight: bold;">${item.description}</div>
              </td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${item.rate}</td>
              <td class="text-right">${item.amount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="total-row final">
        <span>${t.total}</span>
        <span>${data.total}</span>
      </div>
    </div>

    <div class="footer">
       <div class="qr-code">
          ${data.qrCode ? `<img src="${data.qrCode}" />` : ''}
       </div>
    </div>
  </div>
`;

// Template: Minimal
const templateMinimal = (data: any, t: any) => `
  <style>
    ${getBaseStyles()}
    body { font-family: 'Roboto Mono', monospace; font-size: 14px; }
    .header { border-bottom: 4px solid #000; padding-bottom: 20px; }
    .invoice-title { font-size: 24px; font-weight: 400; }
    th { border-bottom: 1px solid #000; color: #000; text-transform: none; }
    td { border-bottom: 1px solid #eee; }
    .total-row.final { border-top: 1px solid #000; }
  </style>
  <div class="page-container">
    <div class="header">
      <div class="invoice-title">${t.invoice} #${data.invoiceNumber}</div>
      <div>${t.date}: ${data.issuedDate}</div>
    </div>

    <div style="margin: 40px 0;">
      <div>${data.clientName}</div>
      <div>${data.clientAddress || ''}</div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>${t.description}</th>
            <th class="text-right">${t.quantity}</th>
            <th class="text-right">${t.rate}</th>
            <th class="text-right">${t.amount}</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item: any) => `
            <tr>
              <td>${item.description}</td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${item.rate}</td>
              <td class="text-right">${item.amount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="total-row">
        <span>${t.subtotal}</span>
        <span>${data.subtotal}</span>
      </div>
      <div class="total-row">
        <span>${t.tax}</span>
        <span>${data.tax}</span>
      </div>
      <div class="total-row final">
        <span>${t.total}</span>
        <span>${data.total}</span>
      </div>
    </div>
    
     <div class="footer">
         <div class="qr-code">
            ${data.qrCode ? `<img src="${data.qrCode}" style="width: 80px; height: 80px;" />` : ''}
         </div>
     </div>
  </div>
`;

// Template: Detailed
const templateDetailed = (data: any, t: any) => `
  <style>
    ${getBaseStyles()}
    .header { background: #f0fdf4; padding: 30px; border: 1px solid #bbf7d0; }
    .invoice-title { color: #166534; }
    th { background: #166534; color: white; }
    tr:nth-child(even) { background: #f0fdf4; }
    .detailed-info { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 20px; font-size: 12px; margin-bottom: 20px; }
  </style>
  <div class="page-container">
    <div class="header">
      <div style="display: flex; justify-content: space-between;">
          <div>
            ${data.logo ? `<img src="${data.logo}" class="logo" />` : `<h1>${data.companyName}</h1>`}
            <div>${data.companyAddress || ''}</div>
            <div>Tax ID: ${data.companyTaxId || 'N/A'}</div>
          </div>
          <div class="text-right">
            <h1 class="invoice-title">${t.invoice}</h1>
            <div>${t.invoiceNumber}: ${data.invoiceNumber}</div>
          </div>
      </div>
    </div>
    
    <div style="margin: 20px 0; border-bottom: 2px solid #166534; padding-bottom: 20px;">
        <div class="detailed-info">
            <div>
                <strong>${t.billTo}</strong><br/>
                ${data.clientName}<br/>
                ${data.clientAddress || ''}<br/>
                ${data.clientEmail || ''}<br/>
                Tax ID: ${data.clientTaxId || 'N/A'}
            </div>
            <div>
                 <strong>Details</strong><br/>
                 ${t.date}: ${data.issuedDate}<br/>
                 ${t.dueDate}: ${data.dueDate || '-'}<br/>
                 Currency: ${data.currencyCode}
            </div>
             <div class="text-right">
                <div class="qr-code">
                    ${data.qrCode ? `<img src="${data.qrCode}" style="width: 80px; height: 80px;" />` : ''}
                </div>
            </div>
        </div>
    </div>

    <div class="table-container">
      <table>
        <thead>
          <tr>
            <th>${t.description}</th>
            <th class="text-right">${t.quantity}</th>
            <th class="text-right">${t.rate}</th>
            <th class="text-right">${t.discount}</th>
            <th class="text-right">${t.amount}</th>
          </tr>
        </thead>
        <tbody>
          ${data.items.map((item: any) => `
            <tr>
              <td>${item.description}</td>
              <td class="text-right">${item.quantity}</td>
              <td class="text-right">${item.rate}</td>
              <td class="text-right">${item.discount}</td>
              <td class="text-right">${item.amount}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>

    <div class="totals">
      <div class="total-row">
        <span>${t.subtotal}</span>
        <span>${data.subtotal}</span>
      </div>
      <div class="total-row">
        <span>${t.tax} (${data.taxRate}%)</span>
        <span>${data.tax}</span>
      </div>
      <div class="total-row final">
        <span>${t.total}</span>
        <span>${data.total}</span>
      </div>
    </div>
    
    <div class="footer">
        <p>${data.notes || ''}</p>
        <p>${t.paymentTerms}: Net 30</p>
    </div>
  </div>
`;

const templates: Record<string, Function> = {
  'Modern Clean': templateModernClean,
  'Professional': templateProfessional,
  'Creative': templateCreative,
  'Minimal': templateMinimal,
  'Detailed': templateDetailed,
};

// --- PDF Generation Logic ---

export async function generateInvoicePdf(invoice: InvoiceWithDetails): Promise<Buffer> {
  // 1. Prepare Data
  const lang = invoice.language || 'en';
  const t = translations[lang] || translations['en'];
  const locale = lang === 'en' ? 'en-US' : lang; // Simplification
  const currencyCode = invoice.currencyCode || 'USD';

  // Format currency
  const fmt = (amount: Prisma.Decimal) => formatCurrency(amount, currencyCode, locale);
  
  // Format dates
  const issuedDate = formatDate(invoice.issuedDate, locale);
  const dueDate = invoice.dueDate ? formatDate(invoice.dueDate, locale) : null;

  // Generate QR Code
  // Fallback link: https://yourdomain.com/pay/{invoiceId}
  const paymentLink = `https://yourdomain.com/pay/${invoice.id}`;
  const qrCodeDataUrl = await QRCode.toDataURL(paymentLink);

  const data = {
    invoiceNumber: invoice.invoiceNumber,
    issuedDate,
    dueDate,
    
    companyName: 'ACME Corp', // Todo: Get from settings or config
    companyAddress: '123 Business St, Tech City',
    companyEmail: 'billing@acme.com',
    companyTaxId: 'XX-XXXXXXX',
    
    clientName: invoice.client.name,
    clientAddress: invoice.client.address,
    clientEmail: invoice.client.email,
    clientTaxId: invoice.client.taxId,
    
    items: invoice.items.map(item => ({
      description: item.description,
      quantity: item.quantity,
      rate: fmt(item.rate),
      amount: fmt(item.amount),
      discount: item.discount ? item.discount.toString() + '%' : '-',
    })),
    
    subtotal: fmt(invoice.subtotal),
    tax: fmt(invoice.tax),
    taxRate: invoice.taxRule ? invoice.taxRule.rate.toString() : '0',
    total: fmt(invoice.total),
    
    currencyCode,
    notes: invoice.notes,
    logo: invoice.logo,
    
    qrCode: qrCodeDataUrl,
  };

  // 2. Select Template
  const templateName = invoice.template?.name || 'Modern Clean';
  const renderTemplate = templates[templateName] || templateModernClean;
  const htmlContent = renderTemplate(data, t);

  // 3. Generate PDF
  const browser = await puppeteer.launch({
    headless: "new",
    args: ['--no-sandbox', '--disable-setuid-sandbox'] // Required for some CI/docker envs
  });
  const page = await browser.newPage();
  
  await page.setContent(htmlContent, { waitUntil: 'networkidle0' });
  
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20px',
      bottom: '20px',
      left: '20px',
      right: '20px'
    }
  });

  await browser.close();

  return Buffer.from(pdfBuffer);
}
