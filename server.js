const http = require("http");
const https = require("https");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const products = require("./products.js");

const rootDir = __dirname;
const dataDir = path.join(rootDir, "data");
const ordersFilePath = path.join(dataDir, "orders.json");
const pendingOrdersFilePath = path.join(dataDir, "pending-orders.json");

loadEnvFile(path.join(rootDir, ".env"));
ensureStorageFile(ordersFilePath, []);
ensureStorageFile(pendingOrdersFilePath, {});

const config = {
  port: Number(process.env.PORT) || 3000,
  razorpayKeyId: process.env.RAZORPAY_KEY_ID || "",
  razorpayKeySecret: process.env.RAZORPAY_KEY_SECRET || "",
  businessName: process.env.BUSINESS_NAME || "NJB FITNESS",
  businessLogo: process.env.BUSINESS_LOGO || "",
  currency: (process.env.CURRENCY || "INR").toUpperCase(),
  adminUsername: process.env.ADMIN_USERNAME || "owner",
  adminPassword: process.env.ADMIN_PASSWORD || "ChangeThisOwnerPassword123",
  adminSessionTtlMs: Math.max(1, Number(process.env.ADMIN_SESSION_HOURS) || 168) * 60 * 60 * 1000
};

const productMap = new Map(products.map((product) => [product.id, product]));
const adminSessions = new Map();

const contentTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "application/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml"
};

function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    return;
  }

  const lines = fs.readFileSync(filePath, "utf8").split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex === -1) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    const value = line.slice(separatorIndex + 1).trim().replace(/^['\"]|['\"]$/g, "");

    if (!process.env[key]) {
      process.env[key] = value;
    }
  }
}

function ensureStorageFile(filePath, defaultValue) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });

  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, JSON.stringify(defaultValue, null, 2));
  }
}

function readJsonFile(filePath, fallbackValue) {
  try {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch (error) {
    return fallbackValue;
  }
}

function writeJsonFile(filePath, payload) {
  ensureStorageFile(filePath, payload);
  fs.writeFileSync(filePath, JSON.stringify(payload, null, 2));
}

function sendJson(response, statusCode, payload, extraHeaders = {}) {
  const body = JSON.stringify(payload);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Content-Length": Buffer.byteLength(body),
    "Cache-Control": "no-store",
    ...extraHeaders
  });
  response.end(body);
}

function sendText(response, statusCode, message) {
  response.writeHead(statusCode, {
    "Content-Type": "text/plain; charset=utf-8",
    "Cache-Control": "no-store"
  });
  response.end(message);
}

function parseJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = "";

    request.on("data", (chunk) => {
      body += chunk;

      if (body.length > 1024 * 1024) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });

    request.on("end", () => {
      if (!body) {
        resolve({});
        return;
      }

      try {
        resolve(JSON.parse(body));
      } catch (error) {
        reject(new Error("Invalid JSON body."));
      }
    });

    request.on("error", reject);
  });
}

function getStaticFilePath(urlPath) {
  const normalizedPath = urlPath === "/" ? "/index.html" : urlPath === "/owner" ? "/owner.html" : urlPath;
  const filePath = path.join(rootDir, normalizedPath.replace(/^\/+/, ""));
  const resolvedPath = path.resolve(filePath);
  const rootBoundary = `${rootDir}${path.sep}`;

  if (resolvedPath !== rootDir && !resolvedPath.startsWith(rootBoundary)) {
    return null;
  }

  if (path.basename(resolvedPath).startsWith(".")) {
    return null;
  }

  return resolvedPath;
}

function serveStaticFile(urlPath, response) {
  const filePath = getStaticFilePath(urlPath);

  if (!filePath || !fs.existsSync(filePath) || fs.statSync(filePath).isDirectory()) {
    sendText(response, 404, "Not found.");
    return;
  }

  const extension = path.extname(filePath).toLowerCase();
  const contentType = contentTypes[extension] || "application/octet-stream";
  const file = fs.readFileSync(filePath);

  response.writeHead(200, {
    "Content-Type": contentType,
    "Content-Length": file.length,
    "Cache-Control": extension === ".html" ? "no-store" : "public, max-age=300"
  });
  response.end(file);
}

function isCheckoutConfigured() {
  return Boolean(config.razorpayKeyId && config.razorpayKeySecret);
}

function normalizeCart(cartPayload) {
  if (!Array.isArray(cartPayload)) {
    return [];
  }

  return cartPayload
    .map((entry) => {
      if (typeof entry === "number") {
        return { id: entry, quantity: 1 };
      }

      if (typeof entry === "object" && entry !== null) {
        return {
          id: Number(entry.id),
          quantity: Math.max(1, Number(entry.quantity) || 1)
        };
      }

      return null;
    })
    .filter(Boolean)
    .filter((entry) => Number.isInteger(entry.id) && Number.isFinite(entry.quantity));
}

function calculateOrder(cartItems) {
  const lineItems = [];
  let total = 0;
  let totalQuantity = 0;

  for (const entry of cartItems) {
    const product = productMap.get(entry.id);

    if (!product) {
      throw new Error(`Unknown product id: ${entry.id}`);
    }

    const quantity = Math.min(entry.quantity, 25);
    total += product.price * quantity;
    totalQuantity += quantity;
    lineItems.push({
      id: product.id,
      name: product.name,
      quantity,
      unitPrice: product.price,
      lineTotal: Number((product.price * quantity).toFixed(2))
    });
  }

  if (!lineItems.length) {
    throw new Error("Cart is empty.");
  }

  return {
    amountMajor: Number(total.toFixed(2)),
    amountSubunits: Math.round(total * 100),
    itemCount: totalQuantity,
    lineItems
  };
}

function normalizeCustomerDetails(source = {}) {
  const rawName = String(source.name || source.customerName || "").trim();
  const rawEmail = String(source.email || source.customerEmail || "").trim();
  const rawPhone = String(source.phone || source.customerPhone || "").trim();
  const rawAddress = String(source.address || source.customerAddress || "").trim();

  return {
    name: rawName.replace(/\s+/g, " "),
    email: rawEmail.toLowerCase(),
    phone: rawPhone.replace(/[^\d+\-\s()]/g, "").trim(),
    address: rawAddress.replace(/\s+/g, " ")
  };
}

function validateCustomerDetails(customer) {
  if (customer.name.length < 2) {
    throw new Error("Customer name is required.");
  }

  if (customer.phone.replace(/\D/g, "").length < 8) {
    throw new Error("Customer phone number is required.");
  }

  if (customer.address.length < 10) {
    throw new Error("Customer address is required.");
  }

  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    throw new Error("Customer email address is invalid.");
  }
}

function razorpayRequest(endpoint, payload) {
  return new Promise((resolve, reject) => {
    const requestBody = JSON.stringify(payload);
    const authorization = Buffer.from(`${config.razorpayKeyId}:${config.razorpayKeySecret}`).toString("base64");

    const request = https.request(
      {
        hostname: "api.razorpay.com",
        method: "POST",
        path: endpoint,
        headers: {
          Authorization: `Basic ${authorization}`,
          "Content-Type": "application/json",
          "Content-Length": Buffer.byteLength(requestBody)
        }
      },
      (response) => {
        let raw = "";

        response.on("data", (chunk) => {
          raw += chunk;
        });

        response.on("end", () => {
          try {
            const payloadText = raw || "{}";
            const parsed = JSON.parse(payloadText);

            if (response.statusCode >= 200 && response.statusCode < 300) {
              resolve(parsed);
              return;
            }

            reject(new Error(parsed.error?.description || "Razorpay API request failed."));
          } catch (error) {
            reject(new Error("Unexpected response from Razorpay."));
          }
        });
      }
    );

    request.on("error", reject);
    request.write(requestBody);
    request.end();
  });
}

function secureTextMatch(expectedValue, receivedValue) {
  const expectedBuffer = Buffer.from(String(expectedValue), "utf8");
  const receivedBuffer = Buffer.from(String(receivedValue || ""), "utf8");

  if (expectedBuffer.length !== receivedBuffer.length) {
    return false;
  }

  return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
}

function readOrders() {
  const orders = readJsonFile(ordersFilePath, []);
  return Array.isArray(orders) ? orders : [];
}

function writeOrders(orders) {
  writeJsonFile(ordersFilePath, orders);
}

function readPendingOrders() {
  const pendingOrders = readJsonFile(pendingOrdersFilePath, {});
  return pendingOrders && typeof pendingOrders === "object" && !Array.isArray(pendingOrders) ? pendingOrders : {};
}

function writePendingOrders(pendingOrders) {
  writeJsonFile(pendingOrdersFilePath, pendingOrders);
}

function cleanupPendingOrders(pendingOrders) {
  const cutoff = Date.now() - 7 * 24 * 60 * 60 * 1000;

  for (const [orderId, record] of Object.entries(pendingOrders)) {
    const createdAt = new Date(record.createdAt || 0).getTime();

    if (!createdAt || createdAt < cutoff) {
      delete pendingOrders[orderId];
    }
  }

  return pendingOrders;
}

function parseCookies(request) {
  const rawCookieHeader = String(request.headers.cookie || "");

  return rawCookieHeader.split(";").reduce((cookies, part) => {
    const [rawName, ...rawValueParts] = part.trim().split("=");

    if (!rawName) {
      return cookies;
    }

    cookies[rawName] = decodeURIComponent(rawValueParts.join("="));
    return cookies;
  }, {});
}

function serializeCookie(name, value, options = {}) {
  const cookieParts = [`${name}=${encodeURIComponent(value)}`];

  if (options.path) {
    cookieParts.push(`Path=${options.path}`);
  }

  if (typeof options.maxAge === "number") {
    cookieParts.push(`Max-Age=${Math.max(0, Math.floor(options.maxAge))}`);
  }

  if (options.httpOnly) {
    cookieParts.push("HttpOnly");
  }

  if (options.sameSite) {
    cookieParts.push(`SameSite=${options.sameSite}`);
  }

  return cookieParts.join("; ");
}

function pruneExpiredAdminSessions() {
  const now = Date.now();

  for (const [token, session] of adminSessions.entries()) {
    if (!session.expiresAt || session.expiresAt <= now) {
      adminSessions.delete(token);
    }
  }
}

function getAdminSession(request) {
  pruneExpiredAdminSessions();
  const cookies = parseCookies(request);
  const token = cookies.njb_admin_session;

  if (!token) {
    return null;
  }

  const session = adminSessions.get(token);

  if (!session) {
    return null;
  }

  return {
    token,
    ...session
  };
}

function setAdminSession(response) {
  const token = crypto.randomBytes(32).toString("hex");
  const expiresAt = Date.now() + config.adminSessionTtlMs;

  adminSessions.set(token, {
    username: config.adminUsername,
    expiresAt
  });

  response.setHeader(
    "Set-Cookie",
    serializeCookie("njb_admin_session", token, {
      path: "/",
      maxAge: Math.floor(config.adminSessionTtlMs / 1000),
      httpOnly: true,
      sameSite: "Lax"
    })
  );
}

function clearAdminSession(request, response) {
  const session = getAdminSession(request);

  if (session) {
    adminSessions.delete(session.token);
  }

  response.setHeader(
    "Set-Cookie",
    serializeCookie("njb_admin_session", "", {
      path: "/",
      maxAge: 0,
      httpOnly: true,
      sameSite: "Lax"
    })
  );
}

function requireAdmin(request, response) {
  const session = getAdminSession(request);

  if (session) {
    return session;
  }

  sendJson(response, 401, {
    error: "Owner login required."
  });
  return null;
}

function summariseOrders(orders) {
  return orders.reduce(
    (summary, order) => {
      summary.sales += Number(order.amountMajor) || 0;
      summary.orders += 1;
      return summary;
    },
    { sales: 0, orders: 0 }
  );
}

function buildDashboardPayload() {
  const orders = readOrders()
    .slice()
    .sort((left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime());

  const now = new Date();
  const thisMonthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const nextMonthStart = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const lastMonthStart = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const last30DaysStart = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const thisMonthOrders = orders.filter((order) => {
    const paidAt = new Date(order.paidAt);
    return paidAt >= thisMonthStart && paidAt < nextMonthStart;
  });

  const lastMonthOrders = orders.filter((order) => {
    const paidAt = new Date(order.paidAt);
    return paidAt >= lastMonthStart && paidAt < thisMonthStart;
  });

  const last30DaysOrders = orders.filter((order) => new Date(order.paidAt) >= last30DaysStart);
  const lifetime = summariseOrders(orders);
  const thisMonth = summariseOrders(thisMonthOrders);
  const lastMonth = summariseOrders(lastMonthOrders);
  const last30Days = summariseOrders(last30DaysOrders);

  return {
    stats: {
      lifetimeSales: Number(lifetime.sales.toFixed(2)),
      lifetimeOrders: lifetime.orders,
      thisMonthSales: Number(thisMonth.sales.toFixed(2)),
      thisMonthOrders: thisMonth.orders,
      lastMonthSales: Number(lastMonth.sales.toFixed(2)),
      lastMonthOrders: lastMonth.orders,
      last30DaysSales: Number(last30Days.sales.toFixed(2)),
      last30DaysOrders: last30Days.orders
    },
    orders,
    latestPaidAt: orders[0]?.paidAt || null
  };
}

async function handleCreateOrder(request, response) {
  if (!isCheckoutConfigured()) {
    sendJson(response, 503, {
      error: "Razorpay keys are missing. Add RAZORPAY_KEY_ID and RAZORPAY_KEY_SECRET in .env."
    });
    return;
  }

  try {
    const body = await parseJsonBody(request);
    const cart = normalizeCart(body.cart);
    const customer = normalizeCustomerDetails(body.customer || body);
    validateCustomerDetails(customer);

    const order = calculateOrder(cart);
    const receipt = `njb-${Date.now()}`;
    const razorpayOrder = await razorpayRequest("/v1/orders", {
      amount: order.amountSubunits,
      currency: config.currency,
      receipt,
      notes: {
        item_count: String(order.itemCount),
        total_amount: String(order.amountMajor),
        customer_name: customer.name.slice(0, 255),
        customer_phone: customer.phone.slice(0, 255)
      }
    });

    const pendingOrders = cleanupPendingOrders(readPendingOrders());
    pendingOrders[razorpayOrder.id] = {
      orderId: razorpayOrder.id,
      receipt,
      amountMajor: order.amountMajor,
      amountSubunits: order.amountSubunits,
      currency: config.currency,
      itemCount: order.itemCount,
      lineItems: order.lineItems,
      customer,
      createdAt: new Date().toISOString()
    };
    writePendingOrders(pendingOrders);

    sendJson(response, 200, {
      id: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency
    });
  } catch (error) {
    sendJson(response, 400, {
      error: error.message
    });
  }
}

async function handleVerifyPayment(request, response) {
  if (!isCheckoutConfigured()) {
    sendJson(response, 503, {
      error: "Razorpay keys are missing."
    });
    return;
  }

  try {
    const body = await parseJsonBody(request);
    const orderId = String(body.razorpay_order_id || "");
    const paymentId = String(body.razorpay_payment_id || "");
    const signature = String(body.razorpay_signature || "");

    if (!orderId || !paymentId || !signature) {
      throw new Error("Payment verification payload is incomplete.");
    }

    const digest = crypto
      .createHmac("sha256", config.razorpayKeySecret)
      .update(`${orderId}|${paymentId}`)
      .digest("hex");

    if (!secureTextMatch(digest, signature)) {
      throw new Error("Razorpay signature mismatch.");
    }

    const orders = readOrders();
    const existingOrder = orders.find((entry) => entry.orderId === orderId || entry.paymentId === paymentId);

    if (existingOrder) {
      sendJson(response, 200, {
        verified: true,
        order: existingOrder
      });
      return;
    }

    const pendingOrders = cleanupPendingOrders(readPendingOrders());
    const pendingOrder = pendingOrders[orderId];

    if (!pendingOrder) {
      throw new Error("Order details were not found for this payment.");
    }

    const savedOrder = {
      orderId,
      paymentId,
      amountMajor: pendingOrder.amountMajor,
      amountSubunits: pendingOrder.amountSubunits,
      currency: pendingOrder.currency,
      itemCount: pendingOrder.itemCount,
      lineItems: pendingOrder.lineItems,
      customer: pendingOrder.customer,
      receipt: pendingOrder.receipt,
      createdAt: pendingOrder.createdAt,
      paidAt: new Date().toISOString()
    };

    orders.unshift(savedOrder);
    writeOrders(orders);

    delete pendingOrders[orderId];
    writePendingOrders(pendingOrders);

    sendJson(response, 200, {
      verified: true,
      order: savedOrder
    });
  } catch (error) {
    sendJson(response, 400, {
      verified: false,
      error: error.message
    });
  }
}

async function handleAdminLogin(request, response) {
  try {
    const body = await parseJsonBody(request);
    const username = String(body.username || "").trim();
    const password = String(body.password || "");

    if (!secureTextMatch(config.adminUsername, username) || !secureTextMatch(config.adminPassword, password)) {
      sendJson(response, 401, {
        error: "Invalid owner username or password."
      });
      return;
    }

    setAdminSession(response);
    sendJson(response, 200, {
      authenticated: true,
      username: config.adminUsername
    });
  } catch (error) {
    sendJson(response, 400, {
      error: error.message
    });
  }
}

function handleAdminSession(request, response) {
  const session = getAdminSession(request);

  sendJson(response, 200, {
    authenticated: Boolean(session),
    username: session?.username || null
  });
}

function handleAdminLogout(request, response) {
  clearAdminSession(request, response);
  sendJson(response, 200, {
    authenticated: false
  });
}

function handleAdminDashboard(request, response) {
  if (!requireAdmin(request, response)) {
    return;
  }

  sendJson(response, 200, buildDashboardPayload());
}

function handleAdminUpdates(request, response, requestUrl) {
  if (!requireAdmin(request, response)) {
    return;
  }

  const after = Number(requestUrl.searchParams.get("after")) || 0;
  const orders = readOrders()
    .slice()
    .sort((left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime());

  const newOrders = orders.filter((order) => new Date(order.paidAt).getTime() > after);

  sendJson(response, 200, {
    orders: newOrders,
    latestPaidAt: orders[0] ? new Date(orders[0].paidAt).getTime() : after
  });
}

const server = http.createServer(async (request, response) => {
  const requestUrl = new URL(request.url, `http://${request.headers.host || "localhost"}`);

  if (request.method === "GET" && requestUrl.pathname === "/api/config") {
    sendJson(response, 200, {
      checkoutEnabled: isCheckoutConfigured(),
      razorpayKeyId: config.razorpayKeyId,
      currency: config.currency,
      businessName: config.businessName,
      businessLogo: config.businessLogo
    });
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/payment/order") {
    await handleCreateOrder(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/payment/verify") {
    await handleVerifyPayment(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/login") {
    await handleAdminLogin(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/session") {
    handleAdminSession(request, response);
    return;
  }

  if (request.method === "POST" && requestUrl.pathname === "/api/admin/logout") {
    handleAdminLogout(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/dashboard") {
    handleAdminDashboard(request, response);
    return;
  }

  if (request.method === "GET" && requestUrl.pathname === "/api/admin/updates") {
    handleAdminUpdates(request, response, requestUrl);
    return;
  }

  if (request.method !== "GET") {
    sendText(response, 405, "Method not allowed.");
    return;
  }

  serveStaticFile(requestUrl.pathname, response);
});

server.listen(config.port, () => {
  console.log(`NJB FITNESS storefront running on http://localhost:${config.port}`);
  console.log(`Owner dashboard available at http://localhost:${config.port}/owner`);
});
