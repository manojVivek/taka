import type { SVGProps } from 'react';

type IconProps = SVGProps<SVGSVGElement>;

const baseProps: SVGProps<SVGSVGElement> = {
  viewBox: '0 0 16 16',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.4,
  strokeLinecap: 'square',
  strokeLinejoin: 'miter',
};

export const Ico = {
  Dashboard: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <rect x="2" y="2" width="5" height="6" />
      <rect x="9" y="2" width="5" height="3" />
      <rect x="2" y="10" width="5" height="4" />
      <rect x="9" y="7" width="5" height="7" />
    </svg>
  ),
  Play: (p: IconProps) => (
    <svg viewBox="0 0 16 16" fill="currentColor" {...p}>
      <path d="M4 3l9 5-9 5z" />
    </svg>
  ),
  Sessions: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <rect x="2" y="3" width="12" height="8" />
      <path d="M5 14h6M8 11v3" />
    </svg>
  ),
  Tests: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M6 2v4L3 13a2 2 0 002 2h6a2 2 0 002-2L10 6V2M5 2h6M5 10h6" />
    </svg>
  ),
  Book: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M3 3.5A1.5 1.5 0 014.5 2H13v11H4.5A1.5 1.5 0 003 14.5V3.5z" />
      <path d="M3 14.5A1.5 1.5 0 014.5 13H13" />
    </svg>
  ),
  Settings: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <rect x="6" y="6" width="4" height="4" />
      <path d="M8 1.5v2.5m0 8v2.5m6.5-6.5h-2.5m-8 0H1.5m11.1-4.6l-1.8 1.8M4.7 11.3l-1.8 1.8m0-9.2l1.8 1.8m6.6 6.6l1.8 1.8" />
    </svg>
  ),
  Search: (p: IconProps) => (
    <svg {...baseProps} strokeLinecap="round" {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3 3" />
    </svg>
  ),
  Plus: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M8 3v10M3 8h10" />
    </svg>
  ),
  Chevron: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M5 6l3 3 3-3" />
    </svg>
  ),
  ChevronR: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M6 4l4 4-4 4" />
    </svg>
  ),
  Check: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M3 8.5l3.5 3.5 7-7" />
    </svg>
  ),
  X: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M4 4l8 8M12 4l-8 8" />
    </svg>
  ),
  Copy: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <rect x="5" y="5" width="9" height="9" />
      <path d="M11 5V2H2v9h3" />
    </svg>
  ),
  Filter: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M2 3h12l-5 6v4l-2 1V9L2 3z" />
    </svg>
  ),
  Sort: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M5 3v10M3 11l2 2 2-2M11 13V3M9 5l2-2 2 2" />
    </svg>
  ),
  Click: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M5 5l1.5 6.5L8 9l3.5-1L5 5zM9.5 9.5L13 13" />
    </svg>
  ),
  Input: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <rect x="2" y="5" width="12" height="6" />
      <path d="M5 7v2" />
    </svg>
  ),
  Scroll: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M8 2v12M5 5l3-3 3 3M5 11l3 3 3-3" />
    </svg>
  ),
  Nav: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M3 8h10M9 4l4 4-4 4" />
    </svg>
  ),
  Mutation: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <rect x="2" y="2" width="3" height="3" />
      <rect x="11" y="11" width="3" height="3" />
      <path d="M5 5l6 6" />
    </svg>
  ),
  Focus: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <rect x="3" y="3" width="10" height="10" />
      <rect x="6" y="6" width="4" height="4" />
    </svg>
  ),
  Submit: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M2 8h10M9 4l4 4-4 4M14 4v8" />
    </svg>
  ),
  Resize: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M4 12V4h8M12 4l-3 3M4 12l3-3" />
    </svg>
  ),
  Mouse: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M3 3l4 10 2-4 4-2L3 3z" />
    </svg>
  ),
  External: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M6 3H3v10h10v-3M9 3h4v4M13 3L7 9" />
    </svg>
  ),
  Sun: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <rect x="5" y="5" width="6" height="6" />
      <path d="M8 1.5v2m0 9v2m-6.5-6.5h2m9 0h2M3.5 3.5l1.5 1.5m6 6l1.5 1.5m0-9l-1.5 1.5m-6 6l-1.5 1.5" />
    </svg>
  ),
  Moon: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M13 9.5A6 6 0 016.5 3a6 6 0 106.5 6.5z" />
    </svg>
  ),
  Trash: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M3 4h10M6 4V2h4v2M5 4v9h6V4" />
    </svg>
  ),
  Refresh: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M14 8a6 6 0 11-1.8-4.3M14 2v3h-3" />
    </svg>
  ),
  Layers: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M8 2l6 3-6 3-6-3 6-3zM2 8l6 3 6-3M2 11l6 3 6-3" />
    </svg>
  ),
  Slider: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M2 4h12M2 12h12" />
      <rect x="9" y="2.5" width="3" height="3" fill="currentColor" />
      <rect x="4" y="10.5" width="3" height="3" fill="currentColor" />
    </svg>
  ),
  Zoom: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <circle cx="7" cy="7" r="4.5" />
      <path d="M10.5 10.5l3 3M5 7h4M7 5v4" />
    </svg>
  ),
  Eye: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <path d="M1.5 8s2.5-4.5 6.5-4.5S14.5 8 14.5 8 12 12.5 8 12.5 1.5 8 1.5 8z" />
      <circle cx="8" cy="8" r="2" />
    </svg>
  ),
  Term: (p: IconProps) => (
    <svg {...baseProps} {...p}>
      <rect x="2" y="3" width="12" height="10" />
      <path d="M5 7l2 1.5L5 10M9 10h3" />
    </svg>
  ),
};

export type IconKey = keyof typeof Ico;
