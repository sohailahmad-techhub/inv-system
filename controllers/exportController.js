const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const User = require('../models/User');

// Helper function to format data for export
const formatInvoiceData = (invoices) => {
  return invoices.map(invoice => ({
    'Invoice Number': invoice.invoiceNumber,
    'Client': invoice.clientId ? `${invoice.clientId.firstName} ${invoice.clientId.lastName}` : '',
    'Company': invoice.clientId?.companyName || '',
    'Email': invoice.clientId?.email || '',
    'Issue Date': invoice.issueDate ? new Date(invoice.issueDate).toLocaleDateString() : '',
    'Due Date': invoice.dueDate ? new Date(invoice.dueDate).toLocaleDateString() : '',
    'Status': invoice.status,
    'Subtotal': invoice.subtotal,
    'Tax': invoice.taxAmount,
    'Discount': invoice.discountAmount,
    'Total': invoice.total,
    'Currency': invoice.currency,
    'Days Overdue': invoice.daysOverdue || 0
  }));
};

const formatPaymentData = (payments) => {
  return payments.map(payment => ({
    'Payment Number': payment.paymentNumber,
    'Invoice Number': payment.invoiceId?.invoiceNumber || '',
    'Client': payment.clientId ? `${payment.clientId.firstName} ${payment.clientId.lastName}` : '',
    'Amount': payment.amount,
    'Net Amount': payment.netAmount,
    'Fees': payment.fees,
    'Payment Method': payment.paymentMethod,
    'Payment Date': payment.paymentDate ? new Date(payment.paymentDate).toLocaleDateString() : '',
    'Status': payment.status,
    'Transaction ID': payment.transactionId || '',
    'Reference Number': payment.referenceNumber || ''
  }));
};

// POST /export/invoices-pdf
const exportInvoicesPDF = asyncHandler(async (req, res) => {
  const { filters = {} } = req.body;
  
  // Build query based on filters
  let query = { isDeleted: false };
  
  if (filters.clientId) query.clientId = filters.clientId;
  if (filters.status) query.status = filters.status;
  if (filters.startDate && filters.endDate) {
    query.issueDate = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate)
    };
  }

  const invoices = await Invoice.find(query)
    .populate('clientId', 'firstName lastName email companyName')
    .sort({ issueDate: -1 });

  // Generate PDF content (simplified - in production you'd use a PDF library like PDFKit)
  let pdfContent = `INVOICES REPORT\nGenerated on: ${new Date().toLocaleDateString()}\n\n`;
  pdfContent += '='.repeat(80) + '\n\n';
  
  invoices.forEach(invoice => {
    pdfContent += `Invoice: ${invoice.invoiceNumber}\n`;
    pdfContent += `Client: ${invoice.clientId?.firstName} ${invoice.clientId?.lastName}\n`;
    pdfContent += `Company: ${invoice.clientId?.companyName || 'N/A'}\n`;
    pdfContent += `Issue Date: ${new Date(invoice.issueDate).toLocaleDateString()}\n`;
    pdfContent += `Due Date: ${new Date(invoice.dueDate).toLocaleDateString()}\n`;
    pdfContent += `Status: ${invoice.status}\n`;
    pdfContent += `Total: ${invoice.currency} ${invoice.total}\n`;
    pdfContent += '-'.repeat(40) + '\n';
  });

  pdfContent += `\nTotal Invoices: ${invoices.length}\n`;
  pdfContent += `Total Value: ${invoices.reduce((sum, inv) => sum + inv.total, 0).toFixed(2)}\n`;

  // Set headers for PDF download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="invoices-${Date.now()}.pdf"`);
  
  res.send(pdfContent);
});

// POST /export/invoices-excel
const exportInvoicesExcel = asyncHandler(async (req, res) => {
  const { filters = {} } = req.body;
  
  // Build query based on filters
  let query = { isDeleted: false };
  
  if (filters.clientId) query.clientId = filters.clientId;
  if (filters.status) query.status = filters.status;
  if (filters.startDate && filters.endDate) {
    query.issueDate = {
      $gte: new Date(filters.startDate),
      $lte: new Date(filters.endDate)
    };
  }

  const invoices = await Invoice.find(query)
    .populate('clientId', 'firstName lastName email companyName')
    .sort({ issueDate: -1 });

  const formattedData = formatInvoiceData(invoices);

  // Generate CSV content for Excel compatibility
  const csvHeaders = Object.keys(formattedData[0] || {});
  const csvContent = [
    csvHeaders.join(','),
    ...formattedData.map(row => 
      csvHeaders.map(header => `"${row[header] || ''}"`).join(',')
    )
  ].join('\n');

  // Set headers for Excel download
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="invoices-${Date.now()}.csv"`);
  
  res.send(csvContent);
});

// POST /export/reports-pdf
const exportReportsPDF = asyncHandler(async (req, res) => {
  const { reportType, filters = {} } = req.body;
  
  let reportData = {};
  
  switch (reportType) {
    case 'financial-summary':
      // Calculate financial summary data
      const totalRevenue = await Payment.aggregate([
        { $match: { status: 'COMPLETED', isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$netAmount' } } }
      ]);

      const pendingInvoices = await Invoice.aggregate([
        { $match: { status: { $in: ['SENT', 'DRAFT'] }, isDeleted: false } },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
      ]);

      const overdueInvoices = await Invoice.aggregate([
        { 
          $match: { 
            status: { $in: ['SENT', 'OVERDUE'] },
            dueDate: { $lt: new Date() },
            isDeleted: false 
          } 
        },
        { $group: { _id: null, total: { $sum: '$total' }, count: { $sum: 1 } } }
      ]);

      reportData = {
        totalRevenue: totalRevenue[0]?.total || 0,
        pendingAmount: pendingInvoices[0]?.total || 0,
        pendingCount: pendingInvoices[0]?.count || 0,
        overdueAmount: overdueInvoices[0]?.total || 0,
        overdueCount: overdueInvoices[0]?.count || 0
      };
      break;

    case 'client-analysis':
      // Get client analysis data
      const topClients = await Payment.aggregate([
        { $match: { status: 'COMPLETED', isDeleted: false } },
        { $group: { _id: '$clientId', totalRevenue: { $sum: '$netAmount' }, count: { $sum: 1 } } },
        { $sort: { totalRevenue: -1 } },
        { $limit: 20 }
      ]);
      
      // Populate client data
      const clientData = await User.find({ 
        _id: { $in: topClients.map(c => c._id) },
        role: 'CLIENT' 
      });

      reportData.clients = topClients.map(client => {
        const clientInfo = clientData.find(c => c._id.toString() === client._id.toString());
        return {
          name: clientInfo ? `${clientInfo.firstName} ${clientInfo.lastName}` : 'Unknown',
          company: clientInfo?.companyName || 'N/A',
          revenue: client.totalRevenue,
          invoiceCount: client.count
        };
      });
      break;

    default:
      return res.status(400).json({
        success: false,
        message: 'Invalid report type'
      });
  }

  // Generate PDF content
  let pdfContent = `${reportType.toUpperCase().replace('-', ' ')} REPORT\n`;
  pdfContent += `Generated on: ${new Date().toLocaleDateString()}\n`;
  pdfContent += '='.repeat(80) + '\n\n';

  if (reportType === 'financial-summary') {
    pdfContent += `FINANCIAL SUMMARY\n`;
    pdfContent += `- Total Revenue: $${reportData.totalRevenue.toFixed(2)}\n`;
    pdfContent += `- Pending Invoices: ${reportData.pendingCount} ($${reportData.pendingAmount.toFixed(2)})\n`;
    pdfContent += `- Overdue Invoices: ${reportData.overdueCount} ($${reportData.overdueAmount.toFixed(2)})\n`;
  } else if (reportType === 'client-analysis') {
    pdfContent += `TOP CLIENTS BY REVENUE\n\n`;
    reportData.clients.forEach((client, index) => {
      pdfContent += `${index + 1}. ${client.name} (${client.company})\n`;
      pdfContent += `   Revenue: $${client.revenue.toFixed(2)}\n`;
      pdfContent += `   Invoices: ${client.invoiceCount}\n\n`;
    });
  }

  // Set headers for PDF download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${reportType}-${Date.now()}.pdf"`);
  
  res.send(pdfContent);
});

// POST /export/financial-statement
const exportFinancialStatement = asyncHandler(async (req, res) => {
  const { startDate, endDate } = req.body;
  
  if (!startDate || !endDate) {
    return res.status(400).json({
      success: false,
      message: 'Start date and end date are required'
    });
  }

  const dateFilter = {
    $gte: new Date(startDate),
    $lte: new Date(endDate)
  };

  // Revenue calculations
  const revenue = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        paymentDate: dateFilter,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$netAmount' },
        totalFees: { $sum: '$fees' },
        grossAmount: { $sum: '$amount' }
      }
    }
  ]);

  // Income by month
  const monthlyIncome = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        paymentDate: dateFilter,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: {
          year: { $year: '$paymentDate' },
          month: { $month: '$paymentDate' }
        },
        revenue: { $sum: '$netAmount' }
      }
    },
    {
      $project: {
        period: { $concat: [{ $toString: '$_id.year' }, '-', { $toString: '$_id.month' }] },
        revenue: 1,
        _id: 0
      }
    },
    { $sort: { period: 1 } }
  ]);

  // Outstanding receivables
  const outstandingReceivables = await Invoice.aggregate([
    {
      $match: {
        status: { $in: ['SENT', 'OVERDUE'] },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        totalOutstanding: { $sum: '$total' },
        overdueAmount: {
          $sum: {
            $cond: [{ $lt: ['$dueDate', new Date()] }, '$total', 0]
          }
        }
      }
    }
  ]);

  // Client revenue breakdown
  const clientRevenue = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        paymentDate: dateFilter,
        isDeleted: false
      }
    },
    {
      $group: {
        _id: '$clientId',
        revenue: { $sum: '$netAmount' },
        payments: { $sum: 1 }
      }
    },
    { $sort: { revenue: -1 } },
    { $limit: 10 }
  ]);

  // Generate financial statement PDF
  let statementContent = `FINANCIAL STATEMENT\n`;
  statementContent += `Period: ${new Date(startDate).toLocaleDateString()} - ${new Date(endDate).toLocaleDateString()}\n`;
  statementContent += `Generated on: ${new Date().toLocaleDateString()}\n`;
  statementContent += '='.repeat(80) + '\n\n';

  statementContent += `INCOME STATEMENT\n`;
  statementContent += '-'.repeat(40) + '\n';
  statementContent += `Total Revenue: $${revenue[0]?.totalRevenue?.toFixed(2) || '0.00'}\n`;
  statementContent += `Payment Processing Fees: $${revenue[0]?.totalFees?.toFixed(2) || '0.00'}\n`;
  statementContent += `Gross Revenue: $${revenue[0]?.grossAmount?.toFixed(2) || '0.00'}\n\n`;

  statementContent += `OUTSTANDING RECEIVABLES\n`;
  statementContent += '-'.repeat(40) + '\n';
  statementContent += `Total Outstanding: $${outstandingReceivables[0]?.totalOutstanding?.toFixed(2) || '0.00'}\n`;
  statementContent += `Overdue Amount: $${outstandingReceivables[0]?.overdueAmount?.toFixed(2) || '0.00'}\n\n`;

  statementContent += `MONTHLY REVENUE BREAKDOWN\n`;
  statementContent += '-'.repeat(40) + '\n';
  monthlyIncome.forEach(item => {
    statementContent += `${item.period}: $${item.revenue.toFixed(2)}\n`;
  });

  // Set headers for PDF download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="financial-statement-${Date.now()}.pdf"`);
  
  res.send(statementContent);
});

// POST /export/tax-report
const exportTaxReport = asyncHandler(async (req, res) => {
  const { year, region } = req.body;
  
  if (!year) {
    return res.status(400).json({
      success: false,
      message: 'Year is required'
    });
  }

  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);

  // Revenue for tax purposes
  const taxRevenue = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        paymentDate: { $gte: startDate, $lte: endDate },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: null,
        totalRevenue: { $sum: '$netAmount' },
        grossRevenue: { $sum: '$amount' },
        totalFees: { $sum: '$fees' },
        count: { $sum: 1 }
      }
    }
  ]);

  // Quarterly breakdown
  const quarterlyBreakdown = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        paymentDate: { $gte: startDate, $lte: endDate },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: {
          quarter: { $ceil: { $divide: [{ $month: '$paymentDate' }, 3] } }
        },
        revenue: { $sum: '$netAmount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.quarter': 1 } }
  ]);

  // Taxable income by month (for detailed reporting)
  const monthlyTaxData = await Payment.aggregate([
    {
      $match: {
        status: 'COMPLETED',
        paymentDate: { $gte: startDate, $lte: endDate },
        isDeleted: false
      }
    },
    {
      $group: {
        _id: { month: { $month: '$paymentDate' } },
        revenue: { $sum: '$netAmount' },
        count: { $sum: 1 }
      }
    },
    { $sort: { '_id.month': 1 } }
  ]);

  // Generate tax report PDF
  let taxContent = `TAX REPORT - ${year}\n`;
  taxContent += `Region: ${region || 'All Regions'}\n`;
  taxContent += `Generated on: ${new Date().toLocaleDateString()}\n`;
  taxContent += '='.repeat(80) + '\n\n';

  taxContent += `ANNUAL TAX SUMMARY\n`;
  taxContent += '-'.repeat(40) + '\n';
  taxContent += `Total Taxable Revenue: $${taxRevenue[0]?.totalRevenue?.toFixed(2) || '0.00'}\n`;
  taxContent += `Gross Revenue: $${taxRevenue[0]?.grossRevenue?.toFixed(2) || '0.00'}\n`;
  taxContent += `Processing Fees: $${taxRevenue[0]?.totalFees?.toFixed(2) || '0.00'}\n`;
  taxContent += `Total Transactions: ${taxRevenue[0]?.count || 0}\n\n`;

  taxContent += `QUARTERLY BREAKDOWN\n`;
  taxContent += '-'.repeat(40) + '\n';
  quarterlyBreakdown.forEach(quarter => {
    taxContent += `Q${quarter._id.quarter}: $${quarter.revenue.toFixed(2)} (${quarter.count} transactions)\n`;
  });

  taxContent += `\nMONTHLY BREAKDOWN\n`;
  taxContent += '-'.repeat(40) + '\n';
  const monthNames = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 
                     'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  monthlyTaxData.forEach(month => {
    taxContent += `${monthNames[month._id.month - 1]}: $${month.revenue.toFixed(2)}\n`;
  });

  // Set headers for PDF download
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="tax-report-${year}.pdf"`);
  
  res.send(taxContent);
});

module.exports = {
  exportInvoicesPDF,
  exportInvoicesExcel,
  exportReportsPDF,
  exportFinancialStatement,
  exportTaxReport
};