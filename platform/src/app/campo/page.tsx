import type { Metadata } from 'next';
import { BoardHome, boardTitle } from '@/ui/boards/pages';

export const dynamic = 'force-dynamic';

export async function generateMetadata(): Promise<Metadata> {
  return boardTitle('campo');
}

export default function Page({ searchParams }: { searchParams: Promise<{ sub?: string; kind?: string; q?: string; page?: string; mine?: string }> }) {
  return <BoardHome district="campo" searchParams={searchParams} />;
}
