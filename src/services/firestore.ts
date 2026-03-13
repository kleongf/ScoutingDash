import { doc, writeBatch, setDoc, getDoc, getDocs, collection, runTransaction } from "firebase/firestore";
import { db } from "../config/config";
import type { TBAMatch, TBATeam } from "../types/tba";
import type { ScoutingRecord } from "../types/scoutingData";

/**
 * Writes a single qualification match document to Firestore.
 * Used by the debug panel when adding one match at a time to a test competition.
 * Path: competitions/{eventKey}/matches/{matchNumber}
 */
export async function saveMatchToFirestore(
  eventKey: string,
  match: TBAMatch
): Promise<void> {
  const redTeams = match.alliances.red.team_keys.map((k) => k.replace("frc", ""));
  const blueTeams = match.alliances.blue.team_keys.map((k) => k.replace("frc", ""));
  const ref = doc(db, "competitions", eventKey, "matches", String(match.match_number));
  await setDoc(ref, {
    red: {
      teams: redTeams,
      autoScores: [],
      teleopScores: [],
    },
    blue: {
      teams: blueTeams,
      autoScores: [],
      teleopScores: [],
    },
  });
}

/**
 * Returns the qualification match number as a string (e.g. "3"),
 * or null if the match is not a qualification match.
 */
function qualMatchNumber(match: TBAMatch): string | null {
  if (match.comp_level !== "qm") return null;
  return String(match.match_number);
}

/**
 * Writes all teams and qualification matches for a competition to Firestore
 * in batches.
 * Teams:   competitions/{eventKey}/teams/{teamNumber}
 * Matches: competitions/{eventKey}/matches/{matchNumber}  (quals only)
 */
export async function saveCompetitionToFirestore(
  eventKey: string,
  teams: TBATeam[],
  matches: TBAMatch[]
): Promise<void> {
  // Only qualification matches are stored
  const qualMatches = matches.filter((m) => m.comp_level === "qm");

  // Build a lookup: teamNumber → qual match numbers they appear in
  const teamMatchMap = new Map<number, string[]>();
  for (const match of qualMatches) {
    const id = qualMatchNumber(match)!;
    const allTeamKeys = [
      ...match.alliances.red.team_keys,
      ...match.alliances.blue.team_keys,
    ];
    for (const teamKey of allTeamKeys) {
      const num = parseInt(teamKey.replace("frc", ""), 10);
      if (!teamMatchMap.has(num)) teamMatchMap.set(num, []);
      teamMatchMap.get(num)!.push(id);
    }
  }

  // Firestore batches are limited to 500 writes each
  const BATCH_LIMIT = 500;
  let batch = writeBatch(db);
  let opCount = 0;

  const flush = async () => {
    if (opCount > 0) {
      await batch.commit();
      batch = writeBatch(db);
      opCount = 0;
    }
  };

  // ── Teams ──────────────────────────────────────────────────────────────────
  for (const team of teams) {
    const ref = doc(
      db,
      "competitions",
      eventKey,
      "teams",
      String(team.team_number)
    );
    const matchIds = teamMatchMap.get(team.team_number) ?? [];
    batch.set(ref, {
      teamNumber: team.team_number,
      teamName: team.nickname,
      matches: matchIds,
    });
    opCount++;
    if (opCount >= BATCH_LIMIT) await flush();
  }

  // ── Matches (quals only) ───────────────────────────────────────────────────
  for (const match of qualMatches) {
    const id = qualMatchNumber(match)!;
    const ref = doc(db, "competitions", eventKey, "matches", id);

    const redTeams = match.alliances.red.team_keys.map((k) =>
      k.replace("frc", "")
    );
    const blueTeams = match.alliances.blue.team_keys.map((k) =>
      k.replace("frc", "")
    );

    batch.set(ref, {
      red: {
        teams: redTeams,
        autoScores: [],
        teleopScores: [],
      },
      blue: {
        teams: blueTeams,
        autoScores: [],
        teleopScores: [],
      },
    });
    opCount++;
    if (opCount >= BATCH_LIMIT) await flush();
  }

  // Commit any remaining writes
  await flush();
}

/**
 * Saves the picklist order to Firestore.
 * competitions/{eventKey}/picklist  (single document with { teams: number[] })
 */
export async function savePicklist(
  eventKey: string,
  teamNumbers: number[]
): Promise<void> {
  const ref = doc(db, "competitions", eventKey, "picklist", "order");
  await setDoc(ref, { teams: teamNumbers });
}

// ── Pit scouting ──────────────────────────────────────────────────────────────

export interface ClimbLevel {
  capable: boolean;
  timeSecs: number | null;
}

export interface PitScoutingData {
  canScaleRamp: boolean;
  climbL1: ClimbLevel;
  climbL2: ClimbLevel;
  climbL3: ClimbLevel;
  drivetrain: string;
  weightLbs: number | null;
  heightIn: number | null;
  widthIn: number | null;
  fuelCapacity: number | null;
  shootingArea: string;
  notes: string;
}

export const EMPTY_PIT_DATA: PitScoutingData = {
  canScaleRamp: false,
  climbL1: { capable: false, timeSecs: null },
  climbL2: { capable: false, timeSecs: null },
  climbL3: { capable: false, timeSecs: null },
  drivetrain: "",
  weightLbs: null,
  heightIn: null,
  widthIn: null,
  fuelCapacity: null,
  shootingArea: "",
  notes: "",
};

/**
 * Loads pit scouting data for one team.
 * Path: competitions/{eventKey}/teams/{teamNumber}
 * The pit scouting fields are stored on the team document itself.
 * Returns null if no pit data has been recorded yet.
 */
export async function loadPitScouting(
  eventKey: string,
  teamNumber: number
): Promise<PitScoutingData | null> {
  const ref = doc(db, "competitions", eventKey, "teams", String(teamNumber));
  const snap = await getDoc(ref);
  if (!snap.exists()) return null;
  const d = snap.data() as Record<string, unknown>;
  // If none of the pit-specific fields are present, treat as no data
  if (
    d.drivetrain === undefined &&
    d.weightLbs === undefined &&
    d.canScaleRamp === undefined
  ) {
    return null;
  }
  return {
    canScaleRamp: Boolean(d.canScaleRamp ?? false),
    climbL1: (d.climbL1 as ClimbLevel) ?? { capable: false, timeSecs: null },
    climbL2: (d.climbL2 as ClimbLevel) ?? { capable: false, timeSecs: null },
    climbL3: (d.climbL3 as ClimbLevel) ?? { capable: false, timeSecs: null },
    drivetrain: String(d.drivetrain ?? ""),
    weightLbs: d.weightLbs != null ? Number(d.weightLbs) : null,
    heightIn: d.heightIn != null ? Number(d.heightIn) : null,
    widthIn: d.widthIn != null ? Number(d.widthIn) : null,
    fuelCapacity: d.fuelCapacity != null ? Number(d.fuelCapacity) : null,
    shootingArea: String(d.shootingArea ?? ""),
    notes: String(d.notes ?? ""),
  };
}

/**
 * Loads pit scouting data for all teams in a competition.
 * Returns a Map from teamNumber → PitScoutingData (only teams that have pit data).
 */
export async function loadAllPitScouting(
  eventKey: string,
  teamNumbers: number[]
): Promise<Map<number, PitScoutingData>> {
  const results = new Map<number, PitScoutingData>();
  await Promise.all(
    teamNumbers.map(async (num) => {
      const data = await loadPitScouting(eventKey, num);
      if (data !== null) results.set(num, data);
    })
  );
  return results;
}

/**
 * Returns the match numbers of all practice match documents stored under
 * competitions/{eventKey}/matches/ that have a negative match number.
 * Practice matches are created on-the-fly by saveScoutingRecord, so they
 * won't appear in the TBA match list.
 */
export async function loadPracticeMatchNumbers(
  eventKey: string
): Promise<number[]> {
  const col = collection(db, "competitions", eventKey, "matches");
  const snap = await getDocs(col);
  const practiceNums: number[] = [];
  for (const docSnap of snap.docs) {
    const num = parseInt(docSnap.id, 10);
    if (!isNaN(num) && num < 0) practiceNums.push(num);
  }
  return practiceNums;
}

/**
 * Saves pit scouting data for one team.
 * Path: competitions/{eventKey}/pit/{teamNumber}
 */
export async function savePitScouting(
  eventKey: string,
  teamNumber: number,
  data: PitScoutingData
): Promise<void> {
  const ref = doc(db, "competitions", eventKey, "pit", String(teamNumber));
  await setDoc(ref, data);
}

// ── QR scouting data ──────────────────────────────────────────────────────────

/**
 * Saves a decoded scouting record to two places atomically:
 *
 * 1. competitions/{eventKey}/teams/{teamNumber}/matches/{matchNumber}
 *    Full decoded record for per-team match history.
 *
 * 2. competitions/{eventKey}/matches/{matchNumber}
 *    Appends the auto/teleop scores to the correct alliance score arrays
 *    so that OPR can be computed from real data.
 */
export async function saveScoutingRecord(
  eventKey: string,
  record: ScoutingRecord
): Promise<void> {
  const { teamInfo, auto, teleop } = record;
  const { teamNumber, matchNumber, alliance } = teamInfo;

  // 1 ── Full record under the team's match history
  const matchRef = doc(
    db,
    "competitions",
    eventKey,
    "teams",
    String(teamNumber),
    "matches",
    String(matchNumber)
  );
  await setDoc(matchRef, record);

  // 2 ── Append scores to the match document using a transaction so that
  //      identical score values from different scouters are never deduplicated
  //      (arrayUnion behaves like a set and would silently drop duplicates).
  const matchDocRef = doc(
    db,
    "competitions",
    eventKey,
    "matches",
    String(matchNumber)
  );

  await runTransaction(db, async (tx) => {
    const snap = await tx.get(matchDocRef);

    if (!snap.exists()) {
      // Practice matches (negative match numbers) have no pre-created document —
      // create one on the fly with empty score arrays for both alliances.
      tx.set(matchDocRef, {
        practice: true,
        red:  { teams: [], autoScores: alliance === "red"  ? [auto.score]   : [], teleopScores: alliance === "red"  ? [teleop.score] : [] },
        blue: { teams: [], autoScores: alliance === "blue" ? [auto.score]   : [], teleopScores: alliance === "blue" ? [teleop.score] : [] },
      });
      return;
    }

    const data = snap.data() as Record<string, Record<string, number[]>>;
    const existing = data[alliance] ?? {};

    const prevAuto: number[] = existing.autoScores ?? [];
    const prevTeleop: number[] = existing.teleopScores ?? [];

    tx.update(matchDocRef, {
      [`${alliance}.autoScores`]: [...prevAuto, auto.score],
      [`${alliance}.teleopScores`]: [...prevTeleop, teleop.score],
    });
  });
}

// ── Load per-alliance score arrays for OPR (keyed by match number) ───────────

export interface MatchScores {
  matchNumber: number;
  /** Team numbers on the red alliance (populated for practice matches). */
  redTeams: number[];
  /** Team numbers on the blue alliance (populated for practice matches). */
  blueTeams: number[];
  redAutoScores: number[];
  redTeleopScores: number[];
  blueAutoScores: number[];
  blueTeleopScores: number[];
}

/**
 * Reads back the match documents for the given match numbers and returns
 * the recorded score arrays. Used by computeOPR to use real scores when
 * available, falling back to TBA alliance totals otherwise.
 */
export async function loadMatchScores(
  eventKey: string,
  matchNumbers: number[]
): Promise<Map<number, MatchScores>> {
  const results = new Map<number, MatchScores>();

  await Promise.all(
    matchNumbers.map(async (mn) => {
      const ref = doc(db, "competitions", eventKey, "matches", String(mn));
      const snap = await getDoc(ref);
      if (!snap.exists()) return;
      const d = snap.data() as Record<string, Record<string, unknown>>;
      results.set(mn, {
        matchNumber: mn,
        redTeams:  (d.red?.teams  as number[] | undefined) ?? [],
        blueTeams: (d.blue?.teams as number[] | undefined) ?? [],
        redAutoScores:   (d.red?.autoScores   as number[] | undefined) ?? [],
        redTeleopScores: (d.red?.teleopScores  as number[] | undefined) ?? [],
        blueAutoScores:  (d.blue?.autoScores  as number[] | undefined) ?? [],
        blueTeleopScores:(d.blue?.teleopScores as number[] | undefined) ?? [],
      });
    })
  );

  return results;
}
