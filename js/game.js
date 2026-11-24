
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const TILE = 60;
const WORLD_COLS = 13;
const WORLD_ROWS = 19;
const WORLD_WIDTH = WORLD_COLS * TILE;
const WORLD_HEIGHT = WORLD_ROWS * TILE;


// ASSASSINATOR PLAYER SPRITE
const playerSprite = new Image();

playerSprite.src = "assets/assassinator_player_walk_transparent.png";

let playerSpriteLoaded = false;

playerSprite.onload = () => {
  playerSpriteLoaded = true;
  console.log("ASSASSINATOR player sprite loaded!");
};

playerSprite.onerror = () => {
  console.error("Could not load ASSASSINATOR player sprite.");
};


let screenWidth = innerWidth;
let screenHeight = innerHeight;

function resizeCanvas() {
  const dpr = devicePixelRatio || 1;
  screenWidth = innerWidth;
  screenHeight = innerHeight;
  canvas.width = screenWidth * dpr;
  canvas.height = screenHeight * dpr;
  canvas.style.width = screenWidth + "px";
  canvas.style.height = screenHeight + "px";
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}
addEventListener("resize", resizeCanvas);
resizeCanvas();

const map = Array.from({ length: WORLD_ROWS },
  () => Array(WORLD_COLS).fill(0));

for (let x = 0; x < WORLD_COLS; x++) {
  map[0][x] = 1;
  map[WORLD_ROWS - 1][x] = 1;
}
for (let y = 0; y < WORLD_ROWS; y++) {
  map[y][0] = 1;
  map[y][WORLD_COLS - 1] = 1;
}


const obstacles = [
  // =====================================
  // CONCRETE — INDICES 0 TO 46
  // =====================================

  // Row 2
  [3, 2, 1, 1],
  [8, 2, 1, 1],

  // Row 3
  [2, 3, 1, 1],
  [3, 3, 1, 1],
  [8, 3, 1, 1],

  // Row 4
  [2, 4, 1, 1],
  [5, 4, 1, 1],
  [8, 4, 1, 1],

  // Row 5
  [2, 5, 1, 1],
  [5, 5, 1, 1],
  [7, 5, 1, 1],
  [8, 5, 1, 1],

  // Row 6
  [5, 6, 1, 1],
  [8, 6, 1, 1],
  [9, 6, 1, 1],
  [10, 6, 1, 1],

  // Row 7
  [3, 7, 1, 1],
  [4, 7, 1, 1],
  [9, 7, 1, 1],

  // Row 9
  [2, 9, 1, 1],
  [3, 9, 1, 1],
  [4, 9, 1, 1],

  // Row 10
  [2, 10, 1, 1],
  [6, 10, 1, 1],

  // Row 11
  [2, 11, 1, 1],
  [5, 11, 1, 1],
  [6, 11, 1, 1],
  [7, 11, 1, 1],
  [9, 11, 1, 1],
  [10, 11, 1, 1],

  // Row 12
  [3, 12, 1, 1],
  [4, 12, 1, 1],
  [5, 12, 1, 1],

  // Row 13
  [2, 13, 1, 1],
  [8, 13, 1, 1],

  // Row 14
  [2, 14, 1, 1],
  [5, 14, 1, 1],
  [6, 14, 1, 1],
  [7, 14, 1, 1],
  [8, 14, 1, 1],

  // Row 15
  [2, 15, 1, 1],
  [3, 15, 1, 1],
  [5, 15, 1, 1],
  [8, 15, 1, 1],

  // Row 16
  [2, 16, 1, 1],
  [5, 16, 1, 1],
  [8, 16, 1, 1],

// WOODEN CRATES — INDICES 47 TO 53

[5, 7, 1, 1],
[5, 2, 1, 1],
[5, 3, 1, 1],
[11, 10, 1, 8], // Eight boundary crates
[3, 16, 1, 1],  // Existing lower-left junction crate
[2, 12, 1, 1],  // Wooden crate at concrete junction
[4, 11, 1, 1],  // Additional middle-left wooden crate

// BLUE CARGO — INDEX 54 ONWARD

[11, 1, 1, 3],
[10, 1, 1, 1],
[9, 10, 2, 1],
[9, 14, 1, 3],
[9, 4, 1, 2],
[7, 7, 2, 1],
[7, 16, 1, 1],
[8, 16, 1, 1],
[1, 1, 2, 2], // Top-left 2×2 deep teal-blue cargo container
];



// Add every obstacle to the collision map.
for (const [x, y, w, h] of obstacles) {
  for (let row = y; row < y + h; row++) {
    for (let col = x; col < x + w; col++) {
      map[row][col] = 1;
    }
  }
}


const player = {
  x: TILE * 6.5,
  y: TILE * 17.5,
  speed: 190,
  radius: 19,
  health: 100,
  maxHealth: 100,
  angle: -Math.PI / 2,
  walkTime: 0
};

const camera = { x: 0, y: 0, smoothness: 5 };

const keys = {};
let path = [];
let pathIndex = 0;
let targetGuard = null;
let chaseStartTile = "";
let chaseGoalTile = "";
let eliminated = 0;
let lastTime = 0;
let message = "";
let messageTime = 0;

const directions = [
  [0, -1], [0, 1], [-1, 0], [1, 0]
];

function isWalkable(x, y) {
  return x >= 0 && y >= 0 &&
    x < WORLD_COLS && y < WORLD_ROWS &&
    map[y][x] === 0;
}

function canStandAt(x, y) {
  const r = player.radius;
  return [
    [x-r, y-r], [x+r, y-r],
    [x-r, y+r], [x+r, y+r]
  ].every(([px, py]) =>
    isWalkable(Math.floor(px/TILE), Math.floor(py/TILE))
  );
}

function nearestWalkableTile(col, row) {
  if (isWalkable(col, row)) return { x: col, y: row };

  for (let r = 1; r <= 5; r++) {
    for (let y = row-r; y <= row+r; y++) {
      for (let x = col-r; x <= col+r; x++) {
        if (Math.max(Math.abs(x-col), Math.abs(y-row)) === r &&
            isWalkable(x, y)) return { x, y };
      }
    }
  }
  return null;
}

function clearLine(x1, y1, x2, y2) {
  const distance = Math.hypot(x2 - x1, y2 - y1);
  const steps = Math.ceil(distance / 4);

  for (let i = 1; i < steps; i++) {
    const t = i / steps;

    const x = x1 + (x2 - x1) * t;
    const y = y1 + (y2 - y1) * t;

    const tileX = Math.floor(x / TILE);
    const tileY = Math.floor(y / TILE);

    if (!isWalkable(tileX, tileY)) {
      return false;
    }
  }

  return true;
}

function angleDifference(a, b) {
  return Math.atan2(Math.sin(a-b), Math.cos(a-b));
}

// A* pathfinding.
function findPath(start, goal, safe = false) {
  const key = (x,y) => `${x},${y}`;
  const startKey = key(start.x,start.y);
  const goalKey = key(goal.x,goal.y);

  const open = [{
    x:start.x, y:start.y, g:0, f:0
  }];

  const costs = new Map([[startKey,0]]);
  const previous = new Map();
  const closed = new Set();

  while (open.length) {
    open.sort((a,b) => a.f-b.f);
    const current = open.shift();
    const ck = key(current.x,current.y);

    if (closed.has(ck)) continue;
    closed.add(ck);

    if (ck === goalKey) {
  const result = [];
  let k = goalKey;

  // Reconstruct the complete path, including the destination tile.
  while (k !== startKey) {
    const [x, y] = k.split(",").map(Number);

    // Include the current tile in the route.
    result.unshift({ x, y });

    const p = previous.get(k);

    if (!p) return [];

    k = key(p.x, p.y);
  }

  return result.map(p => ({
    x: (p.x + 0.5) * TILE,
    y: (p.y + 0.5) * TILE
  }));
}

    for (const [dx,dy] of directions) {
      const nx = current.x+dx;
      const ny = current.y+dy;
      if (!isWalkable(nx,ny)) continue;

      const nk = key(nx,ny);
      if (closed.has(nk)) continue;

      const wx = (nx+0.5)*TILE;
      const wy = (ny+0.5)*TILE;

      let penalty = 0;
      if (safe) {
        for (const guard of guards) {
          if (guard.dead || guard.state === "alert") continue;
          if (guardCanSeePoint(guard,wx,wy)) penalty += 8;
        }
      }

      const newCost = current.g+1+penalty;

      if (!costs.has(nk) || newCost < costs.get(nk)) {
        costs.set(nk,newCost);

        // Store the previous tile, not the destination tile.
        previous.set(nk, {
          x: current.x,
          y: current.y
        });

        const heuristic = Math.abs(goal.x-nx)+Math.abs(goal.y-ny);
        open.push({
          x:nx,y:ny,g:newCost,f:newCost+heuristic
        });
      }
    }
  }
  return [];
}

function makeGuard(x, y, patrol) {
  return {
    x: x * TILE + TILE / 2,
    y: y * TILE + TILE / 2,
    angle: Math.random() * Math.PI * 2,

    // Slightly different speed for every guard.
    speed: 60 + Math.random() * 15,
    patrolSpeed: 48 + Math.random() * 24,

    patrol: patrol.map(([px, py]) => ({
      x: px * TILE + TILE / 2,
      y: py * TILE + TILE / 2
    })),

    // Independent patrol route.
    patrolPath: [],
    patrolPathIndex: 0,
    patrolTarget: null,

    // Different starting delay for every guard.
    patrolPause: Math.random() * 3,

    state: "patrol",
    dead: false,
    shotCooldown: 0,
    suspicion: 0,
    lastSeenX: x * TILE + TILE / 2,
    lastSeenY: y * TILE + TILE / 2,
    searchTimer: 0,
    searchPath: [],
    searchPathIndex: 0
  };
}

function choosePatrolDestination(guard) {
  const start = {
    x: Math.floor(guard.x / TILE),
    y: Math.floor(guard.y / TILE)
  };

  const candidates = [];

  // Collect walkable destinations throughout the room.
  for (let y = 1; y < WORLD_ROWS - 1; y++) {
    for (let x = 1; x < WORLD_COLS - 1; x++) {
      if (!isWalkable(x, y)) continue;

      const distance =
        Math.abs(x - start.x) + Math.abs(y - start.y);

      // Avoid choosing destinations too close to the guard.
      if (distance >= 6) {
        candidates.push({ x, y });
      }
    }
  }

  // Try random destinations until a valid route is found.
  while (candidates.length > 0) {
    const index = Math.floor(Math.random() * candidates.length);
    const destination = candidates.splice(index, 1)[0];

    const newPath = findPath(start, destination, false);

    if (newPath.length > 0) {
      guard.patrolTarget = destination;
      guard.patrolPath = newPath;
      guard.patrolPathIndex = 0;
      return true;
    }
  }

  return false;
}

const guards = [
  makeGuard(6, 5, [
    [6,5], [7,5], [7,6], [6,6]
  ]),

  makeGuard(11, 2, [
  [11,2], [10,2], [10,3], [11,3]
]),

  makeGuard(5, 9, [
    [5,9], [5,10], [6,10], [6,9]
  ]),

  makeGuard(9, 9, [
  [9,9], [9,10], [8,10], [8,9]
])
];
// Shorter and narrower vision.
const VISION_RANGE = TILE*2.5;
const VISION_ANGLE = Math.PI/4;

function guardCanSeePoint(guard,x,y) {
  const dx=x-guard.x;
  const dy=y-guard.y;
  const distance=Math.hypot(dx,dy);

  if (distance > VISION_RANGE) return false;
  if (distance < 1) return true;

  const angle=Math.atan2(dy,dx);

  if (Math.abs(angleDifference(angle,guard.angle)) >
      VISION_ANGLE/2) return false;

  return clearLine(guard.x,guard.y,x,y);
}

function guardSeesPlayer(guard) {
  return guardCanSeePoint(guard,player.x,player.y);
}

// Clicking a guard sends the player towards its current position.
// The route is calculated once and does not chase its changing direction.
// Lock onto the selected guard and continuously follow it.
function selectGuard(guard) {
  if (!guard || guard.dead) return;

  targetGuard = guard;

  chaseStartTile = "";
  chaseGoalTile = "";

  path = [];
  pathIndex = 0;

  showMessage("Target locked! Chasing guard...");
}

function showMessage(text) {
  message=text;
  messageTime=2;
}

// Guard detection, searching and patrol.

function updateGuards(delta) {
  for (const guard of guards) {
    if (guard.dead) continue;

    guard.shotCooldown = Math.max(
      0,
      guard.shotCooldown - delta
    );

    const sees = guardSeesPlayer(guard);

    // =====================================
    // PLAYER VISIBLE: ALERT AND PURSUE
    // =====================================
    if (sees) {
      guard.state = "alert";
      guard.suspicion = 1;

      guard.lastSeenX = player.x;
      guard.lastSeenY = player.y;

      guard.searchTimer = 8;
      guard.searchPath = [];
      guard.searchPathIndex = 0;

      guard.angle = Math.atan2(
        player.y - guard.y,
        player.x - guard.x
      );

      if (guard.shotCooldown <= 0) {
        player.health = Math.max(
          0,
          player.health - 8
        );

        guard.shotCooldown = 1.2;
        showMessage("You've been hit!");
      }

      continue;
    }

    // =====================================
    // PLAYER HIDDEN: INVESTIGATE LAST POSITION
    // =====================================
    if (guard.state === "alert") {
      guard.state = "search";
      guard.searchTimer = 8;

      const start = {
        x: Math.floor(guard.x / TILE),
        y: Math.floor(guard.y / TILE)
      };

      const goal = {
        x: Math.floor(guard.lastSeenX / TILE),
        y: Math.floor(guard.lastSeenY / TILE)
      };

      guard.searchPath = findPath(
        start,
        goal,
        false
      );

      guard.searchPathIndex = 0;
    }

    // =====================================
    // SEARCH USING A* PATHFINDING
    // =====================================
    if (guard.state === "search") {
      guard.searchTimer -= delta;

      if (
        guard.searchPathIndex <
        guard.searchPath.length
      ) {
        const waypoint =
          guard.searchPath[guard.searchPathIndex];

        const dx = waypoint.x - guard.x;
        const dy = waypoint.y - guard.y;

        const distance = Math.hypot(dx, dy);

        if (distance < 5) {
          guard.searchPathIndex++;
        } else {
          guard.angle = Math.atan2(dy, dx);

          const step = Math.min(
            guard.speed * 1.2 * delta,
            distance
          );

          guard.x += (dx / distance) * step;
          guard.y += (dy / distance) * step;
        }
      }

      if (guard.searchTimer <= 0) {
        guard.state = "patrol";
        guard.suspicion = 0;

        guard.searchPath = [];
        guard.searchPathIndex = 0;

        guard.patrolTarget = null;
        guard.patrolPath = [];
        guard.patrolPathIndex = 0;

        guard.patrolPause = 0.8;
      }

      continue;
    }

    // =====================================
    // NORMAL INDEPENDENT PATROL
    // =====================================
    if (guard.patrolPause > 0) {
      guard.patrolPause -= delta;
      continue;
    }

    if (!guard.patrolTarget) {
      if (!choosePatrolDestination(guard)) {
        guard.patrolPause = 1;
        continue;
      }
    }

    if (
      guard.patrolPathIndex >=
      guard.patrolPath.length
    ) {
      guard.patrolTarget = null;
      guard.patrolPath = [];
      guard.patrolPathIndex = 0;

      guard.patrolPause =
        0.7 + Math.random() * 1.8;

      continue;
    }

    const waypoint =
      guard.patrolPath[guard.patrolPathIndex];

    const dx = waypoint.x - guard.x;
    const dy = waypoint.y - guard.y;

    const distance = Math.hypot(dx, dy);

    if (distance < 4) {
      guard.patrolPathIndex++;
      continue;
    }

    guard.angle = Math.atan2(dy, dx);

    const step = Math.min(
      guard.patrolSpeed * delta,
      distance
    );

    guard.x += (dx / distance) * step;
    guard.y += (dy / distance) * step;
  }
}

function updatePlayer(delta) {
  let dx = 0;
  let dy = 0;

  // Manual keyboard movement takes priority.
  if (keys.w || keys.arrowup) dy--;
  if (keys.s || keys.arrowdown) dy++;
  if (keys.a || keys.arrowleft) dx--;
  if (keys.d || keys.arrowright) dx++;

  if (dx || dy) {
    path = [];
    pathIndex = 0;
    targetGuard = null;

    chaseStartTile = "";
    chaseGoalTile = "";

    const length = Math.hypot(dx, dy);
    movePlayer(dx / length, dy / length, delta);

    player.health = Math.max(0, player.health);
    return;
  }

  // Automatically chase the selected guard.
  if (targetGuard) {
    if (targetGuard.dead) {
      targetGuard = null;
      path = [];
      pathIndex = 0;
      return;
    }

    const guard = targetGuard;

    const distance = Math.hypot(
      guard.x - player.x,
      guard.y - player.y
    );

    // Automatically assassinate when close enough.
    if (distance <= 40) {
      assassinateGuard(guard);
      return;
    }

    // Recalculate the route whenever the player or guard
    // enters a different tile.
    const startX = Math.floor(player.x / TILE);
    const startY = Math.floor(player.y / TILE);

    const goalX = Math.floor(guard.x / TILE);
    const goalY = Math.floor(guard.y / TILE);

    const startKey = `${startX},${startY}`;
    const goalKey = `${goalX},${goalY}`;

    if (
      startKey !== chaseStartTile ||
      goalKey !== chaseGoalTile
    ) {
      chaseStartTile = startKey;
      chaseGoalTile = goalKey;

      path = findPath(
        { x: startX, y: startY },
        { x: goalX, y: goalY },
        false
      );

      pathIndex = 0;
    }

    // Follow the calculated route around obstacles.
    if (pathIndex < path.length) {
      const waypoint = path[pathIndex];

      const vx = waypoint.x - player.x;
      const vy = waypoint.y - player.y;
      const waypointDistance = Math.hypot(vx, vy);

      if (waypointDistance < 5) {
        pathIndex++;
      } else {
        movePlayer(
          vx / waypointDistance,
          vy / waypointDistance,
          delta
        );
      }
    } else {
      // Once the player reaches the guard's tile,
      // move directly towards the guard's current position.
      const vx = guard.x - player.x;
      const vy = guard.y - player.y;
      const currentDistance = Math.hypot(vx, vy);

      if (currentDistance > 1) {
        movePlayer(
          vx / currentDistance,
          vy / currentDistance,
          delta
        );
      }
    }
 // Check again after movement.
    if (
      Math.hypot(guard.x - player.x, guard.y - player.y) <= 40
    ) {
      assassinateGuard(guard);
    }

    player.health = Math.max(0, player.health);
    return;
  }

  // Normal tap-to-move behaviour when no guard is selected.
  if (pathIndex < path.length) {
    const target = path[pathIndex];

    const vx = target.x - player.x;
    const vy = target.y - player.y;
    const distance = Math.hypot(vx, vy);

    if (distance < 5) {
      pathIndex++;
    } else {
      movePlayer(vx / distance, vy / distance, delta);
    }
  }

  player.health = Math.max(0, player.health);
}

function assassinateGuard(guard) {
  if (!guard || guard.dead) return;

  // Stop the assassin at the guard's exact position.
  player.x = guard.x;
  player.y = guard.y;

  // Eliminate the guard.
  guard.dead = true;
  eliminated++;

  // Cancel every remaining movement instruction.
  targetGuard = null;
  path = [];
  pathIndex = 0;

  chaseStartTile = "";
  chaseGoalTile = "";

  showMessage("Guard assassinated!");

  // Update the target counter.
  document.getElementById("target-counter").textContent =
    `🎯 ${eliminated} / ${guards.length}`;
}


function movePlayer(dx, dy, delta) {
  const amount = player.speed * delta;

  const nx = player.x + dx * amount;
  const ny = player.y + dy * amount;

  if (canStandAt(nx, player.y)) player.x = nx;
  if (canStandAt(player.x, ny)) player.y = ny;

  // Smoothly rotate towards the direction of movement.
  const targetAngle = Math.atan2(dy, dx);

  const angleDifference = Math.atan2(
    Math.sin(targetAngle - player.angle),
    Math.cos(targetAngle - player.angle)
  );

  player.angle += angleDifference * Math.min(1, delta * 12);

  // Walking animation timer.
  player.walkTime += delta * 10;

  // Check whether the assassin has reached a guard.
  for (const guard of guards) {
    if (guard.dead) continue;

    const distance = Math.hypot(
      guard.x - player.x,
      guard.y - player.y
    );

    if (distance <= 40) {
      assassinateGuard(guard);
      break;
    }
  }
}


// Rounded rectangle helper.
function roundedRectPath(x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

// Industrial concrete warehouse floor.

function drawFloor() {
  // ------------------------------------------------
  // 1. BASE CONCRETE SURFACE
  // ------------------------------------------------

  ctx.save();

  ctx.fillStyle = "#aaa99f";
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  const base = ctx.createLinearGradient(
    0, 0, WORLD_WIDTH, WORLD_HEIGHT
  );

  base.addColorStop(0, "#b6b4a9");
  base.addColorStop(0.45, "#aaa99f");
  base.addColorStop(1, "#99988f");

  ctx.fillStyle = base;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  // ------------------------------------------------
  // 2. SOFT, NATURAL CONCRETE TILE VARIATION
  // ------------------------------------------------

  for (let y = 0; y < WORLD_ROWS; y++) {
    for (let x = 0; x < WORLD_COLS; x++) {
      const px = x * TILE;
      const py = y * TILE;

      // Deterministic variation: never flickers between frames.
      const seed = (x * 127 + y * 311 + x * y * 17) % 97;
      const shade = (seed % 9) - 4;

      ctx.fillStyle = `rgba(${shade > 0 ? 255 : 45},${shade > 0 ? 255 : 45},${shade > 0 ? 255 : 42},0.018)`;
      ctx.fillRect(px, py, TILE, TILE);

      // Soft, irregular concrete discoloration.
      const spotX = px + 12 + (seed * 7 % 35);
      const spotY = py + 10 + (seed * 13 % 35);
      const radius = 13 + (seed % 12);

      const stain = ctx.createRadialGradient(
        spotX, spotY, 1,
        spotX, spotY, radius
      );

      stain.addColorStop(0, "rgba(91,85,73,0.075)");
      stain.addColorStop(0.65, "rgba(112,105,91,0.035)");
      stain.addColorStop(1, "rgba(112,105,91,0)");

      ctx.fillStyle = stain;
      ctx.fillRect(px, py, TILE, TILE);

      // Tiny concrete aggregate marks.
      for (let i = 0; i < 5; i++) {
        const dotX = px + 7 + ((seed * (i + 3) * 11) % 46);
        const dotY = py + 7 + ((seed * (i + 5) * 7) % 46);
        const dotSize = 1 + (i % 2);

        ctx.fillStyle = i % 2 === 0
          ? "rgba(70,68,59,0.10)"
          : "rgba(245,241,224,0.16)";

        ctx.fillRect(dotX, dotY, dotSize, dotSize);
      }
    }
  }

  // ------------------------------------------------
  
  // ------------------------------------------------
  // 3. SMALL 2x2 CONCRETE FLOOR TILES
  // ------------------------------------------------

  const smallTile = TILE / 2;

  for (let x = 0; x <= WORLD_WIDTH; x += smallTile) {
    ctx.strokeStyle = "rgba(66,65,58,0.13)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, WORLD_HEIGHT);
    ctx.stroke();

    ctx.strokeStyle = "rgba(245,242,228,0.12)";
    ctx.beginPath();
    ctx.moveTo(x + 1, 0);
    ctx.lineTo(x + 1, WORLD_HEIGHT);
    ctx.stroke();
  }

  for (let y = 0; y <= WORLD_HEIGHT; y += smallTile) {
    ctx.strokeStyle = "rgba(66,65,58,0.13)";
    ctx.lineWidth = 1;

    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WORLD_WIDTH, y);
    ctx.stroke();

    ctx.strokeStyle = "rgba(245,242,228,0.12)";
    ctx.beginPath();
    ctx.moveTo(0, y + 1);
    ctx.lineTo(WORLD_WIDTH, y + 1);
    ctx.stroke();
  }


  // ------------------------------------------------
  // 4. DIFFUSED WAREHOUSE LIGHTING
  // ------------------------------------------------

  function addLight(x, y, radius, strength) {
    const light = ctx.createRadialGradient(
      x, y, 0,
      x, y, radius
    );

    light.addColorStop(0, `rgba(255,245,218,${strength})`);
    light.addColorStop(0.45, `rgba(255,239,211,${strength * 0.4})`);
    light.addColorStop(1, "rgba(255,239,211,0)");

    ctx.fillStyle = light;
    ctx.fillRect(
      x - radius,
      y - radius,
      radius * 2,
      radius * 2
    );
  }

  addLight(WORLD_WIDTH * 0.25, WORLD_HEIGHT * 0.22, 260, 0.13);
  addLight(WORLD_WIDTH * 0.78, WORLD_HEIGHT * 0.48, 300, 0.10);
  addLight(WORLD_WIDTH * 0.42, WORLD_HEIGHT * 0.82, 250, 0.09);

  // ------------------------------------------------
  // 5. GENTLE WAREHOUSE EDGE DARKENING
  // ------------------------------------------------

  const edge = ctx.createRadialGradient(
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_WIDTH * 0.2,
    WORLD_WIDTH / 2,
    WORLD_HEIGHT / 2,
    WORLD_HEIGHT * 0.72
  );

  edge.addColorStop(0, "rgba(35,34,29,0)");
  edge.addColorStop(1, "rgba(35,34,29,0.13)");

  ctx.fillStyle = edge;
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  ctx.restore();
}


// Individual concrete barrier blocks.

// Continuous, uniform concrete walls and barriers.


function drawConcreteCluster(x, y, w, h) {
  const px = x * TILE + 2;
  const py = y * TILE + 2;
  const width = w * TILE - 4;
  const height = h * TILE - 4;

  const depth = 9;

  ctx.save();

  // Keep all concrete drawing inside the room.
  ctx.beginPath();
  ctx.rect(
    0,
    0,
    WORLD_COLS * TILE,
    WORLD_ROWS * TILE
  );
  ctx.clip();

  // Ground shadow.
  ctx.shadowColor = "rgba(0,0,0,0.35)";
  ctx.shadowBlur = 10;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 5;

  roundedRectPath(px, py, width, height, 5);
  ctx.fillStyle = "#514f49";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Right-facing raised side.
  ctx.beginPath();
  ctx.moveTo(px + width, py + 5);
  ctx.lineTo(px + width + depth, py + depth + 5);
  ctx.lineTo(px + width + depth, py + height + depth);
  ctx.lineTo(px + width, py + height);
  ctx.closePath();

  const sideGradient = ctx.createLinearGradient(
    px + width, py,
    px + width + depth, py
  );

  sideGradient.addColorStop(0, "#65635c");
  sideGradient.addColorStop(1, "#393a36");

  ctx.fillStyle = sideGradient;
  ctx.fill();

  // Front-facing raised side.
  ctx.beginPath();
  ctx.moveTo(px, py + height);
  ctx.lineTo(px + width, py + height);
  ctx.lineTo(px + width + depth, py + height + depth);
  ctx.lineTo(px + depth, py + height + depth);
  ctx.closePath();

  const frontGradient = ctx.createLinearGradient(
    px, py + height,
    px, py + height + depth
  );

  frontGradient.addColorStop(0, "#66645d");
  frontGradient.addColorStop(1, "#41413c");

  ctx.fillStyle = frontGradient;
  ctx.fill();

  // Concrete top surface.
  roundedRectPath(px, py, width, height, 5);

  const topGradient = ctx.createLinearGradient(
    px, py,
    px + width, py + height
  );

  topGradient.addColorStop(0, "#b2afa5");
  topGradient.addColorStop(0.45, "#99968d");
  topGradient.addColorStop(1, "#85837b");

  ctx.fillStyle = topGradient;
  ctx.fill();

  // Clean outer bevel.
  ctx.strokeStyle = "#514b44";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Subtle concrete texture.
  ctx.fillStyle = "rgba(45,42,38,0.12)";

  for (let i = 0; i < Math.floor((w * h) * 5); i++) {
    const mx = px + 9 +
      ((i * 23) % Math.max(10, width - 18));

    const my = py + 9 +
      ((i * 17) % Math.max(10, height - 18));

    ctx.fillRect(mx, my, 2, 2);
  }

  ctx.restore();
}


function drawCargoContainer(x, y, w, h, hazard = false) {
  const isTopLeftCargo =
    x === 1 && y === 1 && w === 2 && h === 2;

  const isMiddlePair =
    x === 9 && y === 10 && w === 2 && h === 1;

  const isUpperVertical =
    x === 11 && y === 1 && w === 1 && h === 3;

  const isUpperTop =
    x === 10 && y === 1 && w === 1 && h === 1;

  const isConcreteInnerPair =
    x === 9 && y === 4 && w === 1 && h === 2;

  const isNewHorizontalPair =
    x === 7 && y === 7 && w === 2 && h === 1;

  const isLowerVerticalStack =
    x === 9 && y === 14 && w === 1 && h === 3;

  const isLowerHorizontalTile =
    y === 16 &&
    (x === 7 || x === 8) &&
    w === 1 && h === 1;

  const isLowerLeftCornerCargo =
    x === 3 && y === 16 && w === 1 && h === 1;

  const isUpperFormation =
    isUpperVertical || isUpperTop;

  const seamless =
    isTopLeftCargo ||
    isUpperFormation ||
    isConcreteInnerPair ||
    isNewHorizontalPair ||
    isLowerVerticalStack ||
    isLowerHorizontalTile ||
    isLowerLeftCornerCargo;

  const isLowerFormation =
    isLowerVerticalStack ||
    isLowerHorizontalTile ||
    isLowerLeftCornerCargo;

  const scale = isMiddlePair ? 0.9 : 0.96;

  // Draw the top-left 2×2 formation as ONE container.
  const size = isTopLeftCargo
    ? TILE * 2
    : isLowerFormation
      ? TILE - 4
      : TILE * scale;

  const rightEdge = (WORLD_COLS - 1) * TILE;
  const upperColumnX = rightEdge - size;

  // The top-left 2×2 container is drawn only once.
  const drawRows = isTopLeftCargo ? 1 : h;
  const drawCols = isTopLeftCargo ? 1 : w;

  for (let row = 0; row < drawRows; row++) {
    for (let col = 0; col < drawCols; col++) {
      const pos = getPackedObjectPosition(
        x + col, y + row, "cargo"
      );

      let px = pos.x;
      let py = pos.y;

      // Top-left corner: flush against both boundaries.
      if (isTopLeftCargo) {
        px = TILE;
        py = TILE;
      }

      if (isMiddlePair) {
        px = x * TILE + 6 + col * size;
        py = y * TILE + 12;
      }

      if (isUpperVertical) {
        px = upperColumnX;
        py = TILE + row * size;
      }

      if (isUpperTop) {
        px = upperColumnX - size;
        py = TILE;
      }

      if (isConcreteInnerPair) {
        px = 8 * TILE + 2 + (TILE - 4);
        py = 6 * TILE + 2 - (2 * size) + row * size;
      }

      if (isNewHorizontalPair) {
        px = 9 * TILE + 2 - (2 * size) + col * size;
        py = 7 * TILE + (TILE - size) / 2;
      }

      // Lower-right mirrored L.
      if (isLowerVerticalStack) {
        px = 9 * TILE + 2;
        py = 14 * TILE + 2 + row * size;
      }

      if (isLowerHorizontalTile) {
        px = x * TILE + 2;
        py = 16 * TILE + 2;
      }

      if (isLowerLeftCornerCargo) {
        px = 3 * TILE - 2;
        py = 16 * TILE - 2;
      }

      ctx.save();

      // Ground shadow.
      ctx.shadowColor = "rgba(0,0,0,0.32)";
      ctx.shadowBlur = seamless ? 0 : 8;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = seamless ? 0 : 4;

      // Deep teal-blue outer shell.
      roundedRectPath(px, py, size, size, 6);
      ctx.fillStyle = "#10343b";
      ctx.fill();

      ctx.shadowColor = "transparent";
      ctx.shadowBlur = 0;
      ctx.shadowOffsetX = 0;
      ctx.shadowOffsetY = 0;

      // Deep teal-blue industrial cargo face.
      const inset = 3;
      const faceSize = size - inset * 2;

      roundedRectPath(
        px + inset,
        py + inset,
        faceSize,
        faceSize,
        4
      );

      const cargoBlue = ctx.createLinearGradient(
        px, py, px + size, py + size
      );

      cargoBlue.addColorStop(0, "#347f86");
      cargoBlue.addColorStop(0.45, "#17636d");
      cargoBlue.addColorStop(1, "#104650");

      ctx.fillStyle = cargoBlue;
      ctx.fill();

      // Horizontal reinforced container ribs.
      for (let i = 0; i < 4; i++) {
        const stripY = py + 8 + i * (size * 0.21);

        ctx.fillStyle = "rgba(8,35,42,0.24)";
        ctx.fillRect(
          px + 7,
          stripY,
          size - 14,
          size * 0.10
        );

        ctx.strokeStyle = "rgba(170,218,219,0.22)";
        ctx.lineWidth = 1;
        ctx.beginPath();
        ctx.moveTo(px + 7, stripY);
        ctx.lineTo(px + size - 7, stripY);
        ctx.stroke();
      }

      // Vertical structural reinforcement.
      ctx.strokeStyle = "rgba(8,39,45,0.48)";
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(px + size * 0.25, py + 7);
      ctx.lineTo(px + size * 0.25, py + size - 7);
      ctx.moveTo(px + size * 0.75, py + 7);
      ctx.lineTo(px + size * 0.75, py + size - 7);
      ctx.stroke();

      // Metal corner fittings.
      const corners = [
        [px + 5, py + 5],
        [px + size - 9, py + 5],
        [px + 5, py + size - 9],
        [px + size - 9, py + size - 9]
      ];

      corners.forEach(([cx, cy]) => {
        ctx.fillStyle = "#687b87";
        ctx.fillRect(cx, cy, 4, 4);

        ctx.fillStyle = "rgba(225,239,245,0.7)";
        ctx.fillRect(cx + 1, cy + 1, 2, 1);
      });

      if (hazard) {
        ctx.fillStyle = "#d5aa35";
        ctx.fillRect(px + 7, py + 9, size - 14, 5);
      }

      ctx.restore();
    }
  }
}


function getPackedObjectPosition(x, y, type) {
  const size = type === "cargo" ? TILE * 0.96 : TILE * 0.6;

  const materialCells = new Set();

  const objects = type === "wood"
    ? obstacles.slice(47, 52)
    : obstacles.slice(52);

  for (const [ox, oy, ow, oh] of objects) {
    for (let row = 0; row < oh; row++) {
      for (let col = 0; col < ow; col++) {
        materialCells.add(`${ox + col},${oy + row}`);
      }
    }
  }

  const visited = new Set();
  let component = [];

  for (const cell of materialCells) {
    if (visited.has(cell)) continue;

    const queue = [cell];
    const group = [];
    visited.add(cell);

    while (queue.length) {
      const current = queue.shift();
      group.push(current);

      const [cx, cy] = current.split(",").map(Number);

      const neighbors = [
        [cx + 1, cy],
        [cx - 1, cy],
        [cx, cy + 1],
        [cx, cy - 1]
      ];

      for (const [nx, ny] of neighbors) {
        const key = `${nx},${ny}`;

        if (materialCells.has(key) && !visited.has(key)) {
          visited.add(key);
          queue.push(key);
        }
      }
    }

    if (group.includes(`${x},${y}`)) {
      component = group;
      break;
    }
  }

  if (component.length === 0) {
    return {
      x: x * TILE + (TILE - size) / 2,
      y: y * TILE + (TILE - size) / 2
    };
  }

  const coords = component.map(cell =>
    cell.split(",").map(Number)
  );

  const minX = Math.min(...coords.map(p => p[0]));
  const maxX = Math.max(...coords.map(p => p[0]));
  const minY = Math.min(...coords.map(p => p[1]));
  const maxY = Math.max(...coords.map(p => p[1]));

  const groupWidth = (maxX - minX + 1) * size;
  const groupHeight = (maxY - minY + 1) * size;

  const offsetX = minX * TILE + (TILE - groupWidth) / 2;
  const offsetY = minY * TILE + (TILE - groupHeight) / 2;

  return {
    x: offsetX + (x - minX) * size,
    y: offsetY + (y - minY) * size
  };
}


function drawWoodenCrate(x, y, w, h) {
  const normalSize = TILE * 0.6;

  function isConcreteAt(tx, ty) {
    return obstacles.slice(0, 47).some(([ox, oy, ow, oh]) =>
      tx >= ox && tx < ox + ow &&
      ty >= oy && ty < oy + oh
    );
  }

  const isRightBoundaryStack =
    x === 11 && y === 10 && w === 1 && h === 8;

  const isLowerLeftJunction =
    x === 3 && y === 16 && w === 1 && h === 1;

  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const cx = x + col;
      const cy = y + row;

      const isUpperCrate = cx === 5 && cy === 7;

      const isTopLeftStack =
        cx === 5 && (cy === 2 || cy === 3);

      const isNewFittedCrate =
        (cx === 2 && cy === 12) ||
        (cx === 4 && cy === 11);

      const pos = getPackedObjectPosition(cx, cy, "wood");

      let px, py, boxW, boxH, radius;

      if (isRightBoundaryStack) {
        px = 11 * TILE + 2;
        py = 10 * TILE + 2 + row * (TILE - 4);

        boxW = TILE - 4;
        boxH = TILE - 4;
        radius = 7;

      } else if (isTopLeftStack) {
  px = cx * TILE + 2;

  // Two crates touch each other and the concrete below.
  py = 2 * TILE + 2 + (cy - 2) * (TILE - 1);

  boxW = TILE - 4;
  boxH = TILE - 1;
  radius = 7;

} else if (isLowerLeftJunction || isNewFittedCrate) {
  px = cx * TILE + 2;
  py = cy * TILE + 2;

  boxW = TILE - 4;
  boxH = TILE - 4;
  radius = 7;

      } else if (isUpperCrate) {
        px = cx * TILE + 3;
        py = cy * TILE + 3;
        boxW = TILE - 6;
        boxH = TILE - 6;

        if (isConcreteAt(cx - 1, cy)) {
          px -= 6;
          boxW += 6;
        }

        if (isConcreteAt(cx, cy - 1)) {
          py -= 6;
          boxH += 6;
        }

        radius = 7;

      } else {
        px = pos.x;
        py = pos.y;
        boxW = normalSize;
        boxH = normalSize;
        radius = 4;
      }

      ctx.save();

      // Ground shadow.
      ctx.fillStyle = "rgba(0,0,0,0.25)";
      ctx.beginPath();
      ctx.roundRect(px + 2, py + 3, boxW - 1, boxH - 1, radius);
      ctx.fill();

      // Dark wooden border.
      ctx.fillStyle = "#50301d";
      ctx.beginPath();
      ctx.roundRect(px, py, boxW, boxH, radius);
      ctx.fill();

      // Wooden surface.
      const wood = ctx.createLinearGradient(
        px, py, px + boxW, py + boxH
      );

      wood.addColorStop(0, "#bd8951");
      wood.addColorStop(0.45, "#a97542");
      wood.addColorStop(1, "#80532f");

      ctx.fillStyle = wood;
      ctx.beginPath();
      ctx.roundRect(
        px + 3, py + 3,
        boxW - 6, boxH - 6,
        Math.max(2, radius - 2)
      );
      ctx.fill();

      // Horizontal wooden planks.
      for (let i = 0; i < 3; i++) {
        const stripY = py + 6 + i * (boxH * 0.24);

        ctx.fillStyle = i === 1
          ? "rgba(77,43,23,0.12)"
          : "rgba(235,190,130,0.13)";

        ctx.fillRect(
          px + 6, stripY,
          boxW - 12, boxH * 0.12
        );

        ctx.strokeStyle = "rgba(76,46,26,0.28)";
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.moveTo(px + 6, stripY + boxH * 0.12);
        ctx.lineTo(px + boxW - 6, stripY + boxH * 0.12);
        ctx.stroke();
      }

      // Vertical wooden supports.
      ctx.strokeStyle = "rgba(66,38,22,0.20)";
      ctx.lineWidth = 0.8;
      ctx.beginPath();
      ctx.moveTo(px + boxW * 0.34, py + 7);
      ctx.lineTo(px + boxW * 0.34, py + boxH - 7);
      ctx.moveTo(px + boxW * 0.66, py + 7);
      ctx.lineTo(px + boxW * 0.66, py + boxH - 7);
      ctx.stroke();

      // Corner fittings.
      const corners = [
        [px + 5, py + 5],
        [px + boxW - 9, py + 5],
        [px + 5, py + boxH - 9],
        [px + boxW - 9, py + boxH - 9]
      ];

      corners.forEach(([cx, cy]) => {
        ctx.fillStyle = "#5c5548";
        ctx.fillRect(cx, cy, 4, 4);

        ctx.fillStyle = "rgba(220,207,173,0.55)";
        ctx.fillRect(cx + 1, cy + 1, 2, 1);
      });

      // Top highlight.
      ctx.strokeStyle = "rgba(255,218,167,0.32)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(px + 6, py + 4);
      ctx.lineTo(px + boxW - 6, py + 4);
      ctx.stroke();

      ctx.restore();
    }
  }
}


function drawConcreteLayout() {
  const depth = 3;
const inset = 6;
  const concreteTiles = new Set();

  // There are 15 concrete formations in the obstacles array.
  obstacles.slice(0, 46).forEach(([x, y, w, h]) => {
    for (let tx = x; tx < x + w; tx++) {
      for (let ty = y; ty < y + h; ty++) {
        concreteTiles.add(`${tx},${ty}`);
      }
    }
  });

  function hasTile(x, y) {
    return concreteTiles.has(`${x},${y}`);
  }

  function bounds(x, y) {
    return {
      left: x * TILE + (hasTile(x - 1, y) ? 0 : inset),
      right: (x + 1) * TILE - (hasTile(x + 1, y) ? 0 : inset),
      top: y * TILE + (hasTile(x, y - 1) ? 0 : inset),
      bottom: (y + 1) * TILE - (hasTile(x, y + 1) ? 0 : inset)
    };
  }

  ctx.save();

  ctx.beginPath();
  ctx.rect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);
  ctx.clip();

  // Soft, unified ground shadow.
  ctx.beginPath();

  concreteTiles.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    const b = bounds(x, y);

    ctx.rect(
      b.left,
      b.top,
      b.right - b.left,
      b.bottom - b.top
    );
  });

  ctx.shadowColor = "rgba(0,0,0,0.34)";
  ctx.shadowBlur = 8;
  ctx.shadowOffsetX = 2;
  ctx.shadowOffsetY = 3;
  ctx.fillStyle = "#45443f";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Right-facing 2.5D sides.
  concreteTiles.forEach(key => {
    const [x, y] = key.split(",").map(Number);

    if (!hasTile(x + 1, y)) {
      const b = bounds(x, y);

      ctx.beginPath();
      ctx.moveTo(b.right, b.top);
      ctx.lineTo(b.right + depth, b.top + depth);
      ctx.lineTo(b.right + depth, b.bottom + depth);
      ctx.lineTo(b.right, b.bottom);
      ctx.closePath();

      const side = ctx.createLinearGradient(
        b.right, b.top, b.right + depth, b.top
      );

      side.addColorStop(0, "#55534d");
      side.addColorStop(1, "#35342f");

      ctx.fillStyle = side;
      ctx.fill();
    }
  });

  // Front-facing 2.5D sides.
  concreteTiles.forEach(key => {
    const [x, y] = key.split(",").map(Number);

    if (!hasTile(x, y + 1)) {
      const b = bounds(x, y);

      ctx.beginPath();
      ctx.moveTo(b.left, b.bottom);
      ctx.lineTo(b.right, b.bottom);
      ctx.lineTo(b.right + depth, b.bottom + depth);
      ctx.lineTo(b.left + depth, b.bottom + depth);
      ctx.closePath();

      const front = ctx.createLinearGradient(
        b.left, b.bottom, b.left, b.bottom + depth
      );

      front.addColorStop(0, "#5b5952");
      front.addColorStop(1, "#383732");

      ctx.fillStyle = front;
      ctx.fill();
    }
  });

  // Continuous concrete top surface.
  const top = ctx.createLinearGradient(
    0, 0, WORLD_WIDTH, WORLD_HEIGHT
  );

  top.addColorStop(0, "#77756d");
  top.addColorStop(0.5, "#6c6a63");
  top.addColorStop(1, "#5d5b55");

  ctx.fillStyle = top;

  concreteTiles.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    const b = bounds(x, y);

    ctx.fillRect(
      b.left,
      b.top,
      b.right - b.left,
      b.bottom - b.top
    );
  });

  // Restrained highlights along exposed upper edges.
  ctx.strokeStyle = "rgba(190,187,174,0.18)";
  ctx.lineWidth = 1;

  concreteTiles.forEach(key => {
    const [x, y] = key.split(",").map(Number);
    const b = bounds(x, y);

    ctx.beginPath();

    if (!hasTile(x, y - 1)) {
      ctx.moveTo(b.left + 2, b.top + 1);
      ctx.lineTo(b.right - 2, b.top + 1);
    }

    if (!hasTile(x - 1, y)) {
      ctx.moveTo(b.left + 1, b.top + 2);
      ctx.lineTo(b.left + 1, b.bottom - 2);
    }

    ctx.stroke();
  });

  ctx.restore();
}


// Draw all warehouse obstacles with different industrial materials.

function drawObstacles() {
  // Outer warehouse walls.
  ctx.fillStyle = "#303a3c";

  for (let x = 0; x < WORLD_COLS; x++) {
    ctx.fillRect(x * TILE, 0, TILE, TILE);

    ctx.fillRect(
      x * TILE,
      (WORLD_ROWS - 1) * TILE,
      TILE,
      TILE
    );
  }

  for (let y = 0; y < WORLD_ROWS; y++) {
    ctx.fillRect(0, y * TILE, TILE, TILE);

    ctx.fillRect(
      (WORLD_COLS - 1) * TILE,
      y * TILE,
      TILE,
      TILE
    );
  }

  // Continuous concrete formations.
  drawConcreteLayout();

  // Wooden crates — indices 47 to 53.
  obstacles.slice(47, 54).forEach(([x, y, w, h]) => {
    drawWoodenCrate(x, y, w, h);
  });

  // Blue cargo containers — index 54 onward.
  obstacles.slice(54).forEach(([x, y, w, h]) => {
    drawCargoContainer(x, y, w, h);
  });
}
 
function drawVision(guard) {
  if (guard.dead) return;

  ctx.save();

  // Clip vision cones to the warehouse boundaries.
  ctx.beginPath();
ctx.rect(
  0,
  0,
  WORLD_COLS * TILE,
  WORLD_ROWS * TILE
);  ctx.clip();

  ctx.translate(guard.x, guard.y);
  ctx.rotate(guard.angle);

  ctx.beginPath();
  ctx.moveTo(0, 0);

  ctx.arc(
    0,
    0,
    VISION_RANGE,
    -VISION_ANGLE / 2,
    VISION_ANGLE / 2
  );

  ctx.closePath();

  const currentlySeesPlayer = guardSeesPlayer(guard);

  ctx.fillStyle = currentlySeesPlayer
    ? "rgba(255,35,35,0.25)"
    : guard.state === "search"
      ? "rgba(255,155,45,0.18)"
      : "rgba(255,210,65,0.13)";

  ctx.fill();

  ctx.restore();
}

function drawGuard(guard) {
  if (guard.dead) return;

  ctx.save();
  ctx.translate(guard.x, guard.y);
  ctx.rotate(guard.angle);

  // Increase character size.
  ctx.scale(1.1, 1.1);

  // Legs and boots.
  ctx.strokeStyle = "#202a30";
  ctx.lineWidth = 7;
  ctx.lineCap = "round";

  ctx.beginPath();
  ctx.moveTo(-5, -7);
  ctx.lineTo(-11, -16);
  ctx.moveTo(-5, 7);
  ctx.lineTo(-11, 16);
  ctx.stroke();

  // Main body.
  ctx.fillStyle = "#26323a";
  ctx.beginPath();
  ctx.ellipse(0, 0, 14, 17, 0, 0, Math.PI * 2);
  ctx.fill();

  // Arms.
  ctx.strokeStyle = "#c5b49b";
  ctx.lineWidth = 6;

  ctx.beginPath();
  ctx.moveTo(1, -9);
  ctx.lineTo(14, -11);
  ctx.moveTo(1, 9);
  ctx.lineTo(14, 11);
  ctx.stroke();

  // Head.
  ctx.fillStyle = "#c99b75";
  ctx.beginPath();
  ctx.arc(12, 0, 9, 0, Math.PI * 2);
  ctx.fill();

  // Gun.
  ctx.fillStyle = "#17191b";
  ctx.fillRect(17, -3.5, 18, 7);

  ctx.restore();

  if (guard.state === "alert") {
    ctx.fillStyle = "#ff3333";
    ctx.font = "bold 20px Arial";
    ctx.fillText("!", guard.x - 4, guard.y - 32);
  }
}


function drawPlayer() {
  if (!playerSpriteLoaded) return;

  const moving =
    pathIndex < path.length ||
    keys.w || keys.a || keys.s || keys.d ||
    keys.arrowup || keys.arrowdown ||
    keys.arrowleft || keys.arrowright;

  // Sprite sheet: 3 columns × 2 rows.
  const frameWidth = 512;
  const frameHeight = 512;
  const frameCount = 6;

  // Cycle through all six frames while moving.
  const frame = moving
    ? Math.floor(player.walkTime * 0.8) % frameCount
    : 0;

  // Calculate the selected frame's position.
  const sourceX = (frame % 3) * frameWidth;
  const sourceY = Math.floor(frame / 3) * frameHeight;

  ctx.save();

  ctx.translate(player.x, player.y);

  // The sprite faces toward the top of its image.
  ctx.rotate(player.angle + Math.PI / 2);

  // Ground shadow.
  ctx.fillStyle = "rgba(0,0,0,0.25)";
  ctx.beginPath();
  ctx.ellipse(0, 9, 19, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Draw the selected character frame.
  ctx.drawImage(
    playerSprite,
    sourceX,
    sourceY,
    frameWidth,
    frameHeight,
    -29,
    -31,
    58,
    62
  );

  ctx.restore();
}


// Draw a narrow yellow route with an arrowhead instead of a circle.
function drawPathMarker() {
  if (!targetGuard && pathIndex >= path.length) return;

  const points = [
    { x: player.x, y: player.y },
    ...path.slice(pathIndex)
  ];

  // Keep the arrow attached to the moving guard.
  if (targetGuard && !targetGuard.dead) {
    points.push({
      x: targetGuard.x,
      y: targetGuard.y
    });
  }

  if (points.length < 2) return;

  ctx.save();

  ctx.strokeStyle = "rgba(255, 211, 65, 0.95)";
  ctx.lineWidth = 3;
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  ctx.shadowColor = "rgba(255, 205, 45, 0.45)";
  ctx.shadowBlur = 5;

  ctx.beginPath();
  ctx.moveTo(points[0].x, points[0].y);

  for (let i = 1; i < points.length; i++) {
    ctx.lineTo(points[i].x, points[i].y);
  }

  ctx.stroke();

  // Arrowhead at the current destination.
  const end = points[points.length - 1];
  const before = points[points.length - 2];

  const angle = Math.atan2(
    end.y - before.y,
    end.x - before.x
  );

  const headLength = 12;

  ctx.shadowBlur = 0;
  ctx.fillStyle = "#ffd341";

  ctx.beginPath();
  ctx.moveTo(end.x, end.y);

  ctx.lineTo(
    end.x - Math.cos(angle - Math.PI / 6) * headLength,
    end.y - Math.sin(angle - Math.PI / 6) * headLength
  );

  ctx.lineTo(
    end.x - Math.cos(angle + Math.PI / 6) * headLength,
    end.y - Math.sin(angle + Math.PI / 6) * headLength
  );

  ctx.closePath();
  ctx.fill();

  ctx.restore();
}

function drawHUD() {
  document.getElementById("target-counter").textContent =
    `🎯 ${eliminated} / ${guards.length}`;

  document.getElementById("health-bar").style.width =
    (player.health/player.maxHealth*100)+"%";
}

function drawMessage() {
  if(messageTime<=0) return;

  ctx.save();
  ctx.font="bold 18px Arial";
  ctx.textAlign="center";
  ctx.fillStyle="white";
  ctx.fillText(message,screenWidth/2,screenHeight-35);
  ctx.restore();
}

function updateCamera(delta) {
  const targetX = player.x - screenWidth / 2;
  const targetY = player.y - screenHeight / 2;

  const maxX = Math.max(0, WORLD_WIDTH - screenWidth);
  const maxY = Math.max(0, WORLD_HEIGHT - screenHeight);

  const smooth = Math.min(1, camera.smoothness * delta);

  camera.x += (
    Math.max(0, Math.min(targetX, maxX)) - camera.x
  ) * smooth;

  camera.y += (
    Math.max(0, Math.min(targetY, maxY)) - camera.y
  ) * smooth;
}

function gameLoop(timestamp) {
  const delta=Math.min((timestamp-lastTime)/1000||0,0.05);
  lastTime=timestamp;

  updatePlayer(delta);
  updateGuards(delta);
  updateCamera(delta);

  messageTime=Math.max(0,messageTime-delta);

  ctx.clearRect(0,0,screenWidth,screenHeight);
  ctx.save();
  ctx.translate(-camera.x,-camera.y);

  drawFloor();

  guards.forEach(drawVision);
  drawObstacles();
  guards.forEach(drawGuard);
  drawPathMarker();
  drawPlayer();

  ctx.restore();

  drawHUD();
  drawMessage();

  requestAnimationFrame(gameLoop);
}

// Keyboard controls.
addEventListener("keydown",e=>{
  const k=e.key.toLowerCase();

  if(["arrowup","arrowdown","arrowleft","arrowright"," "].includes(k))
    e.preventDefault();

  keys[k]=true;
});

addEventListener("keyup",e=>{
  keys[e.key.toLowerCase()]=false;
});

// Click/tap a guard or a floor location.
canvas.addEventListener("pointerdown",e=>{
  const rect=canvas.getBoundingClientRect();
  const wx=e.clientX-rect.left+camera.x;
  const wy=e.clientY-rect.top+camera.y;

  const clickedGuard=guards.find(g=>
!g.dead && Math.hypot(g.x-wx,g.y-wy)<34
  );

  if(clickedGuard) {
    selectGuard(clickedGuard);
    return;
  }

targetGuard = null;
chaseStartTile = "";
chaseGoalTile = "";
  const tile=nearestWalkableTile(
    Math.floor(wx/TILE),
    Math.floor(wy/TILE)
  );

  if(!tile) return;

  const start={
    x:Math.floor(player.x/TILE),
    y:Math.floor(player.y/TILE)
  };

  path=findPath(start,tile,false);
  pathIndex=0;
});

requestAnimationFrame(gameLoop);
