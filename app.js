/* ==========================================================================
   WEB BUILDER / BUG BLASTER - RETRO GAME ENGINE
   ========================================================================== */
const canvas = document.getElementById('game-canvas');
const ctx = canvas.getContext('2d');

// Game constants
const CANVAS_WIDTH = 600;
const CANVAS_HEIGHT = 400;

// Game State variables
let gameState = 'START'; // START, PLAYING, GAMEOVER, WIN
let score = 0;
let lives = 3;
let isMuted = false;

// Entities arrays
let player;
let playerBullets = [];
let enemyBullets = [];
let enemies = [];
let shields = [];
let particles = [];

// Input controls states
const keys = {
    left: false,
    right: false,
    space: false
};

// Speed multipliers
let enemySpeedX = 1.0;
let enemyDirection = 1; // 1 = right, -1 = left
let enemyStepDown = false;
let timeSinceLastBeat = 0;
let beatTempo = 1000; // time in ms between heartbeat synth pulses
let beatToggle = false;

// Audio Context init
let audioCtx = null;
function initAudio() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
}

// Procedural Synth Sound Generator
function playSound(freqStart, freqEnd, duration, type = 'sine', volume = 0.15) {
    if (isMuted) return;
    try {
        initAudio();
        const osc = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();
        
        osc.connect(gainNode);
        gainNode.connect(audioCtx.destination);
        
        osc.type = type;
        osc.frequency.setValueAtTime(freqStart, audioCtx.currentTime);
        if (freqEnd && freqEnd !== freqStart) {
            osc.frequency.exponentialRampToValueAtTime(freqEnd, audioCtx.currentTime + duration);
        }
        
        gainNode.gain.setValueAtTime(volume, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        
        osc.start();
        osc.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.warn('Sound play failed', e);
    }
}

// ==========================================================================
// PIXEL SPRITE MATRICES FOR THE BUGS & PLAYER
// ==========================================================================
const PIXEL_SIZE = 2; // Each cell in sprite drawn as pixel size

// BUG SPRITES (11x8 grids)
const BUG_SPRITES = [
    // Type 0: SyntaxError Bug (Red)
    [
        [0,0,1,0,0,0,0,0,1,0,0],
        [0,0,0,1,0,0,0,1,0,0,0],
        [0,0,1,1,1,1,1,1,1,0,0],
        [0,1,1,0,1,1,1,0,1,1,0],
        [1,1,1,1,1,1,1,1,1,1,1],
        [1,0,1,1,1,1,1,1,1,0,1],
        [1,0,1,0,0,0,0,0,1,0,1],
        [0,0,0,1,1,0,1,1,0,0,0]
    ],
    // Type 1: NullPointer Bug (Pink)
    [
        [0,0,0,1,1,0,1,1,0,0,0],
        [0,1,1,1,1,1,1,1,1,1,0],
        [1,1,1,1,1,1,1,1,1,1,1],
        [1,1,1,0,0,1,0,0,1,1,1],
        [1,1,1,1,1,1,1,1,1,1,1],
        [0,0,1,1,1,0,1,1,1,0,0],
        [0,1,1,0,0,0,0,0,1,1,0],
        [1,1,0,0,0,0,0,0,0,1,1]
    ],
    // Type 2: StackOverflow Bug (Purple)
    [
        [0,0,0,0,1,1,1,0,0,0,0],
        [0,0,1,1,1,1,1,1,1,0,0],
        [0,1,1,1,1,1,1,1,1,1,0],
        [1,1,0,1,1,0,1,1,0,1,1],
        [1,1,1,1,1,1,1,1,1,1,1],
        [0,0,0,1,1,0,1,1,0,0,0],
        [0,0,1,1,0,0,0,1,1,0,0],
        [1,1,0,0,0,0,0,0,0,1,1]
    ]
];

// PLAYER SPRITE (13x8 grid) - Styled like a bracket spaceship < >
const PLAYER_SPRITE = [
    [0,0,0,0,0,1,0,0,0,0,0],
    [0,0,0,0,1,1,1,0,0,0,0],
    [0,0,0,0,1,1,1,0,0,0,0],
    [0,1,1,1,1,1,1,1,1,1,0],
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1],
    [1,1,1,1,1,1,1,1,1,1,1]
];

// Helper to draw sprite cell matrix
function drawSprite(ctx, sprite, x, y, color) {
    ctx.fillStyle = color;
    for (let r = 0; r < sprite.length; r++) {
        for (let c = 0; c < sprite[r].length; c++) {
            if (sprite[r][c] === 1) {
                ctx.fillRect(
                    x + (c * PIXEL_SIZE), 
                    y + (r * PIXEL_SIZE), 
                    PIXEL_SIZE, 
                    PIXEL_SIZE
                );
            }
        }
    }
}

// ==========================================================================
// GAME ENTITIES CLASSES
// ==========================================================================

class Player {
    constructor() {
        this.width = 11 * PIXEL_SIZE * 1.5; // Scaled up
        this.height = 8 * PIXEL_SIZE * 1.5;
        this.x = CANVAS_WIDTH / 2 - this.width / 2;
        this.y = CANVAS_HEIGHT - 35;
        this.speed = 4.5;
        this.color = '#00f0ff';
        this.cooldown = 0;
    }

    update() {
        if (keys.left) {
            this.x -= this.speed;
            tiltHardwareJoystick(-12);
        } else if (keys.right) {
            this.x += this.speed;
            tiltHardwareJoystick(12);
        } else {
            tiltHardwareJoystick(0);
        }

        // Clamp inside bounds
        if (this.x < 10) this.x = 10;
        if (this.x > CANVAS_WIDTH - this.width - 10) {
            this.x = CANVAS_WIDTH - this.width - 10;
        }

        if (this.cooldown > 0) this.cooldown--;

        // Shoot laser
        if (keys.space && this.cooldown === 0) {
            this.shoot();
        }
    }

    shoot() {
        playerBullets.push(new Bullet(this.x + this.width / 2, this.y, -6.5, '#00f0ff'));
        this.cooldown = 24; // rate of fire delay
        playSound(600, 150, 0.12, 'sawtooth', 0.1);
        pressHardwareButton(true);
        setTimeout(() => pressHardwareButton(false), 100);
    }

    draw() {
        // Draw scaled bracket spaceship
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1.5, 1.5);
        drawSprite(ctx, PLAYER_SPRITE, 0, 0, this.color);
        ctx.restore();
        
        // Add subtle neon glow line under ship
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 8;
        ctx.fillStyle = this.color;
        ctx.fillRect(this.x - 2, this.y + this.height + 4, this.width + 4, 2);
        ctx.shadowBlur = 0;
    }
}

class Bullet {
    constructor(x, y, speedY, color) {
        this.x = x;
        this.y = y;
        this.width = 3;
        this.height = 10;
        this.speedY = speedY;
        this.color = color;
    }

    update() {
        this.y += this.speedY;
    }

    draw() {
        ctx.fillStyle = this.color;
        ctx.shadowColor = this.color;
        ctx.shadowBlur = 6;
        ctx.fillRect(this.x - this.width / 2, this.y, this.width, this.height);
        ctx.shadowBlur = 0;
    }
}

class Enemy {
    constructor(x, y, type) {
        this.x = x;
        this.y = y;
        this.type = type; // 0, 1, 2
        this.sprite = BUG_SPRITES[type];
        this.width = 11 * PIXEL_SIZE * 1.5;
        this.height = 8 * PIXEL_SIZE * 1.5;
        
        // Error names mapping
        const colors = ['#ff007f', '#ff8b00', '#9d4edd'];
        this.color = colors[type];
    }

    update(speedX, stepDownY) {
        this.x += speedX;
        if (stepDownY) {
            this.y += 18;
        }
    }

    draw() {
        ctx.save();
        ctx.translate(this.x, this.y);
        ctx.scale(1.5, 1.5);
        drawSprite(ctx, this.sprite, 0, 0, this.color);
        ctx.restore();
    }
}

class Shield {
    constructor(x, y) {
        this.x = x;
        this.y = y;
        this.grid = [];
        this.blockW = 4;
        this.blockH = 4;
        
        // Pre-fill a nice dome shape shield
        const shape = [
            [0,0,1,1,1,1,1,1,1,1,1,0,0],
            [0,1,1,1,1,1,1,1,1,1,1,1,0],
            [1,1,1,1,1,1,1,1,1,1,1,1,1],
            [1,1,1,1,0,0,0,0,0,1,1,1,1],
            [1,1,1,0,0,0,0,0,0,0,1,1,1]
        ];
        
        for (let r = 0; r < shape.length; r++) {
            for (let c = 0; c < shape[r].length; c++) {
                if (shape[r][c] === 1) {
                    this.grid.push({
                        relX: c * this.blockW,
                        relY: r * this.blockH,
                        active: true
                    });
                }
            }
        }
    }

    draw() {
        ctx.fillStyle = '#39ff14'; // Matrix neon green shield
        this.grid.forEach(pixel => {
            if (pixel.active) {
                ctx.fillRect(this.x + pixel.relX, this.y + pixel.relY, this.blockW, this.blockH);
            }
        });
    }
}

class Particle {
    constructor(x, y, color) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 3 + 1;
        this.speedX = (Math.random() * 4) - 2;
        this.speedY = (Math.random() * 4) - 2;
        this.life = 1.0;
        this.decay = Math.random() * 0.04 + 0.02;
        this.color = color;
    }

    update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
    }

    draw() {
        ctx.save();
        ctx.globalAlpha = this.life;
        ctx.fillStyle = this.color;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
    }
}

// ==========================================================================
// SPAWN ENGINE & INITIALIZATION
// ==========================================================================

function spawnEnemies() {
    enemies = [];
    const cols = 8;
    const rows = 3;
    const spacingX = 50;
    const spacingY = 40;
    const startX = 60;
    const startY = 70;

    for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
            enemies.push(new Enemy(
                startX + (c * spacingX), 
                startY + (r * spacingY), 
                r % 3 // Row cycles different bug types
            ));
        }
    }
}

function spawnShields() {
    shields = [];
    // Spawn 3 bunkers spread evenly
    shields.push(new Shield(90, CANVAS_HEIGHT - 90));
    shields.push(new Shield(270, CANVAS_HEIGHT - 90));
    shields.push(new Shield(450, CANVAS_HEIGHT - 90));
}

function createExplosion(x, y, color) {
    const count = 12;
    for (let i = 0; i < count; i++) {
        particles.push(new Particle(x, y, color));
    }
}

function initGame() {
    score = 0;
    lives = 3;
    enemySpeedX = 0.9;
    enemyDirection = 1;
    beatTempo = 850;
    
    player = new Player();
    playerBullets = [];
    enemyBullets = [];
    particles = [];
    
    spawnEnemies();
    spawnShields();
    updateHUD();
}

// ==========================================================================
// COLLISION & LOGIC UPDATES
// ==========================================================================

function handleCollisions() {
    // 1. Player Bullets hitting Enemies
    for (let b = playerBullets.length - 1; b >= 0; b--) {
        const bullet = playerBullets[b];
        let hit = false;
        
        for (let e = enemies.length - 1; e >= 0; e--) {
            const enemy = enemies[e];
            
            if (bullet.x > enemy.x && 
                bullet.x < enemy.x + enemy.width &&
                bullet.y > enemy.y && 
                bullet.y < enemy.y + enemy.height) {
                
                // Explode bug
                createExplosion(enemy.x + enemy.width / 2, enemy.y + enemy.height / 2, enemy.color);
                playSound(300, 50, 0.25, 'sawtooth', 0.12);
                
                enemies.splice(e, 1);
                playerBullets.splice(b, 1);
                score += 100;
                updateHUD();
                
                // Accelerate remaining bugs
                enemySpeedX += 0.08;
                beatTempo = Math.max(200, beatTempo - 30);
                
                hit = true;
                break;
            }
        }
        
        if (hit) continue;
        
        // 2. Player Bullets hitting Shields
        for (let s = 0; s < shields.length; s++) {
            const shield = shields[s];
            if (bullet.x > shield.x && bullet.x < shield.x + (13 * shield.blockW) &&
                bullet.y > shield.y && bullet.y < shield.y + (5 * shield.blockH)) {
                
                // Detailed pixel check
                for (let p = 0; p < shield.grid.length; p++) {
                    const block = shield.grid[p];
                    if (block.active) {
                        const bx = shield.x + block.relX;
                        const by = shield.y + block.relY;
                        
                        if (bullet.x >= bx && bullet.x <= bx + shield.blockW &&
                            bullet.y >= by && bullet.y <= by + shield.blockH) {
                            
                            block.active = false;
                            playerBullets.splice(b, 1);
                            playSound(180, 80, 0.08, 'triangle', 0.08);
                            hit = true;
                            break;
                        }
                    }
                }
            }
            if (hit) break;
        }
    }

    // 3. Enemy Bullets hitting Player
    for (let b = enemyBullets.length - 1; b >= 0; b--) {
        const bullet = enemyBullets[b];
        
        if (bullet.x > player.x && 
            bullet.x < player.x + player.width &&
            bullet.y > player.y && 
            bullet.y < player.y + player.height) {
            
            // Hit!
            enemyBullets.splice(b, 1);
            lives--;
            updateHUD();
            
            createExplosion(player.x + player.width / 2, player.y + player.height / 2, player.color);
            playSound(150, 40, 0.4, 'sine', 0.25);
            
            if (lives <= 0) {
                gameState = 'GAMEOVER';
                document.getElementById('final-score-val').innerText = score;
                document.getElementById('game-over-screen').classList.remove('hidden');
                playSound(100, 30, 0.8, 'sawtooth', 0.25);
            }
            continue;
        }
        
        // 4. Enemy Bullets hitting Shields
        let shieldHit = false;
        for (let s = 0; s < shields.length; s++) {
            const shield = shields[s];
            if (bullet.x > shield.x && bullet.x < shield.x + (13 * shield.blockW) &&
                bullet.y > shield.y && bullet.y < shield.y + (5 * shield.blockH)) {
                
                for (let p = 0; p < shield.grid.length; p++) {
                    const block = shield.grid[p];
                    if (block.active) {
                        const bx = shield.x + block.relX;
                        const by = shield.y + block.relY;
                        
                        if (bullet.x >= bx && bullet.x <= bx + shield.blockW &&
                            bullet.y >= by && bullet.y <= by + shield.blockH) {
                            
                            block.active = false;
                            enemyBullets.splice(b, 1);
                            playSound(180, 80, 0.08, 'triangle', 0.08);
                            shieldHit = true;
                            break;
                        }
                    }
                }
            }
            if (shieldHit) break;
        }
    }
}

function updateHUD() {
    document.getElementById('score-val').innerText = String(score).padStart(4, '0');
    
    // Refresh hearts
    const livesContainer = document.getElementById('lives-container');
    livesContainer.innerHTML = '';
    for (let i = 0; i < lives; i++) {
        livesContainer.innerHTML += '<i class="fa-solid fa-heart"></i> ';
    }
}

// ==========================================================================
// CORE GAME LOOP
// ==========================================================================

function updateGame(deltaTime) {
    if (gameState !== 'PLAYING') return;

    player.update();

    // 1. Move Bullets
    playerBullets.forEach(b => b.update());
    enemyBullets.forEach(b => b.update());

    // Clean bullets offscreen
    playerBullets = playerBullets.filter(b => b.y > 0);
    enemyBullets = enemyBullets.filter(b => b.y < CANVAS_HEIGHT);

    // 2. Move Enemies
    let hitWall = false;
    enemies.forEach(enemy => {
        enemy.update(enemySpeedX * enemyDirection, enemyStepDown);
        
        if (enemy.x <= 10 || enemy.x >= CANVAS_WIDTH - enemy.width - 10) {
            hitWall = true;
        }

        // Win condition for bugs: they reach the shields row
        if (enemy.y >= player.y - 20) {
            gameState = 'GAMEOVER';
            document.getElementById('final-score-val').innerText = score;
            document.getElementById('game-over-screen').classList.remove('hidden');
            playSound(120, 30, 0.8, 'sawtooth', 0.25);
        }
    });

    // Reset step down flag
    if (enemyStepDown) enemyStepDown = false;

    // Bounce bugs off walls
    if (hitWall) {
        enemyDirection = -enemyDirection;
        enemyStepDown = true; // Drop them on next update
    }

    // 3. Enemy Shoot random lasers
    if (enemies.length > 0 && Math.random() < 0.015) {
        const randomEnemy = enemies[Math.floor(Math.random() * enemies.length)];
        enemyBullets.push(new Bullet(
            randomEnemy.x + randomEnemy.width / 2, 
            randomEnemy.y + randomEnemy.height, 
            3.5, 
            randomEnemy.color
        ));
    }

    // 4. Update Particles
    particles.forEach(p => p.update());
    particles = particles.filter(p => p.life > 0);

    // 5. Handle Collisions
    handleCollisions();

    // 6. Check Win Game state
    if (enemies.length === 0) {
        gameState = 'WIN';
        document.getElementById('win-score-val').innerText = score;
        document.getElementById('win-screen').classList.remove('hidden');
        playSound(440, 880, 0.25, 'triangle', 0.15);
        setTimeout(() => playSound(880, 1760, 0.4, 'sine', 0.15), 150);
    }

    // 7. Pulse retro heartbeat rhythm
    timeSinceLastBeat += deltaTime;
    if (timeSinceLastBeat >= beatTempo) {
        timeSinceLastBeat = 0;
        beatToggle = !beatToggle;
        // Synthesize space-invader speed heart beats
        playSound(beatToggle ? 90 : 70, beatToggle ? 90 : 70, 0.1, 'triangle', 0.12);
    }
}

function drawGame() {
    ctx.clearRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Game screen background elements (retro matrix codes/stars grid)
    ctx.fillStyle = 'rgba(255, 255, 255, 0.01)';
    ctx.fillRect(0, 0, CANVAS_WIDTH, CANVAS_HEIGHT);

    // Draw entities
    if (gameState === 'PLAYING' || gameState === 'GAMEOVER' || gameState === 'WIN') {
        player.draw();
        
        enemies.forEach(enemy => enemy.draw());
        shields.forEach(shield => shield.draw());
        playerBullets.forEach(b => b.draw());
        enemyBullets.forEach(b => b.draw());
        particles.forEach(p => p.draw());
    }
}

let lastTime = 0;
function gameLoop(timestamp) {
    if (!lastTime) lastTime = timestamp;
    const deltaTime = timestamp - lastTime;
    lastTime = timestamp;

    updateGame(deltaTime);
    drawGame();

    requestAnimationFrame(gameLoop);
}

// ==========================================================================
// PHYSICAL CABINET CONTROLS FEEDBACK
// ==========================================================================

const hardwareJoystick = document.getElementById('hardware-joystick');
const hardwareBtnShoot = document.getElementById('hardware-btn-shoot');

function tiltHardwareJoystick(deg) {
    if (hardwareJoystick) {
        hardwareJoystick.style.transform = `rotate(${deg}deg)`;
    }
}

function pressHardwareButton(isActive) {
    if (hardwareBtnShoot) {
        if (isActive) {
            hardwareBtnShoot.classList.add('active');
        } else {
            hardwareBtnShoot.classList.remove('active');
        }
    }
}

// ==========================================================================
// EVENT LISTENERS & INCOMING INPUTS
// ==========================================================================

// Keyboard Handler
window.addEventListener('keydown', (e) => {
    if (gameState !== 'PLAYING') return;

    if (e.key === 'ArrowLeft' || e.key === 'a') {
        keys.left = true;
    }
    if (e.key === 'ArrowRight' || e.key === 'd') {
        keys.right = true;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
        keys.space = true;
        e.preventDefault(); // Stop page scrolling down on Space
    }
});

window.addEventListener('keyup', (e) => {
    if (e.key === 'ArrowLeft' || e.key === 'a') {
        keys.left = false;
    }
    if (e.key === 'ArrowRight' || e.key === 'd') {
        keys.right = false;
    }
    if (e.key === ' ' || e.key === 'Spacebar') {
        keys.space = false;
    }
});

// Mobile / Click controls
const mobileLeft = document.getElementById('mobile-left');
const mobileRight = document.getElementById('mobile-right');
const mobileFire = document.getElementById('mobile-fire');

// Touch interactions for Mobile
if (mobileLeft) {
    const handleLeftStart = (e) => { keys.left = true; e.preventDefault(); };
    const handleLeftEnd = (e) => { keys.left = false; e.preventDefault(); };
    mobileLeft.addEventListener('touchstart', handleLeftStart, { passive: false });
    mobileLeft.addEventListener('touchend', handleLeftEnd, { passive: false });
    mobileLeft.addEventListener('mousedown', () => keys.left = true);
    mobileLeft.addEventListener('mouseup', () => keys.left = false);
    mobileLeft.addEventListener('mouseleave', () => keys.left = false);
}

if (mobileRight) {
    const handleRightStart = (e) => { keys.right = true; e.preventDefault(); };
    const handleRightEnd = (e) => { keys.right = false; e.preventDefault(); };
    mobileRight.addEventListener('touchstart', handleRightStart, { passive: false });
    mobileRight.addEventListener('touchend', handleRightEnd, { passive: false });
    mobileRight.addEventListener('mousedown', () => keys.right = true);
    mobileRight.addEventListener('mouseup', () => keys.right = false);
    mobileRight.addEventListener('mouseleave', () => keys.right = false);
}

if (mobileFire) {
    const handleFireStart = (e) => { keys.space = true; e.preventDefault(); };
    const handleFireEnd = (e) => { keys.space = false; e.preventDefault(); };
    mobileFire.addEventListener('touchstart', handleFireStart, { passive: false });
    mobileFire.addEventListener('touchend', handleFireEnd, { passive: false });
    mobileFire.addEventListener('mousedown', () => keys.space = true);
    mobileFire.addEventListener('mouseup', () => keys.space = false);
}

// Hardware Controls Clicks (let visitors click arcade cabinet layout to play!)
if (hardwareBtnShoot) {
    hardwareBtnShoot.addEventListener('mousedown', () => {
        if (gameState === 'PLAYING') {
            keys.space = true;
        }
    });
    hardwareBtnShoot.addEventListener('mouseup', () => {
        keys.space = false;
    });
}

// Sound toggle button click
const btnMute = document.getElementById('btn-mute');
if (btnMute) {
    btnMute.addEventListener('click', () => {
        isMuted = !isMuted;
        if (isMuted) {
            btnMute.innerHTML = '<i class="fa-solid fa-volume-xmark"></i> AUDIO: OFF';
            btnMute.style.color = '#ff007f';
        } else {
            btnMute.innerHTML = '<i class="fa-solid fa-volume-high"></i> AUDIO: ON';
            btnMute.style.color = '#00f0ff';
            playSound(400, 600, 0.15, 'sine', 0.1);
        }
    });
}

// Start screen actions
const startScreen = document.getElementById('start-screen');
const btnStartGame = document.getElementById('btn-start-game');

function startGameSession() {
    initAudio();
    gameState = 'PLAYING';
    startScreen.classList.add('hidden');
    document.getElementById('game-over-screen').classList.add('hidden');
    document.getElementById('win-screen').classList.add('hidden');
    initGame();
}

if (btnStartGame) btnStartGame.addEventListener('click', startGameSession);
// Let clicks on Screen start game too
if (startScreen) {
    startScreen.addEventListener('click', (e) => {
        if (e.target !== btnStartGame) {
            startGameSession();
        }
    });
}

// Restart button actions
const btnRestartGame = document.getElementById('btn-restart-game');
if (btnRestartGame) btnRestartGame.addEventListener('click', startGameSession);

// Win play again button actions
const btnPlayAgain = document.getElementById('btn-play-again');
if (btnPlayAgain) btnPlayAgain.addEventListener('click', startGameSession);

// Kickstart requestAnimationFrame Loop
requestAnimationFrame(gameLoop);
