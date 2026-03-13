import { useEffect, useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import {
  ResponsiveContainer,
  ComposedChart,
  BarChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
} from "recharts";
import { useCompetition } from "../context/CompetitionContext";
import { generateMatchDataPoints } from "../utils/teamMetrics";
import { computeOPR } from "../utils/opr";
import { loadMatchScores, type MatchScores } from "../services/firestore";
import PitScoutingTab from "../components/PitScoutingTab";
import MatchesTab from "../components/MatchesTab";

// ── Shared chart style constants ─────────────────────────────────────────────
const GRID_STROKE = "#374151";
const TICK_STYLE = { fill: "#9ca3af", fontSize: 11 };
const TOOLTIP_STYLE = {
  contentStyle: {
    backgroundColor: "#1f2937",
    border: "1px solid #374151",
    borderRadius: 8,
    fontSize: 12,
  },
  labelStyle: { color: "#e5e7eb", marginBottom: 4 },
  itemStyle: { color: "#d1d5db" },
};

// ── Boolean bar chart ─────────────────────────────────────────────────────────
interface BoolChartProps {
  data: { matchNumber: number; value: boolean }[];
  color: string;
  label: string;
}
function BoolChart({ data, color, label }: BoolChartProps) {
  const chartData = data.map((d) => ({ matchNumber: d.matchNumber, value: d.value ? 1 : 0 }));
  return (
    <ResponsiveContainer width="100%" height={110}>
      <BarChart data={chartData} margin={{ top: 4, right: 8, left: -16, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} vertical={false} />
        <XAxis
          dataKey="matchNumber"
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={{ stroke: GRID_STROKE }}
        />
        <YAxis
          domain={[0, 1]}
          ticks={[0, 1]}
          tickFormatter={(v) => (v === 1 ? "✓" : "✗")}
          tick={TICK_STYLE}
          tickLine={false}
          axisLine={false}
          width={24}
        />
        <Tooltip
          {...TOOLTIP_STYLE}
          labelFormatter={(v) => `Match ${v}`}
          formatter={(v: number | undefined) => [v === 1 ? "Yes" : "No", label]}
        />
        <Bar dataKey="value" maxBarSize={28} radius={[3, 3, 0, 0]}>
          {chartData.map((d, i) => (
            <Cell key={i} fill={d.value ? color : "#374151"} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function TeamPage() {
  const { eventKey, teamNumber } = useParams<{
    eventKey: string;
    teamNumber: string;
  }>();
  const { competition } = useCompetition();
  const navigate = useNavigate();
  const [tab, setTab] = useState<"overview" | "matches" | "pit">("overview");

  useEffect(() => {
    if (!competition) navigate("/", { replace: true });
  }, [competition, navigate]);

  if (!competition) return null;

  const { event, teams, matches } = competition;
  const teamNum = Number(teamNumber);
  const team = teams.find((t) => t.team_number === teamNum);

  useEffect(() => {
    if (competition && !team) navigate(`/dashboard/${eventKey}`, { replace: true });
  }, [competition, team, eventKey, navigate]);

  if (!team) return null;

  const teamKey = `frc${teamNum}`;

  const qualMatches = useMemo(
    () =>
      matches
        .filter(
          (m) =>
            m.comp_level === "qm" &&
            (m.alliances.red.team_keys.includes(teamKey) ||
              m.alliances.blue.team_keys.includes(teamKey))
        )
        .sort((a, b) => a.match_number - b.match_number),
    [matches, teamKey]
  );

  const matchNumbers = qualMatches.map((m) => m.match_number);

  const dataPoints = useMemo(
    () => generateMatchDataPoints(teamNum, matchNumbers),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [teamNum, matchNumbers.join(",")]
  );

  // OPR lookup — load real scouted scores for accuracy
  const [scoutedScores, setScoutedScores] = useState<Map<number, MatchScores>>(new Map());
  useEffect(() => {
    if (!eventKey) return;
    const qualNums = matches
      .filter((m) => m.comp_level === "qm")
      .map((m) => m.match_number);
    loadMatchScores(eventKey, qualNums)
      .then(setScoutedScores)
      .catch(() => {});
  }, [eventKey, matches]);

  const oprResults = useMemo(
    () => computeOPR(teams, matches, scoutedScores),
    [teams, matches, scoutedScores]
  );
  const opr = oprResults.find((r) => r.teamNumber === teamNum);

  // Summary stats
  const n = dataPoints.length;
  const avgScored = n > 0 ? dataPoints.reduce((s, d) => s + d.ballsScored, 0) / n : 0;
  const avgTransferred = n > 0 ? dataPoints.reduce((s, d) => s + d.ballsTransferred, 0) / n : 0;
  const peakScored = n > 0 ? Math.max(...dataPoints.map((d) => d.ballsScored)) : 0;

  const climbRate = n > 0 ? dataPoints.filter((d) => d.climbSuccess).length / n : 0;
  const defenseRate = n > 0 ? dataPoints.filter((d) => d.playedDefense).length / n : 0;
  const brickedRate = n > 0 ? dataPoints.filter((d) => d.bricked).length / n : 0;

  const pct = (r: number) => `${Math.round(r * 100)}%`;

  return (
    <div className="min-h-screen bg-gray-950 text-white">
      {/* Header */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-blue-600">
            <svg className="w-5 h-5 text-white" fill="none" viewBox="0 0 24 24" strokeWidth={1.8} stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" d="M3.75 13.5l10.5-11.25L12 10.5h8.25L9.75 21.75 12 13.5H3.75z" />
            </svg>
          </div>
          <div>
            <h1 className="text-base font-bold leading-tight">
              Team {teamNum} · {team.nickname}
            </h1>
            <p className="text-xs text-gray-400">{event.name} · {eventKey}</p>
          </div>
        </div>
        <button
          onClick={() => navigate(`/dashboard/${eventKey}`)}
          className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition cursor-pointer"
        >
          ← Back to Dashboard
        </button>
      </header>

      <main className="p-6 max-w-5xl mx-auto space-y-6">
        {/* Tab bar */}
        <div className="flex items-center gap-1 bg-gray-900 border border-gray-800 rounded-xl p-1 w-fit">
          <button
            onClick={() => setTab("overview")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              tab === "overview" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Overview
          </button>
          <button
            onClick={() => setTab("matches")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              tab === "matches" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Matches
          </button>
          <button
            onClick={() => setTab("pit")}
            className={`px-4 py-1.5 rounded-lg text-xs font-semibold transition cursor-pointer ${
              tab === "pit" ? "bg-gray-700 text-white" : "text-gray-400 hover:text-gray-200"
            }`}
          >
            Pit Scouting
          </button>
        </div>

        {/* ── Overview tab ── */}
        {tab === "overview" && (
          <div className="space-y-6">
            {/* Stat cards */}
            <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3">
              <StatCard label="Avg Scored" value={avgScored.toFixed(1)} />
              <StatCard label="Avg Transferred" value={avgTransferred.toFixed(1)} />
              <StatCard label="Auto OPR" value={opr ? opr.autoOPR.toFixed(2) : "—"} accent="blue" />
              <StatCard label="Teleop OPR" value={opr ? opr.teleopOPR.toFixed(2) : "—"} accent="blue" />
              <StatCard label="Climb %" value={pct(climbRate)} accent={climbRate >= 0.6 ? "green" : climbRate >= 0.3 ? "yellow" : "red"} />
              <StatCard label="Defense %" value={pct(defenseRate)} accent="purple" />
              <StatCard label="Bricked %" value={pct(brickedRate)} accent={brickedRate <= 0.1 ? "green" : brickedRate <= 0.25 ? "yellow" : "red"} />
            </div>

            {/* Main chart — Balls Scored & Transferred */}
            <ChartCard
              title="Balls Scored & Transferred"
              subtitle={`Qualification matches · peak scored: ${peakScored.toFixed(1)}`}
              matchCount={qualMatches.length}
              empty={n === 0}
            >
              <ResponsiveContainer width="100%" height={280}>
                <ComposedChart data={dataPoints} margin={{ top: 4, right: 16, left: 0, bottom: 4 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke={GRID_STROKE} />
                  <XAxis dataKey="matchNumber" tick={TICK_STYLE} tickLine={false} axisLine={{ stroke: GRID_STROKE }}
                    label={{ value: "Match", position: "insideBottomRight", offset: -4, fill: "#6b7280", fontSize: 11 }}
                  />
                  <YAxis tick={TICK_STYLE} tickLine={false} axisLine={false} width={36} />
                  <Tooltip {...TOOLTIP_STYLE} labelFormatter={(v) => `Match ${v}`} />
                  <Legend wrapperStyle={{ fontSize: 12, color: "#9ca3af", paddingTop: 8 }} />
                  <Line dataKey="ballsTransferred" name="Balls Transferred" stroke="#3b82f6" strokeWidth={2} dot={{ r: 3, fill: "#3b82f6", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                  <Line dataKey="ballsScored" name="Balls Scored" stroke="#22c55e" strokeWidth={2} dot={{ r: 3, fill: "#22c55e", strokeWidth: 0 }} activeDot={{ r: 5 }} />
                </ComposedChart>
              </ResponsiveContainer>
            </ChartCard>

            {/* Small boolean charts */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <ChartCard
                title="Climb Success"
                subtitle={`${pct(climbRate)} success rate`}
                matchCount={qualMatches.length}
                empty={n === 0}
                compact
              >
                <BoolChart
                  data={dataPoints.map((d) => ({ matchNumber: d.matchNumber, value: d.climbSuccess }))}
                  color="#22c55e"
                  label="Climbed"
                />
              </ChartCard>

              <ChartCard
                title="Played Defense"
                subtitle={`${pct(defenseRate)} defense rate`}
                matchCount={qualMatches.length}
                empty={n === 0}
                compact
              >
                <BoolChart
                  data={dataPoints.map((d) => ({ matchNumber: d.matchNumber, value: d.playedDefense }))}
                  color="#a855f7"
                  label="Defense"
                />
              </ChartCard>

              <ChartCard
                title="Bricked"
                subtitle={`${pct(brickedRate)} brick rate`}
                matchCount={qualMatches.length}
                empty={n === 0}
                compact
              >
                <BoolChart
                  data={dataPoints.map((d) => ({ matchNumber: d.matchNumber, value: d.bricked }))}
                  color="#ef4444"
                  label="Bricked"
                />
              </ChartCard>
            </div>
          </div>
        )}

        {/* ── Matches tab ── */}
        {tab === "matches" && (
          <MatchesTab teamNumber={teamNum} qualMatches={qualMatches} />
        )}

        {/* ── Pit Scouting tab ── */}
        {tab === "pit" && (
          <PitScoutingTab eventKey={eventKey!} teamNumber={teamNum} />
        )}
      </main>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────────────

type AccentColor = "blue" | "green" | "yellow" | "red" | "purple";

const ACCENT_CLASSES: Record<AccentColor, string> = {
  blue: "text-blue-400",
  green: "text-green-400",
  yellow: "text-yellow-400",
  red: "text-red-400",
  purple: "text-purple-400",
};

function StatCard({
  label,
  value,
  small,
  accent,
  cols,
}: {
  label: string;
  value: string;
  small?: boolean;
  accent?: AccentColor;
  cols?: number;
}) {
  const colClass = cols === 2 ? "col-span-2" : "";
  const valueClass = accent
    ? `text-xl font-bold mt-0.5 ${ACCENT_CLASSES[accent]}`
    : small
    ? "text-sm font-bold text-gray-200 mt-0.5"
    : "text-xl font-bold text-white mt-0.5";
  return (
    <div className={`bg-gray-900 rounded-xl border border-gray-800 px-4 py-3 ${colClass}`}>
      <p className="text-xs text-gray-500 uppercase tracking-wider">{label}</p>
      <p className={valueClass}>{value}</p>
    </div>
  );
}

function ChartCard({
  title,
  subtitle,
  matchCount,
  empty,
  compact,
  children,
}: {
  title: string;
  subtitle: string;
  matchCount: number;
  empty: boolean;
  compact?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-gray-900 rounded-2xl border border-gray-800 p-5">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h2 className={`font-semibold text-gray-200 ${compact ? "text-xs" : "text-sm"}`}>{title}</h2>
          <p className="text-xs text-gray-500 mt-0.5">{subtitle}</p>
        </div>
        {!compact && (
          <span className="text-xs text-gray-500">
            {matchCount} match{matchCount !== 1 ? "es" : ""}
          </span>
        )}
      </div>
      {empty ? (
        <p className="text-sm text-gray-500 py-6 text-center">No match data.</p>
      ) : (
        children
      )}
    </section>
  );
}

