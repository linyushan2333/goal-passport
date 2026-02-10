/* cards.js - 城市卡牌系统 */
const CITY_CARDS = [
  { id:'tokyo',     name:'东京',       country:'日本',   rarity:'common',    color:'#E84057', icon:'⛩️' },
  { id:'paris',     name:'巴黎',       country:'法国',   rarity:'rare',      color:'#2D5F9A', icon:'🗼' },
  { id:'newyork',   name:'纽约',       country:'美国',   rarity:'rare',      color:'#F5A623', icon:'🗽' },
  { id:'london',    name:'伦敦',       country:'英国',   rarity:'common',    color:'#8B4513', icon:'🎡' },
  { id:'sydney',    name:'悉尼',       country:'澳大利亚',rarity:'common',   color:'#00A8E8', icon:'🏖️' },
  { id:'dubai',     name:'迪拜',       country:'阿联酋', rarity:'rare',      color:'#C9A84C', icon:'🏗️' },
  { id:'rome',      name:'罗马',       country:'意大利', rarity:'common',    color:'#D4763A', icon:'🏛️' },
  { id:'seoul',     name:'首尔',       country:'韩国',   rarity:'common',    color:'#5B8C5A', icon:'🏯' },
  { id:'cairo',     name:'开罗',       country:'埃及',   rarity:'legendary', color:'#DAA520', icon:'🏜️' },
  { id:'rio',       name:'里约',       country:'巴西',   rarity:'rare',      color:'#2ECC71', icon:'🎭' },
  { id:'beijing',   name:'北京',       country:'中国',   rarity:'common',    color:'#CC2936', icon:'🏮' },
  { id:'istanbul',  name:'伊斯坦布尔', country:'土耳其', rarity:'rare',      color:'#6A4C93', icon:'🕌' },
  { id:'reykjavik', name:'雷克雅未克', country:'冰岛',   rarity:'legendary', color:'#A8DADC', icon:'🌋' },
  { id:'bangkok',   name:'曼谷',       country:'泰国',   rarity:'common',    color:'#FF6B6B', icon:'🛕' },
  { id:'mexico',    name:'墨西哥城',   country:'墨西哥', rarity:'common',    color:'#E07A5F', icon:'🌮' },
];

const RARITY_LABEL = { common:'普通', rare:'稀有', legendary:'传说' };
const RARITY_CLASS = { common:'rarity-common', rare:'rarity-rare', legendary:'rarity-legendary' };
const RARITY_WEIGHTS = { common:60, rare:30, legendary:10 };

const Cards = {
  /* 生成 SVG 占位图 */
  generateSVG(card, w = 140, h = 187) {
    const bg = card.color;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" class="card-svg">
      <defs>
        <linearGradient id="bg_${card.id}" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="${bg}"/>
          <stop offset="100%" stop-color="${Cards._darken(bg,30)}"/>
        </linearGradient>
      </defs>
      <rect width="${w}" height="${h}" rx="8" fill="url(#bg_${card.id})"/>
      <text x="${w/2}" y="${h*0.42}" text-anchor="middle" font-size="40">${card.icon}</text>
      <text x="${w/2}" y="${h*0.65}" text-anchor="middle"
        font-size="14" font-weight="700" fill="#fff" font-family="Noto Sans SC,sans-serif">${card.name}</text>
      <text x="${w/2}" y="${h*0.78}" text-anchor="middle"
        font-size="10" fill="rgba(255,255,255,0.7)" font-family="Noto Sans SC,sans-serif">${card.country}</text>
    </svg>`;
  },

  _darken(hex, amt) {
    let c = hex.replace('#','');
    if(c.length===3) c = c.split('').map(x=>x+x).join('');
    let r = Math.max(0, parseInt(c.substring(0,2),16) - amt);
    let g = Math.max(0, parseInt(c.substring(2,4),16) - amt);
    let b = Math.max(0, parseInt(c.substring(4,6),16) - amt);
    return `rgb(${r},${g},${b})`;
  },
  /* 随机抽卡 */
  drawCard() {
    const roll = Math.random() * 100;
    let rarity;
    if (roll < RARITY_WEIGHTS.legendary) rarity = 'legendary';
    else if (roll < RARITY_WEIGHTS.legendary + RARITY_WEIGHTS.rare) rarity = 'rare';
    else rarity = 'common';
    const pool = CITY_CARDS.filter(c => c.rarity === rarity);
    return pool[Math.floor(Math.random() * pool.length)];
  },

  /* 渲染卡牌图鉴 */
  renderCollection(ownedCards, container) {
    container.innerHTML = '';
    CITY_CARDS.forEach(card => {
      const owned = ownedCards.filter(c => c.cityId === card.id);
      const count = owned.length;
      const div = document.createElement('div');
      div.className = 'card-item' + (count > 0 ? ' owned' : ' locked');
      div.innerHTML = Cards.generateSVG(card)
        + `<span class="card-rarity ${RARITY_CLASS[card.rarity]}">${RARITY_LABEL[card.rarity]}</span>`
        + `<span class="card-label">${card.name}</span>`
        + (count > 0 ? `<span class="card-count">×${count}</span>` : '');
      container.appendChild(div);
    });
  },

  /* 揭晓动画 */
  showReveal(card, goalName, reward, onClose, onFlip) {
    const modal = document.getElementById('modal-card-reveal');
    const flipContainer = document.getElementById('card-flip-container');
    const cardFront = document.getElementById('card-front');
    const hint = document.getElementById('reveal-hint');
    const rewardEl = document.getElementById('reward-reminder');
    const closeBtn = document.getElementById('btn-close-reveal');
    const goalNameEl = document.getElementById('reveal-goal-name');

    goalNameEl.textContent = `「${goalName}」已完成！`;
    cardFront.innerHTML = Cards.generateSVG(card, 180, 240);
    const flip = flipContainer.querySelector('.card-flip');
    flip.classList.remove('flipped');
    // 清除旧光效
    flipContainer.className = 'card-flip-container';
    hint.style.display = '';
    rewardEl.style.display = 'none';
    closeBtn.style.display = 'none';
    modal.style.display = 'flex';

    const doFlip = () => {
      flip.classList.add('flipped');
      hint.style.display = 'none';
      // 添加稀有度光效
      const glowClass = 'glow-' + card.rarity;
      flipContainer.classList.add(glowClass);
      if (onFlip) onFlip();
      setTimeout(() => {
        if (reward) {
          rewardEl.textContent = '🎁 奖励自己：' + reward;
          rewardEl.style.display = '';
        }
        closeBtn.style.display = '';
      }, 600);
    };
    flipContainer.onclick = doFlip;
    closeBtn.onclick = () => {
      modal.style.display = 'none';
      flipContainer.onclick = null;
      flipContainer.className = 'card-flip-container';
      if (onClose) onClose();
    };
  }
};
