const ownerState = {
  pollingHandle: null,
  latestPaidAt: 0,
  orders: []
};

const ownerLoginPanel = document.getElementById("ownerLoginPanel");
const ownerDashboard = document.getElementById("ownerDashboard");
const ownerLoginForm = document.getElementById("ownerLoginForm");
const ownerUsername = document.getElementById("ownerUsername");
const ownerPassword = document.getElementById("ownerPassword");
const ownerLoginButton = document.getElementById("ownerLoginButton");
const ownerLoginStatus = document.getElementById("ownerLoginStatus");
const dashboardStatus = document.getElementById("dashboardStatus");
const enableNotificationsButton = document.getElementById("enableNotificationsButton");
const refreshDashboardButton = document.getElementById("refreshDashboardButton");
const logoutButton = document.getElementById("logoutButton");
const ownerOrders = document.getElementById("ownerOrders");
const ownerAlertBanner = document.getElementById("ownerAlertBanner");

const statFields = {
  last30DaysSales: document.getElementById("last30DaysSales"),
  last30DaysOrders: document.getElementById("last30DaysOrders"),
  thisMonthSales: document.getElementById("thisMonthSales"),
  thisMonthOrders: document.getElementById("thisMonthOrders"),
  lastMonthSales: document.getElementById("lastMonthSales"),
  lifetimeOrders: document.getElementById("lifetimeOrders")
};

function formatPrice(price) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    maximumFractionDigits: 2
  }).format(Number(price) || 0);
}

function formatDateTime(value) {
  if (!value) {
    return "Unknown time";
  }

  return new Intl.DateTimeFormat("en-IN", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function setStatus(element, message, tone = "info") {
  element.textContent = message;
  element.className = `checkout-status ${tone} owner-status`;
}

function setAuthenticatedView(isAuthenticated) {
  ownerLoginPanel.hidden = isAuthenticated;
  ownerDashboard.hidden = !isAuthenticated;
}

function renderStats(stats) {
  statFields.last30DaysSales.textContent = formatPrice(stats.last30DaysSales);
  statFields.last30DaysOrders.textContent = String(stats.last30DaysOrders || 0);
  statFields.thisMonthSales.textContent = formatPrice(stats.thisMonthSales);
  statFields.thisMonthOrders.textContent = String(stats.thisMonthOrders || 0);
  statFields.lastMonthSales.textContent = formatPrice(stats.lastMonthSales);
  statFields.lifetimeOrders.textContent = String(stats.lifetimeOrders || 0);
}

function renderOrders(orders) {
  if (!orders.length) {
    ownerOrders.innerHTML = `<p class="empty-state">No paid orders yet.</p>`;
    return;
  }

  ownerOrders.innerHTML = orders
    .map(
      (order) => `
        <article class="owner-order-card">
          <div class="owner-order-head">
            <div>
              <strong>${order.customer?.name || "Unknown customer"}</strong>
              <span>${formatDateTime(order.paidAt)}</span>
            </div>
            <strong>${formatPrice(order.amountMajor)}</strong>
          </div>
          <div class="owner-order-meta">
            <span>Phone: ${order.customer?.phone || "-"}</span>
            <span>Email: ${order.customer?.email || "-"}</span>
          </div>
          <p class="owner-order-address">Address: ${order.customer?.address || "-"}</p>
          <div class="owner-order-items">
            ${order.lineItems
              .map(
                (item) => `
                  <span class="owner-order-item">${item.name} x${item.quantity}</span>
                `
              )
              .join("")}
          </div>
        </article>
      `
    )
    .join("");
}

function showAlertBanner(message) {
  ownerAlertBanner.hidden = false;
  ownerAlertBanner.textContent = message;
  window.clearTimeout(showAlertBanner.hideTimer);
  showAlertBanner.hideTimer = window.setTimeout(() => {
    ownerAlertBanner.hidden = true;
  }, 8000);
}

function playAlertTone() {
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;

  if (!AudioContextClass) {
    return;
  }

  const context = new AudioContextClass();
  const oscillator = context.createOscillator();
  const gainNode = context.createGain();

  oscillator.type = "sine";
  oscillator.frequency.value = 880;
  gainNode.gain.value = 0.03;
  oscillator.connect(gainNode);
  gainNode.connect(context.destination);
  oscillator.start();
  oscillator.stop(context.currentTime + 0.18);
}

function triggerPhoneFriendlyAlert(order) {
  const customerName = order.customer?.name || "New customer";
  const amount = formatPrice(order.amountMajor);
  const message = `New order from ${customerName} for ${amount}`;

  showAlertBanner(message);

  if (navigator.vibrate) {
    navigator.vibrate([220, 120, 220]);
  }

  try {
    playAlertTone();
  } catch (error) {
    // Ignore audio errors on devices that block autoplay.
  }

  if ("Notification" in window && Notification.permission === "granted") {
    new Notification("NJB FITNESS Order Alert", {
      body: `${customerName} placed an order for ${amount}`,
      tag: order.orderId
    });
  }

  document.title = "New Order | NJB FITNESS";
  window.setTimeout(() => {
    document.title = "NJB FITNESS | Owner Dashboard";
  }, 5000);
}

async function requestNotificationPermission() {
  if (!("Notification" in window)) {
    setStatus(dashboardStatus, "This browser does not support system notifications. Live alerts on the page still work.", "warning");
    return;
  }

  if (!window.isSecureContext) {
    setStatus(dashboardStatus, "Browser pop-up notifications need HTTPS. Page alerts and vibration will still work on your phone while this page is open.", "warning");
    return;
  }

  const permission = await Notification.requestPermission();

  if (permission === "granted") {
    setStatus(dashboardStatus, "Phone/browser alerts are enabled for this owner page.", "success");
    return;
  }

  setStatus(dashboardStatus, "Notification permission was not granted. The page will still show live order alerts.", "warning");
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    credentials: "same-origin",
    ...options
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Request failed.");
  }

  return payload;
}

async function loadDashboard() {
  const payload = await fetchJson("/api/admin/dashboard");
  ownerState.orders = Array.isArray(payload.orders) ? payload.orders : [];
  ownerState.latestPaidAt = payload.latestPaidAt ? new Date(payload.latestPaidAt).getTime() : 0;
  renderStats(payload.stats || {});
  renderOrders(ownerState.orders);
  setStatus(dashboardStatus, "Dashboard updated. New paid orders will appear here automatically.", "success");
}

async function pollForUpdates() {
  if (!ownerState.latestPaidAt) {
    return;
  }

  try {
    const payload = await fetchJson(`/api/admin/updates?after=${ownerState.latestPaidAt}`);
    const newOrders = Array.isArray(payload.orders) ? payload.orders : [];

    if (newOrders.length) {
      ownerState.latestPaidAt = payload.latestPaidAt || ownerState.latestPaidAt;
      ownerState.orders = [...newOrders, ...ownerState.orders].sort(
        (left, right) => new Date(right.paidAt).getTime() - new Date(left.paidAt).getTime()
      );
      renderOrders(ownerState.orders);

      for (const order of newOrders.slice().reverse()) {
        triggerPhoneFriendlyAlert(order);
      }

      setStatus(dashboardStatus, `${newOrders.length} new order${newOrders.length === 1 ? "" : "s"} received.`, "success");
    }
  } catch (error) {
    setStatus(dashboardStatus, error.message, "warning");
  }
}

function startPolling() {
  window.clearInterval(ownerState.pollingHandle);
  ownerState.pollingHandle = window.setInterval(pollForUpdates, 15000);
}

function stopPolling() {
  window.clearInterval(ownerState.pollingHandle);
  ownerState.pollingHandle = null;
}

async function checkSession() {
  try {
    const payload = await fetchJson("/api/admin/session");

    if (!payload.authenticated) {
      setAuthenticatedView(false);
      setStatus(ownerLoginStatus, "Enter your owner login to view private sales and customer information.", "info");
      return;
    }

    setAuthenticatedView(true);
    await loadDashboard();
    startPolling();
  } catch (error) {
    setAuthenticatedView(false);
    setStatus(ownerLoginStatus, error.message, "error");
  }
}

ownerLoginForm.addEventListener("submit", async (event) => {
  event.preventDefault();
  ownerLoginButton.disabled = true;
  setStatus(ownerLoginStatus, "Checking owner login...", "info");

  try {
    await fetchJson("/api/admin/login", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        username: ownerUsername.value.trim(),
        password: ownerPassword.value
      })
    });

    ownerPassword.value = "";
    setAuthenticatedView(true);
    await loadDashboard();
    startPolling();
  } catch (error) {
    setStatus(ownerLoginStatus, error.message, "error");
  } finally {
    ownerLoginButton.disabled = false;
  }
});

refreshDashboardButton.addEventListener("click", async () => {
  setStatus(dashboardStatus, "Refreshing dashboard...", "info");

  try {
    await loadDashboard();
  } catch (error) {
    setStatus(dashboardStatus, error.message, "error");
  }
});

enableNotificationsButton.addEventListener("click", requestNotificationPermission);

logoutButton.addEventListener("click", async () => {
  try {
    await fetchJson("/api/admin/logout", {
      method: "POST"
    });
  } catch (error) {
    // Even if logout fails, reset the local view.
  }

  stopPolling();
  ownerState.latestPaidAt = 0;
  ownerState.orders = [];
  setAuthenticatedView(false);
  ownerOrders.innerHTML = `<p class="empty-state">No paid orders yet.</p>`;
  setStatus(ownerLoginStatus, "You have been logged out of the owner dashboard.", "success");
});

checkSession();
