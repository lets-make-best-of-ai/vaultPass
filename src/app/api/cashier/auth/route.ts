import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
const supabase = getSupabase();

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  try {
    const { login_code } = await request.json();

    if (!login_code || typeof login_code !== 'string') {
      return NextResponse.json({ error: 'login_code is required' }, { status: 400 });
    }

    const { data, error } = await supabase.rpc('authenticate_cashier', {
      p_login_code: login_code.trim(),
    });

    if (error) {
      return NextResponse.json({ error: 'Invalid login code', details: error.message }, { status: 401 });
    }

    const rows = Array.isArray(data) ? data : [data].filter(Boolean);
    if (rows.length === 0) {
      return NextResponse.json({ error: 'Invalid login code' }, { status: 401 });
    }

    const cashier = rows[0];
    if (!cashier.is_active) {
      return NextResponse.json({ error: 'Cashier is not active' }, { status: 403 });
    }

    return NextResponse.json({ success: true, cashier });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
