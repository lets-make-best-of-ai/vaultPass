import { NextRequest, NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';
const supabase = getSupabase();


export const dynamic = 'force-dynamic';
export async function POST(request: NextRequest) {
  try {
    const { phone } = await request.json();

    const { data, error } = await supabase
      .from('visitors')
      .select('*, wallets(*)')
      .eq('phone', phone)
      .single();

    if (error) {
      return NextResponse.json({ error: 'Visitor not found' }, { status: 404 });
    }
    return NextResponse.json(data);
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
