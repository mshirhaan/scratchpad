// Laser pointer for presenting: sits over the code editor while switched on.
// A red dot follows the mouse; dragging draws a glowing trail that fades
// away from its tail (like a real laser pointer, nothing is left behind).
// The code can't be edited or selected while it's on, but the mouse wheel
// still scrolls the editor underneath.
import { useEffect, useRef } from 'react';

const LIFE = 1100; // ms a trail point stays visible
const WIDTH = 5;

interface Pt {
  x: number;
  y: number;
  t: number;
}

export default function LaserOverlay({ onWheel, onExit }: { onWheel: (dx: number, dy: number) => void; onExit: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Pt[][]>([]);
  const drawing = useRef(false);
  const pointer = useRef<{ x: number; y: number } | null>(null);
  const frame = useRef(0);

  useEffect(() => {
    const el = canvas.current!;
    const ctx = el.getContext('2d')!;
    // The trail is drawn solid on a hidden layer first, then copied over with
    // the glow in one go. Drawing translucent pieces straight onto the canvas
    // makes the overlapping ends of each piece show up as darker dots.
    const layer = document.createElement('canvas');
    const lctx = layer.getContext('2d')!;
    let dpr = 1;
    const fit = () => {
      dpr = window.devicePixelRatio || 1;
      el.width = layer.width = el.clientWidth * dpr;
      el.height = layer.height = el.clientHeight * dpr;
      lctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);

    const mid = (a: Pt, b: Pt) => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

    const render = () => {
      const now = performance.now();
      strokes.current = strokes.current.map((s) => s.filter((p) => now - p.t < LIFE)).filter((s) => s.length > 0);

      lctx.clearRect(0, 0, el.clientWidth, el.clientHeight);
      lctx.lineCap = 'round';
      lctx.lineJoin = 'round';
      lctx.strokeStyle = 'rgb(255, 60, 50)';
      for (const s of strokes.current) {
        // Smooth curve through the mouse samples: each piece runs from one
        // midpoint to the next, bending around the sample between them. The
        // line gets thinner towards its older end instead of fading out.
        for (let i = 1; i < s.length; i++) {
          const from = i === 1 ? s[0] : mid(s[i - 2], s[i - 1]);
          const to = i === s.length - 1 ? s[i] : mid(s[i - 1], s[i]);
          lctx.lineWidth = Math.max(0.5, WIDTH * (1 - (now - s[i].t) / LIFE));
          lctx.beginPath();
          lctx.moveTo(from.x, from.y);
          lctx.quadraticCurveTo(s[i - 1].x, s[i - 1].y, to.x, to.y);
          lctx.stroke();
        }
      }
      const p = pointer.current;
      if (p) {
        lctx.fillStyle = 'rgb(255, 60, 50)';
        lctx.beginPath();
        lctx.arc(p.x, p.y, 4.5, 0, Math.PI * 2);
        lctx.fill();
      }

      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.clearRect(0, 0, el.width, el.height);
      ctx.shadowColor = 'rgba(255, 30, 30, 0.9)';
      ctx.shadowBlur = 10 * dpr;
      ctx.drawImage(layer, 0, 0);
      ctx.shadowBlur = 0;
      frame.current = requestAnimationFrame(render);
    };
    frame.current = requestAnimationFrame(render);

    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onExit();
    };
    window.addEventListener('keydown', key);
    return () => {
      cancelAnimationFrame(frame.current);
      ro.disconnect();
      window.removeEventListener('keydown', key);
    };
  }, [onExit]);

  const at = (e: React.PointerEvent) => {
    const r = canvas.current!.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };

  return (
    <canvas
      ref={canvas}
      className="laser-overlay"
      onPointerDown={(e) => {
        e.preventDefault();
        canvas.current!.setPointerCapture(e.pointerId);
        drawing.current = true;
        strokes.current.push([{ ...at(e), t: performance.now() }]);
      }}
      onPointerMove={(e) => {
        const p = at(e);
        pointer.current = p;
        if (!drawing.current) return;
        // Fast moves deliver several mouse positions per frame; use them all.
        const r = canvas.current!.getBoundingClientRect();
        const events = e.nativeEvent.getCoalescedEvents?.() ?? [];
        const pts = events.length ? events.map((c) => ({ x: c.clientX - r.left, y: c.clientY - r.top })) : [p];
        const t = performance.now();
        strokes.current[strokes.current.length - 1]?.push(...pts.map((q) => ({ ...q, t })));
      }}
      onPointerUp={() => (drawing.current = false)}
      onPointerCancel={() => (drawing.current = false)}
      onPointerLeave={() => {
        if (!drawing.current) pointer.current = null;
      }}
      onWheel={(e) => onWheel(e.deltaX, e.deltaY)}
      onContextMenu={(e) => e.preventDefault()}
    />
  );
}
