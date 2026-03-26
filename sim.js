'use strict';

// ─── UTILS ───────────────────────────────────────────────────────────────────

function randNorm(mean = 0, std = 1) {
  let u, v;
  do { u = Math.random(); } while (u === 0);
  do { v = Math.random(); } while (v === 0);
  return mean + std * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

function percentile(arr, p) {
  const s = [...arr].sort((a, b) => a - b);
  const idx = Math.min(Math.floor((p / 100) * s.length), s.length - 1);
  return s[idx];
}

function mean(arr) { return arr.reduce((a, b) => a + b, 0) / arr.length; }

function stdDev(arr) {
  const m = mean(arr);
  return Math.sqrt(arr.reduce((a, b) => a + (b - m) ** 2, 0) / arr.length);
}

function skewness(arr) {
  const m = mean(arr);
  const s = stdDev(arr);
  return arr.reduce((a, b) => a + ((b - m) / s) ** 3, 0) / arr.length;
}

function fmt(v, unit, decimals = 0) {
  if (unit === '$') return '$' + Math.round(v).toLocaleString();
  if (unit === '%') return (v * 100).toFixed(1) + '%';
  if (unit === 'x') return v.toFixed(3);
  return v.toFixed(decimals);
}

// ─── SCENARIOS ───────────────────────────────────────────────────────────────

const SCENARIOS = {
  gbm: {
    label: 'GBM — Asset Price',
    desc: 'Geometric Brownian Motion models asset prices under the Black-Scholes framework. Each path simulates a stock\'s daily returns using an expected drift (μ) and volatility (σ), producing a distribution of final prices after T days.',
    formula: 'S(T) = S₀ · exp((μ − σ²/2)T + σ√T · Z)',
    formulaDesc: 'Discretised GBM with drift μ, volatility σ, and standard normal variate Z. The σ²/2 term is the Itô correction for continuous compounding.',
    params: [
      { id: 'S0',  label: 'Initial Price ($)', min: 10,   max: 1000, val: 100,  step: 10,  fmt: v => '$' + v },
      { id: 'mu',  label: 'Annual Drift (μ)',  min: -0.3, max: 0.5,  val: 0.08, step: 0.01, fmt: v => (v*100).toFixed(0) + '%' },
      { id: 'sig', label: 'Annual Vol (σ)',    min: 0.05, max: 0.8,  val: 0.25, step: 0.01, fmt: v => (v*100).toFixed(0) + '%' },
      { id: 'T',   label: 'Time Horizon (days)', min: 10, max: 500,  val: 252,  step: 10,  fmt: v => v + 'd' },
    ],
    run(n, p) {
      const { S0, mu, sig, T } = p;
      const dt = T / 252;
      const results = [];
      const paths = [];
      const nPaths = Math.min(n, 200);
      for (let i = 0; i < n; i++) {
        let S = S0;
        const path = i < nPaths ? [S] : null;
        for (let t = 0; t < T; t++) {
          S *= Math.exp((mu - 0.5 * sig * sig) * (1/252) + sig * Math.sqrt(1/252) * randNorm());
          if (path && t % Math.max(1, Math.floor(T/60)) === 0) path.push(S);
        }
        results.push(S);
        if (path) paths.push(path);
      }
      return { values: results, unit: '$', paths, pathLabel: 'Price ($)' };
    }
  },

  portfolio: {
    label: 'Portfolio VaR',
    desc: 'Simulates daily P&L for a 3-asset portfolio using correlated normally distributed returns. Reports Value-at-Risk (VaR) at 95% and 99% confidence — the loss not exceeded on 95%/99% of days.',
    formula: 'VaR₀.₀₅ = −F⁻¹(0.05) · σₚ · Portfolio Value',
    formulaDesc: 'Simulated VaR using correlated asset returns via Cholesky decomposition. Correlation ρ between Asset 1 and Asset 2 is configurable.',
    params: [
      { id: 'w1',  label: 'Weight Asset 1 (%)', min: 0, max: 100, val: 50, step: 5, fmt: v => v + '%' },
      { id: 'w2',  label: 'Weight Asset 2 (%)', min: 0, max: 100, val: 30, step: 5, fmt: v => v + '%' },
      { id: 'sig1', label: 'Vol Asset 1 (ann.)', min: 0.05, max: 0.8, val: 0.2, step: 0.01, fmt: v => (v*100).toFixed(0)+'%' },
      { id: 'sig2', label: 'Vol Asset 2 (ann.)', min: 0.05, max: 0.8, val: 0.3, step: 0.01, fmt: v => (v*100).toFixed(0)+'%' },
      { id: 'rho',  label: 'Correlation (ρ)',   min: -0.9, max: 0.9, val: 0.4, step: 0.05, fmt: v => v.toFixed(2) },
      { id: 'pv',   label: 'Portfolio ($M)',    min: 1, max: 100, val: 10, step: 1, fmt: v => '$' + v + 'M' },
    ],
    run(n, p) {
      const { w1, w2, sig1, sig2, rho, pv } = p;
      const w3 = Math.max(0, 100 - w1 - w2);
      const sig3 = 0.15;
      const dailySig1 = sig1 / Math.sqrt(252);
      const dailySig2 = sig2 / Math.sqrt(252);
      const dailySig3 = sig3 / Math.sqrt(252);
      const pvVal = pv * 1e6;

      // Cholesky for 2x2 correlation
      const L11 = 1;
      const L21 = rho;
      const L22 = Math.sqrt(Math.max(0, 1 - rho * rho));

      const results = [];
      for (let i = 0; i < n; i++) {
        const z1 = randNorm(), z2 = randNorm(), z3 = randNorm();
        const r1 = (L11 * z1) * dailySig1;
        const r2 = (L21 * z1 + L22 * z2) * dailySig2;
        const r3 = z3 * dailySig3;
        const pnl = pvVal * ((w1/100)*r1 + (w2/100)*r2 + (w3/100)*r3);
        results.push(pnl);
      }
      return { values: results, unit: '$', paths: null, isVar: true };
    }
  },

  project: {
    label: 'Project Cost',
    desc: 'Models total project cost as the product of uncertain unit quantities (normal distribution) and uncertain unit costs (uniform distribution). A classic application of Monte Carlo in project management and engineering estimation.',
    formula: 'Cost = Units × UnitCost',
    formulaDesc: 'Units ~ N(μ, σ²) and UnitCost ~ Uniform(low, high). Their product\'s distribution is neither normal nor uniform — only simulation reveals it.',
    params: [
      { id: 'u_mean', label: 'Units (mean)',    min: 50,  max: 5000, val: 500,  step: 50, fmt: v => v.toLocaleString() },
      { id: 'u_std',  label: 'Units (std dev)', min: 5,   max: 500,  val: 60,   step: 5,  fmt: v => '±' + v },
      { id: 'c_low',  label: 'Unit Cost (low $)', min: 1, max: 100,  val: 8,    step: 1,  fmt: v => '$' + v },
      { id: 'c_high', label: 'Unit Cost (high $)', min: 1, max: 200, val: 15,   step: 1,  fmt: v => '$' + v },
    ],
    run(n, p) {
      const { u_mean, u_std, c_low, c_high } = p;
      const values = [];
      for (let i = 0; i < n; i++) {
        const units = Math.max(0, randNorm(u_mean, u_std));
        const cost  = c_low + Math.random() * (c_high - c_low);
        values.push(units * cost);
      }
      return { values, unit: '$', paths: null };
    }
  },

  pi: {
    label: 'Estimate π',
    desc: 'The classic Monte Carlo demonstration. Random points (x,y) are sampled uniformly in [−1,1]². Points inside the unit circle (x²+y²≤1) occur with probability π/4. Running average converges to π/4, then multiplied by 4.',
    formula: 'π ≈ 4 · (points inside circle) / (total points)',
    formulaDesc: 'Convergence is slow (error ∝ 1/√N) but the method generalises to arbitrary integrals in high dimensions where analytical solutions are intractable.',
    params: [],
    run(n) {
      const running = [];
      let inside = 0;
      const step = Math.max(1, Math.floor(n / 400));
      for (let i = 1; i <= n; i++) {
        const x = Math.random() * 2 - 1;
        const y = Math.random() * 2 - 1;
        if (x * x + y * y <= 1) inside++;
        if (i % step === 0) running.push(4 * inside / i);
      }
      return { values: running, unit: 'pi', paths: null, isPi: true };
    }
  }
};

// ─── STATE ────────────────────────────────────────────────────────────────────

let currentScenario = 'gbm';
let currentN = 10000;
let mainChart = null;
let convChart = null;
let totalRuns = 0;

// ─── INIT ─────────────────────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  startClock();
  animateHero();
  animateTotalRuns();
  renderParams();
  renderScenarioDesc();

  document.querySelectorAll('.stab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.stab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentScenario = btn.dataset.sc;
      renderParams();
      renderScenarioDesc();
      clearOutput();
    });
  });

  document.querySelectorAll('.tbtn').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.tbtn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentN = parseInt(btn.dataset.n);
      document.getElementById('run-sub').textContent = parseInt(btn.dataset.n).toLocaleString() + ' trials';
    });
  });

  document.querySelectorAll('.ctoggle').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.ctoggle').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      if (lastResult) drawChart(lastResult, btn.dataset.mode);
    });
  });

  runSimulation();
});

// ─── CLOCK ────────────────────────────────────────────────────────────────────

function startClock() {
  const el = document.getElementById('clock');
  const tick = () => {
    el.textContent = new Date().toLocaleTimeString('en-US', { hour12: false });
    setTimeout(tick, 1000);
  };
  tick();
}

function animateTotalRuns() {
  const el = document.getElementById('total-runs');
  let v = 0;
  const target = 2847391;
  const step = () => {
    v += Math.floor(Math.random() * 12000 + 5000);
    if (v >= target) { el.textContent = target.toLocaleString(); return; }
    el.textContent = v.toLocaleString();
    setTimeout(step, 20);
  };
  step();
}

// ─── HERO CANVAS ─────────────────────────────────────────────────────────────

function animateHero() {
  const canvas = document.getElementById('heroCanvas');
  const ctx = canvas.getContext('2d');
  const W = canvas.width, H = canvas.height;
  const points = [];
  const MAX = 600;

  function addPoint() {
    const x = randNorm(W / 2, W / 5);
    const y = randNorm(H / 2, H / 5);
    if (x > 0 && x < W && y > 0 && y < H) points.push({ x, y, a: 1 });
    if (points.length > MAX) points.shift();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, W, H);

    // Draw grid
    ctx.strokeStyle = 'rgba(0,229,160,0.06)';
    ctx.lineWidth = 0.5;
    for (let gx = 0; gx <= W; gx += 40) {
      ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, H); ctx.stroke();
    }
    for (let gy = 0; gy <= H; gy += 40) {
      ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(W, gy); ctx.stroke();
    }

    // Draw points
    points.forEach((p, i) => {
      const alpha = (i / points.length) * 0.85;
      ctx.fillStyle = `rgba(0,229,160,${alpha})`;
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2, 0, Math.PI * 2);
      ctx.fill();
    });

    // Draw live bell curve outline
    ctx.beginPath();
    ctx.strokeStyle = 'rgba(0,180,255,0.5)';
    ctx.lineWidth = 1.5;
    for (let px = 0; px < W; px++) {
      const z = (px - W / 2) / (W / 5);
      const py = H - (H * 0.85 * Math.exp(-0.5 * z * z)) - 10;
      px === 0 ? ctx.moveTo(px, py) : ctx.lineTo(px, py);
    }
    ctx.stroke();

    addPoint();
    addPoint();
    requestAnimationFrame(draw);
  }
  draw();
}

// ─── PARAMS ───────────────────────────────────────────────────────────────────

function renderParams() {
  const sc = SCENARIOS[currentScenario];
  const container = document.getElementById('param-controls');
  if (!sc.params.length) {
    container.innerHTML = '<div style="font-size:11px;color:var(--text3);line-height:1.7;">No free parameters.<br>Just hit Run.</div>';
    document.getElementById('pathsToggle').style.display = 'none';
    return;
  }
  document.getElementById('pathsToggle').style.display = currentScenario === 'gbm' ? '' : 'none';

  container.innerHTML = sc.params.map(p => `
    <div class="param-group">
      <div class="param-label">
        <span class="param-name">${p.label}</span>
        <span class="param-value" id="pv-${p.id}">${p.fmt(p.val)}</span>
      </div>
      <input type="range" min="${p.min}" max="${p.max}" value="${p.val}" step="${p.step}"
        id="pr-${p.id}"
        oninput="document.getElementById('pv-${p.id}').textContent = SCENARIOS['${currentScenario}'].params.find(x=>x.id==='${p.id}').fmt(parseFloat(this.value))"
      >
    </div>
  `).join('');
}

function renderScenarioDesc() {
  const sc = SCENARIOS[currentScenario];
  document.getElementById('sc-desc').textContent = sc.desc;
}

function getParams() {
  const sc = SCENARIOS[currentScenario];
  const p = {};
  sc.params.forEach(param => {
    p[param.id] = parseFloat(document.getElementById('pr-' + param.id).value);
  });
  return p;
}

function clearOutput() {
  ['s-mean','s-p5','s-p50','s-p95','s-std','s-skew'].forEach(id => {
    document.getElementById(id).textContent = '—';
  });
  document.getElementById('legend-row').innerHTML = '';
  document.getElementById('formula-box').classList.remove('show');
  if (mainChart) { mainChart.destroy(); mainChart = null; }
  document.getElementById('conv-box').style.display = 'none';
}

// ─── SIMULATION ───────────────────────────────────────────────────────────────

let lastResult = null;

function runSimulation() {
  const btn = document.getElementById('runBtn');
  btn.classList.add('running');
  document.querySelector('.run-btn-text').textContent = '⟳ RUNNING...';

  setTimeout(() => {
    const params = getParams();
    const sc = SCENARIOS[currentScenario];
    const result = sc.run(currentN, params);
    lastResult = result;
    totalRuns += currentN;

    // Update total counter
    const el = document.getElementById('total-runs');
    const cur = parseInt(el.textContent.replace(/,/g,'')) + currentN;
    el.textContent = cur.toLocaleString();

    updateStats(result);

    const activeMode = document.querySelector('.ctoggle.active').dataset.mode;
    drawChart(result, activeMode);
    drawConvergence(result);
    showFormula(sc);

    btn.classList.remove('running');
    document.querySelector('.run-btn-text').textContent = '▶ RUN SIMULATION';
  }, 50);
}

function updateStats(result) {
  const v = result.values;
  const m = mean(v);
  const s = stdDev(v);
  const p5  = percentile(v, 5);
  const p50 = percentile(v, 50);
  const p95 = percentile(v, 95);
  const sk  = skewness(v);

  const u = result.unit;

  if (result.isPi) {
    document.getElementById('s-mean').textContent = m.toFixed(5);
    document.getElementById('s-p5').textContent   = p5.toFixed(5);
    document.getElementById('s-p50').textContent  = p50.toFixed(5);
    document.getElementById('s-p95').textContent  = p95.toFixed(5);
    document.getElementById('s-std').textContent  = s.toFixed(5);
    document.getElementById('s-skew').textContent = sk.toFixed(3);
  } else if (result.isVar) {
    document.getElementById('s-mean').textContent = fmt(m, '$');
    document.getElementById('s-p5').textContent   = fmt(p5, '$') + ' VaR95';
    document.getElementById('s-p50').textContent  = fmt(p50, '$');
    document.getElementById('s-p95').textContent  = fmt(p95, '$');
    document.getElementById('s-std').textContent  = fmt(s, '$');
    document.getElementById('s-skew').textContent = sk.toFixed(3);
  } else {
    document.getElementById('s-mean').textContent = fmt(m, u);
    document.getElementById('s-p5').textContent   = fmt(p5, u);
    document.getElementById('s-p50').textContent  = fmt(p50, u);
    document.getElementById('s-p95').textContent  = fmt(p95, u);
    document.getElementById('s-std').textContent  = fmt(s, u);
    document.getElementById('s-skew').textContent = sk.toFixed(3);
  }
}

// ─── CHARTS ───────────────────────────────────────────────────────────────────

function drawChart(result, mode) {
  if (mainChart) { mainChart.destroy(); mainChart = null; }

  if (mode === 'paths' && result.paths && result.paths.length) {
    drawPaths(result);
  } else if (mode === 'cdf') {
    drawCDF(result);
  } else {
    drawHistogram(result);
  }
}

function drawHistogram(result) {
  const v = result.values;
  const BINS = 60;
  const minV = Math.min(...v), maxV = Math.max(...v);
  const bw = (maxV - minV) / BINS;
  const counts = new Array(BINS).fill(0);
  v.forEach(val => {
    const i = Math.min(Math.floor((val - minV) / bw), BINS - 1);
    counts[i]++;
  });

  const p5 = percentile(v, 5);
  const p95 = percentile(v, 95);

  const labels = counts.map((_, i) => {
    const mid = minV + (i + 0.5) * bw;
    if (result.isPi) return mid.toFixed(2);
    if (result.unit === '$') {
      if (Math.abs(mid) > 1e6) return '$' + (mid / 1e6).toFixed(1) + 'M';
      return '$' + Math.round(mid / 1000) + 'k';
    }
    return mid.toFixed(1);
  });

  const colors = counts.map((_, i) => {
    const mid = minV + (i + 0.5) * bw;
    if (mid < p5) return 'rgba(255,77,109,0.8)';
    if (mid > p95) return 'rgba(0,229,160,0.8)';
    return 'rgba(0,180,255,0.6)';
  });

  mainChart = new Chart(document.getElementById('mainChart'), {
    type: 'bar',
    data: {
      labels,
      datasets: [{ data: counts, backgroundColor: colors, borderWidth: 0, barPercentage: 1, categoryPercentage: 1 }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            title: ctx => labels[ctx[0].dataIndex],
            label: ctx => `Count: ${ctx.parsed.y.toLocaleString()}`
          },
          backgroundColor: '#141c24',
          borderColor: 'rgba(0,229,160,0.3)',
          borderWidth: 1,
          titleColor: '#e2eaf4',
          bodyColor: '#7a95b0',
          titleFont: { family: 'IBM Plex Mono', size: 11 },
          bodyFont: { family: 'IBM Plex Mono', size: 11 },
        }
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 10, color: '#3d5a70', font: { family: 'IBM Plex Mono', size: 10 } },
          grid: { display: false },
          border: { color: 'rgba(0,229,160,0.1)' }
        },
        y: {
          ticks: { color: '#3d5a70', font: { family: 'IBM Plex Mono', size: 10 } },
          grid: { color: 'rgba(0,229,160,0.06)' },
          border: { color: 'rgba(0,229,160,0.1)' }
        }
      }
    }
  });

  document.getElementById('legend-row').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:rgba(255,77,109,0.8)"></div>Below P5 (tail risk)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:rgba(0,180,255,0.6)"></div>P5 – P95 (core range)</div>
    <div class="legend-item"><div class="legend-swatch" style="background:rgba(0,229,160,0.8)"></div>Above P95 (upside)</div>
  `;
}

function drawCDF(result) {
  const v = [...result.values].sort((a, b) => a - b);
  const step = Math.max(1, Math.floor(v.length / 200));
  const xs = [], ys = [];
  for (let i = 0; i < v.length; i += step) {
    xs.push(v[i]);
    ys.push(i / v.length);
  }
  xs.push(v[v.length-1]);
  ys.push(1);

  const p5 = percentile(v, 5), p95 = percentile(v, 95);

  const labels = xs.map(x => {
    if (result.isPi) return x.toFixed(2);
    if (result.unit === '$') {
      if (Math.abs(x) > 1e6) return '$' + (x/1e6).toFixed(1)+'M';
      return '$' + Math.round(x/1000)+'k';
    }
    return x.toFixed(2);
  });

  mainChart = new Chart(document.getElementById('mainChart'), {
    type: 'line',
    data: {
      labels,
      datasets: [{
        data: ys.map(y => y * 100),
        borderColor: 'rgba(0,180,255,0.9)',
        backgroundColor: 'rgba(0,180,255,0.08)',
        borderWidth: 2,
        pointRadius: 0,
        fill: true,
        tension: 0.4
      }]
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 300 },
      plugins: { legend: { display: false },
        tooltip: {
          callbacks: {
            label: ctx => `Probability: ${ctx.parsed.y.toFixed(1)}%`
          },
          backgroundColor: '#141c24',
          borderColor: 'rgba(0,229,160,0.3)',
          borderWidth: 1,
          titleColor: '#e2eaf4',
          bodyColor: '#7a95b0',
          titleFont: { family: 'IBM Plex Mono', size: 11 },
          bodyFont: { family: 'IBM Plex Mono', size: 11 },
        }
      },
      scales: {
        x: {
          ticks: { maxTicksLimit: 8, color: '#3d5a70', font: { family: 'IBM Plex Mono', size: 10 } },
          grid: { display: false },
          border: { color: 'rgba(0,229,160,0.1)' }
        },
        y: {
          min: 0, max: 100,
          ticks: { color: '#3d5a70', font: { family: 'IBM Plex Mono', size: 10 }, callback: v => v + '%' },
          grid: { color: 'rgba(0,229,160,0.06)' },
          border: { color: 'rgba(0,229,160,0.1)' }
        }
      }
    }
  });

  document.getElementById('legend-row').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:rgba(0,180,255,0.9)"></div>Cumulative probability — read P(outcome ≤ x)</div>
  `;
}

function drawPaths(result) {
  const paths = result.paths.slice(0, 80);
  const len = paths[0].length;
  const labels = Array.from({ length: len }, (_, i) => i);

  const m = mean(result.values);
  const p5 = percentile(result.values, 5);
  const p95 = percentile(result.values, 95);

  const datasets = paths.map((path, i) => ({
    data: path,
    borderColor: path[path.length-1] > m ? 'rgba(0,229,160,0.15)' : 'rgba(255,77,109,0.15)',
    borderWidth: 0.8,
    pointRadius: 0,
    fill: false,
    tension: 0.3
  }));

  // Add mean path
  const meanPath = labels.map(i => {
    const vals = paths.map(p => p[Math.min(i, p.length-1)]);
    return mean(vals);
  });
  datasets.push({
    data: meanPath,
    borderColor: '#00e5a0',
    borderWidth: 2.5,
    pointRadius: 0,
    fill: false,
    tension: 0.3
  });

  mainChart = new Chart(document.getElementById('mainChart'), {
    type: 'line',
    data: { labels, datasets },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      animation: { duration: 200 },
      plugins: { legend: { display: false }, tooltip: { enabled: false } },
      scales: {
        x: {
          ticks: { maxTicksLimit: 6, color: '#3d5a70', font: { family: 'IBM Plex Mono', size: 10 } },
          grid: { display: false },
          border: { color: 'rgba(0,229,160,0.1)' }
        },
        y: {
          ticks: { color: '#3d5a70', font: { family: 'IBM Plex Mono', size: 10 }, callback: v => '$' + Math.round(v) },
          grid: { color: 'rgba(0,229,160,0.06)' },
          border: { color: 'rgba(0,229,160,0.1)' }
        }
      }
    }
  });

  document.getElementById('legend-row').innerHTML = `
    <div class="legend-item"><div class="legend-swatch" style="background:rgba(0,229,160,0.4)"></div>Up paths</div>
    <div class="legend-item"><div class="legend-swatch" style="background:rgba(255,77,109,0.4)"></div>Down paths</div>
    <div class="legend-item"><div class="legend-swatch" style="background:#00e5a0"></div>Mean path</div>
  `;
}

function drawConvergence(result) {
  if (result.isPi) {
    // Show convergence to π
    const box = document.getElementById('conv-box');
    box.style.display = 'block';
    if (convChart) convChart.destroy();

    const v = result.values;
    const step = Math.max(1, Math.floor(v.length / 100));
    const xs = [], ys = [];
    for (let i = 0; i < v.length; i += step) { xs.push(i * step); ys.push(v[i]); }

    convChart = new Chart(document.getElementById('convChart'), {
      type: 'line',
      data: {
        labels: xs,
        datasets: [
          { data: ys, borderColor: '#00e5a0', borderWidth: 1.5, pointRadius: 0, fill: false },
          { data: xs.map(() => Math.PI), borderColor: 'rgba(255,77,109,0.6)', borderWidth: 1, borderDash: [4,4], pointRadius: 0, fill: false }
        ]
      },
      options: {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 200 },
        plugins: { legend: { display: false }, tooltip: { enabled: false } },
        scales: {
          x: { display: false },
          y: { ticks: { color: '#3d5a70', font: { family: 'IBM Plex Mono', size: 9 }, maxTicksLimit: 4 }, grid: { color: 'rgba(0,229,160,0.04)' }, border: { color: 'rgba(0,229,160,0.1)' } }
        }
      }
    });
  } else {
    document.getElementById('conv-box').style.display = 'none';
  }
}

function showFormula(sc) {
  const box = document.getElementById('formula-box');
  box.innerHTML = `<div class="formula">${sc.formula}</div><div>${sc.formulaDesc}</div>`;
  box.classList.add('show');
}
