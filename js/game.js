
const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const TILE = 60;
const WORLD_COLS = 30;
const WORLD_ROWS = 20;
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
  // 0. Upper-left: large concrete block with an L of small crates
  [4, 3, 2, 2],
  [6, 3, 1, 1],
  [6, 4, 1, 1],
  [5, 5, 1, 1],

  // 4. Upper-middle: long concrete wall with cargo containers alongside
  [10, 3, 5, 1],
  [10, 4, 2, 1],
  [12, 4, 2, 1],

  // 7. Upper-right: large concrete block and attached crates
  [22, 3, 2, 2],
  [21, 3, 1, 1],
  [21, 4, 1, 1],

  // 10. Middle-left: long concrete wall with crate extension
  [3, 8, 5, 1],
  [3, 9, 2, 1],
  [7, 9, 1, 2],

  // 13. Centre: large concrete structure and crate line
  [10, 8, 2, 2],
  [12, 8, 3, 1],

  // 15. Middle-right: long wall with attached crates
  [18, 8, 4, 1],
  [18, 9, 2, 1],
  [21, 9, 1, 2],

  // 18–20. Lower-left: large U-shaped hiding structure
  [3, 13, 1, 3],
  [6, 13, 1, 3],
  [4, 15, 2, 1],

  // 21. Lower-middle-left: large cargo container
  [9, 14, 2, 2],

  // 22–23. Lower-middle: concrete wall with large crates
  [12, 14, 4, 1],
  [12, 15, 2, 2],

  // 24. Lower-middle-right: large concrete block and L-shaped crates
  [18, 14, 2, 2],
  [20, 14, 1, 1],
  [20, 15, 1, 1],
  [19, 16, 2, 1],

  // 28–29. Far-right: long concrete wall and large cargo container
  [24, 14, 3, 1],
  [24, 15, 2, 2]
];

for (const [x, y, w, h] of obstacles) {
  for (let row = y; row < y + h; row++)
    for (let col = x; col < x + w; col++)
      map[row][col] = 1;
}

const player = {
  x: TILE * 2.5,
  y: TILE * 2.5,
  speed: 190,
  radius: 17,
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
  const distance = Math.hypot(x2-x1, y2-y1);
  const steps = Math.ceil(distance / 12);

  for (let i = 1; i < steps; i++) {
    const t = i / steps;
    const x = x1 + (x2-x1)*t;
    const y = y1 + (y2-y1)*t;

    if (!isWalkable(Math.floor(x/TILE), Math.floor(y/TILE)))
      return false;
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

function makeGuard(x,y,patrol) {
  return {
    x:x*TILE+TILE/2,
    y:y*TILE+TILE/2,
    angle:0,
    speed:65,
    patrol:patrol.map(([px,py]) => ({
      x:px*TILE+TILE/2,
      y:py*TILE+TILE/2
    })),
    patrolIndex:0,
    state:"patrol",
    dead:false,
    shotCooldown:0,
    suspicion:0,
    lastSeenX:x*TILE+TILE/2,
    lastSeenY:y*TILE+TILE/2,
    searchTimer:0
  };
}

const guards = [
  makeGuard(7,6,[[7,6],[12,6],[12,7],[7,7]]),
  makeGuard(17,6,[[17,6],[21,6],[21,7],[17,7]]),
  makeGuard(7,12,[[7,12],[12,12],[12,13],[7,13]]),
  makeGuard(23,12,[[23,12],[26,12],[26,13],[23,13]])
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

    guard.shotCooldown = Math.max(0, guard.shotCooldown - delta);
    const sees = guardSeesPlayer(guard);

    if (sees) {
      guard.state = "alert";
      guard.suspicion = 1;
      guard.lastSeenX = player.x;
      guard.lastSeenY = player.y;
      guard.searchTimer = 3.5;
      guard.angle = Math.atan2(
        player.y - guard.y,
        player.x - guard.x
      );

      // Guards only shoot while they have clear sight.
      if (guard.shotCooldown <= 0) {
        player.health = Math.max(0, player.health - 8);
        guard.shotCooldown = 1.2;
        showMessage("You've been hit!");
      }
      continue;
    }

    // The player is hidden: investigate the last known position.
    if (guard.state === "alert") {
      guard.state = "search";
      guard.searchTimer = Math.max(guard.searchTimer, 3.5);
      guard.suspicion = 1;
    }

    if (guard.state === "search") {
      guard.searchTimer -= delta;

      const dx = guard.lastSeenX - guard.x;
      const dy = guard.lastSeenY - guard.y;
      const distance = Math.hypot(dx, dy);

      if (distance > 7 && guard.searchTimer > 0) {
        guard.angle = Math.atan2(dy, dx);
        const step = Math.min(guard.speed * 1.15 * delta, distance);
        const nx = guard.x + dx / distance * step;
        const ny = guard.y + dy / distance * step;

        // Do not walk through obstacles.
        if (isWalkable(Math.floor(nx / TILE), Math.floor(ny / TILE))) {
          guard.x = nx;
          guard.y = ny;
        }
      } else if (guard.searchTimer <= 0) {
        guard.state = "patrol";
        guard.suspicion = 0;
      }
      continue;
    }

    // Normal patrol.
    const target = guard.patrol[guard.patrolIndex];
    const dx = target.x - guard.x;
    const dy = target.y - guard.y;
    const distance = Math.hypot(dx, dy);

    if (distance < 5) {
      guard.patrolIndex = (guard.patrolIndex + 1) % guard.patrol.length;
    } else {
      guard.angle = Math.atan2(dy, dx);
      const speed = guard.speed * delta;
      guard.x += dx / distance * speed;
      guard.y += dy / distance * speed;
    }
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
    if (distance <= 34) {
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
      Math.hypot(guard.x - player.x, guard.y - player.y) <= 34
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
function drawConcreteCluster(x, y, w, h) {
  const px = x * TILE + 3;
  const py = y * TILE + 3;
  const width = w * TILE - 6;
  const height = h * TILE - 6;

  ctx.save();

  // Ground shadow.
  ctx.shadowColor = "rgba(0,0,0,0.38)";
  ctx.shadowBlur = 12;
  ctx.shadowOffsetY = 7;

  roundedRectPath(px, py, width, height, 9);
  ctx.fillStyle = "#382b27";
  ctx.fill();

  ctx.shadowColor = "transparent";
  ctx.shadowBlur = 0;
  ctx.shadowOffsetY = 0;

  // Outer metal rim.
  roundedRectPath(px + 2, py + 2, width - 4, height - 4, 8);
  ctx.fillStyle = "#665044";
  ctx.fill();

  ctx.strokeStyle = "#302622";
  ctx.lineWidth = 3;
  ctx.stroke();

  // Draw each concrete block separately.
  for (let row = 0; row < h; row++) {
    for (let col = 0; col < w; col++) {
      const bx = px + col * TILE + 5;
      const by = py + row * TILE + 5;

      const bw = TILE - 10;
      const bh = TILE - 10;

      // Recessed concrete centre.
      roundedRectPath(bx, by, bw, bh, 5);

      const gradient = ctx.createLinearGradient(
        bx, by, bx + bw, by + bh
      );

      gradient.addColorStop(0, "#aaa69c");
      gradient.addColorStop(0.5, "#918e86");
      gradient.addColorStop(1, "#77766f");

      ctx.fillStyle = gradient;
      ctx.fill();

      ctx.strokeStyle = "#51443d";
      ctx.lineWidth = 2;
      ctx.stroke();

      // Small concrete texture marks.
      ctx.fillStyle = "rgba(45,42,38,0.13)";

      for (let i = 0; i < 5; i++) {
        const mx = bx + 10 + ((i * 19 + col * 7) % 35);
        const my = by + 12 + ((i * 13 + row * 11) % 28);

        ctx.fillRect(mx, my, 3, 2);
      }

      // Metal bolts in the corners.
      ctx.fillStyle = "#3d302b";

      for (const [ox, oy] of [
        [8, 8], [bw - 8, 8],
        [8, bh - 8], [bw - 8, bh - 8]
      ]) {
        ctx.beginPath();
        ctx.arc(bx + ox, by + oy, 2.3, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

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

// Draw all warehouse obstacles with different industrial materials.
function drawObstacles() {
  // Draw the outer warehouse walls.
  ctx.fillStyle = "#303a3c";

  for (let x = 0; x < WORLD_COLS; x++) {
    ctx.fillRect(x * TILE, 0, TILE, TILE);
    ctx.fillRect(x * TILE, (WORLD_ROWS - 1) * TILE, TILE, TILE);
  }

  for (let y = 0; y < WORLD_ROWS; y++) {
    ctx.fillRect(0, y * TILE, TILE, TILE);
    ctx.fillRect((WORLD_COLS - 1) * TILE, y * TILE, TILE, TILE);
  }

  // Concrete barriers distributed throughout the formations.
// Concrete barriers distributed throughout the formations.
const concreteGroups = new Set([
  0, 4, 7, 10, 13, 15,
  18, 19, 20, 22, 24, 28
]);

// Selected crates get industrial warning stripes.
const hazardGroups = new Set([
  6, 16, 23, 29
]);

  obstacles.forEach(([x, y, w, h], index) => {
    if (concreteGroups.has(index)) {
      drawConcreteCluster(x, y, w, h);
    } else {
      drawCargoContainer(
        x,
        y,
        w,
        h,
        hazardGroups.has(index)
      );
    }
  });
}
function drawVision(guard) {
  if (guard.dead) return;

  ctx.save();
  ctx.translate(guard.x,guard.y);
  ctx.rotate(guard.angle);

  ctx.beginPath();
  ctx.moveTo(0,0);
  ctx.arc(0,0,VISION_RANGE,
    -VISION_ANGLE/2,VISION_ANGLE/2);
  ctx.closePath();

  const currentlySeesPlayer = guardSeesPlayer(guard);

  ctx.fillStyle = currentlySeesPlayer
    ? "rgba(255,35,35,.25)"
    : guard.state === "search"
      ? "rgba(255,155,45,.18)"
      : "rgba(255,210,65,.13)";

  ctx.fill();
  ctx.restore();
}

function drawGuard(guard) {
  if (guard.dead) return;

  ctx.save();
  ctx.translate(guard.x,guard.y);
  ctx.rotate(guard.angle);

  ctx.fillStyle="#26323a";
  ctx.beginPath();
  ctx.ellipse(0,0,13,16,0,0,Math.PI*2);
  ctx.fill();

  ctx.strokeStyle="#c5b49b";
  ctx.lineWidth=5;
  ctx.beginPath();
  ctx.moveTo(2,-8);
  ctx.lineTo(13,-8);
  ctx.moveTo(2,8);
  ctx.lineTo(13,8);
  ctx.stroke();

  ctx.fillStyle="#c99b75";
  ctx.beginPath();
  ctx.arc(11,0,8,0,Math.PI*2);
  ctx.fill();

  // Gun.
  ctx.fillStyle="#17191b";
  ctx.fillRect(15,-3,15,6);

  ctx.restore();

  if (guard.state==="alert") {
    ctx.fillStyle="#ff3333";
    ctx.font="bold 20px Arial";
    ctx.fillText("!",guard.x-4,guard.y-25);
  }
}

function drawPlayer() {
  const moving=pathIndex<path.length ||
    keys.w||keys.a||keys.s||keys.d||
    keys.arrowup||keys.arrowdown||
    keys.arrowleft||keys.arrowright;

  const step=moving?Math.sin(player.walkTime)*5:0;

  ctx.save();
  ctx.translate(player.x,player.y);
  ctx.rotate(player.angle);

  ctx.strokeStyle="#202c3b";
  ctx.lineWidth=7;
  ctx.lineCap="round";
  ctx.beginPath();
  ctx.moveTo(-3,-5);
  ctx.lineTo(-9+step,-13);
  ctx.moveTo(-3,5);
  ctx.lineTo(-9-step,13);
  ctx.stroke();

  ctx.fillStyle="#263e50";
  ctx.beginPath();
  ctx.ellipse(0,0,12,15,0,0,Math.PI*2);
  ctx.fill();

  ctx.strokeStyle="#d5aa83";
  ctx.lineWidth=5;
  ctx.beginPath();
  ctx.moveTo(1,-8);
  ctx.lineTo(13,-11);
  ctx.moveTo(1,8);
  ctx.lineTo(13,11);
  ctx.stroke();

  ctx.strokeStyle="#d7dce0";
  ctx.lineWidth=3;
  ctx.beginPath();
  ctx.moveTo(13,-11);
  ctx.lineTo(25,-13);
  ctx.stroke();

  ctx.fillStyle="#d8ad87";
  ctx.beginPath();
  ctx.arc(11,0,8,0,Math.PI*2);
  ctx.fill();

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
    !g.dead && Math.hypot(g.x-wx,g.y-wy)<27
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
