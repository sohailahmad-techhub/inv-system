const asyncHandler = require('express-async-handler');
const Invoice = require('../models/Invoice');
const Payment = require('../models/Payment');
const Expense = require('../models/Expense');
const User = require('../models/User');
const xml2js = require('xml2js');

// Tax region configurations
const TAX_REGIONS = {
  US: {
    name: 'United States',
    taxType: 'Sales Tax',
    currency: 'USD',
    filingFrequency: ['monthly', 'quarterly', 'annually'],
    supportedForms: ['941', '940', 'W-2', '1099'],
    dueDates: {
      monthly: 15, // Day of month
      quarterly: 15,
      annually: 15
    }
  },
  EU: {
    name: 'European Union',
    taxType: 'VAT',
    currency: 'EUR',
    filingFrequency: ['monthly', 'quarterly', 'annually'],
    supportedForms: ['VAT Return'],
    dueDates: {
      monthly: 15,
      quarterly: 15,
      annually: 15
    }
  },
  INDIA: {
    name: 'India',
    taxType: 'GST',
    currency: 'INR',
    filingFrequency: ['monthly', 'quarterly'],
    supportedForms: ['GSTR-1', 'GSTR-3B', 'GSTR-9'],
    dueDates: {
      monthly: 20,
      quarterly: 20
    }
  },
  UK: {
    name: 'United Kingdom',
    taxType: 'VAT',
    currency: 'GBP',
    filingFrequency: ['quarterly', 'annually'],
    supportedForms: ['VAT Return'],
    dueDates: {
      quarterly: 7,
      annually: 7
    }
  },
  CANADA: {
    name: 'Canada',
    taxType: 'GST/HST',
    currency: 'CAD',
    filingFrequency: ['monthly', 'quarterly', 'annually'],
    supportedForms: ['GST-HST Return'],
    dueDates: {
      monthly: 30,
      quarterly: 30,
      annually: 30
    }
  }
};

// @desc    Get tax filing report for a region
// @route   GET /api/reports/tax-filing/:region
// @access  Private
const getTaxFilingReport = asyncHandler(async (req, res) => {
  const { region } = req.params;
  const { period, year, quarter, format = 'json' } = req.query;
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  if (!TAX_REGIONS[region]) {
    res.status(400);
    throw new Error('Unsupported tax region');
  }
  
  // Determine date range based on period
  const dateRange = getDateRange(period, year, quarter, req.query);
  
  // Get all invoices in the date range for the region
  const invoices = await Invoice.find({
    tenantId,
    taxRegion: region,
    issueDate: {
      $gte: dateRange.start,
      $lte: dateRange.end
    }
  }).populate('clientId', 'firstName lastName email companyName');
  
  // Get all expenses in the date range for the region
  const expenses = await Expense.find({
    tenantId,
    expenseDate: {
      $gte: dateRange.start,
      $lte: dateRange.end
    }
  }).populate('createdBy', 'firstName lastName');
  
  // Calculate tax obligations
  const taxData = calculateTaxObligations(invoices, expenses, region, dateRange);
  
  if (format === 'csv') {
    const csv = generateTaxCSV(taxData, region, dateRange);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename=tax-filing-${region}-${dateRange.start.toISOString().split('T')[0]}.csv`);
    res.send(csv);
  } else if (format === 'xml') {
    const xml = generateTaxXML(taxData, region, dateRange);
    res.setHeader('Content-Type', 'application/xml');
    res.setHeader('Content-Disposition', `attachment; filename=tax-filing-${region}-${dateRange.start.toISOString().split('T')[0]}.xml`);
    res.send(xml);
  } else {
    res.json({
      success: true,
      data: {
        region,
        period,
        dateRange,
        taxData,
        metadata: {
          generatedAt: new Date(),
          generatedBy: req.user._id,
          version: '1.0'
        }
      }
    });
  }
});

// @desc    Get tax summary for dashboard
// @route   GET /api/reports/tax-summary
// @access  Private
const getTaxSummary = asyncHandler(async (req, res) => {
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  const { year = new Date().getFullYear() } = req.query;
  
  const startDate = new Date(year, 0, 1);
  const endDate = new Date(year, 11, 31);
  
  // Get tax data by region
  const taxSummary = {};
  
  for (const region of Object.keys(TAX_REGIONS)) {
    const invoices = await Invoice.find({
      tenantId,
      taxRegion: region,
      issueDate: { $gte: startDate, $lte: endDate }
    });
    
    const expenses = await Expense.find({
      tenantId,
      expenseDate: { $gte: startDate, $lte: endDate }
    });
    
    const taxData = calculateTaxObligations(invoices, expenses, region, { start: startDate, end: endDate });
    
    taxSummary[region] = {
      region: TAX_REGIONS[region].name,
      taxType: TAX_REGIONS[region].taxType,
      currency: TAX_REGIONS[region].currency,
      totalRevenue: taxData.totalRevenue,
      totalTaxCollected: taxData.totalTaxCollected,
      totalTaxPaid: taxData.totalTaxPaid,
      netTaxObligation: taxData.netTaxObligation,
      invoiceCount: invoices.length,
      expenseCount: expenses.length,
      filingDueDate: calculateNextFilingDate(region, year)
    };
  }
  
  // Get upcoming filing deadlines
  const upcomingDeadlines = getUpcomingFilingDeadlines();
  
  res.json({
    success: true,
    data: {
      year,
      taxSummary,
      upcomingDeadlines,
      generatedAt: new Date()
    }
  });
});

// @desc    Get GST/VAT filing data for specific form
// @route   GET /api/reports/tax-filing/:region/:form
// @access  Private
const getTaxFilingForm = asyncHandler(async (req, res) => {
  const { region, form } = req.params;
  const { period, year, quarter } = req.query;
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  if (!TAX_REGIONS[region]) {
    res.status(400);
    throw new Error('Unsupported tax region');
  }
  
  const supportedForms = TAX_REGIONS[region].supportedForms;
  if (!supportedForms.includes(form)) {
    res.status(400);
    throw new Error(`Form ${form} not supported for ${region}`);
  }
  
  const dateRange = getDateRange(period, year, quarter);
  
  const formData = await generateTaxFormData(region, form, dateRange, tenantId);
  
  res.json({
    success: true,
    data: {
      region,
      form,
      period,
      dateRange,
      formData,
      generatedAt: new Date()
    }
  });
});

// @desc    Mark tax obligation as filed
// @route   POST /api/reports/tax-filing/:region/:obligationId/filed
// @access  Private (Admin only)
const markTaxObligationFiled = asyncHandler(async (req, res) => {
  const { region, obligationId } = req.params;
  const { filingDate, referenceNumber, notes } = req.body;
  
  const tenantId = req.user?.tenantId || req.headers['x-tenant-id'] || 'default';
  
  // Find invoices with this tax obligation
  const invoices = await Invoice.find({
    tenantId,
    taxRegion: region,
    'taxObligations._id': obligationId
  });
  
  let updatedCount = 0;
  
  for (const invoice of invoices) {
    const obligation = invoice.taxObligations.id(obligationId);
    if (obligation) {
      obligation.filed = true;
      obligation.filingDate = filingDate ? new Date(filingDate) : new Date();
      await invoice.save();
      updatedCount++;
    }
  }
  
  res.json({
    success: true,
    message: `${updatedCount} invoices marked as filed`,
    data: {
      updatedCount,
      obligationId,
      filingDate: filingDate ? new Date(filingDate) : new Date(),
      referenceNumber,
      notes
    }
  });
});

// Helper functions

function getDateRange(period, year, quarter, query = {}) {
  const currentYear = year ? parseInt(year) : new Date().getFullYear();
  
  switch (period) {
    case 'monthly':
      const month = parseInt(query.month) || new Date().getMonth();
      return {
        start: new Date(currentYear, month, 1),
        end: new Date(currentYear, month + 1, 0)
      };
      
    case 'quarterly':
      const q = quarter ? parseInt(quarter) : Math.floor(new Date().getMonth() / 3);
      const quarterStartMonth = q * 3;
      return {
        start: new Date(currentYear, quarterStartMonth, 1),
        end: new Date(currentYear, quarterStartMonth + 3, 0)
      };
      
    case 'annually':
      return {
        start: new Date(currentYear, 0, 1),
        end: new Date(currentYear, 11, 31)
      };
      
    default:
      // Default to current month
      return {
        start: new Date(currentYear, new Date().getMonth(), 1),
        end: new Date(currentYear, new Date().getMonth() + 1, 0)
      };
  }
}

function calculateTaxObligations(invoices, expenses, region, dateRange) {
  const regionConfig = TAX_REGIONS[region];
  
  let totalRevenue = 0;
  let totalTaxCollected = 0;
  let totalTaxPaid = 0;
  const taxBreakdown = {};
  
  // Calculate revenue and tax collected from invoices
  invoices.forEach(invoice => {
    totalRevenue += invoice.subtotal;
    totalTaxCollected += invoice.taxAmount;
    
    // Track tax by type/rate
    const taxKey = `${invoice.taxRate}%`;
    if (!taxBreakdown[taxKey]) {
      taxBreakdown[taxKey] = {
        rate: invoice.taxRate,
        taxableAmount: 0,
        taxAmount: 0,
        invoiceCount: 0
      };
    }
    
    taxBreakdown[taxKey].taxableAmount += invoice.subtotal;
    taxBreakdown[taxKey].taxAmount += invoice.taxAmount;
    taxBreakdown[taxKey].invoiceCount++;
  });
  
  // Calculate tax paid from expenses
  expenses.forEach(expense => {
    if (expense.taxInfo && expense.taxInfo.taxAmount) {
      totalTaxPaid += expense.taxInfo.taxAmount;
    }
  });
  
  // Calculate net tax obligation
  const netTaxObligation = totalTaxCollected - totalTaxPaid;
  
  // Determine filing due date
  const dueDate = calculateNextFilingDate(region, dateRange.start.getFullYear());
  
  return {
    region: regionConfig.name,
    taxType: regionConfig.taxType,
    currency: regionConfig.currency,
    dateRange,
    totalRevenue,
    totalTaxCollected,
    totalTaxPaid,
    netTaxObligation,
    taxBreakdown,
    invoiceCount: invoices.length,
    expenseCount: expenses.length,
    filingDueDate: dueDate,
    status: netTaxObligation > 0 ? 'payment_due' : netTaxObligation < 0 ? 'refund_due' : 'balanced'
  };
}

function calculateNextFilingDate(region, year) {
  const regionConfig = TAX_REGIONS[region];
  const now = new Date();
  const currentYear = year || now.getFullYear();
  
  // Simplified due date calculation - in reality, this would be more complex
  // considering the specific filing frequency and business registration date
  
  const dueDay = regionConfig.dueDates.annually || 15;
  return new Date(currentYear + 1, 0, dueDay);
}

function generateTaxCSV(taxData, region, dateRange) {
  const headers = [
    'Region',
    'Tax Type',
    'Period Start',
    'Period End',
    'Total Revenue',
    'Tax Collected',
    'Tax Paid',
    'Net Obligation',
    'Invoice Count',
    'Filing Due Date'
  ];
  
  const rows = [
    [
      taxData.region,
      taxData.taxType,
      dateRange.start.toISOString().split('T')[0],
      dateRange.end.toISOString().split('T')[0],
      taxData.totalRevenue.toFixed(2),
      taxData.totalTaxCollected.toFixed(2),
      taxData.totalTaxPaid.toFixed(2),
      taxData.netTaxObligation.toFixed(2),
      taxData.invoiceCount,
      taxData.filingDueDate.toISOString().split('T')[0]
    ].join(',')
  ];
  
  return headers.join(',') + '\n' + rows.join('\n');
}

function generateTaxXML(taxData, region, dateRange) {
  const builder = new xml2js.Builder();
  
  const taxReport = {
    TaxReport: {
      Region: taxData.region,
      TaxType: taxData.taxType,
      PeriodStart: dateRange.start.toISOString(),
      PeriodEnd: dateRange.end.toISOString(),
      TotalRevenue: taxData.totalRevenue,
      TaxCollected: taxData.totalTaxCollected,
      TaxPaid: taxData.totalTaxPaid,
      NetObligation: taxData.netTaxObligation,
      InvoiceCount: taxData.invoiceCount,
      FilingDueDate: taxData.filingDueDate.toISOString(),
      GeneratedAt: new Date().toISOString()
    }
  };
  
  return builder.buildObject(taxReport);
}

async function generateTaxFormData(region, form, dateRange, tenantId) {
  // This would generate specific form data for each tax region/form type
  // For now, return generic data structure
  
  const invoices = await Invoice.find({
    tenantId,
    taxRegion: region,
    issueDate: {
      $gte: dateRange.start,
      $lte: dateRange.end
    }
  });
  
  return {
    formNumber: form,
    region,
    period: dateRange,
    totalSales: invoices.reduce((sum, inv) => sum + inv.subtotal, 0),
    totalTax: invoices.reduce((sum, inv) => sum + inv.taxAmount, 0),
    invoiceCount: invoices.length,
    taxableTransactions: invoices.filter(inv => inv.taxAmount > 0).length
  };
}

function getUpcomingFilingDeadlines() {
  const deadlines = [];
  const now = new Date();
  
  for (const [region, config] of Object.entries(TAX_REGIONS)) {
    const nextDue = calculateNextFilingDate(region);
    const daysUntilDue = Math.ceil((nextDue - now) / (1000 * 60 * 60 * 24));
    
    if (daysUntilDue <= 90 && daysUntilDue > 0) {
      deadlines.push({
        region,
        regionName: config.name,
        taxType: config.taxType,
        dueDate: nextDue,
        daysUntilDue
      });
    }
  }
  
  return deadlines.sort((a, b) => a.daysUntilDue - b.daysUntilDue);
}

module.exports = {
  getTaxFilingReport,
  getTaxSummary,
  getTaxFilingForm,
  markTaxObligationFiled
};