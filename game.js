const canvas = document.getElementById('gameCanvas'), ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('pathPreviewCanvas'), pCtx = pCanvas.getContext('2d');
const bgCanvas = document.createElement('canvas'), bgCtx = bgCanvas.getContext('2d'); 
const TILE_SIZE = 40; let COLS = 20, ROWS = 12;

const MAP_DATA = [
  { name: "Map 1", type: "RANDOM", cols: 20, rows: 12, start: {x:0, y:6}, end: {x:19, y:6}, layout: [] },
  { name: "Map 2", type: "FIXED", cols: 20, rows: 12, layout: [
      "00000000000000000000","S1111111110000000000","00000000010000000000","00000000011111111100",
      "00000000000000000100","00111111111111111100","00100000000000000000","0011111111111111111E",
      "00000000000000000000","00000000000000000000","00000000000000000000","00000000000000000000" ] },
  { name: "Map 3", type: "FIXED", cols: 16, rows: 12, layout: [
      "S111111111111110","0000000000000010","0111111111110010","0100000000010010","0101111110010010",
      "0101000010010010","010100E110010010","0101000000010010","0101111111110010","0100000000000010",
      "0111111111111110","0000000000000000" ] },
  { name: "Map 4", type: "FIXED", cols: 24, rows: 10, layout: [
      "S11000000000111000000000","001100000001101100000000","000110000011000110000000","000011000110000011000000",
      "000001101100000001100000","000000111000000000110000","000000000000000000011000","000000000000000000001100",
      "00000000000000000000011E","000000000000000000000000" ] },
  { name: "Map 5", type: "FIXED", cols: 18, rows: 14, layout: [
      "S00000000000000000","101111111111111110","101000000000000010","101011111111111010","101010000000001010",
      "101010111111101010","101010100000101010","1010101011E0101010","101010100000101010","101010111111101010",
      "101010000000001010","101011111111111010","101000000000000010","111111111111111110" ] }
];

let currentMapIndex = 0, startPos = {x:0, y:6}, endPos = {x:19, y:6};

let metaTech = { tokens: 0, discount: 0, lives: 0, farmInc: 0, unlockedEnemies: [] };
function loadMeta() { 
    let m = localStorage.getItem('dd_meta'); 
    if(m) {
        metaTech = JSON.parse(m); 
        if (!metaTech.unlockedEnemies) metaTech.unlockedEnemies = [];
    }
    updateMetaUI(); 
}

function saveMeta() { localStorage.setItem('dd_meta', JSON.stringify(metaTech)); updateMetaUI(); }
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

function getTowerCost(type) { return Math.max(10, Math.floor(TOWER_TYPES[type].baseCost * (1 - metaTech.discount * 0.05))); }

function drawBgCache() {
    bgCanvas.width = canvas.width; bgCanvas.height = canvas.height;
    bgCtx.clearRect(0, 0, canvas.width, canvas.height);
    bgCtx.strokeStyle = '#333'; for(let x=0; x<COLS; x++) for(let y=0; y<ROWS; y++) bgCtx.strokeRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    if (MAP_DATA[currentMapIndex] && MAP_DATA[currentMapIndex].type === "FIXED") {
      bgCtx.fillStyle = '#2c2c2c'; const layout = MAP_DATA[currentMapIndex].layout;
      for(let y=0; y<ROWS; y++) for(let x=0; x<COLS; x++) if (layout[y] && layout[y][x] && (layout[y][x] === '1' || layout[y][x] === 'E' || layout[y][x] === 'S')) bgCtx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
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
    let q = [[s.x, s.y, []]], vis = new Set([`${s.x},${s.y}`]);
    while(q.length > 0) {
        let [x, y, p] = q.shift(), cur = [...p, {x,y}];
        if (x===e.x && y===e.y) { m.fixedPath = cur; return; }
        [{x:x+1,y}, {x:x-1,y}, {x,y:y+1}, {x,y:y-1}, {x:x+1,y:y+1}, {x:x+1,y:y-1}, {x:x-1,y:y+1}, {x:x-1,y:y-1}].forEach(n => {
            if(n.x>=0 && n.x<m.cols && n.y>=0 && n.y<m.rows && (m.layout[n.y][n.x]==='1'||m.layout[n.y][n.x]==='E') && !vis.has(`${n.x},${n.y}`)) { vis.add(`${n.x},${n.y}`); q.push([n.x, n.y, cur]); }
        });
    } m.fixedPath = [];
}

const bgMusic = new Audio('bgm.mp3'); bgMusic.loop = true; bgMusic.volume = 0.3;
let isMusicPlaying = false, audioCtx = null;

function playSFX(t) {
  if (!isMusicPlaying) return; 
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
  osc.connect(gain); gain.connect(audioCtx.destination);
  const now = audioCtx.currentTime;
  const cf = {'shoot':{t:'square',f1:400,f2:100,g:0.02,d:0.1}, 'sniper':{t:'sawtooth',f1:150,f2:40,g:0.05,d:0.3},
    'explosion':{t:'square',f1:100,f2:20,g:0.08,d:0.4}, 'hit':{t:'triangle',f1:300,f2:500,g:0.01,d:0.05,r:'l'},
    'railgun':{t:'sawtooth',f1:800,f2:100,g:0.08,d:0.5}}[t];
  if(!cf) return;
  osc.type = cf.t; osc.frequency.setValueAtTime(cf.f1, now); osc.frequency.exponentialRampToValueAtTime(cf.f2, now+cf.d);
  gain.gain.setValueAtTime(cf.g, now);
  if(cf.r==='l') gain.gain.linearRampToValueAtTime(0.001, now+cf.d); else gain.gain.exponentialRampToValueAtTime(0.001, now+cf.d);
  osc.start(now); osc.stop(now+cf.d);
}

let particles = [];
class Particle {
  constructor(x, y, c, s = 1) {
    this.x=x; this.y=y; this.c=c; const a = Math.random()*Math.PI*2, sp = (Math.random()*2+1)*s;
    this.vx=Math.cos(a)*sp; this.vy=Math.sin(a)*sp; this.l=1.0; this.d=Math.random()*0.05+0.02;
  }
  update() { this.x+=this.vx; this.y+=this.vy; this.l-=this.d; }
  draw() { ctx.globalAlpha=Math.max(0,this.l); ctx.fillStyle=this.c; ctx.fillRect(this.x,this.y,3,3); ctx.globalAlpha=1.0; }
}
const spawnParticles = (x,y,c,n,s=1) => { for(let i=0; i<n; i++) particles.push(new Particle(x,y,c,s)); };

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
  FARM:    { color: '#8BC34A', range: 0,   reload: 0,   damage: 0,    baseCost: 250, isFarm: true,      baseIncome: 50 }
};

const ENEMY_TYPES = {
  NORMAL:    { color: '#9C27B0', speed: 1.2, hp: 10,  armor: 0, reward: 15  },
  RUNNER:    { color: '#FFEB3B', speed: 2.8, hp: 6,   armor: 0, reward: 10  },
  TANK:      { color: '#8B4513', speed: 0.6, hp: 30,  armor: 3, reward: 40  },
  FLYER:     { color: '#E0E0E0', speed: 1.5, hp: 8,   armor: 0, reward: 20, isFlying: true },
  GHOST:     { color: '#9E9E9E', speed: 1.1, hp: 10,  armor: 0, reward: 25, isCamo: true },
  HEALER:    { color: '#4CAF50', speed: 1.0, hp: 15,  armor: 1, reward: 30, isHealer: true },
  CARRIER:   { color: '#607D8B', speed: 0.5, hp: 40,  armor: 2, reward: 50, spawns: 'RUNNER', spawnCount: 10 },
  SHIELD:    { color: '#00BCD4', speed: 1.3, hp: 12,  armor: 0, reward: 30, isShield: true }, 
  CHAMELEON: { color: '#E91E63', speed: 1.1, hp: 40,  armor: 1, reward: 35, isChameleon: true },
  SLIME:     { color: '#8BC34A', speed: 0.7, hp: 60,  armor: 0, reward: 45, isSlime: true, spawns: 'RUNNER', spawnCount: 3 },
  BOSS:      { color: '#111111', speed: 0.4, hp: 300, armor: 8, reward: 200 }
};

const WAVE_COLORS = { NORMAL: '#9C27B0', RUNNER: '#FFEB3B', TANK: '#8B4513', FLYER: '#E0E0E0', GHOST: '#9E9E9E', HEALER: '#4CAF50', CARRIER: '#607D8B', SHIELD: '#00BCD4', CHAMELEON: '#E91E63', SLIME: '#8BC34A', BOSS: '#FF0000' };

let gold=10000, lives=20, waveNumber=0, buildType=null, selectedTower=null, selectedEnemy=null, enemiesLeftToSpawn=0, spawnTimer=0, waveCooldown=0;
let isPaused=true, isWaveActive=false, isGameOver=false, gameSpeed=1, hoverGx=-1, hoverGy=-1, frameCount=0;
let autoStartWaves = false;
window.toggleAutoStart = (val) => autoStartWaves = val;

const FARM_UPGRADE_COSTS = [0, 200, 400, 700, 1200], FARM_INCOME_LEVELS = [50, 100, 200, 350, 500];
let research = { bounty: 0, piercing: 0, interest: 0.01 };
let grid = Array.from({ length: 15 }, () => Array(24).fill(0));
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
  if (wNum % 10 === 0 && wNum > 0) return { BOSS: 1 };
  const comp = { NORMAL: 0, RUNNER: 0, TANK: 0, FLYER: 0, GHOST: 0, HEALER: 0, CARRIER: 0, SHIELD: 0, CHAMELEON: 0, SLIME: 0 };
  for(let i=0; i<5+wNum; i++) {
    let r = Math.random();
    if (wNum>15&&r>0.9) comp.SLIME++; else if(wNum>12&&r>0.85) comp.CARRIER++; else if(wNum>10&&r>0.75) comp.CHAMELEON++; 
    else if(wNum>8&&r>0.65) comp.SHIELD++; else if(wNum>9&&r>0.55) comp.HEALER++; else if(wNum>7&&r>0.5) comp.GHOST++;
    else if(wNum>4&&r>0.4) comp.FLYER++; else if(wNum>3&&r>0.3) comp.TANK++; else if(wNum>1&&r>0.2) comp.RUNNER++; else comp.NORMAL++;
  } return comp;
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
  const isF = ty.isFarm, isB = ty.isBuff, isA = ty.isAccel, isR = ty.isRail, isE = ty.isEngie, isI = ty.isIce, isT = ty.isTrapper;
  
  const sellVal = Math.floor(t.totalSpent / 2);
  const canAir = (t.type==='SNIPER'||t.upgrades.radar>0) ? 'Yes' : 'No';
  const airCol = (t.type==='SNIPER'||t.upgrades.radar>0) ? '#00E676' : '#ff4444';
  const rStr = (t.type==='SNIPER'||t.upgrades.radar>0) ? `<span style="color:#00E676;">Active</span>` : `<span style="color:#aaa;">None</span>`;

  let lvlMax = isF ? 5 : 20;
  
  let h = `<h3 style="border-bottom:2px solid ${t.color};padding-bottom:5px;">${t.type}</h3>${row('Level:', t.level + ` / ${lvlMax}`)}${row('Sell:', `$${sellVal}`, '#ffd700')}<br>`;
  
  if (isF) h += row('Income:', `+$${t.income}/wave`, '#FFD700') + row('Total Gen:', `$${t.totalGenerated}`, '#FFD700') + row('Limit:', `${towers.filter(x=>x.isFarm).length} / 8`);
  else if (isB) h += row('Aura Radius:', t.range.toFixed(1)) + row('Buffing:', 'All Stats', '#FFD700');
  else if (isE) h += row('Constructs:', `${t.constructs.length} / ${t.maxConstructs}`, '#FFC107') + row('C. Dmg:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('C. Rng:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('C. Rate:', `${(60/t.reloadTime).toFixed(1)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Buff Dur:', '5s', '#FFC107') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700');
  else if (isI) h += row('Range:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('Tick Rate:', `${(60/t.reloadTime).toFixed(2)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Slow Lvl:', t.slowLevel, '#29b6f6');
  else if (isA) h += row('Damage:', `${t.damage.toFixed(1)}/tk`, t.damage>t.baseDamage?'#FFD700':'white') + row('Range:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('Downtime:', `${(t.reloadTime/60).toFixed(1)}s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Beam Time:', `${((t.baseDuration || t.duration)/60).toFixed(1)}s`, '#FFD700') + row('Targets:', t.upgrades.lasers || 1, (t.upgrades.lasers||1)>1?'#FFD700':'white') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700');
  else if (isT) h += row('Trap Dmg:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('Range:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('Throw Rate:', `${(60/t.reloadTime).toFixed(1)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Sensors:', rStr) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700');
  else {
    if (isR && !t.hasSpotter) h += `<div style="color:#ff4444; font-weight:bold; text-align:center;">OFFLINE: NEEDS SPOTTER</div>`;
    h += row('Damage:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('Range:', t.range.toFixed(1), t.range>t.baseRange?'#FFD700':'white') + row('Fire Rate:', `${(60/t.reloadTime).toFixed(1)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700');
    if (ty.isFlame) h += row('Melt Lvl:', t.meltLevel, '#FF5722');
  }

  h += `<div class="upgrades-section" style="margin-top:10px; border-top:1px solid #555; padding-top:10px; display:flex; flex-direction:column; gap:4px;">`;
  
  if (!isF && !isB && !isI && !isT) {
      h += `<select onchange="setTargetMode(this.value)" style="background:#222; color:white; padding:4px; border:1px solid #555; margin-bottom:4px;">
              ${['First', 'Last', 'Strongest', 'Weakest', 'Random', 'Closest', 'Farthest', 'Highest Armor'].map(m => `<option value="${m}" ${t.targetMode===m?'selected':''}>Target: ${m}</option>`).join('')}
            </select>`;
  }

  if (t.level >= lvlMax) {
      h += `<button style="width:100%; opacity:0.5; padding:8px 0; margin-bottom:4px; font-weight:bold;" disabled>MAX LEVEL (${lvlMax})</button>`;
  } else {
      let rB = (!isF && !isB) ? (t.type==='SNIPER' ? `<button class="radar-btn" style="flex:1;opacity:0.5;">Radar (Native)</button>` : (t.upgrades.radar>0 ? `<button class="radar-btn" style="flex:1;opacity:0.5;">Radar (MAX)</button>` : `<button class="radar-btn" onclick="upgradeTower('radar')" style="flex:1;">Radar $150</button>`)) : '';

      if (isF) h += `<button class="farm-btn" onclick="upgradeTower('farm')" style="margin-bottom:4px;">Upgrade Yield $${FARM_UPGRADE_COSTS[t.level]}</button>`;
      else if (isB) h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('speed')" style="flex:1">Potency $${t.upgrades.speed*30}</button><button onclick="upgradeTower('range')" style="flex:1">Aura Rng $${t.upgrades.range*25}</button></div>`;
      else if (isE) h += `<button onclick="upgradeTower('amount')" style="margin-bottom:4px;">Add Construct $${t.upgrades.amount*200}</button><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('speed')" style="flex:1">Fire Rate $${t.upgrades.speed*30}</button><button onclick="upgradeTower('damage')" style="flex:1">Damage $${t.upgrades.damage*40}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('range')" style="flex:1">Range $${t.upgrades.range*25}</button>${rB}</div>`;
      else if (isI) h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('speed')" style="flex:1">Tick Rate $${t.upgrades.speed*30}</button><button onclick="upgradeTower('range')" style="flex:1">Range $${t.upgrades.range*25}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;">${rB}<button class="ice-btn" onclick="upgradeTower('slow')" style="flex:1">Slow Pwr $${(t.slowLevel+1)*40}</button></div>`;
      else if (isA) {
          let laserCost = 1000 * Math.pow(2, (t.upgrades.lasers || 1) - 1);
          let laserBtn = (t.upgrades.lasers || 1) >= 5 ? `<button class="accel-choice" style="width:100%;opacity:0.5;margin-bottom:4px;" disabled>Targets (MAX)</button>` : `<button class="accel-choice" onclick="upgradeTower('lasers')" style="width:100%;margin-bottom:4px;">Extra Laser $${laserCost}</button>`;
          h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('speed')" style="flex:1">Recharge $${t.upgrades.speed*50}</button><button onclick="upgradeTower('damage')" style="flex:1">Power $${t.upgrades.damage*60}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('range')" style="flex:1">Range $${t.upgrades.range*40}</button><button class="accel-choice" onclick="upgradeTower('duration')" style="flex:1">Duration $${t.upgrades.duration*50}</button></div>${laserBtn}<div style="display:flex;gap:4px;margin-bottom:4px;">${rB}</div>`;
      }
      else {
          h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('speed')" style="flex:1">Speed $${t.upgrades.speed*30}</button><button onclick="upgradeTower('damage')" style="flex:1">Power $${t.upgrades.damage*40}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeTower('range')" style="flex:1">Range $${t.upgrades.range*25}</button>${rB}</div>`;
          if (ty.isFlame) h += `<button class="flame-choice" onclick="upgradeTower('melt')" style="width:100%;margin-bottom:4px;">Def Melt $${(t.meltLevel+1)*50}</button>`;
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
    this.immuneTo = null; 
    this.immuneTimer = 0;
    this.spawns = s.spawns || null; 
    this.spawnCount = s.spawnCount || 0;
  }
  takeDamage(dmg, sourceTowerType) { 
    if (this.isChameleon && this.immuneTimer > 0 && this.immuneTo === sourceTowerType) return 0;
    
    // Don't take damage if already dead (prevents double-spawning)
    if (!this.alive || this.health <= 0) return 0; 

    let actualDmg = Math.max(0.5, dmg - Math.max(0, this.armor - (typeof research !== 'undefined' ? research.piercing : 0))); 
    if (this.isShield) actualDmg = Math.ceil(actualDmg * 0.10);
    
    this.health -= actualDmg; 
    if (this.isChameleon) { this.immuneTo = sourceTowerType; this.immuneTimer = 180; }
    
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
    
    this.speed = this.slowTicks > 0 ? this.baseSpeed * this.slowFactor : this.baseSpeed;
    if (this.slowTicks > 0) this.slowTicks--; 
    if (this.meltTicks > 0) this.meltTicks--; 
    if (this.immuneTimer > 0) this.immuneTimer--;
    
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
    if (typeof selectedEnemy !== 'undefined' && selectedEnemy === this) { ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, (this.type === 'BOSS' ? 18 : 12) + 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = this.isCamo ? 0.4 : 1.0; ctx.fillStyle = this.slowTicks > 0 ? '#b3e5fc' : this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.type === 'BOSS' ? 18 : 12, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
    if (this.immuneTimer > 0) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, 10, 0, Math.PI * 2); ctx.stroke(); }
    if (this.isShield) { ctx.strokeStyle = '#00BCD4'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, 15, 0, Math.PI * 2); ctx.stroke(); }
    if (this.meltTicks > 0) { ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, 14, 0, Math.PI * 2); ctx.stroke(); }
    if (this.slowTicks > 0) { ctx.strokeStyle = '#29b6f6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, this.type === 'BOSS' ? 20 : 14, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = 'red'; ctx.fillRect(this.x - 15, this.y - 22, 30, 4); ctx.fillStyle = 'lime'; ctx.fillRect(this.x - 15, this.y - 22, (this.health / this.maxHealth) * 30, 4);
  }
}


class Trap {
  constructor(x, y, damage, tower) {
      this.x = x; this.y = y; this.damage = damage; this.tower = tower; this.alive = true; this.radius = 12;
  }
  update() {
      for(let i=0; i<enemies.length; i++) {
          let e = enemies[i];
          if (e.isFlying) continue;
          if ((e.x-this.x)**2 + (e.y-this.y)**2 < this.radius*this.radius) {
              this.tower.damageDealt += e.takeDamage(this.damage, 'TRAPPER');
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
    this.upgrades = { speed: 1, damage: 1, range: 1, duration: 1, radar: 0, amount: 1, lasers: 1 }; this.meltLevel = 0; this.slowLevel = 0; this.damageDealt = 0; 
    this.fireTimer = 0; this.rechargeTimer = 0; this.currentTargets = [];
    this.isRail = !!TOWER_TYPES[typeKey].isRail; this.isFarm = !!TOWER_TYPES[typeKey].isFarm; this.isEngie = !!TOWER_TYPES[typeKey].isEngie; this.isTrapper = !!TOWER_TYPES[typeKey].isTrapper; this.hasSpotter = false;
    this.income = TOWER_TYPES[typeKey].baseIncome || 0; this.totalGenerated = 0;
    this.totalSpent = getTowerCost(typeKey); 
    this.railFireTimer = 0; this.beamEndX = 0; this.beamEndY = 0;
    this.maxConstructs = TOWER_TYPES[typeKey].maxConstructs || 0; this.constructs = []; this.orbitAngle = 0;
    this.engieBuffTimer = 0;
  }
  applyBuffs(allTowers) {
    this.range = this.baseRange; this.damage = this.baseDamage; this.reloadTime = this.baseReload; this.duration = this.baseDuration; this.hasSpotter = false; this.spotterLink = null;
    let speedMod = 1, dmgMod = 1, rangeMod = 1, hasAppliedStatsBuff = false;
    
    if (this.engieBuffTimer > 0) speedMod *= 0.8; 

    allTowers.forEach(t => {
      if (TOWER_TYPES[t.type].isBuff) {
        const distSq = (t.x-this.x)**2 + (t.y-this.y)**2;
        
        if (this.isRail && distSq <= 240*240) {
            this.hasSpotter = true;
            this.spotterLink = t;
        }

        if (distSq <= t.range*t.range) {
            if (!hasAppliedStatsBuff) {
                speedMod *= Math.max(0.4, 0.95 - (t.upgrades.speed  * 0.02));
                dmgMod   *= 1.05 + (t.upgrades.speed * 0.1); 
                rangeMod *= 1.10 + (t.upgrades.range * 0.05); 
                hasAppliedStatsBuff = true;
            }
        }
      }
    });

    if (TOWER_TYPES[this.type].isBuff || this.isFarm) return;
    this.reloadTime *= speedMod; this.damage *= dmgMod; this.range *= rangeMod;
  }
  update() {
    if (this.engieBuffTimer > 0) this.engieBuffTimer--;
    if (TOWER_TYPES[this.type].isBuff || this.isFarm) return;
    if (this.isRail && !this.hasSpotter) return; 
    
    const r2 = this.range * this.range;
    const distSq = (a) => (a.x-this.x)**2 + (a.y-this.y)**2;

    if (this.isTrapper) {
      this.timer++;
      if (this.timer >= this.reloadTime) {
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
        
        let myTraps = traps.filter(t => t.tower === this);
        if (myTraps.length >= 10 + this.level) {
          myTraps[0].alive = false; 
        }
        
        traps.push(new Trap(spotX, spotY, this.damage, this));
        playSFX('shoot');
        this.timer = 0;
      }
      return; 
    }

    if (TOWER_TYPES[this.type].isIce) {
      this.timer++;
      if (this.timer >= this.reloadTime) {
        let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return distSq(e) <= r2; });
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
          
          let target = inRange[i % inRange.length];
          projectiles.push(new Projectile(c.x, c.y, target, this, false)); 
          playSFX('shoot'); c.timer = 0;
        }
      });
      this.timer++;
      if (this.timer >= 60) {
          let validTargets = [];
          towers.forEach(t => { if (t.type === 'BUFF' || t.isFarm) return; if (distSq(t) <= r2) validTargets.push({obj: t, buffTimer: t.engieBuffTimer || 0}); });
          this.constructs.forEach(c => validTargets.push({obj: c, buffTimer: c.buffTimer}));
          validTargets.sort((a,b) => a.buffTimer - b.buffTimer);
          if (validTargets.length > 0 && validTargets[0].buffTimer < 150) { projectiles.push(new Projectile(this.x, this.y, validTargets[0].obj, this, true)); this.timer = 0; } else this.timer = 60;
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
                  this.damageDealt += target.takeDamage(this.damage, this.type); 
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
          this.fireTimer = this.duration; 
          this.currentTargets = inRange.slice(0, this.upgrades.lasers || 1); 
          playSFX('sniper'); 
      } 
      return;
    }

    this.timer++;
    if (this.timer >= this.reloadTime) {
      let inRange = enemies.filter(e => {
        const hr = this.type === 'SNIPER' || this.upgrades.radar > 0;
        if ((e.isCamo || e.isFlying) && !hr) return false;
        return distSq(e) <= r2;
      });
      if (inRange.length > 0) {
        if (this.targetMode === 'First') inRange.sort((a, b) => b.pathIndex - a.pathIndex); else if (this.targetMode === 'Last') inRange.sort((a, b) => a.pathIndex - b.pathIndex); else if (this.targetMode === 'Strongest') inRange.sort((a, b) => b.health - a.health); else if (this.targetMode === 'Weakest') inRange.sort((a, b) => a.health - b.health); else if (this.targetMode === 'Random') inRange.sort(() => Math.random() - 0.5); else if (this.targetMode === 'Closest') inRange.sort((a,b) => distSq(a) - distSq(b)); else if (this.targetMode === 'Farthest') inRange.sort((a,b) => distSq(b) - distSq(a)); else if (this.targetMode === 'Highest Armor') inRange.sort((a,b) => b.armor - a.armor);
        const target = inRange[0];
        
        if (this.isRail) {
            playSFX('railgun');
            const angle = Math.atan2(target.y - this.y, target.x - this.x);
            this.beamEndX = this.x + Math.cos(angle) * this.range; 
            this.beamEndY = this.y + Math.sin(angle) * this.range;
            this.railFireTimer = 15; 
            
            enemies.forEach(e => {
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
                    
                    if (distToBeamSq <= 35*35) { 
                        this.damageDealt += e.takeDamage(this.damage, this.type); 
                        spawnParticles(e.x, e.y, '#00FFFF', 8); 
                    }
                }
            });
        } else {
            projectiles.push(new Projectile(this.x, this.y, target, this, false)); 
            if(this.type === 'SNIPER') playSFX('sniper'); else playSFX('shoot');
        }
        this.timer = 0;
      }
    }
  }
  draw() {
    if (this.engieBuffTimer > 0) { ctx.strokeStyle = '#FFC107'; ctx.lineWidth = 2; ctx.strokeRect(this.gx * TILE_SIZE + 1, this.gy * TILE_SIZE + 1, TILE_SIZE - 2, TILE_SIZE - 2); }
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

    if (this.type === 'ACCEL' && this.fireTimer > 0 && this.currentTargets && this.currentTargets.length > 0) { 
        this.currentTargets.forEach(target => {
            if (target.alive) {
                ctx.strokeStyle = '#E040FB'; ctx.lineWidth = Math.random() * 4 + 2; 
                ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(target.x, target.y); ctx.stroke(); 
                ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke(); 
            }
        });
    }
    if (this.isRail && this.railFireTimer > 0) { ctx.strokeStyle = '#00FFFF'; ctx.lineWidth = Math.random() * 6 + 2; ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.beamEndX, this.beamEndY); ctx.stroke(); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke(); this.railFireTimer--; }
    ctx.fillStyle = (this.isRail && !this.hasSpotter) ? '#444' : this.color; ctx.fillRect(this.gx * TILE_SIZE + 2, this.gy * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    if (this.isRail && !this.hasSpotter) { ctx.fillStyle = 'red'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center'; ctx.fillText("NO SIGNAL", this.x, this.y - 10); ctx.textAlign = 'left'; }
    if (this.isEngie) { this.constructs.forEach((c) => { ctx.fillStyle = c.buffTimer > 0 ? '#FFF' : '#FFC107'; ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1; ctx.stroke(); }); }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.fillText(TOWER_TYPES[this.type].isBuff ? 'B' : (this.isRail ? 'R' : (this.isFarm ? '$' : (this.isEngie ? 'E' : (this.isTrapper ? 'T' : this.type[0])))), this.x, this.y + 3); ctx.textAlign = 'left';
  }
}
class Projectile {
  constructor(x, y, target, damage, speed, type, splash=0, src=null) {
    this.x = x; this.y = y; 
    this.target = target;
    this.tx = target.x; this.ty = target.y; // Track last known X and Y
    this.damage = damage; this.speed = speed; this.type = type; 
    this.splash = splash; this.active = true; this.sourceTower = src;
  }
  update() {
    if (!this.active) return;
    
    // Update homing coordinates ONLY if target is still alive
    if (this.target && this.target.alive) {
        this.tx = this.target.x;
        this.ty = this.target.y;
    }
    
    let dx = this.tx - this.x, dy = this.ty - this.y, dist = Math.hypot(dx, dy);
    
    if (dist < this.speed) {
        this.active = false;
        
        // Only damage direct target if they haven't died yet
        if (this.target && this.target.alive && dist < this.speed * 2) {
            this.target.takeDamage(this.damage, this.sourceTower ? this.sourceTower.type : null);
        }
        
        // Splash damage always explodes at the coordinates, even if target died!
        if (this.splash > 0) {
            spawnParticles(this.tx, this.ty, '#ff9800', 15);
            enemies.forEach(e => {
                if (e.alive && Math.hypot(e.x - this.tx, e.y - this.ty) <= this.splash * TILE_SIZE) {
                    e.takeDamage(this.damage * 0.5, this.sourceTower ? this.sourceTower.type : null);
                }
            });
        } else {
            spawnParticles(this.tx, this.ty, '#fff', 5);
        }
    } else {
        this.x += (dx / dist) * this.speed;
        this.y += (dy / dist) * this.speed;
    }
  }
  draw() {
    ctx.fillStyle = this.type === 'SNIPER' ? '#000' : (this.splash > 0 ? '#ff9800' : '#ffeb3b');
    ctx.beginPath(); ctx.arc(this.x, this.y, this.splash > 0 ? 6 : 4, 0, Math.PI * 2); ctx.fill();
  }
}


function drawHoverPreview() {
  pCtx.clearRect(0, 0, pCanvas.width, pCanvas.height);
  if (!buildType || hoverGx < 0 || hoverGy < 0 || (!grid[hoverGy] || grid[hoverGy][hoverGx] !== 0)) return;
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
  document.getElementById('mainMenu').style.display = 'none'; 
  document.getElementById('game-root').style.display = 'flex'; 
  const m = MAP_DATA[mIdx]; 
  COLS = m.cols; ROWS = m.rows; 
  canvas.width = COLS * TILE_SIZE; canvas.height = ROWS * TILE_SIZE; 
  pCanvas.width = COLS * TILE_SIZE; pCanvas.height = ROWS * TILE_SIZE; 
  setupMap(m); 
  restartGame(); 
};
window.returnToMenu = () => { document.getElementById('game-root').style.display = 'none'; document.getElementById('mainMenu').style.display = 'flex'; isPaused = true; };
window.buyResearch = (type) => { const costs = { bounty: 500, piercing: 600, interest: 750 }; if (gold >= costs[type]) { gold -= costs[type]; if (type === 'bounty') research.bounty += 5; if (type === 'piercing') research.piercing += 2; if (type === 'interest') research.interest += 0.02; const btn = document.getElementById('res_' + type); if (btn) { btn.disabled = true; btn.innerText += " [MAX]"; } } };
window.setBuildType = t => { buildType = buildType === t ? null : t; selectedTower = null; selectedEnemy = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); if (buildType) { const btn = document.getElementById('btn_' + buildType); if (btn) btn.classList.add('active-build'); } updateSelectionUI(); drawHoverPreview(); };
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
        case 'farm': cost = FARM_UPGRADE_COSTS[t.level]; break;
    }

    // Special failsafes for one-off/capped upgrades
    if (stat === 'radar' && (t.upgrades.radar >= 1 || t.type === 'SNIPER')) return;
    if (stat === 'lasers' && (t.upgrades.lasers || 1) >= 5) return;

    // 2. Execute transaction and apply math
    if (gold >= cost) {
        gold -= cost;
        t.totalSpent += cost;

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
        }

        // 3. Apply global logic
        t.level++;
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
    gold += Math.floor(selectedTower.totalSpent / 2); 
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
  gold = 10000; lives = 20 + (metaTech.lives * 5); waveNumber = 0; enemiesLeftToSpawn = 0; spawnTimer = 0; waveCooldown = 0; 
  enemies = []; towers = []; projectiles = []; particles = []; traps = [];
  research = { bounty: 0, piercing: 0, interest: 0.01 };
  selectedTower = null; selectedEnemy = null; buildType = null; isPaused = false; isWaveActive = false; isGameOver = false; gameSpeed = 1; frameCount = 0; research = { bounty: 0, piercing: 0, interest: 0.01 };
  const pauseBtn = document.getElementById('pauseBtn'); if (pauseBtn) { pauseBtn.innerText = 'PAUSE'; pauseBtn.style.background = ''; }
  const speedBtn = document.getElementById('speedBtn'); if (speedBtn) { speedBtn.innerText = '1×'; speedBtn.classList.remove('fast'); }
  const intDisp = document.getElementById('interestDisplay'); if (intDisp) intDisp.innerText = '';
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  if (MAP_DATA[currentMapIndex].type === "FIXED") { const layout = MAP_DATA[currentMapIndex].layout; for(let y=0; y<ROWS; y++) for(let x=0; x<COLS; x++) if (layout[y] && layout[y][x] && layout[y][x] !== '0') grid[y][x] = 1; }
  drawBgCache(); updateSelectionUI(); updateWavePreview();
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
    if (gold >= cost && grid[gy] && grid[gy][gx] === 0) {
      if ((gx === startPos.x && gy === startPos.y) || (gx === endPos.x && gy === endPos.y)) return;
      grid[gy][gx] = 1; const p = MAP_DATA[currentMapIndex].type === "FIXED" ? MAP_DATA[currentMapIndex].fixedPath : findPath();
      if (p || TOWER_TYPES[buildType].isFarm) { gold -= cost; towers.push(new Tower(gx, gy, buildType)); recalculateAllPaths(); } else grid[gy][gx] = 0;
      drawHoverPreview();
    } else if (gold < cost) {
      const gD = document.getElementById('goldDisplay'); gD.style.color = 'red'; setTimeout(() => gD.style.color = '#ffd700', 300);
    }
  } else { selectedTower = null; selectedEnemy = null; updateSelectionUI(); }
});
function tick() {
  if (lives <= 0 || isPaused) return;
  frameCount++;
  
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
    if (waveNumber % 10 === 0 && waveNumber > 0) type = 'BOSS';
    else if (waveNumber > 1) { 
        const r = Math.random(); 
        if(waveNumber>15&&r>0.9) type='SLIME'; 
        else if(waveNumber>12&&r>0.85) type='CARRIER'; 
        else if(waveNumber>10&&r>0.75) type='CHAMELEON'; 
        else if(waveNumber>8&&r>0.65) type='SHIELD'; 
        else if(waveNumber>9&&r>0.55) type='HEALER'; 
        else if(waveNumber>7&&r>0.5) type='GHOST'; 
        else if(waveNumber>4&&r>0.4) type='FLYER'; 
        else if(waveNumber>3&&r>0.3) type='TANK'; 
        else if(waveNumber>1&&r>0.2) type='RUNNER'; 
    }
    const p = MAP_DATA[currentMapIndex].type === "FIXED" ? MAP_DATA[currentMapIndex].fixedPath : findPath();
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
  traps = traps.filter(tr => { tr.update(); return tr.alive; });
  particles = particles.filter(p => { p.update(); return p.life > 0; });
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

    traps.forEach(tr => tr.draw()); towers.forEach(t => t.draw()); enemies.forEach(e => e.draw()); projectiles.forEach(p => p.draw()); particles.forEach(p => p.draw()); 

    if (isPaused) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center'; ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2); ctx.textAlign = 'left'; }
    if (lives <= 0) { 
        ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'red'; ctx.font = 'bold 50px Arial'; ctx.textAlign = 'center'; ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2); ctx.textAlign = 'left';
        if (!isGameOver) { isGameOver = true; metaTech.tokens += waveNumber; saveMeta(); }
    }
}

// Initialize Meta
loadMeta();
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
        towers: towers.map(t => ({ 
            gx: t.gx, gy: t.gy, type: t.type, level: t.level, targetMode: t.targetMode, totalSpent: t.totalSpent, 
            damageDealt: t.damageDealt || 0, income: t.income, totalGenerated: t.totalGenerated, 
            maxConstructs: t.maxConstructs, upgrades: t.upgrades, meltLevel: t.meltLevel, 
            slowLevel: t.slowLevel, baseDamage: t.baseDamage, baseRange: t.baseRange, baseReload: t.baseReload, baseDuration: t.baseDuration 
        })), 
        traps: traps.map(tr => ({ x: tr.x, y: tr.y, type: tr.type, damage: tr.damage, splash: tr.splash, active: tr.active })) 
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
    
    enemies = []; projectiles = []; particles = []; traps = []; towers = [];
    gold = state.gold; lives = state.lives; waveNumber = state.waveNumber;
    research = { bounty: state.research?.bounty || 0, piercing: state.research?.piercing || 0, interest: state.research?.interest || 0.01 };
    
    state.towers.forEach(data => {
        let t = new Tower(data.gx, data.gy, data.type);
        t.level = data.level; t.targetMode = data.targetMode || 'First'; t.totalSpent = data.totalSpent; t.damageDealt = data.damageDealt || 0;
        if(t.type === 'FARM' && data.income) t.income = data.income; if(t.type === 'FARM' && data.totalGenerated) t.totalGenerated = data.totalGenerated;
        if(t.type === 'ENGIE' && data.maxConstructs) t.maxConstructs = data.maxConstructs;
        if(data.upgrades) t.upgrades = data.upgrades; if(data.meltLevel) t.meltLevel = data.meltLevel; if(data.slowLevel) t.slowLevel = data.slowLevel;
        if (data.baseDamage) t.baseDamage = data.baseDamage; if (data.baseRange) t.baseRange = data.baseRange;
        if (data.baseReload) t.baseReload = data.baseReload; if (data.baseDuration) t.baseDuration = data.baseDuration;
        if (grid[data.gy] && grid[data.gy][data.gx] !== undefined) grid[data.gy][data.gx] = 1;
        towers.push(t);
    });
    
    if (state.traps) {
        state.traps.forEach(trData => {
            let tr = new Trap(trData.x, trData.y, trData.damage, null);
            tr.tower = towers.find(tw => tw.gx === trData.towerGx && tw.gy === trData.towerGy);
            if (tr.tower) traps.push(tr);
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
function openEnemyIndex() {
    const grid = document.getElementById('enemyIndexGrid');
    grid.innerHTML = ''; // Clear the grid

    // Loop through your master ENEMY_TYPES object
    for (const [type, data] of Object.entries(ENEMY_TYPES)) {
        
        // Check if this enemy type exists in the global save list
        const isUnlocked = metaTech.unlockedEnemies.includes(type);
        
        let cardHTML = '';
        if (isUnlocked) {
            // Unlocked: Show real stats and accurate color
            cardHTML = `
                <div style="border:2px solid ${data.color}; background:#333; padding:10px; border-radius:8px; text-align:center;">
                    <div style="width:30px; height:30px; background:${data.color}; margin:0 auto 10px; border-radius:4px; border:1px solid #fff;"></div>
                    <h4 style="color:${data.color}; margin-bottom:5px;">${type}</h4>
                    <p style="font-size:12px; margin:2px 0; color:#ddd;">Base HP: ${data.hp}</p>
                    <p style="font-size:12px; margin:2px 0; color:#ddd;">Speed: ${data.speed.toFixed(1)}</p>
                    <p style="font-size:12px; margin:2px 0; color:#ddd;">Armor: ${data.armor}</p>
                    <p style="font-size:12px; margin:2px 0; color:#ffd700;">Reward: $${data.reward}</p>
                </div>
            `;
        } else {
            // Locked: Show mysterious silhouette and "???" stats
            cardHTML = `
                <div style="border:2px dashed #555; background:#222; padding:10px; border-radius:8px; text-align:center; opacity:0.6;">
                    <div style="width:30px; height:30px; background:#111; margin:0 auto 10px; border-radius:4px;"></div>
                    <h4 style="color:#777; margin-bottom:5px;">???</h4>
                    <p style="font-size:12px; margin:2px 0; color:#555;">Base HP: ???</p>
                    <p style="font-size:12px; margin:2px 0; color:#555;">Speed: ???</p>
                    <p style="font-size:12px; margin:2px 0; color:#555;">Armor: ???</p>
                    <p style="font-size:12px; margin:2px 0; color:#555;">Reward: ???</p>
                </div>
            `;
        }
        grid.innerHTML += cardHTML;
    }

    // Display the modal window
    document.getElementById('enemyIndexModal').style.display = 'flex';
}
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
    const gameRoot = document.getElementById('game-root');
    if (gameRoot && gameRoot.style.display !== 'none' && typeof paused !== 'undefined' && !paused) {
        togglePause(); 
    }
    populateEnemyIndex();
    document.getElementById('enemyIndexModal').style.display = 'flex';
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