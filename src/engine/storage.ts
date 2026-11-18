import {
  LeagueState,
  RaceEventResult,
  SeasonArchive,
} from '../types/league';
import {
  createInitialLeagueState,
  createSeasonCalendar,
  DEFAULT_LEAGUE_SEED,
} from './roster';
import {
  calculateSeasonStandings,
  deriveMarbleReputations,
} from './scoring';

const STORAGE_KEY = 'marble_league_persistent_state_v1';

export function loadLeagueState(): LeagueState {
  if (typeof window === 'undefined') {
    return createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  }
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      const initial = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
      saveLeagueState(initial);
      return initial;
    }
    const parsed = JSON.parse(raw) as LeagueState;
    if (
      !parsed ||
      typeof parsed !== 'object' ||
      !parsed.teams ||
      !parsed.marbles ||
      !parsed.calendar
    ) {
      return createInitialLeagueState(DEFAULT_LEAGUE_SEED);
    }
    return parsed;
  } catch {
    return createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  }
}

export function saveLeagueState(state: LeagueState): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function resetLeagueState(seed: number = DEFAULT_LEAGUE_SEED): LeagueState {
  const fresh = createInitialLeagueState(seed);
  saveLeagueState(fresh);
  return fresh;
}

/**
 * Commits an officially completed race result into the LeagueState:
 * - Stores result on the matching calendar round
 * - Updates team career statistics
 * - Updates individual marble career & discipline statistics + reputations
 * - Updates venue track records & historical event log
 * - Automatically archives completed 8-round seasons if all 8 rounds are done
 */
export function commitRaceResultToLeague(
  prevState: LeagueState,
  result: RaceEventResult,
): LeagueState {
  const next: LeagueState = JSON.parse(JSON.stringify(prevState)) as LeagueState;

  const roundIndex = next.calendar.findIndex((r) => r.roundNumber === result.roundNumber);
  if (roundIndex === -1) return prevState;

  const existingRound = next.calendar[roundIndex];
  if (existingRound.status === 'completed') {
    // Prevent double-counting stats if re-viewing or re-saving an already scored round
    return prevState;
  }

  next.calendar[roundIndex] = {
    ...existingRound,
    status: 'completed',
    result,
  };

  // Update Team career statistics
  for (const ts of result.teamScores) {
    const team = next.teams[ts.teamId];
    if (!team) continue;
    team.stats.eventsCompeted += 1;
    team.stats.totalChampionshipPoints = Number(
      (team.stats.totalChampionshipPoints + ts.championshipPoints).toFixed(2),
    );
    if (ts.teamPosition === 1) team.stats.eventWins += 1;
    if (ts.teamPosition === 2) team.stats.eventSeconds += 1;
    if (ts.teamPosition === 3) team.stats.eventThirds += 1;
    if (ts.teamPosition <= 3) team.stats.podiums += 1;
  }

  // Update Marble career & discipline statistics + reputations
  for (const entry of result.marbleResults) {
    const marble = next.marbles[entry.marbleId];
    if (!marble) continue;

    marble.stats.appearances += 1;
    marble.stats.totalFinishPosition += entry.finishPosition;
    if (entry.finishPosition === 1) marble.stats.wins += 1;
    if (entry.finishPosition <= 3) marble.stats.podiums += 1;
    if (
      marble.stats.bestFinish === null ||
      entry.finishPosition < marble.stats.bestFinish
    ) {
      marble.stats.bestFinish = entry.finishPosition;
    }
    if (
      marble.stats.personalBestTimeSeconds === null ||
      entry.finishTimeSeconds < marble.stats.personalBestTimeSeconds
    ) {
      marble.stats.personalBestTimeSeconds = entry.finishTimeSeconds;
    }

    const disc = marble.stats.byDiscipline[result.discipline];
    if (disc) {
      disc.appearances += 1;
      disc.totalFinishPosition += entry.finishPosition;
      if (entry.finishPosition === 1) disc.wins += 1;
      if (entry.finishPosition <= 3) disc.podiums += 1;
      if (disc.bestFinish === null || entry.finishPosition < disc.bestFinish) {
        disc.bestFinish = entry.finishPosition;
      }
      if (
        disc.bestTimeSeconds === null ||
        entry.finishTimeSeconds < disc.bestTimeSeconds
      ) {
        disc.bestTimeSeconds = entry.finishTimeSeconds;
      }
    }

    if (entry.finishPosition === 1) {
      const venueName = next.venues[result.venueId]?.name ?? result.venueId;
      marble.stats.achievements.unshift(
        `S${result.seasonNumber} R${result.roundNumber} ${result.discipline} Winner (${venueName}, ${entry.finishTimeSeconds.toFixed(3)}s)`,
      );
    }

    marble.reputations = deriveMarbleReputations(marble);
  }

  // Update Venue record & event archive
  const venue = next.venues[result.venueId];
  const winner = result.marbleResults[0];
  if (venue) {
    venue.historicalEventIds.push(result.eventId);
    if (
      winner &&
      (!venue.trackRecord ||
        winner.finishTimeSeconds < venue.trackRecord.fastestTimeSeconds)
    ) {
      venue.trackRecord = {
        fastestTimeSeconds: winner.finishTimeSeconds,
        marbleId: winner.marbleId,
        teamId: winner.teamId,
        seasonNumber: result.seasonNumber,
        roundNumber: result.roundNumber,
      };
      const winnerName = next.marbles[winner.marbleId]?.name ?? winner.marbleId;
      venue.notableIncidents.unshift(
        `S${result.seasonNumber} R${result.roundNumber}: ${winnerName} set a new track record of ${winner.finishTimeSeconds.toFixed(3)}s.`,
      );
    }
  }

  // Check if all 8 rounds in current season are completed
  if (next.calendar.every((r) => r.status === 'completed')) {
    const finalStandings = calculateSeasonStandings(next.calendar, next.teamOrder);
    const topRankRows = finalStandings.filter((r) => r.rank === 1);
    const championIds = topRankRows.map((r) => r.teamId);
    for (const cid of championIds) {
      if (next.teams[cid]) {
        next.teams[cid].stats.championshipsWon += 1;
      }
    }
    const archive: SeasonArchive = {
      seasonNumber: next.currentSeasonNumber,
      championTeamId: championIds[0],
      tiedChampionTeamIds: championIds,
      finalStandings,
      rounds: next.calendar,
      completedAtIso: new Date().toISOString(),
    };
    next.seasonHistory.push(archive);
  }

  saveLeagueState(next);
  return next;
}

export function startNextSeason(prevState: LeagueState): LeagueState {
  const next: LeagueState = JSON.parse(JSON.stringify(prevState)) as LeagueState;
  next.currentSeasonNumber += 1;
  next.calendar = createSeasonCalendar();
  saveLeagueState(next);
  return next;
}

export function renameTeamDisplayName(
  prevState: LeagueState,
  teamId: string,
  newName: string,
): LeagueState {
  const trimmed = newName.trim();
  if (!trimmed || !prevState.teams[teamId]) return prevState;
  const next: LeagueState = {
    ...prevState,
    teams: {
      ...prevState.teams,
      [teamId]: {
        ...prevState.teams[teamId],
        name: trimmed,
      },
    },
  };
  saveLeagueState(next);
  return next;
}

export function renameMarbleDisplayName(
  prevState: LeagueState,
  marbleId: string,
  newName: string,
): LeagueState {
  const trimmed = newName.trim();
  if (!trimmed || !prevState.marbles[marbleId]) return prevState;
  const next: LeagueState = {
    ...prevState,
    marbles: {
      ...prevState.marbles,
      [marbleId]: {
        ...prevState.marbles[marbleId],
        name: trimmed,
      },
    },
  };
  saveLeagueState(next);
  return next;
}
