const canvas = document.getElementById('gameCanvas'), ctx = canvas.getContext('2d');
const pCanvas = document.getElementById('pathPreviewCanvas'), pCtx = pCanvas.getContext('2d');
const TILE_SIZE = 40; let COLS = 20, ROWS = 12;

const MAP_DATA = [
  { name: "Map 1: Sandbox", type: "RANDOM", cols: 20, rows: 12, start: {x:0, y:6}, end: {x:19, y:6}, layout: [] },
  { name: "Map 2: The S-Curve", type: "FIXED", cols: 20, rows: 12, layout: [
      "00000000000000000000","S1111111110000000000","00000000010000000000","00000000011111111100",
      "00000000000000000100","00111111111111111100","00100000000000000000","0011111111111111111E",
      "00000000000000000000","00000000000000000000","00000000000000000000","00000000000000000000" ] },
  { name: "Map 3: The Spiral", type: "FIXED", cols: 16, rows: 12, layout: [
      "S111111111111110","0000000000000010","0111111111110010","0100000000010010","0101111110010010",
      "0101000010010010","010100E110010010","0101000000010010","0101111111110010","0100000000000010",
      "0111111111111110","0000000000000000" ] },
  { name: "Map 4: River Run", type: "FIXED", cols: 24, rows: 10, layout: [
      "S11000000000111000000000","001100000001101100000000","000110000011000110000000","000011000110000011000000",
      "000001101100000001100000","000000111000000000110000","000000000000000000011000","000000000000000000001100",
      "00000000000000000000011E","000000000000000000000000" ] },
  { name: "Map 5: The Maze", type: "FIXED", cols: 18, rows: 14, layout: [
      "S00000000000000000","101111111111111110","101000000000000010","101011111111111010","101010000000001010",
      "101010111111101010","101010100000101010","1010101011E0101010","101010100000101010","101010111111101010",
      "101010000000001010","101011111111111010","101000000000000010","111111111111111110" ] }
];

let currentMapIndex = 0, startPos = {x:0, y:6}, endPos = {x:19, y:6};

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
  PISTOL:  { color: '#4CAF50', range: 150, reload: 40,  damage: 2,    cost: 50,  bullet: 'orange' },
  SNIPER:  { color: '#2196F3', range: 350, reload: 100, damage: 15,   cost: 150, bullet: 'white'  },
  MINIGUN: { color: '#FF9800', range: 120, reload: 6,   damage: 2,    cost: 300, bullet: 'yellow' },
  FLAME:   { color: '#FF5722', range: 100, reload: 15,  damage: 1,    cost: 175, bullet: 'red',     isFlame: true },
  ICE:     { color: '#29b6f6', range: 130, reload: 120, damage: 0,    cost: 125, isIce: true }, 
  BOMB:    { color: '#555555', range: 140, reload: 90,  damage: 10,   cost: 200, bullet: 'black',   splashRadius: 70 },
  ACCEL:   { color: '#E040FB', range: 180, reload: 120, damage: 12,   cost: 500, bullet: 'none',    isAccel: true, duration: 300 },
  BUFF:    { color: '#FFD700', range: 120, reload: 0,   damage: 0,    cost: 150, isBuff: true },
  ENGIE:   { color: '#FFC107', range: 160, reload: 60,  damage: 3,    cost: 400, isEngie: true,     bullet: '#FFC107', maxConstructs: 1 },
  RAILGUN: { color: '#E91E63', range: 800, reload: 180, damage: 50,   cost: 800, bullet: '#00FFFF', isRail: true },
  FARM:    { color: '#8BC34A', range: 0,   reload: 0,   damage: 0,    cost: 250, isFarm: true,      baseIncome: 50 }
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

const WAVE_COLORS = { NORMAL: '#9C27B0', RUNNER: '#FFEB3B', TANK: '#8B4513', FLYER: '#E0E0E0', GHOST: '#9E9E9E', HEALER: '#4CAF50', CARRIER: '#607D8B', BOSS: '#FF0000' };

let gold=250, lives=20, waveNumber=0, buildType=null, selectedTower=null, selectedEnemy=null, enemiesLeftToSpawn=0, spawnTimer=0, waveCooldown=0;
let isPaused=false, isWaveActive=false, gameSpeed=1, hoverGx=-1, hoverGy=-1, frameCount=0;
let research = { bounty: 0, piercing: 0, interest: 0.01 };
let grid = [], enemies = [], towers = [], projectiles = [];

function findPath(sx = startPos.x, sy = startPos.y) {
  let q = [[sx, sy, []]], vis = new Set([`${sx},${sy}`]);
  while (q.length > 0) {
    let i = Math.floor(Math.random() * q.length), [x, y, p] = q.splice(i, 1)[0], cur = [...p, {x, y}];
    if (x === endPos.x && y === endPos.y) return cur;
    [{x:x+1,y}, {x:x-1,y}, {x,y:y+1}, {x,y:y-1}].sort(()=>Math.random()-0.5).forEach(n => {
      if(n.x>=0 && n.x<COLS && n.y>=0 && n.y<ROWS && grid[n.y][n.x]===0 && !vis.has(`${n.x},${n.y}`)) { vis.add(`${n.x},${n.y}`); q.push([n.x, n.y, cur]); }
    });
  } return null;
}

const recalculateAllPaths = () => enemies.forEach(e => { let p = findPath(Math.floor(e.x/TILE_SIZE), Math.floor(e.y/TILE_SIZE)); if(p) { e.path=p; e.pathIndex=0; } });

function getWaveComposition(wNum) {
  if (wNum % 10 === 0 && wNum > 0) return { BOSS: 1 };
  const comp = { NORMAL: 0, RUNNER: 0, TANK: 0, FLYER: 0, GHOST: 0, HEALER: 0, CARRIER: 0 };
  for(let i=0; i<5+wNum; i++) {
    let r = Math.random();
    if (wNum>12&&r>0.9) comp.CARRIER++; else if(wNum>9&&r>0.8) comp.HEALER++; else if(wNum>7&&r>0.65) comp.GHOST++;
    else if(wNum>4&&r>0.5) comp.FLYER++; else if(wNum>3&&r>0.4) comp.TANK++; else if(wNum>1&&r>0.3) comp.RUNNER++; else comp.NORMAL++;
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
    side.innerHTML = h + row('Speed:', selectedEnemy.speed.toFixed(2)) + row('Bounty:', `$${selectedEnemy.reward}`, '#ffd700');
    return;
  }

  const t = selectedTower, ty = TOWER_TYPES[t.type];
  const isF = ty.isFarm, isB = ty.isBuff, isA = ty.isAccel, isR = ty.isRail, isE = ty.isEngie, isI = ty.isIce;
  
  const sellVal = Math.floor(t.totalSpent / 2);
  const canAir = (t.type==='SNIPER'||t.upgrades.radar>0) ? 'Yes' : 'No';
  const airCol = (t.type==='SNIPER'||t.upgrades.radar>0) ? '#00E676' : '#ff4444';
  const rStr = (t.type==='SNIPER'||t.upgrades.radar>0) ? `<span style="color:#00E676;">Active</span>` : `<span style="color:#aaa;">None</span>`;

  let h = `<h3 style="border-bottom:2px solid ${t.color};padding-bottom:5px;">${t.type}</h3>${row('Level:', t.level + ' / 25')}${row('Sell:', `$${sellVal}`, '#ffd700')}<br>`;

  if (isF) h += row('Income:', `+$${t.income}/wave`, '#FFD700') + row('Total Gen:', `$${t.totalGenerated}`, '#FFD700') + row('Limit:', `${towers.filter(x=>x.isFarm).length} / 8`);
  else if (isB) h += row('Aura Radius:', t.range) + row('Buffing:', 'All Stats', '#FFD700');
  else if (isE) h += row('Constructs:', `${t.constructs.length} / ${t.maxConstructs}`, '#FFC107') + row('C. Dmg:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('C. Rng:', t.range, t.range>t.baseRange?'#FFD700':'white') + row('C. Rate:', `${(60/t.reloadTime).toFixed(1)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Buff Dur:', '5s', '#FFC107') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700');
  else if (isI) h += row('Range:', t.range, t.range>t.baseRange?'#FFD700':'white') + row('Tick Rate:', `${(60/t.reloadTime).toFixed(2)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Slow Lvl:', t.slowLevel, '#29b6f6');
  else if (isA) h += row('Damage:', `${t.damage.toFixed(1)}/tk`, t.damage>t.baseDamage?'#FFD700':'white') + row('Range:', t.range, t.range>t.baseRange?'#FFD700':'white') + row('Downtime:', `${(t.reloadTime/60).toFixed(1)}s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Beam Time:', `${(t.duration/60).toFixed(1)}s`, t.duration>t.baseDuration?'#FFD700':'white') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700');
  else {
    if (isR && !t.hasSpotter) h += `<div style="color:#ff4444; font-weight:bold; text-align:center;">OFFLINE: NEEDS SPOTTER</div>`;
    h += row('Damage:', t.damage.toFixed(1), t.damage>t.baseDamage?'#FFD700':'white') + row('Range:', t.range, t.range>t.baseRange?'#FFD700':'white') + row('Fire Rate:', `${(60/t.reloadTime).toFixed(1)}/s`, t.reloadTime<t.baseReload?'#FFD700':'white') + row('Sensors:', rStr) + row('Anti-Air:', canAir, airCol) + row('Total Dmg:', Math.floor(t.damageDealt), '#FFD700');
    if (ty.isFlame) h += row('Melt Lvl:', t.meltLevel, '#FF5722');
  }

  h += `<div class="upgrades-section" style="margin-top:10px; border-top:1px solid #555; padding-top:10px; display:flex; flex-direction:column; gap:4px;">`;
  if (!isF && !isB && !isI) h += `<button onclick="cycleTargeting()" style="width:100%; margin-bottom:4px;">Target: ${t.targetMode}</button>`;

  if (t.level >= 25) {
      h += `<button style="width:100%; opacity:0.5; padding:8px 0; margin-bottom:4px; font-weight:bold;" disabled>MAX LEVEL (25)</button>`;
  } else {
      let rB = (!isF && !isB) ? (t.type==='SNIPER' ? `<button class="radar-btn" style="flex:1;opacity:0.5;">Radar (Native)</button>` : (t.upgrades.radar>0 ? `<button class="radar-btn" style="flex:1;opacity:0.5;">Radar (MAX)</button>` : `<button class="radar-btn" onclick="upgradeRadar()" style="flex:1;">Radar $150</button>`)) : '';

      if (isF) h += `<button class="farm-btn" onclick="upgradeFarm()" style="margin-bottom:4px;">Upgrade Yield $${150 + t.level * 50}</button>`;
      else if (isB) h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeSpeed()" style="flex:1">Potency $${t.upgrades.speed*30}</button><button onclick="upgradeRange()" style="flex:1">Aura Rng $${t.upgrades.range*25}</button></div>`;
      else if (isE) h += `<button onclick="upgradeEngieAmount()" style="margin-bottom:4px;">Add Construct $${t.upgrades.amount*200}</button><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeSpeed()" style="flex:1">Fire Rate $${t.upgrades.speed*30}</button><button onclick="upgradeDamage()" style="flex:1">Damage $${t.upgrades.damage*40}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeRange()" style="flex:1">Range $${t.upgrades.range*25}</button>${rB}</div>`;
      else if (isI) h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeSpeed()" style="flex:1">Tick Rate $${t.upgrades.speed*30}</button><button onclick="upgradeRange()" style="flex:1">Range $${t.upgrades.range*25}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;">${rB}<button class="ice-btn" onclick="upgradeSlowPower()" style="flex:1">Slow Pwr $${(t.slowLevel+1)*40}</button></div>`;
      else if (isA) h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeSpeed()" style="flex:1">Recharge $${t.upgrades.speed*50}</button><button onclick="upgradeDamage()" style="flex:1">Power $${t.upgrades.damage*60}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeRange()" style="flex:1">Range $${t.upgrades.range*40}</button><button class="accel-choice" onclick="upgradeAccelDuration()" style="flex:1">Duration $${t.upgrades.duration*50}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;">${rB}</div>`;
      else {
          h += `<div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeSpeed()" style="flex:1">Speed $${t.upgrades.speed*30}</button><button onclick="upgradeDamage()" style="flex:1">Power $${t.upgrades.damage*40}</button></div><div style="display:flex;gap:4px;margin-bottom:4px;"><button onclick="upgradeRange()" style="flex:1">Range $${t.upgrades.range*25}</button>${rB}</div>`;
          if (ty.isFlame) h += `<button class="flame-choice" onclick="upgradeDefenseMelt()" style="width:100%;margin-bottom:4px;">Def Melt $${(t.meltLevel+1)*50}</button>`;
      }
  }
  h += `<button class="remove-btn" onclick="removeTower()" style="width:100%;">SELL $${sellVal}</button></div>`;
  side.innerHTML = h;
}

class Enemy {
  constructor(path, typeKey) {
    const s = ENEMY_TYPES[typeKey];
    this.path = path; this.pathIndex = 0; this.type = typeKey;
    this.x = startPos.x * TILE_SIZE + TILE_SIZE / 2; this.y = startPos.y * TILE_SIZE + TILE_SIZE / 2;
    this.baseSpeed = s.speed; this.speed = s.speed; this.color = s.color; this.reward = s.reward;
    this.maxHealth = Math.max(1, Math.floor(s.hp * 0.75 * Math.pow(1.25, waveNumber))); this.health = this.maxHealth;
    this.armor = s.armor + Math.floor(waveNumber / 3); 
    this.meltTicks = 0; this.slowTicks = 0; this.slowFactor = 1; this.alive = true;
    this.isFlying = !!s.isFlying; this.isCamo = !!s.isCamo; this.isHealer = !!s.isHealer; this.spawns = s.spawns || null; this.spawnCount = s.spawnCount || 0;
  }
  update() {
    if (!this.alive) return;
    this.speed = this.slowTicks > 0 ? this.baseSpeed * this.slowFactor : this.baseSpeed;
    if (this.slowTicks > 0) this.slowTicks--; if (this.meltTicks > 0) this.meltTicks--;
    if (this.isHealer && frameCount % 60 === 0) { spawnParticles(this.x, this.y, '#4CAF50', 5); enemies.forEach(e => { if (e !== this && Math.hypot(e.x - this.x, e.y - this.y) <= 80) e.health = Math.min(e.maxHealth, e.health + 5); }); }
    
    if (!this.path || this.pathIndex >= this.path.length) { this.alive = false; if (this.pathIndex >= this.path.length) lives--; return; }
    const target = this.path[this.pathIndex], tx = target.x * TILE_SIZE + TILE_SIZE / 2, ty = target.y * TILE_SIZE + TILE_SIZE / 2, dist = Math.hypot(tx - this.x, ty - this.y);
    if (dist < this.speed) this.pathIndex++; else { this.x += ((tx - this.x) / dist) * this.speed; this.y += ((ty - this.y) / dist) * this.speed; }

    if (this.health <= 0) { 
      this.alive = false; gold += this.reward + research.bounty; spawnParticles(this.x, this.y, this.color, 15, 1.5); 
      if (this.spawns) for(let i=0; i<this.spawnCount; i++) { let spawn = new Enemy(this.path, this.spawns); spawn.x = this.x + (Math.random()*20 - 10); spawn.y = this.y + (Math.random()*20 - 10); spawn.pathIndex = this.pathIndex; enemies.push(spawn); }
    }
  }
  takeDamage(dmg) { const actualDmg = Math.max(0.5, dmg - Math.max(0, this.armor - research.piercing)); this.health -= actualDmg; return actualDmg; }
  draw() {
    if (selectedEnemy === this) { ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, (this.type === 'BOSS' ? 18 : 12) + 4, 0, Math.PI * 2); ctx.stroke(); }
    ctx.globalAlpha = this.isCamo ? 0.4 : 1.0; ctx.fillStyle = this.slowTicks > 0 ? '#b3e5fc' : this.color; ctx.beginPath(); ctx.arc(this.x, this.y, this.type === 'BOSS' ? 18 : 12, 0, Math.PI * 2); ctx.fill(); ctx.globalAlpha = 1.0;
    if (this.meltTicks > 0) { ctx.strokeStyle = '#ff1744'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, 14, 0, Math.PI * 2); ctx.stroke(); }
    if (this.slowTicks > 0) { ctx.strokeStyle = '#29b6f6'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(this.x, this.y, this.type === 'BOSS' ? 20 : 14, 0, Math.PI * 2); ctx.stroke(); }
    ctx.fillStyle = 'red'; ctx.fillRect(this.x - 15, this.y - 22, 30, 4); ctx.fillStyle = 'lime'; ctx.fillRect(this.x - 15, this.y - 22, (this.health / this.maxHealth) * 30, 4);
  }
}

class Tower {
  constructor(gx, gy, typeKey) {
    this.gx = gx; this.gy = gy; this.x = gx * TILE_SIZE + TILE_SIZE / 2; this.y = gy * TILE_SIZE + TILE_SIZE / 2; this.type = typeKey;
    this.baseRange = TOWER_TYPES[typeKey].range; this.baseReload = TOWER_TYPES[typeKey].reload; this.baseDamage = TOWER_TYPES[typeKey].damage; this.baseDuration = TOWER_TYPES[typeKey].duration || 0; 
    this.range = this.baseRange; this.reloadTime = this.baseReload; this.damage = this.baseDamage; this.duration = this.baseDuration;
    this.color = TOWER_TYPES[typeKey].color; this.level = 1; this.timer = 0; this.targetMode = 'First';
    this.upgrades = { speed: 1, damage: 1, range: 1, duration: 1, radar: 0, amount: 1 }; this.meltLevel = 0; this.slowLevel = 0; this.damageDealt = 0; 
    this.fireTimer = 0; this.rechargeTimer = 0; this.currentTarget = null;
    this.isRail = !!TOWER_TYPES[typeKey].isRail; this.isFarm = !!TOWER_TYPES[typeKey].isFarm; this.isEngie = !!TOWER_TYPES[typeKey].isEngie; this.hasSpotter = false;
    this.income = TOWER_TYPES[typeKey].baseIncome || 0; this.totalGenerated = 0;
    this.totalSpent = TOWER_TYPES[typeKey].cost; 
    this.railFireTimer = 0; this.beamEndX = 0; this.beamEndY = 0;
    this.maxConstructs = TOWER_TYPES[typeKey].maxConstructs || 0; this.constructs = []; this.orbitAngle = 0;
    this.engieBuffTimer = 0;
  }
  applyBuffs(allTowers) {
    this.range = this.baseRange; this.damage = this.baseDamage; this.reloadTime = this.baseReload; this.duration = this.baseDuration; this.hasSpotter = false;
    if (TOWER_TYPES[this.type].isBuff || this.isFarm) return;
    let speedMod = 1, dmgMod = 1, rangeMod = 0, hasAppliedStatsBuff = false;
    
    if (this.engieBuffTimer > 0) speedMod *= 0.8; 

    allTowers.forEach(t => {
      if (TOWER_TYPES[t.type].isBuff && Math.hypot(this.x - t.x, this.y - t.y) <= t.range) {
        this.hasSpotter = true; 
        if (!hasAppliedStatsBuff) {
            speedMod *= Math.max(0.4, 0.95 - (t.upgrades.speed  * 0.02));
            dmgMod   *= 1.05 + (t.upgrades.speed * 0.1); 
            rangeMod += 10   + (t.upgrades.range  * 5);
            hasAppliedStatsBuff = true;
        }
      }
    });
    this.reloadTime *= speedMod; this.damage *= dmgMod; this.range += rangeMod;
  }
  update() {
    if (this.engieBuffTimer > 0) this.engieBuffTimer--;
    if (TOWER_TYPES[this.type].isBuff || this.isFarm) return;
    if (this.isRail && !this.hasSpotter) return; 
    
    if (TOWER_TYPES[this.type].isIce) {
      this.timer++;
      if (this.timer >= this.reloadTime) {
        let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return Math.hypot(e.x - this.x, e.y - this.y) <= this.range; });
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
      let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return Math.hypot(e.x - this.x, e.y - this.y) <= this.range; });
      this.constructs.forEach((c, i) => {
        if (c.buffTimer > 0) c.buffTimer--;
        let a = this.orbitAngle + i * ((Math.PI * 2) / this.maxConstructs);
        c.x = this.x + Math.cos(a) * 18; c.y = this.y + Math.sin(a) * 18;
        c.timer++;
        let cReload = this.reloadTime * (c.buffTimer > 0 ? 0.8 : 1);
        if (c.timer >= cReload && inRange.length > 0) {
          if (this.targetMode === 'First') inRange.sort((a, b) => b.pathIndex - a.pathIndex); else if (this.targetMode === 'Last') inRange.sort((a, b) => a.pathIndex - b.pathIndex); else if (this.targetMode === 'Strongest') inRange.sort((a, b) => b.health - a.health); else if (this.targetMode === 'Weakest') inRange.sort((a, b) => a.health - b.health); else if (this.targetMode === 'Random') inRange.sort(() => Math.random() - 0.5);
          projectiles.push(new Projectile(c.x, c.y, inRange[0], this, false)); playSFX('shoot'); c.timer = 0;
        }
      });
      this.timer++;
      if (this.timer >= 60) {
          let validTargets = [];
          towers.forEach(t => { if (Math.hypot(t.x - this.x, t.y - this.y) <= this.range) validTargets.push({obj: t, buffTimer: t.engieBuffTimer || 0}); });
          this.constructs.forEach(c => validTargets.push({obj: c, buffTimer: c.buffTimer}));
          validTargets.sort((a,b) => a.buffTimer - b.buffTimer);
          if (validTargets.length > 0 && validTargets[0].buffTimer < 150) { projectiles.push(new Projectile(this.x, this.y, validTargets[0].obj, this, true)); this.timer = 0; } else this.timer = 60;
      }
      return;
    }

    if (TOWER_TYPES[this.type].isAccel) {
      if (this.rechargeTimer > 0) { this.rechargeTimer--; return; }
      let inRange = enemies.filter(e => { if ((e.isCamo || e.isFlying) && this.upgrades.radar === 0) return false; return Math.hypot(e.x - this.x, e.y - this.y) <= this.range; });
      if (this.fireTimer > 0) {
        if (inRange.length > 0) {
          if (this.targetMode === 'First') inRange.sort((a, b) => b.pathIndex - a.pathIndex); else if (this.targetMode === 'Last') inRange.sort((a, b) => a.pathIndex - b.pathIndex); else if (this.targetMode === 'Strongest') inRange.sort((a, b) => b.health - a.health); else if (this.targetMode === 'Weakest') inRange.sort((a, b) => a.health - b.health); else if (this.targetMode === 'Random') inRange.sort(() => Math.random() - 0.5);
          this.currentTarget = inRange[0]; 
          if (this.fireTimer % 15 === 0) { this.damageDealt += this.currentTarget.takeDamage(this.damage); spawnParticles(this.currentTarget.x, this.currentTarget.y, '#E040FB', 8, 2); playSFX('hit'); }
        } else this.currentTarget = null;
        this.fireTimer--; if (this.fireTimer <= 0) { this.rechargeTimer = this.reloadTime; this.currentTarget = null; }
        return;
      }
      if (inRange.length > 0) { this.fireTimer = this.duration; this.currentTarget = inRange[0]; playSFX('sniper'); } return;
    }

    this.timer++;
    if (this.timer >= this.reloadTime) {
      let inRange = enemies.filter(e => {
        const hr = this.type === 'SNIPER' || this.upgrades.radar > 0;
        if ((e.isCamo || e.isFlying) && !hr) return false;
        return Math.hypot(e.x - this.x, e.y - this.y) <= this.range;
      });
      if (inRange.length > 0) {
        if (this.targetMode === 'First') inRange.sort((a, b) => b.pathIndex - a.pathIndex); else if (this.targetMode === 'Last') inRange.sort((a, b) => a.pathIndex - b.pathIndex); else if (this.targetMode === 'Strongest') inRange.sort((a, b) => b.health - a.health); else if (this.targetMode === 'Weakest') inRange.sort((a, b) => a.health - b.health); else if (this.targetMode === 'Random') inRange.sort(() => Math.random() - 0.5);
        const target = inRange[0];
        if (this.isRail) {
            playSFX('railgun');
            const angle = Math.atan2(target.y - this.y, target.x - this.x);
            this.beamEndX = this.x + Math.cos(angle) * this.range; this.beamEndY = this.y + Math.sin(angle) * this.range;
            this.railFireTimer = 10; 
            enemies.forEach(e => {
                const distToLine = Math.abs((this.beamEndY - this.y)*e.x - (this.beamEndX - this.x)*e.y + this.beamEndX*this.y - this.beamEndY*this.x) / this.range;
                const dotProduct = (e.x - this.x)*(this.beamEndX - this.x) + (e.y - this.y)*(this.beamEndY - this.y);
                if (distToLine < 25 && dotProduct > 0 && Math.hypot(e.x - this.x, e.y - this.y) <= this.range + 25) { this.damageDealt += e.takeDamage(this.damage); spawnParticles(e.x, e.y, '#00FFFF', 6); }
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
    if (this.type === 'ACCEL' && this.fireTimer > 0 && this.currentTarget && this.currentTarget.alive) { ctx.strokeStyle = '#E040FB'; ctx.lineWidth = Math.random() * 4 + 2; ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.currentTarget.x, this.currentTarget.y); ctx.stroke(); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke(); }
    if (this.isRail && this.railFireTimer > 0) { ctx.strokeStyle = '#00FFFF'; ctx.lineWidth = Math.random() * 6 + 2; ctx.beginPath(); ctx.moveTo(this.x, this.y); ctx.lineTo(this.beamEndX, this.beamEndY); ctx.stroke(); ctx.strokeStyle = 'white'; ctx.lineWidth = 2; ctx.stroke(); this.railFireTimer--; }
    ctx.fillStyle = (this.isRail && !this.hasSpotter) ? '#444' : this.color; ctx.fillRect(this.gx * TILE_SIZE + 2, this.gy * TILE_SIZE + 2, TILE_SIZE - 4, TILE_SIZE - 4);
    if (this.isRail && !this.hasSpotter) { ctx.fillStyle = 'red'; ctx.font = 'bold 8px Arial'; ctx.textAlign = 'center'; ctx.fillText("NO SIGNAL", this.x, this.y - 10); ctx.textAlign = 'left'; }
    if (this.isEngie) { this.constructs.forEach((c) => { ctx.fillStyle = c.buffTimer > 0 ? '#FFF' : '#FFC107'; ctx.beginPath(); ctx.arc(c.x, c.y, 4, 0, Math.PI*2); ctx.fill(); ctx.strokeStyle = '#FFF'; ctx.lineWidth = 1; ctx.stroke(); }); }
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = 'bold 9px Arial'; ctx.textAlign = 'center'; ctx.fillText(TOWER_TYPES[this.type].isBuff ? 'B' : (this.isRail ? 'R' : (this.isFarm ? '$' : (this.isEngie ? 'E' : this.type[0]))), this.x, this.y + 3); ctx.textAlign = 'left';
  }
}

class Projectile {
  constructor(sx, sy, target, tower, isBuff = false) {
    this.x = sx; this.y = sy; this.target = target; this.tower = tower; this.isBuff = isBuff; this.damage = tower.damage; this.color = isBuff ? '#FFC107' : TOWER_TYPES[tower.type].bullet; this.speed = isBuff ? 6 : (tower.type === 'BOMB' ? 4 : 8); this.alive = true; this.isFlame = !!TOWER_TYPES[tower.type].isFlame; this.meltLevel = tower.meltLevel; this.splashRadius = TOWER_TYPES[tower.type].splashRadius || 0;
  }
  update() {
    const dx = this.target.x - this.x, dy = this.target.y - this.y, dist = Math.hypot(dx, dy);
    if (this.isBuff) {
      if (dist < 5) {
        if (this.target.timer !== undefined && this.target.buffTimer !== undefined) this.target.buffTimer = 300; else this.target.engieBuffTimer = 300;
        this.alive = false; spawnParticles(this.x, this.y, '#FFC107', 4);
      } else { this.x += (dx / dist) * this.speed; this.y += (dy / dist) * this.speed; } return;
    }
    if (dist < 5 || !this.target.alive) {
        if (this.splashRadius > 0) {
          playSFX('explosion'); spawnParticles(this.x, this.y, '#FF5722', 25, 2.0); 
          enemies.forEach(e => { if (Math.hypot(e.x - this.x, e.y - this.y) <= this.splashRadius) { if (e.isFlying && (this.tower.type !== 'SNIPER' && this.tower.upgrades.radar === 0)) return; this.tower.damageDealt += e.takeDamage(this.damage); } });
        } else if (this.target.alive) {
          playSFX('hit'); spawnParticles(this.target.x, this.target.y, this.color, 4);
          if (this.isFlame) { this.target.meltTicks = 180; this.target.armor = Math.max(0, this.target.armor - (0.2 + this.meltLevel * 0.3)); }
          this.tower.damageDealt += this.target.takeDamage(this.damage); 
        }
        this.alive = false;
    }
    this.x += (dx / dist) * this.speed; this.y += (dy / dist) * this.speed;
  }
  draw() { ctx.fillStyle = this.color; ctx.beginPath(); if (this.isBuff) ctx.arc(this.x, this.y, 3, 0, Math.PI*2); else ctx.arc(this.x, this.y, this.splashRadius ? 6 : 4, 0, Math.PI * 2); ctx.fill(); }
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

window.startGame = (mIdx) => { currentMapIndex = mIdx; document.getElementById('mainMenu').style.display = 'none'; document.getElementById('game-root').style.display = 'flex'; const m = MAP_DATA[mIdx]; COLS = m.cols; ROWS = m.rows; canvas.width = COLS * TILE_SIZE; canvas.height = ROWS * TILE_SIZE; pCanvas.width = COLS * TILE_SIZE; pCanvas.height = ROWS * TILE_SIZE; setupMap(m); restartGame(); };
window.returnToMenu = () => { document.getElementById('game-root').style.display = 'none'; document.getElementById('mainMenu').style.display = 'flex'; isPaused = true; };
window.buyResearch = (type) => { const costs = { bounty: 500, piercing: 600, interest: 750 }; if (gold >= costs[type]) { gold -= costs[type]; if (type === 'bounty') research.bounty += 5; if (type === 'piercing') research.piercing += 2; if (type === 'interest') research.interest += 0.02; const btn = document.getElementById('res_' + type); if (btn) { btn.disabled = true; btn.innerText += " [MAX]"; } } };
window.setBuildType = t => { buildType = buildType === t ? null : t; selectedTower = null; selectedEnemy = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); if (buildType) { const btn = document.getElementById('btn_' + buildType); if (btn) btn.classList.add('active-build'); } updateSelectionUI(); drawHoverPreview(); };

window.upgradeSpeed = () => { const t = selectedTower; if (t && t.level < 25 && gold >= t.upgrades.speed * (t.type==='ACCEL'?50:30)) { gold -= t.upgrades.speed * (t.type==='ACCEL'?50:30); t.totalSpent += t.upgrades.speed * (t.type==='ACCEL'?50:30); if(t.type==='ACCEL') t.baseReload*=0.9; else if(t.type==='ICE') t.baseReload*=0.96; else t.baseReload*=0.92; t.upgrades.speed++; t.level++; towers.forEach(x => x.applyBuffs(towers)); updateSelectionUI(); } };
window.upgradeDamage = () => { const t = selectedTower; if (t && t.level < 25 && gold >= t.upgrades.damage * (t.type==='ACCEL'?60:40)) { gold -= t.upgrades.damage * (t.type==='ACCEL'?60:40); t.totalSpent += t.upgrades.damage * (t.type==='ACCEL'?60:40); t.baseDamage += (t.type==='ACCEL'?2:t.baseDamage*0.15); t.upgrades.damage++; t.level++; towers.forEach(x => x.applyBuffs(towers)); updateSelectionUI(); } };
window.upgradeRange = () => { const t = selectedTower; if (t && t.level < 25 && gold >= t.upgrades.range * (t.type==='ACCEL'?40:25)) { gold -= t.upgrades.range * (t.type==='ACCEL'?40:25); t.totalSpent += t.upgrades.range * (t.type==='ACCEL'?40:25); t.baseRange += 10; t.upgrades.range++; t.level++; towers.forEach(x => x.applyBuffs(towers)); updateSelectionUI(); } };
window.upgradeAccelDuration = () => { const t = selectedTower; if (t && t.level < 25 && gold >= t.upgrades.duration * 50) { gold -= t.upgrades.duration * 50; t.totalSpent += t.upgrades.duration * 50; t.baseDuration += 30; t.upgrades.duration++; t.level++; towers.forEach(x => x.applyBuffs(towers)); updateSelectionUI(); } };
window.upgradeEngieAmount = () => { const t = selectedTower; if (t && t.isEngie && t.level < 25 && gold >= t.upgrades.amount * 200) { gold -= t.upgrades.amount * 200; t.totalSpent += t.upgrades.amount * 200; t.upgrades.amount++; t.maxConstructs++; t.level++; updateSelectionUI(); } };
window.upgradeRadar = () => { const t = selectedTower; if (t && t.type !== 'SNIPER' && t.upgrades.radar === 0 && t.level < 25 && gold >= 150) { gold -= 150; t.totalSpent += 150; t.upgrades.radar = 1; t.level++; updateSelectionUI(); } };
window.upgradeDefenseMelt = () => { const t = selectedTower; if (t && t.level < 25 && gold >= (t.meltLevel + 1) * 50) { gold -= (t.meltLevel + 1) * 50; t.totalSpent += (t.meltLevel + 1) * 50; t.meltLevel++; t.level++; updateSelectionUI(); } };
window.upgradeSlowPower = () => { const t = selectedTower; if (t && t.level < 25 && gold >= (t.slowLevel + 1) * 40) { gold -= (t.slowLevel + 1) * 40; t.totalSpent += (t.slowLevel + 1) * 40; t.slowLevel++; t.level++; updateSelectionUI(); } };
window.cycleTargeting = () => { if (selectedTower) { const modes = ['First', 'Last', 'Strongest', 'Weakest', 'Random']; selectedTower.targetMode = modes[(modes.indexOf(selectedTower.targetMode) + 1) % modes.length]; updateSelectionUI(); } };
window.upgradeFarm = () => { const t = selectedTower; if (t && t.isFarm && t.level < 25) { let cost = 150 + t.level * 50; if(gold >= cost) { gold -= cost; t.totalSpent += cost; t.level++; t.income += 30; updateSelectionUI(); } } };
window.removeTower = () => { if (!selectedTower) return; gold += Math.floor(selectedTower.totalSpent / 2); grid[selectedTower.gy][selectedTower.gx] = 0; towers = towers.filter(t => t !== selectedTower); recalculateAllPaths(); selectedTower = null; updateSelectionUI(); };

window.togglePause = () => { isPaused = !isPaused; const btn = document.getElementById('pauseBtn'); if (btn) { btn.innerText = isPaused ? 'RESUME' : 'PAUSE'; btn.style.background = isPaused ? '#FF9800' : ''; } };
window.toggleSpeed = () => { gameSpeed = gameSpeed === 1 ? 2 : 1; const btn = document.getElementById('speedBtn'); if (btn) { btn.innerText = gameSpeed === 2 ? '2×' : '1×'; btn.classList.toggle('fast', gameSpeed === 2); } };
window.toggleMute = () => { const muteBtn = document.getElementById('muteBtn'); if (isMusicPlaying) { bgMusic.pause(); isMusicPlaying = false; if (muteBtn) { muteBtn.innerText = "🎵 PLAY MUSIC"; muteBtn.style.background = ""; } } else { bgMusic.play().catch(err => { console.error("Browser blocked audio:", err); }); isMusicPlaying = true; if (muteBtn) { muteBtn.innerText = "🎵 MUTE MUSIC"; muteBtn.style.background = "#4CAF50"; } } };

window.restartGame = () => {
  gold = 400; lives = 20; waveNumber = 0; enemiesLeftToSpawn = 0; spawnTimer = 0; waveCooldown = 0; enemies = []; towers = []; projectiles = []; particles = []; selectedTower = null; selectedEnemy = null; buildType = null; isPaused = false; isWaveActive = false; gameSpeed = 1; frameCount = 0; research = { bounty: 0, piercing: 0, interest: 0.01 };
  const pauseBtn = document.getElementById('pauseBtn'); if (pauseBtn) { pauseBtn.innerText = 'PAUSE'; pauseBtn.style.background = ''; }
  const speedBtn = document.getElementById('speedBtn'); if (speedBtn) { speedBtn.innerText = '1×'; speedBtn.classList.remove('fast'); }
  const intDisp = document.getElementById('interestDisplay'); if (intDisp) intDisp.innerText = '';
  grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));
  if (MAP_DATA[currentMapIndex].type === "FIXED") { const layout = MAP_DATA[currentMapIndex].layout; for(let y=0; y<ROWS; y++) for(let x=0; x<COLS; x++) if (layout[y] && layout[y][x] && layout[y][x] !== '0') grid[y][x] = 1; }
  updateSelectionUI(); updateWavePreview();
};

canvas.addEventListener('contextmenu', e => e.preventDefault());
canvas.addEventListener('mousedown', e => {
  const rect = canvas.getBoundingClientRect(), clickX = e.clientX - rect.left, clickY = e.clientY - rect.top, gx = Math.floor(clickX / TILE_SIZE), gy = Math.floor(clickY / TILE_SIZE);
  if (e.button === 2) { buildType = null; selectedTower = null; selectedEnemy = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); updateSelectionUI(); drawHoverPreview(); return; }
  let clickedEnemy = null;
  for (let i = enemies.length - 1; i >= 0; i--) if (Math.hypot(enemies[i].x - clickX, enemies[i].y - clickY) <= (enemies[i].type === 'BOSS' ? 30 : 22)) { clickedEnemy = enemies[i]; break; }
  if (clickedEnemy) { selectedEnemy = clickedEnemy; selectedTower = null; buildType = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); updateSelectionUI(); return; }
  const existingTower = towers.find(t => t.gx === gx && t.gy === gy);
  if (existingTower) { selectedTower = existingTower; selectedEnemy = null; buildType = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); updateSelectionUI(); return; }
  if (buildType) {
    if (buildType === 'FARM' && towers.filter(t => t.isFarm).length >= 8) { alert("Maximum of 8 Farms allowed!"); buildType = null; document.querySelectorAll('.shop-group button').forEach(b => b.classList.remove('active-build')); updateSelectionUI(); drawHoverPreview(); return; }
    const cost = TOWER_TYPES[buildType].cost;
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
      let farmGen = 0; towers.forEach(t => { if (t.isFarm) { farmGen += t.income; t.totalGenerated += t.income; } });
      const interest = Math.floor(gold * research.interest); gold += 50 + waveNumber * 10 + interest + farmGen;
      let dispText = `+ $${interest} int`; if (farmGen > 0) dispText += ` | + $${farmGen} farms`;
      const intDisp = document.getElementById('interestDisplay'); if (intDisp) intDisp.innerText = dispText;
      if (selectedTower && selectedTower.isFarm) updateSelectionUI();
      isWaveActive = false; waveCooldown = 180; updateWavePreview();
    } else {
      if (waveCooldown > 0) waveCooldown--;
      else { waveNumber++; enemiesLeftToSpawn = waveNumber % 10 === 0 ? 1 : 5 + waveNumber; spawnTimer = 999; isWaveActive = true; const intDisp = document.getElementById('interestDisplay'); if (intDisp) intDisp.innerText = ''; updateWavePreview(); }
    }
  }
  if (enemiesLeftToSpawn > 0 && ++spawnTimer >= Math.max(20, 60 - waveNumber * 2)) {
    spawnTimer = 0; let type = 'NORMAL';
    if (waveNumber % 10 === 0 && waveNumber > 0) type = 'BOSS';
    else if (waveNumber > 1) { const r = Math.random(); if (waveNumber > 12 && r > 0.9) type = 'CARRIER'; else if (waveNumber > 9 && r > 0.8) type = 'HEALER'; else if (waveNumber > 7 && r > 0.65) type = 'GHOST'; else if (waveNumber > 4 && r > 0.5) type = 'FLYER'; else if (waveNumber > 3 && r > 0.4) type = 'TANK'; else if (waveNumber > 1 && r > 0.3) type = 'RUNNER'; }
    const p = MAP_DATA[currentMapIndex].type === "FIXED" ? MAP_DATA[currentMapIndex].fixedPath : findPath();
    if (p || type === 'FLYER') enemies.push(new Enemy(p || [], type)); enemiesLeftToSpawn--;
  }
  towers.forEach(t => t.applyBuffs(towers)); towers.forEach(t => t.update());
  enemies = enemies.filter(e => { e.update(); if (!e.alive && selectedEnemy === e) { selectedEnemy = null; updateSelectionUI(); } return e.alive; });
  projectiles = projectiles.filter(p => { p.update(); return p.alive; }); particles = particles.filter(p => { p.update(); return p.life > 0; });
  if (selectedEnemy) updateSelectionUI();
}

function update() {
    requestAnimationFrame(update);
    for (let i = 0; i < gameSpeed; i++) tick();
    const goldDisp = document.getElementById('goldDisplay'); if (goldDisp) goldDisp.innerText = gold;
    const livesDisp = document.getElementById('livesDisplay'); if (livesDisp) livesDisp.innerText = lives;
    const waveDisp = document.getElementById('waveDisplay'); if (waveDisp) waveDisp.innerText = waveNumber;

    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = '#333'; for(let x=0; x<COLS; x++) for(let y=0; y<ROWS; y++) ctx.strokeRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    if (MAP_DATA[currentMapIndex] && MAP_DATA[currentMapIndex].type === "FIXED") {
      ctx.fillStyle = '#2c2c2c'; const layout = MAP_DATA[currentMapIndex].layout;
      for(let y=0; y<ROWS; y++) for(let x=0; x<COLS; x++) if (layout[y] && layout[y][x] && (layout[y][x] === '1' || layout[y][x] === 'E' || layout[y][x] === 'S')) ctx.fillRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    }
    
    ctx.fillStyle = '#2196F3'; ctx.fillRect(startPos.x*TILE_SIZE, startPos.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = '#F44336'; ctx.fillRect(endPos.x*TILE_SIZE, endPos.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
    ctx.fillStyle = 'rgba(0,0,0,0.6)'; ctx.font = 'bold 10px Arial'; ctx.textAlign = 'center';
    ctx.fillText('IN',  startPos.x * TILE_SIZE + TILE_SIZE / 2, startPos.y * TILE_SIZE + TILE_SIZE / 2 + 4);
    ctx.fillText('OUT', endPos.x   * TILE_SIZE + TILE_SIZE / 2, endPos.y   * TILE_SIZE + TILE_SIZE / 2 + 4); ctx.textAlign = 'left';

    towers.forEach(t => t.draw()); enemies.forEach(e => e.draw()); projectiles.forEach(p => p.draw()); particles.forEach(p => p.draw()); 

    if (isPaused) { ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, canvas.width, canvas.height); ctx.fillStyle = 'white'; ctx.font = 'bold 48px Arial'; ctx.textAlign = 'center'; ctx.fillText('PAUSED', canvas.width / 2, canvas.height / 2); ctx.textAlign = 'left'; }
    if (lives <= 0) { ctx.fillStyle = 'rgba(0,0,0,0.8)'; ctx.fillRect(0,0,canvas.width,canvas.height); ctx.fillStyle = 'red'; ctx.font = 'bold 50px Arial'; ctx.textAlign = 'center'; ctx.fillText("GAME OVER", canvas.width/2, canvas.height/2); ctx.textAlign = 'left'; }
}

update();