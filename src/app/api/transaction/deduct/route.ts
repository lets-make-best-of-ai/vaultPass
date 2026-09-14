import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
const supabase = getSupabase();

// POST: Deduct from wallet via vendor

export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const { wallet_id, vendor_id, amount } = await request.json();

    const { data, error } = await supabase.rpc('process_vendor_deduction', {
      p_wallet_id: wallet_id,
      p_vendor_id: vendor_id,
      p_amount: amount.toString(),
    });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
