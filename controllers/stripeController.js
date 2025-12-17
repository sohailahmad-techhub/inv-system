const asyncHandler = require('express-async-handler');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const Payment = require('../models/Payment');
const Invoice = require('../models/Invoice');

// @desc    Create Stripe checkout session
// @route   POST /stripe/checkout
// @access  Private
const createCheckoutSession = asyncHandler(async (req, res) => {
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

  // Create payment intent
  const paymentIntent = await stripe.paymentIntents.create({
    amount: Math.round(amountToPay * 100), // Stripe expects amount in cents
    currency: invoice.currency.toLowerCase() || 'usd',
    metadata: {
      invoiceId: invoice._id.toString(),
      invoiceNumber: invoice.invoiceNumber,
      userId: req.user._id.toString()
    },
    description: `Payment for Invoice ${invoice.invoiceNumber}`
  });

  // Create pending payment record
  const payment = await Payment.create({
    invoiceId: invoice._id,
    clientId: invoice.clientId?._id,
    amount: amountToPay,
    currency: invoice.currency,
    method: 'Stripe',
    status: 'Pending',
    transactionId: paymentIntent.id,
    fees: 0,
    netAmount: amountToPay,
    metadata: {
      paymentIntentId: paymentIntent.id,
      clientSecret: paymentIntent.client_secret
    },
    processedBy: req.user._id,
    tenantId: invoice.tenantId
  });

  res.status(201).json({
    success: true,
    message: 'Checkout session created',
    data: {
      paymentId: payment._id,
      clientSecret: paymentIntent.client_secret,
      paymentIntentId: paymentIntent.id,
      amount: amountToPay,
      currency: invoice.currency
    }
  });
});

// @desc    Handle Stripe webhook events
// @route   POST /stripe/webhook
// @access  Public (Webhook)
const handleWebhook = asyncHandler(async (req, res) => {
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;

  let event;

  try {
    // req.body is raw buffer when using express.raw()
    event = stripe.webhooks.constructEvent(req.body, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature verification failed:', err.message);
    return res.status(400).send(`Webhook Error: ${err.message}`);
  }

  // Handle the event
  switch (event.type) {
    case 'payment_intent.succeeded':
      await handlePaymentIntentSucceeded(event.data.object);
      break;
    
    case 'payment_intent.payment_failed':
      await handlePaymentIntentFailed(event.data.object);
      break;
    
    case 'charge.refunded':
      await handleChargeRefunded(event.data.object);
      break;
    
    default:
      console.log(`Unhandled event type: ${event.type}`);
  }

  res.json({ received: true });
});

// Handle successful payment intent
const handlePaymentIntentSucceeded = async (paymentIntent) => {
  console.log('Payment intent succeeded:', paymentIntent.id);

  // Find the payment record
  const payment = await Payment.findOne({ transactionId: paymentIntent.id });

  if (!payment) {
    console.error('Payment record not found for transaction:', paymentIntent.id);
    return;
  }

  // Update payment status
  payment.status = 'Completed';
  payment.metadata = {
    ...payment.metadata,
    paymentIntentId: paymentIntent.id,
    chargeId: paymentIntent.charges?.data[0]?.id,
    receiptUrl: paymentIntent.charges?.data[0]?.receipt_url
  };
  await payment.save();

  // Update invoice
  const invoice = await Invoice.findById(payment.invoiceId);
  if (invoice) {
    invoice.paidAmount += payment.amount;
    await invoice.save();
  }

  console.log('Payment completed successfully:', payment._id);
};

// Handle failed payment intent
const handlePaymentIntentFailed = async (paymentIntent) => {
  console.log('Payment intent failed:', paymentIntent.id);

  // Find the payment record
  const payment = await Payment.findOne({ transactionId: paymentIntent.id });

  if (!payment) {
    console.error('Payment record not found for transaction:', paymentIntent.id);
    return;
  }

  // Update payment status
  payment.status = 'Failed';
  payment.metadata = {
    ...payment.metadata,
    error: paymentIntent.last_payment_error?.message || 'Payment failed'
  };
  await payment.save();

  console.log('Payment marked as failed:', payment._id);
};

// Handle refunded charge
const handleChargeRefunded = async (charge) => {
  console.log('Charge refunded:', charge.id);

  // Find the payment record by charge ID
  const payment = await Payment.findOne({ 
    'metadata.chargeId': charge.id 
  });

  if (!payment) {
    console.error('Payment record not found for charge:', charge.id);
    return;
  }

  // Update payment status
  payment.status = 'Refunded';
  payment.refundedAmount = charge.amount_refunded / 100; // Convert from cents
  payment.refundedAt = new Date(charge.refunds.data[0].created * 1000);
  payment.refundId = charge.refunds.data[0].id;
  await payment.save();

  // Update invoice
  const invoice = await Invoice.findById(payment.invoiceId);
  if (invoice) {
    invoice.paidAmount -= payment.refundedAmount;
    await invoice.save();
  }

  console.log('Payment refunded successfully:', payment._id);
};

// @desc    Get Stripe payment status
// @route   GET /stripe/payment/:id
// @access  Private
const getPaymentStatus = asyncHandler(async (req, res) => {
  const payment = await Payment.findById(req.params.id)
    .populate('invoiceId', 'invoiceNumber totalAmount paidAmount paymentStatus');

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  // Check authorization
  if (req.user.role === 'CLIENT') {
    const invoice = await Invoice.findById(payment.invoiceId);
    if (invoice.clientId.toString() !== req.user._id.toString()) {
      res.status(403);
      throw new Error('Not authorized to view this payment');
    }
  }

  // Get Stripe payment intent status if available
  let stripeStatus = null;
  if (payment.transactionId) {
    try {
      const paymentIntent = await stripe.paymentIntents.retrieve(payment.transactionId);
      stripeStatus = {
        status: paymentIntent.status,
        amount: paymentIntent.amount / 100,
        currency: paymentIntent.currency,
        created: new Date(paymentIntent.created * 1000)
      };
    } catch (err) {
      console.error('Error retrieving Stripe payment intent:', err.message);
    }
  }

  res.json({
    success: true,
    data: {
      payment,
      stripeStatus
    }
  });
});

// @desc    Refund a Stripe payment
// @route   POST /stripe/refund/:id
// @access  Private (ADMIN, ACCOUNTANT)
const refundStripePayment = asyncHandler(async (req, res) => {
  const { amount, reason } = req.body;

  const payment = await Payment.findById(req.params.id);

  if (!payment) {
    res.status(404);
    throw new Error('Payment not found');
  }

  // Check if payment method is Stripe
  if (payment.method !== 'Stripe') {
    res.status(400);
    throw new Error('This payment was not made through Stripe');
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

  // Process refund through Stripe
  try {
    const refund = await stripe.refunds.create({
      payment_intent: payment.transactionId,
      amount: Math.round(refundAmount * 100), // Convert to cents
      reason: reason || 'requested_by_customer'
    });

    // Update payment record
    payment.status = 'Refunded';
    payment.refundedAmount = refundAmount;
    payment.refundedAt = Date.now();
    payment.refundId = refund.id;
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
          id: refund.id,
          amount: refund.amount / 100,
          status: refund.status
        }
      }
    });
  } catch (err) {
    console.error('Stripe refund error:', err);
    res.status(500);
    throw new Error(`Stripe refund failed: ${err.message}`);
  }
});

module.exports = {
  createCheckoutSession,
  handleWebhook,
  getPaymentStatus,
  refundStripePayment
};
