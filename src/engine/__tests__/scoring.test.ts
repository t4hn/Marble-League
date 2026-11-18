import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialLeagueState, DEFAULT_LEAGUE_SEED} from '../roster';
import {
  calculateSeasonStandings,
  calculateStandardisedScore,
  CHAMPIONSHIP_POINTS_TABLE,
  scoreRaceEvent,
  selectTeamRepresentatives,
} from '../scoring';
import {commitRaceResultToLeague} from '../storage';

test('standardised score normalises 1st to 100, last to 0, and mean to 50 across 8, 16, 24, 32 fields', () => {
  for (const fieldSize of [8, 16, 24, 32]) {
    assert.equal(calculateStandardisedScore(1, fieldSize), 100);
    assert.equal(calculateStandardisedScore(fieldSize, fieldSize), 0);

    let sum = 0;
    for (let r = 1; r <= fieldSize; r++) {
      sum += calculateStandardisedScore(r, fieldSize);
    }
    const mean = sum / fieldSize;
    assert.ok(Math.abs(mean - 50) < 1e-3, `Mean for N=${fieldSize} was ${mean}`);
  }
});

test('team selection selects 1/2/4/3 marbles deterministically per discipline', () => {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const vipers = state.teams['team_velocity_vipers'];

  const sprint = selectTeamRepresentatives(vipers, state.marbles, 'Sprint');
  assert.equal(sprint.length, 1);
  assert.equal(sprint[0].id, 'marble_vex');

  const circuit = selectTeamRepresentatives(vipers, state.marbles, 'Circuit');
  assert.equal(circuit.length, 2);

  const classic = selectTeamRepresentatives(vipers, state.marbles, 'Classic Run');
  assert.equal(classic.length, 3);

  const obstacle = selectTeamRepresentatives(vipers, state.marbles, 'Obstacle');
  assert.equal(obstacle.length, 4);
});

test('scoreRaceEvent awards 15-12-10-8-6-4-2-1 across all disciplines and averages team scores in multi-marble events', () => {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);

  // Simulate an Obstacle race (4 marbles per team = 32 marbles)
  // Team 0 finishes 1st, 2nd, 31st, 32nd -> average rank 16.5 -> average std score 50.0
  // Team 1 finishes 15th, 16th, 17th, 18th -> average rank 16.5 -> tie broken by best individual finish (Team 0 has 1st!)
  const raw: Array<{
    marbleId: string;
    teamId: string;
    lane: number;
    finishTimeSeconds: number;
    topSpeedReached: number;
  }> = [];

  const t0 = state.teams[state.teamOrder[0]];
  const t1 = state.teams[state.teamOrder[1]];

  const positions = new Map<string, number>();
  positions.set(t0.marbleIds[0], 1);
  positions.set(t0.marbleIds[1], 2);
  positions.set(t0.marbleIds[2], 31);
  positions.set(t0.marbleIds[3], 32);

  positions.set(t1.marbleIds[0], 15);
  positions.set(t1.marbleIds[1], 16);
  positions.set(t1.marbleIds[2], 17);
  positions.set(t1.marbleIds[3], 18);

  const remainingSlots: number[] = [];
  for (let p = 3; p <= 30; p++) {
    if (p < 15 || p > 18) remainingSlots.push(p);
  }
  let slotIdx = 0;
  for (let ti = 2; ti < 8; ti++) {
    const team = state.teams[state.teamOrder[ti]];
    for (const mId of team.marbleIds) {
      positions.set(mId, remainingSlots[slotIdx++]);
    }
  }

  let lane = 1;
  for (const teamId of state.teamOrder) {
    for (const mId of state.teams[teamId].marbleIds) {
      const pos = positions.get(mId)!;
      raw.push({
        marbleId: mId,
        teamId,
        lane: lane++,
        finishTimeSeconds: 20 + pos * 0.1,
        topSpeedReached: 11.5,
      });
    }
  }

  const {teamScores} = scoreRaceEvent(raw, state.teamOrder);
  assert.deepEqual(
    teamScores.map((t) => t.championshipPoints),
    [...CHAMPIONSHIP_POINTS_TABLE],
  );

  const s0 = teamScores.find((t) => t.teamId === t0.id)!;
  const s1 = teamScores.find((t) => t.teamId === t1.id)!;
  assert.equal(s0.averageStandardisedScore, s1.averageStandardisedScore);
  assert.ok(s0.teamPosition < s1.teamPosition, 'Team with 1st place should win average-score tie-break');
});

test('championship standings apply tie-breakers (wins -> 2nds -> 3rds) and commitRaceResultToLeague updates career stats', () => {
  let state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const tA = state.teamOrder[0];
  const tB = state.teamOrder[1];

  // Round 1: tA wins (15), tB 4th (8) -> total 15 vs 8
  // Round 5: tB wins (15), tA 4th (8) -> total 23 vs 23 (both 1 win, 0 seconds, 0 thirds -> shared 1st)
  const makeRaw = (winnerId: string, fourthId: string, reverseOthers = false) => {
    const othersBase = state.teamOrder.filter((id) => id !== winnerId && id !== fourthId);
    const others = reverseOthers ? [...othersBase].reverse() : othersBase;
    const ordered = [winnerId, others[0], others[1], fourthId, others[2], others[3], others[4], others[5]];
    return ordered.map((teamId, idx) => ({
      marbleId: state.teams[teamId].marbleIds[0],
      teamId,
      lane: idx + 1,
      finishTimeSeconds: 8.0 + idx * 0.1,
      topSpeedReached: 12.1,
    }));
  };

  const r1Scored = scoreRaceEvent(makeRaw(tA, tB, false), state.teamOrder);
  state = commitRaceResultToLeague(state, {
    eventId: 's1_r1',
    seasonNumber: 1,
    roundNumber: 1,
    discipline: 'Sprint',
    venueId: 'venue_velocity_park',
    seed: 101,
    completedAtIso: '2026-01-01T00:00:00Z',
    fieldSize: 8,
    marbleResults: r1Scored.marbleResults,
    teamScores: r1Scored.teamScores,
    commentaryHighlights: [],
  });

  const r5Scored = scoreRaceEvent(makeRaw(tB, tA, true), state.teamOrder);
  state = commitRaceResultToLeague(state, {
    eventId: 's1_r5',
    seasonNumber: 1,
    roundNumber: 5,
    discipline: 'Sprint',
    venueId: 'venue_stratos_straight',
    seed: 105,
    completedAtIso: '2026-01-02T00:00:00Z',
    fieldSize: 8,
    marbleResults: r5Scored.marbleResults,
    teamScores: r5Scored.teamScores,
    commentaryHighlights: [],
  });

  const standings = calculateSeasonStandings(state.calendar, state.teamOrder);
  const rowA = standings.find((r) => r.teamId === tA)!;
  const rowB = standings.find((r) => r.teamId === tB)!;
  assert.equal(rowA.points, 23);
  assert.equal(rowB.points, 23);
  assert.equal(rowA.rank, 1);
  assert.equal(rowB.rank, 1);
  assert.equal(rowA.sharedRank, true);
  assert.equal(state.teams[tA].stats.eventWins, 1);
  assert.equal(state.marbles[state.teams[tA].marbleIds[0]].stats.appearances, 2);
  assert.equal(state.marbles[state.teams[tA].marbleIds[0]].stats.wins, 1);
});
