/**
 * branding.js - Official mashq Brand Identity and Adaptive Color System
 * 
 * Provides:
 * - 12 Curated Brand Palettes with exact hex codes from catalog
 * - "The Modern Takhti" SVG generator
 * - Multi-variant logo rendering (Horizontal, Stacked, Symbol, Dark, Monochrome, Compact)
 * - Dynamic SVG favicon updates
 * - Dynamic CSS variable integration with Light, Dark, and Lights-Out themes
 */

export const MASHQ_PALETTES = [
  {
    id: 1,
    name: "1. Classic Ink & Verdigris",
    badge: "Official Reference",
    category: "trust",
    primary: "#072B61",
    secondary: "#158477",
    tint: "#D5E4F0",
    mono: "#1E242B",
    description: "A minimal, geometric interpretation of the traditional writing board, balancing deep scholarly navy with refreshing teal."
  },
  {
    id: 2,
    name: "2. Royal Qalam & Gold",
    badge: "Prestigious & Scholarly",
    category: "heritage",
    primary: "#191D47",
    secondary: "#D99B26",
    tint: "#F4EBDC",
    mono: "#1E202B",
    description: "Inspired by illuminated manuscripts—deep midnight indigo paired with warm gold leaf for an authoritative, premium feel."
  },
  {
    id: 3,
    name: "3. Sufi Emerald & Brass",
    badge: "Cultural & Serene",
    category: "heritage",
    primary: "#0B4B3C",
    secondary: "#C99649",
    tint: "#E3F1EC",
    mono: "#182622",
    description: "Deep literary emerald paired with warm antique brass. Evokes heritage calligraphy, wisdom, and calm focus."
  },
  {
    id: 4,
    name: "4. Modern Cobalt & Coral",
    badge: "High-Energy EdTech",
    category: "vibrant",
    primary: "#1E40AF",
    secondary: "#F96B5B",
    tint: "#DBEAFE",
    mono: "#1E293B",
    description: "Crisp digital cobalt energized by a warm coral accent edge. Approachable, friendly, and standout on mobile screens."
  },
  {
    id: 5,
    name: "5. Terracotta & Cypress",
    badge: "Artisanal & Organic",
    category: "heritage",
    primary: "#234238",
    secondary: "#D96846",
    tint: "#EAEFE9",
    mono: "#222926",
    description: "Grounded forest slate combined with sun-baked terracotta clay—paying homage to natural earth pigments and wooden boards."
  },
  {
    id: 6,
    name: "6. Sumi Ink & Saffron",
    badge: "Editorial Contrast",
    category: "vibrant",
    primary: "#1D232A",
    secondary: "#F59E0B",
    tint: "#FEF3C7",
    mono: "#18181B",
    description: "Rich carbon black-slate ink paired with a luminous marigold saffron edge. Ultra-legible with a modern publishing aesthetic."
  },
  {
    id: 7,
    name: "7. Walnut Takhti & Ochre",
    badge: "Authentic Wood",
    category: "heritage",
    primary: "#3D251E",
    secondary: "#E07A2E",
    tint: "#F5EBE4",
    mono: "#2B211E",
    description: "Directly inspired by the dark seasoned wood of a traditional Takhti board and warm reed-pen ochre."
  },
  {
    id: 8,
    name: "8. Oceanic Slate & Cyan",
    badge: "Crisp Digital SaaS",
    category: "trust",
    primary: "#0F172A",
    secondary: "#06B6D4",
    tint: "#E0F2FE",
    mono: "#0F172A",
    description: "Deep slate navy paired with electric cyan. Communicates speed, clarity, and contemporary digital fluency."
  },
  {
    id: 9,
    name: "9. Imperial Plum & Rose",
    badge: "Creative & Poetic",
    category: "vibrant",
    primary: "#381B46",
    secondary: "#E07163",
    tint: "#F4EBF7",
    mono: "#281D2E",
    description: "Velvety mulberry plum with a warm sunset rose accent. Ideal if mashq leans toward creative writing, poetry, and expression."
  },
  {
    id: 10,
    name: "10. Nordic Pine & Citron",
    badge: "Fresh & Habit-Building",
    category: "trust",
    primary: "#134237",
    secondary: "#65A30D",
    tint: "#ECFDF5",
    mono: "#1B2A26",
    description: "Deep evergreen balanced with a lively citron green spine—signaling daily growth, progress, and learning streaks."
  },
  {
    id: 11,
    name: "11. Oxford Crimson & Teal",
    badge: "Classic Academic",
    category: "heritage",
    primary: "#6E1A24",
    secondary: "#148578",
    tint: "#F9EBEB",
    mono: "#2B1D1F",
    description: "An unexpected complementary pairing: scholarly oxblood crimson contrasted with your original verdigris teal accent."
  },
  {
    id: 12,
    name: "12. Royal Indigo & Mint",
    badge: "Next-Gen Learning",
    category: "trust",
    primary: "#2E1A68",
    secondary: "#10B981",
    tint: "#EDE9FE",
    mono: "#1F1B2E",
    description: "Deep ultramarine violet paired with neo-mint. Vibrant, memorable, and built for modern digital-first learners."
  }
];

export const DEFAULT_PALETTE_ID = 1;

/**
 * Returns the palette matching an ID (1-12), falling back to default.
 */
export function getPaletteById(id) {
  const numId = parseInt(id, 10);
  const found = MASHQ_PALETTES.find(p => p.id === numId);
  return found || MASHQ_PALETTES[0];
}

/**
 * Generates the SVG string for "The Modern Takhti" symbol mark.
 * Dimensions: 200 x 160 viewBox.
 */
export function createTakhtiSVG(primaryColor, secondaryColor, innerStrokeColor = '#FFFFFF', sizeClass = '', inlineStyle = '') {
  const styleAttr = inlineStyle ? ` style="${inlineStyle}"` : '';
  const classAttr = sizeClass ? ` class="${sizeClass}"` : '';
  return `<svg viewBox="0 0 200 160" fill="none" xmlns="http://www.w3.org/2000/svg"${classAttr}${styleAttr}>
    <!-- Right Accent Layer (Secondary Color) -->
    <g transform="translate(0, 4) skewY(-6.5)">
      <path d="M153 31 C160 31 164 35 164 42 L164 128 C164 135 160 139 153 139 L151 139 L151 31 Z" fill="${secondaryColor}" />
    </g>

    <!-- Main Takhti Board (Primary Color) -->
    <g transform="translate(0, 4) skewY(-6.5)">
      <rect x="34" y="22" width="111" height="122" rx="22" fill="${primaryColor}" />
      
      <!-- 3 Writing Lines inside the Takhti -->
      <rect x="55" y="48" width="66" height="8.5" rx="4.25" fill="${innerStrokeColor}" />
      <rect x="55" y="69" width="56" height="8.5" rx="4.25" fill="${innerStrokeColor}" />
      <rect x="55" y="90" width="38" height="8.5" rx="4.25" fill="${innerStrokeColor}" />
    </g>

    <!-- Diagonal Reed Pen / Stylus (Bottom-Right Corner) -->
    <path d="M113 130 L134 101" stroke="${innerStrokeColor}" stroke-width="9.5" stroke-linecap="round" />
  </svg>`;
}

/**
 * Size definitions in pixels (width, height, font-size)
 */
const SIZE_MAP = {
  xs: { svgW: 22, svgH: 18, fontSize: '14px', gap: '6px' },
  compact: { svgW: 28, svgH: 22, fontSize: '17px', gap: '7px' },
  sm: { svgW: 38, svgH: 30, fontSize: '22px', gap: '9px' },
  md: { svgW: 48, svgH: 38, fontSize: '28px', gap: '11px' },
  lg: { svgW: 64, svgH: 51, fontSize: '36px', gap: '13px' },
  xl: { svgW: 84, svgH: 67, fontSize: '46px', gap: '15px' },
  login: { svgW: 94, svgH: 75, fontSize: '54px', gap: '16px' }
};

/**
 * Renders HTML for a mashq logo component with specified variant and size.
 * 
 * Variants:
 * - 'horizontal' (default): symbol + lowercase wordmark side by side
 * - 'stacked': symbol centered above lowercase wordmark
 * - 'symbol': symbol mark only
 * - 'dark': inverted light board & white wordmark for dark surfaces
 * - 'monochrome': board and text in mono color
 * - 'compact': compact symbol + wordmark
 */
export function renderMashqLogoHTML(options = {}) {
  const {
    variant = 'horizontal',
    size = 'sm',
    palette = null,
    isDark = false,
    isMono = false,
    customClass = ''
  } = options;

  const pal = palette || getActivePalette();
  const dim = SIZE_MAP[size] || SIZE_MAP.sm;

  let boardColor = pal.primary;
  let edgeColor = pal.secondary;
  let innerColor = '#FFFFFF';
  let wordmarkColor = pal.primary;

  if (isMono) {
    boardColor = isDark ? '#E2E8F0' : pal.mono;
    edgeColor = isDark ? '#94A3B8' : pal.mono;
    innerColor = isDark ? '#0F172A' : '#FFFFFF';
    wordmarkColor = isDark ? '#E2E8F0' : pal.mono;
  } else if (isDark) {
    // Official dark surface presentation: crisp white board, bright secondary edge, dark cutout strokes
    boardColor = '#FFFFFF';
    edgeColor = pal.secondary;
    innerColor = 'var(--bg, #18181B)';
    wordmarkColor = '#FFFFFF';
  }

  const svgInline = createTakhtiSVG(
    boardColor,
    edgeColor,
    innerColor,
    'mashq-takhti-svg',
    `width:${dim.svgW}px; height:${dim.svgH}px; display:block; flex-shrink:0;`
  );

  const wordmarkHTML = `<span class="brand-wordmark" style="font-size:${dim.fontSize}; color:${wordmarkColor}; font-weight:700; letter-spacing:-0.035em; text-transform:lowercase; line-height:1; user-select:none;">mashq</span>`;

  if (variant === 'symbol') {
    return `<div class="mashq-logo mashq-logo-symbol ${customClass}" style="display:inline-flex; align-items:center;">${svgInline}</div>`;
  }

  if (variant === 'stacked') {
    return `<div class="mashq-logo mashq-logo-stacked ${customClass}" style="display:inline-flex; flex-direction:column; align-items:center; gap:6px; text-align:center;">
      ${svgInline}
      ${wordmarkHTML}
    </div>`;
  }

  // Default 'horizontal' or 'compact'
  return `<div class="mashq-logo mashq-logo-horizontal ${customClass}" style="display:inline-flex; align-items:center; gap:${dim.gap || '8px'};">
    ${svgInline}
    ${wordmarkHTML}
  </div>`;
}

/**
 * Gets currently active palette from localStorage or default
 */
export function getActivePalette() {
  try {
    const stored = localStorage.getItem('ts_palette_id');
    if (stored) {
      return getPaletteById(stored);
    }
  } catch (e) {}
  return MASHQ_PALETTES[0];
}

/**
 * Updates dynamic SVG favicon matching active brand palette and theme
 */
export function updateBrandFavicon(palette, isDark = false) {
  try {
    const pal = palette || getActivePalette();
    const boardColor = isDark ? '#FFFFFF' : pal.primary;
    const edgeColor = pal.secondary;
    const innerColor = isDark ? '#0F172A' : '#FFFFFF';

    const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 160">
  <g transform="translate(0, 4) skewY(-6.5)">
    <path d="M153 31 C160 31 164 35 164 42 L164 128 C164 135 160 139 153 139 L151 139 L151 31 Z" fill="${edgeColor}" />
  </g>
  <g transform="translate(0, 4) skewY(-6.5)">
    <rect x="34" y="22" width="111" height="122" rx="22" fill="${boardColor}" />
    <rect x="55" y="48" width="66" height="8.5" rx="4.25" fill="${innerColor}" />
    <rect x="55" y="69" width="56" height="8.5" rx="4.25" fill="${innerColor}" />
    <rect x="55" y="90" width="38" height="8.5" rx="4.25" fill="${innerColor}" />
  </g>
  <path d="M113 130 L134 101" stroke="${innerColor}" stroke-width="9.5" stroke-linecap="round" />
</svg>`;

    const dataUri = `data:image/svg+xml,${encodeURIComponent(svgContent)}`;
    let link = document.querySelector("link[rel~='icon']");
    if (!link) {
      link = document.createElement('link');
      link.rel = 'icon';
      document.head.appendChild(link);
    }
    link.type = 'image/svg+xml';
    link.href = dataUri;
  } catch (err) {
    console.warn("Could not set dynamic favicon:", err);
  }
}

/**
 * Applies a palette by ID to CSS variables, saves to localStorage, and updates logos
 */
export function applyBrandPalette(paletteId, options = {}) {
  const pal = getPaletteById(paletteId);
  try {
    localStorage.setItem('ts_palette_id', String(pal.id));
  } catch (e) {}

  const root = document.documentElement;
  const currentTheme = root.getAttribute('data-theme') || 'light';
  root.setAttribute('data-palette-id', String(pal.id));
  const isDark = currentTheme === 'dark' || currentTheme === 'lights-out';

  // Apply custom CSS variables for brand colors
  root.style.setProperty('--brand-primary', pal.primary);
  root.style.setProperty('--brand-secondary', pal.secondary);
  root.style.setProperty('--brand-tint', pal.tint);
  root.style.setProperty('--brand-mono', pal.mono);

  // Harmonize --primary and --accent with brand palette
  if (isDark) {
    // In dark mode, ensure vibrant readability for buttons and interactive controls
    // Use secondary accent or brightened primary if primary is deeply dark
    root.style.setProperty('--primary', pal.secondary);
    root.style.setProperty('--primary-hover', pal.secondary);
    root.style.setProperty('--accent', pal.secondary);
    root.style.setProperty('--accent-strong', pal.secondary);
  } else {
    root.style.setProperty('--primary', pal.primary);
    root.style.setProperty('--primary-hover', pal.primary);
    root.style.setProperty('--accent', pal.primary);
    root.style.setProperty('--accent-strong', pal.primary);
  }

  // Update dynamic SVG favicon
  updateBrandFavicon(pal, isDark);

  // Re-render all logo slots in DOM
  renderAllBrandLogos(pal, isDark);

  // Update active state in settings grid if present
  updateSettingsPaletteActiveState(pal.id);

  // Dispatch custom event for any other listeners
  window.dispatchEvent(new CustomEvent('mashq-palette-change', { detail: { palette: pal, isDark } }));

  return pal;
}

/**
 * Finds all elements with [data-mashq-logo] and injects rendered logo
 */
export function renderAllBrandLogos(palette = null, isDarkTheme = null) {
  const pal = palette || getActivePalette();
  const root = document.documentElement;
  const currentTheme = root.getAttribute('data-theme') || 'light';
  const isDark = isDarkTheme !== null ? isDarkTheme : (currentTheme === 'dark' || currentTheme === 'lights-out');

  const slots = document.querySelectorAll('[data-mashq-logo]');
  slots.forEach(slot => {
    const variant = slot.getAttribute('data-mashq-logo') || 'horizontal';
    const size = slot.getAttribute('data-mashq-size') || 'sm';
    const explicitDark = slot.getAttribute('data-mashq-dark');
    const slotIsDark = explicitDark !== null ? explicitDark === 'true' : isDark;
    const isMono = slot.getAttribute('data-mashq-mono') === 'true';

    slot.innerHTML = renderMashqLogoHTML({
      variant,
      size,
      palette: pal,
      isDark: slotIsDark,
      isMono
    });
  });
}

/**
 * Builds HTML for all 12 palettes in the Settings modal
 */
export function buildSettingsPaletteGridHTML(activeId = 1) {
  return MASHQ_PALETTES.map(p => {
    const isSelected = p.id === activeId;
    return `
      <div 
        class="brand-palette-card ${isSelected ? 'active' : ''}" 
        data-palette-id="${p.id}" 
        tabindex="0" 
        role="button" 
        aria-label="Select ${p.name}"
      >
        <div class="brand-palette-card-top">
          <div class="brand-palette-swatches">
            <span class="brand-palette-swatch" style="background-color: ${p.primary};" title="Primary: ${p.primary}"></span>
            <span class="brand-palette-swatch" style="background-color: ${p.secondary};" title="Secondary: ${p.secondary}"></span>
            <span class="brand-palette-swatch" style="background-color: ${p.tint};" title="Surface Tint: ${p.tint}"></span>
          </div>
          <span class="brand-palette-badge">${p.badge}</span>
        </div>

        <div class="brand-palette-specimen">
          ${createTakhtiSVG(p.primary, p.secondary, '#FFFFFF', '', 'width: 44px; height: 35px;')}
          <span class="brand-wordmark" style="font-size: 19px; color: ${p.primary}; margin-left: 8px;">mashq</span>
        </div>

        <div class="brand-palette-info">
          <div class="brand-palette-name-row">
            <span class="brand-palette-name">${p.name}</span>
            <span class="brand-palette-check">✓</span>
          </div>
          <div class="brand-palette-codes">
            <code>${p.primary}</code> • <code>${p.secondary}</code>
          </div>
        </div>
      </div>
    `;
  }).join('');
}

/**
 * Updates visual selection ring on settings palette cards
 */
export function updateSettingsPaletteActiveState(activeId) {
  const cards = document.querySelectorAll('.brand-palette-card');
  cards.forEach(card => {
    const id = parseInt(card.getAttribute('data-palette-id'), 10);
    const isActive = id === activeId;
    card.classList.toggle('active', isActive);
  });
}

/**
 * Initializes the settings palette grid inside #brand-palette-grid container
 */
export function initSettingsPaletteGrid() {
  const container = document.getElementById('brand-palette-grid');
  if (!container) return;

  const current = getActivePalette();
  container.innerHTML = buildSettingsPaletteGridHTML(current.id);

  container.addEventListener('click', (e) => {
    const card = e.target.closest('.brand-palette-card');
    if (!card) return;
    const id = parseInt(card.getAttribute('data-palette-id'), 10);
    if (id) {
      applyBrandPalette(id);
    }
  });

  container.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') {
      const card = e.target.closest('.brand-palette-card');
      if (card) {
        e.preventDefault();
        const id = parseInt(card.getAttribute('data-palette-id'), 10);
        if (id) applyBrandPalette(id);
      }
    }
  });
}
