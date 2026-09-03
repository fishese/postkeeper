const paths = {
  bookmark: 'M6 3h12v18l-6-4-6 4V3Z',
  inbox: 'M4 4h16l2 12v4H2v-4L4 4Zm-2 12h6l2 3h4l2-3h6',
  library: 'M4 4v16M9 4v16M14 4v16M18 4l4 16',
  unread: 'M3 5h7l2 2 2-2h7v14h-7l-2 2-2-2H3V5Zm9 2v14',
  star: 'm12 3 2.8 5.7 6.2.9-4.5 4.4 1.1 6.2-5.6-3-5.6 3 1.1-6.2L3 9.6l6.2-.9L12 3Z',
  archive: 'M3 3h18v4H3V3Zm2 4v14h14V7M9 11h6',
  folder: 'M3 5h7l2 3h9v12H3V5Z',
  plus: 'M12 5v14M5 12h14',
  close: 'm6 6 12 12M6 18 18 6',
  back: 'm10 5-7 7 7 7M3 12h18',
  search: 'M10 3a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm5 12 6 6',
  settings: 'M4 7h16M4 17h16M8 4v6M16 14v6',
  check: 'm4 12 5 5L20 6',
  link: 'm10 14 4-4M8 16l-1 1a4 4 0 0 1-6-6l5-5a4 4 0 0 1 6 0m4 2 1-1a4 4 0 0 1 6 6l-5 5a4 4 0 0 1-6 0',
  external: 'M14 3h7v7m0-7L10 14M10 3H3v18h18v-7',
  copy: 'M8 8h13v13H8V8ZM4 16H3V3h13v1',
  print: 'M6 8V3h12v5M6 17H3V8h18v9h-3M6 14h12v7H6v-7Z',
  more: 'M5 12h.01M12 12h.01M19 12h.01',
  cloud: 'M6 18a5 5 0 0 1-1-10 7 7 0 0 1 13-1 5.5 5.5 0 0 1 0 11H6Z',
} as const;

export type IconName = keyof typeof paths;

export function Icon({ name }: { name: IconName }) {
  return (
    <svg
      className={`icon icon-${name}`}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      <path d={paths[name]} />
    </svg>
  );
}
