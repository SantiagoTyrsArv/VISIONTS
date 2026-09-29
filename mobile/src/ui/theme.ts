// Paleta de alto contraste (WCAG AA+ sobre fondo oscuro).
export const colors = {
  bg: '#0B1220',
  surface: '#16213A',
  card: '#FFD60A',
  cardText: '#111827',
  text: '#FFFFFF',
  textMuted: '#B6C2D9',
  primary: '#4DA3FF',
  primaryText: '#04121F',
  danger: '#FF6B6B',
  border: '#3A4A6B',
} as const;

export const spacing = { xs: 4, sm: 8, md: 16, lg: 24, xl: 32 } as const;

/** Tamaño mínimo táctil recomendado por Apple/Google. */
export const MIN_TOUCH = 48;
