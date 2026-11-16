# ARC+ Procurement & Finance

Budget Requests, Purchase Orders and Liquidations for ARC Design & Construction Services.
Same stack as ARC+ Payroll / Inventory: Node + Express, Railway Postgres, one static single-page front end.

## Run locally

```
npm install
npm start        # http://localhost:3000
```

With no `DATABASE_URL` the app keeps its data in the browser (localStorage). Sign-in is off unless the variables below are set.

## What it does

- **Budget Request** `ARC+2026-057-01` (year, project code, sequence): items, total, submit, approve / reject with an APPROVED stamp.
- **Purchase Order** `ARC-2026-057_001`: from an approved BR, supplier + bank details, RELEASED stamp.
- **Liquidation** `LQ#1`: budget from the BR, rows of date / description / amount, TOTAL and DEFICIT (spent minus budget; negative = money to return).
- Print to A4 / "Save as PDF" (Preview / PDF button) and Excel export per document, laid out like the paper forms and the Liquidation sheet (TOTAL / DEFICIT are real formulas).
- Suppliers (with bank details), Projects (the code goes into the numbers), Activity log, Settings, JSON backup, search + 10-row pages.
- Automation: approving a BR creates the PO and Liquidation drafts; bell alerts for items waiting for approval or release, overdue liquidations and over-budget liquidations; optional auto-email; optional "Fill from photo".

## Railway variables

| Variable | Needed for |
| --- | --- |
| `DATABASE_URL` | Reference the Postgres service. Creates its own table `procurement_state`. |
| `SSO_SECRET` | Same value as the Gateway / Payroll / Inventory (sign-in through the Gateway, Request access). |
| `GATEWAY_URL` | `https://gateway.arcdesignconstructions.com` |
| `APP_USER`, `APP_PASSWORD` | Optional local username / password sign-in. |
| `ANTHROPIC_API_KEY` | Optional: "Fill from photo" on the editors (reads a photo or PDF of a paper form). `SCAN_MODEL` overrides the model. |
| `SMTP_HOST`, `SMTP_PORT`, `SMTP_USER`, `SMTP_PASS`, `MAIL_FROM` | Optional: Email button and automatic emails (Gmail: `smtp.gmail.com`, 587, an app password). |

`/api/health` is the health check. Without the optional variables the matching buttons are hidden.

## Deploy checklist

1. Create a GitHub repo for this folder and push it (this folder has its own git repo, nothing is pushed yet).
2. Railway: new service from that repo, add the variables above, custom domain e.g. `procurement.arcdesignconstructions.com`.
3. Gateway: add a tile to `Gateway/tools.js` (id `procurement`, url above) and push the Gateway.
4. Settings page: set the approver name / title that appears on the stamps.

`sso.js` and `access-notify.js` are copies of the Inventory master (only the sign-in slides list gained `procurement`).
