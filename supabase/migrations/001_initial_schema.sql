-- ============================================================
-- CLOSED-LOOP EVENT PAYMENT & WALLET PWA
-- Database Schema Migration 001
-- Supabase (PostgreSQL 15)
-- ============================================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================
-- 1. VISITORS TABLE (Attendee Registration Data)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.visitors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    phone TEXT NOT NULL,
    email TEXT UNIQUE,
    payment_method TEXT DEFAULT 'CASH' CHECK (payment_method IN ('CASH', 'CARD')),
    notes TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 2. VENDORS TABLE
-- ============================================================
CREATE TABLE IF NOT EXISTS public.vendors (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name TEXT NOT NULL,
    pin_hash TEXT NOT NULL,
    commission_rate NUMERIC(5,2) DEFAULT 0.00 CHECK (commission_rate >= 0 AND commission_rate <= 100),
    is_active BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 3. WALLETS TABLE (Linked 1:1 with Visitors)
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallets (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    visitor_id UUID REFERENCES public.visitors(id) ON DELETE SET NULL,
    qr_code_hash TEXT UNIQUE NOT NULL,
    balance NUMERIC(10,2) NOT NULL DEFAULT 0.00 CHECK (balance >= 0),
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'REFUNDED', 'BLOCKED')),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- 4. TRANSACTIONS TABLE
-- ============================================================
CREATE TYPE transaction_type AS ENUM ('TOPUP', 'SPEND', 'REFUND', 'TICKET_REPLACEMENT');

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID NOT NULL REFERENCES public.wallets(id) ON DELETE RESTRICT,
    vendor_id UUID REFERENCES public.vendors(id) ON DELETE RESTRICT,
    cashier_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    amount NUMERIC(10,2) NOT NULL CHECK (amount > 0),
    type transaction_type NOT NULL,
    status TEXT DEFAULT 'ACTIVE' CHECK (status IN ('ACTIVE', 'VOIDED')),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- ============================================================
-- INDEXES
-- ============================================================
CREATE INDEX IF NOT EXISTS idx_visitors_phone ON public.visitors(phone);
CREATE INDEX IF NOT EXISTS idx_visitors_email ON public.visitors(email);
CREATE INDEX IF NOT EXISTS idx_wallets_visitor_id ON public.wallets(visitor_id);
CREATE INDEX IF NOT EXISTS idx_wallets_qr_hash ON public.wallets(qr_code_hash);
CREATE INDEX IF NOT EXISTS idx_transactions_wallet_id ON public.transactions(wallet_id);
CREATE INDEX IF NOT EXISTS idx_transactions_vendor_id ON public.transactions(vendor_id);
CREATE INDEX IF NOT EXISTS idx_transactions_created_at ON public.transactions(created_at);
CREATE INDEX IF NOT EXISTS idx_transactions_type ON public.transactions(type);
CREATE INDEX IF NOT EXISTS idx_transactions_status ON public.transactions(status);

-- ============================================================
-- UPDATED_AT TRIGGER FOR WALLETS
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_wallets_updated_at
    BEFORE UPDATE ON public.wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.handle_updated_at();

-- ============================================================
-- STORED PROCEDURE: process_vendor_deduction
-- Atomic deduction with explicit row-level locking (FOR UPDATE)
-- ============================================================
CREATE OR REPLACE FUNCTION public.process_vendor_deduction(
    p_wallet_id UUID,
    p_vendor_id UUID,
    p_amount NUMERIC(10,2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance NUMERIC(10,2);
    v_new_balance NUMERIC(10,2);
    v_wallet_status TEXT;
    v_vendor_active BOOLEAN;
    v_transaction_id UUID;
BEGIN
    -- Validate vendor exists and is active
    SELECT is_active INTO v_vendor_active
    FROM public.vendors
    WHERE id = p_vendor_id;

    IF NOT FOUND OR v_vendor_active IS NOT TRUE THEN
        RETURN jsonb_build_object('success', false, 'error', 'VENDOR_INACTIVE');
    END IF;

    -- Perform explicit row lock (FOR UPDATE) to prevent race conditions
    SELECT balance, status INTO v_current_balance, v_wallet_status
    FROM public.wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_WALLET');
    END IF;

    IF v_wallet_status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'WALLET_INACTIVE');
    END IF;

    IF v_current_balance < p_amount THEN
        RETURN jsonb_build_object(
            'success', false,
            'error', 'INSUFFICIENT_FUNDS',
            'current_balance', v_current_balance
        );
    END IF;

    -- Deduct balance atomically
    v_new_balance := v_current_balance - p_amount;

    UPDATE public.wallets
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = p_wallet_id;

    -- Record transaction line item
    INSERT INTO public.transactions (wallet_id, vendor_id, amount, type)
    VALUES (p_wallet_id, p_vendor_id, p_amount, 'SPEND')
    RETURNING id INTO v_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'new_balance', v_new_balance,
        'deducted_amount', p_amount
    );
END;
$$;

-- ============================================================
-- STORED PROCEDURE: replace_lost_ticket
-- Atomic lost ticket replacement with balance transfer
-- ============================================================
CREATE OR REPLACE FUNCTION public.replace_lost_ticket(
    p_old_wallet_id UUID,
    p_cashier_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_visitor_id UUID;
    v_old_balance NUMERIC(10,2);
    v_old_status TEXT;
    v_new_wallet_id UUID;
BEGIN
    -- Lock old wallet row
    SELECT visitor_id, balance, status INTO v_visitor_id, v_old_balance, v_old_status
    FROM public.wallets
    WHERE id = p_old_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'OLD_WALLET_NOT_FOUND');
    END IF;

    IF v_old_status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'OLD_WALLET_ALREADY_INACTIVE');
    END IF;

    -- 1. Void old wallet
    UPDATE public.wallets
    SET status = 'BLOCKED', balance = 0.00, updated_at = NOW()
    WHERE id = p_old_wallet_id;

    -- 2. Issue new wallet with carried-over balance
    INSERT INTO public.wallets (visitor_id, qr_code_hash, balance, status)
    VALUES (
        v_visitor_id,
        md5(random()::text || clock_timestamp()::text),
        v_old_balance,
        'ACTIVE'
    )
    RETURNING id INTO v_new_wallet_id;

    -- 3. Log replacement transaction
    INSERT INTO public.transactions (wallet_id, cashier_id, amount, type)
    VALUES (v_new_wallet_id, p_cashier_id, v_old_balance, 'TICKET_REPLACEMENT');

    RETURN jsonb_build_object(
        'success', true,
        'new_wallet_id', v_new_wallet_id,
        'transferred_balance', v_old_balance,
        'visitor_id', v_visitor_id
    );
END;
$$;

-- ============================================================
-- STORED PROCEDURE: register_visitor_and_create_wallet
-- Atomic visitor registration with wallet issuance
-- ============================================================
CREATE OR REPLACE FUNCTION public.register_visitor(
    p_full_name TEXT,
    p_phone TEXT,
    p_email TEXT,
    p_payment_method TEXT DEFAULT 'CASH',
    p_notes TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_visitor_id UUID;
    v_wallet_id UUID;
    v_qr_hash TEXT;
BEGIN
    -- Insert visitor (email no longer unique - allow duplicates)
    INSERT INTO public.visitors (full_name, phone, email, payment_method, notes)
    VALUES (p_full_name, p_phone, p_email, p_payment_method, p_notes)
    RETURNING id INTO v_visitor_id;

    -- Generate unique QR hash
    v_qr_hash := md5(gen_random_uuid()::text || clock_timestamp()::text);

    -- Create wallet linked to visitor
    INSERT INTO public.wallets (visitor_id, qr_code_hash, balance, status)
    VALUES (v_visitor_id, v_qr_hash, 0.00, 'ACTIVE')
    RETURNING id INTO v_wallet_id;

    RETURN jsonb_build_object(
        'success', true,
        'visitor_id', v_visitor_id,
        'wallet_id', v_wallet_id,
        'qr_code_hash', v_qr_hash
    );
END;
$$;

-- Remove email uniqueness constraint (allow duplicate emails)
ALTER TABLE public.visitors DROP CONSTRAINT IF EXISTS visitors_email_key;

-- ============================================================
-- STORED PROCEDURE: top_up_wallet
-- Atomic cash top-up for existing visitor wallet
-- ============================================================
CREATE OR REPLACE FUNCTION public.top_up_wallet(
    p_wallet_id UUID,
    p_cashier_id UUID,
    p_amount NUMERIC(10,2)
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_balance NUMERIC(10,2);
    v_new_balance NUMERIC(10,2);
    v_wallet_status TEXT;
    v_transaction_id UUID;
BEGIN
    -- Lock wallet row
    SELECT balance, status INTO v_current_balance, v_wallet_status
    FROM public.wallets
    WHERE id = p_wallet_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_WALLET');
    END IF;

    IF v_wallet_status != 'ACTIVE' THEN
        RETURN jsonb_build_object('success', false, 'error', 'WALLET_INACTIVE');
    END IF;

    IF p_amount <= 0 THEN
        RETURN jsonb_build_object('success', false, 'error', 'INVALID_AMOUNT');
    END IF;

    v_new_balance := v_current_balance + p_amount;

    UPDATE public.wallets
    SET balance = v_new_balance, updated_at = NOW()
    WHERE id = p_wallet_id;

    INSERT INTO public.transactions (wallet_id, cashier_id, amount, type)
    VALUES (p_wallet_id, p_cashier_id, p_amount, 'TOPUP')
    RETURNING id INTO v_transaction_id;

    RETURN jsonb_build_object(
        'success', true,
        'transaction_id', v_transaction_id,
        'new_balance', v_new_balance,
        'topup_amount', p_amount
    );
END;
$$;

-- ============================================================
-- STORED PROCEDURE: get_recent_transactions
-- Return last 20 transactions with visitor info
-- ============================================================
CREATE OR REPLACE FUNCTION public.get_recent_transactions()
RETURNS TABLE(
    id UUID,
    wallet_id UUID,
    amount NUMERIC(10,2),
    type TEXT,
    status TEXT,
    created_at TIMESTAMPTZ,
    visitor_name TEXT,
    visitor_phone TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        t.id,
        t.wallet_id,
        t.amount,
        t.type::text,
        t.status,
        t.created_at,
        v.full_name,
        v.phone
    FROM public.transactions t
    LEFT JOIN public.wallets w ON t.wallet_id = w.id
    LEFT JOIN public.visitors v ON w.visitor_id = v.id
    ORDER BY t.created_at DESC
    LIMIT 20;
END;
$$;

-- ============================================================
-- STORED PROCEDURE: void_transaction
-- Mark a transaction as VOIDED (QR blocked from withdrawal)
-- ============================================================
CREATE OR REPLACE FUNCTION public.void_transaction(
    p_transaction_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_current_status TEXT;
BEGIN
    SELECT status INTO v_current_status
    FROM public.transactions
    WHERE id = p_transaction_id;
    
    IF NOT FOUND THEN
        RETURN jsonb_build_object('success', false, 'error', 'TRANSACTION_NOT_FOUND');
    END IF;
    
    IF v_current_status = 'VOIDED' THEN
        RETURN jsonb_build_object('success', false, 'error', 'ALREADY_VOIDED');
    END IF;
    
    UPDATE public.transactions
    SET status = 'VOIDED'
    WHERE id = p_transaction_id;
    
    RETURN jsonb_build_object('success', true, 'transaction_id', p_transaction_id);
END;
$$;

-- ============================================================
-- GRANT EXECUTE ON FUNCTIONS TO authenticated/anonym roles
-- ============================================================
GRANT EXECUTE ON FUNCTION public.process_vendor_deduction TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_lost_ticket TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_visitor TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.register_visitor(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.top_up_wallet TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_recent_transactions TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.void_transaction TO anon, authenticated;

-- ============================================================
-- ROW-LEVEL SECURITY POLICIES
-- ============================================================

-- Visitors: Authenticated users can read their own visitor records
ALTER TABLE public.visitors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visitors read own profile"
    ON public.visitors FOR SELECT
    USING (auth.uid() = id);

-- Vendors: All authenticated users can read active vendors
ALTER TABLE public.vendors ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Authenticated users can view active vendors"
    ON public.vendors FOR SELECT
    USING (auth.role() = 'authenticated' AND is_active = true);

-- Vendors: Only authenticated users with proper permissions can insert/update
CREATE POLICY "Authenticated users can manage vendors"
    ON public.vendors FOR ALL
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Wallets: Users can read wallets linked to their visitor profile
ALTER TABLE public.wallets ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Visitors read own wallets"
    ON public.wallets FOR SELECT
    USING (
        visitor_id IN (SELECT id FROM public.visitors WHERE auth.uid() = visitors.id)
    );

-- Wallets: Authenticated service roles can update balances via RPCs
CREATE POLICY "Service role can update wallet balances"
    ON public.wallets FOR UPDATE
    USING (auth.role() = 'authenticated')
    WITH CHECK (auth.role() = 'authenticated');

-- Transactions: Users can read transactions for their own wallets
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users read own wallet transactions"
    ON public.transactions FOR SELECT
    USING (
        wallet_id IN (SELECT id FROM public.wallets WHERE visitor_id IN (SELECT id FROM public.visitors WHERE auth.uid() = visitors.id))
    );

-- ============================================================
-- ANALYTICS VIEWS FOR ADMIN DASHBOARD
-- ============================================================
CREATE OR REPLACE VIEW public.vendor_revenue_summary AS
SELECT
    v.id AS vendor_id,
    v.name AS vendor_name,
    v.commission_rate,
    COUNT(t.id) AS total_transactions,
    SUM(t.amount) AS gross_revenue,
    SUM(t.amount * v.commission_rate / 100) AS commission_amount
FROM public.vendors v
LEFT JOIN public.transactions t ON t.vendor_id = v.id
WHERE t.type = 'SPEND'
GROUP BY v.id, v.name, v.commission_rate;

CREATE OR REPLACE VIEW public.daily_settlement AS
SELECT
    DATE(t.created_at) AS settlement_date,
    v.id AS vendor_id,
    v.name AS vendor_name,
    v.commission_rate,
    COUNT(t.id) AS total_transactions,
    SUM(t.amount) AS gross_revenue,
    SUM(t.amount * v.commission_rate / 100) AS commission_amount,
    SUM(t.amount - (t.amount * v.commission_rate / 100)) AS net_to_vendor,
    MIN(t.created_at) AS first_transaction,
    MAX(t.created_at) AS last_transaction
FROM public.vendors v
LEFT JOIN public.transactions t ON t.vendor_id = v.id AND t.type = 'SPEND'
GROUP BY DATE(t.created_at), v.id, v.name, v.commission_rate
ORDER BY settlement_date DESC;

ALTER VIEW public.vendor_revenue_summary OWNER TO postgres;
ALTER VIEW public.daily_settlement OWNER TO postgres;

GRANT SELECT ON public.vendor_revenue_summary TO authenticated;
GRANT SELECT ON public.daily_settlement TO authenticated;

-- ============================================================
-- AUDIT TRIGGER: Log wallet status changes
-- ============================================================
CREATE TABLE IF NOT EXISTS public.wallet_audit_log (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    wallet_id UUID REFERENCES public.wallets(id) ON DELETE SET NULL,
    action TEXT NOT NULL,
    old_balance NUMERIC(10,2),
    new_balance NUMERIC(10,2),
    old_status TEXT,
    new_status TEXT,
    performed_by UUID REFERENCES auth.users(id),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE OR REPLACE FUNCTION public.audit_wallet_change()
RETURNS TRIGGER AS $$
BEGIN
    IF OLD.balance != NEW.balance OR OLD.status != NEW.status THEN
        INSERT INTO public.wallet_audit_log (wallet_id, action, old_balance, new_balance, old_status, new_status, performed_by)
        VALUES (NEW.id, 'BALANCE_OR_STATUS_CHANGE', OLD.balance, NEW.balance, OLD.status, NEW.status, auth.uid());
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trigger_wallet_audit
    AFTER UPDATE ON public.wallets
    FOR EACH ROW
    EXECUTE FUNCTION public.audit_wallet_change();
