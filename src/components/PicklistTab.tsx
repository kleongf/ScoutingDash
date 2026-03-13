import { useState, useCallback } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
  arrayMove,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import type { TBATeam } from "../types/tba";
import { savePicklist } from "../services/firestore";

// ── Sortable row ──────────────────────────────────────────────────────────────

interface SortableTeamRowProps {
  team: TBATeam;
  rank: number;
}

function SortableTeamRow({ team, rank }: SortableTeamRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id: team.team_number });

  const style: React.CSSProperties = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <li
      ref={setNodeRef}
      style={style}
      className="flex items-center gap-3 px-3 py-2 rounded-lg bg-gray-800/70 border border-gray-700/60 select-none"
    >
      {/* Drag handle */}
      <span
        {...attributes}
        {...listeners}
        className="text-gray-500 hover:text-gray-300 cursor-grab active:cursor-grabbing shrink-0"
        aria-label="Drag to reorder"
      >
        ⠿
      </span>
      <span className="text-gray-500 text-xs w-6 text-right shrink-0">{rank}</span>
      <span className="text-blue-400 font-bold text-sm w-12 shrink-0">
        {team.team_number}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{team.nickname}</p>
        <p className="text-xs text-gray-500 truncate">
          {[team.city, team.state_prov].filter(Boolean).join(", ")}
        </p>
      </div>
    </li>
  );
}

// ── Static row (view mode) ────────────────────────────────────────────────────

interface StaticTeamRowProps {
  team: TBATeam;
  rank: number;
}

function StaticTeamRow({ team, rank }: StaticTeamRowProps) {
  return (
    <li className="flex items-center gap-3 px-3 py-2 rounded-lg hover:bg-gray-800/50 transition">
      <span className="text-gray-500 text-xs w-6 text-right shrink-0">{rank}</span>
      <span className="text-blue-400 font-bold text-sm w-12 shrink-0">
        {team.team_number}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-medium truncate">{team.nickname}</p>
        <p className="text-xs text-gray-500 truncate">
          {[team.city, team.state_prov].filter(Boolean).join(", ")}
        </p>
      </div>
    </li>
  );
}

// ── Main component ────────────────────────────────────────────────────────────

interface PicklistTabProps {
  teams: TBATeam[];
  eventKey: string;
}

type SaveState = "idle" | "saving" | "saved" | "error";

export default function PicklistTab({ teams, eventKey }: PicklistTabProps) {
  const [orderedTeams, setOrderedTeams] = useState<TBATeam[]>(() =>
    [...teams].sort((a, b) => a.team_number - b.team_number)
  );
  const [isEditing, setIsEditing] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>("idle");
  // Keep a snapshot to restore on cancel
  const [snapshot, setSnapshot] = useState<TBATeam[]>([]);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } })
  );

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;
      setOrderedTeams((prev) => {
        const oldIndex = prev.findIndex((t) => t.team_number === active.id);
        const newIndex = prev.findIndex((t) => t.team_number === over.id);
        return arrayMove(prev, oldIndex, newIndex);
      });
    },
    []
  );

  function handleEdit() {
    setSnapshot([...orderedTeams]);
    setIsEditing(true);
    setSaveState("idle");
  }

  function handleCancel() {
    setOrderedTeams(snapshot);
    setIsEditing(false);
    setSaveState("idle");
  }

  async function handleSave() {
    setSaveState("saving");
    try {
      await savePicklist(eventKey, orderedTeams.map((t) => t.team_number));
      setSaveState("saved");
      setIsEditing(false);
    } catch (err) {
      console.error("Failed to save picklist:", err);
      setSaveState("error");
    }
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-3">
        <p className="text-xs text-gray-500">
          {isEditing
            ? "Drag teams to reorder, then save."
            : "Your ranked list of teams."}
        </p>
        <div className="flex items-center gap-2">
          {saveState === "saved" && !isEditing && (
            <span className="text-xs text-green-400">✓ Saved</span>
          )}
          {saveState === "error" && (
            <span className="text-xs text-red-400">Save failed — try again</span>
          )}
          {isEditing ? (
            <>
              <button
                onClick={handleCancel}
                className="text-xs text-gray-400 hover:text-white border border-gray-700 hover:border-gray-500 rounded-lg px-3 py-1.5 transition cursor-pointer"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={saveState === "saving"}
                className="text-xs font-semibold bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg px-3 py-1.5 transition cursor-pointer"
              >
                {saveState === "saving" ? "Saving…" : "Save"}
              </button>
            </>
          ) : (
            <button
              onClick={handleEdit}
              className="text-xs font-semibold border border-blue-700 text-blue-400 hover:bg-blue-900/40 rounded-lg px-3 py-1.5 transition cursor-pointer"
            >
              Edit
            </button>
          )}
        </div>
      </div>

      {/* Team list */}
      <div className="max-h-[480px] overflow-y-auto pr-1">
        {isEditing ? (
          <DndContext
            sensors={sensors}
            collisionDetection={closestCenter}
            onDragEnd={handleDragEnd}
          >
            <SortableContext
              items={orderedTeams.map((t) => t.team_number)}
              strategy={verticalListSortingStrategy}
            >
              <ul className="space-y-1">
                {orderedTeams.map((team, idx) => (
                  <SortableTeamRow key={team.team_number} team={team} rank={idx + 1} />
                ))}
              </ul>
            </SortableContext>
          </DndContext>
        ) : (
          <ul className="space-y-1">
            {orderedTeams.map((team, idx) => (
              <StaticTeamRow key={team.team_number} team={team} rank={idx + 1} />
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
