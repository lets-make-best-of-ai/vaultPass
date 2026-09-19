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

    const { data, error } = await supabase.rpc('authenticate_vendor', {
      p_login_code: login_code.trim(),
    });

    if (error) {
      return NextResponse.json({ error: 'Invalid login code', details: error.message }, { status: 401 });
    }

    if (!data || data.length === 0) {
      return NextResponse.json({ error: 'Invalid login code' }, { status: 401 });
    }

    const vendor = data[0];
    if (!vendor.is_active) {
      return NextResponse.json({ error: 'Vendor is not active' }, { status: 403 });
    }

    return NextResponse.json({ success: true, vendor });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
