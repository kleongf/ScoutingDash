import { useState, useRef } from "react";
import type { TBAMatch, TBATeam } from "../types/tba";
import type { ScoutingRecord } from "../types/scoutingData";
import { randomScoutingRecord } from "../utils/randomScoutingRecord";
import { generateOneQualMatch } from "../utils/generateTestCompetition";
import { saveScoutingRecord, saveMatchToFirestore } from "../services/firestore";

// ── Types ─────────────────────────────────────────────────────────────────────

interface ScoutEntry {
  id: number;
  record: ScoutingRecord;
  status: "pending" | "saving" | "saved" | "error";
  error?: string;
}

interface MatchEntry {
  id: number;
  match: TBAMatch;
  status: "pending" | "saving" | "saved" | "error";
  error?: string;
}

interface DebugPanelProps {
  eventKey: string;
  /** All qual matches currently in the competition */
  qualMatches: TBAMatch[];
  /** All teams in the competition */
  teams: TBATeam[];
  /** Called after a scouting record is saved so the parent can refresh OPR */
  onRecordSaved?: () => void;
  /** Called after a new match is added so the parent can update its state */
  onMatchAdded?: (match: TBAMatch) => void;
}

type Tab = "scout" | "matches";

let nextId = 1;

// ── Component ─────────────────────────────────────────────────────────────────

export default function DebugPanel({
  eventKey,
  qualMatches,
  teams,
  onRecordSaved,
  onMatchAdded,
}: DebugPanelProps) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>("scout");

  // Tracks "teamNumber:matchNumber" pairs that have already been saved so we
  // never generate a duplicate record for the same robot in the same match.
  const savedPairs = useRef<Set<string>>(new Set());

  // Scouting record state
  const [scoutEntries, setScoutEntries] = useState<ScoutEntry[]>([]);
  const [scoutSaving, setScoutSaving] = useState(false);

  // Match state
  const [matchEntries, setMatchEntries] = useState<MatchEntry[]>([]);
  const [matchSaving, setMatchSaving] = useState(false);

  // ── Scouting record actions ────────────────────────────────────────────────

  /** Picks a random unscouted (team, match) slot, or returns null if all are taken. */
  function pickUnscoutedRecord(): ReturnType<typeof randomScoutingRecord> | null {
    // Build a shuffled list of all (match, teamKey) slots that haven't been saved yet
    const slots: Array<{ match: TBAMatch; teamKey: string }> = [];
    for (const match of qualMatches) {
      for (const teamKey of [
        ...match.alliances.red.team_keys,
        ...match.alliances.blue.team_keys,
      ]) {
        const teamNumber = parseInt(teamKey.replace("frc", ""), 10);
        const pairKey = `${teamNumber}:${match.match_number}`;
        if (!savedPairs.current.has(pairKey)) {
          slots.push({ match, teamKey });
        }
      }
    }
    if (slots.length === 0) return null;
    const { match, teamKey } = slots[Math.floor(Math.random() * slots.length)];
    return randomScoutingRecord(match, teamKey);
  }

  function handleGenerate() {
    const record = pickUnscoutedRecord();
    if (!record) return; // all slots already scouted
    setScoutEntries((prev) => [{ id: nextId++, record, status: "pending" }, ...prev]);
  }

  async function handleSaveLatestScout() {
    const pending = scoutEntries.find((e) => e.status === "pending");
    if (!pending) return;
    setScoutSaving(true);
    setScoutEntries((prev) =>
      prev.map((e) => (e.id === pending.id ? { ...e, status: "saving" } : e))
    );
    try {
      await saveScoutingRecord(eventKey, pending.record);
      savedPairs.current.add(
        `${pending.record.teamInfo.teamNumber}:${pending.record.teamInfo.matchNumber}`
      );
      setScoutEntries((prev) =>
        prev.map((e) => (e.id === pending.id ? { ...e, status: "saved" } : e))
      );
      onRecordSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScoutEntries((prev) =>
        prev.map((e) => (e.id === pending.id ? { ...e, status: "error", error: msg } : e))
      );
    } finally {
      setScoutSaving(false);
    }
  }

  async function handleGenerateAndSaveScout() {
    const record = pickUnscoutedRecord();
    if (!record) return;
    const id = nextId++;
    setScoutEntries((prev) => [{ id, record, status: "saving" }, ...prev]);
    setScoutSaving(true);
    try {
      await saveScoutingRecord(eventKey, record);
      savedPairs.current.add(
        `${record.teamInfo.teamNumber}:${record.teamInfo.matchNumber}`
      );
      setScoutEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "saved" } : e))
      );
      onRecordSaved?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setScoutEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "error", error: msg } : e))
      );
    } finally {
      setScoutSaving(false);
    }
  }

  // ── Match actions ──────────────────────────────────────────────────────────

  function handleGenerateMatch() {
    if (teams.length < 6) return;
    const nextNum =
      qualMatches.length > 0
        ? Math.max(...qualMatches.map((m) => m.match_number)) + 1
        : 1;
    const match = generateOneQualMatch(eventKey, teams, nextNum);
    setMatchEntries((prev) => [{ id: nextId++, match, status: "pending" }, ...prev]);
  }

  async function handleSaveLatestMatch() {
    const pending = matchEntries.find((e) => e.status === "pending");
    if (!pending) return;
    setMatchSaving(true);
    setMatchEntries((prev) =>
      prev.map((e) => (e.id === pending.id ? { ...e, status: "saving" } : e))
    );
    try {
      await saveMatchToFirestore(eventKey, pending.match);
      setMatchEntries((prev) =>
        prev.map((e) => (e.id === pending.id ? { ...e, status: "saved" } : e))
      );
      onMatchAdded?.(pending.match);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMatchEntries((prev) =>
        prev.map((e) => (e.id === pending.id ? { ...e, status: "error", error: msg } : e))
      );
    } finally {
      setMatchSaving(false);
    }
  }

  async function handleGenerateAndSaveMatch() {
    if (teams.length < 6) return;
    const nextNum =
      qualMatches.length > 0
        ? Math.max(...qualMatches.map((m) => m.match_number)) + 1
        : 1;
    const match = generateOneQualMatch(eventKey, teams, nextNum);
    const id = nextId++;
    setMatchEntries((prev) => [{ id, match, status: "saving" }, ...prev]);
    setMatchSaving(true);
    try {
      await saveMatchToFirestore(eventKey, match);
      setMatchEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "saved" } : e))
      );
      onMatchAdded?.(match);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setMatchEntries((prev) =>
        prev.map((e) => (e.id === id ? { ...e, status: "error", error: msg } : e))
      );
    } finally {
      setMatchSaving(false);
    }
  }

  // ── Derived counts ─────────────────────────────────────────────────────────

  const savedScoutCount = scoutEntries.filter((e) => e.status === "saved").length;
  const savedMatchCount = matchEntries.filter((e) => e.status === "saved").length;
  const totalSaved = savedScoutCount + savedMatchCount;
  const hasPendingScout = scoutEntries.some((e) => e.status === "pending");
  const hasPendingMatch = matchEntries.some((e) => e.status === "pending");
  const isSaving = scoutSaving || matchSaving;

  // Total possible (team, match) slots across all current qual matches
  const totalSlots = qualMatches.reduce(
    (sum, m) => sum + m.alliances.red.team_keys.length + m.alliances.blue.team_keys.length,
    0
  );
  const remainingSlots = totalSlots - savedPairs.current.size;
  const allSlotsTaken = qualMatches.length > 0 && remainingSlots === 0;

  return (
    <div className="fixed bottom-4 right-4 z-50 flex flex-col items-end gap-2">
      {/* Toggle button */}
      <button
        onClick={() => setOpen((o) => !o)}
        title="Debug: Inject random scouting data"
        className="flex items-center gap-1.5 bg-yellow-500 hover:bg-yellow-400 text-gray-900 text-xs font-bold px-3 py-2 rounded-full shadow-lg transition cursor-pointer"
      >
        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
          <path strokeLinecap="round" strokeLinejoin="round" d="M12 3v1m0 16v1m8.66-13-.87.5M4.21 17.5l-.87.5M20.66 17.5l-.87-.5M4.21 6.5l-.87-.5M21 12h-1M4 12H3m15.36-6.36-.71.71M6.34 17.66l-.71.71M17.66 17.66l.71.71M6.34 6.34l.71-.71" />
        </svg>
        Debug
        {totalSaved > 0 && (
          <span className="bg-gray-900/30 rounded-full px-1.5 py-0.5 text-[10px]">
            {totalSaved}
          </span>
        )}
      </button>

      {/* Panel */}
      {open && (
        <div className="w-80 bg-gray-900 border border-yellow-500/40 rounded-2xl shadow-2xl overflow-hidden">
          {/* Header */}
          <div className="bg-yellow-500/10 border-b border-yellow-500/20 px-4 py-3 flex items-center justify-between">
            <div>
              <p className="text-xs font-bold text-yellow-400 uppercase tracking-wider">Debug Panel</p>
              <p className="text-[10px] text-gray-400 mt-0.5">{eventKey}</p>
            </div>
            <button
              onClick={() => setOpen(false)}
              className="text-gray-500 hover:text-gray-300 transition cursor-pointer"
            >
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </div>

          {/* Tab bar */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setTab("scout")}
              className={`flex-1 text-[11px] font-semibold py-2 transition cursor-pointer ${
                tab === "scout"
                  ? "text-yellow-400 border-b-2 border-yellow-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Scouting Records
              {savedScoutCount > 0 && (
                <span className="ml-1 text-[9px] bg-yellow-500/20 text-yellow-400 rounded-full px-1.5 py-0.5">
                  {savedScoutCount}
                </span>
              )}
            </button>
            <button
              onClick={() => setTab("matches")}
              className={`flex-1 text-[11px] font-semibold py-2 transition cursor-pointer ${
                tab === "matches"
                  ? "text-yellow-400 border-b-2 border-yellow-400"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Add Matches
              {savedMatchCount > 0 && (
                <span className="ml-1 text-[9px] bg-yellow-500/20 text-yellow-400 rounded-full px-1.5 py-0.5">
                  {savedMatchCount}
                </span>
              )}
            </button>
          </div>

          {/* ── Scouting records tab ──────────────────────────────────────── */}
          {tab === "scout" && (
            <>
              <div className="px-4 py-3 space-y-2 border-b border-gray-800">
                {qualMatches.length === 0 && (
                  <p className="text-[10px] text-yellow-600 text-center py-1">
                    ⚠ No matches yet — add matches first
                  </p>
                )}
                {allSlotsTaken && (
                  <p className="text-[10px] text-green-500 text-center py-1">
                    ✓ All {totalSlots} robot slots scouted
                  </p>
                )}
                {qualMatches.length > 0 && !allSlotsTaken && (
                  <p className="text-[10px] text-gray-500 text-center">
                    {remainingSlots} of {totalSlots} slots remaining
                  </p>
                )}
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerate}
                    disabled={isSaving || qualMatches.length === 0 || allSlotsTaken}
                    className="flex-1 text-xs font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 transition disabled:opacity-40 cursor-pointer"
                  >
                    Generate
                  </button>
                  <button
                    onClick={handleSaveLatestScout}
                    disabled={isSaving || !hasPendingScout}
                    className="flex-1 text-xs font-semibold bg-blue-700 hover:bg-blue-600 text-white rounded-lg px-3 py-2 transition disabled:opacity-40 cursor-pointer"
                  >
                    Save Latest
                  </button>
                </div>
                <button
                  onClick={handleGenerateAndSaveScout}
                  disabled={isSaving || qualMatches.length === 0 || allSlotsTaken}
                  className="w-full text-xs font-semibold bg-yellow-500 hover:bg-yellow-400 text-gray-900 rounded-lg px-3 py-2 transition disabled:opacity-40 cursor-pointer"
                >
                  {scoutSaving ? "Saving…" : "Generate & Save"}
                </button>
                {scoutEntries.length > 0 && (
                  <button
                    onClick={() => setScoutEntries([])}
                    className="w-full text-[10px] text-gray-500 hover:text-gray-300 transition cursor-pointer"
                  >
                    Clear log ({scoutEntries.length})
                  </button>
                )}
              </div>
              <ScoutLog entries={scoutEntries} />
            </>
          )}

          {/* ── Matches tab ───────────────────────────────────────────────── */}
          {tab === "matches" && (
            <>
              <div className="px-4 py-3 space-y-2 border-b border-gray-800">
                {teams.length < 6 && (
                  <p className="text-[10px] text-yellow-600 text-center py-1">
                    ⚠ Need at least 6 teams to generate a match
                  </p>
                )}
                <p className="text-[10px] text-gray-500">
                  Current qual matches:{" "}
                  <span className="text-gray-300 font-semibold">{qualMatches.length}</span>
                  {qualMatches.length > 0 && (
                    <span className="ml-1">
                      · Next will be{" "}
                      <span className="text-gray-300 font-semibold">
                        Qual {Math.max(...qualMatches.map((m) => m.match_number)) + 1}
                      </span>
                    </span>
                  )}
                </p>
                <div className="flex gap-2">
                  <button
                    onClick={handleGenerateMatch}
                    disabled={matchSaving || teams.length < 6}
                    className="flex-1 text-xs font-semibold bg-gray-800 hover:bg-gray-700 border border-gray-700 text-gray-200 rounded-lg px-3 py-2 transition disabled:opacity-40 cursor-pointer"
                  >
                    Generate
                  </button>
                  <button
                    onClick={handleSaveLatestMatch}
                    disabled={matchSaving || !hasPendingMatch}
                    className="flex-1 text-xs font-semibold bg-blue-700 hover:bg-blue-600 text-white rounded-lg px-3 py-2 transition disabled:opacity-40 cursor-pointer"
                  >
                    Save Latest
                  </button>
                </div>
                <button
                  onClick={handleGenerateAndSaveMatch}
                  disabled={matchSaving || teams.length < 6}
                  className="w-full text-xs font-semibold bg-yellow-500 hover:bg-yellow-400 text-gray-900 rounded-lg px-3 py-2 transition disabled:opacity-40 cursor-pointer"
                >
                  {matchSaving ? "Saving…" : "Generate & Save"}
                </button>
                {matchEntries.length > 0 && (
                  <button
                    onClick={() => setMatchEntries([])}
                    className="w-full text-[10px] text-gray-500 hover:text-gray-300 transition cursor-pointer"
                  >
                    Clear log ({matchEntries.length})
                  </button>
                )}
              </div>
              <MatchLog entries={matchEntries} />
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ── Sub-components ────────────────────────────────────────────────────────────

function ScoutLog({ entries }: { entries: ScoutEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-[11px] text-gray-500 px-4 py-4 text-center">
        No records generated yet.
      </p>
    );
  }
  return (
    <ul className="max-h-64 overflow-y-auto divide-y divide-gray-800">
      {entries.map((entry) => (
        <li key={entry.id} className="px-4 py-2.5">
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white">
                Team {entry.record.teamInfo.teamNumber}{" "}
                <span className={entry.record.teamInfo.alliance === "red" ? "text-red-400" : "text-blue-400"}>
                  ({entry.record.teamInfo.alliance})
                </span>
              </p>
              <p className="text-[10px] text-gray-400">
                Qual {entry.record.teamInfo.matchNumber} · Auto {entry.record.auto.score} · Teleop {entry.record.teleop.score}
              </p>
              <p className="text-[10px] text-gray-500">
                Endgame L{entry.record.endgame.level} · Rating {entry.record.endgame.rating}/10
                {entry.record.teleop.playedDefense && " · 🛡 Defense"}
                {entry.record.teleop.bricked && " · 🧱 Bricked"}
              </p>
              {entry.status === "error" && (
                <p className="text-[10px] text-red-400 mt-0.5 truncate">✗ {entry.error}</p>
              )}
            </div>
            <StatusBadge status={entry.status} />
          </div>
        </li>
      ))}
    </ul>
  );
}

function MatchLog({ entries }: { entries: MatchEntry[] }) {
  if (entries.length === 0) {
    return (
      <p className="text-[11px] text-gray-500 px-4 py-4 text-center">
        No matches generated yet.
      </p>
    );
  }
  return (
    <ul className="max-h-64 overflow-y-auto divide-y divide-gray-800">
      {entries.map((entry) => {
        const red = entry.match.alliances.red.team_keys.map((k) => k.replace("frc", "")).join(", ");
        const blue = entry.match.alliances.blue.team_keys.map((k) => k.replace("frc", "")).join(", ");
        return (
          <li key={entry.id} className="px-4 py-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-white">
                  Qual {entry.match.match_number}
                </p>
                <p className="text-[10px] text-red-400">🔴 {red}</p>
                <p className="text-[10px] text-blue-400">🔵 {blue}</p>
                {entry.status === "error" && (
                  <p className="text-[10px] text-red-400 mt-0.5 truncate">✗ {entry.error}</p>
                )}
              </div>
              <StatusBadge status={entry.status} />
            </div>
          </li>
        );
      })}
    </ul>
  );
}

type AnyStatus = "pending" | "saving" | "saved" | "error";

function StatusBadge({ status }: { status: AnyStatus }) {
  const map: Record<AnyStatus, { label: string; className: string }> = {
    pending: { label: "pending", className: "bg-gray-700 text-gray-300" },
    saving:  { label: "saving…", className: "bg-yellow-600/30 text-yellow-300 animate-pulse" },
    saved:   { label: "saved ✓", className: "bg-green-800/40 text-green-400" },
    error:   { label: "error",   className: "bg-red-900/40 text-red-400" },
  };
  const { label, className } = map[status];
  return (
    <span className={`shrink-0 text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full ${className}`}>
      {label}
    </span>
  );
}
