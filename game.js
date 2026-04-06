window.onload = () => {
    const canvas = document.getElementById('gameCanvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');

    const TILE_SIZE = 40;
    const COLS = canvas.width / TILE_SIZE; 
    const ROWS = canvas.height / TILE_SIZE;

    // --- CONFIGS ---
    const TOWER_TYPES = {
        PISTOL:  { color: '#4CAF50', range: 150, reload: 40, damage: 2, cost: 50,  bullet: 'orange' },
        SNIPER:  { color: '#2196F3', range: 350, reload: 100, damage: 15, cost: 150, bullet: 'white' },
        MINIGUN: { color: '#FF9800', range: 120, reload: 6,  damage: 0.5, cost: 200, bullet: 'yellow' },
        BUFF:    { color: '#FFD700', range: 100, reload: 0,  damage: 0, cost: 150, isBuff: true }
    };

    const ENEMY_TYPES = {
        NORMAL:  { color: '#9C27B0', speed: 1.2, hp: 10,  reward: 15 },
        RUNNER:  { color: '#FFEB3B', speed: 2.8, hp: 6,   reward: 10 },
        TANK:    { color: '#420000', speed: 0.6, hp: 50,  reward: 40 },
        BOSS:    { color: '#000000', speed: 0.4, hp: 400, reward: 200 }
    };

    // --- STATE ---
    let gold = 200;
    let lives = 20;
    let waveNumber = 0;
    let buildType = 'PISTOL';
    let selectedTower = null;
    let enemiesLeftToSpawn = 0;
    let spawnTimer = 0;
    let waveCooldown = 0;

    const startPos = { x: 0, y: Math.floor(ROWS / 2) };
    const endPos = { x: COLS - 1, y: Math.floor(ROWS / 2) };
    const grid = Array.from({ length: ROWS }, () => Array(COLS).fill(0));

    let enemyPath = [];
    let enemies = [];
    let towers = [];
    let projectiles = [];

    // --- CLASSES ---
    class Enemy {
        constructor(path, typeKey) {
            const stats = ENEMY_TYPES[typeKey];
            this.path = path;
            this.pathIndex = 0;
            this.type = typeKey;
            this.x = startPos.x * TILE_SIZE + TILE_SIZE / 2;
            this.y = startPos.y * TILE_SIZE + TILE_SIZE / 2;
            this.speed = stats.speed;
            this.color = stats.color;
            // Health scales up by 15% each wave
            this.maxHealth = Math.floor(stats.hp * Math.pow(1.15, waveNumber));
            this.health = this.maxHealth;
            this.reward = stats.reward;
            this.alive = true;
        }
        update() {
            if (this.pathIndex >= this.path.length) { this.alive = false; lives--; return; }
            const target = this.path[this.pathIndex];
            const tx = target.x * TILE_SIZE + TILE_SIZE / 2;
            const ty = target.y * TILE_SIZE + TILE_SIZE / 2;
            const dist = Math.hypot(tx - this.x, ty - this.y);
            if (dist < this.speed) this.pathIndex++;
            else {
                this.x += ((tx - this.x) / dist) * this.speed;
                this.y += ((ty - this.y) / dist) * this.speed;
            }
            if (this.health <= 0) { this.alive = false; gold += this.reward; }
        }
        draw() {
            ctx.fillStyle = this.color;
            ctx.beginPath(); ctx.arc(this.x, this.y, this.type === 'BOSS' ? 18 : 12, 0, Math.PI * 2); ctx.fill();
            ctx.fillStyle = 'red'; ctx.fillRect(this.x - 15, this.y - 22, 30, 4);
            ctx.fillStyle = 'green'; ctx.fillRect(this.x - 15, this.y - 22, (this.health / this.maxHealth) * 30, 4);
        }
    }

    class Tower {
        constructor(gx, gy, typeKey) {
            this.gx = gx; this.gy = gy;
            this.x = gx * TILE_SIZE + TILE_SIZE / 2;
            this.y = gy * TILE_SIZE + TILE_SIZE / 2;
            this.type = typeKey;
            this.range = TOWER_TYPES[typeKey].range;
            this.reloadTime = TOWER_TYPES[typeKey].reload;
            this.damage = TOWER_TYPES[typeKey].damage;
            this.color = TOWER_TYPES[typeKey].color;
            this.level = 1; this.timer = 0; this.buffed = false;
            this.targetMode = "First"; 
        }
        update() {
            if (TOWER_TYPES[this.type].isBuff) {
                towers.forEach(t => { if (t !== this && Math.hypot(this.x - t.x, this.y - t.y) < this.range) t.buffed = true; });
                return;
            }
            this.timer++;
            const currentReload = this.buffed ? this.reloadTime / 2 : this.reloadTime;
            const currentDamage = this.buffed ? this.damage * 1.5 : this.damage;

            if (this.timer >= currentReload) {
                let inRange = enemies.filter(e => Math.hypot(e.x - this.x, e.y - this.y) < this.range);
                if (inRange.length > 0) {
                    if (this.targetMode === "First") inRange.sort((a, b) => b.pathIndex - a.pathIndex);
                    else if (this.targetMode === "Last") inRange.sort((a, b) => a.pathIndex - b.pathIndex);
                    else if (this.targetMode === "Strongest") inRange.sort((a, b) => b.health - a.health);
                    else if (this.targetMode === "Weakest") inRange.sort((a, b) => a.health - b.health);

                    const target = inRange[0];
                    projectiles.push(new Projectile(this.x, this.y, target, currentDamage, TOWER_TYPES[this.type].bullet));
                    this.timer = 0;
                }
            }
            this.buffed = false; 
        }
        draw() {
            if (selectedTower === this) {
                ctx.strokeStyle = 'white'; ctx.lineWidth = 1; ctx.setLineDash([5, 5]);
                ctx.beginPath(); ctx.arc(this.x, this.y, this.range, 0, Math.PI*2); ctx.stroke();
                ctx.setLineDash([]);
            }
            ctx.fillStyle = this.color;
            ctx.fillRect(this.gx * TILE_SIZE + 4, this.gy * TILE_SIZE + 4, TILE_SIZE - 8, TILE_SIZE - 8);
        }
    }

    class Projectile {
        constructor(x, y, target, damage, color) {
            this.x = x; this.y = y; this.target = target;
            this.damage = damage; this.color = color;
            this.speed = 8; this.alive = true;
        }
        update() {
            const dx = this.target.x - this.x; const dy = this.target.y - this.y;
            const dist = Math.hypot(dx, dy);
            if (dist < 5) { this.target.health -= this.damage; this.alive = false; }
            else { this.x += (dx / dist) * this.speed; this.y += (dy / dist) * this.speed; }
            if (!this.target.alive) this.alive = false;
        }
        draw() { ctx.fillStyle = this.color; ctx.beginPath(); ctx.arc(this.x, this.y, 4, 0, Math.PI * 2); ctx.fill(); }
    }

    // --- ACTIONS ---
    window.setBuildType = (t) => buildType = t;

    window.cycleTargeting = () => {
        if (!selectedTower) return;
        const modes = ["First", "Last", "Strongest", "Weakest"];
        let idx = modes.indexOf(selectedTower.targetMode);
        selectedTower.targetMode = modes[(idx + 1) % modes.length];
        document.getElementById('targetBtn').innerText = selectedTower.targetMode;
    };

    window.upgradeSpeed = () => { if (selectedTower && gold >= selectedTower.level * 30) { gold -= selectedTower.level * 30; selectedTower.reloadTime *= 0.8; selectedTower.level++; } };
    window.upgradeDamage = () => { if (selectedTower && gold >= selectedTower.level * 40) { gold -= selectedTower.level * 40; selectedTower.damage *= 1.5; selectedTower.level++; } };
    
    window.removeTower = () => {
        if (selectedTower) {
            gold += Math.floor(TOWER_TYPES[selectedTower.type].cost / 2);
            grid[selectedTower.gy][selectedTower.gx] = 0;
            towers = towers.filter(t => t !== selectedTower);
            enemyPath = findPath();
            selectedTower = null;
            document.getElementById('upgradeMenu').style.display = 'none';
        }
    };

    function findPath() {
        const queue = [[startPos.x, startPos.y, []]];
        const visited = new Set([`${startPos.x},${startPos.y}`]);
        while (queue.length > 0) {
            const [x, y, path] = queue.shift();
            const currentPath = [...path, { x, y }];
            if (x === endPos.x && y === endPos.y) return currentPath;
            const neighbors = [{x:x+1, y}, {x:x-1, y}, {x, y:y+1}, {x, y:y-1}];
            for (const n of neighbors) {
                if (n.x >= 0 && n.x < COLS && n.y >= 0 && n.y < ROWS && grid[n.y][n.x] === 0 && !visited.has(`${n.x},${n.y}`)) {
                    visited.add(`${n.x},${n.y}`); queue.push([n.x, n.y, currentPath]);
                }
            }
        }
        return [];
    }

    canvas.addEventListener('mousedown', (e) => {
        const rect = canvas.getBoundingClientRect();
        const gx = Math.floor((e.clientX - rect.left) / TILE_SIZE);
        const gy = Math.floor((e.clientY - rect.top) / TILE_SIZE);
        
        const existing = towers.find(t => t.gx === gx && t.gy === gy);
        if (existing) {
            selectedTower = existing;
            document.getElementById('upgradeMenu').style.display = 'flex';
            document.getElementById('targetBtn').innerText = selectedTower.targetMode;
        } else {
            const cost = TOWER_TYPES[buildType].cost;
            if (gold >= cost && grid[gy][gx] === 0) {
                if ((gx === startPos.x && gy === startPos.y) || (gx === endPos.x && gy === endPos.y)) return;
                grid[gy][gx] = 1;
                const path = findPath();
                if (path.length > 0) { 
                    gold -= cost; 
                    enemyPath = path; 
                    towers.push(new Tower(gx, gy, buildType)); 
                } else { 
                    grid[gy][gx] = 0; 
                }
            }
            selectedTower = null;
            document.getElementById('upgradeMenu').style.display = 'none';
        }
    });

    function update() {
        if (lives <= 0) {
            ctx.fillStyle = "black"; ctx.fillRect(0,0,canvas.width,canvas.height);
            ctx.fillStyle = "red"; ctx.font = "50px Arial"; ctx.fillText("GAME OVER", canvas.width/2-150, canvas.height/2);
            return;
        }
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        
        document.getElementById('goldDisplay').innerText = gold;
        document.getElementById('livesDisplay').innerText = lives;
        document.getElementById('waveDisplay').innerText = waveNumber;
        if(selectedTower) document.getElementById('lvlDisplay').innerText = selectedTower.level;

        // Grid lines
        ctx.strokeStyle = '#333'; ctx.lineWidth = 1;
        for(let x=0; x<COLS; x++) for(let y=0; y<ROWS; y++) ctx.strokeRect(x*TILE_SIZE, y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        
        // Portals
        ctx.fillStyle = '#2196F3'; ctx.fillRect(startPos.x*TILE_SIZE, startPos.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);
        ctx.fillStyle = '#F44336'; ctx.fillRect(endPos.x*TILE_SIZE, endPos.y*TILE_SIZE, TILE_SIZE, TILE_SIZE);

        // --- NEW WAVE LOGIC ---
        if (enemies.length === 0 && enemiesLeftToSpawn === 0) {
            if (waveCooldown <= 0) {
                waveNumber++;
                enemiesLeftToSpawn = (waveNumber % 10 === 0) ? 1 : 5 + waveNumber;
                waveCooldown = 120; // 2 second pause between waves
            } else {
                waveCooldown--;
                ctx.fillStyle = "white"; ctx.font = "20px Arial";
                ctx.fillText(`Wave ${waveNumber + 1} starting...`, canvas.width/2 - 70, 30);
            }
        }

        // --- ENEMY SELECTION LOGIC ---
        if (enemiesLeftToSpawn > 0 && ++spawnTimer % 60 === 0) {
            let type = 'NORMAL';
            
            if (waveNumber <= 5) {
                // First 5 waves: Only Normal and Speedy (Runner)
                type = Math.random() > 0.7 ? 'RUNNER' : 'NORMAL';
            } else {
                // Wave 6+: Introduce Tanks and Bosses
                if (waveNumber % 10 === 0) {
                    type = 'BOSS';
                } else {
                    const roll = Math.random();
                    if (roll > 0.85) type = 'TANK';
                    else if (roll > 0.65) type = 'RUNNER';
                    else type = 'NORMAL';
                }
            }

            enemies.push(new Enemy(enemyPath, type)); 
            enemiesLeftToSpawn--;
        }

        towers.forEach(t => { t.update(); t.draw(); });
        enemies = enemies.filter(e => { e.update(); e.draw(); return e.alive; });
        projectiles = projectiles.filter(p => { p.update(); p.draw(); return p.alive; });
        
        requestAnimationFrame(update);
    }

    enemyPath = findPath();
    update();
};