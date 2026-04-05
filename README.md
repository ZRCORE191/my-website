# NJB FITNESS Razorpay Setup

1. Install Node.js 18 or newer on the machine or hosting environment.
2. Copy `.env.example` to `.env`.
3. Add your Razorpay test or live keys to `.env`.
4. Start the site with `node server.js` or `npm start`.
5. Open `http://localhost:3000`.

## What this setup does

- Serves the storefront from the same server.
- Creates Razorpay orders on the server so cart totals are not trusted from the browser.
- Verifies the Razorpay payment signature before marking payment as successful.

## Important notes

- The checkout button stays disabled until `RAZORPAY_KEY_ID` and `RAZORPAY_KEY_SECRET` are present.
- Product prices are treated as major currency units and converted to subunits for Razorpay orders.
- The default currency is `INR`. Change `CURRENCY` in `.env` if your Razorpay account is configured for another supported currency.
