const asyncHandler = require('express-async-handler');
const paypal = require('@paypal/checkout-server-sdk');
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');

// PayPal environment setup
const environment = process.env.PAYPAL_MODE === 'live'
  ? new paypal.core.LiveEnvironment(
      process.env.PAYPAL_CLIENT_ID,
      process.env.PAYPAL_CLIENT_SECRET
    )
  : new paypal.core.SandboxEnvironment(
      process.env.PAYPAL_CLIENT_ID,
      process.env.PAYPAL_CLIENT_SECRET
    );

const client = new paypal.core.PayPalHttpClient(environment);

// @desc    Create PayPal order
// @route   POST /paypal/create-order
// @access  Private
const createOrder = asyncHandler(async (req, res) => {
  const { invoiceId } = req.body;

  // Verify invoice exists
  const invoice = await Invoice.findById(invoiceId).populate('clientId', 'email firstName lastName');
  
  if (!invoice) {
    res.status(404);
    throw new Error('Invoice not found');
  }

  // Check if user is authorized to pay this invoice
  if (req.user.role === 'CLIENT' && invoice.clientId._id.toString() !== req.user._id.toString()) {
    res.status(403);
    throw new Error('Not authorized to pay this invoice');
  }

  // Check if invoice is already paid
  if (invoice.paymentStatus === 'Paid') {
    res.status(400);
    throw new Error('Invoice is already paid');
  }

  // Calculate amount to pay (remaining balance)
  const amountToPay = invoice.totalAmount - invoice.paidAmount;

  if (amountToPay <= 0) {
    res.status(400);
    throw new Error('No remaining balance to pay');
  }

  // Create PayPal order
  const request = new paypal.orders.OrdersCreateRequest();
  request.prefer("return=representation");
  request.requestBody({
    intent: 'CAPTURE',
    purchase_units: [{
      reference_id: invoice._id.toString(),
      description: `Payment for Invoice ${invoice.invoiceNumber}`,
      custom_id: invoice._id.toString(),
      amount: {
        currency_code: invoice.currency || 'USD',
        value: amountToPay.toFixed(2)
      }
    }],
    application_context: {
      brand_name: process.env.APP_NAME || 'Your Company',
      landing_page: 'BILLING',
      user_action: 'PAY_NOW',
      return_url: `${process.env.FRONTEND_URL}/payment/success`,
      cancel_url: `${process.env.FRONTEND_URL}/payment/cancel`
    }
  });

  try {
    const order = await client.execute(request);

    // Create pending payment record
    const payment = await Payment.create({
      invoiceId: invoice._id,
      clientId: invoice.clientId?._id,
      amount: amountToPay,
      currency: invoice.currency,
      method: 'PayPal',
      status: 'Pending',
      transactionId: order.result.id,
      fees: 0,
      netAmount: amountToPay,
      metadata: {
        orderId: order.result.id,
        status: order.result.status
      },
      processedBy: req.user._id,
      tenantId: invoice.tenantId
    });

    res.status(201).json({
      success: true,
      message: 'PayPal order created',
      data: {
        paymentId: payment._id,
        orderId: order.result.id,
        amount: amountToPay,
        currency: invoice.currency,
        approvalUrl: order.result.links.find(link => link.rel === 'approve').href
      }
    });
  } catch (err) {
    console.error('PayPal order creation error:', err);
    res.status(500);
    throw new Error(`PayPal order creation failed: ${err.message}`);
  }
});

// @desc    Capture PayPal order
// @route   POST /paypal/capture-order
// @access  Private
const captureOrder = asyncHandler(async (req, res) => {
  const { orderId } = req.body;

  // Find the payment record
  const payment = await Payment.findOne({ transactionId: orderId });

  if (!payment) {
    res.status(404);
    throw new Error('Payment record not found');
  }

  // Check if already captured
  if (payment.status === 'Completed') {
    res.status(400);
    throw new Error('Order has already been captured');
  }

  // Capture the order
  const request = new paypal.orders.OrdersCaptureRequest(orderId);
  request.requestBody({});

  try {
    const capture = await client.execute(request);

    // Update payment status
    payment.status = 'Completed';
    payment.metadata = {
      ...payment.metadata,
      captureId: capture.result.purchase_units[0].payments.captures[0].id,
      captureStatus: capture.result.status,
      captureTime: capture.result.update_time
    };
    await payment.save();

    // Update invoice
    const invoice = await Invoice.findById(payment.invoiceId);
    if (invoice) {
      invoice.paidAmount += payment.amount;
      await invoice.save();
    }

    const populatedPayment = await Payment.findById(payment._id)
      .populate('invoiceId', 'invoiceNumber totalAmount paidAmount paymentStatus');

    res.json({
      success: true,
      message: 'Payment captured successfully',
      data: {
        payment: populatedPayment,
        captureDetails: {
          id: capture.result.id,
          status: capture.result.status,
          captureId: capture.result.purchase_units[0].payments.captures[0].id
        }
      }
    });
  } catch (err) {
    console.error('PayPal capture error:', err);
    
    // Mark payment as failed
    payment.status = 'Failed';
    payment.metadata = {
      ...payment.metadata,
      error: err.message
    };
    await payment.save();

    res.status(500);
    throw new Error(`PayPal capture failed: ${err.message}`);
  }
});

// @desc    Handle PayPal webhook
// @route   POST /paypal/webhook
// @access  Public (Webhook)
const handleWebhook = asyncHandler(async (req, res) => {
  const webhookEvent = req.body;

  console.log('PayPal webhook event received:', webhookEvent.event_type);

  // Handle different event types
  switch (webhookEvent.event_type) {
    case 'PAYMENT.CAPTURE.COMPLETED':
      await handleCaptureCompleted(webhookEvent.resource);
      break;
    
    case 'PAYMENT.CAPTURE.DENIED':
    case 'PAYMENT.CAPTURE.DECLINED':
      await handleCaptureFailed(webhookEvent.resource);
      break;
    
    case 'PAYMENT.CAPTURE.REFUNDED':
      await handleCaptureRefunded(webhookEvent.resource);
      break;
    
    default:
      console.log(`Unhandled webhook event type: ${webhookEvent.event_type}`);
  }

  res.json({ received: true });
});

// Handle completed capture
const handleCaptureCompleted = async (resource) => {
  console.log('Capture completed:', resource.id);

  // Find payment by capture ID or order ID
  const payment = await Payment.findOne({
    $or: [
      { 'metadata.captureId': resource.id },
      { transactionId: resource.supplementary_data?.related_ids?.order_id }
    ]
  });

  if (!payment) {
    console.error('Payment record not found for capture:', resource.id);
    return;
  }

  // Update payment if not already completed
  if (payment.status !== 'Completed') {
    payment.status = 'Completed';
    payment.metadata = {
      ...payment.metadata,
      captureId: resource.id,
      captureStatus: resource.status
    };
    await payment.save();

    // Update invoice
    const invoice = await Invoice.findById(payment.invoiceId);
    if (invoice) {
      invoice.paidAmount += payment.amount;
      await invoice.save();
    }
  }

  console.log('Payment completed via webhook:', payment._id);
};

// Handle failed capture
const handleCaptureFailed = async (resource) => {
  console.log('Capture failed:', resource.id);

  const payment = await Payment.findOne({
    $or: [
      { 'metadata.captureId': resource.id },
      { transactionId: resource.supplementary_data?.related_ids?.order_id }
    ]
  });

  if (!payment) {
    console.error('Payment record not found for capture:', resource.id);
    return;
  }

  payment.status = 'Failed';
  payment.metadata = {
    ...payment.metadata,
    error: resource.status_details?.reason || 'Payment declined'
  };
  await payment.save();

  console.log('Payment marked as failed via webhook:', payment._id);
};

// Handle refunded capture
const handleCaptureRefunded = async (resource) => {
  console.log('Capture refunded:', resource.id);

  const payment = await Payment.findOne({ 'metadata.captureId': resource.id });

  if (!payment) {
    console.error('Payment record not found for capture:', resource.id);
    return;
  }

  const refundAmount = parseFloat(resource.amount.value);

  payment.status = 'Refunded';
  payment.refundedAmount = refundAmount;
  payment.refundedAt = new Date();
  payment.metadata = {
    ...payment.metadata,
    refundId: resource.id
  };
  await payment.save();

  // Update invoice
  const invoice = await Invoice.findById(payment.invoiceId);
  if (invoice) {
    invoice.paidAmount -= refundAmount;
    await invoice.save();
  }

  console.log('Payment refunded via webhook:', payment._id);
};

// @desc    Refund a PayPal payment
// @route   POST /paypal/refund/:id
// @access  Private (ADMIN, ACCOUNTANT)
const refundPayPalPayment = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;

  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  // Check if payment method is PayPal
  if (payment.method !== 'PayPal') {
    res.status(400);
    throw new Error('This payment was not made through PayPal');
  }

  // Check if payment is completed
  if (payment.status !== 'Completed') {
    res.status(400);
    throw new Error('Can only refund completed payments');
  }

  // Validate refund amount
  const refundAmount = amount || payment.amount;
  if (refundAmount > payment.amount) {
    res.status(400);
    throw new Error('Refund amount cannot exceed payment amount');
  }

  const captureId = payment.metadata.captureId;
  if (!captureId) {
    res.status(400);
    throw new Error('Capture ID not found');
  }

  // Create refund request
  const request = new paypal.payments.CapturesRefundRequest(captureId);
  request.requestBody({
    amount: {
      value: refundAmount.toFixed(2),
      currency_code: 'USD'
    },
    note_to_payer: reason || 'Refund processed'
  });

  try {
    const refund = await client.execute(request);

    // Update payment record
    payment.status = 'Refunded';
    payment.refundedAmount = refundAmount;
    payment.refundedAt = Date.now();
    payment.refundId = refund.result.id;
    payment.notes = payment.notes 
      ? `${payment.notes}\nRefund reason: ${reason || 'Not specified'}`
      : `Refund reason: ${reason || 'Not specified'}`;
    
    await payment.save();

    // Update invoice
    const invoice = await Invoice.findById(payment.invoiceId);
    invoice.paidAmount -= refundAmount;
    await invoice.save();

    res.json({
      success: true,
      message: 'Payment refunded successfully',
      data: {
        payment,
        refund: {
          id: refund.result.id,
          amount: refund.result.amount.value,
          status: refund.result.status
        }
      }
    });
  } catch (err) {
    console.error('PayPal refund error:', err);
    res.status(500);
    throw new Error(`PayPal refund failed: ${err.message}`);
  }
});

module.exports = {
  createOrder,
  captureOrder,
  handleWebhook,
  refundPayPalPayment
};
