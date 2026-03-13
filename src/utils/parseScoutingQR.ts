import type { ScoutingRecord, AutoData, TeleopData, EndgameData, TeamInfoData } from "../types/scoutingData";

/**
 * Converts 0/1 integers to booleans; leaves all other values unchanged.
 * The scouting app encodes toggle values as 0 or 1 in the QR code.
 */
function b(v: unknown): boolean {
  return v === 1 || v === true;
}

/**
 * Parses the raw JSON string from a scouting QR code into a typed
 * ScoutingRecord. Throws a descriptive Error if the payload is malformed.
 *
 * Expected format:
 *   [ autoArr, teleopArr, endgameArr, teamInfoArr ]
 *
 * autoArr    = [paths, score, preloaded, climbAttempted, climbSuccessful]
 * teleopArr  = [ballsMade, ballsTransferred, bricked, playedDefense, score]
 * endgameArr = [notes, attempted, level, rating, fouls]
 * teamInfoArr= [teamNumber, alliance, matchNumber]
 */
export function parseScoutingQR(raw: string): ScoutingRecord {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("QR payload is not valid JSON.");
  }

  if (!Array.isArray(parsed) || parsed.length < 4) {
    throw new Error("Expected a JSON array with 4 sub-arrays.");
  }

  const [autoArr, teleopArr, endgameArr, teamInfoArr] = parsed as unknown[];

  if (!Array.isArray(autoArr) || autoArr.length < 5)
    throw new Error("autoArr is missing or too short.");
  if (!Array.isArray(teleopArr) || teleopArr.length < 5)
    throw new Error("teleopArr is missing or too short.");
  if (!Array.isArray(endgameArr) || endgameArr.length < 5)
    throw new Error("endgameArr is missing or too short.");
  if (!Array.isArray(teamInfoArr) || teamInfoArr.length < 3)
    throw new Error("teamInfoArr is missing or too short.");

  const auto: AutoData = {
    paths: Array.isArray(autoArr[0]) ? (autoArr[0] as number[]) : [],
    score: Number(autoArr[1]) || 0,
    preloaded: b(autoArr[2]),
    climbAttempted: b(autoArr[3]),
    climbSuccessful: b(autoArr[4]),
  };

  const teleop: TeleopData = {
    ballsMade: Number(teleopArr[0]) || 0,
    ballsTransferred: Number(teleopArr[1]) || 0,
    bricked: b(teleopArr[2]),
    playedDefense: b(teleopArr[3]),
    score: Number(teleopArr[4]) || 0,
  };

  const endgame: EndgameData = {
    notes: String(endgameArr[0] ?? ""),
    attempted: b(endgameArr[1]),
    level: Number(endgameArr[2]) || 0,
    rating: Number(endgameArr[3]) || 0,
    fouls: Number(endgameArr[4]) || 0,
  };

  const alliance = String(teamInfoArr[1]);
  if (alliance !== "red" && alliance !== "blue") {
    throw new Error(`Invalid alliance value: "${alliance}". Expected "red" or "blue".`);
  }

  const teamInfo: TeamInfoData = {
    teamNumber: Number(teamInfoArr[0]),
    alliance,
    matchNumber: Number(teamInfoArr[2]),
  };

  return {
    auto,
    teleop,
    endgame,
    teamInfo,
    scannedAt: new Date().toISOString(),
  };
}
