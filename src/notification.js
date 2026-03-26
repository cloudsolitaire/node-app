const { createLogger, format, transports } = require("winston");

const logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// BUG: This function is async but callers in app.js don't await it
// and don't catch errors. When the notification service is unreachable
// (simulated 30% of the time), this throws an unhandled promise rejection
// which crashes the Node.js process in v18+.
async function sendNotification(userId, message) {
  logger.info("Connecting to notification service", { userId });

  // Simulate network call
  await new Promise((resolve) => setTimeout(resolve, 200));

  // BUG: 30% failure rate — simulates unreachable notification service
  if (Math.random() < 0.3) {
    logger.error("Notification service unreachable", {
      userId,
      error: "ECONNREFUSED",
      host: "notification-service.internal:8443",
    });
    throw new Error(
      `Failed to send notification to user ${userId}: ` +
      `connect ECONNREFUSED notification-service.internal:8443`
    );
  }

  logger.info("Notification sent", { userId, message: message.slice(0, 50) });
  return { status: "sent", userId };
}

module.exports = { sendNotification };
