# Command Center Wireframes

## Overview
These wireframes outline the combined dossier surface for customer command center operations, focusing on rapid assessment and inline action handling.

## 1. Hero Summary & Profile Header
```
┌────────────────────────────────────────────────────────────────────────────┐
│ [Avatar]  Customer Name          Loyalty Tier   Sentiment: 😊 Positive     │
│ Phone / Email                    Branch: Downtown                          │
│ Last Order: 12 Apr 2025           Lifetime Value: E£ 12,430                │
│ Purchase Frequency: Weekly        Preferred Services: Wash & Fold, Ironing │
└────────────────────────────────────────────────────────────────────────────┘
```
- Quick actions aligned to the right: `Issue Credit`, `Schedule Pickup`, `Launch Chat`, `Queue Campaign`.
- Inline badge for open balance and package credits.

## 2. Financial & Package Snapshot
```
┌──────────────────────────────┬─────────────────────────────────────────────┐
│ Balance Card                 │ Package Utilization                         │
│ ─ Balance Due:   E£ 320      │ ┌─────────────────────────────────────────┐ │
│ ─ Credits Available: 4       │ │ Package A   ████████░░░ 12/20 credits   │ │
│ ─ Lifetime Spend: E£ 12,430  │ │ Package B   ██████████ 18/18 credits    │ │
│ ─ Loyalty Points: 2,150      │ │ Expires: 28 Apr 2025 (Package B)        │ │
│                              │ └─────────────────────────────────────────┘ │
└──────────────────────────────┴─────────────────────────────────────────────┘
```
- Hover states reveal recent payment adjustments.
- Package bars include inline CTA to top-up when balance < 20%.

## 3. Order History Timeline
```
┌────────────────────────────────────────────────────────────────────────────┐
│ ● 15 Apr 2025 — Order #4821 — Delivered — Paid E£ 220 (Card)              │
│   Items: 3 garments, 1 bedding set                                        │
│ ○ 08 Apr 2025 — Order #4779 — In Progress — Balance E£ 90                 │
│   Notes: Requested rush ironing                                           │
│ ○ 01 Apr 2025 — Order #4712 — Completed — Paid E£ 180                     │
│   Notes: Coupon SPRING25 applied                                          │
└────────────────────────────────────────────────────────────────────────────┘
```
- Timeline badges mirror status colors.
- Collapsible filter chip row: `All`, `Deliveries`, `Outstanding`, `Promotions`.

## 4. Outreach & Engagement Timeline
```
┌────────────────────────────────────────────────────────────────────────────┐
│ ★ 16 Apr 2025 — SMS Campaign “Loyalty Top-Up” — Sent by Salma             │
│   Outcome: Clicked CTA within 2 hours                                     │
│ ☎ 14 Apr 2025 — Call — Notes: Scheduled pickup for 17 Apr 2025            │
│ 📨 10 Apr 2025 — Email Receipt — Delivered                                │
│ ✉ 05 Apr 2025 — WhatsApp Chat — Requested stain removal tips             │
└────────────────────────────────────────────────────────────────────────────┘
```
- Inline composer for logging manual touchpoints.
- Toggle to show only automated engagements.

## 5. Insight Summary Pane
```
┌────────────────────────────────────────────────────────────────────────────┐
│ AI Summary                                                                │
│ “Sara places a weekly wash & fold order, preferring Tuesday pickups and   │
│  weekend deliveries. She frequently tips and responds positively to SMS   │
│  discounts. Sentiment remains positive with occasional quality questions.”│
│ Next best action: Offer premium ironing bundle before Ramadan.            │
└────────────────────────────────────────────────────────────────────────────┘
```
- Includes last generated timestamp and refresh control.
- Surface risk indicators (e.g., churn) using color-coded pills.

## 6. Inline Action Surfaces
```
┌────────────────────────────────────────────────────────────────────────────┐
│ [Issue Credit]  Amount ▢  Reason ▢  → POST /api/customers/:id/payments     │
│ [Schedule Pickup]  Date ▢  Window ▢  Notes ▢  → POST /api/orders           │
│ [Launch Chat]  Channel ▢  Script preview (auto-filled)  → POST /api/chatbot│
│ [Queue Campaign]  Template ▢  Send date ▢  → PUT /api/customer-insights/:id│
└────────────────────────────────────────────────────────────────────────────┘
```
- Each button shows optimistic toast and audit log entry preview.
- Confirmation modal when adjusting balance or scheduling logistics.

## 7. Audit Log Drawer
```
┌────────────────────────────────────────────────────────────────────────────┐
│ Recent Actions                                                            │
│ • 16 Apr 2025 10:14 — Issued E£ 120 credit (Salma)                        │
│ • 15 Apr 2025 17:05 — Pickup scheduled for 17 Apr 09:00 (Ahmed)           │
│ • 14 Apr 2025 12:40 — Added to Ramadan SMS campaign (Salma)               │
│ • 13 Apr 2025 09:12 — Launched chat via WhatsApp (Ahmed)                  │
└────────────────────────────────────────────────────────────────────────────┘
```
- Drawer anchored to right edge, toggled via “Audit trail” link near header.
- Entries link back to associated timeline point.

## 8. Mobile Layout Notes
- Convert two-column sections into stacked cards with sticky action bar.
- Action buttons compress into segmented control.
- Timeline uses condensed rows with icons only.

## Data Source Mapping
- Profile & balances: `/api/customers/:id` and `/api/customers/:id/command-center`.
- Order history: `/api/orders?customerId=…` aggregated server-side.
- Packages: `/api/customers/:id/packages`.
- Outreach: `/api/customer-insights/:id/actions` history + notifications feed.
- AI summary: `/api/customers/:id/command-center` via LLM summarizer cache.

