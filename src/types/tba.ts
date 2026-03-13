export interface TBATeam {
  key: string;           // e.g. "frc254"
  team_number: number;   // e.g. 254
  nickname: string;
  name: string;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  rookie_year: number | null;
}

export interface TBAAlliance {
  score: number;
  team_keys: string[];
  surrogate_team_keys: string[];
  dq_team_keys: string[];
}

export interface TBAMatch {
  key: string;           // e.g. "2024casd_qm1"
  comp_level: "qm" | "ef" | "qf" | "sf" | "f";
  match_number: number;
  set_number: number;
  event_key: string;
  time: number | null;
  actual_time: number | null;
  alliances: {
    red: TBAAlliance;
    blue: TBAAlliance;
  };
}

export interface TBAEvent {
  key: string;
  name: string;
  short_name: string | null;
  event_type: number;
  city: string | null;
  state_prov: string | null;
  country: string | null;
  start_date: string;
  end_date: string;
  year: number;
}

export interface Competition {
  event: TBAEvent;
  teams: TBATeam[];
  matches: TBAMatch[];
}
