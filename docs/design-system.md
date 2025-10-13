# Design System Overview

## Color Foundations

| Token | Light Theme | Dark Theme | Contrast Notes |
| --- | --- | --- | --- |
| `--background` / `--foreground` | `hsl(210, 20%, 98%)` / `hsl(222, 47%, 11%)` | `hsl(222, 47%, 11%)` / `hsl(210, 40%, 96%)` | Base text maintains ≥ 15:1 contrast for legibility. |
| `--primary` / `--primary-foreground` | `hsl(221, 83%, 53%)` / `hsl(210, 40%, 98%)` | `hsl(217, 91%, 60%)` / `hsl(222, 47%, 11%)` | ≥ 4.5:1 contrast on buttons and focus rings. |
| `--secondary` / `--secondary-foreground` | `hsl(161, 63%, 41%)` / `hsl(210, 52%, 97%)` | `hsl(164, 61%, 44%)` / `hsl(166, 72%, 10%)` | Balanced tonal contrast for supporting actions. |
| `--accent` / `--accent-foreground` | `hsl(31, 95%, 52%)` / `hsl(24, 83%, 12%)` | `hsl(29, 96%, 63%)` / `hsl(21, 92%, 16%)` | Accent alerts/educational states with ≥ 4.5:1 contrast. |
| `--destructive` / `--destructive-foreground` | `hsl(0, 72%, 51%)` / `hsl(0, 0%, 100%)` | `hsl(0, 82%, 63%)` / `hsl(222, 47%, 11%)` | Meets destructive button contrast in both themes. |
| `--surface-muted` | `hsl(210, 25%, 95%)` | `hsl(222, 47%, 17%)` | Soft background for cards and checklists.
| `--surface-elevated` | `hsl(210, 40%, 100%)` | `hsl(224, 45%, 20%)` | Elevated surfaces with subtle depth.
| `--shadow-soft` | `0px 12px 24px -12px rgba(15, 23, 42, 0.24)` | `0px 16px 32px -12px rgba(8, 47, 73, 0.4)` | Tuned for WCAG compliant focus and depth cues.

Focus indicators use the shared `--focus` token (`hsl(199, 89%, 48%)` in light, `hsl(199, 95%, 66%)` in dark) to guarantee ≥ 3:1 contrast around interactive components.

### POS Palette

The POS surface tokens align with branch branding while maintaining contrast parity:

- Primary: `--pos-primary`
- Secondary: `--pos-secondary`
- Accent: `--pos-accent`
- Backgrounds: `--pos-surface`, `--pos-background`
- Error/Fallback: `--pos-error`

## Typography Scale

The sans-serif stack defaults to Inter with fallbacks. Headings leverage Lexend for a friendly, geometric tone.

| Token | Size | Intended Usage |
| --- | --- | --- |
| `--text-xs` | `0.75rem` | Microcopy, helper text.
| `--text-sm` | `0.875rem` | Body copy in dense layouts.
| `--text-md` | `1rem` | Default body size.
| `--text-lg` | `1.125rem` | Section labels, tertiary headings.
| `--text-xl` | `1.5rem` | Feature callouts and hero metrics.
| `--text-2xl` | `2rem` | Primary hero and marketing statements.

Line heights are tuned for readability:

- `--line-height-tight` (`1.25`) for headings.
- `--line-height-snug` (`1.35`) for cards and summaries.
- `--line-height-relaxed` (`1.6`) for long-form content.

## Spacing Scale

Spacing tokens follow a four-point grid and power component padding/margins:

| Token | Value | Examples |
| --- | --- | --- |
| `--space-2xs` | `0.25rem` | Tight icon badges, divider offsets.
| `--space-xs` | `0.5rem` | Button icon spacing, label gutters.
| `--space-sm` | `0.75rem` | Checklist row padding.
| `--space-md` | `1rem` | Card body padding, standard gaps.
| `--space-lg` | `1.5rem` | Grid gutters, hero spacing.
| `--space-xl` | `2rem` | Section splits on dashboards.
| `--space-2xl` | `3rem` | Page-level breathing room.

## Usage Guidance

- Prefer CSS variable references (`var(--text-md)`) in new components to tap into responsive theming.
- When authoring checklists or accordions, pair `--surface-muted` backgrounds with `--foreground` text for ≥ 7:1 contrast.
- Use `--shadow-soft` on elevated cards and overlays to maintain perceptible focus order.
- Maintain progressive disclosure by pairing card headers (Lexend) with supporting copy (Inter) for cognitive hierarchy.

## Accessibility Checklist

1. Primary, secondary, and accent pairs maintain AA contrast in both themes.
2. Focus outline token `--focus` meets the 3:1 contrast requirement against adjacent surfaces.
3. Typography and spacing tokens remain consistent across `light` and `dark` themes to avoid zoom fatigue.
4. POS-specific surfaces inherit the same contrast ratios to keep parity between retail and admin flows.
