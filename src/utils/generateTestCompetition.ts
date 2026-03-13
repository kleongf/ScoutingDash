import type { TBAEvent, TBATeam, TBAMatch } from "../types/tba";

// ── Real FRC team names for plausible-looking test data ──────────────────────
const TEAM_NICKNAMES = [
  "Cheesy Poofs", "Citrus Circuits", "Robonauts", "The Compass Alliance",
  "Wildstang", "Simbotics", "Frog Force", "Spyder Robotics", "Swampdogs",
  "Bomb Squad", "Iron Panthers", "RoboRavens", "Circuit Breakers", "Hypnotiqs",
  "R.O.B.O.T.S.", "Lightning Robotics", "Techno Titans", "Robo Raiders",
  "Polar Robotics", "Mechanical Mustangs", "Cybergnomes", "Stealth Robotics",
  "Overclocked", "Metal Moose", "The Krawler", "Overdrive", "Quantum Leap",
  "Fusion", "Voltage", "Altitude", "Trajectory", "Apex", "Vortex",
  "The Pack", "Neon Knights", "Thunder Robots", "Arctos Robotics", "Gearheads",
  "Rocket Fuel", "Spark Plugs", "Servo Squad", "Binary Bots", "Null Pointer",
  "Stack Overflow", "Kernel Panic", "Blue Shift", "Red Zone", "Iron Forge",
  "Steel City Robotics", "Silicon Valley Robotics",
];

const CITIES = [
  ["San Diego", "CA"], ["Houston", "TX"], ["Detroit", "MI"],
  ["Atlanta", "GA"], ["Chicago", "IL"], ["Portland", "OR"],
  ["Seattle", "WA"], ["Boston", "MA"], ["Denver", "CO"],
  ["Phoenix", "AZ"], ["Minneapolis", "MN"], ["Nashville", "TN"],
];

/** Fast seedable PRNG (mulberry32) */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randInt(rand: () => number, lo: number, hi: number): number {
  return Math.floor(rand() * (hi - lo + 1)) + lo;
}

export interface TestCompetitionOptions {
  /** Number of teams to generate (default: 24) */
  teamCount?: number;
  /** Number of qual matches to pre-generate (default: 0 — add via debug panel) */
  matchCount?: number;
  /** Seed for reproducible generation (default: Date.now()) */
  seed?: number;
}

export interface TestCompetition {
  eventKey: string;
  event: TBAEvent;
  teams: TBATeam[];
  /** Pre-generated qual matches with no scores yet (score: -1) */
  matches: TBAMatch[];
}

/**
 * Generates a fully synthetic FRC competition with random teams and an
 * optional set of unplayed qualification matches (all scores set to -1).
 *
 * The event key is always "test_<seed>" so it won't collide with real TBA keys.
 */
export function generateTestCompetition(
  opts: TestCompetitionOptions = {}
): TestCompetition {
  const seed = opts.seed ?? Date.now();
  const teamCount = Math.max(6, opts.teamCount ?? 24);
  const matchCount = opts.matchCount ?? 0;
  const rand = mulberry32(seed);

  const eventKey = `test_${seed}`;

  const event: TBAEvent = {
    key: eventKey,
    name: "Test Competition",
    short_name: "TEST",
    event_type: 0,
    city: "Simulated City",
    state_prov: "CA",
    country: "USA",
    start_date: new Date().toISOString().slice(0, 10),
    end_date: new Date().toISOString().slice(0, 10),
    year: new Date().getFullYear(),
  };

  // ── Teams ──────────────────────────────────────────────────────────────────
  // Pick teamCount unique team numbers from the 4000-9999 range
  const usedNums = new Set<number>();
  const teams: TBATeam[] = [];

  for (let i = 0; i < teamCount; i++) {
    let num: number;
    do {
      num = randInt(rand, 4000, 9999);
    } while (usedNums.has(num));
    usedNums.add(num);

    const nickname =
      TEAM_NICKNAMES[i % TEAM_NICKNAMES.length] + (i >= TEAM_NICKNAMES.length ? ` ${Math.floor(i / TEAM_NICKNAMES.length) + 1}` : "");
    const [city, state] = CITIES[randInt(rand, 0, CITIES.length - 1)];

    teams.push({
      key: `frc${num}`,
      team_number: num,
      nickname,
      name: nickname,
      city,
      state_prov: state,
      country: "USA",
      rookie_year: randInt(rand, 2010, 2024),
    });
  }

  // Sort teams by team number for consistency
  teams.sort((a, b) => a.team_number - b.team_number);

  // ── Matches ────────────────────────────────────────────────────────────────
  const matches = generateQualSchedule(eventKey, teams, matchCount, rand);

  return { eventKey, event, teams, matches };
}

/**
 * Generates `count` round-robin-style qual matches from the given team list.
 * All scores are set to -1 (unplayed). Exported so the debug panel can call
 * it incrementally to add one match at a time.
 */
export function generateQualSchedule(
  eventKey: string,
  teams: TBATeam[],
  count: number,
  rand: () => number = Math.random
): TBAMatch[] {
  const teamKeys = teams.map((t) => t.key);
  const matches: TBAMatch[] = [];

  for (let i = 1; i <= count; i++) {
    // Shuffle team keys and pick 6
    const shuffled = [...teamKeys].sort(() => rand() - 0.5);
    const red = shuffled.slice(0, 3);
    const blue = shuffled.slice(3, 6);

    matches.push({
      key: `${eventKey}_qm${i}`,
      comp_level: "qm",
      match_number: i,
      set_number: 1,
      event_key: eventKey,
      time: null,
      actual_time: null,
      alliances: {
        red: { score: -1, team_keys: red, surrogate_team_keys: [], dq_team_keys: [] },
        blue: { score: -1, team_keys: blue, surrogate_team_keys: [], dq_team_keys: [] },
      },
    });
  }

  return matches;
}

/**
 * Generates a single new qual match for the given team list, assigned the
 * next match number after `existingMatchCount`.
 */
export function generateOneQualMatch(
  eventKey: string,
  teams: TBATeam[],
  nextMatchNumber: number
): TBAMatch {
  const teamKeys = teams.map((t) => t.key);
  const shuffled = [...teamKeys].sort(() => Math.random() - 0.5);
  const red = shuffled.slice(0, 3);
  const blue = shuffled.slice(3, 6);

  return {
    key: `${eventKey}_qm${nextMatchNumber}`,
    comp_level: "qm",
    match_number: nextMatchNumber,
    set_number: 1,
    event_key: eventKey,
    time: null,
    actual_time: null,
    alliances: {
      red: { score: -1, team_keys: red, surrogate_team_keys: [], dq_team_keys: [] },
      blue: { score: -1, team_keys: blue, surrogate_team_keys: [], dq_team_keys: [] },
    },
  };
}
