// ─────────────────────────────────────────────
//  Desktop Defender — game.js
// ─────────────────────────────────────────────

const canvas  = document.getElementById('gameCanvas');
const ctx     = canvas.getContext('2d');
const pCanvas = document.getElementById('pathPreviewCanvas');
const pCtx    = pCanvas.getContext('2d');

const TILE_SIZE = 40;
const COLS = Math.floor(canvas.width  / TILE_SIZE);   // 20
const ROWS = Math.floor(canvas.height / TILE_SIZE);   // 12

// ── Audio Setup (BGM & Synthesizer SFX) ────────
const bgMusic = new Audio('bgm.mp3');
bgMusic.loop = true;
bgMusic.volume = 0.3;
let isMusicPlaying = false;
let audioCtx = null;

function playSFX(type) {
  if (!isMusicPlaying) return; 
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  
  if (type === 'shoot') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(400, now);
    osc.frequency.exponentialRampToValueAtTime(100, now + 0.1);
    gain.gain.setValueAtTime(0.02, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.1);
    osc.start(now); osc.stop(now + 0.1);
  } else if (type === 'sniper') {
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(150, now);
    osc.frequency.exponentialRampToValueAtTime(40, now + 0.3);
    gain.gain.setValueAtTime(0.05, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.3);
    osc.start(now); osc.stop(now + 0.3);
  } else if (type === 'explosion') {
    osc.type = 'square';
    osc.frequency.setValueAtTime(100, now);
    osc.frequency.exponentialRampToValueAtTime(20, now + 0.4);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.4);
    osc.start(now); osc.stop(now + 0.4);
  } else if (type === 'hit') {
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(300, now);
    osc.frequency.exponentialRampToValueAtTime(500, now + 0.05);
    gain.gain.setValueAtTime(0.01, now);
    gain.gain.linearRampToValueAtTime(0, now + 0.05);
    osc.start(now); osc.stop(now + 0.05);
  }
}

// ── Particles System ──────
let particles = [];
class Particle {
  constructor(x, y, color, speedScale = 1) {
    this.x = x; this.y = y; this.color = color;
    const angle = Math.random() * Math.PI * 2;
    const speed = (Math.random() * 2 + 1) * speedScale;
    this.vx = Math.cos(angle) * speed;
    this.vy = Math.sin(angle) * speed;
    this.life = 1.0;
    this.decay = Math.random() * 0.05 + 0.02;
  }
  update() { this.x += this.vx; this.y += this.vy; this.life -= this.decay; }
  draw() {
    ctx.globalAlpha = Math.max(0, this.life);
    ctx.fillStyle = this.color;
    ctx.fillRect(this.x, this.y, 3, 3);
    ctx.globalAlpha = 1.0;
  }
}
function spawnParticles(x, y, color, count, speedScale = 1) {
  for(let i=0; i<count; i++) particles.push(new Particle(x, y, color, speedScale));
}

// ── Tower & Enemy definitions ──────────────────

const TOWER_TYPES = {
  PISTOL:  { color: '#4CAF50', range: 150, reload: 40,  damage: 2,    cost: 50,  bullet: 'orange' },
  SNIPER:  { color: '#2196F3', range: 350, reload: 100, damage: 15,   cost: 150, bullet: 'white'  },
  MINIGUN: { color: '#FF9800', range: 120, reload: 6,   damage: 2,    cost: 300, bullet: 'yellow' },
  FLAME:   { color: '#FF5722', range: 100, reload: 15,  damage: 1,    cost: 175, bullet: 'red',     isFlame: true },
  ICE:     { color: '#29b6f6', range: 130, reload: 50,  damage: 0.5,  cost: 125, bullet: '#b3e5fc', isIce:   true },
  BOMB:    { color: '#555555', range: 140, reload: 90,  damage: 10,   cost: 200, bullet: 'black',   splashRadius: 70 },
  ACCEL:   { color: '#E040FB', range: 180, reload: 120, damage: 12,   cost: 500, bullet: 'none',    isAccel: true, duration: 300 },
  BUFF:    { color: '#FFD700', range: 120, reload: 0,   damage: 0,    cost: 150, isBuff: true },
  RAILGUN: { color: '#E91E63', range: 800, reload: 180, damage: 50,   cost: 800, bullet: '#00FFFF', isRail: true }
};

const ENEMY_TYPES = {
  NORMAL:  { color: '#9C27B0', speed: 1.2, hp: 10,  armor: 0, reward: 15  },
  RUNNER:  { color: '#FFEB3B', speed: 2.8, hp: 6,   armor: 0, reward: 10  },
  TANK:    { color: '#8B4513', speed: 0.6, hp: 30,  armor: 3, reward: 40  },
  FLYER:   { color: '#E0E0E0', speed: 1.5, hp: 8,   armor: 0, reward: 20, isFlying: true },
  GHOST:   { color: '#9E9E9E', speed: 1.1, hp: 10,  armor: 0, reward: 25, isCamo: true },
  HEALER:  { color: '#4CAF50', speed: 1.0, hp: 15,  armor: 1, reward: 30, isHealer: true },
  CARRIER: { color: '#607D8B', speed: 0.5, hp: 40,  armor: 2, reward: 50, spawns: 'RUNNER', spawnCount: 3 },
  BOSS:    { color: '#111111', speed: 0.4, hp: 300, armor: 8, reward: 200 }
};

const WAVE_COLORS = {
  NORMAL: '#9C27B0', RUNNER: '#FFEB3B', TANK: '#8B4513', 
  FLYER: '#E0E0E0', GHOST: '#9E9E9E', HEALER: '#4CAF50', CARRIER: '#607D8B', BOSS: '#FF0000'
};

// ── Game state ─────────────────────────────────

let gold = 200, lives = 20, waveNumber = 0, buildType = null;
let selectedTower = null, selectedEnemy = null;
let enemiesLeftToSpawn = 0, spawnTimer = 0, waveCooldown = 0;
let isPaused = false, isWaveActive = false, gameSpeed = 1;
let hoverGx = -1, hoverGy = -1;
let frameCount = 0;

// Research State
let research = {
  bounty: 0,
  piercing: 0,
  interest: 0.01
};

const startPos = { x: 0,        y: Math.floor(ROWS / 2) };
const endPos   = { x: COLS - 1, y: Math.floor(ROWS / 2) };

let grid        = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let enemies     = [];
let towers      = [];
let projectiles = [];

// ── Pathfinding ────

function findPath(startX = startPos.x, startY = startPos.y) {
  const queue   = [[startX, startY, []]];
  const visited = new Set([`${startX},${startY}`]);

  while (queue.length > 0) {
    const randomIndex = Math.floor(Math.random() * queue.length);
    const [x, y, path] = queue.splice(randomIndex, 1)[0];
    
    const cur = [...path, { x, y }];
    if (x === endPos.x && y === endPos.y) return cur;

    const neighbors = [
      { x: x + 1, y }, { x: x - 1, y }, 
      { x, y: y + 1 }, { x, y: y - 1 }
    ].sort(() => Math.random() - 0.5);

    for (const n of neighbors) {
      const k = `${n.x},${n.y}`;
      if (
        n.x >= 0 && n.x < COLS &&
        n.y >= 0 && n.y < ROWS &&
        grid[n.y][n.x] === 0 &&
        !visited.has(k)
      ) {
        visited.add(k);
        queue.push([n.x, n.y, cur]);
      }
    }
  }
  return null;
}

function recalculateAllPaths() {
  enemies.forEach(e => {
    if (e.isFlying) return;
    const gx = Math.floor(e.x / TILE_SIZE);
    const gy = Math.floor(e.y / TILE_SIZE);
    const p  = findPath(gx, gy);
    if (p) { e.path = p; e.pathIndex = 0; }
  });
}

// ── Wave composition helper ────────────────────

function getWaveComposition(wNum) {
  if (wNum % 10 === 0 && wNum > 0) return { BOSS: 1 };
  const total = 5 + wNum;
  const comp = { NORMAL: 0, RUNNER: 0, TANK: 0, FLYER: 0, GHOST: 0, HEALER: 0, CARRIER: 0 };
  for(let i=0; i<total; i++) {
    const r = Math.random();
    if (wNum > 12 && r > 0.90) comp.CARRIER++;
    else if (wNum > 9 && r > 0.80) comp.HEALER++;
    else if (wNum > 7 && r > 0.65) comp.GHOST++;
    else if (wNum > 4 && r > 0.50) comp.FLYER++;
    else if (wNum > 3 && r > 0.40) comp.TANK++;
    else if (wNum > 1 && r > 0.30) comp.RUNNER++;
    else comp.NORMAL++;
  }
  return comp;
}

function updateWavePreview() {
  const nextWave = waveNumber + 1;
  const comp = getWaveComposition(nextWave);
  let html = '';
  for (const [type, count] of Object.entries(comp)) {
    if (count > 0) {
      const col = WAVE_COLORS[type];
      html += `<span class="wave-pill" style="background:${col}22;border:1px solid ${col};color:${col};">${count} ${type}</span>`;
    }
  }
  document.getElementById('waveComposition').innerHTML = html;
}

// ── Selection UI ───────────────────────────────

function updateSelectionUI() {
  const side = document.getElementById('statsContent');

  if (!selectedTower && !selectedEnemy) {
    document.getElementById('upgradeMenu').style.display = 'none';
    side.innerHTML = '<p style="color:#aaa;text-align:center;margin-top:30px;font-size:11px;">Select a tower or enemy to view stats.</p>';
    return;
  }

  // Enemy stats
  if (selectedEnemy) {
    document.getElementById('upgradeMenu').style.display = 'none';
    let h = `
      <h3 style="margin-top:0;border-bottom:2px solid ${selectedEnemy.color};padding-bottom:5px;font-size:13px;">${selectedEnemy.type}</h3>
      <div class="stat-row"><span>HP:</span><span style="color:#ff4444;">${Math.max(0, Math.ceil(selectedEnemy.health))} / ${selectedEnemy.maxHealth}</span></div>
      <div class="stat-row"><span>Armor:</span><span style="color:#aaa;">${selectedEnemy.armor.toFixed(1)}</span></div>
    `;
    if (selectedEnemy.meltTicks > 0) h += `<div class="stat-row"><span>Status:</span><span style="color:#FF5722;">Melting!</span></div>`;
    if (selectedEnemy.slowTicks  > 0) h += `<div class="stat-row"><span>Status:</span><span style="color:#29b6f6;">Slowed!</span></div>`;
    h += `
      <div class="stat-row"><span>Speed:</span><span>${selectedEnemy.speed.toFixed(2)}</span></div>
      <div class="stat-row"><span>Bounty:</span><span style="color:#ffd700;">$${selectedEnemy.reward}</span></div>
    `;
    side.innerHTML = h;
    return;
  }

  // Tower stats
  document.getElementById('upgradeMenu').style.display = 'flex';
  document.getElementById('targetBtn').innerText = selectedTower.targetMode;

  const isBuff  = !!TOWER_TYPES[selectedTower.type].isBuff;
  const isFlame = !!TOWER_TYPES[selectedTower.type].isFlame;
  const isIce   = !!TOWER_TYPES[selectedTower.type].isIce;
  const isAccel = !!TOWER_TYPES[selectedTower.type].isAccel;
  const isRail  = !!TOWER_TYPES[selectedTower.type].isRail;

  document.getElementById('targetBtn').style.display           = isBuff  ? 'none'  : 'block';
  document.getElementById('buffSpecialization').style.display  = isBuff  ? 'flex'  : 'none';
  document.getElementById('flameUpgrades').style.display       = isFlame ? 'flex'  : 'none';
  document.getElementById('iceUpgrades').style.display         = isIce   ? 'flex'  : 'none';
  document.getElementById('accelUpgrades').style.display       = isAccel ? 'flex'  : 'none';
  document.getElementById('standardUpgrades').style.display    = 'flex';

  // Radar Button Management
  const btnRadar = document.getElementById('btnUpgradeRadar');
  if (isBuff) {
    btnRadar.style.display = 'none';
  } else {
    btnRadar.style.display = 'inline-block';
    if (selectedTower.type === 'SNIPER') {
      btnRadar.innerText = 'Radar (Native)';
      btnRadar.style.opacity = '0.5';
    } else if (selectedTower.upgrades.radar > 0) {
      btnRadar.innerText = 'Radar (MAX)';
      btnRadar.style.opacity = '0.5';
    } else {
      btnRadar.innerText = 'Radar $150';
      btnRadar.style.opacity = '1';
    }
  }

  if (isBuff) {
    document.getElementById('btnUpgradeSpeed').innerText  = `Spd Pot $${selectedTower.upgrades.speed  * 30}`;
    document.getElementById('btnUpgradeDamage').innerText = `Pwr Pot $${selectedTower.upgrades.damage * 40}`;
    document.getElementById('btnUpgradeRange').innerText  = `Aura    $${selectedTower.upgrades.range  * 25}`;
  } else if (isAccel) {
    document.getElementById('btnUpgradeSpeed').innerText    = `Recharge $${selectedTower.upgrades.speed  * 50}`;
    document.getElementById('btnUpgradeDamage').innerText   = `Power $${selectedTower.upgrades.damage * 60}`;
    document.getElementById('btnUpgradeRange').innerText    = `Range $${selectedTower.upgrades.range  * 40}`;
    document.getElementById('btnUpgradeDuration').innerText = `Duration $${selectedTower.upgrades.duration * 50}`;
  } else {
    document.getElementById('btnUpgradeSpeed').innerText  = `Speed $${selectedTower.upgrades.speed  * 30}`;
    document.getElementById('btnUpgradeDamage').innerText = `Power $${selectedTower.upgrades.damage * 40}`;
    document.getElementById('btnUpgradeRange').innerText  = `Range $${selectedTower.upgrades.range  * 25}`;
  }
  
  if (isFlame) document.getElementById('btnUpgradeMelt').innerText = `Def Melt $${(selectedTower.meltLevel + 1) * 50}`;
  if (isIce)   document.getElementById('btnUpgradeSlow').innerText = `Slow Pwr $${(selectedTower.slowLevel  + 1) * 40}`;

  const upgradeSpend =
    (selectedTower.upgrades.speed  - 1) * (isAccel ? 50 : 30) +
    (selectedTower.upgrades.damage - 1) * (isAccel ? 60 : 40) +
    (selectedTower.upgrades.range  - 1) * (isAccel ? 40 : 25) +
    (selectedTower.upgrades.duration - 1) * 50 +
    (selectedTower.upgrades.radar * 150) +
    (selectedTower.meltLevel * 50) +
    (selectedTower.slowLevel * 40);
  const sellVal = Math.floor(TOWER_TYPES[selectedTower.type].cost / 2 + upgradeSpend / 2);

  const hasRadar = selectedTower.type === 'SNIPER' || selectedTower.upgrades.radar > 0;
  const radarStr = hasRadar ? `<span style="color:#00E676;">Active</span>` : `<span style="color:#aaa;">None</span>`;

  let h = `
    <h3 style="margin-top:0;border-bottom:2px solid ${selectedTower.color};padding-bottom:5px;font-size:13px;">${selectedTower.type} TOWER</h3>
    <div class="stat-row"><span>Level:</span><span style="color:white;">${selectedTower.level}</span></div>
    <div class="stat-row"><span>Sell:</span><span style="color:#ffd700;">$${sellVal}</span></div><br>
  `;

  if (isBuff) {
    h += `
      <div class="stat-row"><span>Aura Radius:</span><span>${selectedTower.range}</span></div>
      <div class="stat-row"><span>Buff:</span><span style="color:#FFD700;">${selectedTower.buffSpec}</span></div>
    `;
  } else if (isAccel) {
    const dmgCol = selectedTower.damage      > selectedTower.baseDamage  ? '#FFD700' : 'white';
    const rngCol = selectedTower.range       > selectedTower.baseRange   ? '#FFD700' : 'white';
    const spdCol = selectedTower.reloadTime  < selectedTower.baseReload  ? '#FFD700' : 'white';
    const durCol = selectedTower.duration    > selectedTower.baseDuration ? '#FFD700': 'white';
    h += `
      <div class="stat-row"><span>Damage:</span><span style="color:${dmgCol};">${selectedTower.damage.toFixed(1)}/tick</span></div>
      <div class="stat-row"><span>Range:</span><span style="color:${rngCol};">${selectedTower.range}</span></div>
      <div class="stat-row"><span>Downtime:</span><span style="color:${spdCol};">${(selectedTower.reloadTime / 60).toFixed(1)}s</span></div>
      <div class="stat-row"><span>Beam Time:</span><span style="color:${durCol};">${(selectedTower.duration / 60).toFixed(1)}s</span></div>
      <div class="stat-row"><span>Sensors:</span>${radarStr}</div>
      <div class="stat-row"><span>Total Dmg:</span><span style="color:#FFD700;">${Math.floor(selectedTower.damageDealt)}</span></div>
    `;
  } else {
    if (isRail && !selectedTower.hasSpotter) {
        h += `<div style="color:#ff4444; font-weight:bold; text-align:center;">OFFLINE: NEEDS SPOTTER</div>`;
    }
    const aps    = (60 / selectedTower.reloadTime).toFixed(1);
    const dmgCol = selectedTower.damage      > selectedTower.baseDamage  ? '#FFD700' : 'white';
    const rngCol = selectedTower.range       > selectedTower.baseRange   ? '#FFD700' : 'white';
    const spdCol = selectedTower.reloadTime  < selectedTower.baseReload  ? '#FFD700' : 'white';
    h += `
      <div class="stat-row"><span>Damage:</span><span style="color:${dmgCol};">${selectedTower.damage.toFixed(1)}</span></div>
      <div class="stat-row"><span>Range:</span><span style="color:${rngCol};">${selectedTower.range}</span></div>
      <div class="stat-row"><span>Fire Rate:</span><span style="color:${spdCol};">${aps}/s</span></div>
      <div class="stat-row"><span>Sensors:</span>${radarStr}</div>
      <div class="stat-row"><span>Total Dmg:</span><span style="color:#FFD700;">${Math.floor(selectedTower.damageDealt)}</span></div>
    `;
    if (isFlame) h += `<div class="stat-row"><span>Melt Lvl:</span><span style="color:#FF5722;">${selectedTower.meltLevel}</span></div>`;
    if (isIce)   h += `<div class="stat-row"><span>Slow Lvl:</span><span style="color:#29b6f6;">${selectedTower.slowLevel}</span></div>`;
  }

  side.innerHTML = h;
}

// ── Classes ────────────────────────────────────

class Enemy {
  constructor(path, typeKey) {
    const s = ENEMY_TYPES[typeKey];
    this.path      = path;
    this.pathIndex = 0;
    this.type      = typeKey;
    this.x         = startPos.x * TILE_SIZE + TILE_SIZE / 2;
    this.y         = startPos.y * TILE_SIZE + TILE_SIZE / 2;
    this.baseSpeed = s.speed;
    this.speed     = s.speed;
    this.color     = s.color;
    this.reward    = s.reward;
    this.maxHealth = Math.floor(s.hp * Math.pow(1.15, waveNumber));
    this.health    = this.maxHealth;
    this.armor     = s.armor + Math.floor(waveNumber / 5);
    this.meltTicks = 0;
    this.slowTicks = 0;
    this.slowFactor = 1;
    this.alive     = true;
    
    this.isFlying  = !!s.isFlying;
    this.isCamo    = !!s.isCamo;
    this.isHealer  = !!s.isHealer;
    this.spawns    = s.spawns || null;
    this.spawnCount= s.spawnCount || 0;
  }

  update() {
    if (!this.alive) return;

    this.speed = this.slowTicks > 0 ? this.baseSpeed * this.slowFactor : this.baseSpeed;
    if (this.slowTicks > 0) this.slowTicks--;
    if (this.meltTicks > 0) this.meltTicks--;

    if (this.isHealer && frameCount % 60 === 0) {
      spawnParticles(this.x, this.y, '#4CAF50', 5);
      enemies.forEach(e => {
        if (e !== this && Math.hypot(e.x - this.x, e.y - this.y) <= 80) {
          e.health = Math.min(e.maxHealth, e.health + 5);
        }
      });
    }

    if (this.isFlying) {
      const ex = endPos.x * TILE_SIZE + TILE_SIZE / 2;
      const ey = endPos.y * TILE_SIZE + TILE_SIZE / 2;
      const dist = Math.hypot(ex - this.x, ey - this.y);
      if (dist < this.speed) {
        this.alive = false; lives--; return;
      }
      this.x += ((ex - this.x) / dist) * this.speed;
      this.y += ((ey - this.y) / dist) * this.speed;
    } else {
      if (!this.path || this.pathIndex >= this.path.length) {
        this.alive = false;
        if (this.pathIndex >= this.path.length) lives--;
        return;
      }
      const target = this.path[this.pathIndex];
      const tx = target.x * TILE_SIZE + TILE_SIZE / 2;
      const ty = target.y * TILE_SIZE + TILE_SIZE / 2;
      const dist = Math.hypot(tx - this.x, ty - this.y);

      if (dist < this.speed) {
        this.pathIndex++;
      } else {
        this.x += ((tx - this.x) / dist) * this.speed;
        this.y += ((ty - this.y) / dist) * this.speed;
      }
    }

    if (this.health <= 0) { 
      this.alive = false; 
      gold += this.reward + research.bounty; // Research Bounty Added
      spawnParticles(this.x, this.y, this.color, 15, 1.5); 
      
      if (this.spawns) {
        for(let i=0; i<this.spawnCount; i++) {
          let spawn = new Enemy(this.path, this.spawns);
          spawn.x = this.x + (Math.random()*20 - 10);
          spawn.y = this.y + (Math.random()*20 - 10);
          spawn.pathIndex = this.pathIndex;
          enemies.push(spawn);
        }
      }
    }
  }

  takeDamage(dmg) {
    const effectiveArmor = Math.max(0, this.armor - research.piercing); // Research Piercing Added
    const actualDmg = Math.max(0.5, dmg - effectiveArmor);
    this.health -= actualDmg;
    return actualDmg;
  }

  draw() {
    if (selectedEnemy === this) {
      ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(this.x, this.y, (this.type === 'BOSS' ? 18 : 12) + 4, 0, Math.PI * 2); ctx.stroke();
    }
    
    ctx.globalAlpha = this.isCamo ? 0.4 : 1.0;
    ctx.fillStyle = this.slowTicks > 0 ? '#b3e5fc' : this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.type === 'BOSS' ? 18 : 12, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1.0;

    if (this.meltTicks > 0) {
      ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(this.x, this.y, 14, 0, Math.PI * 2); ctx.stroke();
    }
    if (this.slowTicks > 0) {
      ctx.strokeStyle = '#29b6f6'; ctx.lineWidth = 2; ctx.beginPath();
      ctx.arc(this.x, this.y, this.type === 'BOSS' ? 20 : 14, 0, Math.PI * 2); ctx.stroke();
    }

    ctx.fillStyle = 'red';
    ctx.fillRect(this.x - 15, this.y - 22, 30, 4);
    ctx.fillStyle = 'lime';
    ctx.fillRect(this.x - 15, this.y - 22, (this.health / this.maxHealth) * 30, 4);
  }
}

class Tower {
  constructor(gx, gy, typeKey) {
    this.gx   = gx;
    this.gy   = gy;
    this.x    = gx * TILE_SIZE + TILE_SIZE / 2;
    this.y    = gy * TILE_SIZE + TILE_SIZE / 2;
    this.type = typeKey;

    this.baseRange    = TOWER_TYPES[typeKey].range;
    this.baseReload   = TOWER_TYPES[typeKey].reload;
    this.baseDamage   = TOWER_TYPES[typeKey].damage;
    this.baseDuration = TOWER_TYPES[typeKey].duration || 0; 

    this.range      = this.baseRange;
    this.reloadTime = this.baseReload;
    this.damage     = this.baseDamage;
    this.duration   = this.baseDuration;

    this.color      = TOWER_TYPES[typeKey].color;
    this.level      = 1;
    this.timer      = 0;
    this.targetMode = 'First';
    this.upgrades   = { speed: 1, damage: 1, range: 1, duration: 1, radar: 0 };
    this.buffSpec   = 'SPEED';
    this.meltLevel  = 0;
    this.slowLevel  = 0;
    this.damageDealt= 0; 
    
    this.fireTimer     = 0; 
    this.rechargeTimer = 0;
    this.currentTarget = null;
    
    this.isRail     = !!TOWER_TYPES[typeKey].isRail; // Railgun Property
    this.hasSpotter = false;
  }

  applyBuffs(allTowers) {
    this.range      = this.baseRange;
    this.damage     = this.baseDamage;
    this.reloadTime = this.baseReload;
    this.duration   = this.baseDuration;
    this.hasSpotter = false;

    if (TOWER_TYPES[this.type].isBuff) return;

    let speedMod = 1, dmgMod = 1, rangeMod = 0;

    allTowers.forEach(t => {
      if (TOWER_TYPES[t.type].isBuff && Math.hypot(this.x - t.x, this.y - t.y) <= t.range) {
        this.hasSpotter = true; // Railgun synergy
        if (t.buffSpec === 'SPEED')  speedMod *= Math.max(0.1, 0.7 - (t.upgrades.speed  * 0.1));
        if (t.buffSpec === 'DAMAGE') dmgMod   *= 1.4 + (t.upgrades.damage * 0.4);
        if (t.buffSpec === 'RANGE')  rangeMod += 30   + (t.upgrades.range  * 20);
      }
    });

    this.reloadTime *= speedMod;
    this.damage     *= dmgMod;
    this.range      += rangeMod;
  }

  update() {
    if (TOWER_TYPES[this.type].isBuff) return;
    if (this.isRail && !this.hasSpotter) return; // Railgun requires signal

    // --- ACCELERATOR BEAM LOGIC ---
    if (TOWER_TYPES[this.type].isAccel) {
      if (this.rechargeTimer > 0) {
        this.rechargeTimer--;
        return;
      }

      let inRange = enemies.filter(e => {
        const hasRadar = this.upgrades.radar > 0;
        if (e.isCamo && !hasRadar) return false;
        if (e.isFlying && !hasRadar) return false; 
        return Math.hypot(e.x - this.x, e.y - this.y) <= this.range;
      });

      if (this.fireTimer > 0) {
        if (inRange.length > 0) {
          if      (this.targetMode === 'First')    inRange.sort((a, b) => b.pathIndex - a.pathIndex);
          else if (this.targetMode === 'Last')     inRange.sort((a, b) => a.pathIndex - b.pathIndex);
          else if (this.targetMode === 'Strongest')inRange.sort((a, b) => b.health    - a.health);
          else if (this.targetMode === 'Weakest')  inRange.sort((a, b) => a.health    - b.health);
          
          this.currentTarget = inRange[0]; 
          
          if (this.fireTimer % 15 === 0) {
            const dealt = this.currentTarget.takeDamage(this.damage);
            this.damageDealt += dealt;
            spawnParticles(this.currentTarget.x, this.currentTarget.y, '#E040FB', 8, 2);
            playSFX('hit');
          }
        } else {
          this.currentTarget = null;
        }
        
        this.fireTimer--;
        
        if (this.fireTimer <= 0) {
          this.rechargeTimer = this.reloadTime; 
          this.currentTarget = null;
        }
        return;
      }

      if (inRange.length > 0) {
        this.fireTimer = this.duration; 
        this.currentTarget = inRange[0];
        playSFX('sniper'); 
      }
      return;
    }

    // --- STANDARD & RAILGUN TOWER LOGIC ---
    this.timer++;
    if (this.timer >= this.reloadTime) {
      let inRange = enemies.filter(e => {
        const hasRadar = this.type === 'SNIPER' || this.upgrades.radar > 0;
        if (e.isCamo && !hasRadar) return false;
        if (e.isFlying && !hasRadar) return false;
        return Math.hypot(e.x - this.x, e.y - this.y) <= this.range;
      });

      if (inRange.length > 0) {
        if      (this.targetMode === 'First')    inRange.sort((a, b) => b.pathIndex - a.pathIndex);
        else if (this.targetMode === 'Last')     inRange.sort((a, b) => a.pathIndex - b.pathIndex);
        else if (this.targetMode === 'Strongest')inRange.sort((a, b) => b.health    - a.health);
        else if (this.targetMode === 'Weakest')  inRange.sort((a, b) => a.health    - b.health);

        const target = inRange[0];
        projectiles.push(new Projectile(this.x, this.y, target, this)); 
        
        if(this.type === 'SNIPER' || this.isRail) playSFX('sniper');
        else playSFX('shoot');
        
        this.timer = 0;
      }
    }
  }

  draw() {
    if (selectedTower === this) {
      ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.beginPath();
      ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2); ctx.stroke();
    }
    
    if (this.type === 'ACCEL' && this.fireTimer > 0 && this.currentTarget && this.currentTarget.alive) {
      ctx.strokeStyle = '#E040FB';
      ctx.lineWidth = Math.random() * 4 + 2; 
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.currentTarget.x, this.currentTarget.y);
      ctx.stroke();
      
      ctx.strokeStyle = 'white';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
    
    ctx.fillStyle = (this.isRail && !this.hasSpotter) ? '#444' : this.color;
    ctx.fillRect(this.gx * TILE_SIZE + 2, this.gy * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    
    if (this.isRail && !this.hasSpotter) {
        ctx.fillStyle = 'red'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center';
        ctx.fillText("NO SIGNAL", this.x, this.y - 10);
        ctx.textAlign = 'left';
    }

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
    ctx.fillText(TOWER_TYPES[this.type].isBuff ? this.buffSpec[0] : (this.isRail ? 'R' : this.type[0]), this.x, this.y + 3);
    ctx.textAlign = 'left';
  }
}

class Projectile {
  constructor(x, y, target, tower) {
    this.x         = x;
    this.y         = y;
    this.target    = target;
    this.tower     = tower; 
    
    this.isRail       = tower.isRail; // Railgun Property
    this.damage       = tower.damage;
    this.color        = TOWER_TYPES[tower.type].bullet;
    this.speed        = this.isRail ? 18 : (tower.type === 'BOMB' ? 4 : 8); 
    this.alive        = true;
    this.isFlame      = !!TOWER_TYPES[tower.type].isFlame;
    this.meltLevel    = tower.meltLevel;
    this.isIce        = !!TOWER_TYPES[tower.type].isIce;
    this.slowLevel    = tower.slowLevel;
    this.splashRadius = TOWER_TYPES[tower.type].splashRadius || 0;
    this.hitList      = new Set();
  }

  update() {
    const dx   = this.target.x - this.x;
    const dy   = this.target.y - this.y;
    const dist = Math.hypot(dx, dy);

    if (this.isRail) {
        // Piercing logic
        enemies.forEach(e => {
            if (!this.hitList.has(e) && Math.hypot(e.x - this.x, e.y - this.y) < 25) {
                const dealt = e.takeDamage(this.damage);
                this.tower.damageDealt += dealt;
                this.hitList.add(e);
                spawnParticles(e.x, e.y, this.color, 6);
            }
        });
        if (dist < 10) this.alive = false;
    } else {
        if (dist < 5 || !this.target.alive) {
            if (this.splashRadius > 0) {
              playSFX('explosion');
              spawnParticles(this.x, this.y, '#FF5722', 25, 2.0); 
              
              enemies.forEach(e => {
                if (Math.hypot(e.x - this.x, e.y - this.y) <= this.splashRadius) {
                  const hasRadar = this.tower.type === 'SNIPER' || this.tower.upgrades.radar > 0;
                  if (e.isFlying && !hasRadar) return; 
      
                  const dealt = e.takeDamage(this.damage);
                  this.tower.damageDealt += dealt; 
                }
              });
            } else {
              if (this.target.alive) {
                playSFX('hit');
                spawnParticles(this.target.x, this.target.y, this.color, 4);
                
                if (this.isFlame) {
                  this.target.meltTicks = 180;
                  this.target.armor = Math.max(0, this.target.armor - (0.2 + this.meltLevel * 0.3));
                }
                if (this.isIce) {
                  this.target.slowTicks  = 90 + this.slowLevel * 30;
                  this.target.slowFactor = Math.max(0.2, 0.5 - this.slowLevel * 0.05);
                }
                
                const dealt = this.target.takeDamage(this.damage);
                this.tower.damageDealt += dealt; 
              }
            }
            this.alive = false;
        }
    }
    
    this.x += (dx / dist) * this.speed;
    this.y += (dy / dist) * this.speed;
  }

  draw() {
    ctx.fillStyle = this.color;
    if (this.isRail) {
        ctx.shadowBlur = 10; ctx.shadowColor = this.color;
        ctx.fillRect(this.x - 4, this.y - 4, 8, 8);
        ctx.shadowBlur = 0;
    } else {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.splashRadius ? 6 : (this.isIce ? 5 : 4), 0, Math.PI * 2);
        ctx.fill();
    }
  }
}

// ── Hover / path preview ───────────────────────

function drawHoverPreview() {
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  if (!buildType || hoverGx < 0 || hoverGy < 0) return;
  if (!grid[hoverGy] || grid[hoverGy][hoverGx] !== 0) return;

  const px = hoverGx * TILE_SIZE + TILE_SIZE / 2;
  const py = hoverGy * TILE_SIZE + TILE_SIZE / 2;
  const t  = TOWER_TYPES[buildType];

  pCtx.fillStyle = 'rgba(255,255,255,0.07)';
  pCtx.fillRect(hoverGx * TILE_SIZE, hoverGy * TILE_SIZE, TILE_SIZE, TILE_SIZE);

  pCtx.strokeStyle = t.color + '99';
  pCtx.lineWidth   = 1.5;
  pCtx.setLineDash([4, 4]);
  pCtx.beginPath();
  pCtx.arc(px, py, t.range, 0, Math.PI * 2);
  pCtx.stroke();
  pCtx.setLineDash([]);

  grid[hoverGy][hoverGx] = 1;
  const testPath = findPath();
  grid[hoverGy][hoverGx] = 0;

  if (testPath) {
    pCtx.strokeStyle = 'rgba(100,255,100,0.35)'; pCtx.lineWidth = 2; pCtx.setLineDash([6, 4]);
    pCtx.beginPath();
    testPath.forEach((p, i) => {
      const wx = p.x * TILE_SIZE + TILE_SIZE / 2; const wy = p.y * TILE_SIZE + TILE_SIZE / 2;
      if (i === 0) pCtx.moveTo(wx, wy); else pCtx.lineTo(wx, wy);
    });
    pCtx.stroke(); pCtx.setLineDash([]);
  } else {
    pCtx.fillStyle = 'rgba(255,0,0,0.15)';
    pCtx.fillRect(hoverGx * TILE_SIZE, hoverGy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  }
}

canvas.addEventListener('mousemove', e => {
  const rect = canvas.getBoundingClientRect();
  hoverGx = Math.floor((e.clientX - rect.left)  / TILE_SIZE);
  hoverGy = Math.floor((e.clientY - rect.top)   / TILE_SIZE);
  drawHoverPreview();
});

canvas.addEventListener('mouseleave', () => {
  hoverGx = -1; hoverGy = -1;
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
});

// ── Global Actions ─────────────────────────────

window.buyResearch = (type) => {
  const costs = { bounty: 500, piercing: 600, interest: 750 };
  if (gold >= costs[type]) {
    gold -= costs[type];
    if (type === 'bounty') research.bounty += 5;
    if (type === 'piercing') research.piercing += 2;
    if (type === 'interest') research.interest += 0.02;
    document.getElementById('res_' + type).disabled = true;
    document.getElementById('res_' + type).innerText += " [MAX]";
  }
};

window.setBuildType = t => {
  buildType = buildType === t ? null : t;
  selectedTower = null; selectedEnemy = null;
  document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build'));
  if (buildType) document.getElementById('btn_' + buildType)?.classList.add('active-build');
  updateSelectionUI(); drawHoverPreview();
};

window.upgradeSpeed = () => {
  const isAccel = selectedTower.type === 'ACCEL';
  const cost = selectedTower.upgrades.speed * (isAccel ? 50 : 30);
  if (selectedTower && gold >= cost) {
    gold -= cost; 
    selectedTower.baseReload *= (isAccel ? 0.8 : 0.85); 
    selectedTower.upgrades.speed++;
    selectedTower.level++; towers.forEach(t => t.applyBuffs(towers)); updateSelectionUI();
  }
};

window.upgradeDamage = () => {
  const isAccel = selectedTower.type === 'ACCEL';
  const cost = selectedTower.upgrades.damage * (isAccel ? 60 : 40);
  if (selectedTower && gold >= cost) {
    gold -= cost; 
    selectedTower.baseDamage += (isAccel ? 5 : selectedTower.baseDamage * 0.4); 
    selectedTower.upgrades.damage++;
    selectedTower.level++; towers.forEach(t => t.applyBuffs(towers)); updateSelectionUI();
  }
};

window.upgradeRange = () => {
  const isAccel = selectedTower.type === 'ACCEL';
  const cost = selectedTower.upgrades.range * (isAccel ? 40 : 25);
  if (selectedTower && gold >= cost) {
    gold -= cost; selectedTower.baseRange += 20; selectedTower.upgrades.range++;
    selectedTower.level++; towers.forEach(t => t.applyBuffs(towers)); updateSelectionUI();
  }
};

window.upgradeAccelDuration = () => {
  const cost = selectedTower.upgrades.duration * 50;
  if (selectedTower && gold >= cost) {
    gold -= cost; 
    selectedTower.baseDuration += 60; 
    selectedTower.upgrades.duration++;
    selectedTower.level++; towers.forEach(t => t.applyBuffs(towers)); updateSelectionUI();
  }
};

window.upgradeRadar = () => {
  if (!selectedTower || selectedTower.type === 'SNIPER') return;
  const cost = 150;
  if (selectedTower.upgrades.radar === 0 && gold >= cost) {
    gold -= cost;
    selectedTower.upgrades.radar = 1;
    selectedTower.level++;
    updateSelectionUI();
  }
};

window.upgradeDefenseMelt = () => {
  const cost = (selectedTower.meltLevel + 1) * 50;
  if (selectedTower && gold >= cost) {
    gold -= cost; selectedTower.meltLevel++; selectedTower.level++; updateSelectionUI();
  }
};

window.upgradeSlowPower = () => {
  const cost = (selectedTower.slowLevel + 1) * 40;
  if (selectedTower && gold >= cost) {
    gold -= cost; selectedTower.slowLevel++; selectedTower.level++; updateSelectionUI();
  }
};

window.setBuffSpec = type => {
  if (selectedTower) { selectedTower.buffSpec = type; towers.forEach(t => t.applyBuffs(towers)); updateSelectionUI(); }
};

window.cycleTargeting = () => {
  if (!selectedTower) return;
  const modes = ['First', 'Last', 'Strongest', 'Weakest'];
  selectedTower.targetMode = modes[(modes.indexOf(selectedTower.targetMode) + 1) % modes.length];
  updateSelectionUI();
};

window.removeTower = () => {
  if (!selectedTower) return;
  const isAccel = selectedTower.type === 'ACCEL';
  const upgradeSpend =
    (selectedTower.upgrades.speed  - 1) * (isAccel ? 50 : 30) +
    (selectedTower.upgrades.damage - 1) * (isAccel ? 60 : 40) +
    (selectedTower.upgrades.range  - 1) * (isAccel ? 40 : 25) +
    (selectedTower.upgrades.duration - 1) * 50 +
    (selectedTower.upgrades.radar * 150) +
    (selectedTower.meltLevel * 50) +
    (selectedTower.slowLevel * 40);
  
  gold += Math.floor(TOWER_TYPES[selectedTower.type].cost / 2 + upgradeSpend / 2);
  grid[selectedTower.gy][selectedTower.gx] = 0;
  towers = towers.filter(t => t !== selectedTower);
  recalculateAllPaths();
  selectedTower = null; updateSelectionUI();
};

window.togglePause = () => {
  isPaused = !isPaused;
  const btn = document.getElementById('pauseBtn');
  btn.innerText = isPaused ? 'RESUME' : 'PAUSE'; btn.style.background = isPaused ? '#FF9800' : '';
};

window.toggleSpeed = () => {
  gameSpeed = gameSpeed === 1 ? 2 : 1;
  const btn = document.getElementById('speedBtn');
  btn.innerText = gameSpeed === 2 ? '2×' : '1×'; btn.classList.toggle('fast', gameSpeed === 2);
};

window.toggleMute = () => {
  const muteBtn = document.getElementById('muteBtn');
  if (isMusicPlaying) {
    bgMusic.pause();
    isMusicPlaying = false;
    muteBtn.innerText = "🎵 PLAY MUSIC"; muteBtn.style.background = ""; 
  } else {
    bgMusic.play().catch(err => {
      console.error("Browser blocked audio:", err);
      alert("Please click anywhere on the game screen first to allow audio!");
    });
    isMusicPlaying = true;
    muteBtn.innerText = "🎵 MUTE MUSIC"; muteBtn.style.background = "#4CAF50"; 
  }
};

window.restartGame = () => {
  gold = 200; lives = 20; waveNumber = 0; 
  enemiesLeftToSpawn = 0; spawnTimer = 0; waveCooldown = 0;
  enemies = []; towers = []; projectiles = []; particles = [];
  selectedTower = null; selectedEnemy = null; buildType = null;
  isPaused = false; isWaveActive = false; gameSpeed = 1; frameCount = 0;
  research = { bounty: 0, piercing: 0, interest: 0.01 }; // Reset research

  document.getElementById('pauseBtn').innerText = 'PAUSE'; document.getElementById('pauseBtn').style.background = '';
  document.getElementById('speedBtn').innerText = '1×'; document.getElementById('speedBtn').classList.remove('fast');
  document.getElementById('interestDisplay').innerText = '';
  
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  updateSelectionUI(); updateWavePreview();
};

// ── Mouse input ────────────────────────────────

canvas.addEventListener('contextmenu', e => e.preventDefault());

canvas.addEventListener('mousedown', e => {
  const rect   = canvas.getBoundingClientRect();
  const clickX = e.clientX - rect.left;
  const clickY = e.clientY - rect.top;
  const gx     = Math.floor(clickX / TILE_SIZE);
  const gy     = Math.floor(clickY / TILE_SIZE);

  if (e.button === 2) {
    buildType = null; selectedTower = null; selectedEnemy = null;
    updateSelectionUI(); drawHoverPreview(); return;
  }

  let clickedEnemy = null;
  for (let i = enemies.length - 1; i >= 0; i--) {
    const hitR = enemies[i].type === 'BOSS' ? 30 : 22;
    if (Math.hypot(enemies[i].x - clickX, enemies[i].y - clickY) <= hitR) { clickedEnemy = enemies[i]; break; }
  }
  if (clickedEnemy) {
    selectedEnemy = clickedEnemy; selectedTower = null; buildType = null;
    updateSelectionUI(); return;
  }

  const existingTower = towers.find(t => t.gx === gx && t.gy === gy);
  if (existingTower) {
    selectedTower = existingTower; selectedEnemy = null; buildType = null;
    updateSelectionUI(); return;
  }

  if (buildType) {
    const cost = TOWER_TYPES[buildType].cost;
    if (gold >= cost && grid[gy] && grid[gy][gx] === 0) {
      if ((gx === startPos.x && gy === startPos.y) || (gx === endPos.x && gy === endPos.y)) return;
      grid[gy][gx] = 1;
      const p = findPath();
      if (p) {
        gold -= cost; towers.push(new Tower(gx, gy, buildType)); recalculateAllPaths();
      } else { grid[gy][gx] = 0; }
      drawHoverPreview();
    }
  } else {
    selectedTower = null; selectedEnemy = null; updateSelectionUI();
  }
});

// ── Core tick ──────────────────────────────────

function tick() {
  if (lives <= 0 || isPaused) return;
  frameCount++;

  if (enemies.length === 0 && enemiesLeftToSpawn === 0) {
    if (isWaveActive) {
      const bonus    = 50 + waveNumber * 10;
      const interest = Math.floor(gold * research.interest); // Interest Research
      gold += bonus + interest;
      document.getElementById('interestDisplay').innerText = `+ $${interest} interest`;
      isWaveActive = false; waveCooldown = 180; updateWavePreview();
    } else {
      if (waveCooldown > 0) {
        waveCooldown--;
      } else {
        waveNumber++;
        enemiesLeftToSpawn = waveNumber % 10 === 0 ? 1 : 5 + waveNumber;
        spawnTimer = 999; isWaveActive = true;
        document.getElementById('interestDisplay').innerText = ''; 
        updateWavePreview();
      }
    }
  }

  const spawnInterval = Math.max(20, 60 - waveNumber * 2);
  if (enemiesLeftToSpawn > 0) spawnTimer++;
  if (enemiesLeftToSpawn > 0 && spawnTimer >= spawnInterval) {
    spawnTimer = 0;
    
    let type = 'NORMAL';
    if (waveNumber % 10 === 0 && waveNumber > 0) type = 'BOSS';
    else if (waveNumber > 1) {
      const r = Math.random();
      if (waveNumber > 12 && r > 0.90) type = 'CARRIER';
      else if (waveNumber > 9 && r > 0.80) type = 'HEALER';
      else if (waveNumber > 7 && r > 0.65) type = 'GHOST';
      else if (waveNumber > 4 && r > 0.50) type = 'FLYER';
      else if (waveNumber > 3 && r > 0.40) type = 'TANK';
      else if (waveNumber > 1 && r > 0.30) type = 'RUNNER';
    }
    
    const p = findPath();
    if (p || type === 'FLYER') enemies.push(new Enemy(p || [], type)); 
    enemiesLeftToSpawn--;
  }

  towers.forEach(t => t.applyBuffs(towers));
  towers.forEach(t => t.update());

  enemies = enemies.filter(e => {
    e.update();
    if (!e.alive && selectedEnemy === e) { selectedEnemy = null; updateSelectionUI(); }
    return e.alive;
  });

  projectiles = projectiles.filter(p => { p.update(); return p.alive; });
  particles = particles.filter(p => { p.update(); return p.life > 0; });

  if (selectedEnemy) updateSelectionUI();
}

// ── Game Loop ─────────────────────────────
function update() {
    requestAnimationFrame(update);

    for (let i = 0; i < gameSpeed; i++) tick();

    document.getElementById('goldDisplay').innerText = gold;
    document.getElementById('livesDisplay').innerText = lives;
    document.getElementById('waveDisplay').innerText = waveNumber;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    ctx.strokeStyle = '#333';
    for(let x=0; x<COLS; x++) for(let y=0; y<ROWS; y++) ctx.strokeRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    
    ctx.fillStyle = '#2196F3'; ctx.fillRect(startPos.x*TILE_SIZE, startPos.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#F44336'; ctx.fillRect(endPos.x*TILE_SIZE, endPos.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);

    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
    ctx.fillText('IN',  startPos.x * TILE_SIZE + TILE_SIZE / 2, startPos.y * TILE_SIZE + TILE_SIZE / 2 + 4);
    ctx.fillText('OUT', endPos.x   * TILE_SIZE + TILE_SIZE / 2, endPos.y   * TILE_SIZE + TILE_SIZE / 2 + 4);
    ctx.textAlign = 'left';

    towers.forEach(t => t.draw());
    enemies.forEach(e => e.draw());
    projectiles.forEach(p => p.draw());
    particles.forEach(p => p.draw()); 

    if (isPaused) {
        ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height);
        ctx.fillStyle = 'white'; ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center';
        ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2); ctx.textAlign = 'left';
    }

    if (lives <= 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height);
        ctx.fillStyle = 'red'; ctx.font = 'bold 50px Arial'; ctx.textAlign = 'center';
        ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2); ctx.textAlign = 'left';
    }
}

// Start
updateWavePreview();
update();
