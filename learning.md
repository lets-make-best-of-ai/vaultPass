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

### Bug 5: Registration doesn't create transaction or credit initial deposit
**Symptom**: New visitor registration appears to succeed but doesn't show in History tab. Wallet balance is $0.00 even when user selected initial deposit (e.g., $50).

**Root Cause**: The `register_visitor` SQL function created a visitor and wallet but didn't:
1. Accept an initial deposit amount parameter
2. Set the wallet balance to the deposit amount (hardcoded to `0.00`)
3. Create a `TOPUP` transaction for the initial deposit

The `handleRegistrationSubmit` also didn't pass `regDepositAmount` to the function. So the wallet always started at $0.00 and no transaction was recorded.

**Fix**: Added `p_initial_amount NUMERIC(10,2) DEFAULT 0.00` parameter to `register_visitor`. Wallet now gets `p_initial_amount` as balance. A `TOPUP` transaction is created when `p_initial_amount > 0`. Frontend passes `regDepositAmount` to `registerVisitor`.

**Files changed**:
- `supabase/migrations/001_initial_schema.sql` — Added `p_initial_amount` param, credit wallet, create TOPUP transaction
- `src/lib/db.ts` — Added `amount` parameter to `registerVisitor`
- `src/modules/cashier/index.tsx` — Pass `regDepositAmount`, auto-load transactions on history tab

### Bug 6: No vendor login code system, no home screen, no history
**Symptom**: Vendor POS had no login mechanism (just raw UUID input), no dashboard showing total sales, no history tab.

**Root Cause**: The vendor module was built with only a basic QR scan + deduct form. The `vendors` table had no `login_code` column, no authentication SQL function, no API endpoint for vendor login, and the component lacked any dashboard or history UI. The `process_vendor_deduction` function didn't verify PIN.

**Fix**: 
- Added `login_code TEXT UNIQUE` column to `vendors` table
- Created `authenticate_vendor(p_login_code)` SQL function
- Created `get_vendor_sales` and `get_vendor_transactions` SQL functions
- Added `/api/vendor/auth` API route
- Rewrote `src/modules/vendor/index.tsx` with Login → POS Home (total sales, scan, quick deduct) → History screens
- Added `.input-field` CSS styles for consistent form inputs

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

### 6. Vendor Authentication via Login Code
**Pattern**: For event-based vendor access, use a unique login code shared per event rather than UUID+PIN. Store as `login_code TEXT UNIQUE` on the vendors table.

**Rule of thumb**: 
- Create `authenticate_vendor(login_code)` SQL function that returns vendor id/name on success
- Create a `/api/vendor/auth` endpoint for client-side authentication
- The vendor UUID is then looked up server-side and used for all subsequent operations
- Don't store PINs with weak md5; use `crypt()` with bcrypt

### 7. Cashier Authentication via Login Code
**Pattern**: Same as vendor — a separate `cashier_credentials` table with `login_code TEXT UNIQUE`, validated by `authenticate_cashier(p_login_code)` SQL function.

**Rule of thumb**:
- Create a `cashier_credentials` table (NOT in `auth.users` — it's a separate credential store)
- Create `authenticate_cashier(login_code)` function returning `{id, name, is_active, login_code}`
- Create `/api/cashier/auth` endpoint
- Default login code: `CASH123`
- The cashier `id` is used as `cashier_id` in `top_up_wallet`, `replace_lost_ticket`, etc.

### 8. Multi-Agent Development Pattern
**Pattern**: When building complex features with multiple components (DB, frontend, testing), use parallel task agents:
1. Architect review agent → analyzes current state, identifies gaps
2. Builder agent → implements all code and DB changes
3. Tester agent → verifies everything end-to-end

**Rule of thumb**: Launch all three agents in parallel. The builder needs the architecture review context but doesn't need to wait for it. The tester can start DB verification while the builder is writing code.

### 8. Migration File as Source of Truth
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
| `register_visitor` | Create visitor + wallet | `p_full_name, p_phone, p_email, p_payment_method, p_notes, p_initial_amount` |
| `top_up_wallet` | Add funds to wallet | `p_wallet_id, p_cashier_id, p_amount` |
| `process_vendor_deduction` | Spend from wallet | `p_wallet_id, p_vendor_id, p_amount` |
| `replace_lost_ticket` | Void old wallet, create new | `p_old_wallet_id, p_cashier_id` |
| `get_visitors_by_phone` | Lookup visitor + wallet | `p_phone` |
| `get_recent_transactions` | Last 20 transactions | None |
| `void_transaction` | Mark tx as VOIDED | `p_transaction_id` |
| `authenticate_vendor` | Validate vendor login code | `p_login_code` |
| `get_vendor_sales` | Get vendor total sales | `p_vendor_id, p_start_date, p_end_date` |
| `get_vendor_transactions` | Get vendor transaction history | `p_vendor_id, p_limit` |

---

## Default Records
- **Cashier user**: `00000000-0000-0000-0000-000000000001` (email: `cashier@vaultpass.local`)
- **Default vendor**: `00000000-0000-0000-0000-000000000001` (name: `Default Vendor`, pin: `1234`)
