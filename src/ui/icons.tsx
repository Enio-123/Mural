import type { SVGProps } from 'react';

const P: Record<string, string> = {
  back: 'M15 18l-6-6 6-6',
  next: 'M9 18l6-6-6-6',
  settings:
    'M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7zM19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.54V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1.1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.54-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1.1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34H9a1.7 1.7 0 0 0 1-1.54V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87V9a1.7 1.7 0 0 0 1.54 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z',
  refresh: 'M21 12a9 9 0 1 1-2.64-6.36M21 4v5h-5',
  plus: 'M12 5v14M5 12h14',
  close: 'M18 6L6 18M6 6l12 12',
  external: 'M14 4h6v6M20 4l-9 9M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5',
  search: 'M11 18a7 7 0 1 0 0-14 7 7 0 0 0 0 14zM20 20l-4-4',
  book: 'M4 19.5A2.5 2.5 0 0 1 6.5 17H20V3H6.5A2.5 2.5 0 0 0 4 5.5v14zM4 19.5A2.5 2.5 0 0 0 6.5 22H20v-5',
  knight:
    'M8 21h9M7.5 18h10c0-3-1-5.5-2.6-7.6L16 7l-2.5-3.5L11.8 5 10 4.5l-.5 2L6.8 9.2c-.9.9-.9 2.3 0 3.1.7.7 1.8.8 2.6.2L11 11.3c.5 2.2-.8 3.6-3.5 6.7z',
  news: 'M4 5h13a1 1 0 0 1 1 1v12a2 2 0 0 0 2 2H6a2 2 0 0 1-2-2V5zM18 9h2v9a2 2 0 0 1-2 2M8 9h6M8 13h6M8 17h4',
  feed: 'M4 6h16M4 12h16M4 18h10',
  heart: 'M20.8 5.6a5 5 0 0 0-7.1 0L12 7.3l-1.7-1.7a5 5 0 1 0-7.1 7.1L12 21.5l8.8-8.8a5 5 0 0 0 0-7.1z',
  repeat: 'M17 2l4 4-4 4M3 11V9a3 3 0 0 1 3-3h15M7 22l-4-4 4-4M21 13v2a3 3 0 0 1-3 3H3',
  reply: 'M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z',
  flag: 'M5 21V4M5 4h11l-2 4 2 4H5',
  stop: 'M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18zM15 9l-6 6M9 9l6 6',
  list: 'M8 6h12M8 12h12M8 18h12M4 6h.01M4 12h.01M4 18h.01',
  text: 'M4 7V5h12v2M10 5v14M7 19h6M15 13v-2h6v2M18 11v8M16.5 19h3',
  sun: 'M12 17a5 5 0 1 0 0-10 5 5 0 0 0 0 10zM12 1v2M12 21v2M4.2 4.2l1.4 1.4M18.4 18.4l1.4 1.4M1 12h2M21 12h2M4.2 19.8l1.4-1.4M18.4 5.6l1.4-1.4',
  trash: 'M3 6h18M8 6V4h8v2M6 6l1 15h10l1-15',
  download: 'M12 3v12M7 10l5 5 5-5M5 21h14',
  upload: 'M12 21V9M7 14l5-5 5 5M5 3h14',
  play: 'M7 4l13 8-13 8V4z',
  eye: 'M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12zM12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6z',
  check: 'M20 6L9 17l-5-5',
  logout: 'M15 3h4a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2h-4M10 17l-5-5 5-5M5 12h12',
  bulb: 'M9 18h6M10 22h4M12 2a7 7 0 0 0-4 12.7c.6.5 1 1.3 1 2.1V17h6v-.2c0-.8.4-1.6 1-2.1A7 7 0 0 0 12 2z',
  first: 'M18 18l-6-6 6-6M7 6v12',
  last: 'M6 6l6 6-6 6M17 6v12',
  tv: 'M3 6h18v12H3zM8 21h8M12 18v3',
  minus: 'M5 12h14',
  rotate: 'M3 12a9 9 0 0 1 15.5-6.2L21 8M21 3v5h-5M21 12a9 9 0 0 1-15.5 6.2L3 16M3 21v-5h5',
};

export type IconName = keyof typeof P;

export function Icon({ name, ...rest }: { name: IconName } & SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" {...rest}>
      <path d={P[name]} />
    </svg>
  );
}

/** Marca do Mural: o próprio desenho do Enio, um celular com as três fileiras. */
export function BrandMark({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 64 64" aria-hidden="true">
      <rect x="2" y="2" width="60" height="60" rx="15" fill="#15181d" stroke="#2a3038" />
      <rect x="13" y="12" width="17" height="14" rx="3" fill="#c9b48f" />
      <rect x="34" y="12" width="17" height="14" rx="3" fill="#c9b48f" />
      <rect x="13" y="30" width="7" height="11" rx="1.6" fill="#8fcfa8" />
      <rect x="22.5" y="30" width="7" height="11" rx="1.6" fill="#8fcfa8" />
      <rect x="32" y="30" width="7" height="11" rx="1.6" fill="#8fcfa8" />
      <rect x="41.5" y="30" width="7" height="11" rx="1.6" fill="#8fcfa8" />
      <rect x="13" y="45" width="13" height="8" rx="2" fill="#8fb4ff" />
      <rect x="29" y="45" width="13" height="8" rx="2" fill="#8fb4ff" />
      <rect x="45" y="45" width="6" height="8" rx="2" fill="#8fb4ff" />
    </svg>
  );
}
