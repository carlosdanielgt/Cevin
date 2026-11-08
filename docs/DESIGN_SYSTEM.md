# Cevin Design System (`docs/DESIGN_SYSTEM.md`)

## 1. Art Direction: "Stationery Meets Cockpit"
Cevin pairs warm, paper-like editorial surfaces (`--color-canvas`, `Fraunces` serif display headings, `Plus Jakarta Sans` UI & document prose) with high-precision instrumentation (`JetBrains Mono` reserved strictly for code, URLs, and terminal commands; radial SVG gauges; and a compact 5-stop rotary Voice control).

## 2. Single-Entry Tailwind CSS v4 Token Architecture
All styling tokens are declared in `/src/index.css` using `@import "tailwindcss";`, `@custom-variant dark (&:where(.dark, .dark *));`, and `@theme`.
- **Root Scale:** Responsive root font size on `<html>` (`text-[15px] min-[1920px]:text-[16px] min-[2560px]:text-[18px]`) with a strict 13px (`0.8125rem`) minimum (`--text-xs`).
- **Zero inline styles & zero native `<select>`:** `style={...}` props and native `<select>` tags are forbidden and enforced by automated checks.
- **Dynamic geometry via SVG attributes:** Radial gauge arcs (`strokeDasharray`, `strokeDashoffset`), unclipped rotary dial needles (`viewBox="-2 -2 32 32"`, `transform="rotate(...)"`), and coverage bars (`width`) use native SVG presentation attributes.
- **Dual-theme native color functions:** Semantic tokens use `light-dark(lightValue, darkValue)` paired with `scheme-light dark:scheme-dark` on `<html>`, supporting Light, Dark, and System themes.

## 3. Component Catalog
Visit `/design-system` (accessible via **Settings → Help and About → Open Design System**) to interact with every primitive and signature component live:
- **Primitives (`src/adapters/driving/web/ui/primitives.tsx`)**: `Button`, `SplitButton`, `IconButton`, `Input`, `Textarea`, `Select` (Radix Popover listbox), `SegmentedControl`, `Switch`, `Checkbox`, `Tabs`, `Dialog`, `ConfirmDialog`, `Drawer`, `Disclosure`, `Popover`, `Tooltip`, `ExplanationTooltip`, `ToastBanner` (with Undo), `Badge`, `Card`, `Table`, `Skeleton`, `EmptyState`, `FileDropzone`, `Code`, `CopyCommandField`.
- **Signature Components (`src/adapters/driving/web/ui/signatures.tsx`)**: `SidebarNav`, `StatusPill`, `PageHeader`, `DocumentSwitch`, `CompactStepper`, `GettingStartedCard`, `Gauge`, `VoiceControl`, `BulletRow`, `LetterBlock`, `CoverageBar`, `KeywordChip`, `ScoreChip`, `StatusBadge`, `DiffText`, `StreamingText`, `ResumePage`, `CoverLetterPage`, `VersionCard`, `CommandPalette`.
