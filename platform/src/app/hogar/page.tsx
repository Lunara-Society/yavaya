import type { Metadata } from 'next';
import { BoardHome, boardTitle } from '@/ui/boards/pages';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return boardTitle('hogar');
}

export default function Page({ searchParams }: { searchParams: Promise<{ sub?: string; kind?: string; q?: string; page?: string; mine?: string; place?: string; alert?: string; saved?: string; error?: string }> }) {
  return <BoardHome district="hogar" searchParams={searchParams} />;
}
