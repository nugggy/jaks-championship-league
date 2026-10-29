// Pitch geometry in metres. x runs goal to goal, z runs touchline to touchline, y is up.
export const PITCH_L = 105;
export const PITCH_W = 68;
export const HALF_L = PITCH_L / 2;
export const HALF_W = PITCH_W / 2;
export const GOAL_W = 7.32;
export const GOAL_HALF = GOAL_W / 2;
export const GOAL_H = 2.44;
export const GOAL_DEPTH = 2.2;
export const BOX_L = 16.5;
export const BOX_HALF_W = 20.16;
export const SIX_L = 5.5;
export const SIX_HALF_W = 9.16;
export const BALL_R = 0.11;
export const GRAVITY = 9.81;
export const POST_R = 0.06;

export const DIFFICULTY = {
  amateur: { label: 'Amateur', ai: 0.72, keeper: 0.75, intercept: 0.6, tackle: 0.7, think: 1.15 },
  pro: { label: 'Pro', ai: 0.88, keeper: 0.9, intercept: 0.85, tackle: 0.9, think: 0.95 },
  worldclass: { label: 'World Class', ai: 1.0, keeper: 1.0, intercept: 1.0, tackle: 1.05, think: 0.8 },
  legendary: { label: 'Legendary', ai: 1.12, keeper: 1.1, intercept: 1.2, tackle: 1.2, think: 0.65 },
};

// Formation slots in team-relative coordinates.
// d: 0 = own goal line, 1 = opposition goal line. w: -1 = left touchline, +1 = right touchline.
export const FORMATIONS = {
  '4-3-3': [
    { role: 'GK', d: 0.03, w: 0 },
    { role: 'LB', d: 0.24, w: -0.72 }, { role: 'CB', d: 0.2, w: -0.25 }, { role: 'CB', d: 0.2, w: 0.25 }, { role: 'RB', d: 0.24, w: 0.72 },
    { role: 'CM', d: 0.42, w: -0.38 }, { role: 'DM', d: 0.35, w: 0 }, { role: 'CM', d: 0.42, w: 0.38 },
    { role: 'LW', d: 0.62, w: -0.72 }, { role: 'ST', d: 0.68, w: 0 }, { role: 'RW', d: 0.62, w: 0.72 },
  ],
  '4-4-2': [
    { role: 'GK', d: 0.03, w: 0 },
    { role: 'LB', d: 0.24, w: -0.72 }, { role: 'CB', d: 0.2, w: -0.25 }, { role: 'CB', d: 0.2, w: 0.25 }, { role: 'RB', d: 0.24, w: 0.72 },
    { role: 'LW', d: 0.45, w: -0.72 }, { role: 'CM', d: 0.4, w: -0.22 }, { role: 'CM', d: 0.4, w: 0.22 }, { role: 'RW', d: 0.45, w: 0.72 },
    { role: 'ST', d: 0.66, w: -0.18 }, { role: 'ST', d: 0.64, w: 0.18 },
  ],
  '4-2-3-1': [
    { role: 'GK', d: 0.03, w: 0 },
    { role: 'LB', d: 0.24, w: -0.72 }, { role: 'CB', d: 0.2, w: -0.25 }, { role: 'CB', d: 0.2, w: 0.25 }, { role: 'RB', d: 0.24, w: 0.72 },
    { role: 'DM', d: 0.35, w: -0.2 }, { role: 'DM', d: 0.35, w: 0.2 },
    { role: 'LW', d: 0.56, w: -0.66 }, { role: 'AM', d: 0.54, w: 0 }, { role: 'RW', d: 0.56, w: 0.66 },
    { role: 'ST', d: 0.7, w: 0 },
  ],
  '3-5-2': [
    { role: 'GK', d: 0.03, w: 0 },
    { role: 'CB', d: 0.2, w: -0.4 }, { role: 'CB', d: 0.18, w: 0 }, { role: 'CB', d: 0.2, w: 0.4 },
    { role: 'LB', d: 0.42, w: -0.8 }, { role: 'CM', d: 0.38, w: -0.25 }, { role: 'DM', d: 0.33, w: 0 }, { role: 'CM', d: 0.38, w: 0.25 }, { role: 'RB', d: 0.42, w: 0.8 },
    { role: 'ST', d: 0.66, w: -0.18 }, { role: 'ST', d: 0.64, w: 0.18 },
  ],
};

// Which roles can fill which formation slot, best first. Used for auto picking a starting XI.
export const ROLE_FIT = {
  GK: ['GK'],
  CB: ['CB', 'DM', 'RB', 'LB'],
  LB: ['LB', 'RB', 'CB', 'LW'],
  RB: ['RB', 'LB', 'CB', 'RW'],
  DM: ['DM', 'CM', 'CB'],
  CM: ['CM', 'DM', 'AM'],
  AM: ['AM', 'CM', 'LW', 'RW', 'ST'],
  LW: ['LW', 'RW', 'AM', 'ST'],
  RW: ['RW', 'LW', 'AM', 'ST'],
  ST: ['ST', 'AM', 'LW', 'RW'],
};
