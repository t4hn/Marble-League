export type Discipline = 'Sprint' | 'Circuit' | 'Obstacle' | 'Classic Run';

export type ReputationTag =
  | 'The Speedster'
  | 'The Survivor'
  | 'The Closer'
  | 'The Underdog'
  | 'The Wrecking Ball'
  | 'The Choker'
  | 'The Consistent One';

export interface MarbleAttributes {
  acceleration: number; // 1-100: launch & speed recovery
  topSpeed: number; // 1-100: velocity ceiling
  handling: number; // 1-100: cornering & lane tracking control
  stability: number; // 1-100: resistance to collision & surface disruption
}

export interface DisciplineRecord {
  appearances: number;
  wins: number;
  podiums: number;
  bestFinish: number | null;
  bestTimeSeconds: number | null;
  totalFinishPosition: number;
}

export interface MarbleStats {
  appearances: number;
  wins: number;
  podiums: number;
  totalFinishPosition: number;
  bestFinish: number | null;
  personalBestTimeSeconds: number | null;
  byDiscipline: Record<Discipline, DisciplineRecord>;
  achievements: string[];
}

export interface Marble {
  id: string; // Permanent immutable ID
  name: string; // Editable display name
  teamId: string; // Permanent team ID
  attributes: MarbleAttributes;
  stats: MarbleStats;
  reputations: ReputationTag[];
  visualSeed: number;
}

export interface TeamStats {
  eventsCompeted: number;
  eventWins: number;
  eventSeconds: number;
  eventThirds: number;
  podiums: number;
  totalChampionshipPoints: number;
  championshipsWon: number;
}

export interface Team {
  id: string; // Permanent immutable ID
  name: string; // Editable display name
  shortCode: string; // 3-letter broadcast code (e.g. VLV)
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  identity: string;
  emblemType:
    | 'viper'
    | 'meteor'
    | 'ram'
    | 'storm'
    | 'comet'
    | 'turtle'
    | 'grizzly'
    | 'antics';
  marbleIds: string[];
  stats: TeamStats;
}

export interface SprintLayoutConfig {
  trackLengthMeters: number;
  rampLengthMeters: number;
  rampSlopeDegrees: number;
  mainSlopeDegrees: number;
  laneWidthMeters: number;
  surfaceRoughness: number; // 0..1 surface chatter intensity
  seamCount: number;
}

export interface VenueRecord {
  fastestTimeSeconds: number;
  marbleId: string;
  teamId: string;
  seasonNumber: number;
  roundNumber: number;
}

export interface Venue {
  id: string; // Permanent immutable ID
  name: string; // Editable display name
  discipline: Discipline;
  theme: 'daylight-arena' | 'twilight-floodlit' | 'coastal-bowl' | 'alpine-ridge';
  characteristics: string;
  sprintConfig?: SprintLayoutConfig;
  trackRecord: VenueRecord | null;
  historicalEventIds: string[];
  notableIncidents: string[];
}

export interface MarbleRaceEntry {
  marbleId: string;
  teamId: string;
  lane: number; // 1-based starting lane
  finishPosition: number; // 1-based position (fractional if exact tie)
  finishTimeSeconds: number;
  topSpeedReached: number; // m/s
  standardisedScore: number; // 0-100 Stage 1 score
  gapToLeaderSeconds: number;
}

export interface TeamEventScore {
  teamId: string;
  teamPosition: number; // 1-8
  averageStandardisedScore: number;
  championshipPoints: number; // 15, 12, 10, 8, 6, 4, 2, 1
  marbleResults: MarbleRaceEntry[];
}

export interface RaceEventResult {
  eventId: string;
  seasonNumber: number;
  roundNumber: number;
  discipline: Discipline;
  venueId: string;
  seed: number;
  completedAtIso: string;
  fieldSize: number;
  marbleResults: MarbleRaceEntry[];
  teamScores: TeamEventScore[];
  commentaryHighlights: string[];
}

export interface CalendarRound {
  roundNumber: number; // 1-8
  discipline: Discipline;
  venueId: string;
  marblesPerTeam: number;
  playableInCurrentMilestone: boolean;
  status: 'scheduled' | 'completed';
  result: RaceEventResult | null;
}

export interface TeamStandingRow {
  rank: number;
  sharedRank: boolean;
  teamId: string;
  points: number;
  eventWins: number;
  eventSeconds: number;
  eventThirds: number;
  podiums: number;
  eventsCompleted: number;
  averageEventRank: number | null;
}

export interface SeasonArchive {
  seasonNumber: number;
  championTeamId: string;
  tiedChampionTeamIds: string[];
  finalStandings: TeamStandingRow[];
  rounds: CalendarRound[];
  completedAtIso: string;
}

export interface LeagueState {
  version: number;
  leagueSeed: number;
  currentSeasonNumber: number;
  teams: Record<string, Team>;
  teamOrder: string[];
  marbles: Record<string, Marble>;
  marbleOrder: string[];
  venues: Record<string, Venue>;
  calendar: CalendarRound[];
  seasonHistory: SeasonArchive[];
}
