import { useEffect, useState } from "react";
import {
  loadPitScouting,
  EMPTY_PIT_DATA,
  type PitScoutingData,
  type ClimbLevel,
} from "../services/firestore";

interface PitScoutingTabProps {
  eventKey: string;
  teamNumber: number;
}

// ── Read-only field components ────────────────────────────────────────────────

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <p className="text-[10px] font-semibold text-gray-500 uppercase tracking-wider mb-1">
      {children}
    </p>
  );
}

function FieldValue({ children }: { children: React.ReactNode }) {
  return <p className="text-sm text-gray-200">{children}</p>;
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <FieldLabel>{label}</FieldLabel>
      <FieldValue>{children}</FieldValue>
    </div>
  );
}

function BoolBadge({ value, trueLabel = "Yes", falseLabel = "No" }: { value: boolean; trueLabel?: string; falseLabel?: string }) {
  return (
    <span
      className={`inline-block text-[11px] font-semibold px-2 py-0.5 rounded-full ${
        value
          ? "bg-blue-900/50 text-blue-300 border border-blue-700"
          : "bg-gray-800 text-gray-500 border border-gray-700"
      }`}
    >
      {value ? trueLabel : falseLabel}
    </span>
  );
}

function ClimbDisplay({ level, label }: { level: ClimbLevel; label: string }) {
  return (
    <div className="flex items-center gap-3">
      <BoolBadge value={level.capable} trueLabel="Capable" falseLabel="No" />
      <span className="text-xs text-gray-400 font-medium">{label}</span>
      {level.capable && level.timeSecs != null && (
        <span className="text-xs text-gray-300 ml-auto">{level.timeSecs}s</span>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-gray-800/50 rounded-xl border border-gray-700/60 p-4 space-y-3">
      <h3 className="text-xs font-semibold text-gray-400 uppercase tracking-wider">{title}</h3>
      {children}
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function PitScoutingTab({ eventKey, teamNumber }: PitScoutingTabProps) {
  const [data, setData] = useState<PitScoutingData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    setLoading(true);
    setError(false);
    setData(null);
    loadPitScouting(eventKey, teamNumber)
      .then((loaded) => {
        setData(loaded);
        setLoading(false);
      })
      .catch(() => {
        setError(true);
        setLoading(false);
      });
  }, [eventKey, teamNumber]);

  if (loading) {
    return (
      <div className="py-12 flex items-center justify-center text-gray-500 text-sm">
        Loading pit scouting data…
      </div>
    );
  }

  if (error) {
    return (
      <div className="py-12 flex items-center justify-center text-red-400 text-sm">
        Failed to load pit scouting data.
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-900 rounded-2xl border border-gray-800 p-10 text-center">
        <p className="text-gray-500 text-sm">No pit scouting data recorded for this team yet.</p>
        <p className="text-gray-600 text-xs mt-1">Data is written to this team's document by the scouting app.</p>
      </div>
    );
  }

  const d = data ?? EMPTY_PIT_DATA;
  const fmt = (v: number | null, unit: string) =>
    v != null ? `${v} ${unit}` : "—";

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
      {/* Left column */}
      <div className="space-y-4">
        <Section title="Physical Specs">
          <div className="grid grid-cols-3 gap-3">
            <Field label="Weight">{fmt(d.weightLbs, "lbs")}</Field>
            <Field label="Height">{fmt(d.heightIn, "in")}</Field>
            <Field label="Width">{fmt(d.widthIn, "in")}</Field>
          </div>
          <Field label="Drivetrain">{d.drivetrain || "—"}</Field>
          <Field label="Fuel Capacity">{fmt(d.fuelCapacity, "balls")}</Field>
        </Section>

        <Section title="Shooting">
          <Field label="Shooting Area">{d.shootingArea || "—"}</Field>
        </Section>
      </div>

      {/* Right column */}
      <div className="space-y-4">
        <Section title="Climbing">
          <div className="space-y-2">
            <ClimbDisplay level={d.climbL1} label="L1" />
            <ClimbDisplay level={d.climbL2} label="L2" />
            <ClimbDisplay level={d.climbL3} label="L3" />
          </div>
          <div className="pt-1">
            <Field label="Scale Ramp">
              <BoolBadge value={d.canScaleRamp} trueLabel="Capable" falseLabel="No" />
            </Field>
          </div>
        </Section>

        <Section title="Notes">
          {d.notes ? (
            <p className="text-sm text-gray-300 leading-relaxed whitespace-pre-wrap">{d.notes}</p>
          ) : (
            <p className="text-sm text-gray-600 italic">No notes recorded.</p>
          )}
        </Section>
      </div>
    </div>
  );
}


interface PitScoutingTabProps {
  eventKey: string;
  teamNumber: number;
}
