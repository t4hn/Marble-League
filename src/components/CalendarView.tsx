import React from 'react';
import {Play, CheckCircle2, Clock, Settings} from 'lucide-react';
import {CalendarRound, LeagueState} from '../types/league';
import {TeamEmblem} from './MarbleAvatar';

interface CalendarViewProps {
  league: LeagueState;
  onWatchRound: (roundNumber: number) => void;
  onOpenOptions: () => void;
}

export const CalendarView: React.FC<CalendarViewProps> = ({
  league,
  onWatchRound,
  onOpenOptions,
}) => {
  const [expandedRound, setExpandedRound] = React.useState<number | null>(null);

  const renderRoundAction = (round: CalendarRound) => {
    if (round.status === 'completed' && round.result) {
      const winnerTeam = league.teams[round.result.teamScores[0]?.teamId ?? ''];
      return (
        <div className="flex items-center gap-3">
          {winnerTeam && (
            <div className="flex items-center gap-2 text-xs text-slate-200">
              <TeamEmblem team={winnerTeam} size={20} />
              <span className="font-medium">{winnerTeam.name} Won</span>
            </div>
          )}
          <button
            type="button"
            onClick={() =>
              setExpandedRound(expandedRound === round.roundNumber ? null : round.roundNumber)
            }
            className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-white transition-colors whitespace-nowrap cursor-pointer"
          >
            {expandedRound === round.roundNumber ? 'Hide Results' : 'View Results'}
          </button>
          {round.playableInCurrentMilestone && (
            <button
              type="button"
              onClick={() => onWatchRound(round.roundNumber)}
              className="px-3 py-1.5 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-[#e5a93c] transition-colors whitespace-nowrap cursor-pointer"
            >
              Re-watch Replay
            </button>
          )}
        </div>
      );
    }

    if (round.playableInCurrentMilestone) {
      return (
        <button
          type="button"
          onClick={() => onWatchRound(round.roundNumber)}
          className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#e5a93c] text-[#0b0e14] text-xs font-semibold hover:bg-[#f0b954] transition-colors whitespace-nowrap cursor-pointer"
        >
          <Play className="w-3.5 h-3.5 fill-current" />
          Launch Sprint Broadcast
        </button>
      );
    }

    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-slate-400 whitespace-nowrap">
        <Clock className="w-3.5 h-3.5" />
        Scheduled (Future Discipline Milestone)
      </span>
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-3xl font-bold tracking-tight text-white">
            Season {league.currentSeasonNumber} Calendar
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Fixed eight-round schedule rotating across Sprint, Circuit, Obstacle, and Classic Run. Sprint rounds (R1 &amp; R5) are live in this milestone.
          </p>
        </div>

        <button
          type="button"
          onClick={onOpenOptions}
          className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/8 hover:bg-white/15 text-xs font-medium text-slate-200 transition-colors cursor-pointer whitespace-nowrap"
        >
          <Settings className="w-3.5 h-3.5" />
          Season Options
        </button>
      </div>

      <div className="space-y-3">
        {league.calendar.map((round) => {
          const venue = league.venues[round.venueId];
          const isExpanded = expandedRound === round.roundNumber && round.result;
          return (
            <div
              key={round.roundNumber}
              className="bg-[#121722] border border-white/10 rounded-xl p-5"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div className="flex items-start gap-4">
                  <div className="w-12 h-12 rounded-lg bg-[#0b0e14] border border-white/10 flex flex-col items-center justify-center shrink-0">
                    <span className="text-[10px] uppercase tracking-wider text-slate-400">Rnd</span>
                    <span className="font-display text-xl font-bold text-white leading-none tabular-nums">
                      {round.roundNumber}
                    </span>
                  </div>

                  <div>
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="font-display text-2xl font-bold text-white leading-none">
                        {round.discipline}
                      </h2>
                      <span className="text-xs text-slate-400">·</span>
                      <span className="text-sm font-medium text-slate-200">
                        {venue?.name ?? round.venueId}
                      </span>
                      {round.status === 'completed' && (
                        <>
                          <span className="text-xs text-slate-400">·</span>
                          <span className="inline-flex items-center gap-1 text-xs text-emerald-400 font-medium">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Official
                          </span>
                        </>
                      )}
                    </div>

                    <div className="mt-1.5 text-xs text-slate-400 flex flex-wrap items-center gap-2">
                      <span>{round.marblesPerTeam} per team</span>
                      <span aria-hidden="true">·</span>
                      <span>{round.marblesPerTeam * 8} total competitors</span>
                      {venue?.trackRecord && (
                        <>
                          <span aria-hidden="true">·</span>
                          <span className="text-slate-300 tabular-nums">
                            Track Record: {venue.trackRecord.fastestTimeSeconds.toFixed(3)}s (
                            {league.marbles[venue.trackRecord.marbleId]?.name})
                          </span>
                        </>
                      )}
                    </div>
                  </div>
                </div>

                <div className="shrink-0">{renderRoundAction(round)}</div>
              </div>

              {isExpanded && round.result && (
                <div className="mt-5 pt-5 border-t border-white/10 overflow-x-auto">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead>
                      <tr className="border-b border-white/10 text-slate-400 uppercase">
                        <th className="py-2 pr-3 font-medium">Pos</th>
                        <th className="py-2 px-3 font-medium">Competitor</th>
                        <th className="py-2 px-3 font-medium">Team</th>
                        <th className="py-2 px-3 font-medium text-right">Lane</th>
                        <th className="py-2 px-3 font-medium text-right">Time</th>
                        <th className="py-2 px-3 font-medium text-right">Std Score</th>
                        <th className="py-2 pl-3 font-medium text-right">Champ Pts</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/6">
                      {round.result.marbleResults.map((mr) => {
                        const marble = league.marbles[mr.marbleId];
                        const team = league.teams[mr.teamId];
                        const teamScore = round.result!.teamScores.find((ts) => ts.teamId === mr.teamId);
                        return (
                          <tr key={mr.marbleId}>
                            <td className="py-2 pr-3 font-mono tabular-nums text-white font-semibold">
                              {mr.finishPosition}
                            </td>
                            <td className="py-2 px-3 text-white font-medium">
                              {marble?.name ?? mr.marbleId}
                            </td>
                            <td className="py-2 px-3 text-slate-300">
                              <div className="flex items-center gap-2">
                                {team && <TeamEmblem team={team} size={18} />}
                                <span>{team?.name ?? mr.teamId}</span>
                              </div>
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-400">
                              {mr.lane}
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-200">
                              {mr.finishTimeSeconds.toFixed(3)}s
                            </td>
                            <td className="py-2 px-3 text-right font-mono tabular-nums text-slate-300">
                              {mr.standardisedScore.toFixed(2)}
                            </td>
                            <td className="py-2 pl-3 text-right font-mono tabular-nums text-[#e5a93c] font-semibold">
                              +{teamScore?.championshipPoints ?? 0}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
