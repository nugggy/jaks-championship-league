import { pick } from '../core/util.js';

const LINES = {
  kickoff: ['{team} get us under way.', "We're off at {venue}.", '{team} kick off.'],
  secondHalf: ['The second half is under way.', '{team} restart for the second half.'],
  pass: ['{a} finds {b}.', '{a} plays it to {b}.', 'Neat from {a} to {b}.', '{a} picks out {b}.'],
  longPass: ['Lovely long ball from {a} to {b}.', '{a} switches it to {b}.', 'Raking pass from {a}.'],
  through: ['{a} slides {b} through.', 'Defence split by {a}.'],
  intercept: ['{a} reads it and intercepts.', 'Cut out by {a}.', '{a} steps in to win it.'],
  tackle: ['Great tackle from {a}.', '{a} wins it cleanly.', 'Superb challenge by {a}.'],
  skip: ['{a} skips past {b}.', '{b} goes to ground and misses.', '{a} rides the challenge.'],
  shot: ['{a} shoots.', '{a} lets fly.', '{a} goes for goal.'],
  save: ['Saved by {a}.', 'What a stop from {a}.', '{a} keeps it out.', 'Brilliant reflexes from {a}.'],
  catch: ['{a} gathers comfortably.', 'Easy take for {a}.'],
  wide: ['Wide of the post.', 'Over the bar.', "That's off target.", 'Not far away.'],
  post: ['Off the woodwork.', 'It rattles the frame of the goal.', 'Denied by the post.'],
  goal: ['{a} scores.', 'GOAL. {a} finds the net.', '{a} buries it.', 'What a finish from {a}.'],
  ownGoal: ['Own goal by {a}.', 'Disaster, {a} turns it into the wrong net.'],
  corner: ['Corner to {team}.', '{team} win a corner.'],
  throw: ['Throw-in, {team}.'],
  goalKick: ['Goal kick.', 'Goal kick to {team}.'],
  half: ["That's half-time.", 'The referee blows for half-time.'],
  full: ["That's full-time.", 'It is all over.'],
  chance: ['Big chance here.', '{a} is through.'],
};

export function line(type, vars = {}) {
  const options = LINES[type];
  if (!options) return '';
  return pick(options).replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '');
}
