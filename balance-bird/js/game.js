// Matter.js modules
const Engine = Matter.Engine,
      Render = Matter.Render,
      Runner = Matter.Runner,
      Bodies = Matter.Bodies,
      Composite = Matter.Composite,
      Constraint = Matter.Constraint,
      Events = Matter.Events,
      Body = Matter.Body,
      Vector = Matter.Vector;

// Game State
let engine, render, runner;
let hand, chopstick, handJoint;
let gameActive = false;
let score = 0;
let scoreInterval;
let birds = []; // active birds
let targetHandX = window.innerWidth / 2;

// DOM Elements
const uiLayer = document.getElementById('ui-layer');
const titleScreen = document.getElementById('title-screen');
const gameOverScreen = document.getElementById('game-over-screen');
const scoreContainer = document.getElementById('score-container');
const scoreValue = document.getElementById('score-value');
const finalScore = document.getElementById('final-score');
const startBtn = document.getElementById('start-btn');
const retryBtn = document.getElementById('retry-btn');

// Constants
const CHOPSTICK_LENGTH = Math.min(window.innerHeight * 0.6, 600);
const CHOPSTICK_WIDTH = 12;
const HAND_WIDTH = 100;
const HAND_HEIGHT = 20;
const HAND_Y = window.innerHeight - 100;
const MAX_ANGLE = Math.PI / 2.5; // ~72 degrees

// Bird Types
const BIRD_TYPES = {
    SPARROW: { mass: 0.5, size: 15, color: '#4a4a4a', stayTime: 3000, name: 'スズメ' },
    PIGEON: { mass: 1.5, size: 25, color: '#888888', stayTime: 4000, name: 'ハト' },
    CROW: { mass: 3.5, size: 35, color: '#1a1a1a', stayTime: 5000, name: 'カラス', preferTop: true },
    WOODPECKER: { mass: 1.0, size: 20, color: '#c83232', stayTime: 4000, name: 'キツツキ', vibrates: true }
};

// Initialize Game
function init() {
    // Setup Matter.js Engine
    engine = Engine.create();
    
    // Adjust gravity for a slightly slower, more floaty feel to allow human reaction
    engine.gravity.y = 0.5;

    // Setup Renderer
    render = Render.create({
        element: document.getElementById('game-container'),
        engine: engine,
        options: {
            width: window.innerWidth,
            height: window.innerHeight,
            wireframes: false,
            background: 'transparent',
            pixelRatio: window.devicePixelRatio
        }
    });

    Render.run(render);
    runner = Runner.create();

    // Event Listeners for UI
    startBtn.addEventListener('click', startGame);
    retryBtn.addEventListener('click', startGame);

    // Event Listeners for Input
    window.addEventListener('mousemove', handleInput);
    window.addEventListener('touchmove', handleInput, { passive: false });
    
    // Handle Window Resize
    window.addEventListener('resize', handleResize);
    
    // Physics Loop Events
    Events.on(engine, 'beforeUpdate', updatePhysics);
}

// Start/Restart Game
function startGame() {
    gameActive = true;
    score = 0;
    scoreValue.innerText = '0';
    birds = [];
    targetHandX = window.innerWidth / 2;
    
    // Hide UI
    titleScreen.classList.add('hidden');
    gameOverScreen.classList.add('hidden');
    scoreContainer.classList.remove('hidden');

    // Clear World
    Composite.clear(engine.world);
    Engine.clear(engine);

    // Create Objects
    createPlayerObjects();

    // Start Engine
    Runner.run(runner, engine);

    // Score Timer
    clearInterval(scoreInterval);
    scoreInterval = setInterval(() => {
        if (gameActive) {
            score += 10;
            // Extra points for birds currently on chopstick
            score += birds.filter(b => b.attached).length * 5;
            scoreValue.innerText = score;
        }
    }, 100);
    
    // Start Bird Spawning
    scheduleNextBird();
}

// Create Hand and Chopstick
function createPlayerObjects() {
    // Hand (Kinematic Body)
    hand = Bodies.rectangle(window.innerWidth / 2, HAND_Y, HAND_WIDTH, HAND_HEIGHT, { 
        isStatic: false,
        isKinematic: true, // Controlled by code, not gravity
        friction: 0.5,
        render: { fillStyle: '#2c3e50' }
    });

    // Chopstick (Dynamic Body)
    chopstick = Bodies.rectangle(window.innerWidth / 2, HAND_Y - CHOPSTICK_LENGTH / 2, CHOPSTICK_WIDTH, CHOPSTICK_LENGTH, {
        frictionAir: 0.02, // Air resistance helps stabilize slightly
        density: 0.001,
        render: { fillStyle: '#8B5A2B' } // Wood color
    });

    // Joint connecting Hand and bottom of Chopstick
    handJoint = Constraint.create({
        bodyA: hand,
        pointA: { x: 0, y: -HAND_HEIGHT / 2 },
        bodyB: chopstick,
        pointB: { x: 0, y: CHOPSTICK_LENGTH / 2 - 5 },
        stiffness: 1,
        length: 0,
        render: { visible: false }
    });

    Composite.add(engine.world, [hand, chopstick, handJoint]);
}

// Input Handling
function handleInput(e) {
    if (!gameActive) return;
    
    if (e.type === 'touchmove') {
        e.preventDefault(); // Prevent scrolling on touch
        targetHandX = e.touches[0].clientX;
    } else {
        targetHandX = e.clientX;
    }
    
    // Constrain to screen width
    targetHandX = Math.max(HAND_WIDTH/2, Math.min(window.innerWidth - HAND_WIDTH/2, targetHandX));
}

// Update loop called before each physics step
function updatePhysics() {
    if (!gameActive) return;

    // Move hand smoothly towards targetX using velocity
    const dx = targetHandX - hand.position.x;
    Body.setVelocity(hand, { x: dx * 0.2, y: 0 }); // Smooth lerp factor
    Body.setPosition(hand, { x: hand.position.x, y: HAND_Y }); // Keep Y locked

    // Check Chopstick Angle
    const angle = Math.abs(chopstick.angle);
    if (angle > MAX_ANGLE) {
        gameOver();
    }

    // Update Birds
    birds.forEach(birdObj => {
        if (!birdObj.attached && !birdObj.leaving) {
            // Lerp bird towards landing spot
            const targetPos = getLandingPosition(birdObj.offsetY);
            const moveX = (targetPos.x - birdObj.body.position.x) * 0.05;
            const moveY = (targetPos.y - birdObj.body.position.y) * 0.05;
            
            Body.setVelocity(birdObj.body, { x: moveX, y: moveY });

            // Check if close enough to attach
            const dist = Vector.magnitude(Vector.sub(targetPos, birdObj.body.position));
            if (dist < 20) {
                attachBird(birdObj);
            }
        } else if (birdObj.attached) {
            // Woodpecker vibration
            if (birdObj.type.vibrates && Math.random() < 0.1) {
                const forceX = (Math.random() - 0.5) * 0.005;
                Body.applyForce(chopstick, birdObj.body.position, { x: forceX, y: 0 });
            }
        }
    });
}

// Bird Logic
function scheduleNextBird() {
    if (!gameActive) return;
    
    // Spawn rate increases with score
    const baseDelay = 3000;
    const timeDiff = Math.max(500, baseDelay - (score * 0.2));
    const delay = timeDiff + Math.random() * 2000;

    setTimeout(() => {
        if (gameActive) {
            spawnBird();
            scheduleNextBird();
        }
    }, delay);
}

function spawnBird() {
    // Choose bird type
    const rand = Math.random();
    let type;
    if (rand < 0.5) type = BIRD_TYPES.SPARROW;
    else if (rand < 0.75) type = BIRD_TYPES.PIGEON;
    else if (rand < 0.9) type = BIRD_TYPES.WOODPECKER;
    else type = BIRD_TYPES.CROW;

    // Landing position (offset from center of chopstick)
    // 0 is center, -CHOPSTICK_LENGTH/2 is top, CHOPSTICK_LENGTH/2 is bottom
    let offsetY = (Math.random() - 0.5) * (CHOPSTICK_LENGTH * 0.8);
    if (type.preferTop) {
        offsetY = -CHOPSTICK_LENGTH * 0.4 + (Math.random() * 50); // Near top
    }

    // Spawn side
    const side = Math.random() > 0.5 ? 1 : -1;
    const startX = side === 1 ? window.innerWidth + 50 : -50;
    const startY = 100 + Math.random() * (window.innerHeight / 2);

    const birdBody = Bodies.circle(startX, startY, type.size, {
        isSensor: true, // Don't collide until attached
        frictionAir: 0.1,
        render: { fillStyle: type.color }
    });

    Composite.add(engine.world, birdBody);

    birds.push({
        body: birdBody,
        type: type,
        offsetY: offsetY,
        attached: false,
        leaving: false,
        constraint: null
    });
    
    // If sparrow, sometimes spawn a flock
    if (type === BIRD_TYPES.SPARROW && Math.random() > 0.5) {
        setTimeout(spawnBird, 300);
    }
}

// Calculate world position on chopstick given a local Y offset
function getLandingPosition(offsetY) {
    const angle = chopstick.angle;
    // Chopstick center is at chopstick.position
    // Calculate vector from center
    const dx = offsetY * Math.sin(angle);
    const dy = offsetY * Math.cos(angle);
    
    return {
        x: chopstick.position.x - dx,
        y: chopstick.position.y + dy
    };
}

function attachBird(birdObj) {
    birdObj.attached = true;
    
    // Make it solid and set mass
    birdObj.body.isSensor = false;
    Body.setMass(birdObj.body, birdObj.type.mass);
    
    // Create joint to chopstick
    birdObj.constraint = Constraint.create({
        bodyA: chopstick,
        pointA: { x: 0, y: birdObj.offsetY },
        bodyB: birdObj.body,
        pointB: { x: 0, y: 0 },
        stiffness: 1,
        length: 0,
        render: { visible: false }
    });

    Composite.add(engine.world, birdObj.constraint);

    // Schedule leaving
    setTimeout(() => {
        if (gameActive && birdObj.attached) {
            leaveBird(birdObj);
        }
    }, birdObj.type.stayTime + Math.random() * 1000);
}

function leaveBird(birdObj) {
    birdObj.attached = false;
    birdObj.leaving = true;
    
    // Remove constraint
    if (birdObj.constraint) {
        Composite.remove(engine.world, birdObj.constraint);
    }

    // Apply recoil force to chopstick (push it down slightly as bird jumps off)
    const recoilForce = birdObj.type.mass * 0.005;
    Body.applyForce(chopstick, birdObj.body.position, { x: 0, y: recoilForce });

    // Fly away upwards
    birdObj.body.isSensor = true; // prevent colliding with other birds
    const flyDirX = (Math.random() - 0.5) * 10;
    Body.setVelocity(birdObj.body, { x: flyDirX, y: -15 });

    // Remove from world after a while
    setTimeout(() => {
        Composite.remove(engine.world, birdObj.body);
        birds = birds.filter(b => b !== birdObj);
    }, 2000);
}

// Game Over
function gameOver() {
    if (!gameActive) return;
    gameActive = false;
    clearInterval(scoreInterval);

    // Stop runner so physics freeze slightly, or let it fall?
    // Let it fall! Just don't let player control hand anymore.
    Body.setKinematic(hand, false); // Hand falls down too!
    
    setTimeout(() => {
        Runner.stop(runner);
        finalScore.innerText = score;
        scoreContainer.classList.add('hidden');
        gameOverScreen.classList.remove('hidden');
    }, 1500); // Wait 1.5s to watch it fall
}

function handleResize() {
    render.canvas.width = window.innerWidth;
    render.canvas.height = window.innerHeight;
    render.options.width = window.innerWidth;
    render.options.height = window.innerHeight;
    
    if (gameActive) {
        // Just update hand position lock
        // Not perfect if resized massively during play, but acceptable
    }
}

// Initialize on load
window.onload = init;
