import test from 'node:test';
import assert from 'node:assert/strict';
import {createInitialLeagueState, DEFAULT_LEAGUE_SEED} from '../roster';

test('approved roster contains exactly 8 teams and 32 marbles with permanent IDs', () => {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  assert.equal(state.teamOrder.length, 8);
  assert.equal(Object.keys(state.teams).length, 8);
  assert.equal(state.marbleOrder.length, 32);
  assert.equal(Object.keys(state.marbles).length, 32);

  for (const teamId of state.teamOrder) {
    const team = state.teams[teamId];
    assert.equal(team.marbleIds.length, 4, `${team.name} should have 4 marbles`);
    for (const mId of team.marbleIds) {
      assert.equal(state.marbles[mId].teamId, teamId);
    }
  }
});

test('attribute balancing pass produces reproducible bell-curve attributes and balanced team averages', () => {
  const s1 = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const s2 = createInitialLeagueState(DEFAULT_LEAGUE_SEED);

  for (const mId of s1.marbleOrder) {
    assert.deepEqual(s1.marbles[mId].attributes, s2.marbles[mId].attributes);
    const a = s1.marbles[mId].attributes;
    for (const val of [a.acceleration, a.topSpeed, a.handling, a.stability]) {
      assert.ok(val >= 52 && val <= 92, `${mId} attribute ${val} outside [52,92]`);
    }
  }

  for (const teamId of s1.teamOrder) {
    const team = s1.teams[teamId];
    const sum = team.marbleIds.reduce((acc, mId) => {
      const a = s1.marbles[mId].attributes;
      return acc + a.acceleration + a.topSpeed + a.handling + a.stability;
    }, 0);
    const avg = sum / 16;
    assert.ok(avg >= 68 && avg <= 73, `${team.name} average ${avg.toFixed(2)} should sit near 70`);
  }
});

test('fixed 8-round calendar matches League Bible §4 order', () => {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  assert.equal(state.calendar.length, 8);
  assert.deepEqual(
    state.calendar.map((r) => r.discipline),
    ['Sprint', 'Circuit', 'Obstacle', 'Classic Run', 'Sprint', 'Circuit', 'Obstacle', 'Classic Run'],
  );
  assert.deepEqual(
    state.calendar.map((r) => r.marblesPerTeam),
    [1, 2, 4, 3, 1, 2, 4, 3],
  );
});
