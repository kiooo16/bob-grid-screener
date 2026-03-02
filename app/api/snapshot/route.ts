import { NextResponse } from 'next/server';
import { loadSnapshotBundle } from '@/lib/snapshot';

export async function GET() {
  const payload = await loadSnapshotBundle();
  return NextResponse.json(payload);
}
