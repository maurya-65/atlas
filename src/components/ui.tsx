import type { ComponentProps, ReactNode } from "react";

/** Join class names, skipping empty values. */
export function cn(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

/* ---------- Button ---------- */

type ButtonVariant = "default" | "outline" | "secondary" | "ghost" | "live";
type ButtonSize = "default" | "sm" | "xs" | "icon" | "option";

const BUTTON_BASE =
  "inline-flex shrink-0 items-center justify-center rounded-full border border-transparent bg-clip-padding text-sm font-medium transition-all outline-none select-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 active:translate-y-px disabled:pointer-events-none disabled:opacity-40 [&_svg]:pointer-events-none [&_svg]:shrink-0 [&_svg:not([class*='size-'])]:size-4";

const GLASS_BUTTON = "border-white/12 bg-white/[0.07] text-foreground backdrop-blur-md hover:border-white/20 hover:bg-white/[0.12]";

const BUTTON_VARIANT: Record<ButtonVariant, string> = {
  // White fill, black text: the one obvious action.
  default: "bg-primary text-primary-foreground hover:bg-white/85",
  // Translucent grey glass.
  outline: GLASS_BUTTON,
  secondary: GLASS_BUTTON,
  // Text only.
  ghost: "text-muted-foreground hover:bg-white/[0.07] hover:text-foreground",
  // Real money: the only coloured button.
  live: "bg-live text-black hover:bg-live/85",
};

const BUTTON_SIZE: Record<ButtonSize, string> = {
  default: "h-9 gap-1.5 px-4 whitespace-nowrap",
  sm: "h-8 gap-1.5 px-3 whitespace-nowrap",
  xs: "h-6 gap-1 px-2.5 text-xs whitespace-nowrap",
  icon: "size-8",
  // Decision options: labels can be long, so these may wrap.
  option: "min-h-9 gap-1.5 px-4 py-1.5 text-left",
};

export function buttonClass(variant: ButtonVariant = "default", size: ButtonSize = "default", className?: string) {
  return cn(BUTTON_BASE, BUTTON_VARIANT[variant], BUTTON_SIZE[size], className);
}

export function Button({
  variant = "default",
  size = "default",
  className,
  type = "button",
  ...props
}: ComponentProps<"button"> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} data-slot="button" className={buttonClass(variant, size, className)} {...props} />;
}

/* ---------- Card ---------- */

export function Card({ className, size, ...props }: ComponentProps<"section"> & { size?: "sm" }) {
  return (
    <section
      data-slot="card"
      className={cn(
        "glass flex flex-col overflow-hidden rounded-2xl text-sm text-card-foreground",
        size === "sm" ? "gap-4 py-4 [--card-pad:1rem]" : "gap-5 py-5 [--card-pad:1.25rem] sm:gap-6 sm:py-6 sm:[--card-pad:1.5rem]",
        className,
      )}
      {...props}
    />
  );
}

export function CardHeader({ className, ...props }: ComponentProps<"div">) {
  return (
    <div
      data-slot="card-header"
      className={cn(
        "grid auto-rows-min items-start gap-1 px-(--card-pad) has-data-[slot=card-action]:grid-cols-[1fr_auto]",
        className,
      )}
      {...props}
    />
  );
}

export function CardTitle({ className, ...props }: ComponentProps<"h2">) {
  return <h2 data-slot="card-title" className={cn("text-base leading-snug font-semibold tracking-tight", className)} {...props} />;
}

export function CardDescription({ className, ...props }: ComponentProps<"p">) {
  return <p data-slot="card-description" className={cn("text-sm text-muted-foreground", className)} {...props} />;
}

export function CardAction({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-action" className={cn("col-start-2 row-span-2 row-start-1 self-start justify-self-end", className)} {...props} />;
}

export function CardContent({ className, ...props }: ComponentProps<"div">) {
  return <div data-slot="card-content" className={cn("px-(--card-pad)", className)} {...props} />;
}

/* ---------- Badge ---------- */

type BadgeVariant = "default" | "secondary" | "outline" | "soft" | "paper" | "live" | "decision" | "up" | "down" | "sample";

const BADGE_VARIANT: Record<BadgeVariant, string> = {
  default: "bg-primary text-primary-foreground",
  secondary: "bg-white/[0.08] text-muted-foreground",
  outline: "border-white/15 text-foreground",
  soft: "bg-white/[0.1] text-foreground",
  paper: "border-white/12 bg-white/[0.05] text-muted-foreground",
  live: "border-live/40 bg-live/10 text-live",
  decision: "border-white/20 bg-white/[0.14] text-foreground",
  up: "bg-white/[0.12] text-foreground",
  down: "bg-white/[0.05] text-muted-foreground",
  sample: "border-dashed border-white/25 text-[10px] tracking-wider text-muted-foreground uppercase",
};

export function Badge({ variant = "secondary", className, ...props }: ComponentProps<"span"> & { variant?: BadgeVariant }) {
  return (
    <span
      data-slot="badge"
      className={cn(
        "inline-flex h-5 w-fit shrink-0 items-center justify-center gap-1 overflow-hidden rounded-full border border-transparent px-2 py-0.5 text-xs font-medium whitespace-nowrap [&>svg]:size-3",
        BADGE_VARIANT[variant],
        className,
      )}
      {...props}
    />
  );
}

/** Quiet tag for made-up example content, so nobody mistakes it for their account. */
export function SampleTag({ className }: { className?: string }) {
  return (
    <Badge variant="sample" className={className}>
      Sample
    </Badge>
  );
}

/* ---------- Form controls ---------- */

const CONTROL =
  "w-full min-w-0 rounded-xl border border-white/12 bg-white/[0.05] text-base transition-[color,box-shadow,border-color] outline-none placeholder:text-muted-foreground focus-visible:border-white/30 focus-visible:ring-3 focus-visible:ring-ring/30 disabled:cursor-not-allowed disabled:opacity-50 md:text-sm";

export function Input({ className, ...props }: ComponentProps<"input">) {
  return <input data-slot="input" className={cn(CONTROL, "h-9 px-3 py-1", className)} {...props} />;
}

export function Textarea({ className, ...props }: ComponentProps<"textarea">) {
  return <textarea data-slot="textarea" className={cn(CONTROL, "px-3 py-2", className)} {...props} />;
}

export function Select({ className, ...props }: ComponentProps<"select">) {
  return <select data-slot="native-select" className={cn(CONTROL, "h-9 px-2 py-1", className)} {...props} />;
}

export function Label({ className, ...props }: ComponentProps<"label">) {
  return <label data-slot="label" className={cn("text-sm leading-none font-medium select-none", className)} {...props} />;
}

/** A real checkbox drawn as a switch, so it keeps native keyboard and form behaviour. */
export function Switch({ className, ...props }: Omit<ComponentProps<"input">, "type">) {
  return (
    <input
      type="checkbox"
      role="switch"
      data-slot="switch"
      className={cn(
        "relative h-5 w-9 shrink-0 appearance-none rounded-full border border-white/10 bg-white/[0.14] transition-colors outline-none",
        "before:absolute before:top-1/2 before:left-0.5 before:size-3.5 before:-translate-y-1/2 before:rounded-full before:bg-neutral-400 before:transition-transform before:content-['']",
        "checked:bg-white checked:before:translate-x-4 checked:before:bg-black",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}

/* ---------- Table ---------- */

export function Table({ className, ...props }: ComponentProps<"table">) {
  return (
    <div data-slot="table-container" className="relative w-full overflow-x-auto">
      <table data-slot="table" className={cn("w-full caption-bottom text-sm", className)} {...props} />
    </div>
  );
}

export function Th({ className, ...props }: ComponentProps<"th">) {
  return (
    <th
      data-slot="table-head"
      scope="col"
      className={cn(
        "h-9 px-2 text-left align-middle text-xs font-medium tracking-wider whitespace-nowrap text-muted-foreground uppercase first:pl-(--card-pad) last:pr-(--card-pad)",
        className,
      )}
      {...props}
    />
  );
}

export function Tr({ className, ...props }: ComponentProps<"tr">) {
  return <tr data-slot="table-row" className={cn("border-t border-white/[0.07] transition-colors hover:bg-white/[0.04]", className)} {...props} />;
}

export function Td({ className, ...props }: ComponentProps<"td">) {
  return <td data-slot="table-cell" className={cn("h-14 p-2 align-middle first:pl-(--card-pad) last:pr-(--card-pad)", className)} {...props} />;
}

/* ---------- Small pieces ---------- */

export function Progress({ value, label, className }: { value: number; label: string; className?: string }) {
  const v = Math.max(0, Math.min(100, value));
  return (
    <div
      data-slot="progress-track"
      role="meter"
      aria-valuemin={0}
      aria-valuemax={100}
      aria-valuenow={Math.round(v)}
      aria-label={label}
      className={cn("h-1.5 w-full overflow-hidden rounded-full bg-white/10", className)}
    >
      <div data-slot="progress-indicator" className="h-full rounded-full bg-primary" style={{ width: `${Math.max(2, v)}%` }} />
    </div>
  );
}

type Tone = "neutral" | "blue" | "green" | "amber" | "purple";

/** Square glass icon holder, as on the template's stat tiles. Monochrome: `tone` is accepted but no longer colours it. */
export function IconTile({ children }: { children: ReactNode; tone?: Tone }) {
  return (
    <span
      aria-hidden
      className="grid size-9 shrink-0 place-items-center rounded-xl border border-white/10 bg-white/[0.06] text-foreground/80 [&>svg]:size-[18px]"
    >
      {children}
    </span>
  );
}

/** Stat tile: icon and label, one big number, one short line. Every tile has the same structure. */
export function StatTile({
  icon,
  label,
  marker,
  value,
  children,
}: {
  icon: ReactNode;
  tone?: Tone;
  label: string;
  /** Small badge next to the label, e.g. "Simulated" */
  marker?: ReactNode;
  value: ReactNode;
  children?: ReactNode;
}) {
  return (
    <Card size="sm" className="h-full gap-3">
      <CardContent className="flex items-center gap-3">
        <IconTile>{icon}</IconTile>
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-0.5 text-sm text-muted-foreground">
          {label}
          {marker}
        </div>
      </CardContent>
      <CardContent>
        <div className="truncate text-3xl font-semibold tracking-tight tabular-nums">{value}</div>
        <div className="mt-1.5 min-h-10 text-sm text-muted-foreground">{children}</div>
      </CardContent>
    </Card>
  );
}

/** Empty state: says what would be here and how to get it. */
export function Empty({ icon, title, children }: { icon?: ReactNode; title: string; children?: ReactNode }) {
  return (
    <div data-slot="empty" className="flex flex-col items-center gap-2 rounded-xl border border-white/10 bg-white/[0.03] px-6 py-8 text-center">
      {icon && (
        <span aria-hidden className="grid size-10 place-items-center rounded-xl bg-white/[0.06] text-muted-foreground [&>svg]:size-5">
          {icon}
        </span>
      )}
      <div className="font-medium">{title}</div>
      {children && <div className="max-w-sm text-sm text-muted-foreground">{children}</div>}
    </div>
  );
}

/** Small uppercase heading used inside cards. */
export function Eyebrow({ className, ...props }: ComponentProps<"h4">) {
  return <h4 className={cn("text-xs font-medium tracking-wider text-muted-foreground uppercase", className)} {...props} />;
}

/** "Show details" disclosure, closed by default: the one way long content is tucked away in the feed. */
export function Details({ children, label = "details", className }: { children: ReactNode; label?: string; className?: string }) {
  return (
    <details className={cn("group/details", className)}>
      <summary className="-ml-2 inline-flex h-7 items-center gap-1.5 rounded-full px-2.5 text-xs font-medium text-muted-foreground transition-colors select-none hover:bg-white/[0.07] hover:text-foreground">
        <span aria-hidden className="text-[10px] transition-transform group-open/details:rotate-90">
          &#9656;
        </span>
        <span className="group-open/details:hidden">Show {label}</span>
        <span className="hidden group-open/details:inline">Hide {label}</span>
      </summary>
      <div className="mt-3 space-y-4 border-t border-white/[0.08] pt-4 text-sm">{children}</div>
    </details>
  );
}

/**
 * The one pattern every feed item follows: small uppercase kind label + time, a clear title,
 * at most two lines of summary, optional actions, and everything else behind "Show details".
 */
export function FeedItem({
  kind,
  time,
  tag,
  title,
  summary,
  children,
  details,
  detailsLabel,
  emphasis = false,
  label,
}: {
  kind: string;
  /** Already formatted, e.g. "9:41 AM" */
  time?: ReactNode;
  /** Small quiet tag after the kind label (origin, "Sample", …) */
  tag?: ReactNode;
  title: ReactNode;
  summary?: ReactNode;
  /** Always-visible extras under the summary: the recommendation line and the option buttons */
  children?: ReactNode;
  details?: ReactNode;
  detailsLabel?: string;
  /** Open decisions get a slightly brighter pane */
  emphasis?: boolean;
  label?: string;
}) {
  return (
    <article aria-label={label ?? kind} className={cn("glass rounded-2xl p-4 text-sm sm:p-5", emphasis && "border-white/20 bg-white/[0.03]")}>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] font-medium tracking-wider text-muted-foreground uppercase">
        {emphasis && <span aria-hidden className="size-1.5 rounded-full bg-white" />}
        <span className={emphasis ? "text-foreground" : undefined}>{kind}</span>
        {tag}
        {time && <span className="ml-auto font-normal tracking-normal normal-case tabular-nums">{time}</span>}
      </div>
      <h3 className="mt-2 text-base leading-snug font-semibold tracking-tight">{title}</h3>
      {summary && <div className="mt-1 line-clamp-2 leading-relaxed text-muted-foreground">{summary}</div>}
      {children}
      {details && <Details label={detailsLabel} className="mt-3">{details}</Details>}
    </article>
  );
}

/** Quiet tag for cards created outside Atlas, e.g. by Claude through the Atlas MCP server. */
export function OriginTag({ origin }: { origin?: string }) {
  if (!origin) return null;
  return <span className="rounded-full border border-white/12 px-1.5 py-px text-[10px] tracking-normal normal-case">From {origin}</span>;
}

/** A slim one-line feed row (resolved decisions, receipts) that still opens to the full text. */
export function FeedRow({ kind, text, time, children, tone }: { kind: string; text: ReactNode; time?: ReactNode; children?: ReactNode; tone?: "live" }) {
  return (
    <details className={cn("group/row rounded-xl border border-white/[0.08] bg-white/[0.025] text-sm", tone === "live" && "border-live/35")}>
      <summary className="flex items-center gap-2.5 px-3.5 py-2">
        <span className={cn("shrink-0 text-[11px] font-medium tracking-wider uppercase", tone === "live" ? "text-live" : "text-muted-foreground")}>{kind}</span>
        <span className="min-w-0 flex-1 truncate text-foreground/90">{text}</span>
        {time && <span className="shrink-0 text-xs text-muted-foreground tabular-nums">{time}</span>}
        <span aria-hidden className="shrink-0 text-[10px] text-muted-foreground transition-transform group-open/row:rotate-90">
          &#9656;
        </span>
      </summary>
      {children && <div className="space-y-3 border-t border-white/[0.08] px-3.5 py-3">{children}</div>}
    </details>
  );
}
