// Pixel-art sprites painted with solid colour flaps.
// '.' = leave tile untouched; letters = palette codes (R,O,Y,G,B,V,W,K).

export const SPRITES = {
  sun: [
    "..YY..",
    ".YYYY.",
    "..YY..",
  ],
  partly: [
    ".YY....",
    "YYYWWW.",
    ".WWWW..",
  ],
  cloudy: [
    ".......",
    ".WWWWW.",
    "WWWWWWW",
  ],
  rain: [
    ".WWWW..",
    ".WWWWW.",
    ".B.B.B.",
  ],
  showers: [
    ".WWWW..",
    ".WWWWW.",
    "BB.BB.B",
  ],
  snow: [
    ".WWWW..",
    ".WWWWW.",
    "W.W.W.W",
  ],
  storm: [
    ".WWWW..",
    ".WWWWW.",
    "..YY...",
  ],
  fog: [
    ".......",
    "WW.WW..",
    ".WW.WW.",
  ],
  moon: [
    "...WW..",
    "..WWW..",
    ".WW....",
  ],
};

export function spriteForCode(code) {
  if (code === 0) return SPRITES.sun;
  if (code === 1 || code === 2) return SPRITES.partly;
  if (code === 3) return SPRITES.cloudy;
  if ([45, 48].includes(code)) return SPRITES.fog;
  if ([51, 53, 55, 56, 57].includes(code)) return SPRITES.rain;
  if ([61, 63].includes(code)) return SPRITES.rain;
  if ([65, 66, 67].includes(code)) return SPRITES.showers;
  if ([71, 73, 75, 77].includes(code)) return SPRITES.snow;
  if ([80, 81, 82].includes(code)) return SPRITES.showers;
  if ([85, 86].includes(code)) return SPRITES.snow;
  if ([95, 96, 99].includes(code)) return SPRITES.storm;
  return SPRITES.partly;
}
