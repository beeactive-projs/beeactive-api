export type MeetingProvider = 'ZOOM' | 'GOOGLE_MEET' | 'TEAMS';

export function detectMeetingProvider(url: string): MeetingProvider | null {
  try {
    const host = new URL(url).hostname.toLowerCase();
    if (
      host.endsWith('.zoom.us') ||
      host.endsWith('.zoom.com') ||
      host === 'zoom.us'
    )
      return 'ZOOM';
    if (host === 'meet.google.com') return 'GOOGLE_MEET';
    if (host === 'teams.microsoft.com' || host === 'teams.live.com')
      return 'TEAMS';
    return null;
  } catch {
    return null;
  }
}
