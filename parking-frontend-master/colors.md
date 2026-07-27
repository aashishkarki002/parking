Sallyan House Design System

Design system for Sallyan House — a comprehensive tenant / property management web application ("EasyManage") built for Sallyan House's property portfolio in Nepal.

The product is a full-stack React + Node app that helps property managers and landlords track tenants, rents, payments, maintenance, generators, cheques/drafts, vendors, multi-entity ownership, and Nepali-calendar-aware accounting. This design system codifies the visual language of that product so new screens feel native, and prototypes stay on-brand.

Product name: Sallyan House Tenant Management (internal codename: EasyManage) Brand color family: Petrol blue on warm stone Tech stack (product): React 18 + Vite, Tailwind CSS v4, shadcn/ui, Radix UI primitives, Recharts, FullCalendar, Node/Express + MongoDB backend

Sources consulted

The material below was built from:

Company overview doc: uploads/PROJECT_OVERVIEW.md — 724-line feature / architecture dump covering all 22 feature modules, routes, data models, cron jobs, and current completion status.

Canonical theme CSS: uploads/index.css — the live :root + .dark petrol-theme token block from the product's Tailwind setup, plus ViewDetail/Security-Deposit utility classes.

Brand mark: uploads/logo.jpeg — the "SH" monogram + "SALLYAN HOUSE" wordmark.

Codebase: aashishkarki002/tenant-management (browsed on-demand via the GitHub integration — main branch). Key files read: src/App.jsx, src/components/app-sidebar.jsx, src/Dashboard/Dashboard.jsx, src/components/TenantCard.jsx, src/components/ui/{button,badge,card}.jsx.

Everything needed by the design agent is copied into this project — do not assume the reader has access to the repo or the Figma.

Index

Root files (this folder):

File

Purpose

README.md

This file — context, foundations, and manifest

SKILL.md

Cross-compatible skill manifest for use in Claude Code

colors_and_type.css

All CSS custom properties: light + dark color tokens, type scale, radii, shadows

assets/

Logos and brand imagery (logo.jpeg, logo-mark.svg)

fonts/

Webfont references (currently using Google Fonts via @import — see Caveats)

preview/

Small HTML cards that populate the Design System review panel (one concept per card)

ui_kits/tenant_app/

React JSX recreations of the main admin app — Sidebar, Header, Dashboard, Tenants, etc.

Product context

Sallyan House manages a portfolio of rental properties under a hierarchical model: Property → Block → Inner Block → Unit. The management app handles:

Tenants: profiles, lease dates (English + Nepali calendars), documents, security deposits.

Rent & Payments: monthly rent auto-generation via cron, multi-method payment recording (cash/bank/cheque), late-fee policies (fixed / percentage / daily-simple / daily-compounding), TDS verification, arrears backfill.

Accounting: double-entry ledger, revenue/expense tracking, banking (fund positions), cash flow statement, cheque-draft lifecycle (pending → deposited/bounced).

Operations: unified calendar feed (maintenance + daily checks + lease events + rent events), generator management (diesel generators with fuel + service logs), maintenance work orders, vendor management with contracts + personnel.

Multi-entity ownership: blocks can belong to different legal entities (private, "Sallyan", "Head Office"); block migration with pre-flight, atomic transfer, 48-hour rollback, and audit log.

Dashboards: bento-grid admin dashboard with Nepali FY picker, KPI strip, revenue trend chart, "Needs Attention" panel, recent activity feed, and a separate staff-facing dashboard.

The product is bilingual-adjacent: date handling is Nepali-calendar-first (Bikram Sambat, stored as YYYY-MM-DD strings) with English calendar alongside. The UI is currently English.

Roles: super_admin, admin, staff — gated via ProtectedRoutes + RoleRoute wrappers. Staff gets a different dashboard and limited nav.

Content fundamentals

Tone: operational, precise, calm. This is internal property-ops software — not consumer-facing marketing. Every label earns its place.

Voice and person

Second-person ("your portfolio") is rare; the product speaks about entities, not to the user. Headers are statements of fact: "Property Overview", "Needs Attention", "Recent Activities".

Greetings are the only exception: the dashboard opens with "Good morning, {user.name}" from the useTime hook — warm but brief.

Call-to-action buttons are imperative verbs: Add Tenant, Record Payment, Retry, Settle Deposit, Deposit, Bounce.

Casing

Sentence case for page titles, section headers, card titles, and buttons: "Property overview", "Add tenant", "Needs attention".

ALL CAPS + wide tracking (0.07–0.22em) is reserved for micro-labels and group headers: form-field labels inside cards (amount label), sidebar group labels (CORE, FINANCE, OPERATIONS), metadata labels (TOTAL DEPOSIT, SETTLED).

Status badges are Title Case: Paid, Overdue, Due Soon, Pending, Deposited, Bounced.

Numbers + money

Currency is Nepali Rupees: Rs. 1,25,000 (Indian-style digit grouping via toLocaleString("en-IN")).

Amounts are stored server-side in paisa (integer) and converted for display. Never show paisa in the UI.

Monetary displays use the mono font + tabular numerals (font-family: var(--font-mono); font-variant-numeric: tabular-nums;).

Per-unit suffixes are low-contrast and abbreviated: / mo, / qtr.

Dates

Nepali dates display as YYYY-MMM-DD (e.g. 2082-Baisakh-15) using Nepali month names.

English dates use shorter formats (Apr 21, 2026).

Dashboards + lease fields often show both.

"Today" / "Due today" / "3 months unpaid" are used for relative shorthands inside tables and badges.

Emoji: Almost never. The project overview uses emoji for section headers in its README (📋 ✨ 🗂️) but the product UI uses Lucide icons exclusively. Do not introduce emoji into screens.

Vibe examples (from the codebase)

Dashboard header: "Good morning, Aashish" / "Property Overview"

Empty states: "No refunds recorded yet" (plain, no exclamation)

Error banners: "Failed to load stats" + "Retry" button

Severity labels use domain language: "Needs Attention", "Overdue", "Vacant", "Due Soon"

Nepali language surfaces only for month names and fiscal-year labels ("FY 2082/83")

Visual foundations

Color

Two color families anchor the system:

Warm stone neutrals — page canvas is #fafaf8 (stone-50), cards are #f5f4f0, borders are #e7e5e0. Text hierarchy runs from #1c1917 (strong) through #44403c → #78716c → #a8a29e (weak). This warmth is deliberate — it counter-balances the coolness of the petrol accent and keeps the app from feeling like a spreadsheet.

Petrol blue accent — #1a5276 for CTAs, active nav, links, focus rings. Paired with an ultra-light surface #ebf5fb for selected rows / tags, and mid-tone #aed6f1 for accent borders.

Semantic sets use the classic four: success #166534 (green), warning #92400e (amber), danger #991b1b (red), info #1e40af (blue). Each comes with a -bg (ultra-light) and -border (light-mid) companion so badges, callouts, and status cards compose without extra logic.

Ownership identity — three persistent colors identify the legal entity a block belongs to in multi-entity mode: Private (indigo #3d3b8e), Sallyan (terracotta #b54b2a), Head Office (forest #1a6644). These stay fixed in dark mode on purpose — entity identity should be recognizable regardless of theme.

Dark mode mirrors the structure: deep near-black #0f1117 canvas, charcoal-slate #171b24 surfaces, petrol lightens to #4a90c4 for contrast, text inverts (#f0eee9 → #5c5852).

Type

DM Sans — the workhorse. All UI text, headings, body, labels.

Lora — serif for occasional display / quote moments (.ap-serif class in the live CSS). Used sparingly in accounting page headers and editorial flourishes.

Fira Code — mono for all currency values, numeric tables, and code. Always paired with tabular-nums so columns line up.

Type scale is tight: 0.625rem (micro caps) → 0.75rem (meta) → 0.875rem (body) → 1.125rem (h3) → 1.5rem (h2) → 1.875rem (h1) → 2rem (display, fluid). Weights used: 400 / 500 / 600 / 700 — no 300, no 800.

Letter spacing: negative on large headings (-0.02em on h1) for a sharper feel; positive + uppercase on micro labels (0.07em–0.22em).

Spacing + layout

8-point base grid with half-steps. Tailwind scale is the vocabulary: 1 (4px), 1.5 (6px), 2 (8px), 2.5 (10px), 3 (12px), 4 (16px), 5 (20px), 6 (24px).

Card padding: typically p-3 (12px) for dense cards (TenantCard), p-4 for standard, p-6 for major panels.

Card gap: gap-3 to gap-5 inside bento grids.

Sidebar width is published as a CSS variable --sidebar-width on the SidebarProvider so the header can align.

Backgrounds

Plain warm stone, no gradients, no textures, no patterns, no full-bleed hero images.

The one exception is the inverted card (--color-surface-invert: #0d2535) — used for the dark-themed chart tooltip and the accenting DarkCard variant on the dashboard.

No hand-drawn illustrations, no decorative SVG noise. Product screens rely on data density + typographic rhythm, not ornament.

Corner radii

Token-driven: 6 / 10 / 14 / 18px. Used consistently:

Micro chips and status pills — 6px / rounded-md

Inputs, small buttons, metadata cards — 6–10px

Standard cards — 10–14px (rounded-lg / rounded-xl)

Major panels (bento grid children) — 16–18px (rounded-2xl)

Full pills (badges) — rounded-full

Shadows

Two flavors only:

--shadow-card: whisper-soft two-layer shadow, visible but non-shouty. Default state for all raised cards.

--shadow-modal: for dialogs / floating menus.

No inner shadows. No colored shadows. No "glowing" rings except focus rings (ring-ring/50 at 3px).

Borders

1px solid --color-border on every card, panel, input. On hover for interactive cards, the border shifts to --color-accent-mid (light petrol). Borders are as important as shadows in this system — the warm palette has low contrast, so the border is what separates surfaces from canvas.

Animation

Duration: 150–200ms for hovers, 300ms for reveals (ap-up keyframe), 400ms for progress-bar fills.

Easing: default ease / ease-out. No bouncy springs.

Motifs: translateY(8px) → 0 fade-up on card mount (ap-up keyframe), subtle opacity 0.45 ↔ 0.8 pulse for loading skeletons (ap-pulse), shimmer sweep for skeleton loaders (shimmer).

No parallax, no scroll-driven motion, no Lottie. Motion exists to acknowledge state changes — never to decorate.

Hover, press, focus

Hover (buttons): primary → bg-primary/90; secondary → bg-secondary/80; outline → bg-accent; ghost → bg-accent. Interactive cards get translateY(-1px) + elevated shadow + petrol-mid border.

Press (active): active:scale-[0.98] on primary actions.

Focus: focus-visible:ring-2 ring-ring ring-[3px] (the petrol --ring) — never removed.

Disabled: opacity-50 pointer-events-none.

Transparency + blur

Used for overlays only:

--color-surface-invert-text: rgba(255,255,255,0.9) and -sub: rgba(255,255,255,0.45) — text on dark cards.

color-mix(in srgb, var(--color-accent) 18%, var(--color-surface)) — subtle hover fills on secondary action buttons.

No backdrop-blur anywhere in the live product.

Layout rules

Sidebar + header shell via AppLayout. Sidebar is collapsible on mobile (useSidebar), fixed 240px wide on desktop.

Bento grids drive the dashboards: grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 xl:grid-cols-6 with explicit col-span sizing per widget.

Tables for dense lists (ledger, payment history); card grids for entity browsing (tenants, vendors, generators).

Page titles sit at px-4 sm:px-5 pt-4 pb-3 — they float above the content rather than inside a containing card.

Iconography

Lucide React is the exclusive icon set (import { X } from "lucide-react"). The codebase uses roughly 60+ distinct lucide glyphs across the app.

Stroke weight: Lucide default (strokeWidth={2}).

Size scale: w-3 h-3 (12px, inline with text), w-3.5 h-3.5 (14px, sidebar + buttons), w-4 h-4 (16px, standard), w-5 h-5 (20px, feature icons).

Color: inherits currentColor — they follow text hierarchy, not a separate icon color.

Glyph vocabulary used across the app (kept verbatim to match the real product):

Context

Icons

Nav

LayoutDashboard, Users, Building2, Wrench, Banknote, Zap, Landmark, ClipboardCheck, Store, DoorOpen, UserCog, ReceiptText, ClipboardList, FileText, Megaphone, CalendarDays

Actions

Plus, Pencil, Eye, Search, X, ChevronDown, MoreVertical, Download, Upload

Status

CheckCircle2, AlertTriangle, XCircle, Clock, TrendingUp, TrendingDown, CreditCard, Bell

Comms

Phone, Mail, Calendar

Theme

Sun, Moon

PNG / JPEG assets — one only: assets/logo.jpeg (the SH monogram + wordmark). No other raster assets in the codebase.

SVGs — no decorative SVGs. Charts are rendered by Recharts from data; illustrations are simply not part of the visual language.

Emoji — avoided in product UI. The project's PROJECT_OVERVIEW.md uses emoji headers, but those are doc-only.

Unicode chars as icons — not used.

Ownership identity (multi-entity)

In "company mode", blocks carry an ownershipEntityId and display a colored pill identifying which legal entity owns them. This is load-bearing for operational safety — a payment against the wrong entity is a real accounting mistake. The three entity colors are persistent across light / dark mode:

Private — indigo #3d3b8e on #ededfa

Sallyan — terracotta #b54b2a on #fbede8

Head Office — forest #1a6644 on #e6f4ed

Always render entity tags using these exact tokens; do not reskin them per surface.

Caveats

Fonts: The product's Tailwind config names DM Sans / Lora / Fira Code. This system currently pulls all three from Google Fonts via @import in colors_and_type.css. If you need offline .woff2 files, ask the user to drop them in fonts/ and remove the @import.

No design system definition file existed in the repo — this system was synthesized from the live theme CSS and representative components. If Sallyan House has a Figma library, it was not provided; ask the user for it to close the loop on illustration style / empty-state patterns.

UI kit coverage is focused on the admin app (Dashboard, Sidebar, Tenants, Accounting). Staff dashboard, Calendar, Generator, and Vendors pages use the same primitives and can be assembled from them, but only a handful of core screens are recreated in ui_kits/tenant_app/.

Last updated: April 21, 2026.