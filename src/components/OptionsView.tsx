import React from 'react';
import {AlertTriangle, RotateCcw, Settings, ShieldAlert, CheckCircle2} from 'lucide-react';
import {LeagueState} from '../types/league';

interface OptionsViewProps {
  league: LeagueState;
  onResetCurrentSeason: () => void;
}

export const OptionsView: React.FC<OptionsViewProps> = ({
  league,
  onResetCurrentSeason,
}) => {
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const [resetSuccessMessage, setResetSuccessMessage] = React.useState<string | null>(null);

  const completedRounds = league.calendar.filter((r) => r.status === 'completed').length;
  const totalRounds = league.calendar.length;
  const leagueStatus =
    completedRounds === 0
      ? 'Scheduled (Pre-Season)'
      : completedRounds >= totalRounds
        ? 'Season Complete'
        : `Active (${completedRounds} of ${totalRounds} Rounds Completed)`;

  React.useEffect(() => {
    if (!confirmOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setConfirmOpen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [confirmOpen]);

  const handleConfirmReset = () => {
    onResetCurrentSeason();
    setConfirmOpen(false);
    setResetSuccessMessage(
      `Season ${league.currentSeasonNumber} calendar reset to Round 1. Teams, marbles, career stats, custom logos, and historical archives were preserved.`,
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-white">
          League Options
        </h1>
        <p className="text-sm text-slate-400 mt-1">
          League status overview and administrative testing controls.
        </p>
      </div>

      {resetSuccessMessage && (
        <div
          role="status"
          className="flex items-start gap-3 p-4 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-sm text-emerald-200"
        >
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          <span>{resetSuccessMessage}</span>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* GENERAL SECTION */}
        <section
          aria-labelledby="options-general-heading"
          className="bg-[#121722] border border-white/10 rounded-xl p-6 space-y-5"
        >
          <div className="flex items-center gap-2.5 border-b border-white/10 pb-3.5">
            <Settings className="w-4 h-4 text-[#e5a93c]" />
            <h2
              id="options-general-heading"
              className="text-xs font-bold uppercase tracking-wider text-slate-300"
            >
              General
            </h2>
          </div>

          <dl className="space-y-4 text-sm">
            <div className="flex items-center justify-between gap-4 py-2 border-b border-white/6">
              <dt className="text-slate-400">Application</dt>
              <dd className="font-semibold text-white text-right">
                Marble League Spectator Simulation
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2 border-b border-white/6">
              <dt className="text-slate-400">Current Season</dt>
              <dd className="font-mono font-semibold text-[#e5a93c] tabular-nums">
                Season {league.currentSeasonNumber}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2 border-b border-white/6">
              <dt className="text-slate-400">League Status</dt>
              <dd className="font-medium text-white text-right tabular-nums">
                {leagueStatus}
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2 border-b border-white/6">
              <dt className="text-slate-400">Registered Roster</dt>
              <dd className="font-mono text-slate-200 tabular-nums">
                {league.teamOrder.length} Franchises · {league.marbleOrder.length} Marbles
              </dd>
            </div>
            <div className="flex items-center justify-between gap-4 py-2">
              <dt className="text-slate-400">Archived Seasons</dt>
              <dd className="font-mono text-slate-200 tabular-nums">
                {league.seasonHistory.length}
              </dd>
            </div>
          </dl>
        </section>

        {/* ADMINISTRATION SECTION */}
        <section
          aria-labelledby="options-admin-heading"
          className="bg-[#121722] border border-white/10 rounded-xl p-6 flex flex-col justify-between space-y-5"
        >
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-3 border-b border-white/10 pb-3.5">
              <div className="flex items-center gap-2.5">
                <ShieldAlert className="w-4 h-4 text-[#e5a93c]" />
                <h2
                  id="options-admin-heading"
                  className="text-xs font-bold uppercase tracking-wider text-slate-300"
                >
                  Administration
                </h2>
              </div>
              <span className="px-2 py-0.5 rounded bg-white/8 text-[11px] font-mono uppercase tracking-wider text-slate-300">
                Admin / Testing
              </span>
            </div>

            <div className="space-y-2">
              <h3 className="font-display text-xl font-bold text-white">
                Current Season Replay Control
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                Administrative testing function to reset the active Season{' '}
                {league.currentSeasonNumber} calendar back to Round 1 without altering the wider league universe.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed">
                Clears current-season race results and championship points while preserving all 8 teams, 32 marbles, custom names and logos, attributes, career statistics, venue records, and historical season archives.
              </p>
            </div>
          </div>

          <div className="pt-4 border-t border-white/10 flex items-center justify-between gap-4">
            <span className="text-xs text-slate-400 tabular-nums">
              {completedRounds} / {totalRounds} rounds recorded this season
            </span>
            <button
              type="button"
              onClick={() => {
                setResetSuccessMessage(null);
                setConfirmOpen(true);
              }}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-lg bg-[#e5a93c] text-[#0b0e14] text-xs font-bold tracking-wider uppercase hover:bg-[#f0b954] transition-colors cursor-pointer whitespace-nowrap"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              RESET CURRENT SEASON
            </button>
          </div>
        </section>
      </div>

      {/* Confirmation Dialog */}
      {confirmOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75"
          role="dialog"
          aria-modal="true"
          aria-labelledby="reset-season-dialog-title"
        >
          <div className="w-full max-w-lg rounded-xl bg-[#121722] border border-white/15 p-6 space-y-5 shadow-2xl">
            <div className="flex items-start gap-3.5">
              <div className="p-2.5 rounded-lg bg-[#e5a93c]/15 text-[#e5a93c] shrink-0">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div>
                <h2
                  id="reset-season-dialog-title"
                  className="font-display text-2xl font-bold text-white"
                >
                  Confirm Current Season Reset
                </h2>
                <p className="text-sm text-slate-300 mt-1">
                  This administrative action resets Season {league.currentSeasonNumber} back to Round 1.
                </p>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
              <div className="p-3.5 rounded-lg bg-[#0b0e14] border border-white/10 space-y-1.5">
                <div className="font-semibold uppercase tracking-wider text-[#e5a93c]">
                  Will Be Reset
                </div>
                <ul className="space-y-1 text-slate-300 list-disc list-inside">
                  <li>Season {league.currentSeasonNumber} calendar returns to Round 1</li>
                  <li>All 8 rounds set back to scheduled</li>
                  <li>Current-season race results cleared</li>
                  <li>Current-season standings cleared</li>
                </ul>
              </div>

              <div className="p-3.5 rounded-lg bg-[#0b0e14] border border-white/10 space-y-1.5">
                <div className="font-semibold uppercase tracking-wider text-emerald-400">
                  Will Be Preserved
                </div>
                <ul className="space-y-1 text-slate-300 list-disc list-inside">
                  <li>Current season number ({league.currentSeasonNumber})</li>
                  <li>All 8 teams, 32 marbles &amp; attributes</li>
                  <li>Custom team/marble names &amp; logos</li>
                  <li>Career stats &amp; historical season archives</li>
                </ul>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
              <button
                type="button"
                onClick={() => setConfirmOpen(false)}
                className="px-4 py-2 rounded-lg bg-white/10 hover:bg-white/15 text-xs font-semibold text-white transition-colors cursor-pointer"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#e5a93c] text-[#0b0e14] text-xs font-bold hover:bg-[#f0b954] transition-colors cursor-pointer"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Confirm Season Reset
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
