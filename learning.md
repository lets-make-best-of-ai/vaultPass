# VaultPass - Learning Log & Patterns

## Project Overview
EventWallet PWA — a closed-loop event payment system with visitor registration, wallet top-ups, vendor POS deductions, and ticket recovery. Built with Next.js + Supabase (PostgreSQL).

---

## Bugs Fixed & Root Cause Analysis

### Bug 1: Topup not working after search
**Symptom**: Searching for a wallet by phone in the Top-Up tab returns results, but clicking "Top-Up" always fails.

**Root Cause**: The `get_visitors_by_phone` SQL function only returned visitor columns (`id, full_name, phone, email, ...`) without any wallet data. The frontend code tried to access `v.wallets?.[0]?.id`, which was always `undefined`, causing `walletId = 'N/A'`. The `top_up_wallet` RPC then received an invalid UUID and returned `INVALID_WALLET`.

**Fix**: Updated `get_visitors_by_phone` to `LEFT JOIN public.wallets` and return `wallet_id`, `wallet_balance`, `wallet_status`. Updated cashier code to use `v.wallet_id` and `Number(v.wallet_balance)` directly from query results.

**Files changed**:
- `supabase/migrations/001_initial_schema.sql` — Added `LEFT JOIN public.wallets` to `get_visitors_by_phone`
- `src/modules/cashier/index.tsx` — `handleTopupLookup` and `selectVisitor` now use `v.wallet_id` / `v.wallet_balance`

---

### Bug 2: Registration creates visitor but no wallet/transaction
**Symptom**: New visitor registration succeeds (visitor record appears), but no wallet or transaction record is created.

**Root Cause**: The `wallets` table had Row-Level Security (RLS) enabled but **no INSERT policy**. The `register_visitor` function uses `SECURITY DEFINER` to run with elevated privileges, but Supabase's `SECURITY DEFINER` doesn't fully bypass RLS when the `postgres` role isn't a superuser. The `INSERT INTO public.wallets` inside the function silently failed, and since it's inside a PL/pgSQL `BEGIN...END` block without exception handling, the entire transaction was rolled back — but the function still returned `success: true` because the first `INSERT INTO public.visitors` had already succeeded before the wallet insert failed.

**Fix**: Disabled RLS on `public.wallets`, `public.transactions`, and `public.visitors` tables since all writes go through SECURITY DEFINER RPC functions that handle their own security logic. Also created default `auth.users` (cashier) and `public.vendors` records.

**Files changed**:
- `supabase/migrations/001_initial_schema.sql` — Added `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`, default cashier user, default vendor
- `src/modules/cashier/index.tsx` — Fixed `cashierId` from `'cashier-001'` to valid UUID

---

### Bug 3: Invalid UUID for cashier_id
**Symptom**: Top-up and ticket replacement fail with `invalid input syntax for type uuid`.

**Root Cause**: Hardcoded `cashierId = 'cashier-001'` which is not a valid UUID. The `top_up_wallet` and `replace_lost_ticket` SQL functions have `p_cashier_id UUID` parameters. PostgreSQL rejects non-UUID strings.

**Fix**: Changed `cashierId` to `'00000000-0000-0000-0000-000000000001'` (the default cashier user UUID created in the migration).

**Files changed**:
- `src/modules/cashier/index.tsx` — Line 270 and 330

---

### Bug 4: Inaccurate balance display after topup
**Symptom**: After a successful top-up, the displayed balance doesn't match the actual database balance.

**Root Cause**: `executeTopUp` calculated `newBal = activeTopupWallet.balance + topupAddAmount` using the local state, which could be stale (e.g., after search, balance was hardcoded to `0`). It should use the server-returned `data.new_balance`.

**Fix**: Changed to `const newBal = Number(data.new_balance) || activeTopupWallet.balance + topupAddAmount`.

**Files changed**:
- `src/modules/cashier/index.tsx` — `executeTopUp` callback

---

## Patterns & Skills for Similar Projects

### 1. Supabase RLS vs SECURITY DEFINER
**Pattern**: When using `SECURITY DEFINER` functions for writes, RLS on the target tables may not be bypassed in Supabase. Always verify by testing inserts directly.

**Rule of thumb**: If all writes go through RPC functions, disable RLS on those tables and rely on the functions for security. Only use RLS for read-only public APIs.

**Checklist**:
- [ ] After creating tables with RLS, test if `SECURITY DEFINER` functions can actually insert
- [ ] If not, either disable RLS or add permissive INSERT/UPDATE policies
- [ ] Ensure default admin/cashier users exist in `auth.users` if FK constraints reference it

### 2. Foreign Key Constraints in Function Bodies
**Pattern**: `transactions.cashier_id` references `auth.users(id)`. If the function passes a hardcoded string like `'cashier-001'`, it will violate the FK constraint.

**Rule of thumb**: Always use valid UUIDs for any column with FK constraints. Create default records in the migration.

### 3. Frontend-Backend Data Contract Mismatch
**Pattern**: When a SQL function changes its return type (e.g., adding columns), ensure the frontend accesses the new columns, not nested properties that don't exist.

**Rule of thumb**: Always verify the actual API response shape matches what the frontend expects. Use `console.log` or test with `curl` directly.

### 4. Amount Type Safety in Supabase RPC
**Pattern**: `p_amount NUMERIC(10,2)` parameters in SQL functions should receive numbers, not strings. While PostgreSQL may implicitly cast strings, it's safer to pass numbers.

**Rule of thumb**: Avoid `.toString()` on numeric values before passing to `supabase.rpc()`. Pass the number directly.

### 5. Printer/WebUSB UX
**Pattern**: `navigator.usb.requestDevice()` shows a device picker dialog. Users without a printer will see this dialog and may think the app is broken.

**Rule of thumb**: Wrap printer calls in try/catch and handle the `null` device gracefully. Consider showing a toast like "Receipt ready (print skipped)" instead of blocking the UI.

### 6. Migration File as Source of Truth
**Pattern**: The Supabase migration file should contain ALL database changes. When fixing bugs in production via `supabase_execute_sql`, also update the migration file so the fix is reproducible.

**Rule of thumb**: Every SQL change made directly on the database should be reflected in the migration file.

---

## Database Schema Reference

| Table | RLS | Notes |
|-------|-----|-------|
| `public.visitors` | Disabled | Writes via `register_visitor` RPC |
| `public.wallets` | Disabled | Writes via `register_visitor`, `top_up_wallet`, `replace_lost_ticket` |
| `public.transactions` | Disabled | Writes via `top_up_wallet`, `process_vendor_deduction`, `replace_lost_ticket`, `void_transaction` |
| `public.vendors` | Enabled | Read by authenticated users |

---

## Key RPC Functions

| Function | Purpose | Key Params |
|----------|---------|------------|
| `register_visitor` | Create visitor + wallet | `p_full_name, p_phone, p_email, p_payment_method, p_notes` |
| `top_up_wallet` | Add funds to wallet | `p_wallet_id, p_cashier_id, p_amount` |
| `process_vendor_deduction` | Spend from wallet | `p_wallet_id, p_vendor_id, p_amount` |
| `replace_lost_ticket` | Void old wallet, create new | `p_old_wallet_id, p_cashier_id` |
| `get_visitors_by_phone` | Lookup visitor + wallet | `p_phone` |
| `get_recent_transactions` | Last 20 transactions | None |
| `void_transaction` | Mark tx as VOIDED | `p_transaction_id` |

---

## Default Records
- **Cashier user**: `00000000-0000-0000-0000-000000000001` (email: `cashier@vaultpass.local`)
- **Default vendor**: `00000000-0000-0000-0000-000000000001` (name: `Default Vendor`, pin: `1234`)
