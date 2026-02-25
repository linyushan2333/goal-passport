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
      claimedRewards: [],
      // 新增数据
      points: 0,
      shopItems: [
        { id: 'item_1', name: '看一场电影', cost: 50, icon: '🎬' },
        { id: 'item_2', name: '喝一杯奶茶', cost: 30, icon: '🧋' },
        { id: 'item_3', name: '买一本新书', cost: 80, icon: '📚' }
      ],
      purchasedItems: [],
      pointLogs: []
    };
  }

  function load() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultData();
      const d = JSON.parse(raw);
      if (typeof d.points !== 'number') d.points = 0;
      if (!d.shopItems) d.shopItems = defaultData().shopItems;
      if (!d.purchasedItems) d.purchasedItems = [];
      if (!d.pointLogs) d.pointLogs = [];
      // 兼容旧数据：确保 goals 和 shopItems 有 deleted 字段
      (d.goals || []).forEach(g => { if (g.deleted === undefined) g.deleted = false; });
      (d.shopItems || []).forEach(i => { if (i.deleted === undefined) i.deleted = false; });
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

    if (viewName === 'cards') Cards.renderCollection(data.cards, document.getElementById('cards-grid'));
    if (viewName === 'detail') renderDetail();
    if (viewName === 'shop') renderShop();
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
    const activeGoals = data.goals.filter(g => !g.deleted);
    const archivedGoals = data.goals.filter(g => g.deleted);

    if (activeGoals.length === 0) {
      list.innerHTML = '<div class="empty-state"><p>还没有目标，点击上方按钮创建一个吧！</p></div>';
    } else {
      list.innerHTML = activeGoals.map(g => {
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

    // ===== 已归档折叠区 =====
    const archSection = document.getElementById('archived-section');
    const archList = document.getElementById('archived-list');
    const archCount = document.getElementById('archived-count');
    if (archivedGoals.length === 0) {
      archSection.style.display = 'none';
    } else {
      archSection.style.display = '';
      archCount.textContent = archivedGoals.length;
      archList.innerHTML = archivedGoals.map(g => {
        const cur = getProgress(g);
        const unit = g.type === 'time' ? '分钟' : '次';
        const deletedAt = g.deletedAt ? g.deletedAt.slice(0, 10) : '';
        const statusBadge = g.completed
          ? '<span class="goal-card-badge completed">已完成</span>'
          : `<span class="goal-card-badge">${cur}/${g.target}${unit}</span>`;
        return `<div class="goal-card goal-card-archived" data-goal-id="${g.id}">
          <div class="goal-card-header">
            <span class="goal-card-name">${g.name}</span>${statusBadge}
          </div>
          ${Charts.createProgressBar(cur, g.target)}
          <div class="archived-meta">📦 归档于 ${deletedAt}</div>
        </div>`;
      }).join('');
      archList.querySelectorAll('.goal-card-archived').forEach(el => {
        el.addEventListener('click', () => {
          currentGoalId = el.dataset.goalId;
          navigate('detail');
        });
      });
    }

    // 环形图（只计算活跃目标）
    const completed = activeGoals.filter(g => g.completed).length;
    const total = activeGoals.length;
    const rate = total ? Math.round((completed / total) * 100) : 0;
    document.getElementById('overall-chart').innerHTML = Charts.createDonut(rate);
    document.getElementById('overall-rate').textContent = rate + '%';
  }

  // 归档折叠展开
  document.getElementById('btn-toggle-archived').addEventListener('click', () => {
    const archList = document.getElementById('archived-list');
    const chevron = document.getElementById('archived-chevron');
    const isOpen = archList.style.display !== 'none';
    archList.style.display = isOpen ? 'none' : '';
    chevron.textContent = isOpen ? '▶' : '▼';
  });

  /* ===== 目标详情 ===== */
  function renderDetail() {
    const goal = data.goals.find(g => g.id === currentGoalId);
    if (!goal) { navigate('dashboard'); return; }
    // 已归档目标：按钮文字变「取消归档」
    const deleteBtn = document.getElementById('btn-delete-goal');
    if (goal.deleted) {
      deleteBtn.textContent = '取消归档';
      deleteBtn.classList.remove('btn-danger');
      deleteBtn.classList.add('btn-restore');
    } else {
      deleteBtn.textContent = '归档';
      deleteBtn.classList.remove('btn-restore');
      deleteBtn.classList.add('btn-danger');
    }
    document.getElementById('detail-name').textContent = goal.name;
    const cur = getProgress(goal);
    const unit = goal.type === 'time' ? '分钟' : '次';
    document.getElementById('detail-progress-container').innerHTML =
      `<div style="margin-bottom:4px;font-size:.9rem;">进度：${cur} / ${goal.target} ${unit}</div>`
      + Charts.createProgressBar(cur, goal.target);
    document.getElementById('detail-reward').innerHTML =
      `🎁 完成可得：<span style="color:var(--primary-light);font-weight:bold;">${goal.rewardPoints || 100}</span> 积分`;

    // 清空备注
    document.getElementById('checkin-note-input').value = '';

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
        const noteHtml = c.note ? `<div class="history-note">${c.note}</div>` : '';
        return `<div class="history-item" data-checkin-id="${c.id}">
          <div style="flex:1;">
            <div style="display:flex;justify-content:space-between;">
              <span>${c.date}</span>
              <span>${val}</span>
            </div>
            ${noteHtml}
          </div>
          <button class="btn-delete-checkin" data-id="${c.id}" title="删除此条记录">×</button>
        </div>`;
      }).join('');

      // 绑定删除打卡记录
      historyEl.querySelectorAll('.btn-delete-checkin').forEach(btn => {
        btn.addEventListener('click', () => {
          const checkinId = btn.dataset.id;
          const checkin = data.checkins.find(c => c.id === checkinId);
          if (!checkin) return;
          const valLabel = goal.type === 'time' ? checkin.value + ' 分钟' : '+' + checkin.value;
          if (!confirm(`删除「${checkin.date} ${valLabel}」这条打卡记录？`)) return;
          // 删除记录
          data.checkins = data.checkins.filter(c => c.id !== checkinId);
          // 如果目标已完成但删除后进度不足，重置完成状态
          if (goal.completed) {
            const newProgress = getProgress(goal);
            if (newProgress < goal.target) {
              goal.completed = false;
              goal.completedAt = null;
            }
          }
          save(data);
          renderDetail();
        });
      });
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
      note: document.getElementById('checkin-note-input').value.trim(),
      timestamp: new Date().toISOString()
    });
    // 增加积分
    addPoints(10, '日常打卡');
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
        date: today,
        value: minutes,
        note: document.getElementById('checkin-note-input').value.trim() + ' (时长打卡)', // 自动追加标记
        timestamp: new Date().toISOString()
      });
      if (goal) checkCompletion(goal);
      // 增加积分
      addPoints(10, '时长打卡');
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
      // 目标达成积分 (使用自定义积分，默认为 100)
      addPoints(goal.rewardPoints || 100, `达成目标「${goal.name}」`);
      save(data);
      // 目标达成：纸屑
      launchConfetti();
      launchConfetti();
      setTimeout(() => {
        Cards.showReveal(card, goal.name, `${goal.rewardPoints || 100} 积分`, null, function onFlip() {
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
    document.getElementById('goal-reward-points').value = goal.rewardPoints || 100;
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
    const rewardPoints = parseInt(document.getElementById('goal-reward-points').value, 10) || 100;
    if (!name || !target) return;

    if (editId) {
      const goal = data.goals.find(g => g.id === editId);
      if (goal) {
        goal.name = name;
        goal.type = type;
        goal.target = target;
        goal.rewardPoints = rewardPoints;
      }
    } else {
      data.goals.push({
        id: 'g_' + Date.now(),
        name, type, target, rewardPoints,
        createdAt: new Date().toISOString(),
        completed: false,
        completedAt: null
      });
    }
    save(data);
    navigate('dashboard');
  });

  /* ===== 归档 / 取消归档目标（软删除，保留所有记录） ===== */
  document.getElementById('btn-delete-goal').addEventListener('click', () => {
    const goal = data.goals.find(g => g.id === currentGoalId);
    if (!goal) return;

    if (goal.deleted) {
      // 取消归档：恢复
      if (!confirm(`取消归档「${goal.name}」，将重新出现在仪表盘？`)) return;
      goal.deleted = false;
      goal.deletedAt = null;
    } else {
      // 归档：软删除，不清除任何打卡/积分记录
      if (!confirm(`归档「${goal.name}」？打卡记录将保留，可随时取消归档。`)) return;
      goal.deleted = true;
      goal.deletedAt = new Date().toISOString();
      // 若计时器正在运行，停止
      if (data.timerState.goalId === currentGoalId) {
        data.timerState = { goalId: null, startedAt: null, accumulatedMs: 0, isRunning: false };
        clearInterval(timerInterval);
      }
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
    const colors = ['#6c5ce7', '#a29bfe', '#fd79a8', '#ffeaa7', '#55efc4', '#74b9ff', '#e17055'];
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
    const colors = ['#FFD700', '#FF6B6B', '#a29bfe', '#55efc4', '#fd79a8', '#74b9ff', '#fff'];
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

    // 统计本月每天的打卡次数 & 积分变动
    const monthPrefix = `${calYear}-${String(calMonth + 1).padStart(2, '0')}`;
    const dayCheckinMap = {};
    data.checkins.forEach(c => {
      if (c.date.startsWith(monthPrefix)) {
        dayCheckinMap[c.date] = (dayCheckinMap[c.date] || 0) + 1;
      }
    });

    // 统计积分
    const monthLogs = data.pointLogs.filter(l => l.time.startsWith(monthPrefix));
    let totalInc = 0;
    let totalExp = 0;
    const dayNetMap = {}; // date -> netPoints

    monthLogs.forEach(l => {
      const date = l.time.slice(0, 10);
      if (l.amount > 0) totalInc += l.amount;
      else totalExp += Math.abs(l.amount);

      dayNetMap[date] = (dayNetMap[date] || 0) + l.amount;
    });

    // 更新概要
    document.getElementById('cal-summary').style.display = 'flex';
    document.getElementById('cal-inc').textContent = '+' + totalInc;
    document.getElementById('cal-exp').textContent = '-' + totalExp;
    document.getElementById('cal-bal').textContent = totalInc - totalExp;

    let html = '';
    for (let i = 0; i < firstDay; i++) {
      html += '<div class="cal-day empty"></div>';
    }
    for (let d = 1; d <= daysInMonth; d++) {
      const dateStr = `${calYear}-${String(calMonth + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
      const isToday = dateStr === today;
      const isSelected = dateStr === calSelectedDate;
      const count = dayCheckinMap[dateStr] || 0;

      const net = dayNetMap[dateStr] || 0;
      let netHtml = '';
      let dayClass = '';

      if (net > 0) {
        netHtml = `<div class="cal-net text-income">+${net}</div>`;
        dayClass = ' bg-income';
      } else if (net < 0) {
        netHtml = `<div class="cal-net text-expense">${net}</div>`;
        dayClass = ' bg-expense';
      } else if (count > 0) {
        netHtml = `<div class="cal-net" style="color:var(--text-dim)">+0</div>`;
        dayClass = ' bg-neutral';
      } else {
        netHtml = `<div class="cal-net" style="height:14px"></div>`; // 占位
      }

      const dots = count > 0 // 仍然保留红点逻辑，或者可以简化
        ? `<div class="cal-dots" style="margin-top:2px">${'<span class="cal-dot"></span>'.repeat(Math.min(count, 3))}</div>`
        : '';

      html += `<div class="cal-day${isToday ? ' today' : ''}${isSelected ? ' selected' : ''}${dayClass} has-net" data-date="${dateStr}">
        <span>${d}</span>
        ${netHtml}
      </div>`;
    }
    grid.innerHTML = html;

    grid.querySelectorAll('.cal-day:not(.empty)').forEach(el => {
      el.addEventListener('click', () => {
        calSelectedDate = el.dataset.date;
        renderCalendar();
        // renderCalendarDetail(el.dataset.date); // 重新renderCalendar会刷新整个grid，这里不需要重复绑定，但逻辑上是点选后刷新试图
        renderCalendarDetail(el.dataset.date);
      });
    });

    if (calSelectedDate) {
      renderCalendarDetail(calSelectedDate);
    } else {
      document.getElementById('cal-detail').innerHTML =
        '<p class="empty-state" style="padding:16px;">点击日期查看账单明细</p>';
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
    // 2. 积分变动
    const dayLogs = data.pointLogs.filter(l => l.time.startsWith(dateStr));
    let logHtml = '';
    if (dayLogs.length > 0) {
      logHtml = '<h4 style="margin:16px 0 8px;font-size:0.9rem;color:var(--text-dim);border-top:1px dashed var(--glass-border);padding-top:12px;">积分账单</h4>' +
        dayLogs.map(l => {
          const isPos = l.amount > 0;
          return `<div class="cal-record">
            <span>${l.reason}</span>
            <span style="font-weight:bold;color:${isPos ? '#4aa3df' : '#ff6b6b'}">
              ${isPos ? '+' : ''}${l.amount} 积分
            </span>
          </div>`;
        }).join('');
    }

    detail.innerHTML = `<h3>${dateStr}</h3>${items}${logHtml}`;
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

  /* ===== 愿望商城逻辑 ===== */

  function addPoints(amount, reason = '获得积分') {
    data.points += amount;
    data.pointLogs.unshift({
      id: 'log_' + Date.now(),
      amount,
      reason,
      time: new Date().toISOString()
    });
    save(data);
    // 这里可以加一个全局提示
    console.log(`[${reason}] ${amount > 0 ? '+' : ''}${amount} 积分，当前: ${data.points}`);
  }

  function renderPointsHistory() {
    const list = document.getElementById('points-history-list');
    if (data.pointLogs.length === 0) {
      list.innerHTML = '<div class="empty-state">还没有积分记录，快去完成目标吧！</div>';
      return;
    }
    list.innerHTML = data.pointLogs.map(log => {
      const isPositive = log.amount > 0;
      const sign = isPositive ? '+' : '';
      const timeStr = log.time.slice(0, 10) + ' ' + log.time.slice(11, 16);
      return `
        <div class="history-item" style="align-items:center;">
          <div>
            <div style="font-weight:500;">${log.reason}</div>
            <div style="font-size:0.8rem;color:var(--text-dim);">${timeStr}</div>
          </div>
          <div style="font-weight:700;color:${isPositive ? 'var(--success)' : 'var(--text-dim)'};">
            ${sign}${log.amount} 积分
          </div>
        </div>
      `;
    }).join('');
  }

  // 绑定积分历史弹窗
  const modalHistory = document.getElementById('modal-points-history');
  document.getElementById('shop-points-display').addEventListener('click', () => {
    renderPointsHistory();
    modalHistory.style.display = 'flex';
  });
  document.getElementById('btn-close-history').addEventListener('click', () => {
    modalHistory.style.display = 'none';
  });

  function renderShop() {
    document.getElementById('shop-points-display').textContent = data.points;

    // 渲染货架（过滤已下架）
    const grid = document.getElementById('shop-grid');
    const activeItems = data.shopItems.filter(i => !i.deleted);
    const archivedItems = data.shopItems.filter(i => i.deleted);

    if (activeItems.length === 0) {
      grid.innerHTML = '<div class="empty-state">暂无商品，快去上架愿望吧！</div>';
    } else {
      grid.innerHTML = activeItems.map(item => `
        <div class="shop-item">
          <div class="shop-item-icon">${item.icon}</div>
          <div class="shop-item-name">${item.name}</div>
          <button class="btn btn-sm btn-primary btn-block btn-buy" data-id="${item.id}" ${data.points < item.cost ? 'disabled' : ''}>
            ${item.cost} 💎 兑换
          </button>
          <button class="btn btn-sm btn-block btn-delist" data-id="${item.id}" style="margin-top:6px;opacity:0.6;font-size:0.75rem;">
            下架
          </button>
        </div>
      `).join('');
    }

    grid.querySelectorAll('.btn-buy').forEach(btn => {
      btn.addEventListener('click', () => buyItem(btn.dataset.id));
    });
    grid.querySelectorAll('.btn-delist').forEach(btn => {
      btn.addEventListener('click', () => delistItem(btn.dataset.id));
    });

    // 已下架区——使用固定容器避免重复插入
    let delistContainer = document.getElementById('shop-delist-container');
    if (!delistContainer) {
      delistContainer = document.createElement('div');
      delistContainer.id = 'shop-delist-container';
      grid.insertAdjacentElement('afterend', delistContainer);
    }
    if (archivedItems.length > 0) {
      delistContainer.innerHTML = `<details class="delist-archive" style="margin-top:16px;">
        <summary>📦 已下架愿望 (${archivedItems.length})</summary>
        <div style="display:flex;flex-wrap:wrap;gap:12px;margin-top:12px;">
          ${archivedItems.map(item => `
            <div class="shop-item shop-item-archived">
              <div class="shop-item-icon" style="opacity:0.5;">${item.icon}</div>
              <div class="shop-item-name" style="opacity:0.5;">${item.name}</div>
              <button class="btn btn-sm btn-block btn-relist" data-id="${item.id}" style="font-size:0.75rem;margin-top:6px;">
                重新上架
              </button>
            </div>
          `).join('')}
        </div>
      </details>`;
    } else {
      delistContainer.innerHTML = '';
    }

    delistContainer.querySelectorAll('.btn-relist').forEach(btn => {
      btn.addEventListener('click', () => relistItem(btn.dataset.id));
    });

    // 渲染已购
    const invList = document.getElementById('inventory-list');
    if (data.purchasedItems.length === 0) {
      invList.innerHTML = '<p class="empty-state">暂无已购商品</p>';
    } else {
      invList.innerHTML = data.purchasedItems.map(p => `
        <div class="reward-item">
          <div class="reward-check" style="background:var(--primary);border-color:var(--primary);color:#fff">✓</div>
          <div class="reward-info">
            <span class="reward-name">${p.name}</span>
            <span class="reward-goal">购买于 ${p.purchasedAt.slice(0, 10)}</span>
          </div>
        </div>
      `).join('');
    }
  }

  function delistItem(itemId) {
    const item = data.shopItems.find(i => i.id === itemId);
    if (!item) return;
    if (!confirm(`下架「${item.name}」？下架后不影响已购买记录，可随时重新上架。`)) return;
    item.deleted = true;
    item.deletedAt = new Date().toISOString();
    save(data);
    renderShop();
  }

  function relistItem(itemId) {
    const item = data.shopItems.find(i => i.id === itemId);
    if (!item) return;
    item.deleted = false;
    item.deletedAt = null;
    save(data);
    renderShop();
  }

  function buyItem(itemId) {
    const item = data.shopItems.find(i => i.id === itemId);
    if (!item) return;
    if (data.points < item.cost) {
      alert('积分不足！');
      return;
    }
    if (!confirm(`确定花费 ${item.cost} 积分兑换「${item.name}」吗？`)) return;

    addPoints(-item.cost, `兑换「${item.name}」`);
    data.purchasedItems.unshift({
      id: 'p_' + Date.now(),
      originalId: item.id,
      name: item.name,
      purchasedAt: new Date().toISOString()
    });
    save(data);
    renderShop();
    alert('兑换成功！');
  }

  // 上架新愿望
  const modalCreate = document.getElementById('modal-create-item');
  document.getElementById('btn-create-item').addEventListener('click', () => {
    document.getElementById('create-item-form').reset();
    modalCreate.style.display = 'flex';
  });
  document.getElementById('btn-cancel-create').addEventListener('click', () => {
    modalCreate.style.display = 'none';
  });
  document.getElementById('create-item-form').addEventListener('submit', (e) => {
    e.preventDefault();
    const name = document.getElementById('item-name').value.trim();
    const cost = parseInt(document.getElementById('item-cost').value, 10);
    const icon = document.getElementById('item-icon').value.trim() || '🎁';

    if (!name || !cost) return;

    data.shopItems.push({
      id: 'item_' + Date.now(),
      name, cost, icon
    });
    save(data);
    modalCreate.style.display = 'none';
    renderShop();
  });

  /* ===== 初始化 ===== */
  navigate('dashboard');
})();
