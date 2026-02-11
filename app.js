/* app.js - 核心逻辑 */
(function () {
  'use strict';

  const STORAGE_KEY = 'habitCheckinData';

  /* ===== 数据层 ===== */
  function defaultData() {
    return {
      version: 1,
      goals: [],
      checkins: [],
      cards: [],
      timerState: { goalId: null, startedAt: null, accumulatedMs: 0, isRunning: false },
      claimedRewards: []
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const d = JSON.parse(raw);
      if (!d.claimedRewards) d.claimedRewards = [];
      return d;
    } catch { return defaultData(); }
  }

  function save(data) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  }

  let data = load();

  /* ===== 视图路由 ===== */
  let currentGoalId = null;

  function navigate(viewName) {
    document.querySelectorAll('.view').forEach(v => v.classList.remove('active'));
    document.getElementById('view-' + viewName).classList.add('active');
    document.querySelectorAll('.nav-btn').forEach(b => {
      b.classList.toggle('active', b.dataset.navigate === viewName);
    });
    if (viewName === 'dashboard') renderDashboard();
    if (viewName === 'calendar') renderCalendar();
    if (viewName === 'rewards') renderRewards();
    if (viewName === 'cards') Cards.renderCollection(data.cards, document.getElementById('cards-grid'));
    if (viewName === 'detail') renderDetail();
  }

  document.querySelectorAll('[data-navigate]').forEach(el => {
    el.addEventListener('click', () => navigate(el.dataset.navigate));
  });

  /* ===== 仪表盘 ===== */
  function getProgress(goal) {
    const checkins = data.checkins.filter(c => c.goalId === goal.id);
    return checkins.reduce((s, c) => s + c.value, 0);
  }

  function renderDashboard() {
    const list = document.getElementById('goals-list');
    if (data.goals.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>还没有目标，点击上方按钮创建一个吧！</p></div>';
    } else {
      list.innerHTML = data.goals.map(g => {
        const cur = getProgress(g);
        const unit = g.type === 'time' ? '分钟' : '次';
        const badge = g.completed
          ? '<span class="goal-card-badge completed">已完成</span>'
          : `<span class="goal-card-badge">${cur}/${g.target}${unit}</span>`;
        return `<div class="goal-card" data-goal-id="${g.id}">
          <div class="goal-card-header">
            <span class="goal-card-name">${g.name}</span>${badge}
          </div>
          ${Charts.createProgressBar(cur, g.target)}
        </div>`;
      }).join('');
      list.querySelectorAll('.goal-card').forEach(el => {
        el.addEventListener('click', () => {
          currentGoalId = el.dataset.goalId;
          navigate('detail');
        });
      });
    }
    // 环形图
    const completed = data.goals.filter(g => g.completed).length;
    const total = data.goals.length;
    const rate = total ? Math.round((completed / total) * 100) : 0;
    document.getElementById('overall-chart').innerHTML = Charts.createDonut(rate);
    document.getElementById('overall-rate').textContent = rate + '%';
  }

  /* ===== 目标详情 ===== */
  function renderDetail() {
    const goal = data.goals.find(g => g.id === currentGoalId);
    if (!goal) { navigate('dashboard'); return; }
    document.getElementById('detail-name').textContent = goal.name;
    const cur = getProgress(goal);
    const unit = goal.type === 'time' ? '分钟' : '次';
    document.getElementById('detail-progress-container').innerHTML =
      `<div style="margin-bottom:4px;font-size:.9rem;">进度：${cur} / ${goal.target} ${unit}</div>`
      + Charts.createProgressBar(cur, goal.target);
    document.getElementById('detail-reward').innerHTML =
      goal.reward ? `🎁 奖励：${goal.reward}` : '<span style="color:var(--text-dim)">未设置奖励</span>';

    // 显示对应打卡区域
    const countSection = document.getElementById('checkin-count');
    const timeSection = document.getElementById('checkin-time');
    countSection.style.display = goal.type === 'count' && !goal.completed ? '' : 'none';
    timeSection.style.display = goal.type === 'time' && !goal.completed ? '' : 'none';

    // 恢复计时器状态
    if (goal.type === 'time' && data.timerState.goalId === goal.id && data.timerState.isRunning) {
      resumeTimer();
    } else if (goal.type === 'time') {
      resetTimerUI();
    }

    // 历史记录
    const checkins = data.checkins.filter(c => c.goalId === goal.id).reverse();
    const historyEl = document.getElementById('history-list');
    if (checkins.length === 0) {
      historyEl.innerHTML = '<div class="empty-state" style="padding:16px;">暂无打卡记录</div>';
    } else {
      historyEl.innerHTML = checkins.map(c => {
        const val = goal.type === 'time' ? c.value + ' 分钟' : '+' + c.value;
        return `<div class="history-item"><span>${c.date}</span><span>${val}</span></div>`;
      }).join('');
    }
  }
  /* ===== 次数打卡 ===== */
  document.getElementById('btn-checkin-count').addEventListener('click', (e) => {
    const goal = data.goals.find(g => g.id === currentGoalId);
    if (!goal || goal.completed) return;
    const today = new Date().toISOString().slice(0, 10);
    data.checkins.push({
      id: 'c_' + Date.now(),
      goalId: goal.id,
      date: today,
      value: 1,
      timestamp: new Date().toISOString()
    });
    // +1 浮动动画
    const btn = e.currentTarget;
    btn.classList.remove('ripple');
    void btn.offsetWidth;
    btn.classList.add('ripple');
    const plus = document.createElement('span');
    plus.className = 'float-plus';
    plus.textContent = '+1';
    btn.parentElement.style.position = 'relative';
    plus.style.left = '50%';
    plus.style.top = '0';
    plus.style.transform = 'translateX(-50%)';
    btn.parentElement.appendChild(plus);
    setTimeout(() => plus.remove(), 900);

    checkCompletion(goal);
    save(data);
    renderDetail();
  });

  /* ===== 计时器 ===== */
  let timerInterval = null;

  function formatMs(ms) {
    const totalSec = Math.floor(ms / 1000);
    const h = String(Math.floor(totalSec / 3600)).padStart(2, '0');
    const m = String(Math.floor((totalSec % 3600) / 60)).padStart(2, '0');
    const s = String(totalSec % 60).padStart(2, '0');
    return `${h}:${m}:${s}`;
  }

  function updateTimerDisplay() {
    const ts = data.timerState;
    let elapsed = ts.accumulatedMs;
    if (ts.isRunning && ts.startedAt) {
      elapsed += Date.now() - new Date(ts.startedAt).getTime();
    }
    document.getElementById('timer-display').textContent = formatMs(elapsed);
  }

  function resetTimerUI() {
    clearInterval(timerInterval);
    timerInterval = null;
    document.getElementById('timer-display').textContent = '00:00:00';
    document.getElementById('btn-timer-start').disabled = false;
    document.getElementById('btn-timer-start').textContent = '开始';
    document.getElementById('btn-timer-pause').disabled = true;
    document.getElementById('btn-timer-stop').disabled = true;
  }

  function startTimer() {
    const ts = data.timerState;
    ts.goalId = currentGoalId;
    ts.startedAt = new Date().toISOString();
    ts.isRunning = true;
    save(data);
    timerInterval = setInterval(updateTimerDisplay, 200);
    document.getElementById('btn-timer-start').disabled = true;
    document.getElementById('btn-timer-pause').disabled = false;
    document.getElementById('btn-timer-stop').disabled = false;
  }

  function resumeTimer() {
    timerInterval = setInterval(updateTimerDisplay, 200);
    updateTimerDisplay();
    document.getElementById('btn-timer-start').disabled = true;
    document.getElementById('btn-timer-pause').disabled = false;
    document.getElementById('btn-timer-stop').disabled = false;
    document.getElementById('btn-timer-start').textContent = '开始';
  }
  function pauseTimer() {
    const ts = data.timerState;
    if (ts.isRunning && ts.startedAt) {
      ts.accumulatedMs += Date.now() - new Date(ts.startedAt).getTime();
      ts.startedAt = null;
      ts.isRunning = false;
    }
    clearInterval(timerInterval);
    timerInterval = null;
    save(data);
    document.getElementById('btn-timer-start').disabled = false;
    document.getElementById('btn-timer-start').textContent = '继续';
    document.getElementById('btn-timer-pause').disabled = true;
  }

  function stopTimer() {
    const ts = data.timerState;
    let totalMs = ts.accumulatedMs;
    if (ts.isRunning && ts.startedAt) {
      totalMs += Date.now() - new Date(ts.startedAt).getTime();
    }
    clearInterval(timerInterval);
    timerInterval = null;
    const minutes = Math.max(1, Math.round(totalMs / 60000));
    if (totalMs > 0) {
      const goal = data.goals.find(g => g.id === currentGoalId);
      const today = new Date().toISOString().slice(0, 10);
      data.checkins.push({
        id: 'c_' + Date.now(),
        goalId: currentGoalId,
        date: today,
        value: minutes,
        timestamp: new Date().toISOString()
      });
      if (goal) checkCompletion(goal);
    }
    ts.goalId = null;
    ts.startedAt = null;
    ts.accumulatedMs = 0;
    ts.isRunning = false;
    save(data);
    resetTimerUI();
    renderDetail();
  }

  document.getElementById('btn-timer-start').addEventListener('click', startTimer);
  document.getElementById('btn-timer-pause').addEventListener('click', pauseTimer);
  document.getElementById('btn-timer-stop').addEventListener('click', stopTimer);

  /* ===== 目标完成检测 ===== */
  function checkCompletion(goal) {
    if (goal.completed) return;
    const cur = getProgress(goal);
    if (cur >= goal.target) {
      goal.completed = true;
      goal.completedAt = new Date().toISOString();
      const card = Cards.drawCard();
      data.cards.push({
        id: 'card_' + Date.now(),
        cityId: card.id,
        obtainedAt: new Date().toISOString(),
        goalId: goal.id
      });
      save(data);
      // 目标达成：纸屑
      launchConfetti();
      setTimeout(() => {
        Cards.showReveal(card, goal.name, goal.reward, null, function onFlip() {
          // 卡牌翻转时：按稀有度播放效果
          if (card.rarity === 'legendary') {
            screenFlash();
            launchFireworks();
          } else if (card.rarity === 'rare') {
            launchFireworks();
          }
        });
      }, 400);
    }
  }
  /* ===== 新建/编辑目标 ===== */
  document.getElementById('btn-new-goal').addEventListener('click', () => {
    document.getElementById('form-title').textContent = '新建目标';
    document.getElementById('goal-form').reset();
    document.getElementById('goal-edit-id').value = '';
    document.getElementById('target-unit').textContent = '（次）';
    navigate('form');
  });

  document.getElementById('btn-edit-goal').addEventListener('click', () => {
    const goal = data.goals.find(g => g.id === currentGoalId);
    if (!goal) return;
    document.getElementById('form-title').textContent = '编辑目标';
    document.getElementById('goal-name').value = goal.name;
    document.getElementById('goal-type').value = goal.type;
    document.getElementById('goal-target').value = goal.target;
    document.getElementById('goal-reward').value = goal.reward || '';
    document.getElementById('goal-edit-id').value = goal.id;
    document.getElementById('target-unit').textContent = goal.type === 'time' ? '（分钟）' : '（次）';
    navigate('form');
  });

  document.getElementById('goal-type').addEventListener('change', (e) => {
    document.getElementById('target-unit').textContent = e.target.value === 'time' ? '（分钟）' : '（次）';
  });

  document.getElementById('goal-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const editId = document.getElementById('goal-edit-id').value;
    const name = document.getElementById('goal-name').value.trim();
    const type = document.getElementById('goal-type').value;
    const target = parseInt(document.getElementById('goal-target').value, 10);
    const reward = document.getElementById('goal-reward').value.trim();
    if (!name || !target) return;

    if (editId) {
      const goal = data.goals.find(g => g.id === editId);
      if (goal) {
        goal.name = name;
        goal.type = type;
        goal.target = target;
        goal.reward = reward;
      }
    } else {
      data.goals.push({
        id: 'g_' + Date.now(),
        name, type, target, reward,
        createdAt: new Date().toISOString(),
        completed: false,
        completedAt: null
      });
    }
    save(data);
    navigate('dashboard');
  });

  /* ===== 删除目标 ===== */
  document.getElementById('btn-delete-goal').addEventListener('click', () => {
    if (!confirm('确定删除此目标及其所有打卡记录？')) return;
    data.goals = data.goals.filter(g => g.id !== currentGoalId);
    data.checkins = data.checkins.filter(c => c.goalId !== currentGoalId);
    if (data.timerState.goalId === currentGoalId) {
      data.timerState = { goalId: null, startedAt: null, accumulatedMs: 0, isRunning: false };
      clearInterval(timerInterval);
    }
    save(data);
    navigate('dashboard');
  });
  /* ===== 五彩纸屑 ===== */
  function launchConfetti() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const pieces = [];
    const colors = ['#6c5ce7','#a29bfe','#fd79a8','#ffeaa7','#55efc4','#74b9ff','#e17055'];
    for (let i = 0; i < 120; i++) {
      pieces.push({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height - canvas.height,
        w: Math.random() * 8 + 4,
        h: Math.random() * 6 + 3,
        color: colors[Math.floor(Math.random() * colors.length)],
        vy: Math.random() * 3 + 2,
        vx: (Math.random() - 0.5) * 2,
        rot: Math.random() * 360,
        rv: (Math.random() - 0.5) * 8
      });
    }
    let frame = 0;
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      pieces.forEach(p => {
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.rv;
        ctx.save();
        ctx.translate(p.x, p.y);
        ctx.rotate((p.rot * Math.PI) / 180);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
      });
      frame++;
      if (frame < 180) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
  }

  /* ===== 礼花效果（稀有/传说卡） ===== */
  function launchFireworks() {
    const canvas = document.getElementById('confetti-canvas');
    const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth;
    canvas.height = window.innerHeight;
    const sparks = [];
    const colors = ['#FFD700','#FF6B6B','#a29bfe','#55efc4','#fd79a8','#74b9ff','#fff'];
    // 生成 3 个爆炸点
    for (let b = 0; b < 3; b++) {
      const cx = canvas.width * (0.25 + Math.random() * 0.5);
      const cy = canvas.height * (0.2 + Math.random() * 0.3);
      for (let i = 0; i < 40; i++) {
        const angle = (Math.PI * 2 * i) / 40 + (Math.random() - 0.5) * 0.3;
        const speed = 2 + Math.random() * 4;
        sparks.push({
          x: cx, y: cy,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          decay: 0.008 + Math.random() * 0.008,
          color: colors[Math.floor(Math.random() * colors.length)],
          size: 2 + Math.random() * 2
        });
      }
    }
    function draw() {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      let alive = false;
      sparks.forEach(s => {
        if (s.life <= 0) return;
        alive = true;
        s.x += s.vx;
        s.y += s.vy;
        s.vy += 0.04; // 重力
        s.life -= s.decay;
        ctx.globalAlpha = Math.max(0, s.life);
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2);
        ctx.fillStyle = s.color;
        ctx.fill();
      });
      ctx.globalAlpha = 1;
      if (alive) requestAnimationFrame(draw);
      else ctx.clearRect(0, 0, canvas.width, canvas.height);
    }
    draw();
  }

  /* ===== 屏幕闪光（传说卡） ===== */
  function screenFlash() {
    const flash = document.createElement('div');
    flash.className = 'screen-flash';
    document.body.appendChild(flash);
    setTimeout(() => flash.remove(), 500);
  }

  /* ===== 日历 ===== */
  let calYear, calMonth, calSelectedDate;
  (function initCalDate() {
    const now = new Date();
    calYear = now.getFullYear();
    calMonth = now.getMonth();
    calSelectedDate = null;
  })();

  document.getElementById('cal-prev').addEventListener('click', () => {
    calMonth--;
    if (calMonth < 0) { calMonth = 11; calYear--; }
    calSelectedDate = null;
    renderCalendar();
  });
  document.getElementById('cal-next').addEventListener('click', () => {
    calMonth++;
    if (calMonth > 11) { calMonth = 0; calYear++; }
    calSelectedDate = null;
    renderCalendar();
  });

  function renderCalendar() {
    document.getElementById('cal-title').textContent = `${calYear}年${calMonth + 1}月`;
    const grid = document.getElementById('cal-grid');
    const firstDay = new Date(calYear, calMonth, 1).getDay();
    const daysInMonth = new Date(calYear, calMonth + 1, 0).getDate();
    const today = new Date().toISOString().slice(0, 10);

    // 统计本月每天的打卡次数
    const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    const dayMap = {};
    data.checkins.forEach(c => {
      if (c.date.startsWith(monthPrefix)) {
        dayMap[c.date] = (dayMap[c.date] || 0) + 1;
      }
    });

    let html = '';
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="cal-day empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === today;
      const isSelected = dateStr === calSelectedDate;
      const count = dayMap[dateStr] || 0;
      const dots = count > 0
        ? `<div class="cal-dots">${'<span class="cal-dot"></span>'.repeat(Math.min(count, 3))}</div>`
        : '';
      html += `<div class="cal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}" data-date="${dateStr}">${d}${dots}</div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
      el.addEventListener('click', () => {
        calSelectedDate = el.dataset.date;
        renderCalendar();
        renderCalendarDetail(el.dataset.date);
      });
    });

    if (calSelectedDate) {
      renderCalendarDetail(calSelectedDate);
    } else {
      document.getElementById('cal-detail').innerHTML =
        '<p class="empty-state" style="padding:16px;">点击日期查看打卡记录</p>';
    }
  }

  function renderCalendarDetail(dateStr) {
    const detail = document.getElementById('cal-detail');
    const records = data.checkins.filter(c => c.date === dateStr);
    if (records.length === 0) {
      detail.innerHTML = `<h3>${dateStr}</h3><p style="color:var(--text-dim);font-size:.85rem;">当天无打卡记录</p>`;
      return;
    }
    const items = records.map(c => {
      const goal = data.goals.find(g => g.id === c.goalId);
      const name = goal ? goal.name : '已删除目标';
      const unit = goal && goal.type === 'time' ? ' 分钟' : ' 次';
      return `<div class="cal-record"><span>${name}</span><span>+${c.value}${unit}</span></div>`;
    }).join('');
    detail.innerHTML = `<h3>${dateStr}</h3>${items}`;
  }

  /* ===== 奖励墙 ===== */
  function renderRewards() {
    const list = document.getElementById('rewards-list');
    // 收集所有已完成且有奖励的目标
    const rewards = data.goals
      .filter(g => g.completed && g.reward)
      .map(g => ({
        goalId: g.id,
        goalName: g.name,
        reward: g.reward,
        completedAt: g.completedAt,
        claimed: data.claimedRewards.includes(g.id)
      }));
    if (rewards.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>还没有获得奖励，完成目标即可解锁</p></div>';
      return;
    }
    // 未兑现排前面
    rewards.sort((a, b) => a.claimed - b.claimed);
    list.innerHTML = rewards.map(r => `
      <div class="reward-item${r.claimed ? ' claimed' : ''}" data-goal-id="${r.goalId}">
        <div class="reward-check">${r.claimed ? '✓' : ''}</div>
        <div class="reward-info">
          <span class="reward-name">🎁 ${r.reward}</span>
          <span class="reward-goal">来自目标「${r.goalName}」</span>
        </div>
      </div>
    `).join('');
    list.querySelectorAll('.reward-item').forEach(el => {
      el.addEventListener('click', () => {
        const gid = el.dataset.goalId;
        const idx = data.claimedRewards.indexOf(gid);
        if (idx === -1) {
          data.claimedRewards.push(gid);
        } else {
          data.claimedRewards.splice(idx, 1);
        }
        save(data);
        renderRewards();
      });
    });
  }

  /* ===== 导出数据 ===== */
  document.getElementById('btn-export').addEventListener('click', () => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = '打卡数据_' + new Date().toISOString().slice(0, 10) + '.json';
    a.click();
    URL.revokeObjectURL(a.href);
  });

  /* ===== 导入数据 ===== */
  document.getElementById('btn-import').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imported = JSON.parse(ev.target.result);
        if (!imported.goals || !imported.checkins) {
          alert('文件格式不正确，请选择之前导出的 JSON 文件。');
          return;
        }
        if (!confirm('导入将覆盖当前所有数据，确定继续？')) return;
        data = imported;
        save(data);
        navigate('dashboard');
        alert('导入成功！');
      } catch {
        alert('文件读取失败，请确认是有效的 JSON 文件。');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  /* ===== 初始化 ===== */
  navigate('dashboard');
})();
