// Inline SVG icons for the mock pills. Stroke-based, 14×14, follow currentColor.
const SW = 1.5

function Svg({ children, size = 14 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={SW}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {children}
    </svg>
  )
}

export const SearchIcon = () => (
  <Svg>
    <circle cx="11" cy="11" r="7" />
    <path d="m21 21-4.35-4.35" />
  </Svg>
)
export const PinIcon = () => (
  <Svg>
    <path d="M12 22s7-7 7-12a7 7 0 1 0-14 0c0 5 7 12 7 12Z" />
    <circle cx="12" cy="10" r="2.5" />
  </Svg>
)
export const SunIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="3.5" />
    <path d="M12 3v1.5M12 19.5V21M3 12h1.5M19.5 12H21M5.6 5.6l1 1M17.4 17.4l1 1M5.6 18.4l1-1M17.4 6.6l1-1" />
  </Svg>
)
export const CloudIcon = () => (
  <Svg>
    <path d="M7 17a4 4 0 1 1 1-7.9A6 6 0 0 1 19 11a4 4 0 0 1 0 8H7Z" />
  </Svg>
)
export const CameraIcon = () => (
  <Svg>
    <path d="M3 7h3l1.5-2h9L18 7h3v12H3z" />
    <circle cx="12" cy="13" r="3.5" />
  </Svg>
)
export const ApertureIcon = () => (
  <Svg>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 3 8 12l4 9 4-9-4-9Z" />
    <path d="M3 12h18" />
  </Svg>
)
export const PencilIcon = () => (
  <Svg>
    <path d="M4 20h4l11-11-4-4L4 16v4Z" />
    <path d="m13.5 6.5 4 4" />
  </Svg>
)
export const FrameIcon = () => (
  <Svg>
    <rect x="3.5" y="3.5" width="17" height="17" rx="1" />
    <rect x="6.5" y="6.5" width="11" height="11" />
  </Svg>
)
export const ImageIcon = () => (
  <Svg>
    <rect x="3.5" y="4.5" width="17" height="15" rx="1.5" />
    <circle cx="9" cy="10" r="1.5" />
    <path d="m4 18 5-5 4 4 3-3 4 4" />
  </Svg>
)
export const SparkleIcon = () => (
  <Svg>
    <path d="M12 3v6M12 15v6M3 12h6M15 12h6M5.5 5.5l4 4M14.5 14.5l4 4M5.5 18.5l4-4M14.5 9.5l4-4" />
  </Svg>
)
export const TrashIcon = () => (
  <Svg>
    <path d="M4 7h16M9 7V4h6v3M6 7l1 13a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-13M10 11v6M14 11v6" />
  </Svg>
)
export const SaveIcon = () => (
  <Svg>
    <path d="M5 4h11l3 3v13H5z" />
    <path d="M8 4v5h7V4M8 14h8v6H8z" />
  </Svg>
)
export const LayersIcon = () => (
  <Svg>
    <path d="M12 2 2 8l10 6 10-6-10-6Z" />
    <path d="M2 14l10 6 10-6M2 11l10 6 10-6" />
  </Svg>
)
export const EyeIcon = () => (
  <Svg>
    <path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
)
export const EyeOffIcon = () => (
  <Svg>
    <path d="M3 3l18 18" />
    <path d="M10.5 6.1A11.5 11.5 0 0 1 12 6c6.5 0 10 7 10 7a16.4 16.4 0 0 1-3.6 4.4M6.6 6.6A16 16 0 0 0 2 13s3.5 7 10 7c1.4 0 2.7-.3 3.9-.8" />
    <path d="M9.9 9.9A3 3 0 0 0 14 14" />
  </Svg>
)
export const CameraSnapIcon = () => (
  <Svg>
    <path d="M3 7h3l1.5-2h9L18 7h3v12H3z" />
    <circle cx="12" cy="13" r="3.5" />
    <circle cx="18" cy="9" r="0.6" fill="currentColor" />
  </Svg>
)
