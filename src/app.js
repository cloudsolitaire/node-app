const express = require("express");
const { createLogger, format, transports } = require("winston");
const { register, collectDefaultMetrics, Counter, Histogram, Gauge } = require("prom-client");
const { connectToDatabase, getUserById, getAllOrders } = require("./db");
const { processPayment } = require("./payment");
const { sendNotification } = require("./notification");

// ── Logger (logs go to stdout → Fluentd/Fluent Bit → OpenSearch) ────
const logger = createLogger({
  level: "info",
  format: format.combine(
    format.timestamp(),
    format.json()
  ),
  transports: [new transports.Console()],
});

// ── Prometheus Metrics ──────────────────────────────────────────────
collectDefaultMetrics();

const httpRequestDuration = new Histogram({
  name: "http_request_duration_seconds",
  help: "Duration of HTTP requests in seconds",
  labelNames: ["method", "route", "status"],
  buckets: [0.01, 0.05, 0.1, 0.5, 1, 5, 10],
});

const httpRequestTotal = new Counter({
  name: "http_requests_total",
  help: "Total HTTP requests",
  labelNames: ["method", "route", "status"],
});

const errorTotal = new Counter({
  name: "app_errors_total",
  help: "Total application errors",
  labelNames: ["type", "endpoint"],
});

const memoryLeakGauge = new Gauge({
  name: "app_memory_leak_bytes",
  help: "Memory consumed by the leak array",
});

// ── BUG 1: Memory Leak ─────────────────────────────────────────────
// Every request to /api/users/:id pushes data into a global array
// that is NEVER cleaned up. Over time, the pod OOMs.
const leakedData = [];

// ── App ─────────────────────────────────────────────────────────────
const app = express();
app.use(express.json());

// Middleware: metrics + request logging
app.use((req, res, next) => {
  const start = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    httpRequestDuration.observe(
      { method: req.method, route: req.route?.path || req.path, status: res.statusCode },
      duration
    );
    httpRequestTotal.inc({ method: req.method, route: req.route?.path || req.path, status: res.statusCode });
  });
  next();
});

// ── Routes ──────────────────────────────────────────────────────────

// Health check
app.get("/health", (req, res) => {
  res.json({ status: "ok", uptime: process.uptime() });
});

// Prometheus metrics endpoint
app.get("/metrics", async (req, res) => {
  res.set("Content-Type", register.contentType);
  res.end(await register.metrics());
});

// GET /api/users/:id
// BUG 1: Memory leak — stores full user object in global array every request
// BUG 2: Unhandled null — getUserById can return null, but we access .email without checking
app.get("/api/users/:id", async (req, res) => {
  try {
    const user = await getUserById(req.params.id);

    // BUG 1: Memory leak — this array grows forever
    leakedData.push({ user, timestamp: new Date(), requestId: Math.random() });
    memoryLeakGauge.set(JSON.stringify(leakedData).length);

    // BUG 2: If user is null (id not found), this crashes with
    // "TypeError: Cannot read properties of null (reading 'email')"
    logger.info(`Fetched user: ${user.email}`, { userId: req.params.id });

    res.json(user);
  } catch (err) {
    logger.error("Failed to fetch user", {
      error: err.message,
      stack: err.stack,
      userId: req.params.id,
      endpoint: "/api/users/:id",
    });
    errorTotal.inc({ type: "user_fetch_error", endpoint: "/api/users/:id" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/orders
// BUG 3: N+1 query — fetches all orders, then fetches user for EACH order
// individually. With 1000 orders, that's 1001 DB calls. Response takes 10s+.
app.get("/api/orders", async (req, res) => {
  try {
    const orders = await getAllOrders();

    // BUG 3: N+1 query problem — each order triggers a separate getUserById call
    const enrichedOrders = [];
    for (const order of orders) {
      const user = await getUserById(order.userId);
      enrichedOrders.push({ ...order, userName: user?.name || "unknown" });
    }

    logger.info(`Fetched ${enrichedOrders.length} orders`);
    res.json(enrichedOrders);
  } catch (err) {
    logger.error("Failed to fetch orders", {
      error: err.message,
      stack: err.stack,
      endpoint: "/api/orders",
    });
    errorTotal.inc({ type: "order_fetch_error", endpoint: "/api/orders" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// POST /api/payments
// BUG 4: Race condition — no idempotency check. If user double-clicks,
// payment processes twice. Also, payment.js has a bug where it doesn't
// handle timeouts from the payment gateway.
app.post("/api/payments", async (req, res) => {
  const { orderId, amount, currency } = req.body;

  try {
    logger.info("Processing payment", { orderId, amount, currency });

    // BUG 4: No idempotency key — duplicate payments possible
    const result = await processPayment(orderId, amount, currency);

    logger.info("Payment processed", { orderId, transactionId: result.transactionId });
    res.json(result);
  } catch (err) {
    logger.error("Payment failed", {
      error: err.message,
      stack: err.stack,
      orderId,
      amount,
      endpoint: "/api/payments",
    });
    errorTotal.inc({ type: "payment_error", endpoint: "/api/payments" });
    res.status(500).json({ error: "Payment processing failed" });
  }
});

// POST /api/notifications
// BUG 5: Unhandled promise rejection — sendNotification is async but
// we don't await it AND don't catch errors. This crashes the process
// intermittently when the notification service is unreachable.
app.post("/api/notifications", (req, res) => {
  const { userId, message } = req.body;

  logger.info("Sending notification", { userId, message });

  // BUG 5: Fire-and-forget without error handling
  // If sendNotification rejects, it's an unhandled promise rejection
  // which crashes the process in Node 18+
  sendNotification(userId, message);

  res.json({ status: "queued" });
});

// GET /api/reports/:type
// BUG 7: Null pointer — accesses property on a null object.
// Every call throws TypeError and returns 500.
app.get("/api/reports/:type", (req, res) => {
  try {
    logger.info("Generating report", { reportType: req.params.type });

    // BUG 7: config is null, accessing .reports throws
    // "TypeError: Cannot read properties of null (reading 'reports')"
    const config = null;
    const templateId = config.reports[req.params.type].templateId;

    res.json({ templateId });
  } catch (err) {
    logger.error("Failed to generate report", {
      error: err.message,
      stack: err.stack,
      reportType: req.params.type,
      endpoint: "/api/reports/:type",
    });
    errorTotal.inc({ type: "report_generation_error", endpoint: "/api/reports/:type" });
    res.status(500).json({ error: "Internal server error" });
  }
});

// GET /api/cpu-burn
// BUG 6: CPU-intensive sync operation blocks the event loop.
// Simulates a badly written algorithm that pegs CPU at 100%.
app.get("/api/cpu-burn", (req, res) => {
  const iterations = parseInt(req.query.iterations) || 100000000;
  logger.info("Starting CPU-intensive operation", { iterations });

  // BUG 6: Synchronous CPU-bound work blocks the entire event loop
  let result = 0;
  for (let i = 0; i < iterations; i++) {
    result += Math.sqrt(i) * Math.sin(i);
  }

  logger.info("CPU operation complete", { result });
  res.json({ result });
});

// ── Start Server ────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;

connectToDatabase()
  .then(() => {
    app.listen(PORT, () => {
      logger.info(`Server started on port ${PORT}`);
    });
  })
  .catch((err) => {
    logger.error("Failed to connect to database", { error: err.message });
    process.exit(1);
  });
