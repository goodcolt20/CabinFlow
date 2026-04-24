# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # Start Next.js dev server on localhost:3000
npm run build        # Production build
npm run lint         # ESLint
npm run db:generate  # Generate Drizzle migration files from schema changes
npm run db:migrate   # Apply migrations to SQLite database
npm run db:studio    # Open Drizzle Studio (visual DB browser)
```

The SQLite database lives at `data/cabinflow.db` (gitignored). Run `npm run db:migrate` on first setup.

## Architecture

**Stack:** Next.js 14 App Router + TypeScript, SQLite via Drizzle ORM, Tailwind CSS v4, shadcn/ui backed by `@base-ui/react` (not Radix).

**Important:** shadcn components here use `@base-ui/react` primitives. `DialogTrigger` uses a `render` prop instead of `asChild`, e.g.:
```tsx
<DialogTrigger render={<Button variant="outline" />}>Label</DialogTrigger>
```

### Data model (`src/db/schema.ts`)

- `products` — catalog of items (name, unit, category, optional default shelf life)
- `prep_batches` — one row per batch logged; tracks `quantityPrepped`, `quantityRemaining`, `expiryDate`, and `status` (`active`/`expired`/`depleted`). Multiple batches per product are intentional — each prep event is a separate batch with its own shelf life.
- `sales_records` — one row per product per day; `source` field (`manual`/`pos_import`/`pos_webhook`) enables future POS integration without schema changes
- `daily_summaries` — denormalized cache for analytics; updated at EOD

### Key behaviors

- **FIFO deduction:** When sales are recorded (`POST /api/sales`), `quantityRemaining` is decremented from the oldest active batch first, then the next, etc.
- **Expiry enforcement:** The dashboard `GET /api/dashboard` marks all active batches where `expiryDate <= today` as `expired` before returning data.
- **Batch independence:** Two preps of the same product on different days = two separate `prep_batches` rows. The Batches page groups them by product and sorts by expiry date.

### Pages

| Route | Purpose |
|---|---|
| `/prep` | Log prep batches via a queue (add multiple rows, submit all at once). Shows product cards with active batches below — each card lists prep date and remaining shelf life. Also hosts the "Add Product" dialog. |
| `/eod` | End-of-day sales entry via same queue pattern. EOD summary table (prepped / sold / left) renders below the form and refreshes on each submit. |
| `/analytics` | Expiring-soon list (≤3 days) + sell-through bar chart per product over a configurable date range. |
| `/` | Redirects to `/prep` |
| `/sales` | Redirects to `/eod` (legacy) |

### API routes (`src/app/api/`)

- `GET/POST/DELETE /api/products`
- `GET/POST/PATCH /api/batches` — PATCH marks expired batches
- `GET/POST /api/sales` — POST upserts by product+date+source
- `GET /api/dashboard` — aggregated view for a given date
- `GET /api/analytics` — date-range aggregates for prep/sales/waste
