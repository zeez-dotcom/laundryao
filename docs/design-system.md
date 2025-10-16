# Design System Overview

## Color Foundations

| Token | Light Theme | Dark Theme | Contrast Notes |
| --- | --- | --- | --- |
| `--background` / `--foreground` | `hsl(210, 33%, 98%)` / `hsl(222, 47%, 11%)` | `hsl(222, 47%, 12%)` / `hsl(210, 40%, 96%)` | Baseline text hits ≥ 15:1 contrast for legibility. |
| `--primary` / `--primary-foreground` | `hsl(226, 71%, 45%)` / `hsl(210, 40%, 98%)` | `hsl(217, 91%, 60%)` / `hsl(222, 47%, 12%)` | Primary buttons & rings exceed AA contrast on both themes. |
| `--secondary` / `--secondary-foreground` | `hsl(168, 83%, 28%)` / `hsl(166, 100%, 96%)` | `hsl(162, 70%, 38%)` / `hsl(168, 100%, 12%)` | Deep teal pair calibrated for 4.8:1 contrast. |
| `--accent` / `--accent-foreground` | `hsl(28, 84%, 52%)` / `hsl(23, 81%, 14%)` | `hsl(29, 92%, 60%)` / `hsl(23, 82%, 16%)` | Warm accent for education/upsell moments with AA coverage. |
| `--destructive` / `--destructive-foreground` | `hsl(0, 72%, 42%)` / `hsl(0, 0%, 100%)` | `hsl(0, 84%, 62%)` / `hsl(222, 47%, 12%)` | Destructive actions retain 4.5:1 contrast minimum. |
| `--surface-muted` | `hsl(213, 27%, 95%)` | `hsl(222, 47%, 18%)` | Muted surfaces for accordions and contextual checklists. |
| `--surface-elevated` | `hsl(210, 40%, 99%)` | `hsl(224, 45%, 22%)` | Elevated layers with subtle depth for cards. |
| `--shadow-soft` | `0px 14px 28px -14px rgba(15, 23, 42, 0.25)` | `0px 18px 36px -14px rgba(8, 47, 73, 0.45)` | Depth values tuned to avoid low-contrast halos.

Focus indicators use the shared `--focus` token (`hsl(202, 100%, 36%)` in light, `hsl(199, 95%, 66%)` in dark) to guarantee ≥ 3:1 contrast around interactive components.

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
| `--text-xl` | `1.375rem` | Feature callouts and hero metrics.
| `--text-2xl` | `1.75rem` | Primary hero statements on dashboards.
| `--text-3xl` | `2.25rem` | Immersive hero + onboarding celebrations.

Line heights are tuned for readability:

- `--line-height-tight` (`1.22`) for headings.
- `--line-height-snug` (`1.35`) for cards and summaries.
- `--line-height-relaxed` (`1.65`) for long-form content.

## Spacing Scale

Spacing tokens follow a four-point grid and power component padding/margins:

| Token | Value | Examples |
| --- | --- | --- |
| `--space-3xs` | `0.125rem` | Micro separations for iconography and inputs.
| `--space-2xs` | `0.25rem` | Tight icon badges, divider offsets.
| `--space-xs` | `0.5rem` | Button icon spacing, label gutters.
| `--space-sm` | `0.75rem` | Checklist row padding.
| `--space-md` | `1rem` | Card body padding, standard gaps.
| `--space-lg` | `1.5rem` | Grid gutters, hero spacing.
| `--space-xl` | `2rem` | Section splits on dashboards.
| `--space-2xl` | `3rem` | Page-level breathing room.
| `--space-3xl` | `4rem` | Feature hero intros and onboarding modals.
| `--space-4xl` | `5rem` | High-impact landing sections and empty states.

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
