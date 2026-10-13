# complaints — CLI for The Complaints Department

Files complaints and buys subscriptions from the command line. **Sandbox only**: the service accepts
only [Stripe test card numbers](https://docs.stripe.com/testing), and the CLI refuses to send anything else.

## Install

Requires Node.js 18.3+.

```bash
cd cli
npm install --registry https://registry.npmjs.org
npm run build
npm link            # puts `complaints` on your PATH (or run: node dist/index.js ...)
```

## Set up your API key

You need an API key (each key is good for 50 filings/subscriptions; the site owner mints them).

```bash
complaints config set-key cmp_xxxxxxxx      # saved to ~/.config/complaints/config.json (mode 0600)
# or: export COMPLAINTS_API_KEY=cmp_xxxxxxxx
```

## Usage

```bash
# File a complaint, paying the $5 fee with a test card; wait for the response
complaints complain --content "It is too hot in here" --email someone@example.com \
    --test-cc 4242424242424242 --dept internecine-strife

# Subscribe (registered = 3 complaints/period, pro = unlimited)
complaints subscribe --registered --email someone@example.com --test-cc 4242424242424242
complaints subscribe --pro --email pro@example.com --test-cc 4242424242424242

# With an active subscription, no card is needed until the allowance runs out
complaints complain --content "The thermostat remains unaddressed" --email pro@example.com

complaints status pro@example.com      # tier + allowance used
complaints case 123                    # look up a complaint and its response
complaints departments                 # departments accepting complaints
```

Other options: `--json` (machine-readable), `--api-url <url>` / `COMPLAINTS_API_URL`,
`--exp MM/YYYY` and `--cvc` for the test card (defaults 12/2034, 123). `--user` is an alias for `--email`.

Try Stripe's special test cards too: `4000000000000002` (declined), `4000000000009995` (insufficient funds),
`4000000000000259` (fraudulent dispute later). 3D-Secure cards that demand authentication are reported
as unsupported.

Exit codes: `0` success, `1` error (message on stderr), `2` filed but response not yet generated.
