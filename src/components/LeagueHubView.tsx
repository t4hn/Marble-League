import React from 'react';
import {Play, ArrowRight, Trophy, CalendarDays, Users, Disc3} from 'lucide-react';
import {CalendarRound, LeagueState} from '../types/league';
import {calculateSeasonStandings, selectTeamRepresentatives} from '../engine/scoring';
import {MarbleAvatar, TeamEmblem} from './MarbleAvatar';

export type HubSection = 'hub' | 'teams' | 'marbles' | 'calendar' | 'standings';

interface LeagueHubViewProps {
  league: LeagueState;
  onNavigate: (section: HubSection) => void;
  onWatchRound: (roundNumber: number) => void;
  onInspectTeam: (teamId: string) => void;
  onInspectMarble: (marbleId: string) => void;
}

export const LeagueHubView: React.FC<LeagueHubViewProps> = ({
  league,
  onNavigate,
  onWatchRound,
  onInspectTeam,
  onInspectMarble,
}) => {
  const standings = React.useMemo(
    () => calculateSeasonStandings(league.calendar, league.teamOrder),
    [league.calendar, league.teamOrder],
  );

  const completedRounds = league.calendar.filter((r) => r.status === 'completed');
  const nextPlayableSprint = league.calendar.find(
    (r) => r.status === 'scheduled' && r.playableInCurrentMilestone,
  );
  const nextScheduledRound: CalendarRound | undefined =
    league.calendar.find((r) => r.status === 'scheduled') ?? league.calendar[0];
  const spotlightRound = nextPlayableSprint ?? nextScheduledRound;
  const spotlightVenue = spotlightRound ? league.venues[spotlightRound.venueId] : undefined;

  const recentCompleted =
    completedRounds.length > 0 ? completedRounds[completedRounds.length - 1] : null;

  const upcomingLineup = React.useMemo(() => {
    if (!spotlightRound) return [];
    return league.teamOrder.map((teamId, idx) => {
      const team = league.teams[teamId];
      const reps = selectTeamRepresentatives(team, league.marbles, spotlightRound.discipline);
      return {team, reps, lane: idx + 1};
    });
  }, [league.marbles, league.teamOrder, league.teams, spotlightRound]);

  return (
    <div className="space-y-8">
      {/* Primary Broadcast Feature Row */}
      <section className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-stretch">
        {/* Upcoming Event Spotlight (8 cols) */}
        <div className="lg:col-span-8 bg-[#121722] border border-white/10 rounded-xl p-6 lg:p-8 flex flex-col justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-medium text-slate-400">
              <span>Season {league.currentSeasonNumber}</span>
              <span aria-hidden="true">·</span>
              <span>
                {completedRounds.length} of {league.calendar.length} Rounds Completed
              </span>
              <span aria-hidden="true">·</span>
              <span>8 Franchises · 32 Competitors</span>
            </div>

            <div className="mt-4 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
              <div>
                <h1 className="font-display text-3xl sm:text-4xl font-bold tracking-tight text-white text-balance">
                  {spotlightRound
                    ? `Next Live Event · Round ${spotlightRound.roundNumber}: ${spotlightRound.discipline}`
                    : 'Season Complete'}
                </h1>
                {spotlightVenue && (
                  <p className="mt-1.5 text-sm text-slate-300 max-w-2xl leading-relaxed">
                    {spotlightVenue.name} — {spotlightVenue.characteristics}
                  </p>
                )}
                {spotlightRound && spotlightRound.roundNumber === 5 && (
                  <p className="mt-1 text-xs text-slate-400">
                    Rounds 2–4 (Circuit, Obstacle, Classic Run) are scheduled on the calendar for upcoming discipline milestones.
                  </p>
                )}
              </div>

              {spotlightRound?.playableInCurrentMilestone ? (
                <button
                  type="button"
                  data-start="true"
                  onClick={() => onWatchRound(spotlightRound.roundNumber)}
                  className="inline-flex items-center gap-2.5 px-5 py-3 rounded-lg bg-[#e5a93c] text-[#0b0e14] font-semibold text-sm hover:bg-[#f0b954] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <Play className="w-4 h-4 fill-current" />
                  Watch Round {spotlightRound.roundNumber} Sprint
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => onNavigate('calendar')}
                  className="inline-flex items-center gap-2 px-5 py-3 rounded-lg bg-white/10 text-white font-semibold text-sm hover:bg-white/15 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  <CalendarDays className="w-4 h-4" />
                  Open Season Calendar
                </button>
              )}
            </div>
          </div>

          {/* Starting Grid Preview for the Upcoming Event */}
          <div className="mt-7 pt-6 border-t border-white/10">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                {spotlightRound?.discipline} Selected Representatives (Auto-Selected by Attributes)
              </h2>
              <span className="text-xs text-slate-400 tabular-nums">
                {spotlightRound?.marblesPerTeam ?? 1} per team · {(spotlightRound?.marblesPerTeam ?? 1) * 8} marble field
              </span>
            </div>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {upcomingLineup.map(({team, reps, lane}) => (
                <button
                  key={team.id}
                  type="button"
                  onClick={() => onInspectMarble(reps[0].id)}
                  className="text-left p-3 rounded-lg bg-[#0b0e14] border border-white/8 hover:border-white/25 transition-colors cursor-pointer"
                >
                  <div className="flex items-center justify-between text-[11px] text-slate-400 tabular-nums mb-1.5">
                    <span>Lane {lane}</span>
                    <span className="font-mono">{team.shortCode}</span>
                  </div>
                  <div className="flex items-center gap-2.5">
                    <MarbleAvatar
                      primaryColor={team.primaryColor}
                      secondaryColor={team.secondaryColor}
                      accentColor={team.accentColor}
                      size={28}
                    />
                    <div className="min-w-0">
                      <div className="text-sm font-semibold text-white truncate">
                        {reps.map((r) => r.name).join(', ')}
                      </div>
                      <div className="text-xs text-slate-400 truncate">{team.name}</div>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Recent Event Results / Opening Desk (4 cols) */}
        <div className="lg:col-span-4 bg-[#121722] border border-white/10 rounded-xl p-6 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold tracking-tight text-white">
                {recentCompleted
                  ? `Recent Result · R${recentCompleted.roundNumber}`
                  : 'Inaugural Season Desk'}
              </h2>
              <button
                type="button"
                onClick={() => onNavigate('standings')}
                className="text-xs font-medium text-[#e5a93c] hover:underline whitespace-nowrap cursor-pointer"
              >
                Full Standings
              </button>
            </div>

            {recentCompleted && recentCompleted.result ? (
              <div className="mt-4 space-y-4">
                <div className="text-xs text-slate-400">
                  {recentCompleted.discipline} at {league.venues[recentCompleted.venueId]?.name} · Seed{' '}
                  <span className="font-mono tabular-nums">{recentCompleted.result.seed}</span>
                </div>

                <div className="space-y-2">
                  {recentCompleted.result.teamScores.slice(0, 5).map((ts) => {
                    const team = league.teams[ts.teamId];
                    const leadMarble = ts.marbleResults[0];
                    const marble = leadMarble ? league.marbles[leadMarble.marbleId] : undefined;
                    return (
                      <div
                        key={ts.teamId}
                        className="flex items-center justify-between py-2 border-b border-white/6 last:border-0"
                      >
                        <div className="flex items-center gap-2.5 min-w-0">
                          <span className="w-5 text-xs font-mono text-slate-400 tabular-nums">
                            {ts.teamPosition}.
                          </span>
                          <TeamEmblem team={team} size={22} />
                          <div className="min-w-0">
                            <div className="text-sm font-medium text-white truncate">
                              {team.name}
                            </div>
                            {marble && leadMarble && (
                              <div className="text-xs text-slate-400 truncate tabular-nums">
                                {marble.name} · {leadMarble.finishTimeSeconds.toFixed(3)}s
                              </div>
                            )}
                          </div>
                        </div>
                        <span className="font-mono text-sm font-semibold text-[#e5a93c] tabular-nums shrink-0">
                          +{ts.championshipPoints} pts
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>
            ) : (
              <div className="mt-4 space-y-4">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Season {league.currentSeasonNumber} has not yet started. All eight franchises sit level on 0 Championship points ahead of Round 1 at Velocity Park.
                </p>
                <div className="p-4 rounded-lg bg-[#0b0e14] border border-white/8 space-y-2 text-xs text-slate-300">
                  <div className="font-semibold text-white">Championship Scoring Format</div>
                  <p className="text-slate-400 leading-relaxed">
                    All four disciplines carry equal Championship weight (15-12-10-8-6-4-2-1). Launch Round 1 Sprint to record the first official times and career statistics.
                  </p>
                </div>
              </div>
            )}
          </div>

          <div className="mt-6 pt-4 border-t border-white/10 grid grid-cols-3 gap-2">
            <button
              type="button"
              onClick={() => onNavigate('teams')}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Users className="w-3.5 h-3.5" />
              Teams
            </button>
            <button
              type="button"
              onClick={() => onNavigate('marbles')}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Disc3 className="w-3.5 h-3.5" />
              32 Marbles
            </button>
            <button
              type="button"
              onClick={() => onNavigate('calendar')}
              className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
            >
              <CalendarDays className="w-3.5 h-3.5" />
              Calendar
            </button>
          </div>
        </div>
      </section>

      {/* Championship Standings Table */}
      <section className="bg-[#121722] border border-white/10 rounded-xl p-6">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-5">
          <div>
            <h2 className="font-display text-2xl font-bold tracking-tight text-white">
              Season {league.currentSeasonNumber} Championship Standings
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Tie-breakers: Championship Points · Event Wins · 2nd Places · 3rd Places
            </p>
          </div>
          <button
            type="button"
            onClick={() => onNavigate('standings')}
            className="inline-flex items-center gap-1.5 text-sm font-medium text-[#e5a93c] hover:underline cursor-pointer"
          >
            Standings & Scoring Breakdown
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400">
                <th className="py-3 pr-4 font-medium w-14">Pos</th>
                <th className="py-3 pr-4 font-medium">Franchise</th>
                <th className="py-3 px-3 font-medium text-right">Events</th>
                <th className="py-3 px-3 font-medium text-right">Wins</th>
                <th className="py-3 px-3 font-medium text-right">Podiums</th>
                <th className="py-3 pl-3 font-medium text-right">Points</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6 text-sm">
              {standings.map((row) => {
                const team = league.teams[row.teamId];
                return (
                  <tr
                    key={row.teamId}
                    className="hover:bg-white/[0.03] transition-colors"
                  >
                    <td className="py-3 pr-4 font-mono tabular-nums text-slate-300">
                      {row.sharedRank ? `T${row.rank}` : row.rank}
                    </td>
                    <td className="py-3 pr-4">
                      <button
                        type="button"
                        onClick={() => onInspectTeam(team.id)}
                        className="flex items-center gap-3 text-left hover:text-[#e5a93c] transition-colors cursor-pointer"
                      >
                        <TeamEmblem team={team} size={26} />
                        <div>
                          <div className="font-semibold text-white">{team.name}</div>
                          <div className="text-xs text-slate-400">{team.shortCode}</div>
                        </div>
                      </button>
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                      {row.eventsCompleted}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                      {row.eventWins}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-300">
                      {row.podiums}
                    </td>
                    <td className="py-3 pl-3 text-right font-mono font-semibold tabular-nums text-white">
                      {row.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {league.seasonHistory.length > 0 && (
          <div className="mt-5 pt-4 border-t border-white/10 flex items-center gap-3 text-xs text-slate-400">
            <Trophy className="w-4 h-4 text-[#e5a93c]" />
            <span>
              Archived Seasons: {league.seasonHistory.length} · Latest Champion:{' '}
              <strong className="text-white">
                {league.teams[league.seasonHistory[league.seasonHistory.length - 1].championTeamId]?.name}
              </strong>
            </span>
          </div>
        )}
      </section>
    </div>
  );
};
