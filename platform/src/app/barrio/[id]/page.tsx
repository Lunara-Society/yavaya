import { BoardPost } from '@/ui/boards/pages';

export const dynamic = 'force-dynamic';

export default function Page({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ error?: string; reported?: string }> }) {
  return <BoardPost district="barrio" params={params} searchParams={searchParams} />;
}
