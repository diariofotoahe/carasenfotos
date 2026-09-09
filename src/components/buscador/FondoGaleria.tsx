/**
 * FondoGaleria.tsx
 * -----------------------------------------------------------------------------
 * Collage de fondo inspirado en un muro de galería fotográfica.
 * Se alimenta dinámicamente con las últimas fotos encontradas.
 */

interface Props {
  imagenes: string[];
}

/** Posiciones fijas del collage (porcentajes) para un mosaico equilibrado. */
const RANURAS = [
  { top: "4%", left: "3%", w: "13%", h: "20%", r: "-3deg" },
  { top: "-2%", left: "22%", w: "16%", h: "30%", r: "2deg" },
  { top: "1%", left: "50%", w: "14%", h: "26%", r: "-2deg" },
  { top: "6%", left: "72%", w: "17%", h: "36%", r: "3deg" },
  { top: "34%", left: "6%", w: "14%", h: "24%", r: "2deg" },
  { top: "62%", left: "1%", w: "15%", h: "26%", r: "-2deg" },
  { top: "66%", left: "26%", w: "18%", h: "32%", r: "1deg" },
  { top: "70%", left: "54%", w: "13%", h: "26%", r: "-3deg" },
  { top: "58%", left: "76%", w: "16%", h: "30%", r: "2deg" },
  { top: "38%", left: "88%", w: "12%", h: "22%", r: "-1deg" },
  { top: "30%", left: "40%", w: "11%", h: "18%", r: "3deg" },
  { top: "88%", left: "40%", w: "12%", h: "20%", r: "-2deg" },
];

export function FondoGaleria({ imagenes }: Props) {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 overflow-hidden bg-canvas">
      <div className="absolute inset-0 bg-dots opacity-70" />

      {RANURAS.map((r, i) => {
        const src = imagenes[i % Math.max(imagenes.length, 1)];
        return (
          <div
            key={i}
            className="absolute overflow-hidden rounded-2xl bg-muted shadow-plate transition-all duration-700"
            style={{
              top: r.top,
              left: r.left,
              width: r.w,
              height: r.h,
              transform: `rotate(${r.r})`,
              opacity: src ? 0.95 : 0.35,
            }}
          >
            {src ? (
              <img src={src} alt="" className="h-full w-full object-cover" />
            ) : (
              <div className="h-full w-full bg-placeholder" />
            )}
          </div>
        );
      })}

      <div className="absolute inset-0 bg-veil" />
    </div>
  );
}
