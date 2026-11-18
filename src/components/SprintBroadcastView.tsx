import React from 'react';
import {
  Play,
  Pause,
  RotateCcw,
  Volume2,
  VolumeX,
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Camera,
  Flag,
} from 'lucide-react';
import {
  CalendarRound,
  LeagueState,
  MarbleRaceEntry,
  RaceEventResult,
  TeamEventScore,
} from '../types/league';
import {
  FIXED_PHYSICS_DT,
  LiveMarbleState,
  SprintCompetitorInput,
  SprintSimulation,
} from '../engine/sprintSimulation';
import {scoreRaceEvent, selectTeamRepresentatives} from '../engine/scoring';
import {buildCommentaryForEvent, CommentaryLine} from '../engine/commentary';
import {CameraViewMode, SprintTrackScene} from '../render/SprintTrackScene';
import {RaceAudioEngine} from '../audio/raceAudio';
import {MarbleAvatar, TeamEmblem} from './MarbleAvatar';

interface SprintBroadcastViewProps {
  league: LeagueState;
  round: CalendarRound;
  onCommitResult: (result: RaceEventResult) => void;
  onExit: (goToSection?: 'hub' | 'standings') => void;
}

type RacePhase = 'grid' | 'countdown' | 'racing' | 'paused' | 'results';

export const SprintBroadcastView: React.FC<SprintBroadcastViewProps> = ({
  league,
  round,
  onCommitResult,
  onExit,
}) => {
  const venue = league.venues[round.venueId];
  const config = venue.sprintConfig!;

  const competitors: SprintCompetitorInput[] = React.useMemo(() => {
    return league.teamOrder.map((teamId, idx) => {
      const team = league.teams[teamId];
      const [rep] = selectTeamRepresentatives(team, league.marbles, 'Sprint');
      return {marble: rep, team, lane: idx + 1};
    });
  }, [league.marbles, league.teamOrder, league.teams]);

  // Seed defaults to existing completed result seed if re-watching, else deterministic round seed
  const defaultSeed = round.result?.seed ?? league.leagueSeed + round.roundNumber * 137;
  const [raceSeed, setRaceSeed] = React.useState<number>(defaultSeed);
  const [phase, setPhase] = React.useState<RacePhase>('grid');
  const [countdownLabel, setCountdownLabel] = React.useState<string>('');
  const [simSpeed, setSimSpeed] = React.useState<number>(1);
  const [cameraMode, setCameraMode] = React.useState<CameraViewMode>('broadcast');
  const [muted, setMuted] = React.useState<boolean>(false);
  const [hudHidden, setHudHidden] = React.useState<boolean>(false);
  const [dockCollapsed, setDockCollapsed] = React.useState<boolean>(false);

  const [elapsedSeconds, setElapsedSeconds] = React.useState<number>(0);
  const [liveRacers, setLiveRacers] = React.useState<LiveMarbleState[]>([]);
  const [commentary, setCommentary] = React.useState<CommentaryLine[]>([]);
  const [officialResult, setOfficialResult] = React.useState<{
    marbleResults: MarbleRaceEntry[];
    teamScores: TeamEventScore[];
    seed: number;
  } | null>(null);

  const canvasMountRef = React.useRef<HTMLDivElement | null>(null);
  const sceneRef = React.useRef<SprintTrackScene | null>(null);
  const simRef = React.useRef<SprintSimulation | null>(null);
  const audioRef = React.useRef<RaceAudioEngine | null>(null);

  const phaseRef = React.useRef<RacePhase>(phase);
  const simSpeedRef = React.useRef<number>(simSpeed);
  const raceSeedRef = React.useRef<number>(raceSeed);
  const onCommitRef = React.useRef(onCommitResult);
  const committedThisRunRef = React.useRef<boolean>(false);

  phaseRef.current = phase;
  simSpeedRef.current = simSpeed;
  raceSeedRef.current = raceSeed;
  onCommitRef.current = onCommitResult;

  // Sync body state attribute for inspection/testability
  React.useEffect(() => {
    const mapped =
      phase === 'paused'
        ? 'paused'
        : phase === 'results'
          ? 'gameover'
          : phase === 'racing' || phase === 'countdown'
            ? 'playing'
            : 'title';
    document.body.dataset.state = mapped;
  }, [phase]);

  const prevSnapRef = React.useRef<ReturnType<SprintSimulation['getSnapshot']> | null>(null);
  const currSnapRef = React.useRef<ReturnType<SprintSimulation['getSnapshot']> | null>(null);

  const initializeSimulation = React.useCallback(
    (seed: number) => {
      const sim = new SprintSimulation(competitors, config, seed);
      simRef.current = sim;
      committedThisRunRef.current = false;
      const snap = sim.getSnapshot();
      prevSnapRef.current = snap;
      currSnapRef.current = snap;
      setLiveRacers(snap.racers);
      setElapsedSeconds(0);
      setCommentary([]);
      setOfficialResult(null);
      sceneRef.current?.setGateLampState('ready');
      sceneRef.current?.syncFromSimulation(snap.racers, 0, 0.1);
      sceneRef.current?.renderFrame();
    },
    [competitors, config],
  );

  // Mount WebGL scene once and run decoupled physics + render loop
  React.useEffect(() => {
    const mount = canvasMountRef.current;
    if (!mount) return;

    const scene = new SprintTrackScene(mount, venue, competitors);
    sceneRef.current = scene;
    const audio = new RaceAudioEngine();
    audioRef.current = audio;

    initializeSimulation(raceSeedRef.current);

    let lastNow = performance.now();
    let accumulator = 0;
    let lastHudSync = 0;
    let disposed = false;

    const tick = () => {
      if (disposed) return;
      const now = performance.now();
      const rawDt = (now - lastNow) / 1000;
      lastNow = now;
      const dt = Math.min(Math.max(rawDt, 0.001), 0.05);

      const sim = simRef.current;
      const currentPhase = phaseRef.current;

      if (sim && currentPhase === 'racing') {
        const scaledDt = dt * simSpeedRef.current;
        accumulator += scaledDt;

        // Cap physics work per frame to keep main thread responsive
        let substeps = 0;
        const maxSubsteps = Math.max(8, Math.ceil(simSpeedRef.current * 8));
        const collectedCommentary: CommentaryLine[] = [];

        while (accumulator >= FIXED_PHYSICS_DT && substeps < maxSubsteps && !sim.isFinished()) {
          prevSnapRef.current = currSnapRef.current;
          const events = sim.step(FIXED_PHYSICS_DT);
          currSnapRef.current = sim.getSnapshot();
          accumulator -= FIXED_PHYSICS_DT;
          substeps++;

          for (const evt of events) {
            if (evt.type === 'MARBLE_FINISH' && evt.position && evt.position <= 3) {
              audio.playFinishChime(evt.position);
            }
            const line = buildCommentaryForEvent(
              evt,
              league.marbles,
              league.teams,
              venue.name,
            );
            if (line) {
              collectedCommentary.push(line);
            }
          }
        }

        // Prevent runaway accumulator backlog on severe tab stalls
        if (substeps >= maxSubsteps && accumulator > FIXED_PHYSICS_DT) {
          accumulator = FIXED_PHYSICS_DT * 0.5;
        }

        if (collectedCommentary.length > 0) {
          setCommentary((prev) => [...prev, ...collectedCommentary].slice(-8));
        }

        const snap = currSnapRef.current ?? sim.getSnapshot();
        const alpha = sim.isFinished() ? 1 : accumulator / FIXED_PHYSICS_DT;
        scene.syncFromSimulation(
          snap.racers,
          snap.gateOpenProgress,
          dt,
          prevSnapRef.current?.racers,
          alpha,
        );

        const activeRacers = snap.racers.filter((r) => !r.finished);
        const avgSpeed =
          activeRacers.length > 0
            ? activeRacers.reduce((s, r) => s + r.speed, 0) / activeRacers.length
            : 0;
        audio.updateRollingBed(activeRacers.length > 0, avgSpeed);

        // Throttle React HUD updates (~12Hz) so WebGL render stays decoupled
        if (now - lastHudSync > 80 || sim.isFinished()) {
          lastHudSync = now;
          setElapsedSeconds(snap.elapsedSeconds);
          setLiveRacers(snap.racers);
        }

        if (sim.isFinished() && !committedThisRunRef.current) {
          committedThisRunRef.current = true;
          audio.updateRollingBed(false, 0);

          const rawFinishers = snap.racers.map((r) => ({
            marbleId: r.marbleId,
            teamId: r.teamId,
            lane: r.lane,
            finishTimeSeconds: r.finishTimeSeconds ?? snap.elapsedSeconds,
            topSpeedReached: r.topSpeedReached,
          }));
          const scored = scoreRaceEvent(rawFinishers, league.teamOrder);
          const resultPayload: RaceEventResult = {
            eventId: `s${league.currentSeasonNumber}_r${round.roundNumber}_${sim.seed}`,
            seasonNumber: league.currentSeasonNumber,
            roundNumber: round.roundNumber,
            discipline: 'Sprint',
            venueId: venue.id,
            seed: sim.seed,
            completedAtIso: new Date().toISOString(),
            fieldSize: 8,
            marbleResults: scored.marbleResults,
            teamScores: scored.teamScores,
            commentaryHighlights: collectedCommentary.map((c) => c.text),
          };

          setOfficialResult({
            marbleResults: scored.marbleResults,
            teamScores: scored.teamScores,
            seed: sim.seed,
          });
          setPhase('results');
          onCommitRef.current(resultPayload);
        }
      } else if (sim) {
        accumulator = 0;
        const snap = sim.getSnapshot();
        currSnapRef.current = snap;
        prevSnapRef.current = snap;
        scene.syncFromSimulation(snap.racers, snap.gateOpenProgress, dt);
        audio.updateRollingBed(false, 0);
      }

      scene.renderFrame();
      scene.scheduleNextFrame(tick);
    };

    scene.scheduleNextFrame(tick);

    return () => {
      disposed = true;
      audio.dispose();
      scene.dispose();
      sceneRef.current = null;
      audioRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [venue.id, round.roundNumber]);

  const startCountdownAndLaunch = React.useCallback(() => {
    const activeEl = document.activeElement as HTMLElement | null;
    activeEl?.blur();

    initializeSimulation(raceSeedRef.current);
    setPhase('countdown');
    setCountdownLabel('SET');
    sceneRef.current?.setGateLampState('countdown1');
    audioRef.current?.playStartTone(false);

    window.setTimeout(() => {
      if (phaseRef.current !== 'countdown') return;
      setCountdownLabel('READY');
      sceneRef.current?.setGateLampState('countdown2');
      audioRef.current?.playStartTone(false);
    }, 450);

    window.setTimeout(() => {
      if (phaseRef.current !== 'countdown') return;
      setCountdownLabel('GO');
      sceneRef.current?.setGateLampState('go');
      audioRef.current?.playStartTone(true);
      simRef.current?.startRace();
      setPhase('racing');
      window.setTimeout(() => setCountdownLabel(''), 550);
    }, 900);
  }, [initializeSimulation]);

  const handleTogglePause = React.useCallback(() => {
    setPhase((p) => {
      if (p === 'racing') return 'paused';
      if (p === 'paused') return 'racing';
      return p;
    });
  }, []);

  const handleRerunSameSeed = React.useCallback(() => {
    startCountdownAndLaunch();
  }, [startCountdownAndLaunch]);

  const handleCameraChange = (mode: CameraViewMode) => {
    setCameraMode(mode);
    sceneRef.current?.setCameraMode(mode);
  };

  const handleToggleMute = () => {
    const next = !muted;
    setMuted(next);
    audioRef.current?.setMuted(next);
  };

  // Keyboard shortcuts
  React.useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLSelectElement) {
        return;
      }
      if (e.key === ' ' || e.key === 'Enter') {
        if (phaseRef.current === 'grid') {
          e.preventDefault();
          startCountdownAndLaunch();
        } else if (e.key === ' ' && (phaseRef.current === 'racing' || phaseRef.current === 'paused')) {
          e.preventDefault();
          handleTogglePause();
        }
      } else if (e.key === 'p' || e.key === 'P' || e.key === 'Escape') {
        if (phaseRef.current === 'racing' || phaseRef.current === 'paused') {
          e.preventDefault();
          handleTogglePause();
        }
      } else if (e.key === 'h' || e.key === 'H') {
        setHudHidden((v) => !v);
      } else if (e.key === 'm' || e.key === 'M') {
        setMuted((prev) => {
          audioRef.current?.setMuted(!prev);
          return !prev;
        });
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [handleTogglePause, startCountdownAndLaunch]);

  const orderedLiveRacers = React.useMemo(
    () => [...liveRacers].sort((a, b) => a.liveRank - b.liveRank),
    [liveRacers],
  );
  const leaderDistance = orderedLiveRacers[0]?.progressMeters ?? 0;

  return (
    <div className="fixed inset-0 bg-[#0b0e14] overflow-hidden select-none">
      {/* Isolated WebGL Mount */}
      <div ref={canvasMountRef} className="absolute inset-0" />

      {/* Pointer-transparent HUD Overlay Container (active during race phases) */}
      {(phase === 'countdown' || phase === 'racing' || phase === 'paused') && (
        <div className="fixed inset-0 pointer-events-none flex flex-col justify-between p-4 sm:p-5">
          {/* Top Broadcast Bar */}
          {!hudHidden && (
            <div className="flex items-start justify-between gap-4">
              {/* Top-Left Live Leaderboard */}
              <div
                className="w-60 sm:w-64 rounded-lg border border-white/15 p-3 pointer-events-auto"
                style={{backgroundColor: 'rgba(11, 14, 20, 0.88)'}}
              >
                <div className="flex items-center justify-between text-[11px] font-semibold uppercase tracking-wider text-slate-400 pb-2 mb-2 border-b border-white/10">
                  <span>Live Order</span>
                  <span className="font-mono tabular-nums text-[#e5a93c]">
                    {elapsedSeconds.toFixed(2)}s
                  </span>
                </div>
                <div className="space-y-1">
                  {orderedLiveRacers.map((r) => (
                    <div
                      key={r.marbleId}
                      className="flex items-center justify-between text-xs py-0.5"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-4 font-mono tabular-nums text-slate-400">
                          {r.liveRank}
                        </span>
                        <span
                          className="w-2.5 h-2.5 rounded-full shrink-0"
                          style={{backgroundColor: r.primaryColor}}
                        />
                        <span className="font-medium text-white truncate">{r.name}</span>
                        <span className="font-mono text-[10px] text-slate-400">
                          {r.shortCode}
                        </span>
                      </div>
                      <span className="font-mono text-[11px] tabular-nums text-slate-300 shrink-0">
                        {r.finished && r.finishTimeSeconds !== null
                          ? `${r.finishTimeSeconds.toFixed(2)}s`
                          : r.liveRank === 1
                            ? `${Math.round(r.progressMeters)}m`
                            : `+${r.gapToLeaderSeconds.toFixed(2)}s`}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Top-Center Venue & Race Progress Strip */}
              <div
                className="hidden md:flex flex-col items-center px-5 py-2.5 rounded-lg border border-white/15"
                style={{backgroundColor: 'rgba(11, 14, 20, 0.88)'}}
              >
                <div className="text-[11px] uppercase tracking-wider text-slate-400">
                  Round {round.roundNumber} · {venue.name} · Sprint
                </div>
                <div className="flex items-center gap-4 mt-1">
                  <span className="font-display text-2xl font-bold text-white tabular-nums leading-none">
                    {elapsedSeconds.toFixed(3)}s
                  </span>
                  <div className="w-36 h-1.5 bg-white/10 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-[#e5a93c]"
                      style={{
                        width: `${Math.min(100, (leaderDistance / config.trackLengthMeters) * 100)}%`,
                      }}
                    />
                  </div>
                  <span className="font-mono text-xs text-slate-300 tabular-nums">
                    {Math.round(leaderDistance)} / {config.trackLengthMeters}m
                  </span>
                </div>
              </div>

              {/* Top-Right Exit Button */}
              <div className="flex items-center gap-2 pointer-events-auto">
                <button
                  type="button"
                  onClick={() => onExit('hub')}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg border border-white/15 text-xs font-semibold text-white hover:bg-white/10 transition-colors cursor-pointer"
                  style={{backgroundColor: 'rgba(11, 14, 20, 0.88)'}}
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Exit Broadcast
                </button>
              </div>
            </div>
          )}

          {/* Center Countdown Indicator */}
          {countdownLabel && (
            <div className="fixed inset-0 flex items-center justify-center pointer-events-none">
              <div
                className="px-10 py-5 rounded-xl border border-white/20 font-display text-6xl font-extrabold tracking-wider text-[#e5a93c]"
                style={{backgroundColor: 'rgba(11, 14, 20, 0.9)'}}
              >
                {countdownLabel}
              </div>
            </div>
          )}

          {/* Bottom Commentary + Collapsible Spectator Dock */}
          <div className="flex flex-col items-center gap-3">
            {!hudHidden && commentary.length > 0 && (
              <div
                className="w-full max-w-2xl rounded-lg border border-white/15 px-4 py-2.5 space-y-1"
                style={{backgroundColor: 'rgba(11, 14, 20, 0.88)'}}
              >
                {commentary.slice(-2).map((line) => (
                  <div key={line.id} className="flex items-baseline gap-2.5 text-xs">
                    <span className="font-mono text-[11px] text-[#e5a93c] tabular-nums shrink-0">
                      {line.elapsedSeconds.toFixed(2)}s
                    </span>
                    <span
                      className={
                        line.emphasis === 'finish'
                          ? 'text-white font-semibold'
                          : line.emphasis === 'highlight'
                            ? 'text-slate-100 font-medium'
                            : 'text-slate-300'
                      }
                    >
                      {line.text}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {/* Collapsible Bottom Control Dock */}
            <div className="pointer-events-auto flex flex-col items-center">
              <button
                type="button"
                onClick={() => setDockCollapsed((v) => !v)}
                aria-label={dockCollapsed ? 'Show race controls' : 'Collapse race controls'}
                className="inline-flex items-center gap-1.5 px-3 py-1 rounded-t-md border border-b-0 border-white/15 text-[11px] font-medium text-slate-300 hover:text-white cursor-pointer"
                style={{backgroundColor: 'rgba(11, 14, 20, 0.92)'}}
              >
                {dockCollapsed ? (
                  <>
                    <ChevronUp className="w-3.5 h-3.5" />
                    Controls
                  </>
                ) : (
                  <>
                    <ChevronDown className="w-3.5 h-3.5" />
                    Hide Dock
                  </>
                )}
              </button>

              {!dockCollapsed && (
                <div
                  className="flex flex-wrap items-center justify-center gap-2 sm:gap-3 px-4 py-2.5 rounded-xl border border-white/15"
                  style={{backgroundColor: 'rgba(11, 14, 20, 0.92)'}}
                >
                  <button
                    type="button"
                    onClick={handleTogglePause}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-[#e5a93c] text-[#0b0e14] text-xs font-semibold hover:bg-[#f0b954] cursor-pointer whitespace-nowrap"
                  >
                    {phase === 'paused' ? (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Resume
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5 fill-current" />
                        Pause
                      </>
                    )}
                  </button>

                  <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                    {[0.5, 1, 2, 4].map((spd) => (
                      <button
                        key={spd}
                        type="button"
                        onClick={() => setSimSpeed(spd)}
                        className={`px-2 py-1 rounded text-xs font-mono tabular-nums cursor-pointer ${
                          simSpeed === spd
                            ? 'bg-white text-[#0b0e14] font-semibold'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {spd}x
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                    <Camera className="w-3.5 h-3.5 text-slate-400 mr-1 hidden sm:inline" />
                    {(
                      [
                        ['broadcast', 'Follow'],
                        ['overhead', 'Overhead'],
                        ['finish', 'Finish'],
                        ['gate', 'Gate'],
                      ] as const
                    ).map(([id, label]) => (
                      <button
                        key={id}
                        type="button"
                        onClick={() => handleCameraChange(id)}
                        className={`px-2 py-1 rounded text-xs cursor-pointer whitespace-nowrap ${
                          cameraMode === id
                            ? 'bg-white/20 text-white font-semibold'
                            : 'text-slate-300 hover:bg-white/10'
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <div className="flex items-center gap-1 border-l border-white/10 pl-2">
                    <button
                      type="button"
                      aria-label="Restart race with same seed"
                      onClick={handleRerunSameSeed}
                      className="p-1.5 rounded text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      aria-label={muted ? 'Unmute audio' : 'Mute audio'}
                      onClick={handleToggleMute}
                      className="p-1.5 rounded text-slate-300 hover:bg-white/10 hover:text-white cursor-pointer"
                    >
                      {muted ? <VolumeX className="w-4 h-4" /> : <Volume2 className="w-4 h-4" />}
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Pre-Race Starting Grid Overlay */}
      {phase === 'grid' && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-auto">
          <div
            className="w-full max-w-3xl rounded-xl border border-white/15 p-6 sm:p-7 space-y-5"
            style={{backgroundColor: 'rgba(11, 14, 20, 0.94)'}}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="text-xs font-medium text-slate-400">
                  Season {league.currentSeasonNumber} · Round {round.roundNumber} · {venue.name}
                </div>
                <h1 className="font-display text-3xl sm:text-4xl font-bold text-white mt-1">
                  Sprint Starting Grid
                </h1>
                <p className="text-xs text-slate-400 mt-1">{venue.characteristics}</p>
              </div>

              <div className="flex items-center gap-2">
                <label htmlFor="race-seed-input" className="text-xs text-slate-400">
                  Simulation Seed
                </label>
                <input
                  id="race-seed-input"
                  type="number"
                  value={raceSeed}
                  onChange={(e) => {
                    const next = Number(e.target.value) || 1;
                    setRaceSeed(next);
                    initializeSimulation(next);
                  }}
                  className="w-24 px-2.5 py-1.5 rounded bg-[#121722] border border-white/20 text-xs font-mono tabular-nums text-white"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {competitors.map(({marble, team, lane}) => (
                <div
                  key={marble.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-[#121722] border border-white/10"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <span className="w-6 text-xs font-mono text-slate-400 tabular-nums">
                      L{lane}
                    </span>
                    <MarbleAvatar
                      primaryColor={team.primaryColor}
                      secondaryColor={team.secondaryColor}
                      accentColor={team.accentColor}
                      size={28}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {marble.name}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{team.name}</div>
                    </div>
                  </div>
                  <div className="font-mono text-[11px] tabular-nums text-slate-300 shrink-0">
                    ACC {marble.attributes.acceleration} · SPD {marble.attributes.topSpeed}
                  </div>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
              <span className="text-xs text-slate-400">
                Space / Enter Start · P Pause · H Hide HUD · M Mute
              </span>
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={() => onExit('hub')}
                  className="px-4 py-2.5 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
                >
                  Back to Hub
                </button>
                <button
                  type="button"
                  data-start="true"
                  onClick={startCountdownAndLaunch}
                  className="inline-flex items-center gap-2 px-6 py-2.5 rounded-lg bg-[#e5a93c] text-[#0b0e14] text-sm font-bold hover:bg-[#f0b954] cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Drop Starting Gate
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Post-Race Official Classification & Scoring Modal */}
      {phase === 'results' && officialResult && (
        <div className="fixed inset-0 z-20 flex items-center justify-center p-4 pointer-events-auto">
          <div
            className="w-full max-w-3xl rounded-xl border border-white/15 p-6 sm:p-7 space-y-5 max-h-[90vh] overflow-y-auto"
            style={{backgroundColor: 'rgba(11, 14, 20, 0.95)'}}
          >
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <div className="inline-flex items-center gap-2 text-xs text-[#e5a93c] font-semibold">
                  <Flag className="w-3.5 h-3.5" />
                  Official Classification · Round {round.roundNumber} Sprint
                </div>
                <h2 className="font-display text-3xl font-bold text-white mt-1">
                  {league.teams[officialResult.teamScores[0].teamId]?.name} Wins at {venue.name}
                </h2>
                <div className="text-xs text-slate-400 mt-0.5 font-mono tabular-nums">
                  Seed: {officialResult.seed} · Distance: {config.trackLengthMeters}m
                </div>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left text-xs border-collapse">
                <thead>
                  <tr className="border-b border-white/15 text-slate-400 uppercase">
                    <th className="py-2 pr-2 font-medium">Pos</th>
                    <th className="py-2 px-2 font-medium">Competitor</th>
                    <th className="py-2 px-2 font-medium">Team</th>
                    <th className="py-2 px-2 font-medium text-right">Time</th>
                    <th className="py-2 px-2 font-medium text-right">Gap</th>
                    <th className="py-2 px-2 font-medium text-right">Peak m/s</th>
                    <th className="py-2 px-2 font-medium text-right">Std Score</th>
                    <th className="py-2 pl-2 font-medium text-right">Pts</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-white/8">
                  {officialResult.marbleResults.map((mr) => {
                    const marble = league.marbles[mr.marbleId];
                    const team = league.teams[mr.teamId];
                    const ts = officialResult.teamScores.find((x) => x.teamId === mr.teamId);
                    return (
                      <tr key={mr.marbleId}>
                        <td className="py-2.5 pr-2 font-mono font-bold text-white tabular-nums">
                          {mr.finishPosition}
                        </td>
                        <td className="py-2.5 px-2 font-semibold text-white">
                          {marble?.name}
                        </td>
                        <td className="py-2.5 px-2">
                          <div className="flex items-center gap-2 text-slate-300">
                            {team && <TeamEmblem team={team} size={18} />}
                            <span>{team?.name}</span>
                          </div>
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-white">
                          {mr.finishTimeSeconds.toFixed(3)}s
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-400">
                          {mr.gapToLeaderSeconds === 0 ? '—' : `+${mr.gapToLeaderSeconds.toFixed(3)}s`}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                          {mr.topSpeedReached.toFixed(2)}
                        </td>
                        <td className="py-2.5 px-2 text-right font-mono tabular-nums text-slate-300">
                          {mr.standardisedScore.toFixed(1)}
                        </td>
                        <td className="py-2.5 pl-2 text-right font-mono font-bold tabular-nums text-[#e5a93c]">
                          +{ts?.championshipPoints ?? 0}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={handleRerunSameSeed}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Verify Reproducibility (Re-run Seed {officialResult.seed})
              </button>

              <div className="flex items-center gap-2.5">
                <button
                  type="button"
                  onClick={() => onExit('standings')}
                  className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white cursor-pointer"
                >
                  Championship Standings
                </button>
                <button
                  type="button"
                  onClick={() => onExit('hub')}
                  className="px-5 py-2 rounded-lg bg-[#e5a93c] text-[#0b0e14] text-xs font-bold hover:bg-[#f0b954] cursor-pointer"
                >
                  Return to League Hub
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
