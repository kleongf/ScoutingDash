import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { fetchEvent, fetchEventMatches, fetchEventTeams } from "../services/tba";
import { saveCompetitionToFirestore } from "../services/firestore";
import { useCompetition } from "../context/CompetitionContext";
import { generateTestCompetition } from "../utils/generateTestCompetition";

type LoadState = "idle" | "fetching" | "saving" | "error";
type PageTab = "real" | "test";

export default function LoadCompetitionPage() {
  const [pageTab, setPageTab] = useState<PageTab>("real");

  // ── Real competition state ─────────────────────────────────────────────────
  const [eventKey, setEventKey] = useState("");
  const [loadState, setLoadState] = useState<LoadState>("idle");
  const [errorMessage, setErrorMessage] = useState("");

  // ── Test competition state ─────────────────────────────────────────────────
  const [teamCount, setTeamCount] = useState(24);
  const [testState, setTestState] = useState<LoadState>("idle");
  const [testError, setTestError] = useState("");

  const { setCompetition } = useCompetition();
  const navigate = useNavigate();

  // ── Load real competition ──────────────────────────────────────────────────
  const handleLoad = async (e: React.FormEvent) => {
    e.preventDefault();
    const key = eventKey.trim().toLowerCase();
    if (!key) return;

    setLoadState("fetching");
    setErrorMessage("");

    try {
      const [event, teams, matches] = await Promise.allSettled([
        fetchEvent(key),
        fetchEventTeams(key),
        fetchEventMatches(key),
      ]);

      if (event.status === "rejected") {
        const msg = String(event.reason);
        if (msg.includes("not_found")) {
          throw new Error(`Event "${key}" was not found. Check the event key and try again.`);
        }
        throw new Error(msg);
      }

      const resolvedTeams = teams.status === "fulfilled" ? teams.value : [];
      const resolvedMatches = matches.status === "fulfilled" ? matches.value : [];

      setCompetition({
        event: event.value,
        teams: resolvedTeams,
        matches: resolvedMatches,
      });

      setLoadState("saving");
      await saveCompetitionToFirestore(key, resolvedTeams, resolvedMatches);

      navigate(`/dashboard/${key}`);
    } catch (err: unknown) {
      setLoadState("error");
      setErrorMessage(err instanceof Error ? err.message : "An unknown error occurred.");
    }
  };

  // ── Create test competition ────────────────────────────────────────────────
  const handleCreateTest = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestState("saving");
    setTestError("");
    try {
      const { eventKey: key, event, teams, matches } = generateTestCompetition({
        teamCount,
        matchCount: 0,
      });

      setCompetition({ event, teams, matches });

      // Save teams to Firestore (no matches yet — added one-by-one via Debug Panel)
      await saveCompetitionToFirestore(key, teams, matches);

      navigate(`/dashboard/${key}`);
    } catch (err: unknown) {
      setTestState("error");
      setTestError(err instanceof Error ? err.message : "An unknown error occurred.");
    }
  };

  const isRealLoading = loadState === "fetching" || loadState === "saving";
  const isTestLoading = testState === "saving";

  return (
    <div className="min-h-screen bg-gray-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-blue-600 mb-4">
            <svg className="w-8 h-8 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <h1 className="text-3xl font-bold text-white">Scouting Dashboard</h1>
          <p className="text-gray-400 mt-2 text-sm">Load a competition to get started</p>
        </div>

        {/* Card */}
        <div className="bg-gray-900 rounded-2xl border border-gray-800 shadow-xl overflow-hidden">
          {/* Tab bar */}
          <div className="flex border-b border-gray-800">
            <button
              onClick={() => setPageTab("real")}
              className={`flex-1 text-sm font-semibold py-3 transition cursor-pointer ${
                pageTab === "real"
                  ? "text-white border-b-2 border-blue-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              Real Event
            </button>
            <button
              onClick={() => setPageTab("test")}
              className={`flex-1 text-sm font-semibold py-3 transition cursor-pointer ${
                pageTab === "test"
                  ? "text-white border-b-2 border-yellow-500"
                  : "text-gray-500 hover:text-gray-300"
              }`}
            >
              🧪 Test Competition
            </button>
          </div>

          <div className="p-6">
            {/* ── Real event tab ────────────────────────────────────────── */}
            {pageTab === "real" && (
              <form onSubmit={handleLoad} className="space-y-4">
                <div>
                  <label htmlFor="eventKey" className="block text-sm font-medium text-gray-300 mb-1.5">
                    Event Key
                  </label>
                  <input
                    id="eventKey"
                    type="text"
                    value={eventKey}
                    onChange={(e) => setEventKey(e.target.value)}
                    placeholder="e.g. 2024casd"
                    disabled={isRealLoading}
                    className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 transition"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">
                    Find event keys at{" "}
                    <a
                      href="https://www.thebluealliance.com"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-blue-400 hover:text-blue-300 underline"
                    >
                      thebluealliance.com
                    </a>
                  </p>
                </div>

                {loadState === "error" && (
                  <div className="flex items-start gap-2.5 bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span>{errorMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isRealLoading || !eventKey.trim()}
                  className="w-full bg-blue-600 hover:bg-blue-500 disabled:bg-blue-900 disabled:text-blue-400 text-white font-semibold rounded-lg px-4 py-2.5 text-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isRealLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      {loadState === "saving" ? "Saving to Database…" : "Loading Competition…"}
                    </>
                  ) : (
                    "Load Competition"
                  )}
                </button>
              </form>
            )}

            {/* ── Test competition tab ──────────────────────────────────── */}
            {pageTab === "test" && (
              <form onSubmit={handleCreateTest} className="space-y-4">
                <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-xl px-4 py-3">
                  <p className="text-xs text-yellow-400 font-semibold mb-1">Debug / Stress Test Mode</p>
                  <p className="text-xs text-gray-400">
                    Creates a synthetic competition with random teams and <strong className="text-gray-200">no matches</strong>. Use the Debug Panel on the dashboard to add matches one at a time and inject scouting data.
                  </p>
                </div>

                <div>
                  <label htmlFor="teamCount" className="block text-sm font-medium text-gray-300 mb-1.5">
                    Number of Teams
                  </label>
                  <input
                    id="teamCount"
                    type="number"
                    min={6}
                    max={120}
                    value={teamCount}
                    onChange={(e) => setTeamCount(Math.max(6, parseInt(e.target.value) || 24))}
                    disabled={isTestLoading}
                    className="w-full bg-gray-800 border border-gray-700 text-white placeholder-gray-500 rounded-lg px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-yellow-500 focus:border-transparent disabled:opacity-50 transition"
                  />
                  <p className="text-xs text-gray-500 mt-1.5">Min 6 · Max 120</p>
                </div>

                {testState === "error" && (
                  <div className="flex items-start gap-2.5 bg-red-950 border border-red-800 text-red-300 rounded-lg px-4 py-3 text-sm">
                    <svg className="w-4 h-4 mt-0.5 shrink-0" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m9-.75a9 9 0 11-18 0 9 9 0 0118 0zm-9 3.75h.008v.008H12v-.008z" />
                    </svg>
                    <span>{testError}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isTestLoading}
                  className="w-full bg-yellow-500 hover:bg-yellow-400 disabled:opacity-50 text-gray-900 font-semibold rounded-lg px-4 py-2.5 text-sm transition flex items-center justify-center gap-2 cursor-pointer disabled:cursor-not-allowed"
                >
                  {isTestLoading ? (
                    <>
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8v8H4z" />
                      </svg>
                      Creating…
                    </>
                  ) : (
                    `Create Test Competition (${teamCount} teams)`
                  )}
                </button>
              </form>
            )}
          </div>
        </div>

        <p className="text-center text-xs text-gray-600 mt-6">
          Data provided by The Blue Alliance API
        </p>
      </div>
    </div>
  );
}
