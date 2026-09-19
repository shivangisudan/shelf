# शेल्फ़ (Shelf)

> A voice-and-photo-first product cataloging web app for Indian small merchants

Shelf is a mobile-first web application designed for Indian kirana store owners, artisans, and street vendors. It allows merchants to catalog their inventory by speaking in their native language or snapping a photo of their shelf. The app automatically extracts structured product details (name, price, quantity, category) and saves them to an inventory catalog.

## Features

✨ **Voice Input** — Record in Hindi, Tamil, Marathi, Bengali, or English with code-mixing supported
📸 **Photo Input** — Take or upload shelf photos for automatic product detection
🎯 **AI-Powered Extraction** — Uses Google Gemini 2.5 Flash to parse products from voice/photos
✏️ **Editable Results** — Review and edit all extracted fields before saving
📋 **Product Catalog** — View and manage your complete inventory
🌐 **No Login Required** — Instant access, no user accounts needed
📱 **Mobile-Optimized** — Designed for mid-range Android devices with legible 16px+ text and 44px+ touch targets
🌍 **Multilingual Input** — Support for Indian languages with natural code-mixing

## Tech Stack

### Frontend
- **Next.js 16** — React framework with App Router
- **React 19** — UI library
- **TypeScript** — Type-safe development
- **Tailwind CSS v4** — Utility-first styling
- **Motion** — Smooth animations
- **Lucide React** — Icon library

### Backend & Data
- **Supabase** — PostgreSQL database + file storage
- **Google Gemini 2.5 Flash** — AI model for product extraction via @google/genai

### Fonts
- **Rozha One** — Display font for headings (28px+)
- **Figtree Variable** — Body and UI font for all text
- **Hind** — Imported for backwards compatibility (not currently used)

### Deployment
- **Vercel** — Production hosting

## Getting Started

### Prerequisites
- Node.js 18+ and npm
- A Supabase project with database and storage bucket
- Google Gemini API key

### Installation

1. **Clone the repository**
   ```bash
   git clone <repository-url>
   cd shelf
   ```

2. **Install dependencies**
   ```bash
   npm install
   ```

3. **Set up environment variables**
   
   Create a `.env.local` file in the root directory:
   ```env
   NEXT_PUBLIC_SUPABASE_URL=your_supabase_url
   NEXT_PUBLIC_SUPABASE_ANON_KEY=your_supabase_anon_key
   GOOGLE_GENAI_API_KEY=your_google_gemini_api_key
   ```

4. **Database Setup**
   
   Run migrations to create tables:
   ```bash
   npm run db:migrate
   ```
   
   Or manually set up the required tables in Supabase (see [Database Schema](#database-schema) below)

### Running the Development Server

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) in your browser. The app will auto-reload as you edit files.

### Building for Production

```bash
npm run build
npm run start
```

## Project Structure

```
shelf/
├── app/                          # Next.js App Router
│   ├── api/
│   │   └── extract/
│   │       └── route.ts          # AI extraction endpoint (POST)
│   ├── catalog/
│   │   └── page.tsx              # Catalog listing page
│   ├── page.tsx                  # Home page (voice/photo capture)
│   ├── layout.tsx                # Root layout with fonts & metadata
│   └── globals.css               # Global styles & design tokens
│
├── components/                   # Reusable React components
│   ├── AmbientBackground.tsx     # Animated background decoration
│   ├── LiveWaveform.tsx          # Real-time audio waveform visualization
│   ├── VoiceOrb.tsx              # Animated recording orb
│   ├── VoiceRecorder.tsx         # Voice recording component (main UI)
│   └── ui/
│       └── Button.tsx            # Reusable button component
│
├── lib/                          # Utilities & helpers
│   ├── supabase.ts               # Supabase client initialization
│   ├── db.ts                     # Database queries & mutations
│   ├── catalog.ts                # Product canonicalization & catalog logic
│   ├── taxonomy.ts               # Product categories & validation
│   ├── types.ts                  # Shared TypeScript types
│   └── useRecorder.ts            # Audio recording hook
│
├── public/                       # Static assets
│   ├── blob.gif                  # Animated blob background
│   └── ogee-trellis.svg          # Decorative SVG pattern
│
├── supabase/                     # Supabase migrations & config
│   └── migrations/               # Database migration files
│
├── package.json                  # Dependencies & scripts
├── tsconfig.json                 # TypeScript configuration
├── tailwind.config.ts            # Tailwind CSS theme customization
├── next.config.ts                # Next.js configuration
├── vercel.json                   # Vercel deployment config
├── CLAUDE.md                     # Project specifications & constraints
└── AGENTS.md                     # Next.js version notes

```

## Key Files Explained

### Pages

- **`app/page.tsx`** — Home page with voice recorder and photo uploader. Handles capture mode selection, extraction, and result editing.
- **`app/catalog/page.tsx`** — Inventory list showing all saved products with editing capabilities.

### API

- **`app/api/extract/route.ts`** — Server-side API endpoint that:
  - Accepts audio or image files
  - Calls Google Gemini to extract product details
  - Validates results against product taxonomy
  - Returns structured JSON with extracted products

### Components

- **`VoiceRecorder.tsx`** — Main recording UI with start/stop controls, status feedback, and upload.
- **`LiveWaveform.tsx`** — Real-time audio waveform that animates during recording.
- **`VoiceOrb.tsx`** — Animated orb that pulses during recording.
- **`AmbientBackground.tsx`** — Decorative animated background.

### Library Functions

- **`db.ts`** — Database operations: saving products, fetching catalog, updating inventory.
- **`catalog.ts`** — Product canonicalization, unit conversion, brand name handling.
- **`taxonomy.ts`** — Predefined product categories and validation logic.
- **`useRecorder.ts`** — Custom hook for audio recording with media constraints.

## Database Schema

### Products Table

```sql
CREATE TABLE products (
  id UUID PRIMARY KEY,
  name TEXT NOT NULL,
  canonical_name TEXT,
  category TEXT NOT NULL,
  description TEXT,
  language_detected TEXT,
  price NUMERIC,
  quantity_unit TEXT,
  stock_quantity INTEGER DEFAULT 0,
  stock_unit TEXT DEFAULT 'unit',
  low_stock_threshold INTEGER DEFAULT 0,
  image_url TEXT,
  audio_url TEXT,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

## Configuration & Customization

### Design Tokens

Color scheme defined in `app/globals.css` as CSS custom properties:

```css
--bg: #FBF7F0;                              /* Light beige background */
--surface: #FFFFFF;                         /* White card surfaces */
--surface-raised: #F4EEE5;                  /* Subtle raised surface */
--text-primary: #1C140C;                    /* Dark brown text */
--text-secondary: #57493C;
--text-muted: #7A6A5B;
--accent: #D9443F;                          /* Primary action (rust red) */
--accent-deep: #EE6B2D;                     /* Secondary/gradient (orange) */
--accent-fg: #FFFFFF;                       /* Text on accent surfaces */
--gradient-warm: linear-gradient(135deg, #F4A024 0%, #EE6B2D 55%, #D9443F 100%);
--success: #24734F;
--error: #B52F2A;
--radius-sm: 12px;  --radius-md: 16px;  --radius-lg: 20px;
```

All colors are extended in `tailwind.config.ts` for use as utilities. The background 
includes an ogee-trellis SVG pattern for visual warmth and texture.

### Responsive Design

- **Mobile-first** development at 390px width
- **Tailwind breakpoints**: sm (640px), md (768px), lg (1024px), xl (1280px)
- **Minimum text size**: 16px (body), 13px (labels)
- **Minimum touch target**: 44px

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `NEXT_PUBLIC_SUPABASE_URL` | ✅ | Supabase project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | ✅ | Supabase anonymous key |
| `GOOGLE_GENAI_API_KEY` | ✅ | Google Gemini API key |

## Scripts

```bash
npm run dev       # Start development server
npm run build     # Build for production
npm run start     # Start production server
npm run lint      # Run ESLint
```

## How It Works

1. **Capture** — User chooses voice or photo mode
2. **Record/Upload** — Speak in any Indian language or snap a photo
3. **Extract** — Gemini analyzes the input server-side and extracts:
   - Product name (with original language preserved)
   - Category (from predefined taxonomy)
   - Price (in INR)
   - Quantity and unit
   - Stock quantity
   - Confidence level
4. **Review** — Merchant edits any field before saving
5. **Catalog** — Products are saved and appear in the inventory list

## Performance Considerations

- **Image optimization** via Next.js Image component
- **Font optimization** with @fontsource bundles
- **Code splitting** with dynamic imports
- **Minimal layout shift** with CSS Grid for buttons and cards
- **Lazy loading** for catalog items
- **Request memoization** to avoid duplicate API calls

## Deployment

### Deploy to Vercel (Recommended)

1. Connect your GitHub repository to Vercel
2. Add environment variables in Vercel dashboard
3. Deploy with one click

```bash
vercel deploy
```

### Custom Deployment

Ensure the following environment variables are set on your server:
- `GOOGLE_GENAI_API_KEY` (server-side only, never expose to client)
- `NEXT_PUBLIC_SUPABASE_*` (public, safe for client)

## Constraints & Design Philosophy

### Hard Requirements

- ✋ **No login/auth** — Single demo store, no user accounts needed
- 📱 **Mobile-first** — Designed at 390px width, scales to desktop
- 🎤 **Multilingual input only** — UI is English, voice/photo input in any language
- 🤐 **Server-side Gemini calls** — API key never exposed client-side
- ✏️ **Always editable** — AI-extracted results must be reviewed and edited before saving
- 📦 **Scope-locked** — Capture → Extract → Review/Edit → Catalog only
- 👁️ **Legibility first** — Minimum 16px text, 44px touch targets, high contrast

### Visual Direction

- **Light and inviting** — warm beige canvas with pattern texture
- **Warm color palette** — rust red and orange accents, dark brown text
- **Legibility over decoration** — minimum 16px body text, 44px touch targets
- **Bold display type** — Rozha One for headings (28px+), statement prices
- **Clean functional UI** — Figtree Variable for all controls and body text
- **Texture and depth** — ogee-trellis pattern, glass effects, subtle shadows

## Browser Support

- Chrome/Chromium 90+
- Firefox 88+
- Safari 14+
- Edge 90+

Mobile support prioritized for:
- Android 8.0+ (target: mid-range devices)
- iOS 12+

## Known Limitations

- No offline mode (requires internet for Gemini API)
- No user authentication or data privacy isolation
- Audio recording limited to ~5 minutes per recording
- Supported languages: Hindi, Tamil, Marathi, Bengali, Telugu, Kannada, Gujarati, Punjabi, Malayalam, English

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

[Add license information if applicable]

## Credits

Built by **[Shivangi Sudan](https://github.com/shivangisudan)** and **[Adicuno](https://github.com/adicuno)**

## Support & Questions

For issues, feature requests, or questions:
1. Check existing GitHub issues
2. Create a new issue with a clear description
3. Include browser, OS, and steps to reproduce for bugs

---

**Last Updated:** September 2026  
**Version:** 0.1.0
