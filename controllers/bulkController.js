const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const User = require('../models/User');
const csv = require('csv-parser');
const fs = require('fs');
const multer = require('multer');
const JSZip = require('jszip');
const path = require('path');

// Configure multer for CSV uploads
const upload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB limit
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'text/csv' || file.mimetype === 'application/vnd.ms-excel') {
      cb(null, true);
    } else {
      cb(new Error('Only CSV files are allowed'), false);
    }
  }
});

// @desc    Bulk generate invoices from CSV
// @route   POST /api/invoices/bulk
// @access  Private
const bulkGenerateInvoices = [
  upload.single('csvFile'),
  asyncHandler(async (req, res) => {
    const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
    
    if (!req.file) {
      res.status(400);
      throw new Error('CSV file is required');
    }
    
    const csvFilePath = req.file.path;
    
    try {
      // Parse CSV file
      const invoices = [];
      const errors = [];
      const batchId = `BULK-${Date.now()}`;
      
      await new Promise((resolve, reject) => {
        fs.createReadStream(csvFilePath)
          .pipe(csv())
          .on('data', async (row, index) => {
            try {
              const invoice = await validateAndProcessInvoiceRow(row, index + 1, tenantId, req.user._id);
              if (invoice) {
                invoices.push(invoice);
              }
            } catch (error) {
              errors.push({
                row: index + 1,
                error: error.message,
                data: row
              });
            }
          })
          .on('end', resolve)
          .on('error', reject);
      });
      
      // Save valid invoices
      const savedInvoices = [];
      const saveErrors = [];
      
      for (let i = 0; i < invoices.length; i++) {
        try {
          const invoice = await Invoice.create(invoices[i]);
          
          // Add to saved invoices with row number for tracking
          invoice.bulkGenerated = {
            batchId,
            rowNumber: invoices[i].rowNumber
          };
          await invoice.save();
          
          savedInvoices.push(invoice);
          
          // Run fraud detection and payment prediction asynchronously
          setImmediate(async () => {
            try {
              await runFraudDetection(invoice._id);
              await calculatePaymentPrediction(invoice._id);
              await generateQRCode(invoice._id);
            } catch (error) {
              console.error('Background processing failed for invoice:', invoice._id, error);
            }
          });
          
        } catch (error) {
          saveErrors.push({
            row: invoices[i].rowNumber,
            error: error.message,
            invoiceNumber: invoices[i].invoiceNumber
          });
        }
      }
      
      // Clean up uploaded file
      fs.unlinkSync(csvFilePath);
      
      // Trigger webhook
      await triggerWebhook('bulk_invoices.created', {
        batchId,
        totalProcessed: invoices.length,
        successful: savedInvoices.length,
        failed: saveErrors.length + errors.length,
        errors: [...errors, ...saveErrors]
      });
      
      res.json({
        success: true,
        message: 'Bulk invoice generation completed',
        data: {
          batchId,
          summary: {
            total: invoices.length,
            successful: savedInvoices.length,
            failed: errors.length + saveErrors.length,
            errors: [...errors, ...saveErrors]
          },
          invoices: savedInvoices.map(inv => ({
            id: inv._id,
            invoiceNumber: inv.invoiceNumber,
            clientEmail: inv.clientEmail,
            total: inv.total,
            status: inv.status
          }))
        }
      });
      
    } catch (error) {
      // Clean up uploaded file in case of error
      if (fs.existsSync(csvFilePath)) {
        fs.unlinkSync(csvFilePath);
      }
      
      res.status(500).json({
        success: false,
        message: 'Bulk invoice generation failed',
        error: error.message
      });
    }
  })
];

// @desc    Download bulk invoice PDFs
// @route   GET /api/invoices/bulk/:batchId/download
// @access  Private
const downloadBulkInvoicePDFs = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  // Find all invoices from the batch
  const invoices = await Invoice.find({
    'bulkGenerated.batchId': batchId,
    tenantId
  }).populate('clientId', 'firstName lastName email companyName');
  
  if (invoices.length === 0) {
    res.status(404);
    throw new Error('No invoices found for this batch');
  }
  
  const zip = new JSZip();
  
  // Generate PDF for each invoice
  for (const invoice of invoices) {
    try {
      const pdfBuffer = await createInvoicePDF(invoice);
      const fileName = `invoice-${invoice.invoiceNumber}.pdf`;
      zip.file(fileName, pdfBuffer);
    } catch (error) {
      console.error(`Failed to generate PDF for invoice ${invoice.invoiceNumber}:`, error);
    }
  }
  
  // Generate summary CSV
  const summaryCsv = generateBulkInvoiceSummary(invoices);
  zip.file('summary.csv', summaryCsv);
  
  // Create zip archive
  const zipBuffer = await zip.generateAsync({ type: 'nodebuffer' });
  
  res.setHeader('Content-Type', 'application/zip');
  res.setHeader('Content-Disposition', `attachment; filename=invoices-${batchId}.zip`);
  res.send(zipBuffer);
});

// @desc    Get bulk invoice generation status
// @route   GET /api/invoices/bulk/status/:batchId
// @access  Private
const getBulkInvoiceStatus = asyncHandler(async (req, res) => {
  const { batchId } = req.params;
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  const invoices = await Invoice.find({
    'bulkGenerated.batchId': batchId,
    tenantId
  }).populate('clientId', 'firstName lastName email companyName');
  
  if (invoices.length === 0) {
    res.status(404);
    throw new Error('Batch not found');
  }
  
  const summary = {
    total: invoices.length,
    byStatus: {},
    totalAmount: 0,
    processed: invoices.length // All invoices are processed since they're saved
  };
  
  invoices.forEach(invoice => {
    // Count by status
    summary.byStatus[invoice.status] = (summary.byStatus[invoice.status] || 0) + 1;
    
    // Sum total amount
    summary.totalAmount += invoice.total;
  });
  
  res.json({
    success: true,
    data: {
      batchId,
      summary,
      invoices: invoices.map(inv => ({
        id: inv._id,
        invoiceNumber: inv.invoiceNumber,
        client: `${inv.clientId.firstName} ${inv.clientId.lastName}`,
        total: inv.total,
        status: inv.status,
        createdAt: inv.createdAt,
        qrCodeGenerated: inv.qrCodeGenerated,
        fraudCheck: inv.fraudCheck,
        paymentPrediction: inv.paymentPrediction
      }))
    }
  });
});

// @desc    Get bulk invoice generation template
// @route   GET /api/invoices/bulk/template
// @access  Private
const getBulkInvoiceTemplate = asyncHandler(async (req, res) => {
  const template = [
    'clientEmail,clientName,clientCompany,items,quantities,unitPrices,taxRate,currency,dueDateDays,notes',
    'john@example.com,John Doe,ABC Corp,"Website Design,Hosting","1,12","500.00,10.00",10,USD,30,"Web development services"',
    'jane@example.com,Jane Smith,XYZ Ltd,"Consulting Services","40","75.00",15,USD,15,"Business consulting"'
  ].join('\n');
  
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', 'attachment; filename=bulk-invoice-template.csv');
  res.send(template);
});

// Helper function to validate and process CSV row
async function validateAndProcessInvoiceRow(row, rowNumber, tenantId, userId) {
  const requiredFields = ['clientEmail', 'clientName', 'items', 'quantities', 'unitPrices'];
  
  // Check required fields
  for (const field of requiredFields) {
    if (!row[field]) {
      throw new Error(`Missing required field: ${field}`);
    }
  }
  
  // Find or create client
  let client = await User.findOne({ email: row.clientEmail.toLowerCase() });
  
  if (!client) {
    // Parse client name
    const nameParts = row.clientName.split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';
    
    client = await User.create({
      email: row.clientEmail.toLowerCase(),
      firstName,
      lastName,
      companyName: row.clientCompany || '',
      role: 'CLIENT',
      tenantId
    });
  }
  
  // Parse items
  const items = row.items.split(',').map(item => item.trim()).filter(item => item);
  const quantities = row.quantities.split(',').map(q => parseFloat(q.trim())).filter(q => !isNaN(q));
  const unitPrices = row.unitPrices.split(',').map(p => parseFloat(p.trim())).filter(p => !isNaN(p));
  
  if (items.length !== quantities.length || items.length !== unitPrices.length) {
    throw new Error('Items, quantities, and unit prices must have the same number of values');
  }
  
  // Create invoice items
  const invoiceItems = items.map((description, index) => ({
    description,
    quantity: quantities[index],
    unitPrice: unitPrices[index],
    total: quantities[index] * unitPrices[index]
  }));
  
  // Generate invoice number
  const invoiceCount = await Invoice.countDocuments({ tenantId });
  const invoiceNumber = `INV-${(invoiceCount + rowNumber).toString().padStart(6, '0')}`;
  
  // Calculate due date
  const issueDate = new Date();
  const dueDateDays = parseInt(row.dueDateDays) || 30;
  const dueDate = new Date(issueDate.getTime() + dueDateDays * 24 * 60 * 60 * 1000);
  
  return {
    invoiceNumber,
    clientId: client._id,
    createdBy: userId,
    items: invoiceItems,
    taxRate: parseFloat(row.taxRate) || 0,
    currency: (row.currency || 'USD').toUpperCase(),
    issueDate,
    dueDate,
    notes: row.notes || '',
    paymentTerms: `Net ${dueDateDays} days`,
    tenantId,
    rowNumber
  };
}

// Helper function to generate bulk invoice summary CSV
function generateBulkInvoiceSummary(invoices) {
  const headers = 'Invoice Number,Client Name,Client Email,Company,Subtotal,Tax Amount,Total,Status,Issue Date,Due Date,Items Count';
  const rows = invoices.map(invoice => {
    const client = invoice.clientId;
    return [
      invoice.invoiceNumber,
      `"${client.firstName} ${client.lastName}"`,
      client.email,
      `"${client.companyName || ''}"`,
      invoice.subtotal.toFixed(2),
      invoice.taxAmount.toFixed(2),
      invoice.total.toFixed(2),
      invoice.status,
      invoice.issueDate.toISOString().split('T')[0],
      invoice.dueDate.toISOString().split('T')[0],
      invoice.items.length
    ].join(',');
  });
  
  return headers + '\n' + rows.join('\n');
}

// Helper functions (imported from invoice controller)
async function runFraudDetection(invoiceId) {
  // This would be similar to the fraud detection in invoiceController
  console.log('Running fraud detection for invoice:', invoiceId);
}

async function calculatePaymentPrediction(invoiceId) {
  // This would be similar to the payment prediction in invoiceController
  console.log('Calculating payment prediction for invoice:', invoiceId);
}

async function generateQRCode(invoiceId) {
  // This would generate QR code for the invoice
  console.log('Generating QR code for invoice:', invoiceId);
}

async function createInvoicePDF(invoice) {
  // This would generate PDF using puppeteer (similar to invoiceController)
  const puppeteer = require('puppeteer');
  
  const browser = await puppeteer.launch({
    headless: true,
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });
  
  const page = await browser.newPage();
  const html = generateInvoiceHTML(invoice);
  
  await page.setContent(html);
  const pdfBuffer = await page.pdf({
    format: 'A4',
    printBackground: true,
    margin: {
      top: '20px',
      right: '20px',
      bottom: '20px',
      left: '20px'
    }
  });
  
  await browser.close();
  return pdfBuffer;
}

function generateInvoiceHTML(invoice) {
  // Simplified HTML generation for bulk processing
  return `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <title>Invoice ${invoice.invoiceNumber}</title>
    </head>
    <body>
      <h1>Invoice ${invoice.invoiceNumber}</h1>
      <p>Client: ${invoice.clientId.firstName} ${invoice.clientId.lastName}</p>
      <p>Total: ${invoice.currency} ${invoice.total.toFixed(2)}</p>
      <p>Due Date: ${invoice.dueDate.toLocaleDateString()}</p>
      <table>
        <tr><th>Description</th><th>Qty</th><th>Price</th><th>Total</th></tr>
        ${invoice.items.map(item => `
          <tr>
            <td>${item.description}</td>
            <td>${item.quantity}</td>
            <td>${item.unitPrice}</td>
            <td>${item.total}</td>
          </tr>
        `).join('')}
      </table>
    </body>
    </html>
  `;
}

async function triggerWebhook(event, data) {
  console.log(`Triggering webhook for event: ${event}`);
  // Implementation would go here
}

module.exports = {
  bulkGenerateInvoices,
  downloadBulkInvoicePDFs,
  getBulkInvoiceStatus,
  getBulkInvoiceTemplate
};