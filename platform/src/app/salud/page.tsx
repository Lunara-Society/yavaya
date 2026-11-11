import type { Metadata } from 'next';
import { BoardHome, boardTitle } from '@/ui/boards/pages';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return boardTitle('salud');
}

export default function Page({ searchParams }: { searchParams: Promise<{ sub?: string; kind?: string; q?: string; page?: string; mine?: string; place?: string }> }) {
  return <BoardHome district="salud" searchParams={searchParams} />;
}
