import type { ScoutingRecord } from "../types/scoutingData";
import type { TBAMatch } from "../types/tba";

/** Inclusive integer random in [lo, hi] */
function randInt(lo: number, hi: number): number {
  return Math.floor(Math.random() * (hi - lo + 1)) + lo;
}

function randBool(trueProbability = 0.5): boolean {
  return Math.random() < trueProbability;
}

/** Auto path IDs used by the scouting app – just a small set for plausibility */
const AUTO_PATH_IDS = [1, 2, 3, 4, 5];

function randomPaths(): number[] {
  const count = randInt(0, 3);
  const shuffled = [...AUTO_PATH_IDS].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, count);
}

/**
 * Generates a random (but structurally valid) ScoutingRecord for one of the
 * robots in a given TBAMatch. The match must be a qualification match.
 *
 * Pass an optional `targetTeam` (e.g. "frc254") to pin the team; otherwise a
 * random robot is chosen from the match.
 */
export function randomScoutingRecord(
  match: TBAMatch,
  targetTeam?: string
): ScoutingRecord {
  if (match.comp_level !== "qm") {
    throw new Error("randomScoutingRecord only supports qualification matches.");
  }

  // Pick a robot at random from all 6 in the match
  const allTeamKeys = [
    ...match.alliances.red.team_keys,
    ...match.alliances.blue.team_keys,
  ];

  const teamKey =
    targetTeam && allTeamKeys.includes(targetTeam)
      ? targetTeam
      : allTeamKeys[randInt(0, allTeamKeys.length - 1)];

  const isRed = match.alliances.red.team_keys.includes(teamKey);
  const alliance = isRed ? "red" : "blue";
  const teamNumber = parseInt(teamKey.replace("frc", ""), 10);

  const climbAttempted = randBool(0.6);
  const climbSuccessful = climbAttempted && randBool(0.75);

  const autoScore = randInt(0, 20);
  const teleopScore = randInt(0, 40);

  const endgameAttempted = randBool(0.7);
  const endgameLevel = endgameAttempted ? randInt(1, 3) : 0;

  return {
    auto: {
      paths: randomPaths(),
      score: autoScore,
      preloaded: randBool(0.8),
      climbAttempted,
      climbSuccessful,
    },
    teleop: {
      ballsMade: randInt(0, 12),
      ballsTransferred: randInt(0, 15),
      bricked: randBool(0.1),
      playedDefense: randBool(0.25),
      score: teleopScore,
    },
    endgame: {
      notes: "",
      attempted: endgameAttempted,
      level: endgameLevel,
      rating: randInt(1, 10),
      fouls: randInt(0, 3),
    },
    teamInfo: {
      teamNumber,
      alliance,
      matchNumber: match.match_number,
    },
    scannedAt: new Date().toISOString(),
  };
}
