/* Анимированное звёздное небо + созвездия */
(function initStarfield(){
  const canvas = document.getElementById('starfield');
  if (!canvas) return;
  const ctx = canvas.getContext('2d', { alpha: true });
  let stars = [];
  let constellations = [];
  let shootingStars = [];
  let w = 0, h = 0;
  let mouseX = 0, mouseY = 0;
  let targetMouseX = 0, targetMouseY = 0;

  function resize() {
    w = canvas.width = window.innerWidth;
    h = canvas.height = window.innerHeight;

    const count = Math.min(320, Math.floor((w * h) / 7000));
    stars = [];
    for (let i = 0; i < count; i++) {
      stars.push({
        x: Math.random() * w,
        y: Math.random() * h,
        r: Math.random() * 1.3 + 0.25,
        baseAlpha: Math.random() * 0.55 + 0.25,
        twinkleSpeed: Math.random() * 0.02 + 0.004,
        phase: Math.random() * Math.PI * 2,
        depth: Math.random() * 0.8 + 0.2,
        hue: Math.random() < 0.15 ? 260 : (Math.random() < 0.1 ? 190 : 0),
      });
    }

    constellations = [];
    for (let i = 0; i < 4; i++) {
      const cx = Math.random() * w;
      const cy = Math.random() * h * 0.75;
      const points = [];
      const pCount = 4 + Math.floor(Math.random() * 3);
      for (let j = 0; j < pCount; j++) {
        points.push({
          x: cx + (Math.random() - 0.5) * 220,
          y: cy + (Math.random() - 0.5) * 160,
        });
      }
      constellations.push({
        points,
        phase: Math.random() * Math.PI * 2,
        speed: 0.0005 + Math.random() * 0.0006,
      });
    }
  }

  function spawnShootingStar() {
    const sx = Math.random() * w * 0.8;
    const sy = Math.random() * h * 0.35;
    const angle = Math.PI / 4 + (Math.random() - 0.5) * 0.6;
    const speed = 6 + Math.random() * 4;
    const life = 60 + Math.random() * 40;
    shootingStars.push({
      x: sx, y: sy,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      life, maxLife: life,
    });
  }

  function draw(t) {
    ctx.clearRect(0, 0, w, h);

    mouseX += (targetMouseX - mouseX) * 0.06;
    mouseY += (targetMouseY - mouseY) * 0.06;

    for (const s of stars) {
      const twinkle = Math.sin(t * s.twinkleSpeed + s.phase) * 0.35 + 0.65;
      const alpha = s.baseAlpha * twinkle;
      const px = mouseX * s.depth * 18;
      const py = mouseY * s.depth * 18;
      const x = s.x + px;
      const y = s.y + py;

      if (s.r > 1.0) {
        ctx.beginPath();
        const grad = ctx.createRadialGradient(x, y, 0, x, y, s.r * 6);
        const glowColor = s.hue === 0 ? '190,210,255' : (s.hue === 260 ? '210,180,255' : '180,240,255');
        grad.addColorStop(0, `rgba(${glowColor},${alpha * 0.6})`);
        grad.addColorStop(1, `rgba(${glowColor},0)`);
        ctx.fillStyle = grad;
        ctx.arc(x, y, s.r * 6, 0, Math.PI * 2);
        ctx.fill();
      }

      ctx.beginPath();
      if (s.hue === 260) ctx.fillStyle = `rgba(220,190,255,${alpha})`;
      else if (s.hue === 190) ctx.fillStyle = `rgba(190,240,255,${alpha})`;
      else ctx.fillStyle = `rgba(255,255,255,${alpha})`;
      ctx.arc(x, y, s.r, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const c of constellations) {
      const alpha = (Math.sin(t * c.speed + c.phase) + 1) * 0.5 * 0.35 + 0.2;
      const px = mouseX * 22;
      const py = mouseY * 22;
      const pts = c.points;

      ctx.strokeStyle = `rgba(180,160,255,${alpha * 0.75})`;
      ctx.lineWidth = 1;
      ctx.setLineDash([4, 6]);
      ctx.beginPath();
      ctx.moveTo(pts[0].x + px, pts[0].y + py);
      for (let i = 1; i < pts.length; i++) {
        ctx.lineTo(pts[i].x + px, pts[i].y + py);
      }
      ctx.stroke();
      ctx.setLineDash([]);

      for (const p of pts) {
        const x = p.x + px, y = p.y + py;

        const grad = ctx.createRadialGradient(x, y, 0, x, y, 14);
        grad.addColorStop(0, `rgba(200,180,255,${alpha * 0.9})`);
        grad.addColorStop(1, 'rgba(200,180,255,0)');
        ctx.beginPath();
        ctx.fillStyle = grad;
        ctx.arc(x, y, 14, 0, Math.PI * 2);
        ctx.fill();

        ctx.beginPath();
        ctx.fillStyle = `rgba(240,235,255,${Math.min(1, alpha * 2.2)})`;
        ctx.arc(x, y, 1.9, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    for (let i = shootingStars.length - 1; i >= 0; i--) {
      const ss = shootingStars[i];
      const lifeRatio = ss.life / ss.maxLife;
      const tailLen = 80 + (1 - lifeRatio) * 40;
      const tailX = ss.x - ss.vx * (tailLen / 10);
      const tailY = ss.y - ss.vy * (tailLen / 10);

      const grad = ctx.createLinearGradient(ss.x, ss.y, tailX, tailY);
      grad.addColorStop(0, `rgba(255,255,255,${lifeRatio})`);
      grad.addColorStop(0.4, `rgba(200,200,255,${lifeRatio * 0.5})`);
      grad.addColorStop(1, 'rgba(200,200,255,0)');

      ctx.strokeStyle = grad;
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(ss.x, ss.y);
      ctx.lineTo(tailX, tailY);
      ctx.stroke();

      ctx.beginPath();
      ctx.fillStyle = `rgba(255,255,255,${lifeRatio})`;
      ctx.arc(ss.x, ss.y, 2, 0, Math.PI * 2);
      ctx.fill();

      ss.x += ss.vx;
      ss.y += ss.vy;
      ss.life--;
      if (ss.life <= 0 || ss.x > w + 100 || ss.y > h + 100) {
        shootingStars.splice(i, 1);
      }
    }

    if (Math.random() < 0.004 && shootingStars.length < 3) {
      spawnShootingStar();
    }

    requestAnimationFrame(draw);
  }

  window.addEventListener('resize', resize);
  window.addEventListener('mousemove', (e) => {
    targetMouseX = (e.clientX / w - 0.5) * 2;
    targetMouseY = (e.clientY / h - 0.5) * 2;
  });

  resize();
  requestAnimationFrame(draw);
})();