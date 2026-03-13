import { useState, useMemo } from "react";
import type { ScoutingRecord } from "../types/scoutingData";
import type { TBAMatch } from "../types/tba";

// ── Seeded PRNG ───────────────────────────────────────────────────────────────
function mulberry32(seed: number) {
  return function () {
    seed |= 0;
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Generate a realistic-looking scouting record for a team/match (placeholder). */
function generateRecord(teamNumber: number, match: TBAMatch): ScoutingRecord {
  const seed = ((teamNumber * 2654435761 + match.match_number * 40503) >>> 0);
  const rand = mulberry32(seed);

  const teamKey = `frc${teamNumber}`;
  const alliance: "red" | "blue" = match.alliances.red.team_keys.includes(teamKey) ? "red" : "blue";

  const paths = [Math.floor(rand() * 4), Math.floor(rand() * 4)].filter((v, i, a) => a.indexOf(v) === i);
  const autoScore = Math.round(rand() * 12 * 10) / 10;
  const preloaded = rand() < 0.8;
  const climbAttempted = rand() < 0.7;
  const climbSuccessful = climbAttempted && rand() < 0.85;

  const ballsMade = Math.floor(rand() * 14);
  const ballsTransferred = Math.floor(rand() * 12);
  const bricked = rand() < 0.12;
  const playedDefense = rand() < 0.28;
  const teleopScore = Math.round(rand() * 60 * 10) / 10;

  const endgameNotes = [
    "Good performance overall.",
    "Struggled with alignment in teleop.",
    "Excellent autonomous run.",
    "Defense was very effective.",
    "Mechanical issue mid-match.",
    "Clean match, no issues.",
    "Communication delay between drive team.",
    "Strong in climbing, weak on transfers.",
  ];
  const notes = endgameNotes[Math.floor(rand() * endgameNotes.length)];
  const attempted = rand() < 0.65;
  const level = attempted ? (rand() < 0.4 ? 3 : rand() < 0.6 ? 2 : 1) : 0;
  const rating = Math.round(rand() * 4 + 6); // 6–10
  const fouls = Math.floor(rand() * 4);

  return {
    auto: { paths, score: autoScore, preloaded, climbAttempted, climbSuccessful },
    teleop: { ballsMade, ballsTransferred, bricked, playedDefense, score: teleopScore },
    endgame: { notes, attempted, level, rating, fouls },
    teamInfo: { teamNumber, alliance, matchNumber: match.match_number },
    scannedAt: new Date(Date.now() - Math.floor(rand() * 7 * 24 * 60 * 60 * 1000)).toISOString(),
  };
}

// ── Small badge helpers ───────────────────────────────────────────────────────
function AllianceBadge({ alliance }: { alliance: "red" | "blue" }) {
  return (
    <span
      className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wide ${
        alliance === "red"
          ? "bg-red-900/60 text-red-300 border border-red-800"
          : "bg-blue-900/60 text-blue-300 border border-blue-800"
      }`}
    >
      {alliance}
    </span>
  );
}

function YesNo({ value, yes = "green", no = "red" }: { value: boolean; yes?: string; no?: string }) {
  return (
    <span className={`font-semibold ${value ? `text-${yes}-400` : `text-${no}-400`}`}>
      {value ? "Yes" : "No"}
    </span>
  );
}

const CLIMB_LABELS = ["—", "L1", "L2", "L3"];
const CLIMB_COLORS = ["text-gray-500", "text-yellow-400", "text-orange-400", "text-green-400"];

// ── Modal ─────────────────────────────────────────────────────────────────────
function ScoutingModal({
  record,
  onClose,
}: {
  record: ScoutingRecord;
  onClose: () => void;
}) {
  const { auto, teleop, endgame, teamInfo } = record;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-2xl w-full max-w-lg shadow-2xl overflow-y-auto max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800">
          <div className="flex items-center gap-3">
            <div>
              <h2 className="text-sm font-bold text-white">
                Match {teamInfo.matchNumber} · Scouting Report
              </h2>
              <p className="text-xs text-gray-400 mt-0.5">
                Team {teamInfo.teamNumber} &nbsp;·&nbsp;{" "}
                <AllianceBadge alliance={teamInfo.alliance} />
                &nbsp;·&nbsp; Scanned {new Date(record.scannedAt).toLocaleDateString()}
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-gray-500 hover:text-white transition text-lg leading-none cursor-pointer"
            aria-label="Close"
          >
            ✕
          </button>
        </div>

        <div className="p-5 space-y-5">
          {/* Auto */}
          <Section title="Autonomous" color="yellow">
            <Row label="Score" value={auto.score.toFixed(1)} />
            <Row label="Preloaded" value={<YesNo value={auto.preloaded} />} />
            <Row label="Climb Attempted" value={<YesNo value={auto.climbAttempted} />} />
            <Row label="Climb Successful" value={<YesNo value={auto.climbSuccessful} />} />
            <Row
              label="Paths"
              value={
                auto.paths.length > 0
                  ? auto.paths.map((p) => `Path ${p}`).join(", ")
                  : "None"
              }
            />
          </Section>

          {/* Teleop */}
          <Section title="Teleoperated" color="blue">
            <Row label="Score" value={teleop.score.toFixed(1)} />
            <Row label="Balls Made" value={teleop.ballsMade} />
            <Row label="Balls Transferred" value={teleop.ballsTransferred} />
            <Row label="Bricked" value={<YesNo value={teleop.bricked} yes="red" no="green" />} />
            <Row label="Played Defense" value={<YesNo value={teleop.playedDefense} yes="purple" no="gray" />} />
          </Section>

          {/* Endgame */}
          <Section title="Endgame" color="green">
            <Row
              label="Climb Level"
              value={
                <span className={CLIMB_COLORS[endgame.level]}>
                  {CLIMB_LABELS[endgame.level]}
                </span>
              }
            />
            <Row label="Attempted" value={<YesNo value={endgame.attempted} />} />
            <Row
              label="Driver Rating"
              value={
                <span className="flex items-center gap-1">
                  <span className="text-white font-bold">{endgame.rating}</span>
                  <span className="text-gray-500">/10</span>
                </span>
              }
            />
            <Row label="Fouls" value={
              <span className={endgame.fouls > 0 ? "text-red-400 font-semibold" : "text-gray-400"}>
                {endgame.fouls}
              </span>
            } />
            {endgame.notes && (
              <div className="mt-2 pt-2 border-t border-gray-800">
                <p className="text-xs text-gray-500 mb-1">Notes</p>
                <p className="text-sm text-gray-300 leading-relaxed">{endgame.notes}</p>
              </div>
            )}
          </Section>
        </div>
      </div>
    </div>
  );
}

function Section({
  title,
  color,
  children,
}: {
  title: string;
  color: "yellow" | "blue" | "green";
  children: React.ReactNode;
}) {
  const dot: Record<string, string> = {
    yellow: "bg-yellow-400",
    blue: "bg-blue-400",
    green: "bg-green-400",
  };
  return (
    <div>
      <div className="flex items-center gap-2 mb-2">
        <span className={`w-2 h-2 rounded-full ${dot[color]}`} />
        <h3 className="text-xs font-bold text-gray-300 uppercase tracking-wider">{title}</h3>
      </div>
      <div className="bg-gray-800/60 rounded-xl divide-y divide-gray-700/50">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between px-4 py-2.5">
      <span className="text-xs text-gray-400">{label}</span>
      <span className="text-xs text-gray-200">{value}</span>
    </div>
  );
}

// ── MatchesTab ────────────────────────────────────────────────────────────────
interface MatchesTabProps {
  teamNumber: number;
  qualMatches: TBAMatch[];
}

export default function MatchesTab({ teamNumber, qualMatches }: MatchesTabProps) {
  const [selected, setSelected] = useState<ScoutingRecord | null>(null);

  const records = useMemo(
    () => qualMatches.map((m) => generateRecord(teamNumber, m)),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamNumber, qualMatches.map((m) => m.match_number).join(",")]
  );

  if (records.length === 0) {
    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-10 text-center">
        <p className="text-gray-500 text-sm">No qualification matches found for this team.</p>
      </div>
    );
  }

  return (
    <>
      <div className="bg-gray-900 rounded-2xl border border-gray-800 overflow-hidden">
        {/* Table header */}
        <div className="grid grid-cols-[3rem_4rem_5rem_1fr_1fr_1fr_1fr_3rem] gap-x-2 px-4 py-2.5 border-b border-gray-800 text-[10px] font-bold text-gray-500 uppercase tracking-wider">
          <span>#</span>
          <span>Alliance</span>
          <span>Climb</span>
          <span>Auto</span>
          <span>Teleop</span>
          <span>Defense</span>
          <span>Bricked</span>
          <span></span>
        </div>

        {/* Rows */}
        {records.map((rec) => {
          const { teamInfo, auto, teleop, endgame } = rec;
          const climbLabel = CLIMB_LABELS[endgame.level];
          const climbColor = CLIMB_COLORS[endgame.level];
          return (
            <button
              key={teamInfo.matchNumber}
              onClick={() => setSelected(rec)}
              className="w-full grid grid-cols-[3rem_4rem_5rem_1fr_1fr_1fr_1fr_3rem] gap-x-2 items-center px-4 py-3 border-b border-gray-800/60 last:border-0 hover:bg-gray-800/50 transition text-left cursor-pointer"
            >
              <span className="text-xs font-bold text-gray-300">Q{teamInfo.matchNumber}</span>
              <span>
                <AllianceBadge alliance={teamInfo.alliance} />
              </span>
              <span className={`text-xs font-semibold ${climbColor}`}>{climbLabel}</span>
              <span className="text-xs text-gray-300">{auto.score.toFixed(1)} pts</span>
              <span className="text-xs text-gray-300">{teleop.score.toFixed(1)} pts</span>
              <span className="text-xs">
                {teleop.playedDefense ? (
                  <span className="text-purple-400 font-semibold">Yes</span>
                ) : (
                  <span className="text-gray-600">—</span>
                )}
              </span>
              <span className="text-xs">
                {teleop.bricked ? (
                  <span className="text-red-400 font-semibold">Yes</span>
                ) : (
                  <span className="text-green-500">No</span>
                )}
              </span>
              <span className="text-xs text-gray-500 text-right">→</span>
            </button>
          );
        })}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
        {(() => {
          const n = records.length;
          const avgAuto = records.reduce((s, r) => s + r.auto.score, 0) / n;
          const avgTeleop = records.reduce((s, r) => s + r.teleop.score, 0) / n;
          const climbPct = Math.round((records.filter((r) => r.endgame.level > 0).length / n) * 100);
          const defensePct = Math.round((records.filter((r) => r.teleop.playedDefense).length / n) * 100);
          return (
            <>
              <SummaryCard label="Avg Auto Score" value={avgAuto.toFixed(1)} />
              <SummaryCard label="Avg Teleop Score" value={avgTeleop.toFixed(1)} />
              <SummaryCard label="Climb Rate" value={`${climbPct}%`} accent="green" />
              <SummaryCard label="Defense Rate" value={`${defensePct}%`} accent="purple" />
            </>
          );
        })()}
      </div>

      {/* Modal */}
      {selected && <ScoutingModal record={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function SummaryCard({
  label,
  value,
  accent,
}: {
  label: string;
  value: string;
  accent?: "green" | "purple";
}) {
  const vc = accent === "green"
    ? "text-green-400"
    : accent === "purple"
    ? "text-purple-400"
    : "text-white";
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
      <p className="text-[10px] text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`text-xl font-bold mt-0.5 ${vc}`}>{value}</p>
    </div>
  );
}
