import { NextResponse } from 'next/server';
import { getSupabase } from '@/lib/supabase';

const supabase = getSupabase();

export const dynamic = 'force-dynamic';

export async function GET() {
  return NextResponse.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: 'connected',
  });
}
