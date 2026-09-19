@AGENTS.md
PRODUCT NAME: Shelf

PROJECT: A voice-and-photo-first product cataloging web app for Indian small
merchants — kirana store owners, artisans, street vendors. The merchant records
a voice note in any Indian language or snaps a photo of their shelf; the app
extracts structured product details and saves them to an inventory catalog.

STACK: Next.js 16 App Router, TypeScript, Tailwind CSS 4, Supabase (Postgres + 
Storage), Google Gemini 2.5 Flash via @google/genai. Animations via motion/react.
Icons via lucide-react. Fonts via @fontsource.

AUDIENCE CONSTRAINT: Merchants aged roughly 35-60, on mid-range Android phones,
often in variable or bright light. Legibility beats decoration in every conflict.
Minimum body text 16px. Minimum touch target 44px. Never rely on color alone.

HARD CONSTRAINTS:
- Mobile-first. Design at 390px width first, then scale up.
- No auth, no login, no user accounts. Single demo store.
- The app UI is in English. Only the voice INPUT is multilingual.
- All Gemini calls happen server-side in API routes. Never expose the key client-side.
- Every AI-extracted field must be editable before saving. Never auto-save AI output.
- Scope is exactly: capture → extract → review/edit → catalog list. Nothing else.

VISUAL DIRECTION: Light, warm, inviting. Warm beige canvas with an ogee-trellis
pattern texture. Rust-to-orange gradient palette. Clean, legible, modern. Display
type is bold and expressive. Everything functional is plain and highly legible.

FONTS (Google Fonts via @fontsource in layout.tsx):
- Rozha One — display only, 28px and above. App name, screen titles, large prices.
  Never for labels, buttons, body text, or anything under 28px. Weight: 400.
- Figtree Variable — everything else (body, labels, buttons). Weights: 400, 500, 600.
- Hind — imported but not currently in use (kept for backwards compatibility).

DESIGN TOKENS — define in globals.css as CSS custom properties on :root, extend
the Tailwind theme to map to them, and use those utilities everywhere. Never
hardcode a hex value in a component.

  --bg:              #FBF7F0;          /* Light beige background */
  --surface:         #FFFFFF;          /* White card surfaces */
  --surface-raised:  #F4EEE5;          /* Subtle raised surface */
  --border:          rgba(28, 20, 12, 0.08);
  --border-strong:   rgba(28, 20, 12, 0.16);
  --text-primary:    #1C140C;          /* Dark brown for text */
  --text-secondary:  #57493C;
  --text-muted:      #7A6A5B;
  --accent:          #D9443F;          /* Rust red — primary action */
  --accent-deep:     #EE6B2D;          /* Orange — secondary/gradient */
  --accent-fg:       #FFFFFF;          /* White text on accent surfaces */
  --gradient-warm:   linear-gradient(135deg, #F4A024 0%, #EE6B2D 55%, #D9443F 100%);
  --success:         #24734F;
  --success-bg:      rgba(36, 115, 79, 0.10);
  --error:           #B52F2A;
  --error-bg:        rgba(181, 47, 42, 0.10);
  --radius-sm: 12px;  --radius-md: 16px;  --radius-lg: 20px;

BACKGROUND TEXTURE:
- Ogee-trellis pattern (ogee-trellis.svg) repeats at 72px × 96px, positioned at 
  0 12px. Visible at ~16% opacity on the main background and ~16% on the catalog page.
  The pattern is decorative; never let it reduce readability.

ELEVATION & GLASS EFFECTS:
- .glass-layer — frosted glass cards with backdrop blur (16px) and saturation boost.
  Use for floating/overlaid content. Includes fallback for browsers without backdrop-filter.
- Cards have 1px border with var(--border) and soft shadows: 
  0 1px 2px rgba(28, 20, 12, 0.06).
- Recording-mode surfaces have stronger elevation with 0 6px 16px shadows.

ANIMATION & INTERACTION (via motion/react library):
- Record button: gradient background with subtle scale-up breathing (record-breathe).
  On active recording: pulsing ring animation (record-ring) with shadow glow.
  Disabled state: opacity 0.6, no animation.
- Waveform visualization: real-time canvas animation during recording.
- Shimmer line: horizontal gradient animation (shimmer-line) on processing state.
- Touch controls: scale(0.97) on active, 160ms transitions.
- Prefers-reduced-motion: all animations disabled.

COLOR RULES:
- --accent (rust red #D9443F) is the ONLY primary action color. One per screen.
- --accent-deep (orange #EE6B2D) is for gradients and secondary emphasis only.
  Never a separate button style.
- Warning/error state uses --error (#B52F2A). Success state uses --success (#24734F).
- Text on accent surfaces uses --accent-fg (white), never dark or transparent.
- Links and focus rings use --accent (rust red).

SPACING: 4 / 8 / 12 / 16 / 24 / 32. Nothing off-scale.

CODE RULES:
- Components in /components, one per file, none over ~150 lines.
- Shared types in /lib/types.ts — never redeclare a shape inline.
- Async boundaries (/lib/supabase.ts, /lib/db.ts, /lib/catalog.ts, /lib/taxonomy.ts).
- Every async boundary has an explicit loading state and an error state.
- Voice recording hook in /lib/useRecorder.ts — handles mic permission, constraints.
- Icons from lucide-react. CSS classes from Tailwind utilities.
- Use motion/react for choreographed animations (never CSS-only for complex sequences).