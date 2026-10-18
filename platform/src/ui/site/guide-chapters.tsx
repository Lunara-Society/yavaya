'use client';

/**
 * Chapter list for the full guide: a tap jumps the player to that district.
 * Plain buttons; without JavaScript the player still works, the jump does not.
 */
export function GuideChapters({ videoId, chapters }: { videoId: string; chapters: { label: string; at: number; time: string }[] }) {
  function jump(at: number) {
    const video = document.getElementById(videoId) as HTMLVideoElement | null;
    if (!video) return;
    video.currentTime = at;
    void video.play().catch(() => {});
    video.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }
  return (
    <ol className="gv-chapters">
      {chapters.map((c) => (
        <li key={c.at}>
          <button type="button" onClick={() => jump(c.at)}>
            <span className="gv-time">{c.time}</span>
            <span>{c.label}</span>
          </button>
        </li>
      ))}
    </ol>
  );
}
