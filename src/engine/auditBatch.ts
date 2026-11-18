import os from 'node:os';
import {isMainThread, parentPort, Worker, workerData} from 'node:worker_threads';
import {createSeededRng} from './prng';
import {createInitialLeagueState, DEFAULT_LEAGUE_SEED} from './roster';
import {selectTeamRepresentatives} from './scoring';
import {
  FIXED_PHYSICS_DT,
  SprintCompetitorInput,
  SprintSimulation,
  SprintTelemetry,
} from './sprintSimulation';
import {Marble, SprintLayoutConfig, Team} from '../types/league';

interface MarbleAggregate {
  marbleId: string;
  name: string;
  teamCode: string;
  attributes: Marble['attributes'];
  races: number;
  wins: number;
  podiums: number;
  rankSum: number;
  timeSum: number;
  timeSqSum: number;
}

interface WorkerJob {
  mode: 'sprint-reps' | 'all-32-mixed';
  startIdx: number;
  endIdx: number;
}

interface SingleRaceSummary {
  venueId: string;
  elapsedSeconds: number;
  telemetry: SprintTelemetry;
  racers: Array<{
    marbleId: string;
    liveRank: number;
    finishTimeSeconds: number;
    topSpeedReached: number;
  }>;
}

function pearsonCorrelation(xs: number[], ys: number[]): number {
  const n = xs.length;
  if (n < 2) return 0;
  let sumX = 0;
  let sumY = 0;
  for (let i = 0; i < n; i++) {
    sumX += xs[i];
    sumY += ys[i];
  }
  const meanX = sumX / n;
  const meanY = sumY / n;
  let num = 0;
  let denX = 0;
  let denY = 0;
  for (let i = 0; i < n; i++) {
    const dx = xs[i] - meanX;
    const dy = ys[i] - meanY;
    num += dx * dy;
    denX += dx * dx;
    denY += dy * dy;
  }
  const den = Math.sqrt(denX * denY);
  return den > 1e-12 ? num / den : 0;
}

function runSingleInstrumentedRace(
  competitors: SprintCompetitorInput[],
  config: SprintLayoutConfig,
  seed: number,
  venueId: string,
): SingleRaceSummary {
  const sim = new SprintSimulation(competitors, config, seed);
  sim.startRace();

  let ticks = 0;
  const maxTicks = 120 * 30;
  while (!sim.isFinished() && ticks < maxTicks) {
    sim.step(FIXED_PHYSICS_DT);
    ticks++;
  }

  const snap = sim.getSnapshot();
  const telemetry = sim.getTelemetry();
  return {
    venueId,
    elapsedSeconds: snap.elapsedSeconds,
    telemetry,
    racers: snap.racers.map((r) => ({
      marbleId: r.marbleId,
      liveRank: r.liveRank,
      finishTimeSeconds: r.finishTimeSeconds ?? snap.elapsedSeconds,
      topSpeedReached: r.topSpeedReached,
    })),
  };
}

function buildCompetitorsForIndex(
  r: number,
  mode: 'sprint-reps' | 'all-32-mixed',
  state: ReturnType<typeof createInitialLeagueState>,
  sprintReps: SprintCompetitorInput[],
): {venueId: string; config: SprintLayoutConfig; seed: number; competitors: SprintCompetitorInput[]} {
  const venues = [state.venues['venue_velocity_park'], state.venues['venue_stratos_straight']];
  const venue = venues[r % venues.length];
  const seed = 100000 + r * 37;
  // Deterministic per-race RNG so parallel workers produce identical matchups to single-thread
  const matchRng = createSeededRng(seed ^ 0x9e3779b9);

  const laneOrder = [1, 2, 3, 4, 5, 6, 7, 8];
  for (let i = laneOrder.length - 1; i > 0; i--) {
    const j = Math.floor(matchRng() * (i + 1));
    [laneOrder[i], laneOrder[j]] = [laneOrder[j], laneOrder[i]];
  }

  const competitors: SprintCompetitorInput[] =
    mode === 'sprint-reps'
      ? sprintReps.map((c, idx) => ({...c, lane: laneOrder[idx]}))
      : state.teamOrder.map((teamId, idx) => {
          const team: Team = state.teams[teamId];
          const mId = team.marbleIds[Math.floor(matchRng() * team.marbleIds.length)];
          return {marble: state.marbles[mId], team, lane: laneOrder[idx]};
        });

  return {venueId: venue.id, config: venue.sprintConfig!, seed, competitors};
}

function executeWorkerChunk(job: WorkerJob): SingleRaceSummary[] {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);
  const sprintReps: SprintCompetitorInput[] = state.teamOrder.map((teamId, idx) => {
    const team = state.teams[teamId];
    const [rep] = selectTeamRepresentatives(team, state.marbles, 'Sprint');
    return {marble: rep, team, lane: idx + 1};
  });

  const results: SingleRaceSummary[] = [];
  for (let r = job.startIdx; r < job.endIdx; r++) {
    const {venueId, config, seed, competitors} = buildCompetitorsForIndex(
      r,
      job.mode,
      state,
      sprintReps,
    );
    results.push(runSingleInstrumentedRace(competitors, config, seed, venueId));
  }
  return results;
}

async function runBatchParallel(
  mode: 'sprint-reps' | 'all-32-mixed',
  raceCount: number,
): Promise<SingleRaceSummary[]> {
  const cpuCount = Math.max(1, Math.min(os.cpus().length, 4));
  if (raceCount < 24 || cpuCount === 1) {
    return executeWorkerChunk({mode, startIdx: 0, endIdx: raceCount});
  }

  const chunkSize = Math.ceil(raceCount / cpuCount);
  const promises: Array<Promise<SingleRaceSummary[]>> = [];

  for (let w = 0; w < cpuCount; w++) {
    const startIdx = w * chunkSize;
    const endIdx = Math.min(raceCount, startIdx + chunkSize);
    if (startIdx >= endIdx) break;

    promises.push(
      new Promise<SingleRaceSummary[]>((resolve, reject) => {
        const worker = new Worker(new URL(import.meta.url), {
          workerData: {mode, startIdx, endIdx} satisfies WorkerJob,
          execArgv: process.execArgv,
        });
        worker.on('message', (data: SingleRaceSummary[]) => resolve(data));
        worker.on('error', reject);
        worker.on('exit', (code) => {
          if (code !== 0) reject(new Error(`Worker exited with code ${code}`));
        });
      }),
    );
  }

  const chunks = await Promise.all(promises);
  return chunks.flat();
}

async function summarizeBatch(
  label: string,
  raceCount: number,
  mode: 'sprint-reps' | 'all-32-mixed',
) {
  const state = createInitialLeagueState(DEFAULT_LEAGUE_SEED);

  const aggs = new Map<string, MarbleAggregate>();
  for (const id of state.marbleOrder) {
    const m = state.marbles[id];
    const t = state.teams[m.teamId];
    aggs.set(id, {
      marbleId: id,
      name: m.name,
      teamCode: t.shortCode,
      attributes: m.attributes,
      races: 0,
      wins: 0,
      podiums: 0,
      rankSum: 0,
      timeSum: 0,
      timeSqSum: 0,
    });
  }

  const t0 = Date.now();
  const summaries = await runBatchParallel(mode, raceCount);
  const elapsedMs = Date.now() - t0;

  let totalContacts = 0;
  let totalSigContacts = 0;
  let totalImpactSpeed = 0;
  let maxImpactSpeed = 0;
  let totalWallContacts = 0;
  let totalOvertakes = 0;
  let totalLeadChanges = 0;
  let totalCollisionRankChanges = 0;
  let totalCloseSeconds = 0;
  let stuckCount = 0;
  let escapedCount = 0;
  let minTime = Infinity;
  let maxTime = 0;
  let maxSpeed = 0;

  const vpWinnerTimes: number[] = [];
  const ssWinnerTimes: number[] = [];

  const accList: number[] = [];
  const spdList: number[] = [];
  const hndList: number[] = [];
  const stbList: number[] = [];
  const rankList: number[] = [];

  for (const res of summaries) {
    const {telemetry} = res;
    totalContacts += telemetry.marbleCollisions;
    totalSigContacts += telemetry.significantCollisions;
    totalImpactSpeed += telemetry.avgCollisionImpactSpeed * telemetry.marbleCollisions;
    if (telemetry.maxCollisionImpactSpeed > maxImpactSpeed) {
      maxImpactSpeed = telemetry.maxCollisionImpactSpeed;
    }
    totalWallContacts += telemetry.wallContacts;
    totalOvertakes += telemetry.overtakes;
    totalLeadChanges += telemetry.leadChanges;
    totalCollisionRankChanges += telemetry.collisionLinkedPositionChanges;
    totalCloseSeconds += telemetry.closePackSeconds;
    stuckCount += telemetry.stuckCount;
    escapedCount += telemetry.escapedCount;

    for (const racer of res.racers) {
      const time = racer.finishTimeSeconds;
      if (time < minTime) minTime = time;
      if (time > maxTime) maxTime = time;
      if (racer.topSpeedReached > maxSpeed) maxSpeed = racer.topSpeedReached;
      if (racer.liveRank === 1) {
        if (res.venueId === 'venue_velocity_park') vpWinnerTimes.push(time);
        else ssWinnerTimes.push(time);
      }

      const agg = aggs.get(racer.marbleId)!;
      agg.races += 1;
      if (racer.liveRank === 1) agg.wins += 1;
      if (racer.liveRank <= 3) agg.podiums += 1;
      agg.rankSum += racer.liveRank;
      agg.timeSum += time;
      agg.timeSqSum += time * time;

      accList.push(agg.attributes.acceleration);
      spdList.push(agg.attributes.topSpeed);
      hndList.push(agg.attributes.handling);
      stbList.push(agg.attributes.stability);
      rankList.push(racer.liveRank);
    }
  }

  const avgImpact = totalContacts > 0 ? totalImpactSpeed / totalContacts : 0;
  const rows = Array.from(aggs.values())
    .filter((a) => a.races > 0)
    .sort((a, b) => a.rankSum / a.races - b.rankSum / b.races);

  const uniqueWinners = rows.filter((r) => r.wins > 0).length;
  const uniquePodiums = rows.filter((r) => r.podiums > 0).length;

  console.log(`\n================ ${label} (${raceCount} races in ${elapsedMs}ms) ================`);
  console.log(
    `Completion: stuck=${stuckCount}, escaped=${escapedCount}, timeRange=[${minTime.toFixed(3)}s, ${maxTime.toFixed(3)}s], peakSpeed=${maxSpeed.toFixed(2)} m/s`,
  );
  console.log(
    `Dynamics/race: marbleContacts=${(totalContacts / raceCount).toFixed(2)} (sig=${(totalSigContacts / raceCount).toFixed(2)}, avgImpact=${avgImpact.toFixed(2)} m/s, maxImpact=${maxImpactSpeed.toFixed(2)} m/s), wallContacts=${(totalWallContacts / raceCount).toFixed(2)}`,
  );
  console.log(
    `Racing/race: overtakes=${(totalOvertakes / raceCount).toFixed(2)}, leadChanges=${(totalLeadChanges / raceCount).toFixed(2)}, collisionLinkedRankShifts=${(totalCollisionRankChanges / raceCount).toFixed(2)}, avgClosePackTime=${(totalCloseSeconds / raceCount).toFixed(2)}s`,
  );
  console.log(
    `Diversity: uniqueWinners=${uniqueWinners}/${rows.length}, uniquePodiums=${uniquePodiums}/${rows.length}`,
  );
  console.log(
    `Rank Correlation (negative = better rank): ACC=${pearsonCorrelation(accList, rankList).toFixed(3)}, SPD=${pearsonCorrelation(spdList, rankList).toFixed(3)}, HND=${pearsonCorrelation(hndList, rankList).toFixed(3)}, STB=${pearsonCorrelation(stbList, rankList).toFixed(3)}`,
  );

  console.log(
    'Name       Team  ACC SPD HND STB | Races  Wins  Win%   Pod%  AvgPos  AvgTime  TimeSD',
  );
  for (const r of rows) {
    const avgPos = r.rankSum / r.races;
    const avgTime = r.timeSum / r.races;
    const variance = Math.max(0, r.timeSqSum / r.races - avgTime * avgTime);
    const sd = Math.sqrt(variance);
    console.log(
      `${r.name.padEnd(10)} ${r.teamCode.padEnd(5)} ${String(r.attributes.acceleration).padStart(3)} ${String(r.attributes.topSpeed).padStart(3)} ${String(r.attributes.handling).padStart(3)} ${String(r.attributes.stability).padStart(3)} | ${String(r.races).padStart(5)} ${String(r.wins).padStart(5)} ${((r.wins / r.races) * 100).toFixed(1).padStart(5)}% ${((r.podiums / r.races) * 100).toFixed(1).padStart(5)}% ${avgPos.toFixed(2).padStart(7)} ${avgTime.toFixed(3).padStart(8)} ${sd.toFixed(3).padStart(7)}`,
    );
  }
}

async function main() {
  if (!isMainThread) {
    const data = executeWorkerChunk(workerData as WorkerJob);
    parentPort?.postMessage(data);
    return;
  }

  const perBatch = Number(process.argv[2]) || 1000;
  await summarizeBatch('TUNED - SPRINT REPRESENTATIVES', perBatch, 'sprint-reps');
  await summarizeBatch('TUNED - ALL 32 MARBLES MIXED FIELD', perBatch, 'all-32-mixed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
