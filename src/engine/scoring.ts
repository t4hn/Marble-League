import {
  CalendarRound,
  Discipline,
  Marble,
  MarbleRaceEntry,
  ReputationTag,
  Team,
  TeamEventScore,
  TeamStandingRow,
} from '../types/league';

export const CHAMPIONSHIP_POINTS_TABLE = [15, 12, 10, 8, 6, 4, 2, 1] as const;

export const MARBLES_PER_TEAM_BY_DISCIPLINE: Record<Discipline, number> = {
  Sprint: 1,
  Circuit: 2,
  Obstacle: 4,
  'Classic Run': 3,
};

/**
 * Transparent, deterministic automatic team selection per League Bible §10.
 * - Sprint (1): acceleration * 0.45 + topSpeed * 0.55
 * - Circuit (2): topSpeed * 0.45 + handling * 0.45 + stability * 0.10
 * - Obstacle (4): all 4 marbles
 * - Classic Run (3): balanced overall average across all 4 attributes
 * Deterministic tie-breaker: higher acceleration, then marble ID alphabetical order.
 */
export function selectTeamRepresentatives(
  team: Team,
  allMarbles: Record<string, Marble>,
  discipline: Discipline,
): Marble[] {
  const roster = team.marbleIds.map((id) => allMarbles[id]).filter(Boolean);
  const count = MARBLES_PER_TEAM_BY_DISCIPLINE[discipline];

  const scoreForDiscipline = (m: Marble): number => {
    const a = m.attributes;
    switch (discipline) {
      case 'Sprint':
        return a.acceleration * 0.45 + a.topSpeed * 0.55;
      case 'Circuit':
        return a.topSpeed * 0.45 + a.handling * 0.45 + a.stability * 0.1;
      case 'Classic Run':
        return (a.acceleration + a.topSpeed + a.handling + a.stability) / 4;
      case 'Obstacle':
        return a.stability * 0.4 + a.handling * 0.3 + a.acceleration * 0.15 + a.topSpeed * 0.15;
    }
  };

  const sorted = [...roster].sort((a, b) => {
    const diff = scoreForDiscipline(b) - scoreForDiscipline(a);
    if (Math.abs(diff) > 1e-6) return diff;
    if (b.attributes.acceleration !== a.attributes.acceleration) {
      return b.attributes.acceleration - a.attributes.acceleration;
    }
    return a.id.localeCompare(b.id);
  });

  return sorted.slice(0, count);
}

/**
 * Stage 1 Normalisation Formula:
 *   S(rank, fieldSize) = 100 * (fieldSize - rank) / (fieldSize - 1)
 *
 * Properties validated across N = 8, 16, 24, 32:
 * - 1st place always earns 100.00 regardless of field size.
 * - Last place (N) always earns 0.00 regardless of field size.
 * - Field mean is always 50.00.
 * - Supports fractional average ranks when individual finishes tie.
 */
export function calculateStandardisedScore(finishPosition: number, fieldSize: number): number {
  if (fieldSize <= 1) return 100;
  const clamped = Math.max(1, Math.min(fieldSize, finishPosition));
  return Number((((fieldSize - clamped) / (fieldSize - 1)) * 100).toFixed(4));
}

export interface RawFinishRecord {
  marbleId: string;
  teamId: string;
  lane: number;
  finishTimeSeconds: number;
  topSpeedReached: number;
}

/**
 * Evaluates raw finish times into individual entries (handling exact photo-finish ties)
 * and computes normalised Stage 1 team performance and Stage 2 Championship points.
 */
export function scoreRaceEvent(
  rawFinishers: RawFinishRecord[],
  teamOrder: string[],
): {
  marbleResults: MarbleRaceEntry[];
  teamScores: TeamEventScore[];
} {
  const fieldSize = rawFinishers.length;
  const sorted = [...rawFinishers].sort((a, b) => {
    const timeDiff = a.finishTimeSeconds - b.finishTimeSeconds;
    if (Math.abs(timeDiff) > 1e-6) return timeDiff;
    return a.lane - b.lane;
  });

  const leaderTime = sorted[0]?.finishTimeSeconds ?? 0;

  // Group ties within 0.0005s (half-millisecond) for average rank assignment
  const marbleResults: MarbleRaceEntry[] = [];
  let idx = 0;
  while (idx < sorted.length) {
    let end = idx;
    while (
      end + 1 < sorted.length &&
      Math.abs(sorted[end + 1].finishTimeSeconds - sorted[idx].finishTimeSeconds) <= 0.0005
    ) {
      end++;
    }
    const firstRank = idx + 1;
    const lastRank = end + 1;
    const avgRank = (firstRank + lastRank) / 2;
    const stdScore = calculateStandardisedScore(avgRank, fieldSize);

    for (let k = idx; k <= end; k++) {
      const entry = sorted[k];
      marbleResults.push({
        marbleId: entry.marbleId,
        teamId: entry.teamId,
        lane: entry.lane,
        finishPosition: avgRank,
        finishTimeSeconds: Number(entry.finishTimeSeconds.toFixed(3)),
        topSpeedReached: Number(entry.topSpeedReached.toFixed(2)),
        standardisedScore: stdScore,
        gapToLeaderSeconds: Number((entry.finishTimeSeconds - leaderTime).toFixed(3)),
      });
    }
    idx = end + 1;
  }

  // Group by team and average standardised scores
  const teamEntriesMap = new Map<string, MarbleRaceEntry[]>();
  for (const teamId of teamOrder) {
    teamEntriesMap.set(teamId, []);
  }
  for (const entry of marbleResults) {
    const list = teamEntriesMap.get(entry.teamId) ?? [];
    list.push(entry);
    teamEntriesMap.set(entry.teamId, list);
  }

  interface TeamAggregate {
    teamId: string;
    avgScore: number;
    sortedPositions: number[];
    entries: MarbleRaceEntry[];
  }

  const aggregates: TeamAggregate[] = Array.from(teamEntriesMap.entries()).map(
    ([teamId, entries]) => {
      const avgScore =
        entries.length > 0
          ? entries.reduce((sum, e) => sum + e.standardisedScore, 0) / entries.length
          : 0;
      const sortedPositions = entries.map((e) => e.finishPosition).sort((a, b) => a - b);
      return {
        teamId,
        avgScore: Number(avgScore.toFixed(4)),
        sortedPositions,
        entries,
      };
    },
  );

  // Rank teams: highest average standardised score, then lowest best individual rank, etc.
  const compareTeams = (a: TeamAggregate, b: TeamAggregate): number => {
    const diff = b.avgScore - a.avgScore;
    if (Math.abs(diff) > 1e-6) return diff;
    const maxLen = Math.max(a.sortedPositions.length, b.sortedPositions.length);
    for (let i = 0; i < maxLen; i++) {
      const pa = a.sortedPositions[i] ?? Number.POSITIVE_INFINITY;
      const pb = b.sortedPositions[i] ?? Number.POSITIVE_INFINITY;
      if (Math.abs(pa - pb) > 1e-6) return pa - pb;
    }
    return 0;
  };

  aggregates.sort((a, b) => {
    const cmp = compareTeams(a, b);
    if (cmp !== 0) return cmp;
    return a.teamId.localeCompare(b.teamId);
  });

  // Assign Championship points, splitting evenly if two teams remain completely tied
  const teamScores: TeamEventScore[] = [];
  let tIdx = 0;
  while (tIdx < aggregates.length) {
    let tEnd = tIdx;
    while (
      tEnd + 1 < aggregates.length &&
      compareTeams(aggregates[tIdx], aggregates[tEnd + 1]) === 0
    ) {
      tEnd++;
    }

    let pointsSum = 0;
    for (let pos = tIdx; pos <= tEnd; pos++) {
      pointsSum += CHAMPIONSHIP_POINTS_TABLE[pos] ?? 0;
    }
    const splitPoints = Number((pointsSum / (tEnd - tIdx + 1)).toFixed(2));
    const teamPosition = tIdx + 1;

    for (let k = tIdx; k <= tEnd; k++) {
      const agg = aggregates[k];
      teamScores.push({
        teamId: agg.teamId,
        teamPosition,
        averageStandardisedScore: agg.avgScore,
        championshipPoints: splitPoints,
        marbleResults: agg.entries,
      });
    }

    tIdx = tEnd + 1;
  }

  return {marbleResults, teamScores};
}

/**
 * Computes current season Championship Standings with League Bible §4 tie-breakers:
 * 1. Total Championship points
 * 2. Most event victories (1st)
 * 3. Most 2nd-place event finishes
 * 4. Most 3rd-place event finishes
 * 5. Shared ranking if still level
 */
export function calculateSeasonStandings(
  calendar: CalendarRound[],
  teamOrder: string[],
): TeamStandingRow[] {
  const accum = new Map<
    string,
    {
      points: number;
      wins: number;
      seconds: number;
      thirds: number;
      podiums: number;
      events: number;
      rankSum: number;
    }
  >();

  for (const teamId of teamOrder) {
    accum.set(teamId, {
      points: 0,
      wins: 0,
      seconds: 0,
      thirds: 0,
      podiums: 0,
      events: 0,
      rankSum: 0,
    });
  }

  for (const round of calendar) {
    if (round.status !== 'completed' || !round.result) continue;
    for (const ts of round.result.teamScores) {
      const rec = accum.get(ts.teamId);
      if (!rec) continue;
      rec.points += ts.championshipPoints;
      rec.events += 1;
      rec.rankSum += ts.teamPosition;
      if (ts.teamPosition === 1) rec.wins += 1;
      if (ts.teamPosition === 2) rec.seconds += 1;
      if (ts.teamPosition === 3) rec.thirds += 1;
      if (ts.teamPosition <= 3) rec.podiums += 1;
    }
  }

  const rows = teamOrder.map((teamId) => {
    const rec = accum.get(teamId)!;
    return {
      teamId,
      points: Number(rec.points.toFixed(2)),
      eventWins: rec.wins,
      eventSeconds: rec.seconds,
      eventThirds: rec.thirds,
      podiums: rec.podiums,
      eventsCompleted: rec.events,
      averageEventRank: rec.events > 0 ? Number((rec.rankSum / rec.events).toFixed(2)) : null,
    };
  });

  const compareStandings = (a: (typeof rows)[number], b: (typeof rows)[number]): number => {
    if (Math.abs(b.points - a.points) > 1e-6) return b.points - a.points;
    if (b.eventWins !== a.eventWins) return b.eventWins - a.eventWins;
    if (b.eventSeconds !== a.eventSeconds) return b.eventSeconds - a.eventSeconds;
    if (b.eventThirds !== a.eventThirds) return b.eventThirds - a.eventThirds;
    return 0;
  };

  rows.sort((a, b) => {
    const cmp = compareStandings(a, b);
    if (cmp !== 0) return cmp;
    return a.teamId.localeCompare(b.teamId);
  });

  const result: TeamStandingRow[] = [];
  let i = 0;
  while (i < rows.length) {
    let end = i;
    while (end + 1 < rows.length && compareStandings(rows[i], rows[end + 1]) === 0) {
      end++;
    }
    const isShared = end > i;
    const rank = i + 1;
    for (let k = i; k <= end; k++) {
      result.push({
        rank,
        sharedRank: isShared,
        ...rows[k],
      });
    }
    i = end + 1;
  }

  return result;
}

/**
 * Derives emergent sporting reputation tags strictly from recorded career stats
 * (never scripted buffs or arbitrary classes).
 */
export function deriveMarbleReputations(marble: Marble): ReputationTag[] {
  const s = marble.stats;
  if (s.appearances < 1) return [];

  const tags: ReputationTag[] = [];
  const avgFinish = s.totalFinishPosition / s.appearances;

  if (s.wins >= 1 && marble.attributes.topSpeed >= 82) {
    tags.push('The Speedster');
  }
  if (s.appearances >= 2 && s.podiums / s.appearances >= 0.5) {
    tags.push('The Consistent One');
  }
  if (
    s.wins >= 1 &&
    (marble.attributes.acceleration + marble.attributes.topSpeed) / 2 < 72
  ) {
    tags.push('The Underdog');
  }
  if (s.appearances >= 2 && avgFinish <= 3.5 && marble.attributes.stability >= 82) {
    tags.push('The Survivor');
  }

  return tags;
}
