// ── Decoded QR scouting data types ────────────────────────────────────────────

export interface AutoData {
  paths: number[];
  score: number;
  preloaded: boolean;
  climbAttempted: boolean;
  climbSuccessful: boolean;
}

export interface TeleopData {
  ballsMade: number;
  ballsTransferred: number;
  bricked: boolean;
  playedDefense: boolean;
  score: number;
}

export interface EndgameData {
  notes: string;
  attempted: boolean;
  level: number;   // 0 = none, 1 = L1, 2 = L2, 3 = L3
  rating: number;  // 1–10 defense rating
  fouls: number;
}

export interface TeamInfoData {
  teamNumber: number;
  alliance: "red" | "blue";
  matchNumber: number;
}

export interface ScoutingRecord {
  auto: AutoData;
  teleop: TeleopData;
  endgame: EndgameData;
  teamInfo: TeamInfoData;
  /** ISO timestamp of when this record was saved */
  scannedAt: string;
}
