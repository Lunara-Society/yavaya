import { permanentRedirect } from 'next/navigation';

/** Impact became Causes, a section of Community. Old links still land somewhere true. */
export default function Page() {
  permanentRedirect('/community/about#causes');
}
