import { multiply, transpose, inv, matrix, subtract, dotMultiply } from "mathjs";
import type { Matrix } from "mathjs";
import type { MatchScores } from "../services/firestore";

// Helper to cast matrix() output to a typed Matrix<number> so that
// mathjs's numeric overloads resolve correctly.
function mat(data: number[] | number[][]): Matrix<number> {
  return matrix(data) as unknown as Matrix<number>;
}
import type { TBAMatch, TBATeam } from "../types/tba";

export interface OPRResult {
  teamNumber: number;
  nickname: string;
  autoOPR: number;
  teleopOPR: number;
  totalOPR: number;
  /** Half-width of the 95 % confidence interval around autoOPR */
  autoCIHalf: number;
  /** Half-width of the 95 % confidence interval around teleopOPR */
  teleopCIHalf: number;
  /** Number of qualification matches this team played (used for CI) */
  matchesPlayed: number;
}

// ── t-table (two-tailed 95 %, df = rows – teams) ────────────────────────────
// We store a lookup for small df and fall back to 1.96 for large df.
const T_TABLE_95: Record<number, number> = {
  1: 12.706, 2: 4.303, 3: 3.182, 4: 2.776, 5: 2.571,
  6: 2.447,  7: 2.365, 8: 2.306, 9: 2.262, 10: 2.228,
  11: 2.201, 12: 2.179, 13: 2.160, 14: 2.145, 15: 2.131,
  20: 2.086, 25: 2.060, 30: 2.042, 40: 2.021, 60: 2.000,
  120: 1.980,
};

function tValue(df: number): number {
  if (df <= 0) return Infinity;
  // Find the closest entry ≤ df
  const keys = Object.keys(T_TABLE_95).map(Number).sort((a, b) => a - b);
  let best = keys[0];
  for (const k of keys) {
    if (k <= df) best = k;
    else break;
  }
  // For df > 120 use the normal approximation
  if (df > 120) return 1.96;
  return T_TABLE_95[best];
}

// ── Core least-squares solver ────────────────────────────────────────────────
/**
 * Solves for OPR using the Moore-Penrose pseudoinverse, which works for
 * both over-determined (rows > T) and under-determined (rows < T) systems.
 *
 * Over-determined  (rows ≥ T): pseudo = (MᵀM)⁻¹ Mᵀ  — standard least-squares
 * Under-determined (rows < T): pseudo = Mᵀ(MMᵀ)⁻¹   — minimum-norm solution
 */
function solveLS(M: Matrix<number>, s: number[]): number[] {
  const Mt = transpose(M);
  const rows = (M.size()[0] as number);
  const cols = (M.size()[1] as number);

  let pseudo: Matrix<number>;
  if (rows >= cols) {
    // Over-determined: (MᵀM)⁻¹ Mᵀ
    const MtM = multiply(Mt, M);
    pseudo = multiply(inv(MtM), Mt) as unknown as Matrix<number>;
  } else {
    // Under-determined: Mᵀ(MMᵀ)⁻¹
    const MMt = multiply(M, Mt);
    pseudo = multiply(Mt, inv(MMt)) as unknown as Matrix<number>;
  }
  return (multiply(pseudo, mat(s)).valueOf() as number[]);
}

/**
 * Computes Autonomous and Teleop OPR for all teams, plus 95 % confidence
 * intervals, using qualification matches that have recorded scores.
 *
 * Algorithm
 * ─────────
 * 1. Build match matrix M and score vectors.
 * 2. Solve OPR = (MᵀM)⁻¹ Mᵀ s  (normal equations).
 * 3. Compute residuals r = s − M·OPR.
 * 4. Square the residuals element-wise: r².
 * 5. Solve the same least-squares system for r²:
 *    varContrib = (MᵀM)⁻¹ Mᵀ r²
 *    (variances add, so this distributes the squared residuals per team).
 * 6. σᵢ = √|varContribᵢ|  (absolute value guards against tiny negatives
 *    from floating-point noise).
 * 7. CI half-width = t_{df, 0.975} × σᵢ / √(matchesPlayedᵢ)
 *    where df = rows − T.
 */
export function computeOPR(
  teams: TBATeam[],
  matches: TBAMatch[],
  /** Optional real score data from Firestore, keyed by match number. */
  scoutedScores?: Map<number, MatchScores>
): OPRResult[] {
  const zero = (t: TBATeam): OPRResult => ({
    teamNumber: t.team_number,
    nickname: t.nickname,
    autoOPR: 0,
    teleopOPR: 0,
    totalOPR: 0,
    autoCIHalf: 0,
    teleopCIHalf: 0,
    matchesPlayed: 0,
  });

  // Use qualification matches that have scouted score data from the database.
  // TBA scores are ignored — OPR is computed only from scouting records.
  const playedQuals = matches.filter((m) => {
    if (m.comp_level !== "qm") return false;
    const hasScouted = scoutedScores?.has(m.match_number) ?? false;
    return hasScouted;
  });

  // Practice matches (negative match numbers) live only in scoutedScores —
  // they have no TBAMatch entry. Collect them separately.
  const practiceEntries: MatchScores[] = [];
  if (scoutedScores) {
    for (const [mn, scores] of scoutedScores) {
      if (mn < 0 && (scores.redAutoScores.length > 0 || scores.blueAutoScores.length > 0)) {
        practiceEntries.push(scores);
      }
    }
  }

  console.log("[OPR debug] scoutedScores map size:", scoutedScores?.size ?? 0);
  console.log("[OPR debug] total matches passed in:", matches.length, "| all match_numbers:", matches.map(m => m.match_number));
  console.log("[OPR debug] playedQuals count:", playedQuals.length);
  if (scoutedScores && scoutedScores.size > 0) {
    console.log("[OPR debug] first scoutedScore entry:", JSON.stringify([...scoutedScores.entries()][0]));
  }

  if (playedQuals.length === 0 && practiceEntries.length === 0) return teams.map(zero);

  // Only include teams that actually appear in a played match.
  // This keeps the matrix square-solvable even with few matches played.
  const activeTeamNumbers = new Set<number>();
  for (const m of playedQuals) {
    for (const key of [
      ...m.alliances.red.team_keys,
      ...m.alliances.blue.team_keys,
    ]) {
      activeTeamNumbers.add(parseInt(key.replace("frc", ""), 10));
    }
  }
  // Practice matches store raw team numbers in redTeams / blueTeams.
  for (const p of practiceEntries) {
    for (const n of [...p.redTeams, ...p.blueTeams]) {
      activeTeamNumbers.add(Number(n));
    }
  }
  const activeTeams = teams.filter((t) => activeTeamNumbers.has(t.team_number));

  // Build an ordered list of team numbers so we can index into columns
  const teamNumbers = activeTeams.map((t) => t.team_number);
  const teamIndex = new Map<number, number>(teamNumbers.map((n, i) => [n, i]));
  const T = teamNumbers.length;

  // Track how many matches each team has played
  const matchesPlayedArr = new Array<number>(T).fill(0);

  const rows: number[][] = [];
  const autoScores: number[] = [];
  const teleopScores: number[] = [];

  for (const match of playedQuals) {
    for (const side of ["red", "blue"] as const) {
      const alliance = match.alliances[side];
      const row = new Array<number>(T).fill(0);
      let valid = true;

      for (const key of alliance.team_keys) {
        const num = parseInt(key.replace("frc", ""), 10);
        const idx = teamIndex.get(num);
        if (idx === undefined) { valid = false; break; }
        row[idx] = 1;
      }

      if (!valid) continue;

      // Count a match played for each team in this alliance
      for (let col = 0; col < T; col++) {
        if (row[col] === 1) matchesPlayedArr[col]++;
      }

      rows.push(row);

      // Use scouted scores only — no fallback to TBA data.
      // Since we filtered playedQuals to only include matches with scouted data,
      // we should always have scouted arrays here.
      const scouted = scoutedScores?.get(match.match_number);
      const scoutedAutoArr = scouted ? (side === "red" ? scouted.redAutoScores : scouted.blueAutoScores) : [];
      const scoutedTeleopArr = scouted ? (side === "red" ? scouted.redTeleopScores : scouted.blueTeleopScores) : [];

      const avgAuto = scoutedAutoArr.length > 0
        ? scoutedAutoArr.reduce((a, b) => a + b, 0) / scoutedAutoArr.length
        : 0; // If no scouted data, use 0 (should not happen due to filter above)
      const avgTeleop = scoutedTeleopArr.length > 0
        ? scoutedTeleopArr.reduce((a, b) => a + b, 0) / scoutedTeleopArr.length
        : 0; // If no scouted data, use 0 (should not happen due to filter above)

      autoScores.push(avgAuto);
      teleopScores.push(avgTeleop);
    }
  }

  // ── Practice match rows ───────────────────────────────────────────────────
  // Practice match docs store raw team numbers; there are no TBA alliance totals
  // to fall back on, so only matches with scouted scores contribute rows.
  for (const p of practiceEntries) {
    for (const side of ["red", "blue"] as const) {
      const teamNums = side === "red" ? p.redTeams : p.blueTeams;
      const scoutedAutoArr   = side === "red" ? p.redAutoScores   : p.blueAutoScores;
      const scoutedTeleopArr = side === "red" ? p.redTeleopScores : p.blueTeleopScores;

      // Need both team list and at least one score to build a valid row
      if (teamNums.length === 0 || (scoutedAutoArr.length === 0 && scoutedTeleopArr.length === 0)) continue;

      const row = new Array<number>(T).fill(0);
      let valid = true;
      for (const n of teamNums) {
        const idx = teamIndex.get(Number(n));
        if (idx === undefined) { valid = false; break; }
        row[idx] = 1;
      }
      if (!valid) continue;

      for (let col = 0; col < T; col++) {
        if (row[col] === 1) matchesPlayedArr[col]++;
      }
      rows.push(row);

      const avgAuto   = scoutedAutoArr.length   > 0 ? scoutedAutoArr.reduce((a, b)   => a + b, 0) / scoutedAutoArr.length   : 0;
      const avgTeleop = scoutedTeleopArr.length > 0 ? scoutedTeleopArr.reduce((a, b) => a + b, 0) / scoutedTeleopArr.length : 0;
      autoScores.push(avgAuto);
      teleopScores.push(avgTeleop);
    }
  }

  if (rows.length === 0) return teams.map(zero);

  console.log("[OPR debug] matrix rows:", rows.length, "active teams:", T);

  try {
    const M = mat(rows);
    const df = rows.length - T;
    const t95 = tValue(df);

    // ── Step 1: solve OPR ───────────────────────────────────────────────────
    const autoOPRs = solveLS(M, autoScores);
    const teleopOPRs = solveLS(M, teleopScores);

    // ── Step 2: residuals ───────────────────────────────────────────────────
    const autoResid = (
      subtract(mat(autoScores), multiply(M, mat(autoOPRs))).valueOf() as number[]
    );
    const teleopResid = (
      subtract(mat(teleopScores), multiply(M, mat(teleopOPRs))).valueOf() as number[]
    );

    // ── Step 3: squared residuals → solve for per-team variance contributions
    const autoResid2 = (dotMultiply(autoResid, autoResid).valueOf() as number[]);
    const teleopResid2 = (dotMultiply(teleopResid, teleopResid).valueOf() as number[]);

    const autoVarContrib = solveLS(M, autoResid2);
    const teleopVarContrib = solveLS(M, teleopResid2);

    // ── Step 4: σ = √|varContrib|, CI = t × σ / √matchesPlayed ─────────────
    // Build a map of results for the active subset, then merge back with zeros
    // for teams that haven't played yet.
    const activeResults = new Map<number, OPRResult>(
      activeTeams.map((t, i) => {
        const mp = matchesPlayedArr[i] || 1;
        const autoSD = Math.sqrt(Math.abs(autoVarContrib[i] ?? 0));
        const teleopSD = Math.sqrt(Math.abs(teleopVarContrib[i] ?? 0));
        const autoCIHalf = t95 * autoSD / Math.sqrt(mp);
        const teleopCIHalf = t95 * teleopSD / Math.sqrt(mp);
        const aOPR = autoOPRs[i] ?? 0;
        const tOPR = teleopOPRs[i] ?? 0;
        return [t.team_number, {
          teamNumber: t.team_number,
          nickname: t.nickname,
          autoOPR: Math.round(aOPR * 10) / 10,
          teleopOPR: Math.round(tOPR * 10) / 10,
          totalOPR: Math.round((aOPR + tOPR) * 10) / 10,
          autoCIHalf: Math.round(autoCIHalf * 10) / 10,
          teleopCIHalf: Math.round(teleopCIHalf * 10) / 10,
          matchesPlayed: mp,
        }];
      })
    );

    return teams.map((t) => activeResults.get(t.team_number) ?? zero(t));
  } catch (err) {
    console.error("[OPR debug] matrix solve error:", err);
    return teams.map(zero);
  }
}
