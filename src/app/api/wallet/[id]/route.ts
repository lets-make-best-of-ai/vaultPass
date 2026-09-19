import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
const supabase = getSupabase();

export const dynamic = 'force-dynamic';

export async function GET(
  request: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const { id } = params;
    if (!id) {
      return NextResponse.json({ error: 'Wallet ID is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('wallets')
      .select('*')
      .eq('qr_code_hash', id)
      .single();
    if (error || !data) {
      return NextResponse.json({ error: 'Wallet not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
