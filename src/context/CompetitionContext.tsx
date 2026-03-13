import { createContext, useContext, useState } from "react";
import type { ReactNode } from "react";
import type { Competition } from "../types/tba";

const STORAGE_KEY = "scouting_competition";

function loadFromStorage(): Competition | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as Competition) : null;
  } catch {
    return null;
  }
}

interface CompetitionContextValue {
  competition: Competition | null;
  setCompetition: (c: Competition | null) => void;
}

const CompetitionContext = createContext<CompetitionContextValue | null>(null);

export function CompetitionProvider({ children }: { children: ReactNode }) {
  const [competition, setCompetitionState] = useState<Competition | null>(
    loadFromStorage
  );

  const setCompetition = (c: Competition | null) => {
    setCompetitionState(c);
    if (c) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(c));
    } else {
      localStorage.removeItem(STORAGE_KEY);
    }
  };

  return (
    <CompetitionContext.Provider value={{ competition, setCompetition }}>
      {children}
    </CompetitionContext.Provider>
  );
}

export function useCompetition(): CompetitionContextValue {
  const ctx = useContext(CompetitionContext);
  if (!ctx) {
    throw new Error("useCompetition must be used within a CompetitionProvider");
  }
  return ctx;
}
