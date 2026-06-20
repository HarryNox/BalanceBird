const { Engine, Render, Runner, World, Bodies, Body, Composite, Events, Constraint } = Matter;

// Game State
let engine;
let world;
let runner;
let canvas, ctx;
let width, height;
let isPlaying = false;
let score = 0;
let scoreTimer;
let spawnTimer;
let currentScreen = 'title'; // 'title', 'playing', 'gameover', 'credits'
let bgBirds = [];

// Audio objects (ファイル名は仮置きです。用意したファイル名に合わせて変更してください)
const startSound = new Audio('start.mp3');
const gameOverSound = new Audio('gameover.mp3');

// Game Objects
let hand;
let stick;
let birds = [];

// Bird Config
const BIRD_TYPES = {
    sparrow: { mass: 0.5, radius: 10, color: '#d6d3d1', stayTime: 3000, score: 50 },
    pigeon: { mass: 1.5, radius: 15, color: '#94a3b8', stayTime: 4000, score: 100 },
    crow: { mass: 3.0, radius: 20, color: '#1e293b', stayTime: 5000, score: 300 },
    woodpecker: { mass: 1.0, radius: 12, color: '#ef4444', stayTime: 4000, score: 200 }
};

// DOM Elements
const scoreValue = document.getElementById('score-value');
const scoreDisplay = document.getElementById('score-display');
const titleScreen = document.getElementById('title-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const creditsScreen = document.getElementById('credits-screen');
const finalScore = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');
const retryBtn = document.getElementById('retry-btn');
const titleBtn = document.getElementById('title-btn');
const creditsBtn = document.getElementById('credits-btn');
const backBtn = document.getElementById('back-btn');
const container = document.getElementById('game-container');

// Input
let targetHandX = 0;

function init() {
    canvas = document.getElementById('game-canvas');
    ctx = canvas.getContext('2d');
    
    // Resize canvas
    resize();
    window.addEventListener('resize', resize);
    
    // Setup Matter.js
    engine = Engine.create();
    world = engine.world;
    engine.gravity.y = 1; // Default gravity
    
    // Inputs
    container.addEventListener('mousemove', onMouseMove);
    container.addEventListener('touchmove', onTouchMove, { passive: false });
    
    // Buttons
    startBtn.addEventListener('click', startGame);
    retryBtn.addEventListener('click', startGame);
    titleBtn.addEventListener('click', backToTitle);
    creditsBtn.addEventListener('click', showCredits);
    backBtn.addEventListener('click', hideCredits);
    
    // Generate background decorative birds
    for(let i = 0; i < 25; i++) {
        bgBirds.push({
            x: Math.random() * width,
            y: Math.random() * height,
            vx: (Math.random() - 0.5) * 1.5,
            vy: (Math.random() - 0.5) * 1.5,
            radius: Math.random() * 10 + 10,
            color: ['#d6d3d1', '#94a3b8', '#1e293b', '#ef4444'][Math.floor(Math.random()*4)]
        });
    }
    
    // Start custom render loop
    requestAnimationFrame(render);
}

function showCredits() {
    currentScreen = 'credits';
    titleScreen.classList.add('hidden');
    creditsScreen.classList.remove('hidden');
}

function hideCredits() {
    currentScreen = 'title';
    creditsScreen.classList.add('hidden');
    titleScreen.classList.remove('hidden');
}

function backToTitle() {
    currentScreen = 'title';
    gameOverScreen.classList.add('hidden');
    titleScreen.classList.remove('hidden');
    World.clear(world);
    Engine.clear(engine);
    hand = null;
    stick = null;
    birds = [];
}

function resize() {
    width = container.clientWidth;
    height = container.clientHeight;
    canvas.width = width;
    canvas.height = height;
    targetHandX = width / 2;
}

function onMouseMove(e) {
    const rect = container.getBoundingClientRect();
    targetHandX = e.clientX - rect.left;
}

function onTouchMove(e) {
    if (e.cancelable) e.preventDefault();
    const rect = container.getBoundingClientRect();
    targetHandX = e.touches[0].clientX - rect.left;
}

function startGame() {
    currentScreen = 'playing';
    isPlaying = true;
    score = 0;
    scoreValue.innerText = '0';
    
    // Play Start Sound
    startSound.currentTime = 0;
    startSound.play().catch(e => console.log("Audio play failed, user might not have interacted yet", e));
    
    // Clear old bird timers to prevent score carryover
    birds.forEach(b => clearTimeout(b.timer));
    birds = [];
    
    // Hide screens
    titleScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    scoreDisplay.classList.remove('hidden');
    
    // Clear world
    World.clear(world);
    Engine.clear(engine);
    
    // Create Hand
    const handWidth = 100;
    const handHeight = 30;
    const startX = targetHandX || (width / 2);
    
    hand = Bodies.rectangle(startX, height - 100, handWidth, handHeight, { 
        isStatic: true, // we will move it manually via Body.setPosition
        friction: 1.0,
        render: { fillStyle: '#38bdf8' }
    });
    
    // Create Stick
    const stickWidth = 15;
    const stickHeight = 400;
    stick = Bodies.rectangle(startX, height - 100 - handHeight/2 - stickHeight/2, stickWidth, stickHeight, {
        friction: 1.0,
        frictionStatic: Infinity,
        density: 0.001,
        render: { fillStyle: '#d97706' }
    });
    
    World.add(world, [hand, stick]);
    
    // Setup runner
    if (runner) Runner.stop(runner);
    runner = Runner.create();
    Runner.run(runner, engine);
    
    // Setup Score and Spawner Timers
    clearInterval(scoreTimer);
    clearTimeout(spawnTimer);
    scoreTimer = setInterval(() => {
        if (isPlaying) {
            score += 10; // base survival score
            scoreValue.innerText = score;
        }
    }, 1000);
    
    scheduleNextSpawn();
}

function scheduleNextSpawn() {
    if (!isPlaying) return;
    const delay = Math.random() * 2000 + 2000; // 2-4 seconds
    spawnTimer = setTimeout(() => {
        spawnBird();
        scheduleNextSpawn();
    }, delay);
}

function spawnBird() {
    if (!isPlaying) return;
    
    const types = ['sparrow', 'pigeon', 'crow', 'woodpecker'];
    // weighted random can be added, for now simple random
    const type = types[Math.floor(Math.random() * types.length)];
    const config = BIRD_TYPES[type];
    
    const isLeft = Math.random() > 0.5;
    const startX = isLeft ? -50 : width + 50;
    const startY = Math.random() * (height / 2);
    
    // Choose target offset on stick (-180 to 180)
    let targetOffset = (Math.random() * 300) - 150;
    if (type === 'crow') targetOffset = -180; // Crow lands near the top
    
    const side = isLeft ? -1 : 1;
    
    const bird = {
        id: Math.random().toString(36).substr(2, 9),
        type: type,
        config: config,
        state: 'flying_in', // flying_in, landed, flying_out
        x: startX,
        y: startY,
        side: side, // -1 for left of stick, 1 for right
        targetOffset: targetOffset,
        body: null,
        constraint: null,
        timer: 0,
        peckTimer: 0
    };
    
    if (type === 'sparrow' && Math.random() > 0.5) {
        // Spawn an extra sparrow occasionally
        setTimeout(() => spawnBirdByType('sparrow'), 500);
    }
    
    birds.push(bird);
}

function spawnBirdByType(type) {
    if (!isPlaying) return;
    const config = BIRD_TYPES[type];
    const isLeft = Math.random() > 0.5;
    const startX = isLeft ? -50 : width + 50;
    const startY = Math.random() * (height / 2);
    const targetOffset = (Math.random() * 300) - 150;
    const side = isLeft ? -1 : 1;
    
    birds.push({
        id: Math.random().toString(36).substr(2, 9),
        type: type,
        config: config,
        state: 'flying_in',
        x: startX,
        y: startY,
        side: side,
        targetOffset: targetOffset,
        body: null,
        constraint: null,
        timer: 0,
        peckTimer: 0
    });
}

function gameOver() {
    if (!isPlaying) return;
    isPlaying = false;
    currentScreen = 'gameover';
    clearInterval(scoreTimer);
    clearTimeout(spawnTimer);
    
    // Play Game Over Sound
    gameOverSound.currentTime = 0;
    gameOverSound.play().catch(e => console.log("Audio play failed", e));
    
    finalScore.innerText = score;
    gameOverScreen.classList.remove('hidden');
    scoreDisplay.classList.add('hidden');
    
    if (runner) Runner.stop(runner);
}

function updateGame() {
    if (!isPlaying) return;
    
    // Move hand towards targetX smoothly or instantly
    const moveX = targetHandX - hand.position.x;
    Body.setPosition(hand, { x: hand.position.x + moveX * 0.2, y: hand.position.y });
    
    // Check if stick fell down
    if (stick.position.y > height + 200 || stick.position.x < -200 || stick.position.x > width + 200) {
        gameOver();
    }
    
    // Check if stick angle is too extreme
    const angle = Math.abs(stick.angle % (Math.PI * 2));
    if (angle > 1.4 && angle < Math.PI * 2 - 1.4) {
        // Let it fall naturally
    }
    
    // Update birds
    for (let i = birds.length - 1; i >= 0; i--) {
        const bird = birds[i];
        
        if (bird.state === 'flying_in') {
            // Calculate target position based on stick position and angle
            const stickX = stick.position.x;
            const stickY = stick.position.y;
            const sAngle = stick.angle;
            
            // Local offset on stick
            const localX = 7.5 * bird.side;
            const localY = bird.targetOffset;
            
            // Global target position
            const targetX = stickX + localX * Math.cos(sAngle) - localY * Math.sin(sAngle);
            const targetY = stickY + localX * Math.sin(sAngle) + localY * Math.cos(sAngle);
            
            // Move towards target
            const dx = targetX - bird.x;
            const dy = targetY - bird.y;
            const dist = Math.sqrt(dx*dx + dy*dy);
            
            if (dist < 10) {
                // Land
                bird.state = 'landed';
                
                // Create physics body
                bird.body = Bodies.circle(targetX, targetY, bird.config.radius, {
                    mass: bird.config.mass,
                    frictionAir: 0.05,
                    collisionFilter: { group: -1 } // Don't collide with stick or hand
                });
                
                // Create constraint to attach to stick
                bird.constraint = Constraint.create({
                    bodyA: stick,
                    pointA: { x: localX + bird.config.radius * bird.side, y: localY },
                    bodyB: bird.body,
                    pointB: { x: 0, y: 0 },
                    stiffness: 1,
                    length: 0
                });
                
                World.add(world, [bird.body, bird.constraint]);
                
                // Set leave timer
                bird.timer = setTimeout(() => {
                    if (!isPlaying) return;
                    bird.state = 'flying_out';
                    World.remove(world, [bird.body, bird.constraint]);
                    score += bird.config.score; // Bonus score for surviving
                    scoreValue.innerText = score;
                }, bird.config.stayTime);
                
            } else {
                // Fly logic
                bird.x += dx * 0.1;
                bird.y += dy * 0.1;
            }
        } else if (bird.state === 'landed') {
            // Update visual position from physics body
            bird.x = bird.body.position.x;
            bird.y = bird.body.position.y;
            
            // Woodpecker mechanic
            if (bird.type === 'woodpecker') {
                bird.peckTimer++;
                if (bird.peckTimer > 30) {
                    bird.peckTimer = 0;
                    // Apply a small impulse to the stick
                    const force = 0.05 * bird.side;
                    Body.applyForce(stick, bird.body.position, { x: force * Math.cos(stick.angle), y: force * Math.sin(stick.angle) });
                }
            }
            
        } else if (bird.state === 'flying_out') {
            bird.y -= 5;
            bird.x += 5 * bird.side;
            if (bird.y < -50) {
                birds.splice(i, 1);
            }
        }
    }
}

function render() {
    requestAnimationFrame(render);
    
    if (isPlaying) {
        updateGame();
    }
    
    // Clear Canvas
    ctx.clearRect(0, 0, width, height);
    
    // Render Decorative Birds for Title/Credits
    if (currentScreen === 'title' || currentScreen === 'credits') {
        bgBirds.forEach(b => {
            b.x += b.vx;
            b.y += b.vy;
            if(b.x < -30) b.x = width + 30;
            if(b.x > width + 30) b.x = -30;
            if(b.y < -30) b.y = height + 30;
            if(b.y > height + 30) b.y = -30;
            
            ctx.save();
            ctx.translate(b.x, b.y);
            ctx.fillStyle = b.color;
            ctx.shadowColor = b.color;
            ctx.shadowBlur = 10;
            ctx.beginPath();
            ctx.arc(0, 0, b.radius, 0, Math.PI * 2);
            ctx.fill();
            
            const faceDir = b.vx > 0 ? 1 : -1;
            
            // Beak
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.moveTo(faceDir * (b.radius - 2), -b.radius/4);
            ctx.lineTo(faceDir * (b.radius + 8), -b.radius/4 + 4);
            ctx.lineTo(faceDir * (b.radius - 2), -b.radius/4 + 8);
            ctx.closePath();
            ctx.fill();
            
            // Eye
            ctx.fillStyle = '#000';
            ctx.beginPath();
            ctx.arc(faceDir * (b.radius/2), -b.radius/3, 2, 0, Math.PI*2);
            ctx.fill();
            
            ctx.restore();
        });
    }
    
    // Render Dead Birds for GameOver
    if (currentScreen === 'gameover') {
        const centerX = width / 2;
        const centerY = height / 2 - 150; // テキストよりも上の位置に変更
        
        const drawDeadBird = (x, y, radius, color) => {
            ctx.save();
            ctx.translate(x, y);
            ctx.fillStyle = color;
            ctx.shadowColor = color;
            ctx.shadowBlur = 15;
            ctx.beginPath();
            ctx.arc(0, 0, radius, 0, Math.PI * 2);
            ctx.fill();
            
            // Beak pointing up (lying on back)
            ctx.fillStyle = '#fbbf24';
            ctx.beginPath();
            ctx.moveTo(-4, -radius + 2);
            ctx.lineTo(0, -radius - 12);
            ctx.lineTo(4, -radius + 2);
            ctx.closePath();
            ctx.fill();
            
            // X eyes
            ctx.strokeStyle = '#000';
            ctx.lineWidth = 2;
            const drawX = (ex, ey) => {
                ctx.beginPath();
                ctx.moveTo(ex - 4, ey - 4);
                ctx.lineTo(ex + 4, ey + 4);
                ctx.moveTo(ex + 4, ey - 4);
                ctx.lineTo(ex - 4, ey + 4);
                ctx.stroke();
            }
            drawX(-8, -radius/2);
            drawX(8, -radius/2);
            
            ctx.restore();
        };
        
        drawDeadBird(centerX - 70, centerY, 35, '#ef4444'); // 赤色に変更
        drawDeadBird(centerX + 70, centerY, 25, '#d6d3d1'); // Sparrow
    }
    
    // Draw Hand
    if (hand) {
        ctx.save();
        ctx.translate(hand.position.x, hand.position.y);
        ctx.rotate(hand.angle);
        
        // Stylized cartoon hand (white glove)
        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = 'rgba(255,255,255,0.3)';
        ctx.shadowBlur = 10;
        
        // Base of glove
        ctx.beginPath();
        ctx.roundRect(-45, -5, 90, 20, 10);
        ctx.fill();
        
        // Fingers
        for(let i=0; i<4; i++) {
            ctx.beginPath();
            ctx.roundRect(-40 + i*22, -15, 18, 20, 9);
            ctx.fill();
        }
        
        // Outline for style
        ctx.strokeStyle = '#94a3b8';
        ctx.lineWidth = 2;
        ctx.beginPath();
        ctx.roundRect(-45, -5, 90, 20, 10);
        ctx.stroke();
        for(let i=0; i<4; i++) {
            ctx.beginPath();
            ctx.roundRect(-40 + i*22, -15, 18, 20, 9);
            ctx.stroke();
        }
        
        ctx.restore();
    }
    
    // Draw Stick
    if (stick) {
        ctx.save();
        ctx.translate(stick.position.x, stick.position.y);
        ctx.rotate(stick.angle);
        
        // Chopstick wood color
        ctx.fillStyle = '#e5c088';
        ctx.shadowColor = 'rgba(0,0,0,0.4)';
        ctx.shadowBlur = 15;
        
        ctx.beginPath();
        // Tapered chopstick
        ctx.moveTo(-5, -200);
        ctx.lineTo(5, -200);
        ctx.lineTo(7.5, 200);
        ctx.lineTo(-7.5, 200);
        ctx.closePath();
        ctx.fill();
        
        // Split line at the top
        ctx.strokeStyle = '#cda260';
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(0, -200);
        ctx.lineTo(0, -100);
        ctx.stroke();
        
        ctx.restore();
    }
    
    // Draw Birds
    birds.forEach(bird => {
        ctx.save();
        ctx.translate(bird.x, bird.y);
        
        ctx.fillStyle = bird.config.color;
        ctx.shadowColor = ctx.fillStyle;
        ctx.shadowBlur = 10;
        
        ctx.beginPath();
        ctx.arc(0, 0, bird.config.radius, 0, Math.PI * 2);
        ctx.fill();
        
        // Draw eyes or beak for detail
        if (bird.state === 'flying_in' || bird.state === 'landed') {
             const faceDir = bird.state === 'flying_in' ? (bird.x < (stick ? stick.position.x : width/2) ? 1 : -1) : -bird.side;
             
             // Beak
             ctx.fillStyle = '#fbbf24'; // Yellow beak
             ctx.beginPath();
             ctx.moveTo(faceDir * (bird.config.radius - 2), -bird.config.radius/4);
             ctx.lineTo(faceDir * (bird.config.radius + 8), -bird.config.radius/4 + 4);
             ctx.lineTo(faceDir * (bird.config.radius - 2), -bird.config.radius/4 + 8);
             ctx.closePath();
             ctx.fill();
             
             // Eye
             ctx.fillStyle = '#000';
             ctx.beginPath();
             ctx.arc(faceDir * (bird.config.radius/2), -bird.config.radius/3, 2, 0, Math.PI*2);
             ctx.fill();
        }
        
        ctx.restore();
    });
}

// Start
window.onload = init;
