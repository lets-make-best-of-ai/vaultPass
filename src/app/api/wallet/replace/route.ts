import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
const supabase = getSupabase();

// POST: Replace lost ticket

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const { old_wallet_id, cashier_id } = await request.json();

    const { data, error } = await supabase.rpc('replace_lost_ticket', {
      p_old_wallet_id: old_wallet_id,
      p_cashier_id: cashier_id,
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
