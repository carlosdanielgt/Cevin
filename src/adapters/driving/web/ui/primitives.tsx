import * as DialogPrimitive from '@radix-ui/react-dialog';
import * as PopoverPrimitive from '@radix-ui/react-popover';
import * as SwitchPrimitive from '@radix-ui/react-switch';
import * as TabsPrimitive from '@radix-ui/react-tabs';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import {
  Check,
  ChevronDown,
  ChevronRight,
  Copy,
  Info,
  Upload,
  X,
} from 'lucide-react';
import React from 'react';

export function cn(...classes: Array<string | false | null | undefined>): string {
  return classes.filter(Boolean).join(' ');
}

export type ButtonVariant =
  | 'primary'
  | 'secondary'
  | 'tonal'
  | 'ghost'
  | 'danger'
  | 'outline-danger';
export type ButtonSize = 'sm' | 'md' | 'lg';

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    'bg-accent text-white hover:bg-accent-hover shadow-xs border border-transparent',
  secondary:
    'bg-surface text-ink hover:bg-surface-raised border border-border shadow-xs',
  tonal:
    'bg-accent-50 text-accent-700 hover:bg-accent-subtle border border-accent/20',
  ghost:
    'bg-transparent text-ink-muted hover:text-ink hover:bg-surface-raised border border-transparent',
  danger: 'bg-danger text-white hover:opacity-95 border border-transparent shadow-xs',
  'outline-danger':
    'bg-surface text-danger-700 hover:bg-danger-50 border border-danger/35',
};

const BUTTON_SIZES: Record<ButtonSize, string> = {
  sm: 'px-2.5 py-1.5 text-xs gap-1.5 rounded-sm',
  md: 'px-3.5 py-2 text-sm gap-2 rounded-md',
  lg: 'px-5 py-2.5 text-base gap-2.5 rounded-md',
};

export interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'secondary',
      size = 'md',
      type = 'button',
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      className={cn(
        'inline-flex items-center justify-center font-sans font-medium transition-all duration-140 cursor-pointer select-none whitespace-nowrap shrink-0 active:translate-y-[0.5px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-1',
        'disabled:opacity-50 disabled:pointer-events-none',
        BUTTON_VARIANTS[variant],
        BUTTON_SIZES[size],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
Button.displayName = 'Button';

export interface IconButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  label: string;
  variant?: 'ghost' | 'secondary' | 'danger' | 'subtle' | 'ink';
  size?: 'sm' | 'md';
}

const ICON_BUTTON_VARIANTS = {
  ghost:
    'text-ink-muted hover:text-ink hover:bg-surface-raised border border-transparent',
  secondary:
    'bg-surface text-ink hover:bg-surface-raised border border-border shadow-xs',
  subtle:
    'bg-surface-sunken text-ink hover:bg-surface-raised border border-hairline',
  danger:
    'text-ink-muted hover:text-danger-700 hover:bg-danger-50 border border-transparent',
  ink: 'text-ink-400 hover:text-ink-100 hover:bg-ink-800 border border-transparent',
} as const;

export const IconButton = React.forwardRef<HTMLButtonElement, IconButtonProps>(
  (
    {
      label,
      variant = 'ghost',
      size = 'md',
      className,
      type = 'button',
      children,
      ...props
    },
    ref,
  ) => (
    <button
      ref={ref}
      type={type}
      aria-label={label}
      title={label}
      className={cn(
        'inline-flex items-center justify-center rounded-sm transition-colors duration-140 cursor-pointer shrink-0 active:translate-y-[0.5px]',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        'disabled:opacity-40 disabled:pointer-events-none',
        size === 'sm' ? 'w-7 h-7' : 'w-8 h-8',
        ICON_BUTTON_VARIANTS[variant],
        className,
      )}
      {...props}
    >
      {children}
    </button>
  ),
);
IconButton.displayName = 'IconButton';

export type BadgeTone =
  | 'neutral'
  | 'accent'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

const BADGE_TONES: Record<BadgeTone, string> = {
  neutral: 'bg-surface-sunken text-ink-muted border-hairline',
  accent: 'bg-accent-50 text-accent-700 border-accent/20',
  success: 'bg-success-50 text-success-700 border-success/25',
  warning: 'bg-warning-50 text-warning-700 border-warning/25',
  danger: 'bg-danger-50 text-danger-700 border-danger/25',
  info: 'bg-info-50 text-info-700 border-info/25',
};

export function Badge({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2 py-0.5 text-xs font-medium rounded-sm border whitespace-nowrap shrink-0',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Pill({
  tone = 'neutral',
  className,
  children,
}: {
  tone?: BadgeTone;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 px-2.5 py-1 text-xs font-medium rounded-md border whitespace-nowrap shrink-0',
        BADGE_TONES[tone],
        className,
      )}
    >
      {children}
    </span>
  );
}

export function MetricChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 px-2 py-0.5 text-xs font-sans font-semibold tabular-nums rounded-sm bg-accent-50 text-accent-700 border border-accent/20 whitespace-nowrap shrink-0',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function TagChip({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-sans font-medium rounded-sm bg-surface-sunken text-ink-muted border border-hairline whitespace-nowrap shrink-0',
        className,
      )}
    >
      {children}
    </span>
  );
}

export function DeltaChip({
  delta,
  referenceLabel = 'v1',
  className,
}: {
  delta: number;
  referenceLabel?: string;
  className?: string;
}) {
  const rounded = Math.round(delta);
  if (rounded === 0) return null;
  const sign = rounded > 0 ? `+${rounded}` : `${rounded}`;
  const toneClass =
    rounded > 0
      ? 'bg-success-50 text-success-700 border-success/25'
      : 'bg-danger-50 text-danger-700 border-danger/25';

  return (
    <span
      title={`vs ${referenceLabel} (${sign} pts)`}
      aria-label={`${sign} points vs ${referenceLabel}`}
      className={cn(
        'inline-flex items-center px-2 py-0.5 text-xs font-sans font-semibold tabular-nums rounded-sm border whitespace-nowrap shrink-0 cursor-help',
        toneClass,
        className,
      )}
    >
      {sign} pts
    </span>
  );
}

export function StatTile({
  value,
  label,
  subtext,
  tone = 'neutral',
  active = false,
  onClick,
  className,
}: {
  value: number | string;
  label: string;
  subtext?: string;
  tone?: 'neutral' | 'warning' | 'info' | 'success' | 'accent';
  active?: boolean;
  onClick?: () => void;
  className?: string;
}) {
  const isZero = value === 0 || value === '0';
  const effectiveTone = isZero ? 'neutral' : tone;

  const toneClasses = {
    neutral: 'bg-surface border-border text-ink',
    warning: 'bg-warning-50 border-warning/40 text-warning-700',
    info: 'bg-info-50 border-info/35 text-info-700',
    success: 'bg-surface border-border text-ink',
    accent: 'bg-accent-50 border-accent/30 text-accent-700',
  } as const;

  const numberToneClasses = {
    neutral: isZero ? 'text-ink-muted' : 'text-ink',
    warning: 'text-warning-700',
    info: 'text-info-700',
    success: 'text-ink',
    accent: 'text-accent-700',
  } as const;

  const content = (
    <>
      <div
        className={cn(
          'text-[28px] leading-tight font-display font-bold tabular-nums tracking-tight',
          numberToneClasses[effectiveTone],
        )}
      >
        {value}
      </div>
      <div className="text-[13px] font-medium text-ink-muted mt-0.5">
        {label}
      </div>
      {subtext && (
        <div className="text-xs text-ink-subtle mt-0.5 truncate">{subtext}</div>
      )}
    </>
  );

  if (onClick) {
    return (
      <button
        type="button"
        aria-pressed={active}
        onClick={onClick}
        className={cn(
          'flex flex-col items-start text-left rounded-lg border px-3.5 py-2.5 transition-all cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
          toneClasses[effectiveTone],
          active && 'ring-2 ring-accent border-accent shadow-xs',
          !active && 'hover:border-border-strong',
          className,
        )}
      >
        {content}
      </button>
    );
  }

  return (
    <div
      className={cn(
        'flex flex-col items-start text-left rounded-lg border px-3.5 py-2.5',
        toneClasses[effectiveTone],
        className,
      )}
    >
      {content}
    </div>
  );
}

export function Sparkline({
  values,
  label = 'Score trend',
  className,
}: {
  values: number[];
  label?: string;
  className?: string;
}) {
  if (values.length < 3) return null;
  const min = Math.min(...values);
  const max = Math.max(...values);
  if (max === min) return null;

  const width = 84;
  const height = 24;
  const pad = 3;
  const points = values.map((v, idx) => {
    const x =
      pad + (idx / Math.max(1, values.length - 1)) * (width - pad * 2);
    const y =
      height - pad - ((v - min) / Math.max(1, max - min)) * (height - pad * 2);
    return { x: Number(x.toFixed(1)), y: Number(y.toFixed(1)) };
  });

  const polyline = points.map((p) => `${p.x},${p.y}`).join(' ');
  const last = points[points.length - 1];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      aria-label={`${label}: ${values.join(' → ')}`}
      className={cn('inline-block overflow-visible shrink-0', className)}
    >
      <polyline
        fill="none"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinecap="round"
        strokeLinejoin="round"
        points={polyline}
        className="text-accent"
      />
      {last && (
        <circle
          cx={last.x}
          cy={last.y}
          r="2.5"
          className="fill-accent"
        />
      )}
    </svg>
  );
}

export const Input = React.forwardRef<
  HTMLInputElement,
  React.InputHTMLAttributes<HTMLInputElement>
>(({ className, ...props }, ref) => (
  <input
    ref={ref}
    className={cn(
      'w-full bg-surface text-ink border border-border rounded-md px-3 py-2 text-sm font-sans transition-colors duration-140 shadow-xs',
      'placeholder:text-ink-subtle',
      'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
      'disabled:opacity-50 disabled:bg-surface-sunken',
      className,
    )}
    {...props}
  />
));
Input.displayName = 'Input';

export const Textarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement>
>(({ className, ...props }, ref) => (
  <textarea
    ref={ref}
    className={cn(
      'w-full bg-surface text-ink border border-border rounded-md px-3 py-2 text-sm font-sans leading-relaxed transition-colors duration-140 shadow-xs',
      'placeholder:text-ink-subtle',
      'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
      'disabled:opacity-50 disabled:bg-surface-sunken',
      className,
    )}
    {...props}
  />
));
Textarea.displayName = 'Textarea';

/**
 * Auto-growing textarea that uses CSS field-sizing content plus a reliable
 * DOM rows measurement fallback (ResizeObserver + document.fonts.ready + value changes)
 * so bullets, summaries, and cover letter paragraphs never clip.
 */
export const AutoGrowTextarea = React.forwardRef<
  HTMLTextAreaElement,
  React.TextareaHTMLAttributes<HTMLTextAreaElement> & {
    minRows?: number;
    maxRows?: number;
    charsPerRow?: number;
  }
>(
  (
    {
      value,
      minRows = 2,
      maxRows = 28,
      charsPerRow = 52,
      className,
      ...props
    },
    forwardedRef,
  ) => {
    const innerRef = React.useRef<HTMLTextAreaElement | null>(null);
    const setRefs = React.useCallback(
      (node: HTMLTextAreaElement | null) => {
        innerRef.current = node;
        if (typeof forwardedRef === 'function') {
          forwardedRef(node);
        } else if (forwardedRef) {
          forwardedRef.current = node;
        }
      },
      [forwardedRef],
    );

    const text = typeof value === 'string' ? value : String(value ?? '');
    const explicitLines = text.split('\n');
    const initialEstimatedRows = explicitLines.reduce((sum, line) => {
      const wrapped = Math.max(1, Math.ceil(line.length / charsPerRow));
      return sum + wrapped;
    }, 0);
    const initialRows = Math.max(
      minRows,
      Math.min(maxRows, initialEstimatedRows),
    );

    const syncRowsToScrollHeight = React.useCallback(() => {
      const el = innerRef.current;
      if (!el) return;
      let targetRows = Math.max(1, minRows);
      el.rows = targetRows;
      while (el.scrollHeight > el.clientHeight + 1 && targetRows < maxRows) {
        targetRows += 1;
        el.rows = targetRows;
      }
    }, [minRows, maxRows]);

    React.useLayoutEffect(() => {
      syncRowsToScrollHeight();
    }, [text, syncRowsToScrollHeight]);

    React.useEffect(() => {
      const el = innerRef.current;
      if (!el) return;

      syncRowsToScrollHeight();

      if (typeof document !== 'undefined' && document.fonts?.ready) {
        void document.fonts.ready.then(() => {
          syncRowsToScrollHeight();
        });
      }

      if (typeof ResizeObserver !== 'undefined') {
        const ro = new ResizeObserver(() => {
          syncRowsToScrollHeight();
        });
        ro.observe(el);
        return () => ro.disconnect();
      }
      return undefined;
    }, [syncRowsToScrollHeight]);

    return (
      <textarea
        ref={setRefs}
        rows={initialRows}
        value={value}
        className={cn(
          'w-full bg-surface text-ink border border-border rounded-md px-3 py-2 text-sm font-sans leading-relaxed transition-colors duration-140 resize-none overflow-hidden [field-sizing:content]',
          'placeholder:text-ink-subtle',
          'focus:outline-none focus:border-accent focus:ring-2 focus:ring-accent/20',
          'disabled:opacity-60 disabled:bg-surface-sunken',
          className,
        )}
        {...props}
      />
    );
  },
);
AutoGrowTextarea.displayName = 'AutoGrowTextarea';

export function Card({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-lg shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

/**
 * Primary elevated work surface panel with hairline dividers between sections.
 */
export function Panel({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'bg-surface border border-border rounded-xl shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function PanelSection({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <section
      className={cn(
        'p-5 border-b border-hairline last:border-b-0',
        className,
      )}
      {...props}
    >
      {children}
    </section>
  );
}

export function StickyFooterBar({
  className,
  children,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        'sticky bottom-0 z-10 bg-surface/95 backdrop-blur-xs border-t border-border px-5 py-3.5 rounded-b-xl flex flex-wrap items-center justify-between gap-4 shadow-sm',
        className,
      )}
      {...props}
    >
      {children}
    </div>
  );
}

export function Banner({
  tone = 'info',
  icon,
  title,
  actions,
  className,
  children,
}: {
  tone?: 'info' | 'success' | 'warning' | 'danger' | 'accent';
  icon?: React.ReactNode;
  title?: string;
  actions?: React.ReactNode;
  className?: string;
  children?: React.ReactNode;
}) {
  const toneClasses = {
    info: 'bg-info-50 text-info-700 border-info/25',
    success: 'bg-success-50 text-success-700 border-success/25',
    warning: 'bg-warning-50 text-warning-700 border-warning/25',
    danger: 'bg-danger-50 text-danger-700 border-danger/25',
    accent: 'bg-accent-50 text-accent-700 border-accent/25',
  } as const;

  return (
    <div
      className={cn(
        'rounded-lg border px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs',
        toneClasses[tone],
        className,
      )}
    >
      <div className="flex items-start gap-2.5 min-w-0">
        {icon && <span className="shrink-0 mt-0.5">{icon}</span>}
        <div className="min-w-0">
          {title && <div className="font-semibold">{title}</div>}
          {children && <div className="leading-relaxed">{children}</div>}
        </div>
      </div>
      {actions && <div className="flex items-center gap-2 shrink-0">{actions}</div>}
    </div>
  );
}

const AVATAR_HUE_CLASSES = [
  'bg-avatar-0-bg text-avatar-0-fg',
  'bg-avatar-1-bg text-avatar-1-fg',
  'bg-avatar-2-bg text-avatar-2-fg',
  'bg-avatar-3-bg text-avatar-3-fg',
  'bg-avatar-4-bg text-avatar-4-fg',
  'bg-avatar-5-bg text-avatar-5-fg',
  'bg-avatar-6-bg text-avatar-6-fg',
  'bg-avatar-7-bg text-avatar-7-fg',
] as const;

export function getCompanyAvatarHueIndex(name: string): number {
  const clean = (name || 'Company').trim().toLowerCase();
  let hash = 0;
  for (let i = 0; i < clean.length; i++) {
    hash = (hash * 31 + clean.charCodeAt(i)) >>> 0;
  }
  return hash % AVATAR_HUE_CLASSES.length;
}

export function getCompanyInitials(name: string): string {
  const words = (name || 'Co')
    .trim()
    .split(/[\s&-]+/)
    .filter(Boolean);
  if (words.length >= 2) {
    return `${words[0][0] ?? ''}${words[1][0] ?? ''}`.toUpperCase();
  }
  return (words[0]?.slice(0, 2) ?? 'CO').toUpperCase();
}

export function Avatar({
  name,
  size = 'md',
  className,
}: {
  name: string;
  size?: 'xs' | 'sm' | 'md' | 'lg';
  className?: string;
}) {
  const hueIdx = getCompanyAvatarHueIndex(name);
  const initials = getCompanyInitials(name);
  const sizeClass =
    size === 'xs'
      ? 'w-6 h-6 text-xs rounded-sm'
      : size === 'sm'
        ? 'w-9 h-9 text-xs rounded-md'
        : size === 'lg'
          ? 'w-16 h-16 text-xl rounded-lg'
          : 'w-10 h-10 text-sm rounded-md';

  return (
    <div
      aria-hidden="true"
      className={cn(
        'inline-flex items-center justify-center font-display font-bold shrink-0 select-none border border-hairline',
        AVATAR_HUE_CLASSES[hueIdx],
        sizeClass,
        className,
      )}
    >
      {initials}
    </div>
  );
}

/**
 * 120px 1-color line art with accent highlight for empty states.
 */
export function SpotIllustration({
  kind = 'applications',
  className,
}: {
  kind?: 'applications' | 'bank' | 'job' | 'versions';
  className?: string;
}) {
  return (
    <svg
      width="120"
      height="96"
      viewBox="0 0 120 96"
      fill="none"
      aria-hidden="true"
      className={cn('mx-auto select-none', className)}
    >
      {/* Recessed desk mat */}
      <rect
        x="14"
        y="12"
        width="92"
        height="72"
        rx="10"
        className="fill-surface-sunken stroke-border"
        strokeWidth="1.5"
      />
      {/* Paper sheet */}
      <rect
        x="32"
        y="18"
        width="56"
        height="60"
        rx="4"
        className="fill-paper stroke-border-strong"
        strokeWidth="1.5"
      />
      {/* Accent header bar on paper */}
      <rect
        x="40"
        y="26"
        width="24"
        height="4"
        rx="2"
        className="fill-accent"
      />
      <rect
        x="40"
        y="35"
        width="40"
        height="2.5"
        rx="1.25"
        className="fill-ink-subtle/40"
      />
      <rect
        x="40"
        y="42"
        width="34"
        height="2.5"
        rx="1.25"
        className="fill-ink-subtle/40"
      />
      <rect
        x="40"
        y="49"
        width="38"
        height="2.5"
        rx="1.25"
        className="fill-ink-subtle/40"
      />
      {kind === 'job' ? (
        <circle
          cx="78"
          cy="62"
          r="11"
          className="fill-accent-50 stroke-accent"
          strokeWidth="1.75"
        />
      ) : (
        <rect
          x="40"
          y="58"
          width="20"
          height="6"
          rx="3"
          className="fill-accent-50 stroke-accent"
          strokeWidth="1.25"
        />
      )}
    </svg>
  );
}

export function Switch({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <SwitchPrimitive.Root
      checked={checked}
      onCheckedChange={onCheckedChange}
      disabled={disabled}
      aria-label={label}
      className={cn(
        'w-9 h-5 rounded-full relative transition-colors duration-140 cursor-pointer shrink-0 border border-transparent',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        checked ? 'bg-accent' : 'bg-surface-sunken border-border-strong',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      <SwitchPrimitive.Thumb
        className={cn(
          'block w-4 h-4 bg-white rounded-full shadow-xs transition-transform duration-140',
          checked ? 'translate-x-4' : 'translate-x-0.5',
        )}
      />
    </SwitchPrimitive.Root>
  );
}

export function Checkbox({
  checked,
  onCheckedChange,
  label,
  disabled,
}: {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => onCheckedChange(!checked)}
      className={cn(
        'w-4 h-4 rounded-xs border flex items-center justify-center transition-colors duration-140 cursor-pointer shrink-0',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        checked
          ? 'bg-accent border-accent text-white'
          : 'bg-surface border-border-strong hover:border-accent',
        disabled && 'opacity-50 pointer-events-none',
      )}
    >
      {checked && <Check className="w-3 h-3 stroke-[3]" />}
    </button>
  );
}

export interface SelectOption<T extends string = string> {
  value: T;
  label: string;
  description?: string;
}

/**
 * Custom accessible Select dropdown built on Radix Popover (never uses a native browser dropdown tag).
 */
export function Select<T extends string = string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  placeholder = 'Choose option',
  className,
  disabled,
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: SelectOption<T>[];
  ariaLabel: string;
  placeholder?: string;
  className?: string;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);
  const selected = options.find((o) => o.value === value);

  return (
    <PopoverPrimitive.Root open={open} onOpenChange={setOpen}>
      <PopoverPrimitive.Trigger asChild>
        <button
          type="button"
          aria-label={ariaLabel}
          disabled={disabled}
          className={cn(
            'inline-flex items-center justify-between gap-2 bg-surface text-ink border border-border rounded-md px-3 py-2 text-sm font-sans transition-colors cursor-pointer shadow-xs',
            'hover:bg-surface-raised focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
            disabled && 'opacity-50 pointer-events-none',
            className,
          )}
        >
          <span className="truncate">{selected?.label ?? placeholder}</span>
          <ChevronDown className="w-4 h-4 text-ink-muted shrink-0" />
        </button>
      </PopoverPrimitive.Trigger>
      <PopoverPrimitive.Portal>
        <PopoverPrimitive.Content
          align="start"
          sideOffset={4}
          className="z-50 min-w-[12rem] bg-surface-overlay border border-border rounded-md p-1 shadow-lg focus:outline-none"
        >
          <div role="listbox" aria-label={ariaLabel}>
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  onClick={() => {
                    onValueChange(opt.value);
                    setOpen(false);
                  }}
                  className={cn(
                    'w-full flex items-center justify-between gap-3 px-2.5 py-1.5 rounded-sm text-xs text-left transition-colors cursor-pointer',
                    isSelected
                      ? 'bg-accent-50 text-accent-700 font-semibold'
                      : 'text-ink hover:bg-surface-raised',
                  )}
                >
                  <div className="min-w-0">
                    <div className="truncate">{opt.label}</div>
                    {opt.description && (
                      <div className="text-ink-muted truncate mt-0.5">
                        {opt.description}
                      </div>
                    )}
                  </div>
                  {isSelected && <Check className="w-3.5 h-3.5 shrink-0" />}
                </button>
              );
            })}
          </div>
        </PopoverPrimitive.Content>
      </PopoverPrimitive.Portal>
    </PopoverPrimitive.Root>
  );
}

export function SegmentedControl<T extends string = string>({
  value,
  onValueChange,
  options,
  ariaLabel,
  size = 'md',
}: {
  value: T;
  onValueChange: (value: T) => void;
  options: Array<{ value: T; label: string; count?: number }>;
  ariaLabel: string;
  size?: 'sm' | 'md';
}) {
  return (
    <div
      role="group"
      aria-label={ariaLabel}
      className="inline-flex items-center bg-surface-sunken p-1 rounded-md border border-hairline"
    >
      {options.map((opt) => {
        const active = opt.value === value;
        return (
          <button
            key={opt.value}
            type="button"
            aria-pressed={active}
            onClick={() => onValueChange(opt.value)}
            className={cn(
              'inline-flex items-center gap-1.5 font-sans font-medium rounded-sm transition-all duration-140 cursor-pointer whitespace-nowrap',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
              size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3 py-1.5 text-xs',
              active
                ? 'bg-surface text-ink shadow-xs font-semibold'
                : 'text-ink-muted hover:text-ink',
            )}
          >
            <span>{opt.label}</span>
            {opt.count !== undefined && (
              <span
                className={cn(
                  'tabular-nums text-xs',
                  active ? 'text-accent' : 'text-ink-subtle',
                )}
              >
                ({opt.count})
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

export const Tabs = TabsPrimitive.Root;

export function TabsList({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.List>) {
  return (
    <TabsPrimitive.List
      className={cn(
        'inline-flex items-center gap-1 bg-surface-sunken p-1 rounded-md border border-hairline',
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.List>
  );
}

export function TabsTrigger({
  className,
  children,
  ...props
}: React.ComponentPropsWithoutRef<typeof TabsPrimitive.Trigger>) {
  return (
    <TabsPrimitive.Trigger
      className={cn(
        'px-3 py-1.5 text-xs font-medium text-ink-muted rounded-sm transition-all duration-140 cursor-pointer whitespace-nowrap shrink-0',
        'hover:text-ink data-[state=active]:bg-surface data-[state=active]:text-ink data-[state=active]:shadow-xs data-[state=active]:font-semibold',
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent',
        className,
      )}
      {...props}
    >
      {children}
    </TabsPrimitive.Trigger>
  );
}

export const TabsContent = TabsPrimitive.Content;

export const Dialog = DialogPrimitive.Root;
export const DialogTrigger = DialogPrimitive.Trigger;

export function DialogContent({
  title,
  description,
  children,
  className,
}: {
  title: string;
  description?: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <DialogPrimitive.Portal>
      <DialogPrimitive.Overlay className="fixed inset-0 bg-ink-950/55 backdrop-blur-xs z-40" />
      <DialogPrimitive.Content
        className={cn(
          'fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-50 w-full max-w-xl bg-surface-overlay border border-border rounded-xl p-6 shadow-lg focus:outline-none max-h-[88vh] overflow-y-auto',
          className,
        )}
      >
        <div className="flex items-start justify-between gap-4 mb-4">
          <div>
            <DialogPrimitive.Title className="text-lg font-display font-semibold text-ink">
              {title}
            </DialogPrimitive.Title>
            {description && (
              <DialogPrimitive.Description className="text-xs text-ink-muted mt-1">
                {description}
              </DialogPrimitive.Description>
            )}
          </div>
          <DialogPrimitive.Close asChild>
            <IconButton label="Close dialog" size="sm">
              <X className="w-4 h-4" />
            </IconButton>
          </DialogPrimitive.Close>
        </div>
        {children}
      </DialogPrimitive.Content>
    </DialogPrimitive.Portal>
  );
}

export function Drawer({
  open,
  onOpenChange,
  title,
  description,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <DialogPrimitive.Root open={open} onOpenChange={onOpenChange}>
      <DialogPrimitive.Portal>
        <DialogPrimitive.Overlay className="fixed inset-0 bg-ink-950/45 backdrop-blur-xs z-40" />
        <DialogPrimitive.Content className="fixed right-0 top-0 bottom-0 z-50 w-full max-w-xl bg-surface-overlay border-l border-border p-6 shadow-lg focus:outline-none overflow-y-auto flex flex-col">
          <div className="flex items-start justify-between gap-4 pb-4 border-b border-hairline">
            <div>
              <DialogPrimitive.Title className="text-lg font-display font-semibold text-ink">
                {title}
              </DialogPrimitive.Title>
              {description && (
                <DialogPrimitive.Description className="text-xs text-ink-muted mt-1">
                  {description}
                </DialogPrimitive.Description>
              )}
            </div>
            <DialogPrimitive.Close asChild>
              <IconButton label="Close drawer" size="sm">
                <X className="w-4 h-4" />
              </IconButton>
            </DialogPrimitive.Close>
          </div>
          <div className="flex-1 pt-5">{children}</div>
        </DialogPrimitive.Content>
      </DialogPrimitive.Portal>
    </DialogPrimitive.Root>
  );
}

export const Popover = PopoverPrimitive.Root;
export const PopoverTrigger = PopoverPrimitive.Trigger;

export function PopoverContent({
  children,
  className,
  align = 'end',
}: {
  children: React.ReactNode;
  className?: string;
  align?: 'start' | 'center' | 'end';
}) {
  return (
    <PopoverPrimitive.Portal>
      <PopoverPrimitive.Content
        align={align}
        sideOffset={6}
        className={cn(
          'z-50 w-72 bg-surface-overlay border border-border rounded-lg p-3.5 shadow-lg text-xs text-ink focus:outline-none',
          className,
        )}
      >
        {children}
      </PopoverPrimitive.Content>
    </PopoverPrimitive.Portal>
  );
}

export const TooltipProvider = TooltipPrimitive.Provider;

export function Tooltip({
  content,
  children,
}: {
  content: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <TooltipPrimitive.Root delayDuration={180}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          sideOffset={5}
          className="z-50 max-w-xs bg-ink-900 text-ink-100 px-2.5 py-1.5 rounded-sm text-xs shadow-md leading-snug border border-ink-700"
        >
          {content}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}

export function InfoTip({ text }: { text: string }) {
  return (
    <Tooltip content={text}>
      <button
        type="button"
        aria-label={text}
        className="inline-flex items-center justify-center text-ink-subtle hover:text-ink transition-colors cursor-help focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent rounded-xs"
      >
        <Info className="w-3.5 h-3.5" />
      </button>
    </Tooltip>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return (
    <div
      aria-hidden="true"
      className={cn(
        'animate-pulse bg-surface-sunken rounded-sm border border-hairline',
        className,
      )}
    />
  );
}

export function EmptyState({
  icon,
  illustrationKind,
  title,
  description,
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
}: {
  icon?: React.ReactNode;
  illustrationKind?: 'applications' | 'bank' | 'job' | 'versions';
  title: string;
  description: string;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
}) {
  return (
    <div className="bg-surface border border-border rounded-xl p-10 text-center max-w-xl mx-auto my-6 shadow-sm">
      {illustrationKind ? (
        <div className="mb-4">
          <SpotIllustration kind={illustrationKind} />
        </div>
      ) : (
        icon && (
          <div className="w-11 h-11 rounded-md bg-accent-50 text-accent-700 flex items-center justify-center mx-auto mb-4">
            {icon}
          </div>
        )
      )}
      <h3 className="text-lg font-display font-semibold text-ink mb-2">
        {title}
      </h3>
      <p className="text-sm text-ink-muted leading-relaxed mb-6">
        {description}
      </p>
      <div className="flex items-center justify-center gap-3">
        {actionLabel && onAction && (
          <Button variant="primary" onClick={onAction}>
            {actionLabel}
          </Button>
        )}
        {secondaryActionLabel && onSecondaryAction && (
          <Button variant="secondary" onClick={onSecondaryAction}>
            {secondaryActionLabel}
          </Button>
        )}
      </div>
    </div>
  );
}

export interface ToastMessage {
  id: string;
  title?: string;
  message?: string;
  variant?: 'info' | 'success' | 'warning' | 'danger' | 'neutral';
  tone?: 'neutral' | 'success' | 'danger';
  actionLabel?: string;
  onAction?: () => void;
  undoLabel?: string;
  onUndo?: () => void;
}

export type ToastItem = ToastMessage;

export function ToastBanner({
  toasts,
  onDismiss,
}: {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}) {
  if (toasts.length === 0) return null;
  return (
    <div
      aria-live="polite"
      className="fixed bottom-5 right-5 z-50 flex flex-col gap-2 max-w-md"
    >
      {toasts.map((t) => {
        const isDanger = t.tone === 'danger' || t.variant === 'danger';
        const actionFn = t.onAction ?? t.onUndo;
        const actionText = t.actionLabel ?? t.undoLabel ?? 'Undo';
        return (
          <div
            key={t.id}
            className={cn(
              'flex items-center justify-between gap-4 px-4 py-3 rounded-lg shadow-lg border text-xs font-medium',
              isDanger
                ? 'bg-danger text-white border-danger'
                : 'bg-ink-950 text-ink-100 border-ink-800',
            )}
          >
            <span>{t.title ?? t.message}</span>
            <div className="flex items-center gap-2 shrink-0">
              {actionFn && (
                <button
                  type="button"
                  onClick={() => {
                    actionFn();
                    onDismiss(t.id);
                  }}
                  className="underline font-semibold hover:opacity-80 cursor-pointer text-accent-50"
                >
                  {actionText}
                </button>
              )}
              <button
                type="button"
                aria-label="Dismiss notification"
                onClick={() => onDismiss(t.id)}
                className="opacity-70 hover:opacity-100 cursor-pointer"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        );
      })}
    </div>
  );
}

export function Disclosure({
  title,
  defaultOpen = false,
  badge,
  children,
}: {
  title: string;
  defaultOpen?: boolean;
  badge?: React.ReactNode;
  children: React.ReactNode;
}) {
  const [open, setOpen] = React.useState(defaultOpen);
  return (
    <div className="border border-hairline rounded-lg bg-surface-sunken/50 overflow-hidden">
      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className="w-full px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs font-semibold text-ink hover:bg-surface-sunken transition-colors cursor-pointer text-left"
      >
        <span className="inline-flex items-center gap-2">
          {open ? (
            <ChevronDown className="w-3.5 h-3.5 text-ink-muted shrink-0" />
          ) : (
            <ChevronRight className="w-3.5 h-3.5 text-ink-muted shrink-0" />
          )}
          <span>{title}</span>
        </span>
        {badge && <span>{badge}</span>}
      </button>
      {open && (
        <div className="p-3.5 border-t border-hairline bg-surface">
          {children}
        </div>
      )}
    </div>
  );
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  requireTypedText,
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  requireTypedText?: string;
  onConfirm: () => void;
}) {
  const [typed, setTyped] = React.useState('');
  const canConfirm = !requireTypedText || typed.trim() === requireTypedText;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent title={title} description={description} className="max-w-md">
        <div className="space-y-4">
          {requireTypedText && (
            <div>
              <label
                htmlFor="confirm-typed-input"
                className="block text-xs font-medium text-ink mb-1.5"
              >
                Type <strong>{requireTypedText}</strong> to confirm:
              </label>
              <Input
                id="confirm-typed-input"
                value={typed}
                onChange={(e) => setTyped(e.target.value)}
                placeholder={requireTypedText}
              />
            </div>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              variant="danger"
              disabled={!canConfirm}
              onClick={() => {
                setTyped('');
                onConfirm();
              }}
            >
              {confirmLabel}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function SplitButton({
  primaryLabel,
  primaryIcon,
  onPrimaryClick,
  items,
  disabled,
}: {
  primaryLabel: string;
  primaryIcon?: React.ReactNode;
  onPrimaryClick: () => void;
  items: Array<{ id: string; label: string; onSelect: () => void }>;
  disabled?: boolean;
}) {
  const [open, setOpen] = React.useState(false);

  return (
    <div className="inline-flex items-center rounded-md shadow-xs">
      <Button
        variant="primary"
        size="md"
        disabled={disabled}
        onClick={onPrimaryClick}
        className="rounded-r-none border-r border-white/20"
      >
        {primaryIcon}
        <span>{primaryLabel}</span>
      </Button>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="primary"
            size="md"
            aria-label="More export options"
            disabled={disabled}
            className="rounded-l-none px-2.5"
          >
            <ChevronDown className="w-4 h-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-60 p-1">
          <div role="menu" aria-label="Export formats">
            {items.map((item) => (
              <button
                key={item.id}
                type="button"
                role="menuitem"
                onClick={() => {
                  setOpen(false);
                  item.onSelect();
                }}
                className="w-full flex items-center justify-between px-3 py-2 text-xs text-ink rounded-sm hover:bg-surface-raised text-left cursor-pointer"
              >
                <span>{item.label}</span>
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
    </div>
  );
}

export function CopyCommandField({ command }: { command: string }) {
  const [copied, setCopied] = React.useState(false);
  return (
    <div className="flex items-center justify-between gap-2 bg-surface-sunken border border-border rounded-md px-3 py-2 font-mono text-xs text-ink">
      <code className="truncate select-all">{command}</code>
      <button
        type="button"
        onClick={() => {
          if (typeof navigator !== 'undefined' && navigator.clipboard) {
            void navigator.clipboard.writeText(command);
          }
          setCopied(true);
          setTimeout(() => setCopied(false), 1600);
        }}
        className="inline-flex items-center gap-1 px-2 py-1 rounded-xs bg-surface border border-border text-xs font-sans font-medium text-ink hover:bg-surface-raised shrink-0 cursor-pointer"
      >
        {copied ? (
          <>
            <Check className="w-3 h-3 text-success" />
            <span>Copied</span>
          </>
        ) : (
          <>
            <Copy className="w-3 h-3 text-ink-muted" />
            <span>Copy</span>
          </>
        )}
      </button>
    </div>
  );
}

export function FileDropzone({
  acceptedExtensions,
  acceptedLabels,
  onFileSelected,
  isBusy = false,
}: {
  acceptedExtensions: string[];
  acceptedLabels: string[];
  onFileSelected: (file: File) => void;
  isBusy?: boolean;
}) {
  const inputRef = React.useRef<HTMLInputElement | null>(null);
  return (
    <div
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault();
        const file = e.dataTransfer.files?.[0];
        if (file) onFileSelected(file);
      }}
      onClick={() => inputRef.current?.click()}
      className="border-2 border-dashed border-border-strong hover:border-accent rounded-xl p-8 text-center bg-surface-sunken/50 hover:bg-accent-50/30 transition-colors cursor-pointer space-y-2"
    >
      <input
        ref={inputRef}
        type="file"
        accept={acceptedExtensions.join(',')}
        aria-label="Upload resume file"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFileSelected(f);
          e.target.value = '';
        }}
      />
      <div className="w-10 h-10 rounded-full bg-surface border border-border flex items-center justify-center mx-auto text-accent shadow-xs">
        {isBusy ? (
          <CevinMark state="thinking" size={24} variant="tile" />
        ) : (
          <Upload className="w-4 h-4" />
        )}
      </div>
      <div
        role={isBusy ? 'status' : undefined}
        aria-live={isBusy ? 'polite' : undefined}
        className="text-sm font-semibold text-ink"
      >
        {isBusy
          ? 'Cevin is reading your resume'
          : 'Drop your resume here or click to browse'}
      </div>
      <div className="text-xs text-ink-muted">
        Supports {acceptedLabels.join(', ')} ({acceptedExtensions.join(', ')})
      </div>
    </div>
  );
}

export interface TypeaheadOption {
  id?: string;
  value?: string;
  label: string;
  sublabel?: string;
  keywords?: string[];
}

/**
 * Accessible TypeaheadField primitive supporting bundled canonical tables
 * plus optional free-text fallback with an explicit recognition note.
 */
export function TypeaheadField({
  id,
  value,
  onChange,
  onSelectOption,
  onSelect,
  onBlur,
  options,
  placeholder,
  ariaLabel,
  unrecognizedMessage,
  isRecognized = true,
  className,
}: {
  id?: string;
  value: string;
  onChange: (nextValue: string) => void;
  onSelectOption?: (option: TypeaheadOption) => void;
  onSelect?: (selectedValue: string) => void;
  onBlur?: () => void;
  options: TypeaheadOption[];
  placeholder?: string;
  ariaLabel?: string;
  unrecognizedMessage?: string;
  isRecognized?: boolean;
  className?: string;
}) {
  const [open, setOpen] = React.useState(false);
  const [activeIndex, setActiveIndex] = React.useState(0);
  const containerRef = React.useRef<HTMLDivElement | null>(null);

  const query = value.trim().toLowerCase();
  const filtered = React.useMemo(() => {
    if (!query) return options.slice(0, 8);
    return options
      .filter((opt) => {
        const keyId = opt.id ?? opt.value ?? opt.label;
        if (opt.label.toLowerCase().includes(query)) return true;
        if (opt.sublabel?.toLowerCase().includes(query)) return true;
        if (keyId.toLowerCase().includes(query)) return true;
        return (opt.keywords ?? []).some((k) =>
          k.toLowerCase().includes(query),
        );
      })
      .slice(0, 8);
  }, [options, query]);

  React.useEffect(() => {
    setActiveIndex(0);
  }, [query]);

  React.useEffect(() => {
    const handleOutside = (e: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, []);

  const commitOption = (opt: TypeaheadOption) => {
    const selectedVal = opt.value ?? opt.label;
    onChange(opt.label);
    onSelectOption?.(opt);
    onSelect?.(selectedVal);
    setOpen(false);
  };

  return (
    <div ref={containerRef} className={cn('relative w-full', className)}>
      <Input
        id={id}
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-label={ariaLabel}
        value={value}
        placeholder={placeholder}
        onFocus={() => setOpen(true)}
        onBlur={onBlur}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onKeyDown={(e) => {
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((prev) =>
              filtered.length > 0 ? (prev + 1) % filtered.length : 0,
            );
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setOpen(true);
            setActiveIndex((prev) =>
              filtered.length > 0
                ? (prev - 1 + filtered.length) % filtered.length
                : 0,
            );
          } else if (e.key === 'Enter' && open && filtered[activeIndex]) {
            e.preventDefault();
            commitOption(filtered[activeIndex]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
      />
      {open && filtered.length > 0 && (
        <div
          role="listbox"
          className="absolute left-0 right-0 top-full mt-1 z-30 bg-surface border border-border rounded-md shadow-md max-h-52 overflow-y-auto p-1"
        >
          {filtered.map((opt, idx) => {
            const keyId = opt.id ?? opt.value ?? opt.label;
            return (
              <button
                key={keyId}
                type="button"
                role="option"
                aria-selected={idx === activeIndex}
                onMouseDown={(e) => {
                  e.preventDefault();
                  commitOption(opt);
                }}
                className={cn(
                  'w-full flex items-center justify-between gap-2 px-2.5 py-1.5 rounded-xs text-xs text-left transition-colors cursor-pointer',
                  idx === activeIndex
                    ? 'bg-accent-50 text-accent-700 font-semibold'
                    : 'text-ink hover:bg-surface-raised',
                )}
              >
                <span>{opt.label}</span>
                {opt.sublabel && (
                  <span className="text-[11px] text-ink-muted">
                    {opt.sublabel}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      )}
      {value.trim().length > 0 && !isRecognized && unrecognizedMessage && (
        <p className="mt-1 text-[11px] text-ink-muted">{unrecognizedMessage}</p>
      )}
    </div>
  );
}

/**
 * MultiSelectChips with typeahead suggestions (excluding already-selected items)
 * used for authorized countries, citizenships, and multi-tag fields.
 */
export function MultiSelectChips({
  id,
  values,
  onChange,
  options,
  placeholder = 'Type to add…',
  ariaLabel,
}: {
  id?: string;
  values: string[];
  onChange: (nextValues: string[]) => void;
  options: TypeaheadOption[];
  placeholder?: string;
  ariaLabel?: string;
}) {
  const [inputVal, setInputVal] = React.useState('');

  const availableOptions = React.useMemo(() => {
    const lowerSelected = new Set(values.map((v) => v.toLowerCase()));
    return options.filter((opt) => {
      const keyId = (opt.id ?? opt.value ?? opt.label).toLowerCase();
      return (
        !lowerSelected.has(opt.label.toLowerCase()) &&
        !lowerSelected.has(keyId)
      );
    });
  }, [options, values]);


  const handleAdd = (raw: string) => {
    const clean = raw.trim();
    if (!clean) return;
    if (values.some((v) => v.toLowerCase() === clean.toLowerCase())) {
      setInputVal('');
      return;
    }
    onChange([...values, clean]);
    setInputVal('');
  };

  const handleRemove = (target: string) => {
    onChange(values.filter((v) => v !== target));
  };

  return (
    <div className="space-y-2">
      {values.length > 0 && (
        <div className="flex flex-wrap items-center gap-1.5">
          {values.map((val) => (
            <span
              key={val}
              className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs bg-surface-sunken border border-border text-ink font-medium"
            >
              <span>{val}</span>
              <button
                type="button"
                aria-label={`Remove ${val}`}
                onClick={() => handleRemove(val)}
                className="text-ink-subtle hover:text-danger-700 cursor-pointer"
              >
                <X className="w-3 h-3" />
              </button>
            </span>
          ))}
        </div>
      )}
      <TypeaheadField
        id={id}
        ariaLabel={ariaLabel}
        value={inputVal}
        onChange={setInputVal}
        options={availableOptions}
        placeholder={placeholder}
        onSelectOption={(opt) => {
          handleAdd(opt.label);
        }}
      />
    </div>
  );
}

export type CevinMarkState = 'idle' | 'thinking' | 'writing' | 'done' | 'error';
export type CevinMarkVariant = 'tile' | 'glyph';

const CEVIN_OPTION_A_GEOMETRY = {
  tilePath:
    'M14 0H48L64 16V50A14 14 0 0 1 50 64H14A14 14 0 0 1 0 50V14A14 14 0 0 1 14 0Z',
  foldPath: 'M48 0V16H64Z',
  ringPath: 'M45.11 41.18A16 16 0 1 1 45.11 22.82',
  dot: { cx: 48.5, cy: 32, r: 4.2 },
  iconOnlyDot: { cx: 48.8, cy: 32, r: 4.0 },
} as const;

const CEVIN_OPTION_B_GEOMETRY = {
  framePath: 'M52 12H24A12 12 0 0 0 12 24V40A12 12 0 0 0 24 52H52',
  bullet: { cx: 27, cy: 32, r: 3.5 },
  linePath: 'M36 32H50',
} as const;

function buildWordmarkGeometry(x0: 88 | 80) {
  if (x0 === 88) {
    return {
      cPath: 'M121.11 41.18A16 16 0 1 1 121.11 22.82',
      ePath: 'M136 32H168A16 16 0 1 0 165.11 41.18',
      vPath: 'M181 16L196 48L211 16',
      iStemPath: 'M227 16V48',
      iDot: { cx: 227, cy: 5, r: 3.8 },
      nPath: 'M245 48V16M245 31A14 14 0 0 1 273 31V48',
    };
  }
  return {
    cPath: 'M113.11 41.18A16 16 0 1 1 113.11 22.82',
    ePath: 'M128 32H160A16 16 0 1 0 157.11 41.18',
    vPath: 'M173 16L188 48L203 16',
    iStemPath: 'M219 16V48',
    iDot: { cx: 219, cy: 5, r: 3.8 },
    nPath: 'M237 48V16M237 31A14 14 0 0 1 265 31V48',
  };
}

function computeProgressOrbitAngleDeg(progress: number): number {
  const clamped = Math.max(0, Math.min(1, Number.isFinite(progress) ? progress : 0));
  return Math.round(clamped * 360 * 100) / 100;
}

export interface CevinMarkProps {
  state?: CevinMarkState;
  size?: 16 | 24 | 40 | 64;
  variant?: CevinMarkVariant;
  progress?: number;
  onThinkingLoopIteration?: () => void;
  className?: string;
}

const CEVIN_STATE_CLASSES: Record<CevinMarkState, string> = {
  idle: '',
  thinking: 'is-thinking',
  writing: 'is-writing',
  done: 'is-done',
  error: 'is-error',
};

/**
 * Pure-geometry animated Cevin mark (`tile` or `glyph`).
 * Uses CSS @theme keyframes from src/index.css and SVG transform attributes for determinate progress.
 */
export function CevinMark({
  state = 'idle',
  size = 24,
  variant = 'tile',
  progress,
  onThinkingLoopIteration,
  className,
}: CevinMarkProps) {
  const hasDeterminateProgress =
    typeof progress === 'number' && Number.isFinite(progress);
  const effectiveState: CevinMarkState =
    hasDeterminateProgress && state === 'thinking' ? 'idle' : state;
  const orbitDeg = hasDeterminateProgress
    ? computeProgressOrbitAngleDeg(progress)
    : 0;
  const dotTransform =
    hasDeterminateProgress && orbitDeg !== 0
      ? `rotate(${orbitDeg} 32 32)`
      : undefined;

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 64 64"
      width={size}
      height={size}
      fill="none"
      aria-hidden="true"
      data-cevin-state={state}
      data-cevin-variant={variant}
      className={cn(
        'cevin-mark shrink-0 select-none',
        variant === 'glyph' && 'is-glyph',
        CEVIN_STATE_CLASSES[effectiveState],
        className,
      )}
    >
      {variant === 'tile' && (
        <>
          <path
            id="tile-body"
            d={CEVIN_OPTION_A_GEOMETRY.tilePath}
          />
          <path
            id="tile-fold"
            d={CEVIN_OPTION_A_GEOMETRY.foldPath}
          />
        </>
      )}
      <path
        id="ring"
        d={CEVIN_OPTION_A_GEOMETRY.ringPath}
      />
      <circle
        id="ping"
        cx={CEVIN_OPTION_A_GEOMETRY.dot.cx}
        cy={CEVIN_OPTION_A_GEOMETRY.dot.cy}
        r={CEVIN_OPTION_A_GEOMETRY.dot.r}
      />
      <circle
        id="dot"
        cx={CEVIN_OPTION_A_GEOMETRY.dot.cx}
        cy={CEVIN_OPTION_A_GEOMETRY.dot.cy}
        r={CEVIN_OPTION_A_GEOMETRY.dot.r}
        transform={dotTransform}
        onAnimationIteration={
          state === 'thinking' ? onThinkingLoopIteration : undefined
        }
      />
    </svg>
  );
}

/**
 * Accessible status indicator pairing a decorative CevinMark (`aria-hidden="true"`)
 * with a `role="status"` live region carrying sentence-case copy.
 */
export function CevinStatusIndicator({
  state = 'thinking',
  label,
  size = 16,
  variant = 'glyph',
  progress,
  onThinkingLoopIteration,
  className,
  labelClassName,
}: {
  state?: CevinMarkState;
  label: string;
  size?: 16 | 24 | 40 | 64;
  variant?: CevinMarkVariant;
  progress?: number;
  onThinkingLoopIteration?: () => void;
  className?: string;
  labelClassName?: string;
}) {
  return (
    <span
      role="status"
      aria-live="polite"
      className={cn('inline-flex items-center gap-2', className)}
    >
      <CevinMark
        state={state}
        size={size}
        variant={variant}
        progress={progress}
        onThinkingLoopIteration={onThinkingLoopIteration}
      />
      <span className={cn('text-xs font-medium', labelClassName)}>{label}</span>
    </span>
  );
}

/**
 * Pure-geometry Cevin wordmark & logo (Option A: folded sheet, Option B: bullet C, or icon-only).
 * Built strictly from SVG primitives (`path`, `circle`, `rect`) with zero `<text>` or `<font>` elements.
 */
export function CevinLogo({
  option = 'A',
  scheme = 'color',
  iconOnly = false,
  height = 28,
  className,
}: {
  option?: 'A' | 'B';
  scheme?: 'color' | 'dark' | 'mono';
  iconOnly?: boolean;
  height?: number;
  className?: string;
}) {
  const isDark = scheme === 'dark';
  const isMono = scheme === 'mono';

  if (iconOnly) {
    const width = height;
    if (option === 'B') {
      const strokeColor = isDark ? '#F4F1EB' : '#151A22';
      const accentColor = isMono
        ? strokeColor
        : isDark
          ? '#5B8CFF'
          : '#1D4ED8';
      return (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 64 64"
          width={width}
          height={height}
          fill="none"
          aria-hidden="true"
          className={cn('shrink-0 select-none', className)}
        >
          <path
            d={CEVIN_OPTION_B_GEOMETRY.framePath}
            stroke={strokeColor}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={CEVIN_OPTION_B_GEOMETRY.bullet.cx}
            cy={CEVIN_OPTION_B_GEOMETRY.bullet.cy}
            r={CEVIN_OPTION_B_GEOMETRY.bullet.r}
            fill={accentColor}
          />
          <path
            d={CEVIN_OPTION_B_GEOMETRY.linePath}
            stroke={accentColor}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </svg>
      );
    }

    const tileFill = isDark ? '#F4F1EB' : '#151A22';
    const ringStroke = isDark ? '#151A22' : '#FFFFFF';
    const dotFill = isMono
      ? ringStroke
      : isDark
        ? '#5B8CFF'
        : '#1D4ED8';

    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 64 64"
        width={width}
        height={height}
        fill="none"
        aria-hidden="true"
        className={cn('shrink-0 select-none', className)}
      >
        <rect width="64" height="64" rx="14" fill={tileFill} />
        <path
          d={CEVIN_OPTION_A_GEOMETRY.ringPath}
          stroke={ringStroke}
          strokeWidth="9"
          strokeLinecap="round"
        />
        <circle
          cx={CEVIN_OPTION_A_GEOMETRY.iconOnlyDot.cx}
          cy={CEVIN_OPTION_A_GEOMETRY.iconOnlyDot.cy}
          r={CEVIN_OPTION_A_GEOMETRY.iconOnlyDot.r}
          fill={dotFill}
        />
      </svg>
    );
  }

  const isOptionA = option === 'A';
  const viewBoxWidth = isOptionA ? 296 : 276;
  const wordmarkX0 = isOptionA ? 88 : 80;
  const wordmark = buildWordmarkGeometry(wordmarkX0);
  const computedWidth = Math.round((height * viewBoxWidth) / 64);

  const inkStroke = isDark ? '#F4F1EB' : '#151A22';
  const cobaltFill = isMono
    ? inkStroke
    : isDark
      ? '#5B8CFF'
      : '#1D4ED8';

  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox={`0 0 ${viewBoxWidth} 64`}
      width={computedWidth}
      height={height}
      fill="none"
      aria-hidden="true"
      className={cn('shrink-0 select-none', className)}
    >
      {isOptionA ? (
        <g>
          <path
            d={CEVIN_OPTION_A_GEOMETRY.tilePath}
            fill={isDark ? '#F4F1EB' : '#151A22'}
          />
          {!isMono && (
            <path
              d={CEVIN_OPTION_A_GEOMETRY.foldPath}
              fill={isDark ? '#D9D4C8' : '#2A3342'}
            />
          )}
          <path
            d={CEVIN_OPTION_A_GEOMETRY.ringPath}
            stroke={isDark ? '#151A22' : '#FFFFFF'}
            strokeWidth="8"
            strokeLinecap="round"
          />
          <circle
            cx={CEVIN_OPTION_A_GEOMETRY.dot.cx}
            cy={CEVIN_OPTION_A_GEOMETRY.dot.cy}
            r={CEVIN_OPTION_A_GEOMETRY.dot.r}
            fill={isMono ? (isDark ? '#151A22' : '#FFFFFF') : cobaltFill}
          />
        </g>
      ) : (
        <g>
          <path
            d={CEVIN_OPTION_B_GEOMETRY.framePath}
            stroke={inkStroke}
            strokeWidth="8"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <circle
            cx={CEVIN_OPTION_B_GEOMETRY.bullet.cx}
            cy={CEVIN_OPTION_B_GEOMETRY.bullet.cy}
            r={CEVIN_OPTION_B_GEOMETRY.bullet.r}
            fill={cobaltFill}
          />
          <path
            d={CEVIN_OPTION_B_GEOMETRY.linePath}
            stroke={cobaltFill}
            strokeWidth="4"
            strokeLinecap="round"
          />
        </g>
      )}
      <g
        stroke={inkStroke}
        strokeWidth="6"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      >
        <path d={wordmark.cPath} />
        <path d={wordmark.ePath} />
        <path d={wordmark.vPath} />
        <path d={wordmark.iStemPath} />
        <circle
          cx={wordmark.iDot.cx}
          cy={wordmark.iDot.cy}
          r={wordmark.iDot.r}
          fill={cobaltFill}
          stroke="none"
        />
        <path d={wordmark.nPath} />
      </g>
    </svg>
  );
}


