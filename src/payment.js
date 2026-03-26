const { createLogger, format, transports } = require("winston");

const logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// BUG: No idempotency tracking — duplicate payments get processed
const processedPayments = new Set();

async function processPayment(orderId, amount, currency) {
  // BUG: This check is here but uses orderId only — if two requests
  // come in at the exact same time, both pass this check before either
  // adds to the Set (race condition).
  if (processedPayments.has(orderId)) {
    logger.warn("Duplicate payment detected", { orderId });
    return { status: "duplicate", orderId };
  }

  logger.info("Calling payment gateway", { orderId, amount, currency });

  // Simulate payment gateway call
  const gatewayDelay = 500 + Math.random() * 2000;
  await new Promise((resolve) => setTimeout(resolve, gatewayDelay));

  // BUG: 20% chance of gateway timeout — but we don't retry or handle
  // the partial state. The payment might have gone through on the
  // gateway side but we return an error to the user.
  if (Math.random() < 0.2) {
    logger.error("Payment gateway timeout", {
      orderId,
      amount,
      gatewayDelay: Math.round(gatewayDelay),
      error: "ETIMEDOUT",
    });
    throw new Error(
      `Payment gateway timeout after ${Math.round(gatewayDelay)}ms for order ${orderId}. ` +
      `Payment may have been charged — manual verification required.`
    );
  }

  // BUG: Adding to Set AFTER the async call means concurrent requests
  // for the same orderId both pass the duplicate check above
  processedPayments.add(orderId);

  const transactionId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;

  logger.info("Payment successful", {
    orderId,
    transactionId,
    amount,
    currency,
    gatewayLatency: Math.round(gatewayDelay),
  });

  return {
    status: "success",
    orderId,
    transactionId,
    amount,
    currency,
  };
}

module.exports = { processPayment };
