import { useEffect, useState, useMemo, useCallback } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { useCompetition } from "../context/CompetitionContext";
import { computeOPR } from "../utils/opr";
import { generateTeamMetrics } from "../utils/teamMetrics";
import { loadMatchScores, loadAllPitScouting, loadPracticeMatchNumbers, type MatchScores } from "../services/firestore";
import type { PitScoutingData } from "../services/firestore";
import OPRTable from "../components/OPRTable";
import PicklistTab from "../components/PicklistTab";
import DebugPanel from "../components/DebugPanel";
import type { TBAMatch } from "../types/tba";

const COMP_LEVEL_LABEL: Record<TBAMatch["comp_level"], string> = {
  qm: "Quals",
  ef: "Elims",
  qf: "Quarters",
  sf: "Semis",
  f: "Finals",
};

function matchLabel(match: TBAMatch): string {
  const level = COMP_LEVEL_LABEL[match.comp_level];
  if (match.comp_level === "qm") return `${level} ${match.match_number}`;
  return `${level} ${match.set_number}-${match.match_number}`;
}

function sortMatches(matches: TBAMatch[]): TBAMatch[] {
  const order: Record<TBAMatch["comp_level"], number> = {
    qm: 0,
    ef: 1,
    qf: 2,
    sf: 3,
    f: 4,
  };
  return [...matches].sort((a, b) => {
    const lvl = order[a.comp_level] - order[b.comp_level];
    if (lvl !== 0) return lvl;
    if (a.set_number !== b.set_number) return a.set_number - b.set_number;
    return a.match_number - b.match_number;
  });
}

export default function DashboardPage() {
  const { eventKey } = useParams<{ eventKey: string }>();
  const { competition, setCompetition } = useCompetition();
  const navigate = useNavigate();
  const [matchTab, setMatchTab] = useState<"schedule" | "opr" | "picklist">("schedule");
  const [teamSearch, setTeamSearch] = useState("");
  const [teamsDrawerOpen, setTeamsDrawerOpen] = useState(false);
  const [scoutedScores, setScoutedScores] = useState<Map<number, MatchScores>>(new Map());
  const [pitData, setPitData] = useState<Map<number, PitScoutingData>>(new Map());

  // Load scouted scores from Firestore. Accepts an explicit match-number list
  // so it can be called with up-to-date data without depending on `competition`
  // in the closure (which would cause a stale-read race with Firestore writes).
  // Also discovers and merges any practice match scores (negative match numbers).
  const refreshScoutedScores = useCallback(
    (matchNumbers?: number[]) => {
      if (!eventKey) return;
      const nums =
        matchNumbers ??
        (competition?.matches ?? [])
          .filter((m) => m.comp_level === "qm")
          .map((m) => m.match_number);

      // Load qual/test match scores and practice match scores in parallel,
      // then merge them into a single map.
      const qualPromise = nums.length > 0
        ? loadMatchScores(eventKey, nums)
        : Promise.resolve(new Map<number, MatchScores>());

      const practicePromise = loadPracticeMatchNumbers(eventKey)
        .then((practiceNums) =>
          practiceNums.length > 0
            ? loadMatchScores(eventKey, practiceNums)
            : new Map<number, MatchScores>()
        );

      Promise.all([qualPromise, practicePromise])
        .then(([qualScores, practiceScores]) => {
          const merged = new Map<number, MatchScores>([...qualScores, ...practiceScores]);
          console.log("[OPR debug] loadMatchScores result:", Object.fromEntries(merged));
          setScoutedScores(merged);
        })
        .catch((e) => console.error("[OPR debug] loadMatchScores error:", e));
    },
    [eventKey] // intentionally NOT depending on competition
  );

  // Initial load and whenever the match list changes (new match added).
  const qualMatchNumbers = useMemo(
    () =>
      (competition?.matches ?? [])
        .filter((m) => m.comp_level === "qm")
        .map((m) => m.match_number),
    [competition?.matches]
  );
  useEffect(() => {
    if (qualMatchNumbers.length > 0) refreshScoutedScores(qualMatchNumbers);
  }, [qualMatchNumbers, refreshScoutedScores]);

  // Append a newly-generated match to the in-memory competition so the
  // schedule and debug panel reflect it immediately without a page reload.
  const handleMatchAdded = useCallback(
    (match: TBAMatch) => {
      if (!competition) return;
      const updatedMatches = [...competition.matches, match];
      setCompetition({ ...competition, matches: updatedMatches });
      // Refresh scores with the now-complete match number list
      const updatedNums = updatedMatches
        .filter((m) => m.comp_level === "qm")
        .map((m) => m.match_number);
      refreshScoutedScores(updatedNums);
    },
    [competition, setCompetition, refreshScoutedScores]
  );

  // Load pit scouting data whenever the event or team list changes.
  useEffect(() => {
    if (!eventKey || !competition) return;
    const teamNumbers = competition.teams.map((t) => t.team_number);
    if (teamNumbers.length === 0) return;
    loadAllPitScouting(eventKey, teamNumbers)
      .then(setPitData)
      .catch((e) => console.error("[pit scouting] load error:", e));
  }, [eventKey, competition?.teams]);

  // If competition data is gone (e.g. page refresh), redirect back to load page
  useEffect(() => {
    if (!competition) {
      navigate("/", { replace: true });
    }
  }, [competition, navigate]);

  if (!competition) return null;

  const { event, teams, matches } = competition;
  const qualMatches = matches.filter((m) => m.comp_level === "qm");
  const sortedMatches = sortMatches(matches);
  const sortedTeams = [...teams].sort((a, b) => a.team_number - b.team_number);

  const oprResults = useMemo(
    () => computeOPR(teams, matches, scoutedScores),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teams, matches, scoutedScores, scoutedScores.size]
  );
  const metricsMap = useMemo(
    () => generateTeamMetrics(teams.map((t) => t.team_number), pitData),
    [teams, pitData]
  );

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Top nav */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">{event.name}</h1>
            <p className="text-xs text-gray-400">{eventKey} · {event.year}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => {
              if (!eventKey) return;
              const url = `/dashboard/${encodeURIComponent(eventKey)}/scanner`;
              window.open(url, "_blank", "noopener,noreferrer");
            }}
            title="Open QR scanner in a new tab"
            aria-label="Open QR code scanner"
            className="flex items-center gap-1.5 text-xs font-semibold text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition cursor-pointer"
          >
            <svg
              className="w-4 h-4"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={1.8}
              stroke="currentColor"
              aria-hidden="true"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M6.827 6.175A2.31 2.31 0 0 1 5.186 7.23c-.38.054-.757.112-1.134.175C2.999 7.58 2.25 8.507 2.25 9.574V18a2.25 2.25 0 0 0 2.25 2.25h15A2.25 2.25 0 0 0 21.75 18V9.574c0-1.067-.75-1.994-1.802-2.169a47.865 47.865 0 0 0-1.134-.175 2.31 2.31 0 0 1-1.64-1.055l-.822-1.316a2.192 2.192 0 0 0-1.736-1.039 48.774 48.774 0 0 0-5.232 0 2.192 2.192 0 0 0-1.736 1.039l-.821 1.316Z" />
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 12.75a4.5 4.5 0 1 1-9 0 4.5 4.5 0 0 1 9 0ZM18.75 10.5h.008v.008h-.008V10.5Z" />
            </svg>
            Scan QR
          </button>
          <button
            onClick={() => navigate("/")}
            className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition cursor-pointer"
          >
            ← Change Event
          </button>
        </div>
      </header>

      {/* Teams drawer — slides in from the left */}
      <div
        className={`fixed inset-y-0 left-0 z-40 flex flex-col w-72 bg-gray-900 border-r border-gray-800 shadow-2xl transition-transform duration-300 ${
          teamsDrawerOpen ? "translate-x-0" : "-translate-x-full"
        }`}
      >
        {/* Drawer header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-800 shrink-0">
          <h2 className="text-sm font-semibold text-gray-300 uppercase tracking-wider">
            Teams ({sortedTeams.length})
          </h2>
          <button
            onClick={() => setTeamsDrawerOpen(false)}
            className="text-gray-500 hover:text-white transition cursor-pointer"
            aria-label="Close teams panel"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {/* Search */}
        <div className="px-5 pt-3 pb-2 shrink-0">
          <div className="relative">
            <svg
              className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-gray-500 pointer-events-none"
              fill="none"
              viewBox="0 0 24 24"
              strokeWidth={2}
              stroke="currentColor"
            >
              <path strokeLinecap="round" strokeLinejoin="round" d="M21 21l-4.35-4.35M17 11A6 6 0 1 1 5 11a6 6 0 0 1 12 0z" />
            </svg>
            <input
              type="text"
              placeholder="Search by number or name…"
              value={teamSearch}
              onChange={(e) => setTeamSearch(e.target.value)}
              className="w-full bg-gray-800 border border-gray-700 rounded-lg pl-8 pr-3 py-1.5 text-xs text-gray-200 placeholder-gray-500 focus:outline-none focus:border-blue-500 transition"
            />
          </div>
        </div>

        {/* Team list */}
        <div className="flex-1 overflow-y-auto px-3 pb-4">
          {sortedTeams.length === 0 ? (
            <p className="text-sm text-gray-500 px-2">No team data available yet.</p>
          ) : (
            <ul className="space-y-1">
              {sortedTeams
                .filter((team) => {
                  const q = teamSearch.trim().toLowerCase();
                  if (!q) return true;
                  return (
                    String(team.team_number).includes(q) ||
                    team.nickname.toLowerCase().includes(q) ||
                    (team.city ?? "").toLowerCase().includes(q)
                  );
                })
                .map((team) => (
                  <li
                    key={team.key}
                    onClick={() => {
                      navigate(`/dashboard/${eventKey}/team/${team.team_number}`);
                      setTeamsDrawerOpen(false);
                    }}
                    className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800 transition cursor-pointer group"
                  >
                    <span className="text-blue-400 font-bold text-sm w-12 shrink-0">
                      {team.team_number}
                    </span>
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-medium truncate group-hover:text-blue-300 transition">
                        {team.nickname}
                      </p>
                      <p className="text-xs text-gray-500 truncate">
                        {[team.city, team.state_prov].filter(Boolean).join(", ")}
                      </p>
                    </div>
                    <svg
                      className="w-3.5 h-3.5 text-gray-600 group-hover:text-gray-400 shrink-0 transition"
                      fill="none"
                      viewBox="0 0 24 24"
                      strokeWidth={2}
                      stroke="currentColor"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
                    </svg>
                  </li>
                ))}
            </ul>
          )}
        </div>
      </div>

      {/* Backdrop — clicking it closes the drawer */}
      {teamsDrawerOpen && (
        <div
          className="fixed inset-0 z-30 bg-black/50"
          onClick={() => setTeamsDrawerOpen(false)}
          aria-hidden="true"
        />
      )}

      <main className="p-6 max-w-screen-2xl mx-auto space-y-6">
        {/* Event info cards */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
          <StatCard label="Teams" value={teams.length} />
          <StatCard label="Matches" value={matches.length} />
          <StatCard
            label="Location"
            value={[event.city, event.state_prov, event.country].filter(Boolean).join(", ") || "—"}
            small
          />
          <StatCard
            label="Dates"
            value={`${event.start_date} → ${event.end_date}`}
            small
          />
        </div>

        {/* Matches / OPR / Picklist — full width */}
        <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
            {/* Tab bar */}
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-1 bg-gray-800 rounded-lg p-1 w-fit">
              <button
                onClick={() => setMatchTab("schedule")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  matchTab === "schedule"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Schedule ({sortedMatches.length})
              </button>
              <button
                onClick={() => setMatchTab("opr")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  matchTab === "opr"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                OPR Rankings
              </button>
              <button
                onClick={() => setMatchTab("picklist")}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition cursor-pointer ${
                  matchTab === "picklist"
                    ? "bg-gray-700 text-white"
                    : "text-gray-400 hover:text-gray-200"
                }`}
              >
                Picklist
              </button>
            </div>

              {/* Teams button — opens drawer */}
              <button
                onClick={() => setTeamsDrawerOpen(true)}
                className="flex items-center gap-1.5 text-xs font-semibold text-gray-200 bg-gray-800 hover:bg-gray-700 border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition cursor-pointer"
              >
                <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" d="M18 18.72a9.094 9.094 0 0 0 3.741-.479 3 3 0 0 0-4.682-2.72m.94 3.198.001.031c0 .225-.012.447-.037.666A11.944 11.944 0 0 1 12 21c-2.17 0-4.207-.576-5.963-1.584A6.062 6.062 0 0 1 6 18.719m12 0a5.971 5.971 0 0 0-.941-3.197m0 0A5.995 5.995 0 0 0 12 12.75a5.995 5.995 0 0 0-5.058 2.772m0 0a3 3 0 0 0-4.681 2.72 8.986 8.986 0 0 0 3.74.477m.94-3.197a5.971 5.971 0 0 0-.94 3.197M15 6.75a3 3 0 1 1-6 0 3 3 0 0 1 6 0Zm6 3a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Zm-13.5 0a2.25 2.25 0 1 1-4.5 0 2.25 2.25 0 0 1 4.5 0Z" />
                </svg>
                Teams ({sortedTeams.length})
              </button>
            </div>

            {/* Schedule tab */}
            {matchTab === "schedule" && (
              sortedMatches.length === 0 ? (
                <p className="text-sm text-gray-500">No match data available yet.</p>
              ) : (
                <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1">
                  {sortedMatches.map((match) => {
                    const red = match.alliances.red;
                    const blue = match.alliances.blue;
                    const redWon = red.score > blue.score;
                    const blueWon = blue.score > red.score;
                    const hasScores = red.score >= 0 && blue.score >= 0;

                    return (
                      <div
                        key={match.key}
                        className="flex items-center gap-3 px-3 py-2.5 rounded-xl bg-gray-800/60 border border-gray-700/50"
                      >
                        <span className="text-xs font-semibold text-gray-400 w-20 shrink-0">
                          {matchLabel(match)}
                        </span>

                        {/* Red alliance */}
                        <div className={`flex-1 rounded-lg px-2 py-1.5 ${redWon ? "bg-red-900/70" : "bg-red-950/40"}`}>
                          <div className="flex flex-wrap gap-1 mb-1">
                            {red.team_keys.map((t) => (
                              <span key={t} className="text-xs font-medium text-red-300">
                                {t.replace("frc", "")}
                              </span>
                            ))}
                          </div>
                          {hasScores && (
                            <span className={`text-sm font-bold ${redWon ? "text-red-200" : "text-red-400"}`}>
                              {red.score}
                            </span>
                          )}
                        </div>

                        <span className="text-gray-600 text-xs font-bold">vs</span>

                        {/* Blue alliance */}
                        <div className={`flex-1 rounded-lg px-2 py-1.5 ${blueWon ? "bg-blue-900/70" : "bg-blue-950/40"}`}>
                          <div className="flex flex-wrap gap-1 mb-1">
                            {blue.team_keys.map((t) => (
                              <span key={t} className="text-xs font-medium text-blue-300">
                                {t.replace("frc", "")}
                              </span>
                            ))}
                          </div>
                          {hasScores && (
                            <span className={`text-sm font-bold ${blueWon ? "text-blue-200" : "text-blue-400"}`}>
                              {blue.score}
                            </span>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )
            )}

            {/* OPR tab */}
            {matchTab === "opr" && (
              <OPRTable oprResults={oprResults} metricsMap={metricsMap} />
            )}

            {/* Picklist tab */}
            {matchTab === "picklist" && (
              <PicklistTab teams={teams} eventKey={eventKey!} />
            )}
          </section>
      </main>

      {/* ── Debug Panel (floating) ─────────────────────────────────────────── */}
      <DebugPanel
        eventKey={eventKey!}
        qualMatches={qualMatches}
        teams={teams}
        onRecordSaved={refreshScoutedScores}
        onMatchAdded={handleMatchAdded}
      />
    </div>
  );
}

function StatCard({
  label,
  value,
  small,
}: {
  label: string;
  value: string | number;
  small?: boolean;
}) {
  return (
    <div className="bg-gray-900 rounded-xl border border-gray-800 px-4 py-3">
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={`font-bold mt-0.5 ${small ? "text-sm text-gray-200" : "text-2xl text-white"}`}>
        {value}
      </p>
    </div>
  );
}
