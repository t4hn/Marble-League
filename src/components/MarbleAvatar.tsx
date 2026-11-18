import React from 'react';
import {Team} from '../types/league';

interface MarbleAvatarProps {
  primaryColor: string;
  secondaryColor: string;
  accentColor: string;
  size?: number;
  label?: string;
}

export const MarbleAvatar: React.FC<MarbleAvatarProps> = ({
  primaryColor,
  secondaryColor,
  accentColor,
  size = 32,
  label,
}) => {
  const uid = React.useId().replace(/:/g, '');
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 40 40"
      aria-label={label}
      className="shrink-0"
    >
      <defs>
        <radialGradient id={`base_${uid}`} cx="35%" cy="30%" r="70%">
          <stop offset="0%" stopColor={accentColor} />
          <stop offset="48%" stopColor={primaryColor} />
          <stop offset="100%" stopColor={secondaryColor} />
        </radialGradient>
        <linearGradient id={`swirl_${uid}`} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor={secondaryColor} stopOpacity="0.85" />
          <stop offset="50%" stopColor={accentColor} stopOpacity="0.7" />
          <stop offset="100%" stopColor={primaryColor} stopOpacity="0.9" />
        </linearGradient>
      </defs>
      <circle cx="20" cy="20" r="18" fill={`url(#base_${uid})`} stroke="rgba(255,255,255,0.22)" strokeWidth="1" />
      <path
        d="M8 24 C13 12, 27 28, 32 15"
        fill="none"
        stroke={`url(#swirl_${uid})`}
        strokeWidth="5"
        strokeLinecap="round"
      />
      <ellipse cx="14" cy="12" rx="5" ry="2.8" transform="rotate(-25 14 12)" fill="rgba(255,255,255,0.58)" />
    </svg>
  );
};

interface TeamEmblemProps {
  team: Team;
  size?: number;
}

export const TeamEmblem: React.FC<TeamEmblemProps> = ({team, size = 28}) => {
  if (team.logoDataUrl) {
    return (
      <span
        className="inline-flex items-center justify-center rounded-md border border-white/15 bg-[#0b0e14] overflow-hidden shrink-0"
        style={{
          width: size,
          height: size,
        }}
      >
        <img
          src={team.logoDataUrl}
          alt={`${team.name} logo`}
          className="w-full h-full object-contain p-0.5"
        />
      </span>
    );
  }

  const paths: Record<Team['emblemType'], React.ReactNode> = {
    viper: <path d="M12 3L20 9L16 21L12 17L8 21L4 9L12 3Z" fill="currentColor" />,
    meteor: <path d="M19 4L9 14L5 14L4 20L10 19L10 15L20 5L19 4Z" fill="currentColor" />,
    ram: <path d="M5 10C5 6 9 5 12 8C15 5 19 6 19 10C19 13 16 14 15 19H9C8 14 5 13 5 10Z" fill="currentColor" />,
    storm: <path d="M13 3L6 13H11L10 21L18 11H13L13 3Z" fill="currentColor" />,
    comet: <path d="M12 3L15 9L21 10L16.5 14.5L17.5 21L12 17.8L6.5 21L7.5 14.5L3 10L9 9L12 3Z" fill="currentColor" />,
    turtle: <path d="M12 5C7.5 5 5 8.5 5 13C5 16.5 8 19 12 19C16 19 19 16.5 19 13C19 8.5 16.5 5 12 5ZM12 8L15 12L12 16L9 12L12 8Z" fill="currentColor" />,
    grizzly: <path d="M6 7L9 5L12 7L15 5L18 7L19 14L12 20L5 14L6 7Z" fill="currentColor" />,
    antics: <path d="M4 17L8 7L12 13L16 7L20 17H4Z" fill="currentColor" />,
  };

  return (
    <span
      className="inline-flex items-center justify-center rounded-md border border-white/15 shrink-0"
      style={{
        width: size,
        height: size,
        backgroundColor: team.primaryColor,
        color: team.accentColor,
      }}
    >
      <svg width={size * 0.62} height={size * 0.62} viewBox="0 0 24 24" aria-hidden="true">
        {paths[team.emblemType]}
      </svg>
    </span>
  );
};
