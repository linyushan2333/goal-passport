/* charts.js - SVG 进度条 & 环形图 */
const Charts = {
  createProgressBar(current, target) {
    const pct = Math.min(100, Math.round((current / target) * 100));
    return `
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      <div class="progress-text">${current} / ${target}（${pct}%）</div>`;
  },

  createDonut(percentage, size = 80) {
    const r = size / 2 - 6;
    const c = 2 * Math.PI * r;
    const offset = c - (percentage / 100) * c;
    const cx = size / 2, cy = size / 2;
    return `<svg width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#25253d" stroke-width="6"/>
      <circle cx="${cx}" cy="${cy}" r="${r}" fill="none"
        stroke="url(#donutGrad)" stroke-width="6"
        stroke-dasharray="${c}" stroke-dashoffset="${offset}"
        stroke-linecap="round" transform="rotate(-90 ${cx} ${cy})"
        style="transition:stroke-dashoffset .6s ease"/>
      <defs>
        <linearGradient id="donutGrad" x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stop-color="#6c5ce7"/>
          <stop offset="100%" stop-color="#a29bfe"/>
        </linearGradient>
      </defs>
    </svg>`;
  }
};
