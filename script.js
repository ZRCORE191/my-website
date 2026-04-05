const products = Array.isArray(window.NJB_PRODUCTS) ? window.NJB_PRODUCTS : [];

const state = {
  filter: "all",
  cart: [],
  config: {
    currency: "INR",
    businessName: "NJB FITNESS",
    checkoutEnabled: false,
    razorpayKeyId: "",
    businessLogo: "",
    paymentLink: "https://razorpay.me/zrcoreneth"
  },
  isProcessing: false
};

const productGrid = document.getElementById("productGrid");
const filters = document.getElementById("filters");
const cartToggle = document.getElementById("cartToggle");
const cartClose = document.getElementById("cartClose");
const cartDrawer = document.getElementById("cartDrawer");
const backdrop = document.getElementById("backdrop");
const cartItems = document.getElementById("cartItems");
const cartTotal = document.getElementById("cartTotal");
const cartCount = document.getElementById("cartCount");
const checkoutButton = document.getElementById("checkoutButton");
const checkoutStatus = document.getElementById("checkoutStatus");
const customerName = document.getElementById("customerName");
const customerEmail = document.getElementById("customerEmail");
const customerPhone = document.getElementById("customerPhone");
const customerAddress = document.getElementById("customerAddress");

function formatPrice(price) {
  return new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: state.config.currency || "INR",
    maximumFractionDigits: 2
  }).format(price);
}

function getFilteredProducts() {
  if (state.filter === "all") {
    return products;
  }

  return products.filter((product) => product.category === state.filter);
}

function setCheckoutStatus(message, tone = "info") {
  checkoutStatus.textContent = message;
  checkoutStatus.className = `checkout-status ${tone}`;
}

function getCartLines() {
  const grouped = new Map();

  for (const product of state.cart) {
    const existing = grouped.get(product.id);

    if (existing) {
      existing.quantity += 1;
      existing.lineTotal = Number((existing.quantity * existing.price).toFixed(2));
      continue;
    }

    grouped.set(product.id, {
      ...product,
      quantity: 1,
      lineTotal: Number(product.price.toFixed(2))
    });
  }

  return Array.from(grouped.values());
}

function getCartQuantity() {
  return state.cart.length;
}

function getCartPayload() {
  return getCartLines().map((item) => ({
    id: item.id,
    quantity: item.quantity
  }));
}

function getCustomerDetails() {
  return {
    name: customerName.value.trim(),
    email: customerEmail.value.trim(),
    phone: customerPhone.value.trim(),
    address: customerAddress.value.trim()
  };
}

function validateCustomerDetails() {
  const customer = getCustomerDetails();

  if (customer.name.length < 2) {
    throw new Error("Please enter the customer name.");
  }

  if (customer.phone.replace(/\D/g, "").length < 8) {
    throw new Error("Please enter the customer phone number.");
  }

  if (customer.address.length < 10) {
    throw new Error("Please enter the full delivery address.");
  }

  if (customer.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(customer.email)) {
    throw new Error("Please enter a valid email address.");
  }

  return customer;
}

function updateCheckoutButtonState() {
  const checkoutAvailable =
    !state.isProcessing &&
    state.cart.length > 0 &&
    ((state.config.checkoutEnabled && typeof window.Razorpay === "function") || Boolean(state.config.paymentLink));

  checkoutButton.disabled = !checkoutAvailable;

  if (state.isProcessing) {
    checkoutButton.textContent = "Processing...";
    return;
  }

  if (!state.cart.length) {
    checkoutButton.textContent = "Add items to cart";
    return;
  }

  if (!state.config.checkoutEnabled) {
    checkoutButton.textContent = state.config.paymentLink ? "Pay Now" : "Payment setup required";
    return;
  }

  if (typeof window.Razorpay !== "function") {
    checkoutButton.textContent = "Reload payment";
    return;
  }

  checkoutButton.textContent = "Pay with Razorpay";
}

function renderProducts() {
  const filtered = getFilteredProducts();

  productGrid.innerHTML = filtered
    .map(
      (product) => `
        <article class="product-card reveal visible">
          <div class="product-visual" aria-hidden="true"></div>
          <div class="product-topline">
            <span class="product-badge">${product.badge}</span>
            <span>${product.category}</span>
          </div>
          <h3>${product.name}</h3>
          <p>${product.blurb}</p>
          <footer>
            <strong>${formatPrice(product.price)}</strong>
            <button type="button" data-add="${product.id}">Add to Cart</button>
          </footer>
        </article>
      `
    )
    .join("");
}

function renderCart() {
  const lines = getCartLines();

  if (!lines.length) {
    cartItems.innerHTML = `<p class="empty-state">Your cart is empty. Add a part to get started.</p>`;
    cartTotal.textContent = formatPrice(0);
    cartCount.textContent = "0";
    updateCheckoutButtonState();
    return;
  }

  const total = lines.reduce((sum, item) => sum + item.lineTotal, 0);

  cartItems.innerHTML = lines
    .map(
      (item) => `
        <article class="cart-item">
          <div class="cart-line">
            <strong>${item.name}</strong>
            <strong>${formatPrice(item.lineTotal)}</strong>
          </div>
          <p>${item.blurb}</p>
          <div class="cart-meta">
            <span>Qty: ${item.quantity}</span>
            <span>${formatPrice(item.price)} each</span>
          </div>
          <button type="button" data-remove="${item.id}">Remove one</button>
        </article>
      `
    )
    .join("");

  cartTotal.textContent = formatPrice(total);
  cartCount.textContent = String(getCartQuantity());
  updateCheckoutButtonState();
}

function openCart() {
  cartDrawer.classList.add("open");
  cartDrawer.setAttribute("aria-hidden", "false");
  backdrop.hidden = false;
}

function closeCart() {
  cartDrawer.classList.remove("open");
  cartDrawer.setAttribute("aria-hidden", "true");
  backdrop.hidden = true;
}

function getCheckoutDescription() {
  const quantity = getCartQuantity();
  return `${quantity} spare part${quantity === 1 ? "" : "s"} from NJB FITNESS`;
}

function getPrefillDetails() {
  const customer = getCustomerDetails();

  return {
    name: customer.name,
    email: customer.email,
    contact: customer.phone
  };
}

async function fetchCheckoutConfig() {
  try {
    const response = await fetch("/api/config", {
      headers: {
        Accept: "application/json"
      }
    });

    if (!response.ok) {
      throw new Error("Config request failed.");
    }

    const payload = await response.json();
    state.config = {
      ...state.config,
      ...payload
    };

    if (state.config.checkoutEnabled) {
      setCheckoutStatus("Checkout is ready. Add customer phone and address, then continue to payment.", "success");
    } else if (state.config.paymentLink) {
      setCheckoutStatus("Payment link is ready. Tap the button to pay on Razorpay.", "success");
    } else {
      setCheckoutStatus("Add your Razorpay API keys in .env to enable checkout.", "info");
    }
  } catch (error) {
    if (state.config.paymentLink) {
      setCheckoutStatus("Payment link is ready. Tap the button to pay on Razorpay.", "success");
    } else {
      setCheckoutStatus("Run this site through server.js to enable Razorpay checkout.", "warning");
    }
  }

  renderProducts();
  renderCart();
}

async function createOrder(customer) {
  const response = await fetch("/api/payment/order", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      cart: getCartPayload(),
      customer
    })
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(payload.error || "Unable to create Razorpay order.");
  }

  return payload;
}

async function verifyPayment(payment) {
  const response = await fetch("/api/payment/verify", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payment)
  });

  const payload = await response.json();

  if (!response.ok || !payload.verified) {
    throw new Error(payload.error || "Payment verification failed.");
  }

  return payload;
}

async function handleCheckout() {
  if (!state.cart.length) {
    setCheckoutStatus("Add at least one product to the cart before checkout.", "warning");
    return;
  }

  let customer;

  try {
    customer = validateCustomerDetails();
  } catch (error) {
    setCheckoutStatus(error.message, "warning");
    return;
  }

  if (!state.config.checkoutEnabled && state.config.paymentLink) {
    window.open(state.config.paymentLink, "_blank", "noopener,noreferrer");
    setCheckoutStatus("Opening Razorpay payment page...", "success");
    return;
  }

  if (!state.config.checkoutEnabled) {
    setCheckoutStatus("Checkout is disabled until Razorpay keys are configured on the server.", "warning");
    return;
  }

  if (typeof window.Razorpay !== "function") {
    setCheckoutStatus("Razorpay Checkout did not load. Refresh the page and try again.", "error");
    return;
  }

  state.isProcessing = true;
  updateCheckoutButtonState();
  setCheckoutStatus("Creating secure Razorpay order...", "info");

  try {
    const order = await createOrder(customer);
    const prefill = getPrefillDetails();
    let checkoutCompleted = false;

    const razorpay = new window.Razorpay({
      key: state.config.razorpayKeyId,
      amount: order.amount,
      currency: order.currency,
      name: state.config.businessName,
      description: getCheckoutDescription(),
      image: state.config.businessLogo || undefined,
      order_id: order.id,
      prefill,
      notes: {
        source: "NJB FITNESS storefront",
        customer_phone: customer.phone.slice(0, 255),
        customer_address: customer.address.slice(0, 255),
        items: getCartLines()
          .map((item) => `${item.name} x${item.quantity}`)
          .join(", ")
          .slice(0, 255)
      },
      theme: {
        color: "#ff7a18",
        backdrop_color: "#07111c"
      },
      modal: {
        confirm_close: true,
        ondismiss() {
          if (checkoutCompleted) {
            return;
          }

          state.isProcessing = false;
          updateCheckoutButtonState();
          setCheckoutStatus("Checkout was closed before payment completed.", "warning");
        }
      },
      handler: async (payment) => {
        checkoutCompleted = true;
        setCheckoutStatus("Payment received. Verifying signature...", "info");

        try {
          await verifyPayment(payment);
          state.cart = [];
          renderCart();
          closeCart();
          setCheckoutStatus("Payment successful. Order saved with customer details.", "success");
        } catch (error) {
          setCheckoutStatus(error.message, "error");
        } finally {
          state.isProcessing = false;
          updateCheckoutButtonState();
        }
      }
    });

    razorpay.on("payment.failed", (event) => {
      checkoutCompleted = true;
      state.isProcessing = false;
      updateCheckoutButtonState();

      const reason = event.error?.description || event.error?.reason || "Payment failed in Razorpay Checkout.";
      setCheckoutStatus(reason, "error");
    });

    razorpay.open();
  } catch (error) {
    state.isProcessing = false;
    updateCheckoutButtonState();
    setCheckoutStatus(error.message, "error");
  }
}

filters.addEventListener("click", (event) => {
  const button = event.target.closest("[data-filter]");

  if (!button) {
    return;
  }

  state.filter = button.dataset.filter;
  filters.querySelectorAll(".filter").forEach((filterButton) => {
    filterButton.classList.toggle("active", filterButton === button);
  });
  renderProducts();
});

productGrid.addEventListener("click", (event) => {
  const button = event.target.closest("[data-add]");

  if (!button) {
    return;
  }

  const productId = Number(button.dataset.add);
  const product = products.find((entry) => entry.id === productId);

  if (!product) {
    return;
  }

  state.cart.push(product);
  renderCart();
  openCart();
  setCheckoutStatus("Item added to cart. Add customer phone and address before payment.", "info");
});

cartItems.addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove]");

  if (!button) {
    return;
  }

  const productId = Number(button.dataset.remove);
  const cartIndex = state.cart.findIndex((item) => item.id === productId);

  if (cartIndex === -1) {
    return;
  }

  state.cart.splice(cartIndex, 1);
  renderCart();

  if (!state.cart.length) {
    setCheckoutStatus("Your cart is empty. Add a part to start checkout.", "info");
  }
});

cartToggle.addEventListener("click", openCart);
cartClose.addEventListener("click", closeCart);
backdrop.addEventListener("click", closeCart);
checkoutButton.addEventListener("click", handleCheckout);

const observer = new IntersectionObserver(
  (entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("visible");
      }
    });
  },
  {
    threshold: 0.18
  }
);

document.querySelectorAll(".reveal").forEach((element) => observer.observe(element));

renderProducts();
renderCart();
fetchCheckoutConfig();
