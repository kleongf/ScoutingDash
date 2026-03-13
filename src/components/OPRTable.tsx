import { useState, useMemo } from "react";
import type { OPRResult } from "../utils/opr";
import type { TeamMetrics } from "../utils/teamMetrics";

// ── Heat-color helpers ────────────────────────────────────────────────────────

function heatColor(t: number): string {
  const v = Math.max(0, Math.min(1, t));
  let r: number, g: number, b: number;
  if (v < 0.5) {
    const s = v / 0.5;
    r = Math.round(220 - s * (220 - 160));
    g = Math.round(60  + s * (160 - 60));
    b = Math.round(60  + s * (160 - 60));
  } else {
    const s = (v - 0.5) / 0.5;
    r = Math.round(160 - s * (160 - 60));
    g = Math.round(160 + s * (220 - 160));
    b = Math.round(160 - s * (160 - 60));
  }
  return `rgb(${r},${g},${b})`;
}

function makeNormaliser(rows: Row[], key: NumericKey): (row: Row) => number {
  const vals = rows.map((r) => r[key] as number);
  const min = Math.min(...vals);
  const max = Math.max(...vals);
  if (max === min) return () => 0.5;
  return (row) => ((row[key] as number) - min) / (max - min);
}

// ── Types ─────────────────────────────────────────────────────────────────────

type SortDir = "asc" | "desc";

interface Row {
  teamNumber: number;
  nickname: string;
  autoOPR: number;
  autoCIHalf: number;
  teleopOPR: number;
  teleopCIHalf: number;
  totalOPR: number;
  avgBallsTransferred: number;
  avgBallsScored: number;
  canL1: boolean;
  canL2: boolean;
  canL3: boolean;
  climbSuccessRate: number;
  defenseRate: number;
  brickedRate: number;
  avgDriverRating: number;
}

type NumericKey = {
  [K in keyof Row]: Row[K] extends number ? K : never;
}[keyof Row];

type BoolKey = {
  [K in keyof Row]: Row[K] extends boolean ? K : never;
}[keyof Row];

type SortKey = NumericKey | BoolKey | "teamNumber" | "nickname";

// ── Weight config ─────────────────────────────────────────────────────────────

/**
 * Keys that are eligible for custom weighting.
 * Booleans are converted to 0/1 before weighting.
 */
type WeightKey =
  | "autoOPR"
  | "teleopOPR"
  | "totalOPR"
  | "avgBallsTransferred"
  | "avgBallsScored"
  | "canL1"
  | "canL2"
  | "canL3"
  | "climbSuccessRate"
  | "defenseRate"
  | "brickedRate"
  | "avgDriverRating";

const WEIGHT_LABELS: Record<WeightKey, string> = {
  autoOPR: "Auto OPR",
  teleopOPR: "Teleop OPR",
  totalOPR: "Total OPR",
  avgBallsTransferred: "Avg Transferred",
  avgBallsScored: "Avg Scored",
  canL1: "L1",
  canL2: "L2",
  canL3: "L3",
  climbSuccessRate: "Climb %",
  defenseRate: "Defense %",
  brickedRate: "Bricked %",
  avgDriverRating: "Driver Rating",
};

const WEIGHT_KEYS = Object.keys(WEIGHT_LABELS) as WeightKey[];

type Weights = Record<WeightKey, number>;

const ZERO_WEIGHTS: Weights = {
  autoOPR: 0,
  teleopOPR: 0,
  totalOPR: 0,
  avgBallsTransferred: 0,
  avgBallsScored: 0,
  canL1: 0,
  canL2: 0,
  canL3: 0,
  climbSuccessRate: 0,
  defenseRate: 0,
  brickedRate: 0,
  avgDriverRating: 0,
};

function rowNumericValue(row: Row, key: WeightKey): number {
  const v = row[key];
  if (typeof v === "boolean") return v ? 1 : 0;
  return v as number;
}

// ── Column definitions ────────────────────────────────────────────────────────

interface ColDef {
  key: SortKey;
  label: string;
  render: (row: Row, color?: string) => React.ReactNode;
  heatKey?: NumericKey;
  align?: "left" | "right" | "center";
}

const COLUMNS: ColDef[] = [
  {
    key: "teamNumber",
    label: "Team",
    align: "left",
    render: (r) => <span className="font-bold text-blue-400">{r.teamNumber}</span>,
  },
  {
    key: "nickname",
    label: "Name",
    align: "left",
    render: (r) => (
      <span className="text-gray-300 truncate max-w-[140px] block">{r.nickname}</span>
    ),
  },
  {
    key: "autoOPR",
    label: "Auto OPR",
    align: "right",
    heatKey: "autoOPR",
    render: (r, color) => (
      <span className="text-right block">
        <span className="font-mono" style={{ color }}>{r.autoOPR.toFixed(1)}</span>
        {r.autoCIHalf > 0 && (
          <span className="block text-xs text-gray-500 font-mono">±{r.autoCIHalf.toFixed(1)}</span>
        )}
      </span>
    ),
  },
  {
    key: "teleopOPR",
    label: "Teleop OPR",
    align: "right",
    heatKey: "teleopOPR",
    render: (r, color) => (
      <span className="text-right block">
        <span className="font-mono" style={{ color }}>{r.teleopOPR.toFixed(1)}</span>
        {r.teleopCIHalf > 0 && (
          <span className="block text-xs text-gray-500 font-mono">±{r.teleopCIHalf.toFixed(1)}</span>
        )}
      </span>
    ),
  },
  {
    key: "totalOPR",
    label: "Total OPR",
    align: "right",
    heatKey: "totalOPR",
    render: (r, color) => (
      <span className="font-mono font-semibold" style={{ color }}>{r.totalOPR.toFixed(1)}</span>
    ),
  },
  {
    key: "avgBallsTransferred",
    label: "Avg Transferred",
    align: "right",
    heatKey: "avgBallsTransferred",
    render: (r, color) => (
      <span className="font-mono" style={{ color }}>{r.avgBallsTransferred.toFixed(1)}</span>
    ),
  },
  {
    key: "avgBallsScored",
    label: "Avg Scored",
    align: "right",
    heatKey: "avgBallsScored",
    render: (r, color) => (
      <span className="font-mono" style={{ color }}>{r.avgBallsScored.toFixed(1)}</span>
    ),
  },
  {
    key: "canL1",
    label: "L1",
    align: "center",
    render: (r) => <BoolBadge value={r.canL1} />,
  },
  {
    key: "canL2",
    label: "L2",
    align: "center",
    render: (r) => <BoolBadge value={r.canL2} />,
  },
  {
    key: "canL3",
    label: "L3",
    align: "center",
    render: (r) => <BoolBadge value={r.canL3} />,
  },
  {
    key: "climbSuccessRate",
    label: "Climb %",
    align: "right",
    heatKey: "climbSuccessRate",
    render: (r, color) => (
      <span className="font-mono" style={{ color }}>
        {(r.climbSuccessRate * 100).toFixed(0)}%
      </span>
    ),
  },
  {
    key: "defenseRate",
    label: "Defense %",
    align: "right",
    heatKey: "defenseRate",
    render: (r, color) => (
      <span className="font-mono" style={{ color }}>
        {(r.defenseRate * 100).toFixed(0)}%
      </span>
    ),
  },
  {
    key: "brickedRate",
    label: "Bricked %",
    align: "right",
    heatKey: "brickedRate",
    render: (r, color) => (
      // Invert heat: lower bricked rate is better (green)
      <span className="font-mono" style={{ color }}>
        {(r.brickedRate * 100).toFixed(0)}%
      </span>
    ),
  },
  {
    key: "avgDriverRating",
    label: "Driver ★",
    align: "right",
    heatKey: "avgDriverRating",
    render: (r, color) => (
      <span className="font-mono" style={{ color }}>{r.avgDriverRating.toFixed(1)}</span>
    ),
  },
];

// ── Sub-components ────────────────────────────────────────────────────────────

function BoolBadge({ value }: { value: boolean }) {
  return value ? (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-green-900 text-green-400">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
      </svg>
    </span>
  ) : (
    <span className="inline-flex items-center justify-center w-5 h-5 rounded-full bg-gray-800 text-gray-600">
      <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" strokeWidth={3} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
      </svg>
    </span>
  );
}

interface WeightsPanelProps {
  weights: Weights;
  onChange: (key: WeightKey, value: number) => void;
  onReset: () => void;
  customActive: boolean;
}

function WeightsPanel({ weights, onChange, onReset, customActive }: WeightsPanelProps) {
  return (
    <div className={`mb-4 rounded-xl border p-4 transition-colors ${
      customActive
        ? "border-blue-700 bg-blue-950/30"
        : "border-gray-700 bg-gray-800/40"
    }`}>
      <div className="flex items-center justify-between mb-3">
        <span className={`text-xs font-semibold uppercase tracking-wider ${
          customActive ? "text-blue-400" : "text-gray-400"
        }`}>
          Custom Score Weights
          {customActive && (
            <span className="ml-2 text-blue-300 normal-case tracking-normal font-normal">
              — sorted by weighted score ↓
            </span>
          )}
        </span>
        <button
          onClick={onReset}
          className="text-xs text-gray-500 hover:text-gray-300 border border-gray-700 hover:border-gray-500 rounded px-2 py-0.5 transition cursor-pointer"
        >
          Reset
        </button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
        {WEIGHT_KEYS.map((key) => (
          <label key={key} className="flex flex-col gap-0.5">
            <span className="text-xs text-gray-400">{WEIGHT_LABELS[key]}</span>
            <input
              type="number"
              step="0.1"
              value={weights[key] === 0 ? "" : weights[key]}
              placeholder="0"
              onChange={(e) => {
                const v = e.target.value === "" ? 0 : parseFloat(e.target.value);
                onChange(key, isNaN(v) ? 0 : v);
              }}
              className={`w-full rounded-md px-2 py-1 text-sm font-mono bg-gray-900 border text-white placeholder-gray-600 focus:outline-none focus:ring-1 focus:ring-blue-500 transition ${
                weights[key] !== 0 ? "border-blue-600" : "border-gray-700"
              }`}
            />
          </label>
        ))}
      </div>
    </div>
  );
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir | null }) {
  if (!active || dir === null) {
    return (
      <svg className="w-3 h-3 opacity-30" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" d="M8 9l4-4 4 4M16 15l-4 4-4-4" />
      </svg>
    );
  }
  return dir === "asc" ? (
    <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 15.75l7.5-7.5 7.5 7.5" />
    </svg>
  ) : (
    <svg className="w-3 h-3 text-blue-400" fill="none" viewBox="0 0 24 24" strokeWidth={2.5} stroke="currentColor">
      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
    </svg>
  );
}

// ── Sort helpers ──────────────────────────────────────────────────────────────

function getValue(row: Row, key: SortKey): number {
  const v = row[key];
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return v;
  return 0;
}

function sortRows(rows: Row[], key: SortKey, dir: SortDir): Row[] {
  return [...rows].sort((a, b) => {
    const cmp =
      key === "nickname"
        ? a.nickname.localeCompare(b.nickname)
        : getValue(a, key) - getValue(b, key);
    return dir === "asc" ? cmp : -cmp;
  });
}

// ── Main component ────────────────────────────────────────────────────────────

interface OPRTableProps {
  oprResults: OPRResult[];
  metricsMap: Map<number, TeamMetrics>;
}

export default function OPRTable({ oprResults, metricsMap }: OPRTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>("teleopOPR");
  const [sortDir, setSortDir] = useState<SortDir>("desc");
  const [weights, setWeights] = useState<Weights>({ ...ZERO_WEIGHTS });

  const customActive = WEIGHT_KEYS.some((k) => weights[k] !== 0);

  const rows = useMemo<Row[]>(() => {
    return oprResults.map((opr) => {
      const m = metricsMap.get(opr.teamNumber);
      return {
        teamNumber: opr.teamNumber,
        nickname: opr.nickname,
        autoOPR: opr.autoOPR,
        autoCIHalf: opr.autoCIHalf,
        teleopOPR: opr.teleopOPR,
        teleopCIHalf: opr.teleopCIHalf,
        totalOPR: opr.totalOPR,
        avgBallsTransferred: m?.avgBallsTransferred ?? 0,
        avgBallsScored: m?.avgBallsScored ?? 0,
        canL1: m?.canL1 ?? false,
        canL2: m?.canL2 ?? false,
        canL3: m?.canL3 ?? false,
        climbSuccessRate: m?.climbSuccessRate ?? 0,
        defenseRate: m?.defenseRate ?? 0,
        brickedRate: m?.brickedRate ?? 0,
        avgDriverRating: m?.avgDriverRating ?? 0,
      };
    });
  }, [oprResults, metricsMap]);

  // Per-column heat normalisers (stable over all rows)
  const normalisers = useMemo(() => {
    const map = new Map<NumericKey, (row: Row) => number>();
    for (const col of COLUMNS) {
      if (col.heatKey) map.set(col.heatKey, makeNormaliser(rows, col.heatKey));
    }
    return map;
  }, [rows]);

  // Per-weight-key normalisers for the custom score
  const weightNormalisers = useMemo(() => {
    const map = new Map<WeightKey, (row: Row) => number>();
    for (const key of WEIGHT_KEYS) {
      // Treat booleans as a 0/1 numeric for normalisation purposes
      const vals = rows.map((r) => rowNumericValue(r, key));
      const min = Math.min(...vals);
      const max = Math.max(...vals);
      if (max === min) {
        map.set(key, () => 0.5);
      } else {
        map.set(key, (row) => (rowNumericValue(row, key) - min) / (max - min));
      }
    }
    return map;
  }, [rows]);

  // Custom score per row: weighted sum of normalised values
  const customScores = useMemo(() => {
    if (!customActive) return new Map<number, number>();
    const map = new Map<number, number>();
    for (const row of rows) {
      let score = 0;
      for (const key of WEIGHT_KEYS) {
        score += weights[key] * (weightNormalisers.get(key)!(row));
      }
      map.set(row.teamNumber, score);
    }
    return map;
  }, [rows, weights, weightNormalisers, customActive]);

  // Custom-score normaliser for heat colouring the score column
  const customScoreNorm = useMemo(() => {
    if (!customActive) return () => 0.5;
    const vals = [...customScores.values()];
    const min = Math.min(...vals);
    const max = Math.max(...vals);
    if (max === min) return () => 0.5;
    return (teamNumber: number) =>
      ((customScores.get(teamNumber) ?? 0) - min) / (max - min);
  }, [customScores, customActive]);

  const sorted = useMemo(() => {
    if (customActive) {
      return [...rows].sort(
        (a, b) => (customScores.get(b.teamNumber) ?? 0) - (customScores.get(a.teamNumber) ?? 0)
      );
    }
    return sortRows(rows, sortKey, sortDir);
  }, [rows, sortKey, sortDir, customActive, customScores]);

  function handleSort(key: SortKey) {
    // Clicking a column header clears the custom sort
    setWeights({ ...ZERO_WEIGHTS });
    if (key === sortKey) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDir(key === "nickname" ? "asc" : "desc");
    }
  }

  function handleWeightChange(key: WeightKey, value: number) {
    setWeights((prev) => ({ ...prev, [key]: value }));
  }

  if (oprResults.length === 0) {
    return <p className="text-sm text-gray-500">No match data available to compute OPR.</p>;
  }

  return (
    <div>
      <WeightsPanel
        weights={weights}
        onChange={handleWeightChange}
        onReset={() => setWeights({ ...ZERO_WEIGHTS })}
        customActive={customActive}
      />

      <div className="max-h-[400px] overflow-auto">
        <table className="w-full text-sm border-separate border-spacing-0">
          <thead className="sticky top-0 z-10 bg-gray-900">
            <tr className="text-xs text-gray-500 uppercase tracking-wider border-b border-gray-800">
              <th className="pb-2 pr-2 font-semibold text-left w-6 text-gray-600">#</th>
              {COLUMNS.map((col) => {
                const active = !customActive && sortKey === col.key;
                const alignClass =
                  col.align === "right"
                    ? "text-right"
                    : col.align === "center"
                    ? "text-center"
                    : "text-left";
                return (
                  <th key={col.key} className={`pb-2 pr-3 font-semibold ${alignClass} whitespace-nowrap`}>
                    <button
                      onClick={() => handleSort(col.key)}
                      className={`inline-flex items-center gap-1 cursor-pointer hover:text-gray-200 transition ${
                        active ? "text-white" : ""
                      } ${col.align === "right" ? "flex-row-reverse w-full justify-start" : ""}`}
                    >
                      {col.label}
                      <SortIcon active={active} dir={active ? sortDir : null} />
                    </button>
                  </th>
                );
              })}
              {/* Custom score column — only shown when weights are active */}
              {customActive && (
                <th className="pb-2 pl-2 font-semibold text-right whitespace-nowrap text-blue-400">
                  Score
                </th>
              )}
            </tr>
          </thead>
          <tbody>
            {sorted.map((row, i) => (
              <tr key={row.teamNumber} className="border-b border-gray-800/50 hover:bg-gray-800/40 transition">
                <td className="py-2 pr-2 text-gray-600 text-xs">{i + 1}</td>
                {COLUMNS.map((col) => {
                  const alignClass =
                    col.align === "right"
                      ? "text-right"
                      : col.align === "center"
                      ? "text-center"
                      : "text-left";
                  const color = col.heatKey
                    ? heatColor(normalisers.get(col.heatKey)!(row))
                    : undefined;
                  return (
                    <td key={col.key} className={`py-2 pr-3 ${alignClass}`}>
                      {col.render(row, color)}
                    </td>
                  );
                })}
                {customActive && (
                  <td className="py-2 pl-2 text-right font-mono font-semibold" style={{ color: heatColor(customScoreNorm(row.teamNumber)) }}>
                    {(customScores.get(row.teamNumber) ?? 0).toFixed(3)}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
