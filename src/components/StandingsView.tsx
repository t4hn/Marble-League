import React from 'react';
import {LeagueState} from '../types/league';
import {calculateSeasonStandings, CHAMPIONSHIP_POINTS_TABLE} from '../engine/scoring';
import {TeamEmblem} from './MarbleAvatar';

interface StandingsViewProps {
  league: LeagueState;
  onInspectTeam: (teamId: string) => void;
}

export const StandingsView: React.FC<StandingsViewProps> = ({league, onInspectTeam}) => {
  const standings = React.useMemo(
    () => calculateSeasonStandings(league.calendar, league.teamOrder),
    [league.calendar, league.teamOrder],
  );

  return (
    <div className="space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          Championship Standings & Scoring Architecture
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          Season {league.currentSeasonNumber} team rankings, round-by-round point matrix, and historical season records.
        </p>
      </div>

      {/* Main Championship Table with Round Matrix */}
      <section className="bg-[#121722] border border-white/10 rounded-xl overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-white/10 text-xs uppercase tracking-wider text-slate-400 bg-[#0f141e]">
                <th className="py-3.5 pl-5 pr-3 font-medium">Pos</th>
                <th className="py-3.5 px-3 font-medium">Team</th>
                {league.calendar.map((r) => (
                  <th
                    key={r.roundNumber}
                    className="py-3.5 px-2 font-medium text-center"
                    title={`Round ${r.roundNumber}: ${r.discipline}`}
                  >
                    R{r.roundNumber}
                  </th>
                ))}
                <th className="py-3.5 px-3 font-medium text-right">Wins</th>
                <th className="py-3.5 px-3 font-medium text-right">2nd</th>
                <th className="py-3.5 px-3 font-medium text-right">3rd</th>
                <th className="py-3.5 pl-3 pr-5 font-medium text-right">Total Pts</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/6 text-sm">
              {standings.map((row) => {
                const team = league.teams[row.teamId];
                return (
                  <tr key={row.teamId} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-3.5 pl-5 pr-3 font-mono tabular-nums text-white font-semibold">
                      {row.sharedRank ? `T${row.rank}` : row.rank}
                    </td>
                    <td className="py-3.5 px-3">
                      <button
                        type="button"
                        onClick={() => onInspectTeam(team.id)}
                        className="flex items-center gap-2.5 text-left hover:text-[#e5a93c] transition-colors cursor-pointer"
                      >
                        <TeamEmblem team={team} size={24} />
                        <span className="font-semibold text-white whitespace-nowrap">{team.name}</span>
                      </button>
                    </td>
                    {league.calendar.map((round) => {
                      const ts = round.result?.teamScores.find((x) => x.teamId === team.id);
                      return (
                        <td
                          key={round.roundNumber}
                          className="py-3.5 px-2 text-center font-mono text-xs tabular-nums text-slate-300"
                        >
                          {ts ? (
                            <span
                              className={
                                ts.teamPosition === 1
                                  ? 'text-[#e5a93c] font-bold'
                                  : ts.teamPosition <= 3
                                    ? 'text-white font-semibold'
                                    : 'text-slate-400'
                              }
                            >
                              {ts.championshipPoints}
                            </span>
                          ) : (
                            <span className="text-slate-600">—</span>
                          )}
                        </td>
                      );
                    })}
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {row.eventWins}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {row.eventSeconds}
                    </td>
                    <td className="py-3.5 px-3 text-right font-mono tabular-nums text-slate-300">
                      {row.eventThirds}
                    </td>
                    <td className="py-3.5 pl-3 pr-5 text-right font-mono font-bold tabular-nums text-white text-base">
                      {row.points}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>

      {/* Two-Stage Scoring Architecture Reference & Historical Seasons */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#121722] border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="font-display text-xl font-bold text-white">
            Equal-Weight Scoring Architecture (All 4 Disciplines)
          </h2>
          <p className="text-sm text-slate-300 leading-relaxed">
            Because field sizes differ across Sprint (8), Circuit (16), Classic Run (24), and Obstacle (32), every individual finish rank <span className="font-mono text-slate-200">r</span> in field size <span className="font-mono text-slate-200">N</span> is first normalised via{' '}
            <span className="font-mono text-[#e5a93c]">S(r, N) = 100 · (N - r) / (N - 1)</span>, then averaged across each team&apos;s representatives.
          </p>
          <div className="grid grid-cols-4 sm:grid-cols-8 gap-2 pt-1">
            {CHAMPIONSHIP_POINTS_TABLE.map((pts, idx) => (
              <div
                key={idx}
                className="p-2.5 rounded-lg bg-[#0b0e14] border border-white/8 text-center"
              >
                <div className="text-[11px] text-slate-400">#{idx + 1}</div>
                <div className="font-mono text-base font-bold text-white tabular-nums mt-0.5">
                  {pts}
                </div>
              </div>
            ))}
          </div>
        </section>

        <section className="bg-[#121722] border border-white/10 rounded-xl p-6 space-y-4">
          <h2 className="font-display text-xl font-bold text-white">
            Historical Season Records
          </h2>
          {league.seasonHistory.length === 0 ? (
            <p className="text-sm text-slate-400 leading-relaxed">
              No archived seasons yet. Complete all eight rounds of Season {league.currentSeasonNumber} to crown the inaugural Marble League Champion and record permanent season archives.
            </p>
          ) : (
            <div className="space-y-3">
              {league.seasonHistory.map((arch) => {
                const champ = league.teams[arch.championTeamId];
                return (
                  <div
                    key={arch.seasonNumber}
                    className="flex items-center justify-between p-3.5 rounded-lg bg-[#0b0e14] border border-white/8"
                  >
                    <div className="flex items-center gap-3">
                      {champ && <TeamEmblem team={champ} size={28} />}
                      <div>
                        <div className="text-sm font-semibold text-white">
                          Season {arch.seasonNumber} Champion: {champ?.name}
                        </div>
                        <div className="text-xs text-slate-400">
                          Archived {new Date(arch.completedAtIso).toLocaleDateString()}
                        </div>
                      </div>
                    </div>
                    <div className="font-mono text-sm font-bold text-[#e5a93c] tabular-nums">
                      {arch.finalStandings[0]?.points ?? 0} pts
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </section>
      </div>
    </div>
  );
};
