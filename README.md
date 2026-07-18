# Inventory_dash

**LaxRee Inventory Management System** — a multi-role luxury hotel inventory management dashboard built with Next.js 16, TypeScript, Prisma, and the LaxRee brand theme (Deep Navy + Gold).

## Tech Stack

- **Framework**: Next.js 16 (App Router) + TypeScript 5
- **Runtime**: Bun
- **Database**: Prisma ORM + SQLite
- **Styling**: Tailwind CSS 4 + shadcn/ui (New York)
- **Icons**: Lucide React
- **Auth**: Cookie-based session (httpOnly)

## Features

- 7 role-based dashboards: Admin, Owner, Sales, Account, Coordinator, Support, IT Manager
- Master inventory management with category / item / model hierarchy
- Challan (delivery note) workflow with auto-analysis engine
- Purchase Request (PR) workflow
- Multi-stage workflow state machine (Uploaded -> Payment Verified -> Dispatched -> Delivered -> Closed)
- Cascading dropdown filters across all dashboards
- Stock hold / reservation on challan creation

## Getting Started

```bash
# Install dependencies
bun install

# Push the database schema
bun run db:push

# Seed initial data (users + master inventory)
bun run db:seed

# Start the dev server
bun run dev
```

The app runs on `http://localhost:3000`.

## Project Structure

```
prisma/          # Schema + seed
src/app/         # Next.js App Router (routes + API)
src/components/  # UI + LaxRee dashboard components
src/lib/         # DB client + utilities
public/          # Static assets (LaxRee logo)
```
