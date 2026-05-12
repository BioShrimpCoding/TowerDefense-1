const canvas = document.getElementById('gameCanvas'), ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('pathPreviewCanvas'), pCtx = pCanvas.getContext('2d');
const bgCanvas = document.createElement('canvas'), bgCtx = bgCanvas.getContext('2d');
const TILE_SIZE = 40; let COLS = 20, ROWS = 12;

const MAP_DATA = [
  { name: "Chaos Arena", type: "RANDOM", cols: 20, rows: 12, start: {x:0, y:6}, end: {x:19, y:6}, layout: [] },
  {
    name: "Pointless Journey",
    type: "FIXED",
    cols: 20,
    rows: 12,
    layout: [
      "11111111111111111111",
      "10000000000000000001",
      "10000000000000000001",
      "10000000000000000001",
      "10000000000000000001",
      "10000000000000000001",
      "10000000000000000001",
      "10000000000000000001",
      "10000000000000000001",
      "E0000000000000000001",
      "00000000000000000001",
      "S1111111111111111111"
    ]
  },
  {
    name: "Double Trouble",
    type: "FIXED",
    cols: 20,
    rows: 12,
    layout: [
      "00000000000000000000",
      "00000000000000000000",
      "00000000000000000000",
      "00001111111111111000",
      "00011000000000001100",
      "00110000000000000110",
      "S110000000000000001E",
      "00110000000000000110",
      "00011000000000001100",
      "00001111111111111000",
      "00000000000000000000",
      "00000000000000000000"
    ]
  },
  {
    name: "Stranded",
    type: "FIXED",
    cols: 24,
    rows: 13,
    layout: [
      "XXXXXXXXXXXXXXXXXXX1111X",
      "XXXXXXXXXXXXXXXXXXX1001X",
      "XXXXX111111XXXXXXXX1001X",
      "XXXXX1000011XXXX11110011",
      "XXXXX10000011XX110000001",
      "XXX11100000011110000000E",
      "S11100000000000000000001",
      "XXX100111100000000000001",
      "XXX1001XX110000000000111",
      "XXX1111XXX110000111111XX",
      "XXXXXXXXXXX111111XXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXX",
      "XXXXXXXXXXXXXXXXXXXXXXXX"
    ]
  }
];

let currentMapIndex = 0, startPos = {x:0, y:6}, endPos = {x:19, y:6};

function parseStoredJson(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch (_) {
    localStorage.removeItem(key);
    return fallback;
  }
}

let metaTech = { tokens: 0, discount: 0, lives: 0, farmInc: 0, unlockedEnemies: [] };
function loadMeta() {
  metaTech = parseStoredJson('dd_meta', metaTech);
  if (!metaTech.unlockedEnemies) metaTech.unlockedEnemies = [];
    updateMetaUI();
}

function saveMeta() {
  if (adminProgressWritesBlocked()) {
    updateMetaUI();
    logAdmin('Meta write blocked in admin mode');
    return;
  }
  localStorage.setItem('dd_meta', JSON.stringify(metaTech));
  updateMetaUI();
}
window.buyMeta = (type) => {
    let cost = (metaTech[type] + 1) * 5;
    if (metaTech.tokens >= cost && metaTech[type] < 10) { metaTech.tokens -= cost; metaTech[type]++; saveMeta(); }
};
function updateMetaUI() {
    if(document.getElementById('metaTokens')) document.getElementById('metaTokens').innerText = metaTech.tokens;
    ['discount', 'lives', 'farmInc'].forEach(t => {
        let elLvl = document.getElementById(`meta_${t}_lvl`), elCost = document.getElementById(`meta_${t}_cost`);
        if(elLvl) elLvl.innerText = metaTech[t];
        if(elCost) elCost.innerText = metaTech[t] >= 10 ? "MAX" : (metaTech[t] + 1) * 5;
    });
    document.querySelectorAll('.cost-disp').forEach(el => { el.innerText = '$' + getTowerCost(el.dataset.type); });
}

function loadAchievements() {
  achievements = parseStoredJson('dd_achievements', achievements);
  leaderboard = parseStoredJson('dd_leaderboard', leaderboard);
  leaderboard.EASY = leaderboard.EASY || [];
  leaderboard.NORMAL = leaderboard.NORMAL || [];
  leaderboard.HARD = leaderboard.HARD || [];
  dailyChallengeState = parseStoredJson('dd_daily_state', dailyChallengeState);
  let hw = localStorage.getItem('dd_highest_wave');
  if (hw) highestWave = parseInt(hw);
}

function saveAchievements() {
  if (adminProgressWritesBlocked()) {
    logAdmin('Achievement write blocked in admin mode');
    return;
  }
  localStorage.setItem('dd_achievements', JSON.stringify(achievements));
  localStorage.setItem('dd_leaderboard', JSON.stringify(leaderboard));
  localStorage.setItem('dd_daily_state', JSON.stringify(dailyChallengeState));
  localStorage.setItem('dd_highest_wave', highestWave.toString());
}

function getCurrentDayKey() {
  return Math.floor(Date.now() / 86400000).toString();
}

function seededShuffle(arr, seed) {
  const out = [...arr];
  let x = seed || 1;
  for (let i = out.length - 1; i > 0; i--) {
    x = (x * 1664525 + 1013904223) >>> 0;
    const j = x % (i + 1);
    const temp = out[i];
    out[i] = out[j];
    out[j] = temp;
  }
  return out;
}

function ensureDailyChallengeState() {
  const dayKey = getCurrentDayKey();
  if (dailyChallengeState.dayKey !== dayKey) {
    dailyChallengeState = { dayKey, completed: {}, claimed: {} };
    saveAchievements();
  }
}

function getSupportSynergyCount() {
  let linked = 0;
  towers.forEach(t => {
    if (t.isFarm || t.type === 'BUFF' || t.type === 'SUPPORT') return;
    const hasLink = towers.some(src => {
      if (src.type !== 'BUFF' && src.type !== 'SUPPORT') return false;
      return (src.x - t.x) ** 2 + (src.y - t.y) ** 2 <= src.range * src.range;
    });
    if (hasLink) linked++;
  });
  return linked;
}

function isChallengeComplete(challengeKey) {
  switch (challengeKey) {
    case 'budget_builder':
      return waveNumber >= 8 && runStats.spent <= 5000;
    case 'tower_power':
      return waveNumber >= 20 && runStats.maxTowers >= 15;
    case 'single_minded':
      return waveNumber >= 12 && runStats.towerTypes.size === 1;
    case 'endless_ambition':
      return gameMode === 'ENDLESS' && waveNumber >= 30;
    case 'synergy_master':
      return getSupportSynergyCount() >= 3;
    case 'adaptive_commander':
      return waveNumber >= 18 && runStats.towerTypes.size >= 4;
    case 'untouched_guard':
      return waveNumber >= 15 && lives >= runStats.initialLives;
    case 'high_roller':
      return waveNumber >= 18 && gold >= 30000;
    default:
      return false;
  }
}

function evaluateDailyChallenges() {
  ensureDailyChallengeState();
  const daily = generateDailyChallenge();
  daily.forEach(ch => {
    if (dailyChallengeState.completed[ch.id]) return;
    if (isChallengeComplete(ch.key)) {
      dailyChallengeState.completed[ch.id] = true;
      saveAchievements();
    }
  });
}

function checkAchievements() {
  if (waveNumber >= 25) achievements.wave25 = true;
  if (waveNumber >= 50) achievements.wave50 = true;
  if (towers.length === 0 && waveNumber >= 10) achievements.noTowers = true;
  if (runStats.towerTypes.size >= Object.keys(TOWER_TYPES).length) achievements.allTowers = true;
  if (gameMode === 'STANDARD' && waveNumber >= 20 && lives >= runStats.initialLives) achievements.first5Star = true;
  if (gameMode === 'STANDARD' && waveNumber >= 20 && Date.now() - gameStartTime <= 300000) achievements.speedrun = true;
  if (gameMode === 'ENDLESS' && waveNumber >= 100) achievements.perfectGame = true;
  if (gameMode === 'ENDLESS' && waveNumber > highestWave) highestWave = waveNumber;
}

function getTowerCost(type) { return Math.max(10, Math.floor(TOWER_TYPES[type].baseCost * (1 - metaTech.discount * 0.05))); }

function drawBgCache() {
    bgCanvas.width = canvas.width; bgCanvas.height = canvas.height;
    bgCtx.clearRect(0, 0, canvas.width, canvas.height);
    const map = MAP_DATA[currentMapIndex];
    if (map && map.type === "FIXED") {
      const layout = map.layout;
      for(let y=0; y<ROWS; y++) for(let x=0; x<COLS; x++) {
        const cell = layout[y] && layout[y][x] ? layout[y][x] : '0';
        if (cell === '1' || cell === 'S' || cell === 'E') {
          bgCtx.fillStyle = '#FF8A3D';
          bgCtx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        } else if (cell === 'X') {
          bgCtx.fillStyle = '#E600E6';
          bgCtx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        }
      }
    }
    bgCtx.strokeStyle = '#333';
    for(let x=0; x<COLS; x++) for(let y=0; y<ROWS; y++) bgCtx.strokeRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    bgCtx.fillStyle = '#2196F3'; bgCtx.fillRect(startPos.x*TILE_SIZE, startPos.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    bgCtx.fillStyle = '#F44336'; bgCtx.fillRect(endPos.x*TILE_SIZE, endPos.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    bgCtx.fillStyle = 'rgba(0,0,0,0.6)'; bgCtx.font = 'bold 10px Arial'; bgCtx.textAlign = 'center';
    bgCtx.fillText('IN',  startPos.x * TILE_SIZE + TILE_SIZE / 2, startPos.y * TILE_SIZE + TILE_SIZE / 2 + 4);
    bgCtx.fillText('OUT', endPos.x   * TILE_SIZE + TILE_SIZE / 2, endPos.y   * TILE_SIZE + TILE_SIZE / 2 + 4); bgCtx.textAlign = 'left';
}

function setupMap(m) {
    if (m.type === "RANDOM") { startPos=m.start; endPos=m.end; return; }
    let s, e;
    for(let y=0; y<m.layout.length; y++) for(let x=0; x<m.layout[0].length; x++) { if(m.layout[y][x]==='S') s={x,y}; if(m.layout[y][x]==='E') e={x,y}; }
    startPos=s; endPos=e;
    const key = (x, y) => `${x},${y}`;
    const parseKey = (k) => {
      const [x, y] = k.split(',').map(Number);
      return { x, y };
    };
    const isWalkable = (x, y) => {
      if (x < 0 || x >= m.cols || y < 0 || y >= m.rows) return false;
      const cell = m.layout[y] && m.layout[y][x];
      return cell === '1' || cell === 'S' || cell === 'E';
    };

    const dist = new Map();
    const parents = new Map();
    const q = [[s.x, s.y]];
    const startKey = key(s.x, s.y);
    const endKey = key(e.x, e.y);
    dist.set(startKey, 0);
    parents.set(startKey, []);

    while (q.length > 0) {
      const [x, y] = q.shift();
      const curKey = key(x, y);
      const curDist = dist.get(curKey);
      [{x:x+1,y}, {x:x-1,y}, {x,y:y+1}, {x,y:y-1}].forEach(n => {
        if (!isWalkable(n.x, n.y)) return;
        const nk = key(n.x, n.y);
        const nd = curDist + 1;
        if (!dist.has(nk) || nd < dist.get(nk)) {
          dist.set(nk, nd);
          parents.set(nk, [curKey]);
          q.push([n.x, n.y]);
        } else if (nd === dist.get(nk)) {
          const p = parents.get(nk) || [];
          p.push(curKey);
          parents.set(nk, p);
        }
      });
    }

    if (!dist.has(endKey)) {
      m.fixedPaths = [];
      m.fixedPath = [];
      return;
    }

    const maxPaths = 64;
    const allPaths = [];
    const buildPaths = (k, revPath) => {
      if (allPaths.length >= maxPaths) return;
      if (k === startKey) {
        const full = [...revPath, parseKey(k)].reverse();
        allPaths.push(full);
        return;
      }
      const prev = parents.get(k) || [];
      const node = parseKey(k);
      for (const pk of prev) {
        buildPaths(pk, [...revPath, node]);
        if (allPaths.length >= maxPaths) return;
      }
    };

    buildPaths(endKey, []);
    m.fixedPaths = allPaths;
    if (!m.fixedPaths || m.fixedPaths.length === 0) {
      m.fixedPath = [];
      return;
    }
    if (typeof m._fpIndex !== 'number' || m._fpIndex < 0) m._fpIndex = 0;
    if (m._fpIndex >= m.fixedPaths.length) m._fpIndex = 0;
    m.fixedPath = m.fixedPaths[m._fpIndex];
}

function getFixedMapSpawnPath() {
  const m = MAP_DATA[currentMapIndex];
  if (!m || m.type !== 'FIXED') return null;
  if (Array.isArray(m.fixedPaths) && m.fixedPaths.length > 0) {
    if (isAdminTestMode) {
      if (adminSettings.pathMode === 'path0') return m.fixedPaths[0] || m.fixedPath || null;
      if (adminSettings.pathMode === 'path1') return m.fixedPaths[Math.min(1, m.fixedPaths.length - 1)] || m.fixedPath || null;
    }
    return m.fixedPaths[Math.floor(Math.random() * m.fixedPaths.length)];
  }
  return m.fixedPath || null;
}

function drawAdminPathOverlay() {
  if (!isAdminTestMode || !adminSettings.showPaths) return;
  enemies.forEach((enemy, idx) => {
    if (!enemy.path || enemy.path.length === 0) return;
    const path = enemy.path.slice(Math.max(0, enemy.pathIndex || 0));
    if (path.length === 0) return;
    const hue = (idx * 47) % 360;
    ctx.strokeStyle = `hsla(${hue}, 100%, 65%, 0.85)`;
    ctx.lineWidth = 2;
    ctx.setLineDash([5, 4]);
    ctx.beginPath();
    path.forEach((p, i) => {
      const px = p.x * TILE_SIZE + TILE_SIZE / 2;
      const py = p.y * TILE_SIZE + TILE_SIZE / 2;
      if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
    });
    ctx.stroke();
    ctx.setLineDash([]);
    const head = path[0];
    if (head) {
      ctx.fillStyle = `hsla(${hue}, 100%, 75%, 1)`;
      ctx.font = 'bold 10px Arial';
      ctx.fillText(`${enemy.type}#${idx + 1}`, head.x * TILE_SIZE + 4, head.y * TILE_SIZE + 12);
    }
  });
}

const bgMusic = new Audio('bgm.mp3'); bgMusic.loop = true; bgMusic.volume = 0.3;
let isMusicPlaying = false, audioCtx = null;

function playSFX(t) {
  if (!isMusicPlaying || !gameSettings.sound) return;
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  const cf = {'shoot':{t:'square',f1:400,f2:100,g:0.02,d:0.1}, 'sniper':{t:'sawtooth',f1:150,f2:40,g:0.05,d:0.3},
    'explosion':{t:'square',f1:100,f2:20,g:0.08,d:0.4}, 'hit':{t:'triangle',f1:300,f2:500,g:0.01,d:0.05,r:'l'},
    'railgun':{t:'sawtooth',f1:800,f2:100,g:0.08,d:0.5}, 'beam':{t:'triangle',f1:650,f2:220,g:0.025,d:0.12}}[t];
  if(!cf) return;
  osc.type = cf.t; osc.frequency.setValueAtTime(cf.f1, now); osc.frequency.exponentialRampToValueAtTime(cf.f2, now+cf.d);
  gain.gain.setValueAtTime(cf.g, now);
  if(cf.r==='l') gain.gain.linearRampToValueAtTime(0.001, now+cf.d); else gain.gain.exponentialRampToValueAtTime(0.001, now+cf.d);
  osc.start(now); osc.stop(now+cf.d);
}

let particles = [];
const PARTICLE_FRAME_BUDGET = 400;
let particleFrameBudget = PARTICLE_FRAME_BUDGET;
class Particle {
  constructor(x, y, c, s = 1) {
    this.x=x; this.y=y; this.c=c; const a = Math.random()*Math.PI*2, sp = (Math.random()*2+1)*s;
    this.vx=Math.cos(a)*sp; this.vy=Math.sin(a)*sp; this.l=1.0; this.d=Math.random()*0.05+0.02;
  }
  update() { this.x+=this.vx; this.y+=this.vy; this.l-=this.d; }
  draw() { ctx.globalAlpha=Math.max(0,this.l); ctx.fillStyle=this.c; ctx.fillRect(this.x,this.y,3,3); ctx.globalAlpha=1.0; }
}
const spawnParticles = (x,y,c,n,s=1) => {
  if (!gameSettings.flashing || n <= 0) return;
  const count = Math.min(n, particleFrameBudget, 20);
  if (count <= 0) return;
  particleFrameBudget -= count;
  for(let i=0; i<count; i++) particles.push(new Particle(x,y,c,s));
};

function resetParticleBudget() {
  particleFrameBudget = PARTICLE_FRAME_BUDGET;
}

let upgradeEffects = [];
class UpgradeEffect {
  constructor(x, y, color) {
    this.x = x;
    this.y = y;
    this.color = color;
    this.life = 40;
    this.radius = 6;
  }
  update() {
    this.life--;
    this.radius += 1.7;
  }
  draw() {
    if (!gameSettings.flashing) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0, this.life / 40);
    ctx.strokeStyle = this.color;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }
}

function spawnUpgradeEffect(x, y, color) {
  upgradeEffects.push(new UpgradeEffect(x, y, color || '#FFD700'));
}

const FARMER_AMMO_TYPES = {
  MODIFIED: { label: 'Modified', pellets: 6, spread: 0.34, damageMult: 1.0, falloff: 1.0, speed: 9, color: '#FFD54F', critChance: 0.12, critMult: 1.45, exposeTicks: 30, exposeMult: 1.08, particleCount: 2, effect: 'balanced' },
  BIRDSHOT: { label: 'Birdshot', pellets: 18, spread: 0.75, damageMult: 0.45, falloff: 0.88, speed: 8, color: '#FFF3A1', pelletSize: 1.8, particleCount: 1, exposeTicks: 20, exposeMult: 1.05, effect: 'spread' },
  BUCKSHOT: { label: 'Buckshot', pellets: 8, spread: 0.34, damageMult: 0.9, falloff: 1.0, speed: 9, color: '#FFD54F', pelletSize: 2.2, particleCount: 2, exposeTicks: 45, exposeMult: 1.1, effect: 'knockback' },
  SLUGS: { label: 'Slugs', pellets: 1, spread: 0.03, damageMult: 3.2, falloff: 2.1, speed: 12, color: '#FFFFFF', pelletSize: 3.2, particleCount: 3, pierceHits: 1, critChance: 0.18, critMult: 1.7, exposeTicks: 60, exposeMult: 1.12, effect: 'piercing' },
  TARGET: { label: 'Target Load', pellets: 5, spread: 0.12, damageMult: 0.7, falloff: 0.72, speed: 10, color: '#D8F7FF', pelletSize: 2, particleCount: 2, exposeTicks: 180, exposeMult: 1.2, effect: 'accuracy', spread: 0.05 },
  BEANBAG: { label: 'Bean Bag', pellets: 1, spread: 0.08, damageMult: 0.2, falloff: 0.62, speed: 8, color: '#CDBA94', pelletSize: 3, slowTicks: 120, slowFactor: 0.15, particleCount: 3, effect: 'stun', stunChance: 0.35 },
  RUBBER_BUCKSHOT: { label: 'Rubber Buckshot', pellets: 7, spread: 0.4, damageMult: 0.38, falloff: 0.78, speed: 9, color: '#FFB2A1', pelletSize: 2.1, slowTicks: 45, slowFactor: 0.72, particleCount: 2, effect: 'bounce' },
  RUBBER_SLUG: { label: 'Rubber Slug', pellets: 1, spread: 0.04, damageMult: 0.65, falloff: 1.7, speed: 11, color: '#FF8A80', pelletSize: 3, slowTicks: 60, slowFactor: 0.65, particleCount: 3, exposeTicks: 50, exposeMult: 1.08, effect: 'bounce' },
  BREACHING: { label: 'Breaching', pellets: 1, spread: 0.02, damageMult: 1.8, falloff: 1.15, speed: 11, color: '#E0E0E0', pelletSize: 3.1, splashRadius: 28, particleCount: 4, armorShred: 3, armorShredTicks: 150, effect: 'shatter' },
  FLASHBANG: { label: 'Flashbang', pellets: 1, spread: 0.08, damageMult: 0.25, falloff: 0.58, speed: 8, color: '#FFF5D6', pelletSize: 3, slowTicks: 180, slowFactor: 0.1, particleCount: 6, exposeTicks: 60, exposeMult: 1.2, effect: 'flash', stunChance: 0.25 },
  TRACERS: { label: 'Tracers', pellets: 6, spread: 0.34, damageMult: 0.9, falloff: 0.95, speed: 10, color: '#FF9A3D', pelletSize: 2.1, tracer: true, particleCount: 2, exposeTicks: 120, exposeMult: 1.15, effect: 'tracer' },
  PEPPER_BLAST: { label: 'Pepper Blast', pellets: 5, spread: 0.38, damageMult: 0.3, falloff: 0.68, speed: 9, color: '#B8E986', pelletSize: 2.1, slowTicks: 100, slowFactor: 0.3, burnTicks: 45, particleCount: 3, effect: 'pepper', stunChance: 0.2 },
  DRAGON_BREATH: { label: 'Dragon\'s Breath', pellets: 10, spread: 0.62, damageMult: 0.28, falloff: 0.62, speed: 8, color: '#FF7043', pelletSize: 2.1, burnTicks: 150, particleCount: 4, effect: 'ignite', igniteChance: 1.0 },
  FLECHETTES: { label: 'Flechettes', pellets: 14, spread: 0.48, damageMult: 0.42, falloff: 1.08, speed: 11, color: '#B0BEC5', pelletSize: 1.6, armorShred: 4, armorShredTicks: 120, particleCount: 2, effect: 'shrapnel' },
  BOLO: { label: 'Bolo', pellets: 2, spread: 0.18, damageMult: 0.75, falloff: 0.86, speed: 9, color: '#C8B07A', pelletSize: 2.6, slowTicks: 180, slowFactor: 0.05, particleCount: 2, effect: 'entangle', stunChance: 0.15 },
  RHODESIAN_JUNGLE: { label: 'Rhodesian Jungle', pellets: 12, spread: 0.52, damageMult: 0.55, falloff: 0.86, speed: 9, color: '#F4E38A', pelletSize: 2.1, exposeTicks: 100, exposeMult: 1.2, particleCount: 2, effect: 'explosive' },
  PIT_BULL: { label: 'Pit Bull', pellets: 5, spread: 0.28, damageMult: 1.2, falloff: 0.95, speed: 10, color: '#FFCC80', pelletSize: 2.5, splashRadius: 20, particleCount: 4, exposeTicks: 40, exposeMult: 1.12, effect: 'explosive', burnTicks: 80 },
  AP: { label: 'Armor Piercing', pellets: 4, spread: 0.16, damageMult: 1.05, falloff: 1.15, speed: 11, color: '#ECEFF1', pelletSize: 2.3, armorShred: 8, armorShredTicks: 150, particleCount: 2, effect: 'piercing' },
  EXPLODING_SLUGS: { label: 'Exploding Slugs', pellets: 1, spread: 0.04, damageMult: 1.4, falloff: 1.2, speed: 12, color: '#FFD180', pelletSize: 3.2, splashRadius: 60, burnTicks: 90, particleCount: 8, effect: 'explosive', igniteChance: 0.8 },
  FRAG_SLUGS: { label: 'Frag Slugs', pellets: 1, spread: 0.05, damageMult: 1.2, falloff: 1.1, speed: 12, color: '#F5F5F5', pelletSize: 3, splashRadius: 40, armorShred: 3, armorShredTicks: 120, particleCount: 6, effect: 'shrapnel' },
  KITCHEN_SINK: { label: 'Kitchen Sink', pellets: 14, spread: 0.58, damageMult: 0.7, falloff: 0.82, speed: 9, color: '#FFDEAD', pelletSize: 2.2, splashRadius: 20, exposeTicks: 60, exposeMult: 1.1, particleCount: 3, effect: 'chaotic', burnTicks: 30 },
  ROCK_SALT: { label: 'Rock Salt', pellets: 20, spread: 0.7, damageMult: 0.12, falloff: 0.62, speed: 8, color: '#EAEAEA', pelletSize: 1.6, slowTicks: 60, slowFactor: 0.6, particleCount: 2, effect: 'scatter', stunChance: 0.1 }
};

const FARMER_AMMO_ALIASES = {
  MODIFIED: 'MODIFIED',
  FULL: 'BUCKSHOT',
  IMPROVED: 'BIRDSHOT'
};

function normalizeFarmerAmmoType(type) {
  if (type && FARMER_AMMO_TYPES[type]) return type;
  if (type && FARMER_AMMO_ALIASES[type]) return FARMER_AMMO_ALIASES[type];
  return 'BIRDSHOT';
}

function getBossVariantForWave(wNum) {
  const variants = ['BOSS_SPEEDY', 'BOSS_TANK', 'BOSS_HIDDEN'];
  return variants[(Math.floor(wNum / 10) - 1) % variants.length];
}

let acidPools = [];
let farmerPellets = [];
let minigunPellets = [];

class FarmerPellet {
  constructor(x, y, tx, ty, color = '#FFD54F', size = 2) {
    this.x = x;
    this.y = y;
    this.tx = tx;
    this.ty = ty;
    this.color = color;
    this.life = 14;
    const dx = tx - x;
    const dy = ty - y;
    const dist = Math.hypot(dx, dy) || 1;
    this.vx = (dx / dist) * 9;
    this.vy = (dy / dist) * 9;
    this.size = size;
  }
  update() {
    const dx = this.tx - this.x;
    const dy = this.ty - this.y;
    const dist = Math.hypot(dx, dy);
    if (dist > 1) {
      this.x += this.vx;
      this.y += this.vy;
    } else {
      this.x = this.tx;
      this.y = this.ty;
    }
    this.life--;
  }
  draw() {
    if (this.life <= 0) return;
    const alpha = Math.max(0, this.life / 10);
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = this.color;
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

class AcidPool {
  constructor(x, y, radius, damagePerTick, life, sourceTower) {
    this.x = x;
    this.y = y;
    this.radius = radius;
    this.damagePerTick = damagePerTick;
    this.life = life;
    this.sourceTower = sourceTower;
    this.tickTimer = 0;
  }
  update() {
    if (this.life <= 0) return;
    this.life--;
    this.tickTimer++;
    if (this.tickTimer < 15) return;
    this.tickTimer = 0;
    enemies.forEach(enemy => {
      if (!enemy.alive) return;
      if ((enemy.x - this.x) ** 2 + (enemy.y - this.y) ** 2 <= this.radius * this.radius) {
        if (this.sourceTower) this.sourceTower.damageDealt += enemy.takeDamage(this.damagePerTick, 'CHEMIST', this.sourceTower);
      }
    });
  }
  draw() {
    if (this.life <= 0) return;
    ctx.save();
    ctx.globalAlpha = Math.max(0.08, Math.min(0.35, this.life / 240));
    ctx.fillStyle = 'rgba(0, 200, 83, 0.35)';
    ctx.beginPath();
    ctx.arc(this.x, this.y, this.radius, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }
}

window.cycleFarmerAmmo = () => {
  if (!selectedTower || selectedTower.type !== 'FARMER') return;
  const select = document.getElementById('farmerAmmoSelect');
  if (!select) return;
  const modes = Object.keys(FARMER_AMMO_TYPES).filter(key => key !== 'MODIFIED');
  const current = modes.indexOf(normalizeFarmerAmmoType(select.value || 'BIRDSHOT'));
  select.value = modes[(current + 1) % modes.length];
  updateSelectionUI();
};

window.cycleFarmerChoke = () => window.cycleFarmerAmmo();

window.setFarmerAmmo = (type) => {
  if (!selectedTower || selectedTower.type !== 'FARMER') return;
  const nextType = normalizeFarmerAmmoType(type);
  if (!FARMER_AMMO_TYPES[nextType]) return;
  if (selectedTower.ammoLocked) return;
  const select = document.getElementById('farmerAmmoSelect');
  if (select) select.value = nextType;
  updateSelectionUI();
};

window.buyFarmerAmmo = () => {
  if (!selectedTower || selectedTower.type !== 'FARMER') return;
  if (selectedTower.ammoLocked) return;
  const select = document.getElementById('farmerAmmoSelect');
  const nextType = normalizeFarmerAmmoType(select ? select.value : 'BIRDSHOT');
  if (!FARMER_AMMO_TYPES[nextType]) return;
  if (nextType === 'BIRDSHOT') {
    selectedTower.ammoType = 'BIRDSHOT';
    selectedTower.ammoLocked = false;
    updateSelectionUI();
    return;
  }
  const cost = FARMER_AMMO_TYPES[nextType].cost || 0;
  if (gold < cost) {
    alert('Not enough gold for that ammo type.');
    return;
  }
  gold -= cost;
  selectedTower.ammoType = nextType;
  selectedTower.ammoLocked = true;
  updateMetaUI();
  updateSelectionUI();
};

window.cycleFarmerChokeType = () => {
  if (!selectedTower || selectedTower.type !== 'FARMER') return;
  const modes = ['MODIFIED', 'FULL', 'IMPROVED'];
  const current = modes.indexOf(selectedTower.chokeType || 'MODIFIED');
  selectedTower.chokeType = modes[(current + 1) % modes.length];
  updateSelectionUI();
};

const TOWER_TYPES = {
  PISTOL:  { color: '#4CAF50', range: 200, reload: 25,  damage: 4,    baseCost: 100,  bullet: 'orange' },
  SNIPER:  { color: '#2196F3', range: 350, reload: 110, damage: 12,   baseCost: 300, bullet: 'white'  },
  MINIGUN: { color: '#FF9800', range: 140, reload: 6,   damage: 3,    baseCost: 500, bullet: 'yellow' },
  FLAME:   { color: '#FF5722', range: 100, reload: 15,  damage: 2,    baseCost: 200, bullet: 'red',     isFlame: true },
  ICE:     { color: '#29b6f6', range: 100, reload: 100, damage: 0,    baseCost: 200, isIce: true },
  BOMB:    { color: '#555555', range: 160, reload: 90,  damage: 10,   baseCost: 400, bullet: 'black',   splashRadius: 70 },
  TRAPPER: { color: '#795548', range: 80, reload: 300,  damage: 35,   baseCost: 600, isTrapper: true },
  ACCEL:   { color: '#E040FB', range: 240, reload: 90,  damage: 20,   baseCost: 1500, bullet: 'none',    isAccel: true, duration: 300 },
  BUFF:    { color: '#FFD700', range: 120, reload: 0,   damage: 0,    baseCost: 700, isBuff: true },
  ENGIE:   { color: '#FFC107', range: 160, reload: 60,  damage: 6,    baseCost: 600, isEngie: true,     bullet: '#FFC107', maxConstructs: 1 },
  RAILGUN: { color: '#E91E63', range: 400, reload: 150, damage: 40,   baseCost: 3000, bullet: '#00FFFF', isRail: true },
  FARM:    { color: '#8BC34A', range: 0,   reload: 0,   damage: 0,    baseCost: 250, isFarm: true,      baseIncome: 50 },
  FARMER:  { color: '#7CB342', range: 180, reload: 45,  damage: 10,   baseCost: 300, bullet: '#FFD54F', isFarmer: true },
  CHEMIST: { color: '#00C853', range: 210, reload: 70,  damage: 5,    baseCost: 650, bullet: '#7CFF8A', isChemist: true },
  SCOUT:   { color: '#42A5F5', range: 220, reload: 0,   damage: 0,    baseCost: 450, isScout: true },
  SNARE:   { color: '#9C27B0', range: 120, reload: 80,  damage: 0,    baseCost: 350, isSnare: true },
  MORTAR:  { color: '#FF6F00', range: 250, reload: 120, damage: 25,   baseCost: 800, bullet: 'gold',    splashRadius: 100, isMortar: true },
  LASER:   { color: '#00FF00', range: 200, reload: 50,  damage: 8,    baseCost: 900, isLaser: true,     duration: 120 },
  SUPPORT: { color: '#2196F3', range: 180, reload: 0,   damage: 0,    baseCost: 500, isSupport: true },
  DECOY:   { color: '#9E9E9E', range: 150, reload: 0,   damage: 0,    baseCost: 200, isDecoy: true },
  TESLA:   { color: '#00BCD4', range: 220, reload: 60,  damage: 6,    baseCost: 1100, isTesla: true }
};

function hexToRgb(hex) {
  if (!hex || typeof hex !== 'string') return null;
  let h = hex.trim();
  if (!h.startsWith('#')) return null;
  h = h.slice(1);
  if (h.length === 3) h = h.split('').map(ch => ch + ch).join('');
  if (h.length !== 6) return null;
  const n = parseInt(h, 16);
  if (Number.isNaN(n)) return null;
  return { r: (n >> 16) & 255, g: (n >> 8) & 255, b: n & 255 };
}

function rgbToHex(r, g, b) {
  const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)));
  return `#${clamp(r).toString(16).padStart(2, '0')}${clamp(g).toString(16).padStart(2, '0')}${clamp(b).toString(16).padStart(2, '0')}`;
}

function shadeHex(hex, factor) {
  const rgb = hexToRgb(hex);
  if (!rgb) return hex;
  return rgbToHex(rgb.r * factor, rgb.g * factor, rgb.b * factor);
}

function getTowerButtonColor(type) {
  return (type && TOWER_TYPES[type] && TOWER_TYPES[type].color) ? TOWER_TYPES[type].color : '#FFFFFF';
}

function getTowerButtonTextColor(bgHex) {
  const rgb = hexToRgb(bgHex);
  if (!rgb) return '#FFFFFF';
  // Relative luminance approximation for readable label text.
  const luminance = (0.2126 * rgb.r + 0.7152 * rgb.g + 0.0722 * rgb.b) / 255;
  return luminance > 0.62 ? '#111111' : '#FFFFFF';
}

function applyTowerButtonColors() {
  Object.keys(TOWER_TYPES).forEach(type => {
    const btn = document.getElementById('btn_' + type);
    if (!btn) return;
    const bg = getTowerButtonColor(type);
    btn.style.setProperty('--tower-btn-bg', bg);
    btn.style.setProperty('--tower-btn-border', shadeHex(bg, 0.72));
    btn.style.setProperty('--tower-btn-text', getTowerButtonTextColor(bg));
  });
}

function getReverseChameleonWeakTower() {
  const allowed = Object.keys(TOWER_TYPES).filter(type => !['BUFF', 'FARM', 'SUPPORT', 'DECOY'].includes(type));
  return allowed[Math.floor(Math.random() * allowed.length)];
}

const ENEMY_TYPES = {
  NORMAL:    { color: '#9C27B0', speed: 1.0, hp: 10,  armor: 0, reward: 15  },
  RUNNER:    { color: '#FFEB3B', speed: 2.4, hp: 6,   armor: 0, reward: 10  },
  TANK:      { color: '#8B4513', speed: 0.5, hp: 30,  armor: 3, reward: 40  },
  INVERSE:   { color: '#FFB74D', speed: 1.0, hp: 12,  armor: 0, reward: 18, isInverse: true },
  BUFFER:    { color: '#26A69A', speed: 0.72, hp: 18,  armor: 1, reward: 28, isBuffer: true },
  STUNNER:   { color: '#7E57C2', speed: 0.9, hp: 14,  armor: 0, reward: 24, isStunner: true },
  FLYER:     { color: '#E0E0E0', speed: 1.3, hp: 8,   armor: 0, reward: 20, isFlying: true },
  GHOST:     { color: '#9E9E9E', speed: 0.95, hp: 10,  armor: 0, reward: 25, isCamo: true },
  HEALER:    { color: '#4CAF50', speed: 0.85, hp: 15,  armor: 1, reward: 30, isHealer: true },
  CARRIER:   { color: '#607D8B', speed: 0.43, hp: 40,  armor: 2, reward: 50, spawns: 'RUNNER', spawnCount: 10 },
  SHIELD:    { color: '#00BCD4', speed: 1.1, hp: 12,  armor: 0, reward: 30, isShield: true },
  CHAMELEON: { color: '#E91E63', speed: 0.95, hp: 40,  armor: 1, reward: 35, isChameleon: true },
  SLIME:     { color: '#8BC34A', speed: 0.6, hp: 60,  armor: 0, reward: 45, isSlime: true, spawns: 'RUNNER', spawnCount: 3 },
  BOSS:      { color: '#111111', speed: 0.35, hp: 300, armor: 8, reward: 200 },
  // NEW ENEMIES
  ARMORED:   { color: '#4A4A4A', speed: 0.68, hp: 50,  armor: 6, reward: 60, isArmored: true },
  INVISIBLE: { color: '#CCCCCC', speed: 1.2, hp: 12,  armor: 0, reward: 35, isInvisible: true, isCamo: true },
  SPEEDDEM:  { color: '#FF1744', speed: 3.0, hp: 5,   armor: 0, reward: 25 },
  REGEN:     { color: '#76FF03', speed: 0.77, hp: 25,  armor: 1, reward: 40, isRegen: true },
  SWARM:     { color: '#FF9800', speed: 1.1, hp: 8,   armor: 0, reward: 12, isSwarm: true, spawns: 'SPEEDDEM', spawnCount: 3 },
  Achillies: { color: '#FFFFFF', speed: 0.85, hp: 35, armor: 2, reward: 80, isReverseChameleon: true },
  BOSS_SPEEDY: { color: '#FF6D00', speed: 0.62, hp: 240, armor: 7, reward: 240, isBoss: true, bossVariant: 'Speedy' },
  BOSS_TANK: { color: '#5D4037', speed: 0.26, hp: 520, armor: 11, reward: 320, isBoss: true, bossVariant: 'Tank' },
  BOSS_HIDDEN: { color: '#B0BEC5', speed: 0.38, hp: 360, armor: 8, reward: 280, isBoss: true, isHidden: true, isInvisible: true, isCamo: true, bossVariant: 'Hidden' },
  DESPERATOR: { color: '#FF4081', speed: 0.9, hp: 40, armor: 0, reward: 30 }
};

const WAVE_COLORS = { NORMAL: '#9C27B0', RUNNER: '#FFEB3B', TANK: '#8B4513', INVERSE: '#FFB74D', BUFFER: '#26A69A', STUNNER: '#7E57C2', FLYER: '#E0E0E0', GHOST: '#9E9E9E', HEALER: '#4CAF50', CARRIER: '#607D8B', SHIELD: '#00BCD4', CHAMELEON: '#E91E63', SLIME: '#8BC34A', BOSS: '#FF0000', BOSS_SPEEDY: '#FF6D00', BOSS_TANK: '#5D4037', BOSS_HIDDEN: '#B0BEC5', ARMORED: '#4A4A4A', INVISIBLE: '#CCCCCC', SPEEDDEM: '#FF1744', REGEN: '#76FF03', SWARM: '#FF9800', DESPERATOR: '#FF4081', Achillies: '#FFFFFF' };

let gold=500, lives=20, waveNumber=0, buildType=null, selectedTower=null, selectedEnemy=null, enemiesLeftToSpawn=0, spawnTimer=0, waveCooldown=0;
let isPaused=true, isWaveActive=false, isGameOver=false, gameSpeed=1, hoverGx=-1, hoverGy=-1, frameCount=0;
let autoStartWaves = false;
window.toggleAutoStart = (val) => autoStartWaves = val;

let isAdminTestMode = false;
const ADMIN_SEQUENCE = ['ArrowUp', 'ArrowUp', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'ArrowLeft', 'ArrowRight', 'b', 'a', 'Enter'];
let adminSeqIndex = 0;
const ADMIN_CODE_PHRASE = 'weAreAdmin';
const ADMIN_LOG_LIMIT = 32;
let adminLogs = [];
let adminSettings = {
  freezeEnemies: false,
  freeBuild: false,
  instantUpgrade: false,
  fullRefund: false,
  showPaths: false,
  pathMode: 'random',
  spawnLoop: false,
  spawnLoopFrames: 30,
  spawnLoopCounter: 0
};

function logAdmin(msg) {
  if (!isAdminTestMode) return;
  adminLogs.push(`[${frameCount}] ${msg}`);
  if (adminLogs.length > ADMIN_LOG_LIMIT) adminLogs.shift();
  const out = document.getElementById('adminLog');
  if (out) {
    out.innerHTML = adminLogs.map(x => `<div>${x}</div>`).join('');
    out.scrollTop = out.scrollHeight;
  }
}

function syncAdminPanelInputs() {
  const setChecked = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.checked = !!val;
  };
  const setValue = (id, val) => {
    const el = document.getElementById(id);
    if (el) el.value = String(val);
  };
  setChecked('adminFreezeEnemies', adminSettings.freezeEnemies);
  setChecked('adminFreeBuild', adminSettings.freeBuild);
  setChecked('adminInstantUpgrade', adminSettings.instantUpgrade);
  setChecked('adminFullRefund', adminSettings.fullRefund);
  setChecked('adminShowPaths', adminSettings.showPaths);
  setChecked('adminSpawnLoop', adminSettings.spawnLoop);
  setValue('adminPathMode', adminSettings.pathMode);
  setValue('adminSpawnLoopFrames', adminSettings.spawnLoopFrames);
}

function adminProgressWritesBlocked() {
  return isAdminTestMode;
}

function showAdminPanel() {
  const panel = document.getElementById('adminTestPanel');
  if (panel) panel.style.display = 'block';
  syncAdminPanelInputs();
}

function hideAdminPanel() {
  const panel = document.getElementById('adminTestPanel');
  if (panel) panel.style.display = 'none';
}

function refreshAdminEnemyList() {
  const sel = document.getElementById('adminEnemyType');
  if (!sel) return;
  const cur = sel.value;
  const keys = Object.keys(ENEMY_TYPES);
  sel.innerHTML = keys.map(k => `<option value="${k}">${k}</option>`).join('');
  if (keys.includes(cur)) sel.value = cur;
}

function tryUnlockAdminMode() {
  const code = prompt('Admin access code:');
  if (!code) return;
  if (code !== ADMIN_CODE_PHRASE) {
    alert('Access denied.');
    return;
  }
  isAdminTestMode = true;
  refreshAdminEnemyList();
  syncAdminPanelInputs();
  showAdminPanel();
  logAdmin('Admin mode enabled');
  alert('Admin test mode enabled.');
}

// NEW: Game modes and features
let gameMode = 'STANDARD'; // STANDARD, ENDLESS
let gameDifficulty = 'NORMAL'; // EASY, NORMAL, HARD
let achievements = {
  wave25: false, wave50: false, noTowers: false, allTowers: false,
  first5Star: false, speedrun: false, perfectGame: false
};
let leaderboard = { EASY: [], NORMAL: [], HARD: [] };
let highestWave = 0;
let endlessStartTime = 0;
let gameStartTime = 0;

let runStats = {
  spent: 0,
  initialLives: 20,
  towerTypes: new Set(),
  maxTowers: 0
};

let dailyChallengeState = {
  dayKey: '',
  completed: {},
  claimed: {}
};

const DAILY_CHALLENGE_TEMPLATES = [
  { key: 'budget_builder', name: 'Budget Builder', desc: 'Reach wave 8 while spending at most $5000', reward: 600 },
  { key: 'tower_power', name: 'Tower Power', desc: 'Reach wave 20 with at least 15 towers placed', reward: 800 },
  { key: 'single_minded', name: 'Single Minded', desc: 'Reach wave 12 using only one tower type', reward: 700 },
  { key: 'endless_ambition', name: 'Endless Ambition', desc: 'Reach wave 30 in Endless mode', reward: 1000 },
  { key: 'synergy_master', name: 'Synergy Master', desc: 'Keep 3+ towers linked to BUFF/SUPPORT auras', reward: 450 },
  { key: 'adaptive_commander', name: 'Adaptive Commander', desc: 'Reach wave 18 after using 4+ tower types', reward: 650 },
  { key: 'untouched_guard', name: 'Untouched Guard', desc: 'Reach wave 15 without losing any lives', reward: 550 },
  { key: 'high_roller', name: 'High Roller', desc: 'Hold at least $30000 at wave 18+', reward: 500 }
];

const FARM_UPGRADE_COSTS = [0, 200, 400, 700, 1200], FARM_INCOME_LEVELS = [50, 100, 200, 350, 500];
let research = { bounty: 0, piercing: 0, interest: 0.01 };
let grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
let enemies = [], towers = [], projectiles = [], traps = [];

function findPath(sx = startPos.x, sy = startPos.y) {
  let q = [[sx, sy, []]], vis = new Set([`${sx},${sy}`]);
  while (q.length > 0) {
    let i = Math.floor(Math.random() * q.length), [x, y, p] = q.splice(i, 1)[0], cur = [...p, {x, y}];
    if (x === endPos.x && y === endPos.y) return cur;
    [{x:x+1,y}, {x:x-1,y}, {x,y:y+1}, {x,y:y-1}].sort(()=>Math.random()-0.5).forEach(n => {
      if(n.x>=0 && n.x<COLS && n.y>=0 && n.y<ROWS && grid[n.y] && grid[n.y][n.x]===0 && !vis.has(`${n.x},${n.y}`)) { vis.add(`${n.x},${n.y}`); q.push([n.x, n.y, cur]); }
    });
  } return null;
}

const recalculateAllPaths = () => enemies.forEach(e => { let p = findPath(Math.floor(e.x/TILE_SIZE), Math.floor(e.y/TILE_SIZE)); if(p) { e.path=p; e.pathIndex=0; } });

function getWaveComposition(wNum) {
  if (wNum % 10 === 0 && wNum > 0) return { [getBossVariantForWave(wNum)]: 1 };
  const comp = { NORMAL: 0, RUNNER: 0, TANK: 0, INVERSE: 0, BUFFER: 0, STUNNER: 0, FLYER: 0, GHOST: 0, HEALER: 0, CARRIER: 0, SHIELD: 0, CHAMELEON: 0, SLIME: 0, ARMORED: 0, INVISIBLE: 0, SPEEDDEM: 0, REGEN: 0, SWARM: 0, REVERSECHAMELEON: 0, DESPERATOR: 0 };
  let difficultylevel = gameDifficulty === 'HARD' ? 1.5 : (gameDifficulty === 'EASY' ? 0.5 : 1);
  let count = Math.floor((5+wNum) * difficultylevel);

  for(let i=0; i<count; i++) {
    let r = Math.random();
    if (wNum>15&&r>0.85) comp.SWARM++;
    else if(wNum>12&&r>0.8) comp.CARRIER++;
    else if(wNum>10&&r>0.79) comp.BUFFER++;
    else if(wNum>10&&r>0.75) comp.CHAMELEON++;
    else if(wNum>12&&r>0.82) comp.DESPERATOR++;
    else if(wNum>14&&r>0.72) comp.REVERSECHAMELEON++;
    else if(wNum>18&&r>0.7) comp.ARMORED++;
    else if(wNum>20&&r>0.65) comp.INVISIBLE++;
    else if(wNum>8&&r>0.62) comp.STUNNER++;
    else if(wNum>8&&r>0.6) comp.SHIELD++;
    else if(wNum>9&&r>0.55) comp.HEALER++;
    else if(wNum>16&&r>0.52) comp.REGEN++;
    else if(wNum>7&&r>0.5) comp.GHOST++;
    else if(wNum>4&&r>0.4) comp.FLYER++;
    else if(wNum>3&&r>0.3) comp.TANK++;
    else if(wNum>2&&r>0.25) comp.INVERSE++;
    else if(wNum>1&&r>0.2) { if(r > 0.25) comp.RUNNER++; else comp.SPEEDDEM++; }
    else comp.NORMAL++;
  }
  return comp;
}

function updateWavePreview() {
  const comp = getWaveComposition(waveNumber + 1); let html = '';
  for(const[t,c] of Object.entries(comp)) if(c>0) html += `<span class="wave-pill" style="background:${WAVE_COLORS[t]}22;border:1px solid ${WAVE_COLORS[t]};color:${WAVE_COLORS[t]};">${c} ${t}</span>`;
  document.getElementById('waveComposition').innerHTML = html;
}
function updateSelectionUI() {
  const side = document.getElementById('statsContent');
  if (!selectedTower && !selectedEnemy) { side.innerHTML = '<p style="color:#aaa;text-align:center;margin-top:30px;">Select a unit.</p>'; return; }
  const row = (lbl, val, col='white') => `<div class="stat-row"><span>${lbl}</span><span style="color:${col}">${val}</span></div>`;

  if (selectedEnemy) {
    let h = `<h3 style="border-bottom:2px solid ${selectedEnemy.color};padding-bottom:5px;">${selectedEnemy.type}</h3>` +
      row('HP:', `${Math.max(0, Math.ceil(selectedEnemy.health))} / ${selectedEnemy.maxHealth}`, '#ff4444') +
      row('Armor:', selectedEnemy.armor.toFixed(1), '#aaa');
    if (selectedEnemy.meltTicks>0) h += row('Status:', 'Melting!', '#FF5722');
    if (selectedEnemy.slowTicks>0) h += row('Status:', 'Slowed!', '#29b6f6');
    if (selectedEnemy.immuneTimer>0) h += row('Immune To:', selectedEnemy.immuneTo, '#E91E63');
    side.innerHTML = h + row('Speed:', selectedEnemy.speed.toFixed(2)) + row('Bounty:', `$${selectedEnemy.reward}`, '#ffd700');
    return;
  }

  const t = selectedTower, ty = TOWER_TYPES[t.type];
  const isF = ty.isFarm, isB = ty.isBuff, isA = ty.isAccel, isR = ty.isRail, isE = ty.isEngie, isI = ty.isIce, isT = ty.isTrapper, isTesla = ty.isTesla, isS = ty.isSupport;

  const sellVal = Math.floor(t.totalSpent / 2);
  const canAir = (t.type==='SNIPER'||t.upgrades.radar>0) ? 'Yes' : 'No';
  const airCol = (t.type==='SNIPER'||t.upgrades.radar>0) ? '#00E676' : '#ff4444';
  const rStr = (t.type==='SNIPER'||t.upgrades.radar>0) ? `<span style="color:#00E676;">Active</span>` : `<span style="color:#aaa;">None</span>`;

  let lvlMax = isF ? 5 : 20;
  const farmerAmmoType = normalizeFarmerAmmoType(t.ammoType || 'BIRDSHOT');
  const farmerAmmo = FARMER_AMMO_TYPES[farmerAmmoType] || FARMER_AMMO_TYPES.BIRDSHOT;
  const farmerAmmoSelector = t.type === 'FARMER' ? `<div style="display:flex;gap:4px;margin-bottom:4px;"><select id="farmerAmmoSelect" onchange="setFarmerAmmo(this.value)" ${t.ammoLocked ? 'disabled' : ''} style="flex:1;background:#222;color:white;padding:4px;border:1px solid #555;">
    ${Object.entries(FARMER_AMMO_TYPES).filter(([key]) => key !== 'MODIFIED').map(([key, ammo]) => `<option value="${key}" ${farmerAmmoType===key?'selected':''}>${ammo.label}${ammo.cost ? ' ($' + ammo.cost + ')' : ''}</option>`).join('')}
  </select><button onclick="buyFarmerAmmo()" style="flex:1;" ${t.ammoLocked ? 'disabled' : ''} data-desc="Buy and equip one ammo type for this Farmer">${t.ammoLocked ? 'Ammo Purchased' : 'Buy Ammo'}</button></div><div style="font-size:11px;color:#aaa;margin-bottom:4px;">Choose one ammo type for this Farmer. Birdshot is the free default.</div>` : '';
  const farmerChokeSelector = t.type === 'FARMER' ? `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="cycleFarmerChokeType()" style="width:100%;" data-desc="Cycle Farmer choke types">Choke: ${t.chokeType || 'MODIFIED'}</button></div>` : '';

  let h = `<h3 style="border-bottom:2px solid ${t.color};padding-bottom:5px;">${t.type}</h3>${row('Level:', t.level + ` / ${lvlMax}`)}${row('Sell:', `$${sellVal}`, '#ffd700')}<br>`;

  if (isF) h += row('Income:', `+$${t.income}/wave`, '#FFD700') + row('Total Gen:', `$${t.totalGenerated}`, '#FFD700') + row('Limit:', `${towers.filter(x=>x.isFarm).length} / 8`) + `<div style="font-size:11px; color:#aaa; margin-top:5px;">No upgrades. Build a Farmer nearby to boost it.</div>`;
  else if (t.type === 'FARMER') {
    h += row('Ammo:', farmerAmmo.label, '#FFD54F') + row('Pellets:', farmerAmmo.pellets, '#FFD54F') + row('Choke:', t.chokeType || 'MODIFIED', '#FFD54F') + row('Farm Boost:', 'Nearby farms produce more', '#FFD54F') + row('Damage:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white');
  }
  else if (t.type === 'CHEMIST') h += row('Acid:', 'Bottle + puddle', '#00C853') + row('Damage:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('Range:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white');
  else if (t.type === 'SCOUT') h += row('Aura:', t.range.toFixed(1), '#42A5F5') + row('Role:', 'Extends nearby range', '#42A5F5') + row('Railgun:', 'Acts as spotter', '#42A5F5');
  else if (isB) h += row('Aura Radius:', t.range.toFixed(1)) + row('Buffing:', 'All Stats', '#FFD700') + row('Buff Intensity:', t.buffIntensity, t.buffIntensity>0?'#FFD700':'white') + `<div style="font-size:11px; color:#aaa; margin-top:5px;">Income: +$${t.income}/wave | No attack</div>`;
  else if (isE) h += row('Constructs:', `${t.constructs.length} / ${t.maxConstructs}`, '#FFC107') + row('C. Dmg:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('C. Rng:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('C. Rate:', `${(60/t.reloadTime).toFixed(1)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Buff Dur:', '5s', '#FFC107') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700');
  else if (isI) h += row('Range:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('Tick Rate:', `${(60/t.reloadTime).toFixed(2)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Freeze Radius:', t.freezeRadius, t.freezeRadius>0?'#FFD700':'white') + row('Slow Lvl:', t.slowLevel, '#29b6f6') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + `<div style="font-size:11px; color:#aaa; margin-top:5px;">Freezes enemies briefly on hit</div>`;
  else if (isA) h += row('Damage:', `${t.damage.toFixed(1)}/tk`, t.damage>t.baseDamage?'#FFD700':'white') + row('Range:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('Downtime:', `${(t.reloadTime/60).toFixed(1)}s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Beam Time:', `${((t.baseDuration || t.duration)/60).toFixed(1)}s`, '#FFD700') + row('Targets:', t.upgrades.lasers || 1, (t.upgrades.lasers||1)>1?'#FFD700':'white') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700') + `<div style="font-size:11px; color:#aaa; margin-top:5px;">Charges then devastates with beams</div>`;
  else if (isTesla) h += row('Damage:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('Range:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('Fire Rate:', `${(60/t.reloadTime).toFixed(1)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Chain Amt:', t.upgrades.chainAmount || 1, (t.upgrades.chainAmount||1)>1?'#FFD700':'white') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700') + `<div style="font-size:11px; color:#aaa; margin-top:5px;">Arcs between multiple targets</div>`;
  else if (isT) h += row('Trap Dmg:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('Throw Rate:', `${(60/t.reloadTime).toFixed(1)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Spike Count:', t.spikeCount, t.spikeCount>0?'#FFD700':'white') + row('Spike Life:', t.spikeLifespan, t.spikeLifespan>0?'#FFD700':'white') + row('Sensors:', rStr) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700') + `<div style="font-size:11px; color:#aaa; margin-top:5px;">Lays traps to catch enemies</div>`;
  else {
    if (isR && !t.hasSpotter) h += `<div style="color:#ff4444; font-weight:bold; text-align:center;">OFFLINE: NEEDS SPOTTER</div>`;
    if (ty.isSupport) h += row('Aura Radius:', t.range.toFixed(1)) + row('Boost Lvl:', t.healPower, t.healPower>0?'#FFD700':'white') + `<div style="font-size:11px; color:#aaa; margin-top:5px;">Passively boosts all nearby tower stats (speed/dmg/range)</div>`;
    else if (t.type === 'SNARE') h += row('Damage:', '0 (Stun)', '#white') + row('Mark Dur:', t.markDuration, t.markDuration>0?'#FFD700':'white') + row('Marked:', t.snareMarks.length, '#29b6f6') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + `<div style="font-size:11px; color:#aaa; margin-top:5px;">Marks and stuns targets</div>`;
    else h += row('Damage:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('Range:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('Fire Rate:', `${(60/t.reloadTime).toFixed(1)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700');
    if (ty.isFlame) h += row('Melt Lvl:', t.meltLevel, '#FF5722');
  }

  h += `<div class="upgrades-section" style="margin-top:10px; border-top:1px solid #555; padding-top:10px; display:flex; flex-direction:column; gap:4px;">`;

  if (!isF && !isB && !isI && !isT && !isTesla) {
      h += `<select onchange="setTargetMode(this.value)" style="background:#222; color:white; padding:4px; border:1px solid #555; margin-bottom:4px;">
              ${['First', 'Last', 'Strongest', 'Weakest', 'Random', 'Closest', 'Farthest', 'Highest Armor'].map(m => `<option value="${m}" ${t.targetMode===m?'selected':''}>Target: ${m}</option>`).join('')}
            </select>`;
  }

  if (t.level >= lvlMax) {
      h += `<button style="width:100%; opacity:0.5; padding:8px 0; margin-bottom:4px; font-weight:bold;" disabled>MAX LEVEL (${lvlMax})</button>`;
      if (t.type === 'FARMER') h += farmerChokeSelector;
  } else {
      let rB = (!isF && !isB) ? (t.type==='SNIPER' ? `<button class="radar-btn" style="flex:1;opacity:0.5;" data-desc="Native ability: Detects camouflaged units">Radar (Native)</button>` : (t.upgrades.radar>0 ? `<button class="radar-btn" style="flex:1;opacity:0.5;" data-desc="Unlocked: Detects camo units">Radar (MAX)</button>` : `<button class="radar-btn" onclick="upgradeTower('radar')" style="flex:1;" data-desc="Enable sensor mode to detect camouflaged enemies">Radar $150</button>`)) : '';

      if (isF) h += `<button class="farm-btn" onclick="upgradeTower('farm')" style="margin-bottom:4px;" data-desc="Increases income by 10 per upgrade level">Upgrade Yield $${FARM_UPGRADE_COSTS[t.level]}</button>`;
        else if (t.type === 'FARMER') {
          h += farmerAmmoSelector + `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1;" data-desc="Farmer shotgun damage increases with upgrades">Damage $${t.upgrades.damage*40}</button><button onclick="upgradeTower('range')" style="flex:1;" data-desc="Increase Farmer reach and farm aura">Range $${t.upgrades.range*25}</button></div>${farmerChokeSelector}`;
        }
      else if (t.type === 'CHEMIST') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Increase chemical damage and acid tick damage">Damage $${t.upgrades.damage*40}</button><button onclick="upgradeTower('range')" style="flex:1" data-desc="Increase throw distance and acid coverage">Range $${t.upgrades.range*25}</button></div>`;
      else if (t.type === 'SCOUT') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('range')" style="flex:1" data-desc="Increase the range bonus radius">Range $${t.upgrades.range*25}</button></div>`;
      else if (isB) h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('buffIntensity')" style="flex:1" data-desc="Boost all nearby tower stats by 15% per level (speed, dmg, range)">Intensity $${(t.buffIntensity+1)*35}</button></div>`;
      else if (isE) h += `<button onclick="upgradeTower('amount')" style="margin-bottom:4px;" data-desc="Spawn a new construct satellite (max ${t.maxConstructs})">Add Construct $${t.upgrades.amount*200}</button><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('speed')" style="flex:1" data-desc="Fire rate of constructs: 2% faster per level">Fire Rate $${t.upgrades.speed*30}</button><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Construct damage: Increase by 20% per level">Damage $${t.upgrades.damage*40}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('range')" style="flex:1" data-desc="Construct range: Increase by 5% per level">Range $${t.upgrades.range*25}</button>${rB}</div>`;
      else if (isI) h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('freezeRadius')" style="flex:1" data-desc="Expand freeze effect radius by 1000 pixels per level">Freeze Radius $${(t.freezeRadius+1)*30}</button><button onclick="upgradeTower('speed')" style="flex:1" data-desc="Fire frequency: 2% faster per level">Tick Rate $${t.upgrades.speed*30}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;">${rB}<button class="ice-btn" onclick="upgradeTower('slow')" style="flex:1" data-desc="Strength of freeze effect: Increases duration by 10 ticks per level">Slow Pwr $${(t.slowLevel+1)*40}</button></div>`;
      else if (isA) {
          let laserCost = 1000 * Math.pow(2, (t.upgrades.lasers || 1) - 1);
          let laserBtn = (t.upgrades.lasers || 1) >= 5 ? `<button class="accel-choice" style="width:100%;opacity:0.5;margin-bottom:4px;" disabled data-desc="Maximum target limit reached">Targets (MAX)</button>` : `<button class="accel-choice" onclick="upgradeTower('lasers')" style="width:100%;margin-bottom:4px;" data-desc="Add another laser beam target (capacity: 5 max)">Extra Laser $${laserCost}</button>`;
          h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('speed')" style="flex:1" data-desc="Reduce charging time: 2% faster per level">Recharge $${t.upgrades.speed*50}</button><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Beam damage output: 25% increase per level">Power $${t.upgrades.damage*60}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('range')" style="flex:1" data-desc="Beam range: Increase by 5% per level">Range $${t.upgrades.range*40}</button><button class="accel-choice" onclick="upgradeTower('duration')" style="flex:1" data-desc="Beam duration: 10% longer per level">Duration $${t.upgrades.duration*50}</button></div>${laserBtn}<div style="display:flex;gap:4px;margin-bottom:4px;">${rB}</div>`;
      }
      else if (isTesla) {
          let chainCost = (t.upgrades.chainAmount || 1) * 60;
          let chainBtn = (t.upgrades.chainAmount || 1) >= 5 ? `<button style="width:100%;opacity:0.5;margin-bottom:4px;" disabled data-desc="Maximum chain targets reached (5)">Chain Amt (MAX)</button>` : `<button onclick="upgradeTower('chainAmount')" style="width:100%;margin-bottom:4px;" data-desc="Arc to additional nearby enemies (max 5 targets)">Chain Amount $${chainCost}</button>`;
          h += `<button onclick="upgradeTower('damage')" style="margin-bottom:4px;width:100%;" data-desc="Base damage: 25% increase per level">Power $${t.upgrades.damage*40}</button><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('range')" style="flex:1" data-desc="Attack range: 5% longer per level">Range $${t.upgrades.range*25}</button>${rB}</div>${chainBtn}`;
      }
      else if (isT) {
          h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('spikeCount')" style="flex:1" data-desc="Spawn +1 spike per trigger (spreads attacks)">Spike Cnt $${(t.spikeCount+1)*45}</button><button onclick="upgradeTower('spikeLifespan')" style="flex:1" data-desc="Spikes persist for +30 ticks per level">Lifespan $${(t.spikeLifespan+1)*45}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('activationArea')" style="flex:1" data-desc="Increase detection radius by +4 pixels per level">Act Area $${(t.activationArea+1)*40}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Trap damage: 25% increase per level">Dmg $${t.upgrades.damage*40}</button>${rB}</div>`;
      }
      else {
          // Generic towers with tower-specific upgrades
          if (t.type === 'PISTOL') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('piercing')" style="flex:1" data-desc="Projectiles penetrate +1 enemy per level">Piercing $${(t.piercing+1)*40}</button><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Bullet damage: 25% increase per level">Dmg $${t.upgrades.damage*40}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('speed')" style="flex:1" data-desc="Fire rate: 2% faster per level">Fire Rate $${t.upgrades.speed*30}</button>${rB}</div>`;
          else if (t.type === 'SNIPER') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('armorPen')" style="flex:1" data-desc="Reduce target armor by 0.5 per level">Armor Pen $${(t.armorPen+1)*50}</button><button onclick="upgradeTower('critChance')" style="flex:1" data-desc="5% crit chance per level (2x damage on crit)">Crit $${(t.critChance+1)*50}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Shot power: 25% increase per level">Power $${t.upgrades.damage*40}</button><button onclick="upgradeTower('range')" style="flex:1" data-desc="Firing range: 5% increase per level">Range $${t.upgrades.range*25}</button></div>`;
          else if (t.type === 'MINIGUN') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('spreadReduction')" style="flex:1" data-desc="Tighten bullet spread for better accuracy">Spread $${(t.spreadReduction+1)*35}</button><button onclick="upgradeTower('ammoCapacity')" style="flex:1" data-desc="Fire rate boost: Up to 50% faster at 10 levels">Ammo $${(t.ammoCapacity+1)*35}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Bullet damage: 25% increase per level">Dmg $${t.upgrades.damage*40}</button><button onclick="upgradeTower('range')" style="flex:1" data-desc="Range: 5% increase per level">Range $${t.upgrades.range*25}</button></div>`;
          else if (t.type === 'BOMB') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('bounceCount')" style="flex:1" data-desc="Create +1 bouncing sub-projectiles per level">Bounces $${(t.bounceCount+1)*50}</button><button onclick="upgradeTower('fragmentation')" style="flex:1" data-desc="Spawn +1 shrapnel projectiles per level">Fragmentation $${(t.fragmentation+1)*50}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Blast power: 25% increase per level">Power $${t.upgrades.damage*40}</button><button onclick="upgradeTower('range')" style="flex:1" data-desc="Range: 5% increase per level">Range $${t.upgrades.range*25}</button></div>`;
          else if (t.type === 'FLAME') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('burnDuration')" style="flex:1" data-desc="Extend melt effect by +50 ticks per level">Burn Dur $${(t.burnDuration+1)*40}</button><button onclick="upgradeTower('melt')" style="flex:1" data-desc="Melt damage per tick: +10% per level">Melt Pwr $${(t.meltLevel+1)*50}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Flame power: 25% increase per level">Power $${t.upgrades.damage*40}</button><button onclick="upgradeTower('range')" style="flex:1" data-desc="Range: 5% increase per level">Range $${t.upgrades.range*25}</button></div>`;
          else if (t.type === 'RAILGUN') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('beamWidth')" style="flex:1" data-desc="Increase beam width by +5 pixels per level">Beam Width $${(t.beamWidth+1)*45}</button><button onclick="upgradeTower('piercingPower')" style="flex:1" data-desc="Beam hits +1 additional target per level">Pierce $${(t.piercingPower+1)*60}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Beam damage: 25% increase per level">Power $${t.upgrades.damage*40}</button></div>`;
          else if (t.type === 'SNARE') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('markDuration')" style="flex:1" data-desc="Stun duration: +5 ticks (0.083 sec) per level">Mark Dur $${(t.markDuration+1)*40}</button><button onclick="upgradeTower('markCapacity')" style="flex:1" data-desc="Can mark +1 enemy per level (base: 6)">Capacity $${(t.markCapacity+1)*45}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('speed')" style="flex:1" data-desc="Fire rate: 2% faster per level">Rate $${t.upgrades.speed*30}</button>${rB}</div>`;
          else if (t.type === 'MORTAR') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('bounceCount')" style="flex:1" data-desc="Create +1 bouncing sub-projectiles per level">Bounces $${(t.bounceCount+1)*50}</button><button onclick="upgradeTower('fragmentation')" style="flex:1" data-desc="Spawn +1 shrapnel fragments per level">Frags $${(t.fragmentation+1)*50}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Explosion power: 25% increase per level">Power $${t.upgrades.damage*40}</button><button onclick="upgradeTower('range')" style="flex:1" data-desc="Range: 5% increase per level">Range $${t.upgrades.range*25}</button></div>`;
          else if (t.type === 'LASER') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('beamWidth')" style="flex:1" data-desc="Increase beam width by +5 pixels per level">Beam Width $${(t.beamWidth+1)*45}</button><button onclick="upgradeTower('beamDuration')" style="flex:1" data-desc="Extend beam fire time by +3 ticks per level">Beam Dur $${(t.beamDuration+1)*45}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Beam power: 25% increase per level">Power $${t.upgrades.damage*40}</button><button onclick="upgradeTower('range')" style="flex:1" data-desc="Range: 5% increase per level">Range $${t.upgrades.range*25}</button></div>`;
          else if (t.type === 'SUPPORT') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('healPower')" style="flex:1" data-desc="Boost all nearby tower stats: +3% speed/dmg/range per level">Boost Lvl $${(t.healPower+1)*45}</button><button onclick="upgradeTower('range')" style="flex:1" data-desc="Aura range: 5% increase per level">Range $${t.upgrades.range*25}</button></div>`;
          else if (t.type === 'DECOY') h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('decoyHealth')" style="flex:1" data-desc="Decoy max health: +2 per level (base: 5)">Health $${(t.decoyHealth+1)*35}</button><button onclick="upgradeTower('aggroRadius')" style="flex:1" data-desc="Attraction range: +300 pixels per level">Aggro $${(t.aggroRadius+1)*35}</button></div>`;
          else h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('damage')" style="flex:1" data-desc="Damage: 25% increase per level">Power $${t.upgrades.damage*40}</button><button onclick="upgradeTower('range')" style="flex:1" data-desc="Range: 5% increase per level">Range $${t.upgrades.range*25}</button></div>`;
      }
  }
  h += `<button class="remove-btn" onclick="removeTower()" style="width:100%;">SELL $${sellVal}</button></div>`;
  side.innerHTML = h;
}



class Enemy {
  constructor(path, typeKey) {
    const s = ENEMY_TYPES[typeKey];
    this.path = path;
    this.pathIndex = 0;
    this.type = typeKey; // Ensures the string identifier is saved
    this.x = startPos.x * TILE_SIZE + TILE_SIZE / 2;
    this.y = startPos.y * TILE_SIZE + TILE_SIZE / 2;
    this.baseSpeed = s.speed;
    this.speed = s.speed;
    this.color = s.color;
    this.reward = s.reward;
    this.maxHealth = Math.max(1, Math.floor(s.hp * 0.75 * Math.pow(1.25, waveNumber)));
    this.health = this.maxHealth;
    this.armor = s.armor;
    this.meltTicks = 0;
    this.slowTicks = 0;
    this.slowFactor = 1;
    this.alive = true;
    this.isFlying = !!s.isFlying;
    this.isCamo = !!s.isCamo;
    this.isHealer = !!s.isHealer;
    this.isShield = !!s.isShield;
    this.isChameleon = !!s.isChameleon;
    this.isSlime = !!s.isSlime;
    this.isArmored = !!s.isArmored;
    this.isInvisible = !!s.isInvisible;
    this.isRegen = !!s.isRegen;
    this.isSwarm = !!s.isSwarm;
    this.isReverseChameleon = !!s.isReverseChameleon;
    this.isInverse = !!s.isInverse;
    this.isBuffer = !!s.isBuffer;
    this.isStunner = !!s.isStunner;
    this.isBoss = !!s.isBoss;
    this.isHidden = !!s.isHidden;
    this.exposedTicks = 0;
    this.exposedMult = 1;
    this.armorShredTicks = 0;
    this.armorShred = 0;
    this.regenTicks = 0;
    this.immuneTo = null;
    this.immuneTimer = 0;
    // splitImmunityTicks removed (no SPLITTER tower)
    this.spawns = s.spawns || null;
    this.spawnCount = s.spawnCount || 0;
    this.decoyTarget = null; // For DECOY tower attraction
    this.decoyTicks = 0;
    this.decoyIgnoreTicks = 0;
    this.decoyed = false; // once true, enemy will no longer be attracted to decoys
    this.weakTo = this.isReverseChameleon ? getReverseChameleonWeakTower() : null;
    this.auraSpeedMult = 1;
    this.auraArmorBonus = 0;
    this.tempArmorBonus = 0;
    this.lastHitTower = null;

    if (this.isInverse) {
      this.path = Array.isArray(this.path) ? [...this.path].reverse() : this.path;
      this.x = endPos.x * TILE_SIZE + TILE_SIZE / 2;
      this.y = endPos.y * TILE_SIZE + TILE_SIZE / 2;
    }
  }
  takeDamage(dmg, sourceTowerType, sourceTower=null) {
    if (this.isHidden && !(sourceTower && sourceTower.upgrades && sourceTower.upgrades.radar > 0)) return 0;
    if (this.isReverseChameleon && sourceTowerType !== this.weakTo) return 0;
    if (this.isChameleon && this.immuneTimer > 0 && this.immuneTo === sourceTowerType) return 0;

    // Don't take damage if already dead (prevents double-spawning)
    if (!this.alive || this.health <= 0) return 0;

    // Calculate critical strike
    let dmgMultiplier = 1;
    if (sourceTower && sourceTower.critChance && Math.random() < (sourceTower.critChance * 0.05)) {
      // 5% crit chance per level, 2x damage on crit
      dmgMultiplier = 2;
    }

    // Calculate armor penetration from tower
    let armorPenReduction = 0;
    if (sourceTower && sourceTower.armorPen) {
      armorPenReduction = sourceTower.armorPen * 0.5; // 0.5 armor per level
    }

    const effectiveArmor = this.armor + (this.auraArmorBonus || 0) + (this.tempArmorBonus || 0);
    const exposedMult = this.exposedTicks > 0 ? Math.max(1, this.exposedMult || 1) : 1;
    const shreddedArmor = this.armorShredTicks > 0 ? Math.max(0, this.armorShred || 0) : 0;
    let actualDmg = Math.max(0.5, (dmg * dmgMultiplier * exposedMult) - Math.max(0, effectiveArmor - (typeof research !== 'undefined' ? research.piercing : 0) - armorPenReduction - shreddedArmor));
    if (this.isShield) actualDmg = Math.ceil(actualDmg * 0.10);

    this.health -= actualDmg;
    if (sourceTower) this.lastHitTower = sourceTower;
    if (this.isChameleon) { this.immuneTo = sourceTowerType; this.immuneTimer = 180; }

    // Apply FLAME tower melt effect
    if (sourceTowerType === 'FLAME') {
      let baseDuration = 300;
      if (sourceTower && sourceTower.burnDuration) {
        baseDuration += sourceTower.burnDuration * 50; // +50 ticks per level
      }
      this.meltTicks = baseDuration;
    }

    // THE FIX: Trigger death instantly the moment health hits 0, instead of waiting for update()
    if (this.health <= 0) {
        this.triggerDeath();
    }

    return actualDmg;
  }

  // NEW DEDICATED DEATH FUNCTION
  triggerDeath() {
      this.alive = false;
      gold += this.reward + (typeof research !== 'undefined' ? research.bounty : 0);
      spawnParticles(this.x, this.y, this.color, 15, 1.5);

      if (this.isStunner) {
        const targetTower = this.lastHitTower;
        if (targetTower) {
          targetTower.disabledTimer = Math.max(targetTower.disabledTimer || 0, 180);
        }
      }

      // 1. Force the Spawns out immediately
      if (this.spawns && this.spawnCount > 0) {
          for(let i=0; i<this.spawnCount; i++) {
              let spawn = new Enemy(this.path, this.spawns);
              spawn.x = this.x + (Math.random()*16 - 8);
              spawn.y = this.y + (Math.random()*16 - 8);
              spawn.pathIndex = this.pathIndex;
              enemies.push(spawn);
          }
      }

      // 2. Unlock in Bestiary safely
      try {
          if (typeof unlockEnemyInIndex === 'function') {
              unlockEnemyInIndex(this.type);
          }
      } catch (e) {
          console.error("Bestiary error:", e);
      }
  }

  update() {
    if (!this.alive) return;

    if (this.disabledTimer > 0) {
      this.disabledTimer--;
      return;
    }

    this.auraSpeedMult = 1;
    this.auraArmorBonus = 0;
    this.tempArmorBonus = 0;

    if (this.isBuffer) {
      enemies.forEach(other => {
        if (!other.alive) return;
        const dx = other.x - this.x;
        const dy = other.y - this.y;
        const distSq = dx * dx + dy * dy;
        if (distSq <= 180 * 180) {
          other.auraSpeedMult = Math.max(other.auraSpeedMult || 1, 1.2);
          other.auraArmorBonus = Math.max(other.auraArmorBonus || 0, 2);
        }
      });
    }

    this.speed = (this.slowTicks > 0 ? this.baseSpeed * this.slowFactor : this.baseSpeed) * (this.auraSpeedMult || 1);
    if (this.slowTicks > 0) this.slowTicks--;
    if (this.meltTicks > 0) this.meltTicks--;
    if (this.exposedTicks > 0) this.exposedTicks--;
    if (this.armorShredTicks > 0) this.armorShredTicks--;
    if (this.immuneTimer > 0) this.immuneTimer--;

    // Special behavior: Desperator gains speed as it loses health
    if (this.type === 'DESPERATOR') {
      const missingRatio = 1 - (Math.max(0.0001, this.health) / Math.max(1, this.maxHealth));
      // Scale up to +120% speed when near death; is affected by slow/melt adjustments above
      const extra = 1 + (missingRatio * 1.2);
      this.speed = this.speed * extra;
    }

    // REGEN: Heal over time
    if (this.isRegen && frameCount % 30 === 0) {
      this.health = Math.min(this.maxHealth, this.health + 2);
    }
    // splitImmunityTicks removed (no SPLITTER tower)

    if (this.isHealer && frameCount % 60 === 0) {
        spawnParticles(this.x, this.y, '#4CAF50', 5);
        enemies.forEach(e => {
            const dSq = (e.x-this.x)**2 + (e.y-this.y)**2;
            if (e !== this && dSq <= 6400) e.health = Math.min(e.maxHealth, e.health + 5);
        });
    }

    if (!this.path || this.pathIndex >= this.path.length) {
        this.alive = false;
        if (this.pathIndex >= this.path.length) lives--;
        return;
    }

    // Check if attracted to a DECOY tower
    if (this.decoyIgnoreTicks > 0) this.decoyIgnoreTicks--;

    if (this.decoyTarget && (!towers.includes(this.decoyTarget) || this.decoyTicks <= 0)) {
      this.decoyTarget = null;
      this.decoyIgnoreTicks = 180;
    }

    if (this.decoyTarget) {
      this.decoyTicks--;
      const dx = this.decoyTarget.x - this.x;
      const dy = this.decoyTarget.y - this.y;
      const distSq = dx*dx + dy*dy;

      if (distSq < 25) { // Very close to decoy: touch event
        // Mark as decoyed so it can't be lured again
        this.decoyed = true;
        // Damage the decoy tower
        if (this.decoyTarget && this.decoyTarget.isDecoy) {
          this.decoyTarget.health -= 1;
        }
        this.decoyTarget = null;
        this.decoyIgnoreTicks = 999999;
        this.decoyTicks = 0;
        // Immediately set path to real exit so enemy leaves the decoy and heads back to the goal
        try {
          const sx = Math.floor(this.x / TILE_SIZE), sy = Math.floor(this.y / TILE_SIZE);
          const p = findPath(sx, sy) || [{ x: endPos.x, y: endPos.y }];
          this.path = p;
          this.pathIndex = 0;
        } catch (e) {
          // fallback: send directly to end tile
          this.path = [{ x: endPos.x, y: endPos.y }];
          this.pathIndex = 0;
        }
        return;
      } else {
        const d = Math.sqrt(distSq);
        this.x += (dx/d) * this.speed;
        this.y += (dy/d) * this.speed;
        return;
      }
    }

    const target = this.path[this.pathIndex];
    const tx = target.x * TILE_SIZE + TILE_SIZE / 2;
    const ty = target.y * TILE_SIZE + TILE_SIZE / 2;
    const dx = tx - this.x;
    const dy = ty - this.y;
    const distSq = dx*dx + dy*dy;

    if (distSq < this.speed*this.speed) {
        this.pathIndex++;
    } else {
        const d = Math.sqrt(distSq);
        this.x += (dx/d) * this.speed;
        this.y += (dy/d) * this.speed;
    }

    // Failsafe in case health drops below 0 through some passive damage (like melting)
    if (this.health <= 0) {
        this.triggerDeath();
    }
  }


  draw() {
    if (typeof selectedEnemy !== 'undefined' && selectedEnemy === this) { ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, (this.type === 'BOSS' ? 22 : 16) + 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.save();
    ctx.globalAlpha = this.isCamo ? 0.55 : 1.0; ctx.shadowColor = this.color; ctx.shadowBlur = 8;
    ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.beginPath(); ctx.arc(this.x, this.y, this.type === 'BOSS' ? 22 : 16, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = this.slowTicks > 0 ? '#b3e5fc' : this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.type === 'BOSS' ? 20 : 14, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
    if (this.immuneTimer > 0) { ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, 11, 0, Math.PI * 2); ctx.stroke(); }
    if (this.isShield) { ctx.strokeStyle = '#00E5FF'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, 17, 0, Math.PI * 2); ctx.stroke(); }
    if (this.isArmored) { ctx.strokeStyle = '#DDDDDD'; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(this.x, this.y, 18, 0, Math.PI * 2); ctx.stroke(); } // Thick outline for armor
    if (gameSettings.flashing && this.isRegen && frameCount % 10 < 5) { ctx.strokeStyle = '#76FF03'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, 17, 0, Math.PI * 2); ctx.stroke(); }
    if (gameSettings.flashing && this.meltTicks > 0) { ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, 17, 0, Math.PI * 2); ctx.stroke(); }
    if (gameSettings.flashing && this.slowTicks > 0) { ctx.strokeStyle = '#29b6f6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, this.type === 'BOSS' ? 22 : 17, 0, Math.PI * 2); ctx.stroke(); }
    if (this.isReverseChameleon) {
      const weakColor = getTowerButtonColor(this.weakTo);
      ctx.strokeStyle = weakColor;
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.type === 'BOSS' ? 24 : 18, 0, Math.PI * 2);
      ctx.stroke();
      ctx.fillStyle = weakColor;
      ctx.font = 'bold 9px Arial';
      ctx.textAlign = 'center';
      ctx.fillText(this.weakTo ? this.weakTo[0] : '?', this.x, this.y + 3);
      ctx.textAlign = 'left';
    }
    ctx.fillStyle = 'rgba(0,0,0,0.75)'; ctx.fillRect(this.x - 16, this.y - 24, 32, 5); ctx.fillStyle = 'red'; ctx.fillRect(this.x - 16, this.y - 24, 32, 5); ctx.fillStyle = 'lime'; ctx.fillRect(this.x - 16, this.y - 24, (this.health / this.maxHealth) * 32, 5);
    ctx.restore();
  }
}


class Trap {
  constructor(x, y, damage, tower) {
      this.x = x; this.y = y; this.damage = damage; this.tower = tower; this.alive = true;
      // Base radius is 12, scaled by activation area if available
      let baseRadius = 12;
      if (tower && tower.activationArea) {
        baseRadius += tower.activationArea * 4; // +4 pixels per level
      }
      this.radius = baseRadius;
      // Lifespan tracking (0 means infinite, like before)
      this.lifespan = tower && tower.spikeLifespan ? 300 + tower.spikeLifespan * 30 : 0;
      this.age = 0;
  }
  update() {
      // Check lifespan
      if (this.lifespan > 0) {
        this.age++;
        if (this.age >= this.lifespan) {
          this.alive = false;
          return;
        }
      }
      
      for(let i=0; i<enemies.length; i++) {
          let e = enemies[i];
          if (e.isFlying) continue;
          if ((e.x-this.x)**2 + (e.y-this.y)**2 < this.radius*this.radius) {
              this.tower.damageDealt += e.takeDamage(this.damage, 'TRAPPER', this.tower);
              spawnParticles(this.x, this.y, '#FFF', 12, 2.0);
              this.alive = false; break;
          }
      }
  }
  draw() {
      ctx.fillStyle = '#B0BEC5';
      ctx.beginPath(); ctx.arc(this.x, this.y, 8, 0, Math.PI*2); ctx.fill();
      ctx.strokeStyle = '#FFFFFF';
      ctx.lineWidth = 2;
      ctx.beginPath(); ctx.moveTo(this.x - 10, this.y); ctx.lineTo(this.x + 10, this.y); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.x, this.y - 10); ctx.lineTo(this.x, this.y + 10); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.x - 7, this.y - 7); ctx.lineTo(this.x + 7, this.y + 7); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(this.x - 7, this.y + 7); ctx.lineTo(this.x + 7, this.y - 7); ctx.stroke();
      ctx.fillStyle = '#ff1744';
      ctx.beginPath(); ctx.arc(this.x, this.y, 3, 0, Math.PI*2); ctx.fill();
  }
}

class Tower {
  constructor(gx, gy, typeKey) {
    this.gx = gx; this.gy = gy; this.x = gx * TILE_SIZE + TILE_SIZE / 2; this.y = gy * TILE_SIZE + TILE_SIZE / 2; this.type = typeKey;
    this.baseRange = TOWER_TYPES[typeKey].range; this.baseReload = TOWER_TYPES[typeKey].reload; this.baseDamage = TOWER_TYPES[typeKey].damage; this.baseDuration = TOWER_TYPES[typeKey].duration || 0;
    this.range = this.baseRange; this.reloadTime = this.baseReload; this.damage = this.baseDamage; this.duration = this.baseDuration;
    this.color = TOWER_TYPES[typeKey].color; this.level = 1; this.timer = 0; this.targetMode = 'First';
    this.upgrades = { speed: 1, damage: 1, range: 1, duration: 1, radar: 0, amount: 1, lasers: 1 }; 
    if (TOWER_TYPES[typeKey].isTesla) this.upgrades.chainAmount = 1;
    // Specialized upgrades
    this.buffIntensity = 0; this.freezeRadius = 0; this.markDuration = 0; this.markCapacity = 0; this.healPower = 0;
    this.piercing = 0; this.armorPen = 0; this.critChance = 0; this.spreadReduction = 0; this.ammoCapacity = 0;
    this.burnDuration = 0; this.beamWidth = 0; this.piercingPower = 0; this.spikeCount = 0; this.spikeLifespan = 0;
    this.activationArea = 0; this.decoyHealth = 0; this.aggroRadius = 0; this.bounceCount = 0; this.fragmentation = 0;
    this.beamDuration = 0;
    this.meltLevel = 0; this.slowLevel = 0; this.damageDealt = 0;
    this.fireTimer = 0; this.rechargeTimer = 0; this.currentTargets = [];
    this.isRail = !!TOWER_TYPES[typeKey].isRail; this.isFarm = !!TOWER_TYPES[typeKey].isFarm; this.isEngie = !!TOWER_TYPES[typeKey].isEngie; this.isTrapper = !!TOWER_TYPES[typeKey].isTrapper; this.hasSpotter = false;
    this.isSnare = !!TOWER_TYPES[typeKey].isSnare; this.isLaser = !!TOWER_TYPES[typeKey].isLaser; this.isSupport = !!TOWER_TYPES[typeKey].isSupport; this.isDecoy = !!TOWER_TYPES[typeKey].isDecoy; this.isMortar = !!TOWER_TYPES[typeKey].isMortar; this.isTesla = !!TOWER_TYPES[typeKey].isTesla;
    this.isFarmer = !!TOWER_TYPES[typeKey].isFarmer; this.isChemist = !!TOWER_TYPES[typeKey].isChemist; this.isScout = !!TOWER_TYPES[typeKey].isScout;
    this.baseIncome = TOWER_TYPES[typeKey].baseIncome || 0; this.income = this.baseIncome; this.totalGenerated = 0;
    this.totalSpent = getTowerCost(typeKey);
    this.railFireTimer = 0; this.beamEndX = 0; this.beamEndY = 0;
    this.laserBeamTimer = 0; this.laserBeamEndX = 0; this.laserBeamEndY = 0;
    this.flameConeTimer = 0; this.flameConeAngle = 0; this.flameConeEndX = this.x; this.flameConeEndY = this.y; this.flameTarget = null;
    this.teslaArcs = [];
    this.maxConstructs = TOWER_TYPES[typeKey].maxConstructs || 0; this.constructs = []; this.orbitAngle = 0;
    if (this.isFarmer) { this.ammoType = 'BIRDSHOT'; this.chokeType = 'MODIFIED'; this.ammoLocked = false; }
    // DECOY tower health
    if (this.isDecoy) {
      this.maxHealth = 5 + this.decoyHealth * 2;
      this.health = this.maxHealth;
    }
    this.snareMarks = [];
    this.engieBuffTimer = 0;
    this.disabledTimer = 0;
  }
  applyBuffs(allTowers) {
    this.range = this.baseRange; this.damage = this.baseDamage; this.reloadTime = this.baseReload; this.duration = this.baseDuration; this.hasSpotter = false; this.spotterLink = null;
    let speedMod = 1, dmgMod = 1, rangeMod = 1, hasAppliedStatsBuff = false;

    if (this.engieBuffTimer > 0) speedMod *= 0.8;

    // TOWER SYNERGIES
    let snareNearby = allTowers.filter(t => t.type === 'SNARE' && (t.x-this.x)**2 + (t.y-this.y)**2 <= 200*200).length > 0;
    let laserNearby = allTowers.filter(t => t.type === 'LASER' && (t.x-this.x)**2 + (t.y-this.y)**2 <= 200*200).length > 0;
    let supportTower = allTowers.find(t => t.type === 'SUPPORT' && (t.x-this.x)**2 + (t.y-this.y)**2 <= t.range*t.range);
    
    if (snareNearby && !this.isSnare) dmgMod *= 1.15; // +15% damage near SNARE
    if (laserNearby && !this.isLaser) speedMod *= 0.90; // 10% faster fire rate near LASER
    if (supportTower && !this.isSupport) {
      // SUPPORT tower boosts nearby towers: base 8% speed, 8% damage, 12% range
      // healPower increases the full 3% per level
      let supportBoost = 1 + (0.03 * supportTower.healPower);
      speedMod *= 0.88 + (0.03 * supportTower.healPower); // -12% base, +3% per healPower
      dmgMod *= 1.08 + (0.03 * supportTower.healPower);   // +8% base, +3% per healPower
      rangeMod *= 1.12 + (0.03 * supportTower.healPower); // +12% base, +3% per healPower
    }

    allTowers.forEach(t => {
      const distSq = (t.x-this.x)**2 + (t.y-this.y)**2;

      if (t.type === 'BUFF') {
        if (distSq <= t.range*t.range) {
          if (!hasAppliedStatsBuff) {
            let intensityMult = 1 + (t.buffIntensity * 0.15); // +15% per buff intensity level
            speedMod *= Math.max(0.4, 0.95 - (t.upgrades.speed  * 0.02)) * intensityMult;
            dmgMod   *= (1.05 + (t.upgrades.speed * 0.1)) * intensityMult;
            rangeMod *= (1.10 + (t.upgrades.range * 0.05)) * intensityMult;
            hasAppliedStatsBuff = true;
          }
        }
      } else if (t.type === 'SCOUT') {
        if (this.isRail && distSq <= 240*240) {
          this.hasSpotter = true;
          this.spotterLink = t;
        }
        if (distSq <= t.range*t.range) {
          rangeMod *= 1.12 + (t.upgrades.range * 0.04);
        }
      }
    });

    if (this.isFarm) {
      let bestBonus = 0;
      allTowers.forEach(t => {
        if (t.type !== 'FARMER') return;
        const distSq = (t.x-this.x)**2 + (t.y-this.y)**2;
        if (distSq <= t.range*t.range) {
          const ammo = FARMER_AMMO_TYPES[normalizeFarmerAmmoType(t.ammoType || 'BIRDSHOT')] || FARMER_AMMO_TYPES.BIRDSHOT;
          const bonus = 0.25 + (ammo.pellets * 0.03);
          if (bonus > bestBonus) bestBonus = bonus;
        }
      });
      this.income = Math.max(0, Math.floor(this.baseIncome * (1 + bestBonus)));
      return;
    }

    if (TOWER_TYPES[this.type].isBuff) return;
    this.reloadTime *= speedMod; this.damage *= dmgMod; this.range *= rangeMod;
  }

  getEffectiveReloadTime() {
    // Reduce reload time based on ammoCapacity upgrade
    let reloadTime = this.reloadTime;
    if (this.ammoCapacity && this.ammoCapacity > 0) {
      reloadTime *= Math.max(0.3, 1 - (this.ammoCapacity * 0.05)); // Up to 50% faster at 10 levels
    }
    return reloadTime;
  }
  update() {
    if (this.engieBuffTimer > 0) this.engieBuffTimer--;
    if (TOWER_TYPES[this.type].isBuff || this.isScout) return;
    if (this.isRail && !this.hasSpotter) return;

    let effectiveRange = this.range;
    if (TOWER_TYPES[this.type].isDecoy) {
      effectiveRange += this.aggroRadius * 300;
    }
    const r2 = effectiveRange * effectiveRange;
    const distSq = (a) => (a.x-this.x)**2 + (a.y-this.y)**2;

    if (this.isTrapper) {
      this.timer++;
      if (this.timer >= this.reloadTime) {
        let myTraps = traps.filter(t => t.tower === this);
        if (myTraps.length >= 10 + this.level) {
          myTraps[0].alive = false;
        }

        // Spawn multiple traps based on spikeCount
        const spikesToSpawn = 1 + this.spikeCount;
        for (let s = 0; s < spikesToSpawn; s++) {
          let spotX = this.x, spotY = this.y;
          let isFixed = MAP_DATA[currentMapIndex].type === "FIXED";

          if (isFixed) {
            let possible = [];
            let layout = MAP_DATA[currentMapIndex].layout;
            for(let r=0; r<ROWS; r++) {
              for(let c=0; c<COLS; c++) {
                if (layout[r] && layout[r][c] && (layout[r][c] === '1' || layout[r][c] === 'S' || layout[r][c] === 'E')) {
                  let px = c * TILE_SIZE + TILE_SIZE / 2;
                  let py = r * TILE_SIZE + TILE_SIZE / 2;
                  if ((px - this.x)**2 + (py - this.y)**2 <= r2) {
                    possible.push({x: px, y: py});
                  }
                }
              }
            }
            if (possible.length > 0) {
              let pick = possible[Math.floor(Math.random() * possible.length)];
              spotX = pick.x + (Math.random() * 20 - 10);
              spotY = pick.y + (Math.random() * 20 - 10);
            } else {
              isFixed = false;
            }
          }

          if (!isFixed) {
            let angle = Math.random() * Math.PI * 2;
            let rDist = Math.random() * this.range;
            spotX = this.x + Math.cos(angle) * rDist;
            spotY = this.y + Math.sin(angle) * rDist;
          }
          
          traps.push(new Trap(spotX, spotY, this.damage, this));
        }
        
        playSFX('shoot');
        this.timer = 0;
      }
      return;
    }

    if (TOWER_TYPES[this.type].isIce) {
      this.timer++;
      if (this.timer >= this.getEffectiveReloadTime()) {
        let effectiveRange = r2 + (this.freezeRadius * 1000); // +1000 sq per level
        let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= effectiveRange; });
        if (inRange.length > 0) {
          playSFX('hit'); spawnParticles(this.x, this.y, '#b3e5fc', 30, 2.5);
          inRange.forEach(e => { e.slowTicks = 120 + this.slowLevel * 30; e.slowFactor = Math.max(0.1, 0.5 - this.slowLevel * 0.05); });
          this.timer = 0;
        }
      }
      return;
    }

    if (this.isEngie) {
      this.orbitAngle += 0.05;
      while(this.constructs.length < this.maxConstructs) this.constructs.push({timer: 0, buffTimer: 0, x: this.x, y: this.y});
      let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= r2; });
      this.constructs.forEach((c, i) => {
        if (c.buffTimer > 0) c.buffTimer--;
        let a = this.orbitAngle + i * ((Math.PI * 2) / this.maxConstructs);
        c.x = this.x + Math.cos(a) * 18; c.y = this.y + Math.sin(a) * 18;
        c.timer++;
        let cReload = this.reloadTime * (c.buffTimer > 0 ? 0.8 : 1);
        if (c.timer >= cReload && inRange.length > 0) {
          if (this.targetMode === 'First') inRange.sort((a, b) => b.pathIndex - a.pathIndex);
          else if (this.targetMode === 'Last') inRange.sort((a, b) => a.pathIndex - b.pathIndex);
          else if (this.targetMode === 'Strongest') inRange.sort((a, b) => b.health - a.health);
          else if (this.targetMode === 'Weakest') inRange.sort((a, b) => a.health - b.health);
          else if (this.targetMode === 'Random') inRange.sort(() => Math.random() - 0.5);
          else if (this.targetMode === 'Closest') inRange.sort((a,b) => distSq(a) - distSq(b));
          else if (this.targetMode === 'Farthest') inRange.sort((a,b) => distSq(b) - distSq(a));
          else if (this.targetMode === 'Highest Armor') inRange.sort((a,b) => b.armor - a.armor);

          let target = inRange[Math.floor(Math.random() * inRange.length)];
          projectiles.push(new Projectile(c.x, c.y, target, this.damage, 6, this.type, 0, this));
          playSFX('shoot'); c.timer = 0;
        }
      });
      this.timer++;
      if (this.timer >= 60) {
          let validTargets = [];
          towers.forEach(t => { if (t.type === 'BUFF' || t.isFarm) return; if (distSq(t) <= r2) validTargets.push({obj: t, buffTimer: t.engieBuffTimer || 0}); });
          this.constructs.forEach(c => validTargets.push({obj: c, buffTimer: c.buffTimer}));
          validTargets.sort((a,b) => a.buffTimer - b.buffTimer);
          if (validTargets.length > 0 && validTargets[0].buffTimer < 150) { projectiles.push(new Projectile(this.x, this.y, validTargets[0].obj, 0, 4, 'BUFF', 0, this)); this.timer = 0; } else this.timer = 60;
      }
      return;
    }

    if (TOWER_TYPES[this.type].isAccel) {
      if (this.rechargeTimer > 0) { this.rechargeTimer--; return; }
      let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= r2; });
      if (this.fireTimer > 0) {
        if (inRange.length > 0) {
          if (this.targetMode === 'First') inRange.sort((a, b) => b.pathIndex - a.pathIndex); else if (this.targetMode === 'Last') inRange.sort((a, b) => a.pathIndex - b.pathIndex); else if (this.targetMode === 'Strongest') inRange.sort((a, b) => b.health - a.health); else if (this.targetMode === 'Weakest') inRange.sort((a, b) => a.health - b.health); else if (this.targetMode === 'Random') inRange.sort(() => Math.random() - 0.5); else if (this.targetMode === 'Closest') inRange.sort((a,b) => distSq(a) - distSq(b)); else if (this.targetMode === 'Farthest') inRange.sort((a,b) => distSq(b) - distSq(a)); else if (this.targetMode === 'Highest Armor') inRange.sort((a,b) => b.armor - a.armor);

          this.currentTargets = inRange.slice(0, this.upgrades.lasers || 1);

          if (this.fireTimer % 15 === 0) {
              this.currentTargets.forEach(target => {
                  this.damageDealt += target.takeDamage(this.damage, this.type, this);
                  spawnParticles(target.x, target.y, '#E040FB', 8, 2);
              });
              playSFX('hit');
          }
        } else {
            this.currentTargets = [];
        }
        this.fireTimer--;
        if (this.fireTimer <= 0) { this.rechargeTimer = this.reloadTime; this.currentTargets = []; }
        return;
      }
      if (inRange.length > 0) {
          let fireDuration = this.duration;
          if (this.beamDuration && this.beamDuration > 0) {
            fireDuration += this.beamDuration * 3; // +3 ticks per level
          }
          this.fireTimer = fireDuration;
          this.currentTargets = inRange.slice(0, this.upgrades.lasers || 1);
          playSFX('sniper');
      }
      return;
    }

    // NEW TOWERS
    if (TOWER_TYPES[this.type].isSnare) {
      this.timer++;
      if (this.timer >= this.getEffectiveReloadTime()) {
        let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= r2; });
        if (inRange.length > 0) {
          playSFX('hit'); spawnParticles(this.x, this.y, '#9C27B0', 12, 1.2);
          const markCap = 6 + this.markCapacity; // Starts at 6, increases with upgrade
          const markLife = 20 + (this.markDuration * 5); // Base 20 ticks, +5 per upgrade level
          this.snareMarks = inRange.slice(0, markCap).map(e => ({ x: e.x, y: e.y, life: markLife }));
          inRange.forEach(e => { e.slowTicks = markLife; e.slowFactor = 0.001; }); // Freeze duration matches mark duration
          this.timer = 0;
        }
      }
      return;
    }

    if (TOWER_TYPES[this.type].isLaser) {
      this.timer++;
      if (this.timer >= this.getEffectiveReloadTime()) {
        let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= r2; });
        if (inRange.length > 0) {
          playSFX('beam');
          const targets = inRange.slice(0, 5);
          const aim = targets[0];
          this.laserBeamEndX = aim ? aim.x : this.x;
          this.laserBeamEndY = aim ? aim.y : this.y;
          this.laserBeamTimer = 8;
          targets.forEach(e => {
            this.damageDealt += e.takeDamage(this.damage, this.type, this);
            spawnParticles(e.x, e.y, '#00FF00', 5);
          });
          this.timer = 0;
        }
      }
      return;
    }

    if (this.type === 'MINIGUN') {
      this.timer++;
      if (this.timer >= this.getEffectiveReloadTime()) {
        let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= r2; });
        if (inRange.length > 0) {
          inRange.sort((a, b) => distSq(a) - distSq(b));
          const spreadReduction = Math.max(0, this.spreadReduction || 0);
          const pelletCount = 4 + Math.floor((this.ammoCapacity || 0) / 2);
          const poolSize = Math.max(1, Math.min(inRange.length, Math.ceil(inRange.length * Math.max(0.25, 0.75 - spreadReduction * 0.06))));
          const pool = inRange.slice(0, poolSize);
          const spreadArc = Math.max(0.035, 0.32 - spreadReduction * 0.025);
          for (let i = 0; i < pelletCount; i++) {
            const target = pool[Math.floor(Math.random() * pool.length)];
            if (!target) continue;
            const dist = Math.hypot(target.x - this.x, target.y - this.y);
            const closeBonus = Math.max(0.45, 1 - (dist / Math.max(1, this.range)));
            const damage = this.damage * (0.7 + closeBonus * 0.45) * (1 + spreadReduction * 0.02);
            const baseAngle = Math.atan2(target.y - this.y, target.x - this.x);
            const spreadAngle = (Math.random() - 0.5) * spreadArc;
            const shotAngle = baseAngle + spreadAngle;
            const shotDistance = Math.max(40, Math.min(this.range * 1.05, dist * (0.9 + Math.random() * 0.3)));
            const shotX = this.x + Math.cos(shotAngle) * shotDistance;
            const shotY = this.y + Math.sin(shotAngle) * shotDistance;
            const bulletTarget = { x: shotX, y: shotY, alive: false };
            projectiles.push(new Projectile(this.x, this.y, bulletTarget, damage, 11, this.type, 0, this));
          }
          playSFX('shoot');
          this.timer = 0;
        }
      }
      return;
    }

    if (this.isFarmer) {
      this.timer++;
      if (this.timer >= this.getEffectiveReloadTime()) {
        let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= r2; });
        if (inRange.length > 0) {
          if (this.targetMode === 'First') inRange.sort((a, b) => b.pathIndex - a.pathIndex);
          else if (this.targetMode === 'Last') inRange.sort((a, b) => a.pathIndex - b.pathIndex);
          else if (this.targetMode === 'Strongest') inRange.sort((a, b) => b.health - a.health);
          else if (this.targetMode === 'Weakest') inRange.sort((a, b) => a.health - b.health);
          else if (this.targetMode === 'Random') inRange.sort(() => Math.random() - 0.5);
          else if (this.targetMode === 'Closest') inRange.sort((a, b) => distSq(a) - distSq(b));
          else if (this.targetMode === 'Farthest') inRange.sort((a, b) => distSq(b) - distSq(a));
          else if (this.targetMode === 'Highest Armor') inRange.sort((a, b) => b.armor - a.armor);

          const ammo = FARMER_AMMO_TYPES[normalizeFarmerAmmoType(this.ammoType || 'BIRDSHOT')] || FARMER_AMMO_TYPES.BIRDSHOT;
          const pelletCount = ammo.pellets + Math.floor((this.level - 1) / 3);
          const aimTarget = inRange[0];
          const spreadArc = Math.max(0.03, ammo.spread * 1.15);

          for (let i = 0; i < pelletCount; i++) {
            if (!aimTarget) continue;
            const dist = Math.hypot(aimTarget.x - this.x, aimTarget.y - this.y);
            const closeBonus = Math.max(0.45, 1 - (dist / Math.max(1, this.range)));
            const falloff = ammo.falloff || 1;
            const ammoDamage = ammo.damageMult || 1;
            const damage = this.damage * ammoDamage * (0.85 + closeBonus * 0.9) * Math.max(0.3, 1 - Math.max(0, dist - 90) / (this.range * falloff));
            const baseAngle = Math.atan2(aimTarget.y - this.y, aimTarget.x - this.x);
            const spreadAngle = (Math.random() - 0.5) * spreadArc;
            const shotAngle = baseAngle + spreadAngle;
            const shotDistance = Math.max(42, Math.min(this.range * 1.05, dist * (0.9 + Math.random() * 0.45)));
            const shotX = this.x + Math.cos(shotAngle) * shotDistance;
            const shotY = this.y + Math.sin(shotAngle) * shotDistance;
            const pelletTarget = { x: shotX, y: shotY, alive: false };
            const pellet = new Projectile(this.x, this.y, pelletTarget, damage, ammo.speed || 9, this.type, (ammo.splashRadius || 0) / TILE_SIZE, this);
            pellet.farmerAmmo = ammo;
            pellet.farmerAmmoType = normalizeFarmerAmmoType(this.ammoType || 'BIRDSHOT');
            pellet.pelletSize = ammo.pelletSize || 2;
            projectiles.push(pellet);
          }
          playSFX('shoot');
          this.timer = 0;
        }
      }
      return;
    }

    if (this.isChemist) {
      this.timer++;
      if (this.timer >= this.getEffectiveReloadTime()) {
        let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= r2; });
        if (inRange.length > 0) {
          inRange.sort((a, b) => distSq(a) - distSq(b));
          const target = inRange[0];
          projectiles.push(new Projectile(this.x, this.y, target, this.damage, 5.5, this.type, 0, this));
          playSFX('shoot');
          this.timer = 0;
        }
      }
      return;
    }

    // SPLITTER tower removed — no special handling here.

    if (TOWER_TYPES[this.type].isTesla) {
      this.timer++;
      if (this.timer >= this.reloadTime) {
        let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= r2; });
        if (inRange.length > 0) {
          playSFX('beam');
          inRange.sort((a, b) => b.pathIndex - a.pathIndex);
          const chain = [];
          let used = new Set();
          let chainOrigin = { x: this.x, y: this.y };
          let lastTarget = null;
          for (let bounce = 0; bounce < this.upgrades.chainAmount; bounce++) {
            const candidates = inRange.filter(e => !used.has(e) && (!lastTarget || Math.hypot(e.x - chainOrigin.x, e.y - chainOrigin.y) <= 160));
            if (candidates.length === 0) break;
            candidates.sort((a, b) => Math.hypot(a.x - chainOrigin.x, a.y - chainOrigin.y) - Math.hypot(b.x - chainOrigin.x, b.y - chainOrigin.y));
            const target = candidates[0];
            used.add(target);
            const dmg = this.damage * Math.max(0.55, 1 - bounce * 0.12);
            this.damageDealt += target.takeDamage(dmg, this.type, this);
            spawnParticles(target.x, target.y, '#00BCD4', 6, 1.4);
            chain.push({ x1: chainOrigin.x, y1: chainOrigin.y, x2: target.x, y2: target.y, life: 10 });
            chainOrigin = { x: target.x, y: target.y };
            lastTarget = target;
          }
          this.teslaArcs = chain;
          this.laserBeamTimer = 10;
          this.laserBeamEndX = chain.length > 0 ? chain[chain.length - 1].x2 : this.x;
          this.laserBeamEndY = chain.length > 0 ? chain[chain.length - 1].y2 : this.y;
          this.timer = 0;
        }
      }
      return;
    }

    if (TOWER_TYPES[this.type].isSupport) {
      // SUPPORT tower passively boosts all nearby towers
      // visuals: pulsing aura to show it's active
      this.timer++;
      if (this.timer >= 60) {
        spawnParticles(this.x, this.y, '#2196F3', 10, 1.6);
        this.timer = 0;
      }
      return;
    }

    if (TOWER_TYPES[this.type].isDecoy) {
      // Decoy towers attract nearby enemies but don't shoot
      // Enemies path toward the decoy instead of the exit
      let inRange = enemies.filter(e => distSq(e) <= r2);
      inRange.forEach(e => {
        if (e.decoyIgnoreTicks > 0 || e.decoyed) return;
        if (!e.decoyTarget) {
          e.decoyTarget = this;
          e.decoyTicks = 180;
        }
      });
      return;
    }

    if (this.type === 'FLAME') {
      this.timer++;
      if (this.flameConeTimer > 0) this.flameConeTimer--;

      let inRange = enemies.filter(e => {
        if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false;
        return distSq(e) <= r2;
      });

      if (this.flameTarget && (!this.flameTarget.alive || distSq(this.flameTarget) > r2)) {
        this.flameTarget = null;
      }

      if (this.flameTarget && this.flameTarget.alive && distSq(this.flameTarget) <= r2) {
        const followAngle = Math.atan2(this.flameTarget.y - this.y, this.flameTarget.x - this.x);
        this.flameConeAngle = followAngle;
        this.flameConeEndX = this.x + Math.cos(followAngle) * this.range;
        this.flameConeEndY = this.y + Math.sin(followAngle) * this.range;
        this.flameConeTimer = 2;
      }

      if (inRange.length > 0 && this.timer >= this.getEffectiveReloadTime()) {
        if (this.targetMode === 'First') inRange.sort((a, b) => b.pathIndex - a.pathIndex); else if (this.targetMode === 'Last') inRange.sort((a, b) => a.pathIndex - b.pathIndex); else if (this.targetMode === 'Strongest') inRange.sort((a, b) => b.health - a.health); else if (this.targetMode === 'Weakest') inRange.sort((a, b) => a.health - b.health); else if (this.targetMode === 'Random') inRange.sort(() => Math.random() - 0.5); else if (this.targetMode === 'Closest') inRange.sort((a,b) => distSq(a) - distSq(b)); else if (this.targetMode === 'Farthest') inRange.sort((a,b) => distSq(b) - distSq(a)); else if (this.targetMode === 'Highest Armor') inRange.sort((a,b) => b.armor - a.armor);

        const trackedTarget = this.flameTarget && this.flameTarget.alive && inRange.includes(this.flameTarget) ? this.flameTarget : inRange[0];
        if (trackedTarget) {
          this.flameTarget = trackedTarget;
          const flameAngle = Math.atan2(trackedTarget.y - this.y, trackedTarget.x - this.x);
          this.flameConeAngle = flameAngle;
          this.flameConeEndX = this.x + Math.cos(flameAngle) * this.range;
          this.flameConeEndY = this.y + Math.sin(flameAngle) * this.range;

          const coneHalfAngle = 0.44;
          enemies.forEach(e => {
            if (!e.alive) return;
            if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return;
            const dx = e.x - this.x;
            const dy = e.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist > this.range) return;
            let diff = Math.atan2(dy, dx) - flameAngle;
            diff = Math.atan2(Math.sin(diff), Math.cos(diff));
            if (Math.abs(diff) <= coneHalfAngle) {
              const angleFocus = 1 - (Math.abs(diff) / coneHalfAngle);
              const distanceFalloff = Math.max(0.45, 1 - (dist / this.range) * 0.25);
              const damage = this.damage * (0.75 + angleFocus * 0.55) * distanceFalloff;
              this.damageDealt += e.takeDamage(damage, this.type, this);
              spawnParticles(e.x, e.y, '#FF7043', 4, 1.2);
            }
          });

          playSFX('shoot');
          this.flameConeTimer = 10;
          this.timer = 0;
        }
      }
      return;
    }

    this.timer++;
    if (this.timer >= this.getEffectiveReloadTime()) {
      let inRange = enemies.filter(e => {
        const hr = this.type === 'SNIPER' || this.upgrades.radar > 0;
        if ((e.isCamo || e.isFlying) && !hr) return false;
        return distSq(e) <= r2;
      });
      if (inRange.length > 0) {
        if (this.targetMode === 'First') inRange.sort((a, b) => b.pathIndex - a.pathIndex); else if (this.targetMode === 'Last') inRange.sort((a, b) => a.pathIndex - b.pathIndex); else if (this.targetMode === 'Strongest') inRange.sort((a, b) => b.health - a.health); else if (this.targetMode === 'Weakest') inRange.sort((a, b) => a.health - b.health); else if (this.targetMode === 'Random') inRange.sort(() => Math.random() - 0.5); else if (this.targetMode === 'Closest') inRange.sort((a,b) => distSq(a) - distSq(b)); else if (this.targetMode === 'Farthest') inRange.sort((a,b) => distSq(b) - distSq(a)); else if (this.targetMode === 'Highest Armor') inRange.sort((a,b) => b.armor - a.armor);
        const target = inRange[0];
        const splash = TOWER_TYPES[this.type].splashRadius ? TOWER_TYPES[this.type].splashRadius / TILE_SIZE : 0;

        if (this.isRail) {
            playSFX('railgun');
            const angle = Math.atan2(target.y - this.y, target.x - this.x);
            this.beamEndX = this.x + Math.cos(angle) * this.range;
            this.beamEndY = this.y + Math.sin(angle) * this.range;
            this.railFireTimer = 15;

            // Calculate beam width (base 35 pixels, +5 per beamWidth level)
            const beamWidth = 35 + (this.beamWidth ? this.beamWidth * 5 : 0);
            const maxPiercing = this.piercingPower ? this.piercingPower + 1 : 1; // How many enemies can be hit
            let targetsHit = 0;

            enemies.forEach(e => {
                if (targetsHit >= maxPiercing) return; // Stop if hit limit reached
                
                const dx = e.x - this.x;
                const dy = e.y - this.y;
                const beamDx = this.beamEndX - this.x;
                const beamDy = this.beamEndY - this.y;

                const dot = dx * beamDx + dy * beamDy;
                const beamLenSq = beamDx * beamDx + beamDy * beamDy;

                let proj = dot / beamLenSq;
                if (proj >= 0 && proj <= 1) {
                    const closestX = this.x + proj * beamDx;
                    const closestY = this.y + proj * beamDy;
                    const distToBeamSq = (e.x - closestX)**2 + (e.y - closestY)**2;

                    if (distToBeamSq <= beamWidth * beamWidth) {
                        this.damageDealt += e.takeDamage(this.damage, this.type, this);
                        spawnParticles(e.x, e.y, '#00FFFF', 8);
                        targetsHit++;
                    }
                }
            });
        } else {
            projectiles.push(new Projectile(this.x, this.y, target, this.damage, 6, this.type, splash, this));
            if(this.type === 'SNIPER') playSFX('sniper'); else playSFX('shoot');
        }
        this.timer = 0;
      }
    }
  }
  draw() {
    if (this.engieBuffTimer > 0) { ctx.strokeStyle = '#FFC107'; ctx.lineWidth = 2; ctx.strokeRect(this.gx * TILE_SIZE + 1, this.gy * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2); }
    if (this.disabledTimer > 0) { ctx.strokeStyle = '#FFEB3B'; ctx.lineWidth = 3; ctx.strokeRect(this.gx * TILE_SIZE + 1, this.gy * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2); }
    if (selectedTower === this && !this.isFarm) { ctx.strokeStyle = 'rgba(255,255,255,0.3)'; ctx.lineWidth = 1; ctx.beginPath(); ctx.arc(this.x, this.y, this.range, 0, Math.PI * 2); ctx.stroke(); }

    if (this.isRail && this.hasSpotter && this.spotterLink) {
      ctx.strokeStyle = 'rgba(0, 255, 255, 0.4)';
      ctx.lineWidth = 1.5;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.lineTo(this.spotterLink.x, this.spotterLink.y);
      ctx.stroke();
      ctx.setLineDash([]);
    }

    if (gameSettings.flashing && this.type === 'ACCEL' && this.fireTimer > 0 && this.currentTargets && this.currentTargets.length > 0) {
      this.currentTargets.forEach(target => {
        if (target.alive) {
          ctx.strokeStyle = '#E040FB'; ctx.lineWidth = Math.random() * 4 + 2;
          ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(target.x, target.y); ctx.stroke();
          ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
        }
      });
    }
    if (this.isRail && this.railFireTimer > 0) {
      if (gameSettings.flashing) {
        ctx.strokeStyle = '#00FFFF'; ctx.lineWidth = Math.random() * 6 + 2; ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.beamEndX, this.beamEndY); ctx.stroke(); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke();
      }
      this.railFireTimer--;
    }
    if (this.isTesla && this.laserBeamTimer > 0) {
      if (gameSettings.flashing) {
        ctx.save();
        ctx.strokeStyle = '#00BCD4';
        ctx.lineWidth = 3;
        ctx.shadowColor = '#00BCD4';
        ctx.shadowBlur = 14;
        this.teslaArcs.forEach(arc => {
          ctx.beginPath();
          ctx.moveTo(arc.x1, arc.y1);
          ctx.lineTo(arc.x2, arc.y2);
          ctx.stroke();
        });
        ctx.restore();
      }
      this.laserBeamTimer--;
      this.teslaArcs = this.teslaArcs.filter(arc => --arc.life > 0);
    }
    if (this.isLaser && this.laserBeamTimer > 0) {
      if (gameSettings.flashing) {
        ctx.save();
        ctx.strokeStyle = '#00FF00';
        ctx.lineWidth = 4;
        ctx.shadowColor = '#00FF00';
        ctx.shadowBlur = 12;
        ctx.beginPath();
        ctx.moveTo(this.x, this.y);
        ctx.lineTo(this.laserBeamEndX, this.laserBeamEndY);
        ctx.stroke();
        ctx.restore();
      }
      this.laserBeamTimer--;
    }

    if (this.isSnare && this.snareMarks.length > 0) {
      this.snareMarks = this.snareMarks.filter(mark => mark.life > 0);
      this.snareMarks.forEach(mark => {
        mark.life--;
        const alpha = Math.max(0, mark.life / 20);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.strokeStyle = '#9C27B0';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.arc(mark.x, mark.y, 10, 0, Math.PI * 2);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(mark.x - 7, mark.y);
        ctx.lineTo(mark.x + 7, mark.y);
        ctx.moveTo(mark.x, mark.y - 7);
        ctx.lineTo(mark.x, mark.y + 7);
        ctx.stroke();
        ctx.restore();
      });
    }

    if (this.type === 'FLAME' && this.flameConeTimer > 0) {
      const spread = 0.52;
      const leftAngle = this.flameConeAngle - spread;
      const rightAngle = this.flameConeAngle + spread;
      ctx.save();
      ctx.globalAlpha = 0.24;
      ctx.fillStyle = '#FF7043';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.arc(this.x, this.y, this.range, leftAngle, rightAngle);
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = '#FFB74D';
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.globalAlpha = 0.12;
      ctx.fillStyle = '#FFD180';
      ctx.beginPath();
      ctx.moveTo(this.x, this.y);
      ctx.arc(this.x, this.y, this.range * 0.72, leftAngle, rightAngle);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.restore();
    }

    ctx.fillStyle = (this.isRail && !this.hasSpotter) ? '#444' : this.color;
    ctx.fillRect(this.gx * TILE_SIZE + 2, this.gy * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    if (this.isRail && !this.hasSpotter) { ctx.fillStyle = 'red'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center'; ctx.fillText("NO SIGNAL", this.x, this.y - 10); ctx.textAlign = 'left'; }
    if (this.isEngie) { this.constructs.forEach((c) => { ctx.fillStyle = c.buffTimer > 0 ? '#FFF' : '#FFC107'; ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1; ctx.stroke(); }); }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center';
    let label = this.type[0];
    if (TOWER_TYPES[this.type].isBuff) label = 'B';
    else if (this.isRail) label = 'R';
    else if (this.isFarm) label = '$';
    else if (this.isEngie) label = 'E';
    else if (this.isTrapper) label = 'T';
    else if (this.isSnare) label = 'N';
    else if (this.isTesla) label = 'Z';
    ctx.fillText(label, this.x, this.y + 3); ctx.textAlign = 'left';
  }
}
class Projectile {
  constructor(x, y, target, damage, speed, type, splash=0, src=null, splitDepth=0) {
    this.x = x; this.y = y;
    this.target = target;
    this.tx = target.x; this.ty = target.y; // Track last known X and Y
    this.damage = damage; this.speed = speed; this.type = type;
    this.splash = splash; this.active = true; this.alive = true; this.sourceTower = src;
    this.splitDepth = splitDepth;
    this.hitEnemies = new Set(); // Track enemies hit for piercing
    this.isTracer = false; // Used for TRACERS ammo visual effect
  }
  update() {
  if (!this.active) return;

  if (this.target && this.target.alive) {
    this.tx = this.target.x;
    this.ty = this.target.y;
  }

  let dx = this.tx - this.x, dy = this.ty - this.y, dist = Math.hypot(dx, dy);

  // Grace window for newly spawned fragments: move them a bit before running hit/split logic
  if (this.grace && this.grace > 0) {
    this.grace--;
    if (dist > 0) {
      const step = Math.min(this.speed, 6);
      this.x += (dx / dist) * step;
      this.y += (dy / dist) * step;
    }
    return;
  }

  // Define farmerAmmo once so it's available in both impact and travel sections
  const farmerAmmo = this.type === 'FARMER' ? (this.farmerAmmo || FARMER_AMMO_TYPES[this.farmerAmmoType || 'BIRDSHOT']) : null;

  // Calculate impact values outside conditional so they're available in both impact and travel
  const sourceType = this.sourceTower ? this.sourceTower.type : null;
  const impactBonus = farmerAmmo && farmerAmmo.critChance && Math.random() < farmerAmmo.critChance ? (farmerAmmo.critMult || 1.5) : 1;
  const impactDamage = this.damage * impactBonus;
  const impactColor = farmerAmmo ? (farmerAmmo.color || '#ff9800') : '#ff9800';
  const impactParticles = farmerAmmo ? Math.max(1, Math.min(5, farmerAmmo.particleCount || (farmerAmmo.splashRadius ? 4 : (farmerAmmo.burnTicks || farmerAmmo.slowTicks ? 2 : 1)))) : 5;
  if (farmerAmmo && farmerAmmo.tracer) this.isTracer = true;

  if (dist < this.speed) {
    this.active = false;
    this.alive = false;

    // Damage direct target if they're still alive
    if (this.target && this.target.alive) {
      if (this.sourceTower) this.sourceTower.damageDealt += this.target.takeDamage(impactDamage, sourceType, this.sourceTower);
      if (this.type === 'FARMER') applyFarmerAmmoEffects(this.target, this.target.x, this.target.y);
    }

    const applyFarmerAmmoEffects = (enemy, x, y) => {
      if (!farmerAmmo || !enemy || !enemy.alive) return;
      
      // Base effects
      if (farmerAmmo.slowTicks) {
        enemy.slowTicks = Math.max(enemy.slowTicks || 0, farmerAmmo.slowTicks);
        if (typeof farmerAmmo.slowFactor === 'number') enemy.slowFactor = Math.min(enemy.slowFactor || 1, farmerAmmo.slowFactor);
      }
      if (farmerAmmo.burnTicks) {
        enemy.meltTicks = Math.max(enemy.meltTicks || 0, farmerAmmo.burnTicks);
      }
      if (farmerAmmo.exposeTicks) {
        enemy.exposedTicks = Math.max(enemy.exposedTicks || 0, farmerAmmo.exposeTicks);
        enemy.exposedMult = Math.max(enemy.exposedMult || 1, farmerAmmo.exposeMult || 1.1);
      }
      if (farmerAmmo.armorShredTicks) {
        enemy.armorShredTicks = Math.max(enemy.armorShredTicks || 0, farmerAmmo.armorShredTicks);
        enemy.armorShred = Math.max(enemy.armorShred || 0, farmerAmmo.armorShred || 0);
      }
      
      // Ammo type specific effects - only if farmerAmmo is DEFINED
      if (!farmerAmmo.effect) return; // Early return if no special effect
      
      switch(farmerAmmo.effect) {
        case 'stun':
        case 'pepper':
        case 'flash':
        case 'entangle':
        case 'scatter':
          // Stun chance - temporary extreme slowdown
          if (farmerAmmo.stunChance && Math.random() < farmerAmmo.stunChance) {
            enemy.slowTicks = Math.max(enemy.slowTicks, 90);
            enemy.slowFactor = Math.min(enemy.slowFactor || 1, 0.05);
            spawnParticles(x, y, farmerAmmo.effect === 'pepper' ? '#B8E986' : farmerAmmo.effect === 'flash' ? '#FFEB3B' : farmerAmmo.effect === 'entangle' ? '#C8B07A' : '#EAEAEA', 8, 1.3);
          }
          break;
        
        case 'ignite':
          // Dragon's Breath and Exploding Slugs - create fire effect
          if (Math.random() < (farmerAmmo.igniteChance || 0.5)) {
            enemy.meltTicks = Math.max(enemy.meltTicks || 0, 180);
            spawnParticles(x, y, '#FF7043', 12, 1.5);
            spawnParticles(x, y, '#FFB74D', 8, 1.2);
            playSFX('hit');
          }
          break;
        
        case 'explosive':
          // Explosive ammo - area effect visual
          spawnParticles(x, y, '#FF6E40', 15, 1.4);
          spawnParticles(x, y, '#FFB74D', 10, 1.1);
          if (farmerAmmo.burnTicks) {
            enemy.meltTicks = Math.max(enemy.meltTicks || 0, Math.floor(farmerAmmo.burnTicks * 0.7));
          }
          break;
        
        case 'knockback':
          // Buckshot knockback effect
          if (enemy.path && enemy.path.length > 0 && enemy.pathIndex > 0) {
            enemy.pathIndex = Math.max(0, enemy.pathIndex - 1);
          }
          spawnParticles(x, y, '#FFD54F', 6, 1.2);
          break;
        
        case 'bounce':
          // Rubber rounds - mild knockback
          if (enemy.path && enemy.path.length > 0 && enemy.pathIndex > 0 && Math.random() < 0.3) {
            enemy.pathIndex = Math.max(0, enemy.pathIndex - 1);
          }
          spawnParticles(x, y, '#FFB2A1', 4, 1.1);
          break;
        
        case 'shatter':
          // Breaching rounds - armor shatter visual
          spawnParticles(x, y, '#E0E0E0', 10, 1.3);
          break;
        
        case 'shrapnel':
          // Flechettes/Frag rounds - shrapnel spread
          for (let i = 0; i < 3; i++) {
            const angle = (Math.PI * 2 * i) / 3 + (Math.random() - 0.5) * 0.5;
            spawnParticles(x + Math.cos(angle) * 15, y + Math.sin(angle) * 15, '#B0BEC5', 3, 0.9);
          }
          break;
        
        case 'piercing':
          // SLUGS and AP rounds - pure penetration visual
          spawnParticles(x, y, farmerAmmo.color || '#FFFFFF', 5, 1.1);
          break;
        
        case 'tracer':
          // Tracer rounds - already have visual trails
          spawnParticles(x, y, '#FF9A3D', 4, 1.0);
          break;
        
        case 'chaotic':
          // Kitchen Sink - random mix
          const effects = ['#FF7043', '#FFEB3B', '#B8E986', '#00FFFF'];
          spawnParticles(x, y, effects[Math.floor(Math.random() * effects.length)], 6, 1.2);
          break;
        
        case 'accuracy':
          // TARGET load - precision hit visual
          spawnParticles(x, y, '#D8F7FF', 4, 1.1);
          break;
        
        case 'spread':
          // BIRDSHOT - light spray effect
          spawnParticles(x, y, '#FFF3A1', 3, 0.9);
          break;
      }
    };


    // Splash damage always explodes at the coordinates
    if (this.splash > 0) {
      spawnParticles(this.tx, this.ty, impactColor, impactParticles + 1, 1.1);
      enemies.forEach(e => {
        if (e.alive && Math.hypot(e.x - this.tx, e.y - this.ty) <= this.splash * TILE_SIZE) {
          if (this.sourceTower) this.sourceTower.damageDealt += e.takeDamage(impactDamage * 0.5, sourceType, this.sourceTower);
          if (this.type === 'FARMER') applyFarmerAmmoEffects(e, e.x, e.y);
        }
      });
      
      // Create fragment projectiles based on fragmentation upgrade
      if (this.sourceTower && this.sourceTower.fragmentation && this.sourceTower.fragmentation > 0) {
        const fragmentCount = this.sourceTower.fragmentation; // 1 fragment per level
        for (let i = 0; i < fragmentCount; i++) {
          // Spawn fragments in random directions
          const randomEnemy = enemies.filter(e => e.alive && Math.hypot(e.x - this.tx, e.y - this.ty) <= this.splash * TILE_SIZE * 2)[Math.floor(Math.random() * enemies.length)];
          if (randomEnemy) {
            const frag = new Projectile(this.tx, this.ty, randomEnemy, this.damage * 0.25, 5, this.type, 0, this.sourceTower, (this.splitDepth || 0) + 1);
            frag.grace = 5; // Grace period before checking hits
            projectiles.push(frag);
          }
        }
      }
      
      // Create bounce projectiles based on bounceCount upgrade
      if (this.sourceTower && this.sourceTower.bounceCount && this.sourceTower.bounceCount > 0) {
        const bounceTargets = enemies.filter(e => e.alive && Math.hypot(e.x - this.tx, e.y - this.ty) > this.splash * TILE_SIZE && Math.hypot(e.x - this.tx, e.y - this.ty) <= this.splash * TILE_SIZE * 3); // Enemies just outside splash
        for (let i = 0; i < Math.min(this.sourceTower.bounceCount, bounceTargets.length); i++) {
          const bounce = new Projectile(this.tx, this.ty, bounceTargets[i], this.damage * 0.6, 5, this.type, this.splash * 0.5, this.sourceTower, (this.splitDepth || 0) + 1);
          bounce.grace = 3;
          projectiles.push(bounce);
        }
      }
    } else {
      spawnParticles(this.tx, this.ty, impactColor, impactParticles, 1.05);
    }

    if (this.type === 'CHEMIST') {
      acidPools.push(new AcidPool(this.tx, this.ty, TILE_SIZE * 1.2, Math.max(1, Math.floor(this.damage * 0.35)), 240, this.sourceTower));
    }
  } else {
    // Check for collision with ANY enemy while traveling
    const pierceLevel = this.sourceTower && this.sourceTower.piercing ? this.sourceTower.piercing : 0;
    const ammoPierce = farmerAmmo && farmerAmmo.pierceHits ? farmerAmmo.pierceHits : 0;
    const maxPierce = Math.max(1, 1 + pierceLevel + ammoPierce); // Can hit 1 + piercing enemies
    
    for (let enemy of enemies) {
      if (enemy.alive && Math.hypot(enemy.x - this.x, enemy.y - this.y) <= 12 && !this.hitEnemies.has(enemy)) {
        this.hitEnemies.add(enemy);
        // Apply damage normally
        if (this.sourceTower) this.sourceTower.damageDealt += enemy.takeDamage(impactDamage, sourceType, this.sourceTower);
        if (this.type === 'FARMER') applyFarmerAmmoEffects(enemy, enemy.x, enemy.y);

        // Splash damage if applicable
        if (this.splash > 0) {
          spawnParticles(enemy.x, enemy.y, impactColor, impactParticles + 1, 1.1);
          enemies.forEach(e => {
            if (e.alive && Math.hypot(e.x - enemy.x, e.y - enemy.y) <= this.splash * TILE_SIZE) {
              if (this.sourceTower) this.sourceTower.damageDealt += e.takeDamage(impactDamage * 0.5, sourceType, this.sourceTower);
              if (this.type === 'FARMER') applyFarmerAmmoEffects(e, e.x, e.y);
            }
          });
        } else {
          spawnParticles(enemy.x, enemy.y, impactColor, impactParticles, 1.05);
        }
        
        // Stop if piercing limit reached
        if (this.hitEnemies.size >= maxPierce) {
          this.active = false;
          this.alive = false;
          if (this.type === 'CHEMIST') {
            acidPools.push(new AcidPool(this.x, this.y, TILE_SIZE, Math.max(1, Math.floor(this.damage * 0.25)), 180, this.sourceTower));
          }
          return;
        }
      }
    }

    this.x += (dx / dist) * this.speed;
    this.y += (dy / dist) * this.speed;
  }
  }

  draw() {
    // Determine colors based on tower type
    let color = '#ffeb3b'; // default yellow
    let size = this.type === 'MINIGUN' ? 3 : 4;

    if (this.type === 'FARMER' && this.farmerAmmo) {
      color = this.farmerAmmo.color || color;
      size = this.farmerAmmo.pelletSize || size;
    }
    
    // Get the tower type's bullet color
    if (this.type && TOWER_TYPES[this.type] && !(this.type === 'FARMER' && this.farmerAmmo)) {
      let bulletColor = TOWER_TYPES[this.type].bullet;
      if (bulletColor) {
        // Map color names to hex values
        const colorMap = {
          'orange': '#FF9800',
          'white': '#FFFFFF',
          'yellow': '#ffeb3b',
          'red': '#FF5722',
          'black': '#000000',
          'gold': '#FFD700',
          '#FFC107': '#FFC107',
          '#00FFFF': '#00FFFF',
          'none': 'transparent'
        };
        color = colorMap[bulletColor] || bulletColor;
      }
    }
    
    // Increase size for splash weapons
    if (this.splash > 0) {
      size = 6;
    }

    // Draw the projectile
    if (color !== 'transparent') {
      // Ammo-specific visual effects
      if (this.type === 'FARMER' && this.farmerAmmo) {
        // Tracer effect
        if (this.farmerAmmo.tracer) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.85;
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.moveTo(this.x, this.y);
          ctx.lineTo(this.x - (this.tx - this.x) * 0.12, this.y - (this.ty - this.y) * 0.12);
          ctx.stroke();
          ctx.restore();
        }
        
        // Explosive ammo glow
        if (this.farmerAmmo.effect === 'explosive') {
          ctx.save();
          ctx.fillStyle = color;
          ctx.globalAlpha = 0.25;
          ctx.beginPath();
          ctx.arc(this.x, this.y, size * 2.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        
        // Ignite/Dragon's Breath aura
        if (this.farmerAmmo.effect === 'ignite') {
          ctx.save();
          ctx.fillStyle = '#FF7043';
          ctx.globalAlpha = 0.3;
          ctx.beginPath();
          ctx.arc(this.x, this.y, size * 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.restore();
        }
        
        // Stun effect shimmer
        if (['stun', 'pepper', 'flash', 'entangle'].includes(this.farmerAmmo.effect)) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.4;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(this.x, this.y, size * 1.5, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
        
        // Armor-piercing glow
        if (['piercing', 'shatter', 'shrapnel'].includes(this.farmerAmmo.effect)) {
          ctx.save();
          ctx.strokeStyle = color;
          ctx.globalAlpha = 0.6;
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(this.x, this.y, size + 1, 0, Math.PI * 2);
          ctx.stroke();
          ctx.restore();
        }
      }
      
      // Main projectile circle
      ctx.fillStyle = color;
      if (this.type === 'MINIGUN') {
        ctx.save();
        ctx.shadowColor = '#FFFFFF';
        ctx.shadowBlur = 8;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size + 1, 0, Math.PI * 2);
        ctx.fill();
        ctx.lineWidth = 1.5;
        ctx.strokeStyle = '#222';
        ctx.stroke();
        ctx.restore();
      } else {
        ctx.shadowColor = 'transparent';
        ctx.shadowBlur = 0;
        ctx.beginPath();
        ctx.arc(this.x, this.y, size, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }
}


function drawHoverPreview() {
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  if (!buildType || hoverGx < 0 || hoverGy < 0 || (!grid[hoverGy] || grid[hoverGy][hoverGx] !== 0)) return;
  // Prevent showing preview (and prevent builds) on fixed-map 'X' (no-build) tiles
  const curMap = MAP_DATA[currentMapIndex];
  if (curMap && curMap.type === 'FIXED') {
    const cell = curMap.layout && curMap.layout[hoverGy] ? curMap.layout[hoverGy][hoverGx] : null;
    if (cell === 'X') return;
  }
  const px = hoverGx * TILE_SIZE + TILE_SIZE / 2, py = hoverGy * TILE_SIZE + TILE_SIZE / 2, t  = TOWER_TYPES[buildType];
  pCtx.fillStyle = 'rgba(255,255,255,0.07)'; pCtx.fillRect(hoverGx * TILE_SIZE, hoverGy * TILE_SIZE, TILE_SIZE, TILE_SIZE);
  if (!t.isFarm) { pCtx.strokeStyle = t.color + '99'; pCtx.lineWidth = 1.5; pCtx.setLineDash([4, 4]); pCtx.beginPath(); pCtx.arc(px, py, t.range, 0, Math.PI * 2); pCtx.stroke(); pCtx.setLineDash([]); }
  grid[hoverGy][hoverGx] = 1; const testPath = findPath(); grid[hoverGy][hoverGx] = 0;
  if (testPath || t.isFarm || MAP_DATA[currentMapIndex].type === "FIXED") {
    pCtx.strokeStyle = 'rgba(100,255,100,0.35)'; pCtx.lineWidth = 2; pCtx.setLineDash([6, 4]); pCtx.beginPath();
    if (testPath && MAP_DATA[currentMapIndex].type !== "FIXED") { testPath.forEach((p, i) => { const wx = p.x * TILE_SIZE + TILE_SIZE / 2, wy = p.y * TILE_SIZE + TILE_SIZE / 2; if (i === 0) pCtx.moveTo(wx, wy); else pCtx.lineTo(wx, wy); }); pCtx.stroke(); }
    pCtx.setLineDash([]);
  } else { pCtx.fillStyle = 'rgba(255,0,0,0.15)'; pCtx.fillRect(hoverGx * TILE_SIZE, hoverGy * TILE_SIZE, TILE_SIZE, TILE_SIZE); }
}

canvas.addEventListener('mousemove', e => { const rect = canvas.getBoundingClientRect(); hoverGx = Math.floor((e.clientX - rect.left) / TILE_SIZE); hoverGy = Math.floor((e.clientY - rect.top) / TILE_SIZE); drawHoverPreview(); });
canvas.addEventListener('mouseleave', () => { hoverGx = -1; hoverGy = -1; pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height); });

window.startGame = (mIdx) => {
  currentMapIndex = mIdx;
  gameMode = 'STANDARD';
  gameDifficulty = 'NORMAL';
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('game-root').style.display = 'flex';
  const m = MAP_DATA[mIdx];
  COLS = m.cols; ROWS = m.rows;
  canvas.width = COLS * TILE_SIZE; canvas.height = ROWS * TILE_SIZE;
  pCanvas.width = COLS * TILE_SIZE; pCanvas.height = ROWS * TILE_SIZE;
  setupMap(m);
  restartGame();
  // update shop availability based on map type (Decoy only on RANDOM maps)
  if (typeof updateShopAvailability === 'function') updateShopAvailability();
};

// Disable/hide certain shop items depending on map selection
function updateShopAvailability() {
  const btnDecoy = document.getElementById('btn_DECOY');

  if (!btnDecoy) return;
  const isRandom = MAP_DATA[currentMapIndex] && MAP_DATA[currentMapIndex].type === 'RANDOM';
  btnDecoy.disabled = !isRandom;
  btnDecoy.style.display = isRandom ? '' : 'none';
  if (!isRandom) {
    // ensure it's not actively selected
    if (buildType === 'DECOY') {
      buildType = null; selectedTower = null; selectedEnemy = null;
      document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build'));
      updateSelectionUI(); drawHoverPreview();
    }
  }
}
window.showDifficultyScreen = () => {
  document.getElementById('mapMenuButtons').style.display = 'none';
  document.getElementById('difficultyMenuButtons').style.display = 'flex';
};
window.hideDifficultyScreen = () => {
  document.getElementById('mapMenuButtons').style.display = 'flex';
  document.getElementById('difficultyMenuButtons').style.display = 'none';
};
window.startEndlessMode = (difficulty) => {
  gameMode = 'ENDLESS';
  gameDifficulty = difficulty;
  currentMapIndex = 0; // Use Map 1 (random) for endless
  document.getElementById('mainMenu').style.display = 'none';
  document.getElementById('game-root').style.display = 'flex';
  const m = MAP_DATA[0];
  COLS = m.cols; ROWS = m.rows;
  canvas.width = COLS * TILE_SIZE; canvas.height = ROWS * TILE_SIZE;
  pCanvas.width = COLS * TILE_SIZE; pCanvas.height = ROWS * TILE_SIZE;
  setupMap(m);
  endlessStartTime = Date.now();
  restartGame();
  if (typeof updateShopAvailability === 'function') updateShopAvailability();
};
window.returnToMenu = () => { document.getElementById('game-root').style.display = 'none'; document.getElementById('mainMenu').style.display = 'flex'; isPaused = true; };
window.buyResearch = (type) => { const costs = { bounty: 500, piercing: 600, interest: 750 }; if (gold >= costs[type]) { gold -= costs[type]; if (type === 'bounty') research.bounty += 5; if (type === 'piercing') research.piercing += 2; if (type === 'interest') research.interest += 0.02; const btn = document.getElementById('res_' + type); if (btn) { btn.disabled = true; btn.innerText += " [MAX]"; } } };
window.setBuildType = t => { buildType = buildType === t ? null : t; selectedTower = null; selectedEnemy = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); if (buildType) { const btn = document.getElementById('btn_' + buildType); if (btn) btn.classList.add('active-build'); } updateSelectionUI(); drawHoverPreview(); };

// Load a different map while in-game without returning to main menu
window.loadMap = (mIdx) => {
  if (!MAP_DATA[mIdx]) return;
  currentMapIndex = mIdx;
  const m = MAP_DATA[mIdx];
  COLS = m.cols; ROWS = m.rows;
  canvas.width = COLS * TILE_SIZE; canvas.height = ROWS * TILE_SIZE;
  pCanvas.width = COLS * TILE_SIZE; pCanvas.height = ROWS * TILE_SIZE;
  setupMap(m);
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  drawBgCache();
  recalculateAllPaths();
  updateShopAvailability();
};

// Set the current wave number for preview/testing
window.setWaveNumber = (n) => {
  if (isNaN(n) || n < 0) return;
  waveNumber = Math.floor(n);
  const wd = document.getElementById('waveDisplay'); if (wd) wd.innerText = waveNumber;
  updateWavePreview();
};

window.adminLoadMap = (mIdx) => {
  if (!isAdminTestMode) return;
  window.loadMap(mIdx);
  logAdmin(`Loaded map index ${mIdx}`);
  syncAdminPanelInputs();
};

window.adminSetWave = () => {
  if (!isAdminTestMode) return;
  const input = document.getElementById('adminWaveInput');
  const val = input ? parseInt(input.value || '0', 10) : 0;
  window.setWaveNumber(val);
  logAdmin(`Set wave to ${Math.floor(val || 0)}`);
};

window.adminTogglePause = () => {
  if (!isAdminTestMode) return;
  togglePause();
  logAdmin(isPaused ? 'Paused simulation' : 'Resumed simulation');
};

window.adminStartWaveNow = () => {
  if (!isAdminTestMode) return;
  if (!isWaveActive && enemies.length === 0 && enemiesLeftToSpawn === 0) {
    waveNumber++;
    enemiesLeftToSpawn = waveNumber % 10 === 0 ? 1 : 5 + waveNumber;
    spawnTimer = 999;
    isWaveActive = true;
    isPaused = false;
    updateWavePreview();
    logAdmin(`Started wave ${waveNumber}`);
  }
};

window.adminClearEnemies = () => {
  if (!isAdminTestMode) return;
  enemies = [];
  enemiesLeftToSpawn = 0;
  isWaveActive = false;
  logAdmin('Cleared all enemies');
};

window.adminClearTowers = () => {
  if (!isAdminTestMode) return;
  towers = [];
  traps = [];
  selectedTower = null;
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  if (MAP_DATA[currentMapIndex].type === 'FIXED') {
    const layout = MAP_DATA[currentMapIndex].layout;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) if (layout[y] && layout[y][x] && layout[y][x] !== '0') grid[y][x] = 1;
  }
  recalculateAllPaths();
  updateSelectionUI();
  logAdmin('Cleared all towers');
};

window.adminSetSpeed = () => {
  if (!isAdminTestMode) return;
  const sel = document.getElementById('adminSpeedSelect');
  const next = sel ? parseFloat(sel.value || '1') : 1;
  gameSpeed = Math.max(0.1, Math.min(20, next));
  const btn = document.getElementById('speedBtn');
  if (btn) {
    btn.innerText = `${gameSpeed}x`;
    btn.classList.toggle('fast', gameSpeed > 1);
  }
  logAdmin(`Set sim speed to ${gameSpeed}x`);
};

window.adminToggleFreeze = (val) => {
  if (!isAdminTestMode) return;
  adminSettings.freezeEnemies = !!val;
  logAdmin(adminSettings.freezeEnemies ? 'Enemy movement frozen' : 'Enemy movement restored');
};

window.adminApplyEconomy = () => {
  if (!isAdminTestMode) return;
  const g = document.getElementById('adminGoldInput');
  const l = document.getElementById('adminLivesInput');
  gold = Math.max(0, parseInt(g ? g.value : '0', 10) || 0);
  lives = Math.max(1, parseInt(l ? l.value : '1', 10) || 1);
  logAdmin(`Economy set: gold=${gold}, lives=${lives}`);
};

window.adminToggleFreeBuild = (val) => {
  if (!isAdminTestMode) return;
  adminSettings.freeBuild = !!val;
  logAdmin(`Free build ${adminSettings.freeBuild ? 'enabled' : 'disabled'}`);
};

window.adminToggleInstantUpgrade = (val) => {
  if (!isAdminTestMode) return;
  adminSettings.instantUpgrade = !!val;
  logAdmin(`Free upgrades ${adminSettings.instantUpgrade ? 'enabled' : 'disabled'}`);
};

window.adminToggleFullRefund = (val) => {
  if (!isAdminTestMode) return;
  adminSettings.fullRefund = !!val;
  logAdmin(`Full refund ${adminSettings.fullRefund ? 'enabled' : 'disabled'}`);
};

window.adminSetPathMode = () => {
  if (!isAdminTestMode) return;
  const sel = document.getElementById('adminPathMode');
  adminSettings.pathMode = sel ? sel.value : 'random';
  const map = MAP_DATA[currentMapIndex];
  if (map && map.type === 'FIXED' && Array.isArray(map.fixedPaths) && map.fixedPaths.length > 0) {
    if (adminSettings.pathMode === 'path0') map.fixedPath = map.fixedPaths[0] || map.fixedPath;
    if (adminSettings.pathMode === 'path1') map.fixedPath = map.fixedPaths[Math.min(1, map.fixedPaths.length - 1)] || map.fixedPath;
    recalculateAllPaths();
  }
  logAdmin(`Path mode set to ${adminSettings.pathMode}`);
};

window.adminTogglePathOverlay = (val) => {
  if (!isAdminTestMode) return;
  adminSettings.showPaths = !!val;
  logAdmin(`Path overlay ${adminSettings.showPaths ? 'enabled' : 'disabled'}`);
};

window.adminToggleSpawnLoop = (val) => {
  if (!isAdminTestMode) return;
  adminSettings.spawnLoop = !!val;
  adminSettings.spawnLoopCounter = 0;
  const sp = document.getElementById('adminSpawnLoopFrames');
  adminSettings.spawnLoopFrames = Math.max(1, parseInt(sp ? sp.value : '30', 10) || 30);
  logAdmin(`Spawn loop ${adminSettings.spawnLoop ? 'enabled' : 'disabled'} every ${adminSettings.spawnLoopFrames}f`);
};

function buildEnemyFromAdmin(type) {
  const hpMultEl = document.getElementById('adminHpMult');
  const spMultEl = document.getElementById('adminSpeedMult');
  const hpMult = Math.max(0.1, parseFloat(hpMultEl ? hpMultEl.value : '1') || 1);
  const spMult = Math.max(0.1, parseFloat(spMultEl ? spMultEl.value : '1') || 1);
  const forceCamo = !!(document.getElementById('adminSpawnCamo') && document.getElementById('adminSpawnCamo').checked);
  const forceShield = !!(document.getElementById('adminSpawnShield') && document.getElementById('adminSpawnShield').checked);
  const forceArmored = !!(document.getElementById('adminSpawnArmored') && document.getElementById('adminSpawnArmored').checked);

  const p = MAP_DATA[currentMapIndex].type === 'FIXED' ? getFixedMapSpawnPath() : findPath();
  if (!p && type !== 'FLYER') return null;
  const enemy = new Enemy(p || [], type);
  enemy.maxHealth = Math.max(1, Math.floor(enemy.maxHealth * hpMult));
  enemy.health = enemy.maxHealth;
  enemy.baseSpeed = Math.max(0.05, enemy.baseSpeed * spMult);
  enemy.speed = enemy.baseSpeed;
  if (forceCamo) enemy.isCamo = true;
  if (forceShield) enemy.isShield = true;
  if (forceArmored) {
    enemy.isArmored = true;
    enemy.armor += 4;
  }
  return enemy;
}

window.adminSpawnEnemy = () => {
  if (!isAdminTestMode) return;
  const typeSel = document.getElementById('adminEnemyType');
  const countInput = document.getElementById('adminEnemyCount');
  const type = typeSel ? typeSel.value : 'NORMAL';
  const count = Math.max(1, Math.min(100, parseInt(countInput ? countInput.value : '1', 10) || 1));
  if (!ENEMY_TYPES[type]) return;

  let spawned = 0;
  for (let i = 0; i < count; i++) {
    const enemy = buildEnemyFromAdmin(type);
    if (!enemy) continue;
    enemies.push(enemy);
    spawned++;
  }
  if (spawned > 0) {
    isWaveActive = true;
    isPaused = false;
    logAdmin(`Spawned ${spawned} x ${type}`);
  }
};

window.adminSpawnPreset = (preset) => {
  if (!isAdminTestMode) return;
  if (preset === 'boss') {
    for (let i = 0; i < 3; i++) {
      const e = buildEnemyFromAdmin('BOSS');
      if (e) enemies.push(e);
    }
    logAdmin('Spawn preset: boss');
  } else if (preset === 'mixed') {
    ['NORMAL', 'RUNNER', 'TANK', 'FLYER', 'GHOST', 'ARMORED', 'INVISIBLE', 'CHAMELEON'].forEach(t => {
      const e = buildEnemyFromAdmin(t);
      if (e) enemies.push(e);
    });
    logAdmin('Spawn preset: mixed');
  }
  if (enemies.length > 0) {
    isWaveActive = true;
    isPaused = false;
  }
};

window.adminKillSelectedEnemy = () => {
  if (!isAdminTestMode || !selectedEnemy) return;
  if (selectedEnemy.alive) {
    selectedEnemy.alive = false;
    selectedEnemy = null;
    updateSelectionUI();
    logAdmin('Killed selected enemy');
  }
};
window.setTargetMode = (val) => { if (selectedTower) { selectedTower.targetMode = val; updateSelectionUI(); } };
window.upgradeTower = (stat) => {
    const t = selectedTower;
    if (!t) return;

    // Check Max Level
    let lvlMax = t.isFarm ? 5 : 20;
    if (t.level >= lvlMax) return;

    let cost = 0;

    // 1. Calculate the cost based on which stat was chosen
    switch (stat) {
        case 'speed': cost = t.upgrades.speed * (t.type === 'ACCEL' ? 50 : 30); break;
        case 'damage': cost = t.upgrades.damage * (t.type === 'ACCEL' ? 60 : 40); break;
        case 'range': cost = t.upgrades.range * (t.type === 'ACCEL' ? 40 : 25); break;
        case 'duration': cost = t.upgrades.duration * 50; break;
        case 'lasers': cost = 1000 * Math.pow(2, (t.upgrades.lasers || 1) - 1); break;
        case 'amount': cost = t.upgrades.amount * 200; break;
        case 'radar': cost = 150; break;
        case 'melt': cost = (t.meltLevel + 1) * 50; break;
        case 'slow': cost = (t.slowLevel + 1) * 40; break;
        case 'chainAmount': cost = (t.upgrades.chainAmount || 1) * 60; break;
        case 'farm': cost = FARM_UPGRADE_COSTS[t.level]; break;
        // Specialized upgrades
        case 'buffIntensity': cost = (t.buffIntensity + 1) * 35; break;
        case 'freezeRadius': cost = (t.freezeRadius + 1) * 30; break;
        case 'markDuration': cost = (t.markDuration + 1) * 40; break;
        case 'markCapacity': cost = (t.markCapacity + 1) * 45; break;
        case 'healPower': cost = (t.healPower + 1) * 45; break;
        case 'piercing': cost = (t.piercing + 1) * 40; break;
        case 'armorPen': cost = (t.armorPen + 1) * 50; break;
        case 'critChance': cost = (t.critChance + 1) * 50; break;
        case 'spreadReduction': cost = (t.spreadReduction + 1) * 35; break;
        case 'ammoCapacity': cost = (t.ammoCapacity + 1) * 35; break;
        case 'burnDuration': cost = (t.burnDuration + 1) * 40; break;
        case 'beamWidth': cost = (t.beamWidth + 1) * 45; break;
        case 'piercingPower': cost = (t.piercingPower + 1) * 60; break;
        case 'spikeCount': cost = (t.spikeCount + 1) * 45; break;
        case 'spikeLifespan': cost = (t.spikeLifespan + 1) * 45; break;
        case 'activationArea': cost = (t.activationArea + 1) * 40; break;
        case 'decoyHealth': cost = (t.decoyHealth + 1) * 35; break;
        case 'aggroRadius': cost = (t.aggroRadius + 1) * 35; break;
        case 'bounceCount': cost = (t.bounceCount + 1) * 50; break;
        case 'fragmentation': cost = (t.fragmentation + 1) * 50; break;
        case 'beamDuration': cost = (t.beamDuration + 1) * 45; break;
    }

    // Special failsafes for one-off/capped upgrades
    if (stat === 'radar' && (t.upgrades.radar >= 1 || t.type === 'SNIPER')) return;
    if (stat === 'lasers' && (t.upgrades.lasers || 1) >= 5) return;
    if (stat === 'chainAmount' && (t.upgrades.chainAmount || 1) >= 5) return;
    // Cap specialized upgrades at 20
    const specUpgrades = ['buffIntensity', 'freezeRadius', 'markDuration', 'markCapacity', 'healPower', 'piercing', 'armorPen', 'critChance', 'spreadReduction', 'ammoCapacity', 'burnDuration', 'beamWidth', 'piercingPower', 'spikeCount', 'spikeLifespan', 'activationArea', 'decoyHealth', 'aggroRadius', 'bounceCount', 'fragmentation', 'beamDuration'];
    if (specUpgrades.includes(stat) && t[stat] >= 20) return;

    // 2. Execute transaction and apply math
    const freeUpgradeActive = isAdminTestMode && adminSettings.instantUpgrade;
    if (freeUpgradeActive || gold >= cost) {
        if (!freeUpgradeActive) {
          gold -= cost;
          t.totalSpent += cost;
          runStats.spent += cost;
        }

        switch (stat) {
            case 'speed':
                t.baseReload = Math.max(1, Math.floor(t.baseReload * 0.825));
                t.upgrades.speed++;
                break;
            case 'damage':
                t.baseDamage *= 1.30;
                t.upgrades.damage++;
                break;
            case 'range':
                t.baseRange *= 1.2;
                t.upgrades.range++;
                break;
            case 'duration':
                t.baseDuration = Math.round((t.baseDuration || 300) * 1.20);
                t.upgrades.duration++;
                break;
            case 'lasers':
                t.upgrades.lasers = (t.upgrades.lasers || 1) + 1;
                break;
            case 'amount':
                t.upgrades.amount++;
                t.maxConstructs++;
                break;
            case 'radar':
                t.upgrades.radar = 1;
                break;
            case 'melt':
                t.meltLevel++;
                break;
            case 'slow':
                t.slowLevel++;
                break;
            case 'farm':
                // Uses t.level before the global ++ occurs, making the indexing perfectly match your old t.level-1 logic
                t.income = Math.floor(FARM_INCOME_LEVELS[t.level] * (1 + metaTech.farmInc * 0.1));
                break;
            case 'chainAmount':
                t.upgrades.chainAmount = (t.upgrades.chainAmount || 1) + 1;
                break;
            case 'buffIntensity': t.buffIntensity++; break;
            case 'freezeRadius': t.freezeRadius++; break;
            case 'markDuration': t.markDuration++; break;
            case 'markCapacity': t.markCapacity++; break;
            case 'healPower': t.healPower++; break;
            case 'piercing': t.piercing++; break;
            case 'armorPen': t.armorPen++; break;
            case 'critChance': t.critChance++; break;
            case 'spreadReduction': t.spreadReduction++; break;
            case 'ammoCapacity': t.ammoCapacity++; break;
            case 'burnDuration': t.burnDuration++; break;
            case 'beamWidth': t.beamWidth++; break;
            case 'piercingPower': t.piercingPower++; break;
            case 'spikeCount': t.spikeCount++; break;
            case 'spikeLifespan': t.spikeLifespan++; break;
            case 'activationArea': t.activationArea++; break;
            case 'decoyHealth': t.decoyHealth++; t.maxHealth = 5 + t.decoyHealth * 2; t.health = t.maxHealth; break;
            case 'aggroRadius': t.aggroRadius++; break;
            case 'bounceCount': t.bounceCount++; break;
            case 'fragmentation': t.fragmentation++; break;
            case 'beamDuration': t.beamDuration++; break;
        }

        // 3. Apply global logic
        t.level++;
        spawnUpgradeEffect(t.x, t.y, t.color);
        towers.forEach(x => x.applyBuffs(towers));
        updateSelectionUI();
    }
};

// Kept completely separate since it's a free UI toggle, not a gold upgrade
window.cycleTargeting = () => {
    if (selectedTower) {
        const modes = ['First', 'Last', 'Strongest', 'Weakest', 'Random', 'Closest', 'Farthest', 'Highest Armor'];
        selectedTower.targetMode = modes[(modes.indexOf(selectedTower.targetMode) + 1) % modes.length];
        updateSelectionUI();
    }
};






window.removeTower = () => {
    if (!selectedTower) return;
    const refund = (isAdminTestMode && adminSettings.fullRefund)
      ? Math.floor(selectedTower.totalSpent)
      : Math.floor(selectedTower.totalSpent / 2);
    gold += refund;
    grid[selectedTower.gy][selectedTower.gx] = 0;
    towers = towers.filter(t => t !== selectedTower);
    recalculateAllPaths();
    selectedTower = null;
    updateSelectionUI();
};

window.togglePause = () => { isPaused = !isPaused; const btn = document.getElementById('pauseBtn'); if (btn) { btn.innerText = isPaused ? 'RESUME' : 'PAUSE'; btn.style.background = isPaused ? '#FF9800' : ''; } };
window.toggleSpeed = () => { gameSpeed = gameSpeed === 1 ? 2 : 1; const btn = document.getElementById('speedBtn'); if (btn) { btn.innerText = gameSpeed === 2 ? '2×' : '1×'; btn.classList.toggle('fast', gameSpeed === 2); } };
window.toggleMute = () => { const muteBtn = document.getElementById('muteBtn'); if (isMusicPlaying) { bgMusic.pause(); isMusicPlaying = false; if (muteBtn) { muteBtn.innerText = "🎵 PLAY MUSIC"; muteBtn.style.background = ""; } } else { bgMusic.play().catch(err => { console.error("Browser blocked audio:", err); }); isMusicPlaying = true; if (muteBtn) { muteBtn.innerText = "🎵 MUTE MUSIC"; muteBtn.style.background = "#4CAF50"; } } };

window.restartGame = () => {
  gold = 500; lives = 20 + (metaTech.lives * 5); waveNumber = 0; enemiesLeftToSpawn = 0; spawnTimer = 0; waveCooldown = 0;
  enemies = []; towers = []; projectiles = []; particles = []; upgradeEffects = []; traps = []; acidPools = []; farmerPellets = []; minigunPellets = [];
  research = { bounty: 0, piercing: 0, interest: 0.01 };
  selectedTower = null; selectedEnemy = null; buildType = null; isPaused = false; isWaveActive = false; isGameOver = false; gameSpeed = 1; frameCount = 0; research = { bounty: 0, piercing: 0, interest: 0.01 };
  gameStartTime = Date.now();
  runStats = { spent: 0, initialLives: lives, towerTypes: new Set(), maxTowers: 0 };
  const pauseBtn = document.getElementById('pauseBtn'); if (pauseBtn) { pauseBtn.innerText = 'PAUSE'; pauseBtn.style.background = ''; }
  const speedBtn = document.getElementById('speedBtn'); if (speedBtn) { speedBtn.innerText = '1×'; speedBtn.classList.remove('fast'); }
  const intDisp = document.getElementById('interestDisplay'); if (intDisp) intDisp.innerText = '';
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  if (MAP_DATA[currentMapIndex].type === "FIXED") { const layout = MAP_DATA[currentMapIndex].layout; for(let y=0; y<ROWS; y++) for(let x=0; x<COLS; x++) if (layout[y] && layout[y][x] && layout[y][x] !== '0') grid[y][x] = 1; }
  drawBgCache(); updateSelectionUI(); updateWavePreview();
  if (typeof updateShopAvailability === 'function') updateShopAvailability();
};

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect(), clickX = e.clientX - rect.left, clickY = e.clientY - rect.top, gx = Math.floor(clickX / TILE_SIZE), gy = Math.floor(clickY / TILE_SIZE);
  if (e.button === 2) { buildType = null; selectedTower = null; selectedEnemy = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); updateSelectionUI(); drawHoverPreview(); return; }
  let clickedEnemy = null;
  for (let i = enemies.length - 1; i >= 0; i--) if (((enemies[i].x - clickX)**2 + (enemies[i].y - clickY)**2) <= (enemies[i].type === 'BOSS' ? 900 : 484)) { clickedEnemy = enemies[i]; break; }
  if (clickedEnemy) { selectedEnemy = clickedEnemy; selectedTower = null; buildType = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); updateSelectionUI(); return; }
  const existingTower = towers.find(t => t.gx === gx && t.gy === gy);
  if (existingTower) { selectedTower = existingTower; selectedEnemy = null; buildType = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); updateSelectionUI(); return; }
  if (buildType) {
    if (buildType === 'FARM' && towers.filter(t => t.isFarm).length >= 8) { alert("Maximum of 8 Farms allowed!"); buildType = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); updateSelectionUI(); drawHoverPreview(); return; }
    const cost = getTowerCost(buildType);
    const freeBuildActive = isAdminTestMode && adminSettings.freeBuild;
    // Block builds on 'X' (purple no-build) tiles for fixed maps
    const curMap = MAP_DATA[currentMapIndex];
    if (curMap && curMap.type === 'FIXED') {
      const layoutCell = curMap.layout && curMap.layout[gy] ? curMap.layout[gy][gx] : null;
      if (layoutCell === 'X') return;
    }
    if ((freeBuildActive || gold >= cost) && grid[gy] && grid[gy][gx] === 0) {
      if ((gx === startPos.x && gy === startPos.y) || (gx === endPos.x && gy === endPos.y)) return;
      grid[gy][gx] = 1;
      const p = MAP_DATA[currentMapIndex].type === "FIXED"
        ? (MAP_DATA[currentMapIndex].fixedPaths && MAP_DATA[currentMapIndex].fixedPaths.length > 0 ? MAP_DATA[currentMapIndex].fixedPaths[0] : MAP_DATA[currentMapIndex].fixedPath)
        : findPath();
      if (p || TOWER_TYPES[buildType].isFarm) {
        if (!freeBuildActive) gold -= cost;
        towers.push(new Tower(gx, gy, buildType));
        if (!freeBuildActive) runStats.spent += cost;
        runStats.towerTypes.add(buildType);
        runStats.maxTowers = Math.max(runStats.maxTowers, towers.length);
        recalculateAllPaths();
      } else grid[gy][gx] = 0;
      drawHoverPreview();
    } else if (gold < cost) {
      const gD = document.getElementById('goldDisplay'); gD.style.color = 'red'; setTimeout(() => gD.style.color = '#ffd700', 300);
    }
  } else { selectedTower = null; selectedEnemy = null; updateSelectionUI(); }
});
function tick() {
  resetParticleBudget();
  if (lives <= 0 || isPaused) return;
  frameCount++;

  if (isAdminTestMode && adminSettings.spawnLoop) {
    adminSettings.spawnLoopCounter++;
    const loopFramesEl = document.getElementById('adminSpawnLoopFrames');
    if (loopFramesEl) {
      adminSettings.spawnLoopFrames = Math.max(1, parseInt(loopFramesEl.value || '30', 10) || 30);
    }
    if (adminSettings.spawnLoopCounter >= adminSettings.spawnLoopFrames) {
      adminSettings.spawnLoopCounter = 0;
      window.adminSpawnEnemy();
    }
  }

  runStats.maxTowers = Math.max(runStats.maxTowers, towers.length);
  evaluateDailyChallenges();
  checkAchievements();

  if (enemies.length === 0 && enemiesLeftToSpawn === 0) {
    if (isWaveActive) {
      let farmGen = 0;
      towers.forEach(t => { if (t.isFarm) { farmGen += t.income; t.totalGenerated += t.income; } });

      const interest = Math.floor(gold * research.interest);
      const waveBonus = 50 + waveNumber * 10; // Separated this so we can show it!

      gold += waveBonus + interest + farmGen;

      // FIX: Now the UI accurately tells the player about ALL the money they just made
      let dispText = `+$${waveBonus} Wave Bonus | +$${interest} Int`;
      if (farmGen > 0) dispText += ` | +$${farmGen} Farms`;

      const intDisp = document.getElementById('interestDisplay');
      if (intDisp) intDisp.innerText = dispText;

      if (selectedTower && selectedTower.isFarm) updateSelectionUI();
      isWaveActive = false;
      waveCooldown = autoStartWaves ? 30 : 180;
      updateWavePreview();
    } else {
      if (waveCooldown > 0) waveCooldown--;
      else {
          waveNumber++;
          enemiesLeftToSpawn = waveNumber % 10 === 0 ? 1 : 5 + waveNumber;
          spawnTimer = 999;
          isWaveActive = true;
          const intDisp = document.getElementById('interestDisplay');
          if (intDisp) intDisp.innerText = '';
          updateWavePreview();
      }
    }
  }

  if (enemiesLeftToSpawn > 0 && ++spawnTimer >= Math.max(5, 45 - waveNumber * 1.5)) {
    spawnTimer = 0; let type = 'NORMAL';
    if (waveNumber % 10 === 0 && waveNumber > 0) type = getBossVariantForWave(waveNumber);
    else if (waveNumber > 1) {
        const r = Math.random();
        // Spawn probabilities NOW ALIGNED with getWaveComposition()
        if(waveNumber>15&&r>0.85) type='SWARM';
        else if(waveNumber>12&&r>0.8) type='CARRIER';
        else if(waveNumber>12&&r>0.82) type='DESPERATOR';
        else if(waveNumber>10&&r>0.75) type='CHAMELEON';
        else if(waveNumber>14&&r>0.72) type='REVERSECHAMELEON';
        else if(waveNumber>18&&r>0.7) type='ARMORED';
        else if(waveNumber>20&&r>0.65) type='INVISIBLE';
      else if(waveNumber>10&&r>0.62) type='BUFFER';
      else if(waveNumber>8&&r>0.58) type='STUNNER';
        else if(waveNumber>8&&r>0.6) type='SHIELD';
        else if(waveNumber>9&&r>0.55) type='HEALER';
        else if(waveNumber>16&&r>0.52) type='REGEN';
        else if(waveNumber>7&&r>0.5) type='GHOST';
        else if(waveNumber>4&&r>0.4) type='FLYER';
        else if(waveNumber>3&&r>0.3) type='TANK';
      else if(waveNumber>2&&r>0.25) type='INVERSE';
        else if(waveNumber>1&&r>0.2) { if(r > 0.25) type = 'RUNNER'; else type = 'SPEEDDEM'; }
        else type = 'NORMAL';
    }
    const p = MAP_DATA[currentMapIndex].type === "FIXED" ? getFixedMapSpawnPath() : findPath();
    // FIX: Don't spawn enemies without valid paths (except FLYER which can fly anywhere)
    if (!p && type !== 'FLYER') return;
    if (p) enemies.push(new Enemy(p, type));
    else if (type === 'FLYER') enemies.push(new Enemy([], type));
    enemiesLeftToSpawn--;
  }

  towers.forEach(t => t.applyBuffs(towers));
  towers.forEach(t => t.update());

  // Remove dead DECOY towers
  towers = towers.filter(t => {
    if (t.isDecoy && t.health <= 0) {
      if (selectedTower === t) { selectedTower = null; updateSelectionUI(); }
      return false;
    }
    return true;
  });

    enemies = enemies.filter(e => {
      if (!(isAdminTestMode && adminSettings.freezeEnemies)) e.update();
      if (!e.alive && selectedEnemy === e) { selectedEnemy = null; updateSelectionUI(); }
      return e.alive;
    });
  projectiles = projectiles.filter(p => { p.update(); return p.alive; });
  farmerPellets = farmerPellets.filter(pellet => { pellet.update(); return pellet.life > 0; });
  minigunPellets = minigunPellets.filter(pellet => { pellet.update(); return pellet.life > 0; });
  acidPools = acidPools.filter(pool => { pool.update(); return pool.life > 0; });
  traps = traps.filter(tr => { tr.update(); return tr.alive; });
  particles = particles.filter(p => { p.update(); return p.l > 0; });
  upgradeEffects = upgradeEffects.filter(e => { e.update(); return e.life > 0; });
  if (selectedEnemy) updateSelectionUI();
}

function update() {
    requestAnimationFrame(update);
    for (let i = 0; i < gameSpeed; i++) tick();
    const goldDisp = document.getElementById('goldDisplay'); if (goldDisp) goldDisp.innerText = gold;
    const livesDisp = document.getElementById('livesDisplay'); if (livesDisp) livesDisp.innerText = lives;
    const waveDisp = document.getElementById('waveDisplay'); if (waveDisp) waveDisp.innerText = waveNumber;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    if (bgCanvas.width > 0) ctx.drawImage(bgCanvas, 0, 0);

    traps.forEach(tr => tr.draw()); acidPools.forEach(pool => pool.draw()); towers.forEach(t => t.draw()); enemies.forEach(e => e.draw()); projectiles.forEach(p => p.draw()); minigunPellets.forEach(pellet => pellet.draw()); farmerPellets.forEach(pellet => pellet.draw()); particles.forEach(p => p.draw()); upgradeEffects.forEach(e => e.draw());
    drawAdminPathOverlay();

    if (isAdminTestMode) {
      ctx.fillStyle = 'rgba(255,255,255,0.8)';
      ctx.font = 'bold 12px Arial';
      ctx.fillText('ADMIN TEST MODE (progress writes disabled)', 10, 16);
    }

    if (isPaused) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center'; ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2); ctx.textAlign = 'left'; }
    if (lives <= 0) {
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'red'; ctx.font = 'bold 50px Arial'; ctx.textAlign = 'center'; ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2); ctx.textAlign = 'left';
        if (!isGameOver) {
          isGameOver = true;
          metaTech.tokens += waveNumber;
          evaluateDailyChallenges();
          checkAchievements();
          const runTime = Math.floor((Date.now() - gameStartTime) / 1000);
          if (gameMode === 'STANDARD' && waveNumber >= 20) {
            leaderboard.NORMAL.push({ wave: waveNumber, gold: gold, towers: towers.length, time: runTime });
            leaderboard.NORMAL.sort((a, b) => (b.wave - a.wave) || (a.time - b.time));
            leaderboard.NORMAL = leaderboard.NORMAL.slice(0, 5);
          }
          if (gameMode === 'ENDLESS') {
            if (!leaderboard[gameDifficulty]) leaderboard[gameDifficulty] = [];
            leaderboard[gameDifficulty].push({ wave: highestWave, gold: gold, towers: towers.length, time: Math.floor((Date.now() - endlessStartTime) / 1000) });
            leaderboard[gameDifficulty].sort((a,b) => b.wave - a.wave);
            leaderboard[gameDifficulty] = leaderboard[gameDifficulty].slice(0, 5);
          }
          saveMeta();
          saveAchievements();
        }
    }
}

// Initialize Meta
try { loadMeta(); } catch (e) { console.error('loadMeta failed:', e); }
try { loadAchievements(); } catch (e) { console.error('loadAchievements failed:', e); }
try { loadSettings(); } catch (e) { console.error('loadSettings failed:', e); }
try { applyTowerButtonColors(); } catch (e) { console.error('applyTowerButtonColors failed:', e); }
update();

// ==========================================
// --- SAVE & LOAD SYSTEM (LOCALSTORAGE) ---
// ==========================================
let currentSaveContext = 'menu';

window.openSaveModal = (context) => {
    currentSaveContext = context;
    document.getElementById('saveModal').style.display = 'flex';
    updateSaveUI();
    if (context === 'ingame' && !isPaused) togglePause();
};

window.closeSaveModal = () => {
    document.getElementById('saveModal').style.display = 'none';
};

window.updateSaveUI = () => {
    const container = document.getElementById('saveSlotsContainer');
    container.innerHTML = '';
    for (let i = 1; i <= 3; i++) {
        const saveStr = localStorage.getItem('desktop_defender_save_' + i);
        if (saveStr) {
            let save;
            try { save = JSON.parse(saveStr); } catch (e) { save = null; }
            if (save) {
                const mapName = MAP_DATA[save.map] ? MAP_DATA[save.map].name : "Unknown Map";
                container.innerHTML += `
                <div class="save-slot">
                    <div>
                        <div>Slot ${i} - ${mapName}</div>
                        <div>Wave ${save.waveNumber} | Gold: $${save.gold} | Lives: ${save.lives}</div>
                    </div>
                    <div class="actions">
                        ${currentSaveContext === 'ingame' ? `<button class="sys-btn" style="background:#4CAF50!important;" onclick="saveGame(${i})">SAVE</button>` : ''}
                        <button class="sys-btn" style="background:#2196F3!important;" onclick="loadGame(${i})">LOAD</button>
                        <button class="remove-btn" onclick="deleteSave(${i})">X</button>
                    </div>
                </div>`;
                continue;
            }
        }

        container.innerHTML += `
        <div class="save-slot">
            <div style="color:#777; font-style:italic;">Slot ${i} - Empty</div>
            <div class="actions">
                ${currentSaveContext === 'ingame' ? `<button class="sys-btn" style="background:#4CAF50!important;" onclick="saveGame(${i})">SAVE</button>` : ''}
            </div>
        </div>`;
    }
};

window.saveGame = (slot) => {
  if (adminProgressWritesBlocked()) {
    alert('Saving is disabled in admin test mode.');
    logAdmin('Manual save blocked');
    return;
  }
    if (lives <= 0) {
        alert("Cannot save a game that is already over!");
        return;
    }
    if (isWaveActive || enemies.length > 0 || enemiesLeftToSpawn > 0) {
        alert("You can only save between waves! Finish the current wave first.");
        return;
    }

    const state = {
        map: currentMapIndex, gold: gold, lives: lives, waveNumber: waveNumber, research: research,
        runStats: {
          spent: runStats.spent,
          initialLives: runStats.initialLives,
          towerTypes: Array.from(runStats.towerTypes),
          maxTowers: runStats.maxTowers,
          elapsed: Date.now() - gameStartTime
        },
        towers: towers.map(t => ({
            gx: t.gx, gy: t.gy, type: t.type, level: t.level, targetMode: t.targetMode, totalSpent: t.totalSpent,
            damageDealt: t.damageDealt || 0, income: t.income, totalGenerated: t.totalGenerated,
            maxConstructs: t.maxConstructs, upgrades: t.upgrades, meltLevel: t.meltLevel,
          slowLevel: t.slowLevel, baseDamage: t.baseDamage, baseRange: t.baseRange, baseReload: t.baseReload, baseDuration: t.baseDuration,
          chokeType: t.chokeType,
          ammoType: t.ammoType,
          ammoLocked: t.ammoLocked
        })),
        traps: traps.map(tr => ({ x: tr.x, y: tr.y, damage: tr.damage, towerGx: tr.tower ? tr.tower.gx : null, towerGy: tr.tower ? tr.tower.gy : null }))
    };

    localStorage.setItem('desktop_defender_save_' + slot, JSON.stringify(state));
    updateSaveUI();
};

window.loadGame = (slot) => {
    const saveStr = localStorage.getItem('desktop_defender_save_' + slot);
    if (!saveStr) return;

    let state;
    try { state = JSON.parse(saveStr); } catch (e) { alert("Save file is corrupted."); return; }

    closeSaveModal(); startGame(state.map);

    enemies = []; projectiles = []; particles = []; traps = []; towers = []; acidPools = []; farmerPellets = []; minigunPellets = [];
    gold = state.gold; lives = state.lives; waveNumber = state.waveNumber;
    upgradeEffects = [];
    research = { bounty: state.research?.bounty || 0, piercing: state.research?.piercing || 0, interest: state.research?.interest || 0.01 };
    runStats = {
      spent: state.runStats?.spent || 0,
      initialLives: state.runStats?.initialLives || lives,
      towerTypes: new Set(state.runStats?.towerTypes || []),
      maxTowers: state.runStats?.maxTowers || 0
    };
    gameStartTime = Date.now() - (state.runStats?.elapsed || 0);

    state.towers.forEach(data => {
        let t = new Tower(data.gx, data.gy, data.type);
        t.level = data.level; t.targetMode = data.targetMode || 'First'; t.totalSpent = data.totalSpent; t.damageDealt = data.damageDealt || 0;
        if(t.type === 'FARM' && data.income) t.income = data.income; if(t.type === 'FARM' && data.totalGenerated) t.totalGenerated = data.totalGenerated;
        if(t.type === 'ENGIE' && data.maxConstructs) t.maxConstructs = data.maxConstructs;
        if(data.upgrades) t.upgrades = data.upgrades; if(data.meltLevel) t.meltLevel = data.meltLevel; if(data.slowLevel) t.slowLevel = data.slowLevel;
        if (data.baseDamage) t.baseDamage = data.baseDamage; if (data.baseRange) t.baseRange = data.baseRange;
        if (data.baseReload) t.baseReload = data.baseReload; if (data.baseDuration) t.baseDuration = data.baseDuration;
        if (data.ammoType) t.ammoType = normalizeFarmerAmmoType(data.ammoType);
        else t.ammoType = 'BIRDSHOT';
        t.ammoLocked = data.ammoLocked !== undefined ? !!data.ammoLocked : t.ammoType !== 'BIRDSHOT';
        t.chokeType = data.chokeType || 'MODIFIED';
        if (grid[data.gy] && grid[data.gy][data.gx] !== undefined) grid[data.gy][data.gx] = 1;
        towers.push(t);
    });
    if (runStats.towerTypes.size === 0) {
      towers.forEach(t => runStats.towerTypes.add(t.type));
    }
    if (!state.runStats) {
      runStats.spent = towers.reduce((sum, t) => sum + (t.totalSpent || 0), 0);
      runStats.maxTowers = towers.length;
    }

    if (state.traps) {
        state.traps.forEach(trData => {
            let tr = new Trap(trData.x, trData.y, trData.damage, null);
            tr.tower = towers.find(tw => tw.gx === trData.towerGx && tw.gy === trData.towerGy);
            if (tr.tower) { tr.tower = tr.tower; traps.push(tr); }
        });
    }

    towers.forEach(t => { if(t.applyBuffs) t.applyBuffs(towers); });
    if(typeof recalculateAllPaths === 'function') recalculateAllPaths();

    ['bounty', 'piercing', 'interest'].forEach(type => {
        const btn = document.getElementById('res_' + type);
        if (btn) {
            btn.disabled = false; btn.innerText = btn.innerText.replace(" [MAX]", "");
            if ((type === 'bounty' && research.bounty > 0) || (type === 'piercing' && research.piercing > 0) || (type === 'interest' && research.interest > 0.01)) { btn.disabled = true; btn.innerText += " [MAX]"; }
        }
    });

    isPaused = true;
    const pauseBtn = document.getElementById('pauseBtn');
    if (pauseBtn) { pauseBtn.innerText = 'RESUME'; pauseBtn.style.background = '#FF9800'; }
    updateSelectionUI();
};

window.deleteSave = (slot) => {
    if(confirm("Are you sure you want to delete this save? This cannot be undone.")) {
        localStorage.removeItem('desktop_defender_save_' + slot); updateSaveUI();
    }
};

// ==========================================
// --- QOL: HOTKEYS & DYNAMIC TOOLTIPS ---
// ==========================================

// 1. Hotkeys for Shop Selection (Hooks natively into existing buttons!)
document.addEventListener('keydown', (e) => {
    // Only intercept hotkeys when we are actually inside a running game
    if (document.getElementById('game-root').style.display === 'none') return;

    const k = (e.key || '').length === 1 ? e.key.toLowerCase() : e.key;
    if (k === ADMIN_SEQUENCE[adminSeqIndex]) {
      adminSeqIndex++;
      if (adminSeqIndex >= ADMIN_SEQUENCE.length) {
        adminSeqIndex = 0;
        if (!isAdminTestMode) tryUnlockAdminMode();
      }
    } else {
      adminSeqIndex = k === ADMIN_SEQUENCE[0] ? 1 : 0;
    }

    // Look up any shop button that matches the pressed key
    const btn = document.querySelector(`.shop-group button[data-hotkey="${e.key}"]`);
    if (btn) {
        btn.click(); // Fires the native 'setBuildType()' securely!
    }
});

// 2. Event Delegation for Tooltips (Highly Optimized & memory-leak proof)
document.addEventListener('mouseover', (e) => {
    const target = e.target.closest('[data-desc]');
    const tooltip = document.getElementById('shared-tooltip');

    if (target && tooltip) {
        tooltip.innerHTML = target.getAttribute('data-desc');
        tooltip.style.display = 'block';
    }
});

document.addEventListener('mousemove', (e) => {
    const tooltip = document.getElementById('shared-tooltip');

    if (tooltip && tooltip.style.display === 'block') {
        // Keeps the tooltip floating near the cursor without blocking clicks
        tooltip.style.left = (e.pageX + 15) + 'px';
        tooltip.style.top = (e.pageY + 15) + 'px';
    }
});

document.addEventListener('mouseout', (e) => {
    const target = e.target.closest('[data-desc]');
    const tooltip = document.getElementById('shared-tooltip');

    if (target && tooltip) {
        tooltip.style.display = 'none';
    }
});

// ==========================================
// SELF-HEALING BESTIARY LOGIC
// ==========================================

function unlockEnemyInIndex(enemyType) {
    console.log("☠️ Enemy Died! Attempting to unlock:", enemyType);

    if (!enemyType) {
        console.error("❌ No enemyType passed to unlock function!");
        return;
    }

    // Failsafe: Rebuild metaTech from storage if it's currently missing
    if (typeof metaTech === 'undefined' || !metaTech) {
        window.metaTech = JSON.parse(localStorage.getItem('dd_meta')) || { unlockedEnemies: [] };
    }

    // Failsafe: Ensure the array exists inside the save file
    if (!metaTech.unlockedEnemies) {
        metaTech.unlockedEnemies = [];
    }

    // Save to Bestiary
    if (!metaTech.unlockedEnemies.includes(enemyType)) {
        metaTech.unlockedEnemies.push(enemyType);
        localStorage.setItem('dd_meta', JSON.stringify(metaTech));
        console.log("✅ Successfully added to Bestiary. Current unlocks:", metaTech.unlockedEnemies);

        const modal = document.getElementById('enemyIndexModal');
        if (modal && modal.style.display !== 'none') {
            populateEnemyIndex();
        }
    }
}

function openEnemyIndex() {
    if (document.getElementById('game-root').style.display !== 'none' && !isPaused) {
        togglePause();
    }
    populateEnemyIndex();
    document.getElementById('enemyIndexModal').style.display = 'flex';
}

// Settings and UI Functions
let gameSettings = { volume: 30, flashing: true, sound: true };

function loadSettings() {
  gameSettings = parseStoredJson('dd_settings', gameSettings);
  const volumeSlider = document.getElementById('volumeSlider');
  const volDisplay = document.getElementById('volDisplay');
  const flashingToggle = document.getElementById('flashingToggle');
  const soundToggle = document.getElementById('soundToggle');
  if (volumeSlider) volumeSlider.value = gameSettings.volume;
  if (volDisplay) volDisplay.innerText = gameSettings.volume;
  if (flashingToggle) flashingToggle.checked = gameSettings.flashing;
  if (soundToggle) soundToggle.checked = gameSettings.sound;
  bgMusic.volume = gameSettings.volume / 100;
  bgMusic.muted = !gameSettings.sound;
}

function saveSettings() {
  localStorage.setItem('dd_settings', JSON.stringify(gameSettings));
}

window.setVolume = (val) => { gameSettings.volume = val; document.getElementById('volDisplay').innerText = val; bgMusic.volume = val / 100; saveSettings(); };
window.toggleFlashing = (val) => { gameSettings.flashing = val; saveSettings(); };
window.toggleSound = (val) => { gameSettings.sound = val; bgMusic.muted = !val; saveSettings(); };

function showAchievements() {
  const grid = document.getElementById('achievementsGrid');
  grid.innerHTML = '';
  const achievementData = {
    wave25: { name: '25 Wave Milestone', desc: 'Reach wave 25', icon: '📈' },
    wave50: { name: '50 Wave Milestone', desc: 'Reach wave 50', icon: '📈📈' },
    noTowers: { name: 'Skill Mastery', desc: 'Beat wave 10 with no towers', icon: '🧠' },
    allTowers: { name: 'Tower Collector', desc: 'Use every tower type', icon: '🏗' },
    first5Star: { name: 'Perfect Game', desc: 'Complete map without taking damage', icon: '⭐' },
    speedrun: { name: 'Speed Demon', desc: 'Complete in under 5 minutes', icon: '⚡' },
    perfectGame: { name: 'Legendary', desc: 'Endless wave 100', icon: '👑' }
  };

  for (const [key, data] of Object.entries(achievementData)) {
    const unlocked = achievements[key];
    let card = `<div style="border:2px ${unlocked ? '#FFD700' : '#555'}; background:#333; padding:15px; border-radius:8px; text-align:center;">
      <div style="font-size:30px; margin-bottom:10px;">${data.icon}</div>
      <h4 style="color:${unlocked ? '#FFD700' : '#aaa'}; margin-bottom:5px;">${data.name}</h4>
      <p style="font-size:12px; color:#ddd;">${data.desc}</p>
      <span style="font-size:11px; color:${unlocked ? '#4CAF50' : '#ff4444'};">${unlocked ? '✓ UNLOCKED' : 'LOCKED'}</span>
    </div>`;
    grid.innerHTML += card;
  }
}

function showLeaderboard() {
  const content = document.getElementById('leaderboardContent');
  content.innerHTML = '';

  let html = '<div style="text-align:center; color:#FFD700;">';
  ['EASY', 'NORMAL', 'HARD'].forEach(diff => {
    html += `<h3 style="margin-top:20px; color:#${diff === 'EASY' ? '4CAF50' : (diff === 'HARD' ? 'FF6F00' : '2196F3')}">${diff} MODE</h3>`;
    html += '<table style="width:100%; border-collapse: collapse; color:#ddd; margin-top:10px;"><tr style="background:#444;"><th style="padding:8px; text-align:left;">RANK</th><th>WAVE</th><th>GOLD</th><th>TOWERS</th><th>TIME</th></tr>';

    if (leaderboard[diff] && leaderboard[diff].length > 0) {
      leaderboard[diff].forEach((entry, i) => {
        html += `<tr style="border-bottom:1px solid #555;"><td style="padding:8px;">#${i+1}</td><td>${entry.wave}</td><td>$${entry.gold}</td><td>${entry.towers}</td><td>${entry.time}s</td></tr>`;
      });
    } else {
      html += '<tr><td colspan="5" style="padding:15px; color:#888;">No scores yet</td></tr>';
    }
    html += '</table>';
  });
  html += '</div>';
  content.innerHTML = html;
}

function generateDailyChallenge() {
  ensureDailyChallengeState();
  const daySeed = parseInt(dailyChallengeState.dayKey, 10) || parseInt(getCurrentDayKey(), 10);
  return seededShuffle(DAILY_CHALLENGE_TEMPLATES, daySeed)
    .slice(0, 3)
    .map(c => ({ ...c, id: `${dailyChallengeState.dayKey}_${c.key}` }));
}

window.claimDailyChallenge = (challengeId) => {
  ensureDailyChallengeState();
  const challenge = generateDailyChallenge().find(c => c.id === challengeId);
  if (!challenge) return;
  if (!dailyChallengeState.completed[challengeId]) {
    alert('Challenge not complete yet. Keep playing to finish it.');
    return;
  }
  if (dailyChallengeState.claimed[challengeId]) {
    alert('Reward already claimed for this challenge.');
    return;
  }
  dailyChallengeState.claimed[challengeId] = true;
  metaTech.tokens += challenge.reward;
  saveMeta();
  saveAchievements();
  showDailyChallenges();
};

function showDailyChallenges() {
  const content = document.getElementById('challengesContent');
  content.innerHTML = '';
  const dailyChallenges = generateDailyChallenge();
  evaluateDailyChallenges();

  dailyChallenges.forEach(ch => {
    const completed = !!dailyChallengeState.completed[ch.id];
    const claimed = !!dailyChallengeState.claimed[ch.id];
    const btnText = claimed ? 'CLAIMED' : (completed ? 'CLAIM REWARD' : 'IN PROGRESS');
    const btnStyle = claimed ? '#666' : (completed ? '#4CAF50' : '#2196F3');
    let card = `<div style="border:2px #FFD700; background:#333; padding:15px; border-radius:8px;">
      <h4 style="color:#FFD700; margin-bottom:5px;">${ch.name}</h4>
      <p style="font-size:12px; color:#ddd; margin-bottom:10px;">${ch.desc}</p>
      <div style="display:flex; justify-content:space-between; align-items:center;">
        <span style="color:#FFD700; font-weight:bold;">+${ch.reward} Tokens</span>
        <button class="sys-btn" style="background:${btnStyle}!important; padding:5px 15px; font-size:12px;" ${claimed ? 'disabled' : ''} onclick="claimDailyChallenge('${ch.id}')">${btnText}</button>
      </div>
    </div>`;
    content.innerHTML += card;
  });
}

function populateEnemyIndex() {
    const grid = document.getElementById('enemyIndexGrid');
    if (!grid) return;
    grid.innerHTML = '';

    // Failsafe: Load metaTech if it hasn't loaded yet
    if (typeof metaTech === 'undefined' || !metaTech) {
        window.metaTech = JSON.parse(localStorage.getItem('dd_meta')) || { unlockedEnemies: [] };
    }

    const unlocked = metaTech.unlockedEnemies || [];

    for (const typeKey in ENEMY_TYPES) {
        const data = ENEMY_TYPES[typeKey];
        const isUnlocked = unlocked.includes(typeKey);

        // Determine the special ability text based on your enemy tags
        let specialText = "None";
        if (typeKey === 'BOSS') specialText = "Massive HP. Spawns every 10 Waves.";
        else if (data.isArmored) specialText = "High Armor, Takes Reduced Damage";
        else if (data.isInvisible) specialText = "Invisible without Radar";
        else if (data.isRegen) specialText = "Regenerates Health Over Time";
        else if (data.isSwarm && data.spawns) specialText = `Splits into ${data.spawnCount} smaller Swarms`;
        else if (data.isReverseChameleon) specialText = "Immune to everything except one random tower type";
        else if (data.isCamo) specialText = "Invisible without Radar";
        else if (data.isFlying) specialText = "Airborne (Needs Anti-Air)";
        else if (data.isHealer) specialText = "Heals Nearby Enemies";
        else if (data.isShield) specialText = "Takes 90% Less Damage";
        else if (data.isChameleon) specialText = "Adapts Immunity to Towers";
        else if (data.isSlime) specialText = `Splits into ${data.spawnCount} ${data.spawns}s`;
        else if (data.spawns) specialText = `Spawns ${data.spawnCount} ${data.spawns}s on death`;

        if (isUnlocked) {
            // UNLOCKED CARD (Now features the Special text in cyan)
            grid.innerHTML += `
                <div style="border:2px solid ${data.color}; background:#222; padding:10px; border-radius:8px; text-align:center;">
                    <div style="width:30px; height:30px; background:${data.color}; margin:0 auto 10px; border-radius:50%;"></div>
                    <h4 style="color:${data.color}; margin-bottom:5px;">${typeKey}</h4>
                    <p style="font-size:12px; margin:2px 0; color:#ddd;">Base HP: ${data.hp}</p>
                    <p style="font-size:12px; margin:2px 0; color:#ddd;">Speed: ${data.speed}</p>
                    <p style="font-size:12px; margin:2px 0; color:#ddd;">Armor: ${data.armor}</p>
                    <p style="font-size:12px; margin:4px 0; color:#00BCD4; font-weight:bold;">Special: ${specialText}</p>
                    <p style="font-size:12px; margin:2px 0; color:#ffd700;">Reward: $${data.reward}</p>
                </div>
            `;
        } else {
            // LOCKED CARD
            grid.innerHTML += `
                <div style="border:2px dashed #555; background:#222; padding:10px; border-radius:8px; text-align:center; opacity:0.6;">
                    <div style="width:30px; height:30px; background:#111; margin:0 auto 10px; border-radius:50%; border: 1px solid #333;"></div>
                    <h4 style="color:#777; margin-bottom:5px;">???</h4>
                    <p style="font-size:12px; margin:2px 0; color:#555;">Base HP: ???</p>
                    <p style="font-size:12px; margin:2px 0; color:#555;">Speed: ???</p>
                    <p style="font-size:12px; margin:2px 0; color:#555;">Armor: ???</p>
                    <p style="font-size:12px; margin:4px 0; color:#555; font-weight:bold;">Special: ???</p>
                    <p style="font-size:12px; margin:2px 0; color:#555;">Reward: ???</p>
                </div>
            `;
        }
    }
}

    window.openEnemyIndex = openEnemyIndex;
    window.showAchievements = showAchievements;
    window.showLeaderboard = showLeaderboard;
    window.showDailyChallenges = showDailyChallenges;
    window.loadSettings = loadSettings;
    window.showDifficultyScreen = window.showDifficultyScreen;
    window.hideDifficultyScreen = window.hideDifficultyScreen;
    window.startGame = window.startGame;
    window.startEndlessMode = window.startEndlessMode;
    window.returnToMenu = window.returnToMenu;