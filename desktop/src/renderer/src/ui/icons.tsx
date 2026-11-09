import type { ReactNode } from 'react';

import { CONTORNO_MANO, INTERIOR_MANO } from './logoPaths';

type Props = { size?: number };

function Svg({ size = 20, children }: Props & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {children}
    </svg>
  );
}

export const IconPhrases = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="3" width="7" height="7" rx="1.5" />
    <rect x="14" y="3" width="7" height="7" rx="1.5" />
    <rect x="3" y="14" width="7" height="7" rx="1.5" />
    <rect x="14" y="14" width="7" height="7" rx="1.5" />
  </Svg>
);
export const IconSettings = (p: Props) => (
  <Svg {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Svg>
);
export const IconMeeting = (p: Props) => (
  <Svg {...p}>
    <rect x="3" y="4" width="18" height="13" rx="2" />
    <path d="M8 21h8M12 17v4" />
  </Svg>
);
export const IconCheck = (p: Props) => (
  <Svg {...p}>
    <path d="M5 12l5 5 9-10" />
  </Svg>
);
export const IconPlay = (p: Props) => (
  <Svg {...p}>
    <path d="M7 5v14l12-7z" />
  </Svg>
);
export const IconExpand = (p: Props) => (
  <Svg {...p}>
    <path d="M14 4h6v6M20 4l-7 7M10 20H4v-6M4 20l7-7" />
  </Svg>
);
export const IconSpeaker = (p: Props) => (
  <Svg {...p}>
    <path d="M11 5L6 9H3v6h3l5 4z" />
    <path d="M15.5 8.5a5 5 0 010 7" />
  </Svg>
);
/** La mano del logo (sin ondas), escalada del lienzo de 120 al de 24. */
export const IconHand = (p: Props) => (
  <Svg {...p}>
    <g transform="translate(1.8 1.2) scale(0.2)" strokeWidth={10}>
      <path d={CONTORNO_MANO} />
      <path d={INTERIOR_MANO} />
    </g>
  </Svg>
);
