const paths = {
  archive: "M4 5h16v14H4zM8 5V3h8v2M8 10h8M8 14h5",
  code: "m8 9-4 3 4 3m8-6 4 3-4 3m-2-10-2 14",
  story: "M5 4h11a3 3 0 0 1 3 3v12H8a3 3 0 0 0-3 3zm0 0v15a3 3 0 0 1 3 3h11V7a3 3 0 0 0-3-3z",
  platformer: "M4 17h4v3H4zm6-6h4v9h-4zm6-4h4v13h-4z",
} as const;

export type FeatureIconName = keyof typeof paths;

export function FeatureIcon({ name }: { name: FeatureIconName }) {
  return (
    <svg
      aria-hidden="true"
      className="feature-icon"
      fill="none"
      focusable="false"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
    >
      <path d={paths[name]} />
    </svg>
  );
}
