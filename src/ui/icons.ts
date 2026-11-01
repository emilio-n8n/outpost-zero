import type { IconId } from '../game/data';

export type IconName =
  | IconId
  | 'blueprint'
  | 'close'
  | 'arrow'
  | 'check'
  | 'lock'
  | 'warning'
  | 'skull'
  | 'info'
  | 'play'
  | 'pause'
  | 'sun'
  | 'moon'
  | 'signal'
  | 'drop'
  | 'heart'
  | 'bolt';

const paths: Record<IconName, string> = {
  wood: '<path d="M12 21V7"/><path d="m12 7-4-3M12 7l4-3M12 12 8.5 9M12 16l3.5-3"/><path d="M8 21h8"/>',
  metal: '<path d="m12 2 7 4v8l-7 4-7-4V6l7-4Z"/><circle cx="12" cy="9" r="2.2"/><path d="M12 4v2M12 12v2M7 6.5l1.8 1M15.2 11l1.8 1"/>',
  energy: '<path d="m12 2 5 7-5 13L7 9l5-7Z"/><path d="m12 2-.2 20M7 9h10M9.3 6.3 12 9l2.7-2.7"/>',
  food: '<path d="M5 13a7 7 0 0 1 14 0"/><path d="M5 13h14"/><path d="M12 13v6"/><path d="M8.5 13a3.5 3.5 0 0 1 7 0"/><path d="M10.5 18.5c0 1.4.6 2.5 1.5 2.5s1.5-1.1 1.5-2.5"/>',
  blade: '<path d="m5 19 3.5-1L20 6.5 17.5 4 6 15.5 5 19Z"/><path d="m14 6 4 4M5 19l2-2"/><path d="M4 16.5 7.5 20"/>',
  rifle: '<path d="M3 14h4l2-3h5l1 3h6v-2h-4l-1.5-3H9L7 11H3v3Z"/><path d="M8 14v3l4 2v-5M15 14l-2 4"/><path d="M17.5 9V7.5"/>',
  medkit: '<rect x="3" y="6" width="18" height="14" rx="2"/><path d="M9 6V4h6v2M12 10v6M9 13h6"/>',
  battery: '<rect x="3" y="7" width="16" height="10" rx="1.5"/><path d="M21 10v4M12 8l-2.5 4H12l-1 4 3.5-5H12l1-3Z"/>',
  ration: '<path d="M5 9h14l-1 11H6L5 9Z"/><path d="M5 9c0-2 3.1-3.5 7-3.5S19 7 19 9"/><path d="M9 13h6M10 16h4"/>',
  axe: '<path d="m5 20 9.5-9.5"/><path d="m13 8 3-3 5 5-3 3-5-5Z"/><path d="m4 21 2-2"/>',
  pick: '<path d="m5 20 10-10"/><path d="M8 7c4-4 9-4 12-2-2 3-5 5-8 5-1 0-2-.2-3-.8L8 11 5 8l3-1Z"/><path d="m4 21 2-2"/>',
  campfire: '<path d="M12 21c4 0 6-2.4 6-5.5 0-3-2.3-4.8-3.4-7.3-.5 2.3-1.6 3.1-2.4 3.7.2-2.7-1.5-5-2.8-7.4.1 3.6-3.4 5.5-3.4 10.4C6 18.2 8.3 21 12 21Z"/><path d="M9 17c.4 1.3 1.5 2 3 2"/><path d="m4 21 4-1M20 21l-4-1"/>',
  shield: '<path d="M12 2 20 5v7c0 5-3.6 8.2-8 10-4.4-1.8-8-5-8-10V5l8-3Z"/><path d="M8 10h8M8 14h8M12 7v10"/>',
  shelter: '<path d="m12 3 9 18H3L12 3Z"/><path d="M12 11v10M8 21l4-10 4 10"/><path d="M6.5 15h11"/>',
  turret: '<path d="M4 21h16M7 21l1-5h8l1 5"/><path d="M8 16v-3l4-3 4 3v3"/><path d="M12 10V6l5-2v5l-5 1Z"/><circle cx="12" cy="13" r="1.5"/>',
  beacon: '<path d="M12 21V8M8 21h8"/><path d="m12 8-3-3V2h6v3l-3 3Z"/><path d="M5 8a9 9 0 0 1-2-5M19 8a9 9 0 0 0 2-5M8 11a5 5 0 0 1-3-3M16 11a5 5 0 0 0 3-3"/>',
  blueprint: '<path d="M5 3h10l4 4v14H5V3Z"/><path d="M15 3v5h4"/><path d="M8 12h8M8 15h6M8 18h4"/><circle cx="16" cy="16" r="1"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3.5 2"/>',
  compass: '<circle cx="12" cy="12" r="9"/><path d="m15.5 8.5-2 5-5 2 2-5 5-2Z"/>',
  save: '<path d="M4 3h13l3 3v15H4V3Z"/><path d="M8 3v6h8V3M8 21v-7h8v7"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  spark: '<path d="m12 2 1.8 7.2L21 12l-7.2 1.8L12 22l-1.8-8.2L3 12l7.2-2.8L12 2Z"/>',
  close: '<path d="m6 6 12 12M18 6 6 18"/>',
  arrow: '<path d="M4 12h15M13 6l6 6-6 6"/>',
  check: '<path d="m4 12 5 5L20 6"/>',
  lock: '<rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  warning: '<path d="m12 3 9 17H3L12 3Z"/><path d="M12 9v5M12 17.5v.5"/>',
  skull: '<path d="M5 11a7 7 0 1 1 14 0v3l-2 2v3H7v-3l-2-2v-3Z"/><circle cx="9" cy="11" r="1.3"/><circle cx="15" cy="11" r="1.3"/><path d="M10 16h4M12 14v2"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5v.5"/>',
  play: '<path d="m8 5 11 7-11 7V5Z"/>',
  pause: '<path d="M8 5v14M16 5v14"/>',
  sun: '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/>',
  moon: '<path d="M20 15.5A8.5 8.5 0 0 1 8.5 4 8.5 8.5 0 1 0 20 15.5Z"/>',
  signal: '<path d="M5 19v-4M9.5 19v-8M14 19V7M18.5 19V3"/>',
  drop: '<path d="M12 3s6 6.5 6 11a6 6 0 0 1-12 0c0-4.5 6-11 6-11Z"/>',
  heart: '<path d="M12 20S4 15 4 9a4.5 4.5 0 0 1 8-2.8A4.5 4.5 0 0 1 20 9c0 6-8 11-8 11Z"/>',
  bolt: '<path d="m13 2-8 12h6l-1 8 8-12h-6l1-8Z"/>',
};

export function icon(name: IconName, className = ''): string {
  const body = paths[name] ?? paths.spark;
  return `<svg class="icon ${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
}
