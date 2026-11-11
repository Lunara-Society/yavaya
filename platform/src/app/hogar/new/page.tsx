import type { Metadata } from 'next';
import { BoardNew } from '@/ui/boards/pages';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { robots: { index: false } };

export default function Page({ searchParams }: { searchParams: Promise<{ error?: string; sub?: string }> }) {
  return <BoardNew district="hogar" searchParams={searchParams} />;
}
