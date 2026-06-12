import React, { useEffect, useRef } from 'react';

interface Props {
  /** 캔버스 한 변 크기(px). 채팅 인디케이터는 32px 기본. */
  size?: number;
}

interface IParticle {
  a: number;
  x: number;
  y: number;
  rad: number;
  seed: number;
  sx: number;
  sy: number;
}

/**
 * 파티클이 흩어졌다 → 링으로 모였다 → 다시 터지는 "생각하는 중" 애니메이션.
 * 점 색은 VSCode 테마 전경색(--vscode-foreground)에서 읽어 다크/라이트에 자동 대응하며,
 * 사용자가 테마를 바꾸면 MutationObserver로 색을 다시 읽어 즉시 따라간다.
 */
export function ThinkingIcon({ size = 32 }: Props): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const S = size;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = S * dpr;
    canvas.height = S * dpr;
    canvas.style.width = `${S}px`;
    canvas.style.height = `${S}px`;
    ctx.scale(dpr, dpr);

    // 점 색은 전송 버튼과 동일한 파란 계열 액센트(--vscode-button-background)에서 읽는다.
    // 테마에 따라 톤이 자동으로 맞춰지고, 없으면 포커스 색 → 기본 파랑으로 폴백.
    const readAccent = (): string => {
      const style = getComputedStyle(document.documentElement);
      return (
        style.getPropertyValue('--vscode-button-background').trim() ||
        style.getPropertyValue('--vscode-focusBorder').trim() ||
        '#3794ff'
      );
    };

    let accent = readAccent();
    const observer = new MutationObserver(() => {
      accent = readAccent();
    });
    // VSCode는 테마 변경 시 <body> 클래스(vscode-dark/vscode-light)를 토글한다.
    observer.observe(document.body, { attributes: true, attributeFilter: ['class'] });

    const cx = S / 2;
    const cy = S / 2;
    const R = S * 0.29;
    const N = S < 60 ? 42 : 92;

    const ease = (t: number): number => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);

    const scatter = (p: IParticle): void => {
      const a = Math.random() * Math.PI * 2;
      const r = S * 0.16 + Math.random() * S * 0.3;
      p.sx = cx + Math.cos(a) * r;
      p.sy = cy + Math.sin(a) * r;
    };

    const ps: IParticle[] = [];
    for (let i = 0; i < N; i++) {
      const p: IParticle = {
        a: (i / N) * Math.PI * 2,
        x: cx + (Math.random() - 0.5) * S,
        y: cy + (Math.random() - 0.5) * S,
        rad: Math.max(0.6, S * 0.012 * (0.6 + Math.random())),
        seed: Math.random() * 1000,
        sx: 0,
        sy: 0,
      };
      scatter(p);
      ps.push(p);
    }

    const phases = [
      { n: 'scatter', d: 1100 },
      { n: 'ring', d: 1000 },
      { n: 'hold', d: 650 },
      { n: 'gather', d: 480 },
      { n: 'pop', d: 520 },
    ];

    let pi = 0;
    let t0 = performance.now();
    let last = t0;
    let raf = 0;

    const frame = (now: number): void => {
      // 프레임 간격(초) — 60fps 가정을 깨도 보간 속도가 일정하도록 보정.
      const dt = Math.min((now - last) / 1000, 0.05);
      last = now;
      // 60fps에서 0.2와 동일하게 느껴지는 프레임률 독립 보간 계수.
      const smooth = 1 - Math.pow(0.8, dt * 60);

      const ph = phases[pi];
      let pt = (now - t0) / ph.d;
      if (pt >= 1) {
        pt = 0;
        pi = (pi + 1) % phases.length;
        t0 = now;
        // pop 진입 시 새 흩어짐 위치를 잡는다 → pop이 그 위치로 날아가고
        // 이어지는 scatter가 같은 위치를 유지해 사이클 경계 끊김을 없앤다.
        if (phases[pi].n === 'pop') ps.forEach(scatter);
      }
      const e = ease(Math.min(pt, 1));
      const rot = now * 0.0006;
      ctx.clearRect(0, 0, S, S);
      for (let k = 0; k < ps.length; k++) {
        const p = ps[k];
        const rx = cx + Math.cos(p.a + rot) * R;
        const ry = cy + Math.sin(p.a + rot) * R;
        let tx: number;
        let ty: number;
        if (ph.n === 'scatter') {
          tx = p.sx;
          ty = p.sy;
        } else if (ph.n === 'ring') {
          tx = p.sx + (rx - p.sx) * e;
          ty = p.sy + (ry - p.sy) * e;
        } else if (ph.n === 'hold') {
          tx = rx;
          ty = ry;
        } else if (ph.n === 'gather') {
          const ge = ease(Math.min(pt * 1.4, 1));
          tx = rx + (cx - rx) * ge;
          ty = ry + (cy - ry) * ge;
        } else {
          tx = cx + (p.sx - cx) * e;
          ty = cy + (p.sy - cy) * e;
        }
        const j = Math.sin(now * 0.003 + p.seed) * S * 0.008;
        p.x += (tx - p.x) * smooth;
        p.y += (ty - p.y) * smooth;
        ctx.beginPath();
        ctx.arc(p.x + j, p.y + j * 0.6, p.rad, 0, Math.PI * 2);
        ctx.fillStyle = accent;
        ctx.globalAlpha = 0.82;
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
    };
  }, [size]);

  return <canvas ref={canvasRef} className="thinking-icon" aria-hidden="true" />;
}
