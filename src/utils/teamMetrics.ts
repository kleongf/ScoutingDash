/**
 * Team metrics derived from pit scouting and match scouting data.
 *
 * When no pit scouting data is available for a team the numeric fields
 * default to 0 and the boolean capability fields default to false, so the
 * OPR table shows neutral/empty values instead of misleading random numbers.
 */

import type { PitScoutingData } from "../services/firestore";

export interface TeamMetrics {
  teamNumber: number;
  avgBallsTransferred: number;
  avgBallsScored: number;
  canL1: boolean;
  canL2: boolean;
  canL3: boolean;
  climbSuccessRate: number;  // 0–1
  defenseRate: number;       // 0–1
  brickedRate: number;       // 0–1
  avgDriverRating: number;   // 1–10
}

const EMPTY_METRICS: Omit<TeamMetrics, "teamNumber"> = {
  avgBallsTransferred: 0,
  avgBallsScored: 0,
  canL1: false,
  canL2: false,
  canL3: false,
  climbSuccessRate: 0,
  defenseRate: 0,
  brickedRate: 0,
  avgDriverRating: 0,
};

/**
 * Builds a TeamMetrics map from real pit scouting data.
 * Teams with no pit scouting entry get all-zero / all-false values.
 *
 * @param teamNumbers  Full list of team numbers in the competition.
 * @param pitData      Map of teamNumber → PitScoutingData loaded from Firestore.
 *                     Pass an empty Map (the default) for events with no pit scouting.
 */
export function generateTeamMetrics(
  teamNumbers: number[],
  pitData: Map<number, PitScoutingData> = new Map()
): Map<number, TeamMetrics> {
  const map = new Map<number, TeamMetrics>();

  for (const num of teamNumbers) {
    const pit = pitData.get(num);

    if (!pit) {
      // No pit scouting recorded yet — use neutral zeroed values
      map.set(num, { teamNumber: num, ...EMPTY_METRICS });
      continue;
    }

    map.set(num, {
      teamNumber: num,
      // Pit scouting doesn't track ball averages — those come from match scouting
      avgBallsTransferred: 0,
      avgBallsScored: 0,
      canL1: pit.climbL1.capable,
      canL2: pit.climbL2.capable,
      canL3: pit.climbL3.capable,
      // These rates come from match scouting; zero until that data is wired up
      climbSuccessRate: 0,
      defenseRate: 0,
      brickedRate: 0,
      avgDriverRating: 0,
    });
  }

  return map;
}

/** Mulberry32 — a fast, seedable 32-bit PRNG (used for placeholder match data points). */
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export interface MatchDataPoint {
  matchNumber: number;
  ballsScored: number;
  ballsTransferred: number;
  climbSuccess: boolean;
  playedDefense: boolean;
  bricked: boolean;
}

/**
 * Generates stable per-match data points for a team (placeholder until real
 * scouting data is available from Firestore).
 */
export function generateMatchDataPoints(
  teamNumber: number,
  matchNumbers: number[]
): MatchDataPoint[] {
  return matchNumbers.map((matchNumber) => {
    // Seed incorporates both team and match so each cell is independently random
    // but deterministic.
    const rand = mulberry32((teamNumber * 2654435761 + matchNumber * 40503) >>> 0);
    return {
      matchNumber,
      ballsScored: Math.round(rand() * 120) / 10,
      ballsTransferred: Math.round(rand() * 150) / 10,
      // ~65 % climb success, ~30 % defense, ~15 % brick
      climbSuccess: rand() < 0.65,
      playedDefense: rand() < 0.30,
      bricked: rand() < 0.15,
    };
  });
}
