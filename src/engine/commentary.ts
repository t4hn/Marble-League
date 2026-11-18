import {Marble, Team} from '../types/league';
import {SimulationEvent} from './sprintSimulation';

export interface CommentaryLine {
  id: string;
  elapsedSeconds: number;
  text: string;
  emphasis: 'normal' | 'highlight' | 'finish';
}

/**
 * Event-driven race commentary grounded strictly in real simulation events.
 * Never invents overtakes, incidents, or results that did not occur.
 */
export function buildCommentaryForEvent(
  evt: SimulationEvent,
  marbles: Record<string, Marble>,
  teams: Record<string, Team>,
  venueName: string,
): CommentaryLine | null {
  const primary = evt.primaryMarbleId ? marbles[evt.primaryMarbleId] : undefined;
  const secondary = evt.secondaryMarbleId ? marbles[evt.secondaryMarbleId] : undefined;
  const primaryTeam = primary ? teams[primary.teamId] : undefined;

  switch (evt.type) {
    case 'RACE_START':
      return {
        id: evt.id,
        elapsedSeconds: evt.elapsedSeconds,
        text: `Gate drops at ${venueName} — all eight Sprint contenders launch cleanly down the ramp!`,
        emphasis: 'highlight',
      };

    case 'LEAD_CHANGE':
      if (!primary || !secondary) return null;
      return {
        id: evt.id,
        elapsedSeconds: evt.elapsedSeconds,
        text: `${primary.name} (${primaryTeam?.shortCode ?? ''}) surges past ${secondary.name} at the ${Math.round(evt.distanceMeters)}m mark to seize the lead.`,
        emphasis: 'highlight',
      };

    case 'OVERTAKE':
      if (!primary || !secondary || !evt.position) return null;
      return {
        id: evt.id,
        elapsedSeconds: evt.elapsedSeconds,
        text: `Clean move in open traffic: ${primary.name} passes ${secondary.name} for P${evt.position}.`,
        emphasis: 'normal',
      };

    case 'MARBLE_CONTACT':
      if (!primary || !secondary) return null;
      return {
        id: evt.id,
        elapsedSeconds: evt.elapsedSeconds,
        text: `Wheel-to-wheel contact at ${Math.round(evt.distanceMeters)}m as ${primary.name} and ${secondary.name} trade momentum in the pack!`,
        emphasis: 'highlight',
      };

    case 'CLOSE_CONTEST':
      if (!primary || !secondary) return null;
      return {
        id: evt.id,
        elapsedSeconds: evt.elapsedSeconds,
        text: `Neck and neck between ${primary.name} and ${secondary.name} — separated by less than a tenth of a second.`,
        emphasis: 'highlight',
      };

    case 'FALLING_BEHIND':
      if (!primary) return null;
      return {
        id: evt.id,
        elapsedSeconds: evt.elapsedSeconds,
        text: `${primary.name} is losing pace over the track seams and dropping off the pack.`,
        emphasis: 'normal',
      };

    case 'MARBLE_FINISH':
      if (!primary || !evt.position) return null;
      if (evt.position === 1) {
        return {
          id: evt.id,
          elapsedSeconds: evt.elapsedSeconds,
          text: `${primary.name} (${primaryTeam?.name ?? ''}) crosses the line first in ${evt.elapsedSeconds.toFixed(3)}s!`,
          emphasis: 'finish',
        };
      }
      if (evt.position <= 3) {
        return {
          id: evt.id,
          elapsedSeconds: evt.elapsedSeconds,
          text: `${primary.name} secures P${evt.position} at ${evt.elapsedSeconds.toFixed(3)}s.`,
          emphasis: 'normal',
        };
      }
      return null;

    case 'RACE_FINISH':
      return {
        id: evt.id,
        elapsedSeconds: evt.elapsedSeconds,
        text: `All eight competitors are across the finish beam at ${venueName}. Official scoring locked.`,
        emphasis: 'finish',
      };
  }
}
