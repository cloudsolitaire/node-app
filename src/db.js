const { createLogger, format, transports } = require("winston");

const logger = createLogger({
  level: "info",
  format: format.combine(format.timestamp(), format.json()),
  transports: [new transports.Console()],
});

// Simulated in-memory database
const users = {
  "1": { id: "1", name: "Alice Johnson", email: "alice@example.com", role: "admin" },
  "2": { id: "2", name: "Bob Smith", email: "bob@example.com", role: "user" },
  "3": { id: "3", name: "Charlie Brown", email: "charlie@example.com", role: "user" },
};

// BUG: Connection pool simulation — pool starts with 10 connections
// but each query "borrows" one and only returns it 50% of the time.
// Eventually the pool is exhausted and queries start timing out.
let connectionPool = { available: 10, total: 10, waitQueue: 0 };

async function getConnection() {
  if (connectionPool.available <= 0) {
    connectionPool.waitQueue++;
    logger.warn("Connection pool exhausted, waiting...", {
      available: connectionPool.available,
      total: connectionPool.total,
      waitQueue: connectionPool.waitQueue,
    });

    // Simulate timeout waiting for connection
    await new Promise((resolve) => setTimeout(resolve, 5000));

    if (connectionPool.available <= 0) {
      connectionPool.waitQueue--;
      throw new Error(
        `Connection pool timeout: ${connectionPool.available}/${connectionPool.total} available, ` +
        `${connectionPool.waitQueue} waiting`
      );
    }
    connectionPool.waitQueue--;
  }

  connectionPool.available--;
  logger.debug("Connection acquired", {
    available: connectionPool.available,
    total: connectionPool.total,
  });

  return {
    release: () => {
      connectionPool.available++;
    },
  };
}

async function connectToDatabase() {
  logger.info("Connecting to database...", {
    pool: `${connectionPool.available}/${connectionPool.total}`,
  });
  // Simulate connection delay
  await new Promise((resolve) => setTimeout(resolve, 500));
  logger.info("Database connected", {
    pool: `${connectionPool.available}/${connectionPool.total}`,
  });
}

async function getUserById(id) {
  const conn = await getConnection();

  // Simulate query latency
  await new Promise((resolve) => setTimeout(resolve, 50));

  const user = users[id] || null;

  // BUG: Connection leak — only release connection 50% of the time.
  // This slowly drains the pool until all queries start timing out.
  if (Math.random() > 0.5) {
    conn.release();
  } else {
    logger.debug("Connection NOT released (simulated leak)", { userId: id });
  }

  return user;
}

async function getAllOrders() {
  const conn = await getConnection();

  await new Promise((resolve) => setTimeout(resolve, 100));

  // BUG: Connection leak here too
  if (Math.random() > 0.5) {
    conn.release();
  }

  // Return simulated orders — many orders to trigger N+1 bug in app.js
  return Array.from({ length: 50 }, (_, i) => ({
    id: `order-${i + 1}`,
    userId: String((i % 3) + 1),
    amount: Math.round(Math.random() * 10000) / 100,
    status: ["pending", "completed", "shipped"][i % 3],
    createdAt: new Date(Date.now() - Math.random() * 86400000 * 30).toISOString(),
  }));
}

// Export pool stats for health checks
function getPoolStats() {
  return { ...connectionPool };
}

module.exports = { connectToDatabase, getUserById, getAllOrders, getPoolStats };
