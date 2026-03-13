import type { TBAEvent, TBAMatch, TBATeam } from "../types/tba";

const TBA_BASE_URL = "https://www.thebluealliance.com/api/v3";

// TBA Read API key — users should set this in their .env file as VITE_TBA_API_KEY
const API_KEY = import.meta.env.VITE_TBA_API_KEY as string | undefined;

function headers(): HeadersInit {
  if (!API_KEY) {
    throw new Error(
      "TBA API key not set. Add VITE_TBA_API_KEY to your .env file."
    );
  }
  return { "X-TBA-Auth-Key": API_KEY };
}

async function tbaFetch<T>(path: string): Promise<T> {
  const res = await fetch(`${TBA_BASE_URL}${path}`, { headers: headers() });
  if (res.status === 404) {
    throw new Error("not_found");
  }
  if (!res.ok) {
    throw new Error(`TBA API error: ${res.status} ${res.statusText}`);
  }
  return res.json() as Promise<T>;
}

export async function fetchEvent(eventKey: string): Promise<TBAEvent> {
  return tbaFetch<TBAEvent>(`/event/${eventKey}`);
}

export async function fetchEventTeams(eventKey: string): Promise<TBATeam[]> {
  return tbaFetch<TBATeam[]>(`/event/${eventKey}/teams`);
}

export async function fetchEventMatches(eventKey: string): Promise<TBAMatch[]> {
  return tbaFetch<TBAMatch[]>(`/event/${eventKey}/matches`);
}
