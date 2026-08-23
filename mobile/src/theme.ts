export type ThemeColors = {
  ink: string; muted: string; paper: string; card: string; sage: string; accentSolid: string; accentText: string;
  sagePale: string; peach: string; yellow: string; lavender: string; blue: string; line: string; danger: string;
  dangerLine: string; moved: string; white: string; handle: string; toastBackground: string; toastText: string;
  stress1: string; stress2: string; stress3: string; stress4: string; stress5: string;
};

export const LIGHT_COLORS: ThemeColors = {
  ink: '#25322F', muted: '#55605B', paper: '#F7F3EA', card: '#FFFDF8', sage: '#779887',
  accentSolid: '#416555', accentText: '#416555', sagePale: '#DFE9DF', peach: '#F7E1D3', yellow: '#EFE2AC',
  lavender: '#DED8EB', blue: '#D8E9E9', line: '#DEDFD7', danger: '#9E5148', dangerLine: '#9E51484D',
  moved: '#25322F', white: '#FFFFFF', handle: '#D4D2CA', toastBackground: '#25322F', toastText: '#FFFFFF',
  stress1: '#F1DB9B', stress2: '#F0C8A6', stress3: '#EAB8A8', stress4: '#E0A397', stress5: '#D58F84',
};

export const DARK_COLORS: ThemeColors = {
  ink: '#E7ECE8', muted: '#B7C1BC', paper: '#111815', card: '#1A2420', sage: '#789D89',
  accentSolid: '#4D715F', accentText: '#9CCCB1', sagePale: '#26382F', peach: '#3B2A24', yellow: '#3B351F',
  lavender: '#302D3D', blue: '#21373A', line: '#34423B', danger: '#F09A90', dangerLine: '#F09A9060',
  moved: '#F0AA9B', white: '#FFFFFF', handle: '#637069', toastBackground: '#27342E', toastText: '#FFFFFF',
  stress1: '#4A4126', stress2: '#4C352C', stress3: '#56332F', stress4: '#623630', stress5: '#713B35',
};

function relativeLuminance(hex: string) {
  const channels = hex.match(/[0-9a-f]{2}/gi);
  if (!channels || channels.length < 3) throw new Error(`Expected an RGB hex colour, received ${hex}`);
  const [red, green, blue] = channels.slice(0, 3).map((channel) => {
    const value = Number.parseInt(channel, 16) / 255;
    return value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
}

export function contrastRatio(foreground: string, background: string) {
  const first = relativeLuminance(foreground);
  const second = relativeLuminance(background);
  return (Math.max(first, second) + 0.05) / (Math.min(first, second) + 0.05);
}
