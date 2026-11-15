
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");
const TILE = 60;
const WORLD_COLS = 16;
const WORLD_ROWS = 19;
const WORLD_WIDTH = WORLD_COLS * TILE;
const WORLD_HEIGHT = WORLD_ROWS * TILE;

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
  // CONCRETE WALLS — KEEP EXACTLY AS THEY ARE
  // =====================================
  [3, 3, 1, 5],
  [3, 7, 4, 1],

  [7, 3, 3, 1],
  [9, 3, 1, 3],

  [6, 8, 1, 4],
  [6, 11, 4, 1],

  [12, 7, 1, 4],
  [10, 7, 3, 1],

  [3, 13, 3, 1],
  [3, 13, 1, 3],

  [8, 15, 4, 1],
  [11, 13, 1, 3],

  [5, 14, 2, 2],

  // =====================================
  // EXISTING WOODEN CRATES
  // =====================================
  [9, 4, 2, 1],
  [9, 5, 2, 1],

  [2, 10, 1, 2],

  [5, 5, 1, 2],

  [13, 15, 2, 1],

  // =====================================
  // EXISTING BLUE CARGO CONTAINERS
  // =====================================
  [12, 5, 2, 1],  // Relocated to avoid concrete overlap.
  [12, 11, 2, 1],
  [12, 17, 2, 1],

  // =====================================
  // NEW WOODEN CRATE FORMATIONS
  // =====================================

  // Extends the upper crate formation.
  [11, 4, 1, 2],

  // Lower-middle storage group.
  [7, 13, 2, 1],

  // Connected lower-right crate formation.
  [13, 13, 2, 2]
];

for (const [x, y, w, h] of obstacles) {
  for (let row = y; row < y + h; row++)
    for (let col = x; col < x + w; col++)
      map[row][col] = 1;
}


for (const [x, y, w, h] of obstacles) {
  for (let row = y; row < y + h; row++)
    for (let col = x; col < x + w; col++)
      map[row][col] = 1;
}

const player = {
  x: TILE * 2.5,
  y: TILE * 2.5,
  speed: 190,
  radius: 19,
  health: 100,
  maxHealth: 100,
  angle: 0,
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
    [11,2], [12,2], [12,3], [11,3]
  ]),

  makeGuard(5, 9, [
    [5,9], [5,10], [6,10], [6,9]
  ]),

  makeGuard(9, 9, [
    [9,9], [9,10], [10,10], [10,9]
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

  // Eliminate the selected guard.
  guard.dead = true;

  eliminated++;

  // Stop following the eliminated guard.
  targetGuard = null;

  path = [];
  pathIndex = 0;

  chaseStartTile = "";
  chaseGoalTile = "";

  showMessage("Guard assassinated!");

  // Update the target counter immediately.
  document.getElementById("target-counter").textContent =
    `🎯 ${eliminated} / ${guards.length}`;
}
function movePlayer(dx,dy,delta) {
  const amount=player.speed*delta;
  const nx=player.x+dx*amount;
  const ny=player.y+dy*amount;

  if (canStandAt(nx,player.y)) player.x=nx;
  if (canStandAt(player.x,ny)) player.y=ny;

  player.angle=Math.atan2(dy,dx);
  player.walkTime+=delta*10;
}

function updateCamera(delta) {
  const maxX=Math.max(0,WORLD_WIDTH-screenWidth);
  const maxY=Math.max(0,WORLD_HEIGHT-screenHeight);

  const tx=Math.max(0,Math.min(maxX,player.x-screenWidth/2));
  const ty=Math.max(0,Math.min(maxY,player.y-screenHeight/2));

  const smoothing=1-Math.exp(-camera.smoothness*delta);
  camera.x+=(tx-camera.x)*smoothing;
  camera.y+=(ty-camera.y)*smoothing;
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
  ctx.fillStyle = "#aaa9a0";
  ctx.fillRect(0, 0, WORLD_WIDTH, WORLD_HEIGHT);

  for (let y = 0; y < WORLD_ROWS; y++) {
    for (let x = 0; x < WORLD_COLS; x++) {
      const px = x * TILE;
      const py = y * TILE;

      const shade = ((x * 13 + y * 7) % 5) * 2;

      ctx.fillStyle = `rgb(${174-shade},${174-shade},${164-shade})`;
      ctx.fillRect(px, py, TILE, TILE);

      // Concrete floor tile joints.
      ctx.strokeStyle = "rgba(75,75,68,0.12)";
      ctx.lineWidth = 1;
      ctx.strokeRect(px, py, TILE, TILE);

      // Subtle concrete surface marks.
      ctx.fillStyle = "rgba(70,65,55,0.045)";
      ctx.fillRect(
        px + 8 + ((x * 17 + y * 11) % 35),
        py + 9 + ((x * 9 + y * 19) % 35),
        12,
        3
      );

      ctx.fillStyle = "rgba(255,255,255,0.08)";
      ctx.fillRect(px + 5, py + 5, TILE - 10, 2);
    }
  }
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

function drawConcreteL(x, y, w, h, mirror = false) {
  const px = x * TILE + 2;
  const py = y * TILE + 2;
  const width = w * TILE - 4;
  const height = h * TILE - 4;

  ctx.save();

  function makeShape() {
    ctx.beginPath();

    if (!mirror) {
      ctx.moveTo(px, py);
      ctx.lineTo(px + TILE, py);
      ctx.lineTo(px + TILE, py + height - TILE);
      ctx.lineTo(px + width, py + height - TILE);
      ctx.lineTo(px + width, py + height);
      ctx.lineTo(px, py + height);
    } else {
      ctx.moveTo(px + width - TILE, py);
      ctx.lineTo(px + width, py);
      ctx.lineTo(px + width, py + height);
      ctx.lineTo(px, py + height);
      ctx.lineTo(px, py + height - TILE);
      ctx.lineTo(px + width - TILE, py + height - TILE);
    }

    ctx.closePath();
  }

  makeShape();
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 6;
  ctx.fillStyle = "#77766f";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  makeShape();

  const gradient = ctx.createLinearGradient(
    px, py, px + width, py + height
  );

  gradient.addColorStop(0, "#aaa79e");
  gradient.addColorStop(0.5, "#96938a");
  gradient.addColorStop(1, "#77766f");

  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = "#514b44";
  ctx.lineWidth = 3;
  ctx.stroke();

  ctx.restore();
}


// Blue industrial shipping containers.
function drawCargoContainer(x, y, w, h, hazard = false) {
  const px = x * TILE + 2;
  const py = y * TILE + 2;
  const width = w * TILE - 4;
  const height = h * TILE - 4;

  ctx.save();

  // Container shadow.
  ctx.shadowColor = "rgba(0,0,0,0.42)";
  ctx.shadowBlur = 13;
  ctx.shadowOffsetY = 7;

  roundedRectPath(px, py, width, height, 10);
  ctx.fillStyle = "#123c59";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Main blue body.
  roundedRectPath(px + 3, py + 3, width - 6, height - 6, 8);

  const gradient = ctx.createLinearGradient(
    px, py, px + width, py + height
  );

  gradient.addColorStop(0, "#287da7");
  gradient.addColorStop(0.5, "#17638d");
  gradient.addColorStop(1, "#10496f");

  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.strokeStyle = "#092e48";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Container panels.
  const panelWidth = width / w;

  for (let col = 0; col < w; col++) {
    const panelX = px + col * panelWidth;

    ctx.fillStyle = col % 2 === 0
      ? "rgba(72,166,207,0.17)"
      : "rgba(5,42,69,0.15)";

    ctx.fillRect(
      panelX + 3,
      py + 5,
      panelWidth - 6,
      height - 10
    );

    ctx.strokeStyle = "rgba(5,38,60,0.6)";
    ctx.lineWidth = 2;

    ctx.beginPath();
    ctx.moveTo(panelX, py + 7);
    ctx.lineTo(panelX, py + height - 7);
    ctx.stroke();

    // Raised metal ridges.
    for (let r = 9; r < height - 8; r += 12) {
      ctx.strokeStyle = "rgba(110,190,220,0.25)";
      ctx.lineWidth = 2;

      ctx.beginPath();
      ctx.moveTo(panelX + 5, py + r);
      ctx.lineTo(panelX + panelWidth - 5, py + r);
      ctx.stroke();
    }
  }

  // Reinforced corner edges.
  ctx.strokeStyle = "#70a9c2";
  ctx.lineWidth = 3;
  ctx.strokeRect(px + 7, py + 7, width - 14, height - 14);

  // Some containers have diagonal reinforced panels.
  if (w >= 2 && h >= 2) {
    ctx.strokeStyle = "rgba(120,190,220,0.32)";
    ctx.lineWidth = 7;

    ctx.beginPath();
    ctx.moveTo(px + 15, py + 15);
    ctx.lineTo(px + width - 15, py + height - 15);
    ctx.moveTo(px + width - 15, py + 15);
    ctx.lineTo(px + 15, py + height - 15);
    ctx.stroke();
  }

  // Yellow-black industrial hazard striping.
  if (hazard) {
    const stripeY = py + 5;
    const stripeHeight = 10;

    ctx.save();
    ctx.beginPath();
    ctx.rect(px + 7, stripeY, width - 14, stripeHeight);
    ctx.clip();

    ctx.fillStyle = "#e6bd35";
    ctx.fillRect(px + 7, stripeY, width - 14, stripeHeight);

    ctx.strokeStyle = "#252525";
    ctx.lineWidth = 5;

    for (let sx = px - 20; sx < px + width + 20; sx += 18) {
      ctx.beginPath();
      ctx.moveTo(sx, stripeY + stripeHeight);
      ctx.lineTo(sx + 12, stripeY);
      ctx.stroke();
    }

    ctx.restore();
  }

  ctx.restore();
}

function drawWoodenCrate(x, y, w, h) {
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const px = (x + col) * TILE;
      const py = (y + row) * TILE;
      const size = TILE;

      ctx.save();

      // Shadow
      ctx.fillStyle = "rgba(0, 0, 0, 0.38)";
      ctx.fillRect(px + 4, py + 5, size, size);

      // Wooden surface
      const wood = ctx.createLinearGradient(
        px, py, px + size, py + size
      );
      wood.addColorStop(0, "#b47a3e");
      wood.addColorStop(0.5, "#98602f");
      wood.addColorStop(1, "#704322");

      ctx.fillStyle = wood;
      ctx.fillRect(px, py, size, size);

      // Outer wooden border
      ctx.strokeStyle = "#503019";
      ctx.lineWidth = 3;
      ctx.strokeRect(px, py, size, size);

      // Wooden planks
      ctx.strokeStyle = "rgba(65, 35, 15, 0.65)";
      ctx.lineWidth = 2;

      for (let i = 1; i <= 3; i++) {
        const lineX = px + (size / 4) * i;
        ctx.beginPath();
        ctx.moveTo(lineX, py + 3);
        ctx.lineTo(lineX, py + size - 3);
        ctx.stroke();
      }

      // Cross-bracing
      ctx.strokeStyle = "#d09a5c";
      ctx.lineWidth = 4;

      ctx.beginPath();
      ctx.moveTo(px + 8, py + 8);
      ctx.lineTo(px + size - 8, py + size - 8);
      ctx.moveTo(px + size - 8, py + 8);
      ctx.lineTo(px + 8, py + size - 8);
      ctx.stroke();

      // Corner details
      ctx.fillStyle = "#49301d";
      const nailSize = 3;

      [
        [px + 7, py + 7],
        [px + size - 10, py + 7],
        [px + 7, py + size - 10],
        [px + size - 10, py + size - 10]
      ].forEach(([nx, ny]) => {
        ctx.fillRect(nx, ny, nailSize, nailSize);
      });

      ctx.restore();
    }
  }
}

function drawConcreteLayout() {
  const depth = 9;
  const concreteTiles = new Set();
obstacles.slice(0, 13).forEach(([x, y, w, h]) => {
    for (let tx = x; tx < x + w; tx++) {
      for (let ty = y; ty < y + h; ty++) {
        concreteTiles.add(`${tx},${ty}`);
      }
    }
  });

  function hasTile(x, y) {
    return concreteTiles.has(`${x},${y}`);
  }

  ctx.save();

  // Keep the concrete inside the warehouse.
  ctx.beginPath();
ctx.rect(0, 0, WORLD_COLS * TILE, WORLD_ROWS * TILE);
  ctx.clip();

  // Build one combined path from all concrete tiles.
  ctx.beginPath();

  concreteTiles.forEach(key => {
    const [x, y] = key.split(",").map(Number);

    ctx.rect(
      x * TILE + 2,
      y * TILE + 2,
      TILE - 4,
      TILE - 4
    );
  });

  // One shared shadow for the complete concrete layout.
  ctx.shadowColor = "rgba(0,0,0,0.34)";
  ctx.shadowBlur = 11;
  ctx.shadowOffsetX = 3;
  ctx.shadowOffsetY = 5;

  ctx.fillStyle = "#514f49";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetX = 0;
  ctx.shadowOffsetY = 0;

  // Exposed right-facing sides only.
  concreteTiles.forEach(key => {
    const [x, y] = key.split(",").map(Number);

    if (!hasTile(x + 1, y)) {
      const px = (x + 1) * TILE - 2;
      const py = y * TILE + 2;

      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + depth, py + depth);
      ctx.lineTo(px + depth, py + TILE - 2 + depth);
      ctx.lineTo(px, py + TILE - 2);
      ctx.closePath();

      const side = ctx.createLinearGradient(
        px, py, px + depth, py
      );

      side.addColorStop(0, "#65635c");
      side.addColorStop(1, "#393a36");

      ctx.fillStyle = side;
      ctx.fill();
    }
  });

  // Exposed front-facing sides only.
  concreteTiles.forEach(key => {
    const [x, y] = key.split(",").map(Number);

    if (!hasTile(x, y + 1)) {
      const px = x * TILE + 2;
      const py = (y + 1) * TILE - 2;

      ctx.beginPath();
      ctx.moveTo(px, py);
      ctx.lineTo(px + TILE - 2, py);
      ctx.lineTo(px + TILE - 2 + depth, py + depth);
      ctx.lineTo(px + depth, py + depth);
      ctx.closePath();

      const front = ctx.createLinearGradient(
        px, py, px, py + depth
      );

      front.addColorStop(0, "#66645d");
      front.addColorStop(1, "#41413c");

      ctx.fillStyle = front;
      ctx.fill();
    }
  });

  // Continuous concrete top surface.
  ctx.beginPath();

  concreteTiles.forEach(key => {
    const [x, y] = key.split(",").map(Number);

    ctx.rect(
      x * TILE + 2,
      y * TILE + 2,
      TILE - 4,
      TILE - 4
    );
  });

  const topGradient = ctx.createLinearGradient(
    0, 0,
    WORLD_COLS * TILE,
WORLD_ROWS * TILE
  );

  topGradient.addColorStop(0, "#b2afa5");
  topGradient.addColorStop(0.5, "#99968d");
  topGradient.addColorStop(1, "#85837b");

  ctx.fillStyle = topGradient;
  ctx.fill();

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

  // All concrete is rendered as one connected layout.
  drawConcreteLayout();

  // Wooden crates and blue cargo containers.
  obstacles.forEach(([x, y, w, h], index) => {
      // Wooden crates.
     // Wooden crates: original and newly added groups.
if (
  (index >= 13 && index <= 17) ||
  (index >= 21 && index <= 23)
) {
  drawWoodenCrate(x, y, w, h);
}

// Blue cargo containers.
if (index >= 18 && index <= 20) {
  drawCargoContainer(x, y, w, h, false);
}
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
  const moving =
    pathIndex < path.length ||
    keys.w || keys.a || keys.s || keys.d ||
    keys.arrowup || keys.arrowdown ||
    keys.arrowleft || keys.arrowright;

  const phase = player.walkTime || 0;
  const stride = moving ? Math.sin(phase) * 3.2 : 0;
  const bob = moving ? Math.abs(Math.sin(phase * 2)) * 0.45 : 0;

  ctx.save();
  ctx.translate(player.x, player.y);
  ctx.rotate(player.angle);

  // Character proportions.
  ctx.scale(1.08, 1.08);

  // ----------------------------------------
  // GROUNDED SHADOW
  // ----------------------------------------

  ctx.save();
  ctx.fillStyle = "rgba(12, 17, 10, 0.25)";
  ctx.shadowColor = "rgba(8, 12, 7, 0.22)";
  ctx.shadowBlur = 7;
  ctx.beginPath();
  ctx.ellipse(-2, 3, 22, 14, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();

  ctx.translate(0, -bob);

  // ----------------------------------------
  // LEGS — DIRECTLY UNDER THE TORSO
  // ----------------------------------------

  function drawLeg(side, step) {
    const hipX = -6;
    const hipY = side * 5.5;
    const kneeX = -10 + step * 0.65;
    const kneeY = side * 6;
    const footX = -15 + step;

    // Trouser outline.
    ctx.strokeStyle = "#202c20";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, kneeY);
    ctx.stroke();

    // Deep olive trousers.
    const trouser = ctx.createLinearGradient(
      -8, kneeY - 3, -16, kneeY + 3
    );
    trouser.addColorStop(0, "#52643a");
    trouser.addColorStop(0.55, "#394a2d");
    trouser.addColorStop(1, "#293a25");

    ctx.strokeStyle = trouser;
    ctx.lineWidth = 5.5;
    ctx.beginPath();
    ctx.moveTo(hipX, hipY);
    ctx.lineTo(kneeX, kneeY);
    ctx.lineTo(footX, kneeY);
    ctx.stroke();

    // Knee reinforcement.
    ctx.fillStyle = "#586a3c";
    ctx.beginPath();
    ctx.ellipse(kneeX, kneeY, 3, 2.5, 0, 0, Math.PI * 2);
    ctx.fill();

    // Tactical boots, pointing forward.
    ctx.save();
    ctx.translate(footX - 2, kneeY);

    ctx.fillStyle = "#18221b";
    ctx.beginPath();
    ctx.ellipse(0, 0, 6.5, 3.7, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#414b3b";
    ctx.beginPath();
    ctx.ellipse(1, -0.8, 4.5, 2.4, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = "rgba(190, 194, 157, 0.25)";
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.moveTo(-2, -1.5);
    ctx.lineTo(3, -1.5);
    ctx.stroke();

    ctx.restore();
  }

  // Far leg first, near leg second.
  drawLeg(-1, -stride);
  drawLeg(1, stride);

  // ----------------------------------------
  // SLIM TACTICAL BACKPACK
  // ----------------------------------------

  ctx.save();
  ctx.translate(-13, 0);

  ctx.fillStyle = "#19271b";
  ctx.beginPath();
  ctx.roundRect(-8, -7.5, 13, 15, 4);
  ctx.fill();

  const pack = ctx.createLinearGradient(-7, -7, 5, 7);
  pack.addColorStop(0, "#52663a");
  pack.addColorStop(0.5, "#394e2d");
  pack.addColorStop(1, "#263923");

  ctx.fillStyle = pack;
  ctx.beginPath();
  ctx.roundRect(-6.5, -6.5, 10.5, 13, 3.5);
  ctx.fill();

  // Top flap.
  ctx.fillStyle = "#596c3d";
  ctx.beginPath();
  ctx.roundRect(-5.5, -5.5, 8.5, 4.5, 2);
  ctx.fill();

  // Buckle.
  ctx.fillStyle = "#b39a5c";
  ctx.fillRect(-2, -4, 2.5, 1.5);

  // Side pockets.
  ctx.fillStyle = "#2b4028";
  ctx.beginPath();
  ctx.roundRect(-7, -5, 2.5, 4, 1);
  ctx.roundRect(-7, 1, 2.5, 4, 1);
  ctx.fill();

  ctx.restore();

  // ----------------------------------------
  // ARMS — CONNECTED, STRONG AND DEFINED
  // ----------------------------------------

  function drawArm(side, holdingKnife) {
    const shoulderX = 2;
    const shoulderY = side * 8;

    const elbowX = holdingKnife ? 9 : 8;
    const elbowY = side * 13;

    const wristX = holdingKnife ? 20 : 15;
    const wristY = holdingKnife ? -10 : side * 14;

    // Dark outer silhouette.
    ctx.strokeStyle = "#202d20";
    ctx.lineWidth = 8;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(wristX, wristY);
    ctx.stroke();

    // Warm, muscular upper arm.
    const skin = ctx.createLinearGradient(
      2, shoulderY - 4, 13, wristY + 3
    );
    skin.addColorStop(0, "#e0a273");
    skin.addColorStop(0.45, "#c98255");
    skin.addColorStop(1, "#9f6344");

    ctx.strokeStyle = skin;
    ctx.lineWidth = 5.5;

    ctx.beginPath();
    ctx.moveTo(shoulderX, shoulderY);
    ctx.lineTo(elbowX, elbowY);
    ctx.lineTo(wristX, wristY);
    ctx.stroke();

    // Defined bicep.
    ctx.fillStyle = "#d99a6a";
    ctx.beginPath();
    ctx.ellipse(
      5.5,
      side * 10.5,
      4.1,
      3.1,
      -0.25,
      0,
      Math.PI * 2
    );
    ctx.fill();

    // Subtle muscle definition.
    ctx.strokeStyle = "rgba(255, 215, 168, 0.38)";
    ctx.lineWidth = 0.9;
    ctx.beginPath();
    ctx.arc(5.5, side * 10.5, 2.6, -1.1, 1.1);
    ctx.stroke();

    // Forearm contour.
    ctx.strokeStyle = "rgba(255, 207, 156, 0.35)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(elbowX + 1, elbowY);
    ctx.lineTo(wristX - 1, wristY);
    ctx.stroke();

    // Tactical glove.
    ctx.fillStyle = "#1b281f";
    ctx.beginPath();
    ctx.ellipse(wristX, wristY, 3.7, 3.1, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#45523c";
    ctx.beginPath();
    ctx.ellipse(
      wristX - 0.5,
      wristY - 0.7,
      2.2,
      1.5,
      0,
      0,
      Math.PI * 2
    );
    ctx.fill();
  }

  // Both arms sit outside the torso.
  drawArm(1, false);
  drawArm(-1, true);

  // ----------------------------------------
  // TORSO — DEEP ARMY-OLIVE UNIFORM
  // ----------------------------------------

  // Outer body silhouette.
  ctx.fillStyle = "#1d2d1e";
  ctx.beginPath();
  ctx.ellipse(-1, 0, 16, 12.5, 0, 0, Math.PI * 2);
  ctx.fill();

  // Rich olive fabric.
  const uniform = ctx.createLinearGradient(-14, -11, 12, 11);
  uniform.addColorStop(0, "#596a3c");
  uniform.addColorStop(0.35, "#465a31");
  uniform.addColorStop(0.75, "#354a2b");
  uniform.addColorStop(1, "#293b25");

  ctx.fillStyle = uniform;
  ctx.beginPath();
  ctx.ellipse(-1, 0, 14.5, 11, 0, 0, Math.PI * 2);
  ctx.fill();

  // Broad shoulder armour.
  ctx.fillStyle = "#4c6135";
  ctx.strokeStyle = "#263a25";
  ctx.lineWidth = 1.2;

  ctx.beginPath();
  ctx.ellipse(2, -8.5, 5.5, 3.5, -0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  ctx.beginPath();
  ctx.ellipse(2, 8.5, 5.5, 3.5, 0.2, 0, Math.PI * 2);
  ctx.fill();
  ctx.stroke();

  // Tactical vest.
  ctx.fillStyle = "#283d27";
  ctx.beginPath();
  ctx.roundRect(-8, -7.5, 15, 15, 3.5);
  ctx.fill();

  const vest = ctx.createLinearGradient(-6, -7, 6, 7);
  vest.addColorStop(0, "#617342");
  vest.addColorStop(1, "#34492c");

  ctx.fillStyle = vest;
  ctx.beginPath();
  ctx.roundRect(-6.5, -6, 12, 12, 2.5);
  ctx.fill();

  // Chest plate.
  ctx.fillStyle = "#465c34";
  ctx.beginPath();
  ctx.roundRect(-4.5, -4.5, 8.5, 9, 2);
  ctx.fill();

  // Chest plate seam.
  ctx.strokeStyle = "rgba(180, 183, 127, 0.4)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(-0.5, -3.5);
  ctx.lineTo(-0.5, 3.5);
  ctx.stroke();

  // Utility pouches.
  ctx.fillStyle = "#263923";
  ctx.beginPath();
  ctx.roundRect(-8, -6, 3.5, 4.5, 1);
  ctx.roundRect(-8, 1.5, 3.5, 4.5, 1);
  ctx.fill();

  // Pouch clasps.
  ctx.fillStyle = "#9d915c";
  ctx.fillRect(-7, -4.5, 1.5, 1);
  ctx.fillRect(-7, 3, 1.5, 1);

  // Belt.
  ctx.strokeStyle = "#202a20";
  ctx.lineWidth = 2.5;
  ctx.beginPath();
  ctx.moveTo(-13, 0);
  ctx.lineTo(10, 0);
  ctx.stroke();

  // Belt buckle.
  ctx.fillStyle = "#b5a064";
  ctx.fillRect(-1, -1.5, 3, 3);

  // ----------------------------------------
  // HEAD — FULL, STYLED DEEP-BROWN HAIR
  // ----------------------------------------

  // Neck.
  ctx.fillStyle = "#a86c4b";
  ctx.beginPath();
  ctx.ellipse(10, 0, 4, 4, 0, 0, Math.PI * 2);
  ctx.fill();

  // Full hair silhouette.
  ctx.fillStyle = "#211711";
  ctx.beginPath();
  ctx.ellipse(14, 0, 9.5, 9, 0, 0, Math.PI * 2);
  ctx.fill();

  // Main dark-brown hair.
  const hair = ctx.createRadialGradient(11, -4, 1, 14, 0, 11);
  hair.addColorStop(0, "#593a28");
  hair.addColorStop(0.55, "#38251c");
  hair.addColorStop(1, "#201712");

  ctx.fillStyle = hair;
  ctx.beginPath();
  ctx.ellipse(14, 0, 8.8, 8.3, 0, 0, Math.PI * 2);
  ctx.fill();

  // Swept, fuller front hairstyle.
  ctx.fillStyle = "#493021";
  ctx.beginPath();
  ctx.moveTo(7, -4);
  ctx.quadraticCurveTo(8, -10, 15, -9);
  ctx.quadraticCurveTo(22, -8, 22, -2);
  ctx.quadraticCurveTo(19, -5, 15, -5);
  ctx.quadraticCurveTo(10, -3, 7, -4);
  ctx.fill();

  // Subtle natural shine, no streaks.
  ctx.strokeStyle = "rgba(143, 102, 70, 0.22)";
  ctx.lineWidth = 1.3;
  ctx.beginPath();
  ctx.arc(13, -1.5, 5.8, -2.5, -1.25);
  ctx.stroke();

  // Face at the front.
  ctx.fillStyle = "#ce9068";
  ctx.beginPath();
  ctx.ellipse(20, 0, 3.2, 4.2, 0, -Math.PI / 2, Math.PI / 2);
  ctx.fill();

  // ----------------------------------------
  // KNIFE — HORIZONTAL POLISHED STEEL
  // ----------------------------------------

  // Handle.
  ctx.fillStyle = "#202a27";
  ctx.beginPath();
  ctx.roundRect(18, -12, 7, 3.5, 1.2);
  ctx.fill();

  // Grip texture.
  ctx.strokeStyle = "#78827b";
  ctx.lineWidth = 0.7;
  ctx.beginPath();
  ctx.moveTo(20, -11.5);
  ctx.lineTo(20, -9.5);
  ctx.moveTo(22, -11.5);
  ctx.lineTo(22, -9.5);
  ctx.stroke();

  // Guard.
  ctx.fillStyle = "#aebbc0";
  ctx.fillRect(24, -13, 1.5, 5);

  // Blade.
  const blade = ctx.createLinearGradient(25, -13, 25, -8);
  blade.addColorStop(0, "#ffffff");
  blade.addColorStop(0.3, "#dcecf2");
  blade.addColorStop(0.65, "#91adba");
  blade.addColorStop(1, "#f7fbff");

  ctx.fillStyle = blade;
  ctx.beginPath();
  ctx.moveTo(25, -12.5);
  ctx.lineTo(37, -11);
  ctx.lineTo(41, -10.5);
  ctx.lineTo(37, -9.5);
  ctx.lineTo(25, -9);
  ctx.closePath();
  ctx.fill();

  // Reflective blade edge.
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 0.8;
  ctx.beginPath();
  ctx.moveTo(25, -12.5);
  ctx.lineTo(37, -11);
  ctx.lineTo(41, -10.5);
  ctx.stroke();

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
