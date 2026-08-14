import { useEffect, useRef, useState } from "react";
import { assetRegistry, getRoomStem, getBackgroundSprite } from "../assets/assetRegistry.js";

const WIDTH = 390;
const HEIGHT = 510;
const ROOM_MAX_W = 122;
const ROOM_MAX_H = 108;
const PAYMENT_POINT = { x: WIDTH / 2, y: HEIGHT - 28 };
const CLIENT_POINT = { x: WIDTH / 2, y: 34 };
const COOLER_POINT = { x: WIDTH * 0.5, y: HEIGHT * 0.43 };

// How active a department's office life looks. Higher = employees leave their
// desks and walk to the water cooler more often. Visual flavor only.
const DEPARTMENT_LIVELINESS = {
  sales: 1,
  marketing: 0.9,
  support: 0.8,
  advertising: 0.7,
  qa: 0.6,
  strategy: 0.6,
  copywriting: 0.6,
  design: 0.55,
  analysis: 0.55,
  warehouse: 0.55,
  procurement: 0.5,
  analytics: 0.5,
  accounting: 0.45,
  development: 0.3,
};

// `metrics` is passed in rather than derived here: the parent already memoizes
// getMetrics(state), and this component redraws on every animation frame, so
// recomputing it would rebuild the whole metrics object ~60 times a second for
// nothing.
export function OfficeCanvas({ state, metrics, t, language }) {
  const canvasRef = useRef(null);
  const sprites = useSpriteAssets(state.companyType.id);

  useEffect(() => {
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    const pixelRatio = window.devicePixelRatio || 1;
    canvas.width = WIDTH * pixelRatio;
    canvas.height = HEIGHT * pixelRatio;
    context.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    drawOffice(context, state, metrics, sprites, t);
    // language is a dependency so canvas text re-renders when the player switches it.
  }, [state, metrics, sprites, t, language]);

  return (
    <canvas
      ref={canvasRef}
      className="office-canvas"
      width={WIDTH}
      height={HEIGHT}
      aria-label="Live office simulation with diverse employees and moving workflow tokens"
    />
  );
}

function useSpriteAssets(companyId) {
  const [sprites, setSprites] = useState({ ready: false, employees: {}, departments: {}, tasks: {}, office: {}, background: null });

  useEffect(() => {
    let cancelled = false;
    const employees = {};
    const departments = {};
    const tasks = {};
    const office = {};
    let background = null;
    const jobs = [];

    for (const [character, states] of Object.entries(assetRegistry.employees)) {
      employees[character] = {};
      for (const [stateName, url] of Object.entries(states)) {
        jobs.push(loadImage(url).then((image) => { employees[character][stateName] = image; }));
      }
    }
    for (const [stem, url] of Object.entries(assetRegistry.departments)) {
      jobs.push(loadImage(url).then((image) => { departments[stem] = image; }));
    }
    for (const [stem, url] of Object.entries(assetRegistry.tasks)) {
      jobs.push(loadImage(url).then((image) => { tasks[stem] = image; }));
    }
    if (assetRegistry.office.water_cooler) {
      jobs.push(loadImage(assetRegistry.office.water_cooler).then((image) => { office.water_cooler = image; }));
    }
    const backgroundUrl = getBackgroundSprite(companyId);
    if (backgroundUrl) {
      jobs.push(loadImage(backgroundUrl).then((image) => { background = image; }));
    }

    Promise.all(jobs).then(() => {
      if (!cancelled) setSprites({ ready: true, employees, departments, tasks, office, background });
    });

    return () => { cancelled = true; };
  }, [companyId]);

  return sprites;
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = url;
  });
}

function drawOffice(ctx, state, metrics, sprites, t) {
  const effects = metrics.automationEffects;
  const time = Date.now();

  ctx.clearRect(0, 0, WIDTH, HEIGHT);
  ctx.imageSmoothingEnabled = true;
  drawBackground(ctx, sprites.background);
  drawWorkflowLanes(ctx, state, effects);
  drawWaterCooler(ctx, sprites);
  drawPaymentEndpoint(ctx, metrics, t);

  // Wandering employees are collected and drawn last so they render above rooms
  // while crossing the floor (the "walking through hallways" effect).
  const wanderers = [];
  drawDepartments(ctx, state, metrics.bottleneck?.id, sprites, time, t, wanderers);
  drawAutomationOverlays(ctx, state, effects, t);
  for (const w of wanderers) drawEmployeeSprite(ctx, w.image, w.x, w.y, w.size);
  drawTasks(ctx, state, sprites);
}

// The office scene background is an asset, drawn to cover the canvas (scaled and
// center-cropped). The canvas element itself scales responsively via CSS.
function drawBackground(ctx, image) {
  if (!image) {
    ctx.fillStyle = "#0b1622";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    return;
  }

  const scale = Math.max(WIDTH / image.naturalWidth, HEIGHT / image.naturalHeight);
  const w = image.naturalWidth * scale;
  const h = image.naturalHeight * scale;
  ctx.drawImage(image, (WIDTH - w) / 2, (HEIGHT - h) / 2, w, h);

  // Subtle darkening so rooms, tokens and lanes stay readable over the texture.
  ctx.fillStyle = "rgba(7, 16, 26, 0.34)";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
}

function drawWorkflowLanes(ctx, state, effects) {
  ctx.lineCap = "round";
  ctx.lineJoin = "round";

  // Lanes follow the company's department order (data-driven, works for every
  // company type): client -> first department -> ... -> last department -> payment.
  const flow = state.departments;
  const segments = [];
  if (flow[0]) {
    segments.push({ start: CLIENT_POINT, end: getPoint(flow[0]), color: "#58d86b" });
  }
  for (let index = 0; index < flow.length - 1; index += 1) {
    segments.push({ start: getPoint(flow[index]), end: getPoint(flow[index + 1]), color: flow[index].color });
  }
  const last = flow[flow.length - 1];
  if (last) segments.push({ start: getPoint(last), end: PAYMENT_POINT, color: "#58d86b" });

  for (const segment of segments) drawLane(ctx, segment.start, segment.end, segment.color, effects);
}

function drawLane(ctx, start, end, color, effects) {
  if (!effects?.workflowLines) {
    ctx.strokeStyle = color;
    ctx.globalAlpha = 0.3;
    ctx.lineWidth = 2;
    ctx.setLineDash([4, 7]);
    drawBend(ctx, start, end);
    ctx.setLineDash([]);
    ctx.globalAlpha = 1;
    return;
  }

  ctx.strokeStyle = color;
  ctx.globalAlpha = 0.22;
  ctx.lineWidth = 16;
  drawBend(ctx, start, end);

  ctx.globalAlpha = 0.9;
  ctx.lineWidth = 5;
  drawBend(ctx, start, end);
  ctx.globalAlpha = 1;

  if (effects?.fastMovement) {
    ctx.strokeStyle = "#eafff0";
    ctx.globalAlpha = 0.85;
    ctx.lineWidth = 3;
    ctx.setLineDash([6, 14]);
    ctx.lineDashOffset = -(Date.now() / 28) % 20000;
    drawBend(ctx, start, end);
    ctx.setLineDash([]);
    ctx.lineDashOffset = 0;
    ctx.globalAlpha = 1;
  }
}

function drawDepartments(ctx, state, bottleneckId, sprites, time, t, wanderers) {
  for (const department of state.departments) {
    const point = getPoint(department);
    const roomImage = sprites.departments[getRoomStem(department.id)];
    const rect = getRoomRect(point, roomImage);
    const isBottleneck = department.id === bottleneckId && department.bottleneck?.isOverloaded;

    drawRoom(ctx, roomImage, rect, department, isBottleneck, t);
    drawDepartmentEmployees(ctx, sprites, department, rect, time, wanderers);
    drawDepartmentStats(ctx, department, rect, t);
    if (isBottleneck) drawBottleneckWarning(ctx, rect, department);
  }
}

function getRoomRect(point, image) {
  const iw = image?.naturalWidth || 100;
  const ih = image?.naturalHeight || 112;
  const scale = Math.min(ROOM_MAX_W / iw, ROOM_MAX_H / ih);
  const w = Math.round(iw * scale);
  const h = Math.round(ih * scale);
  return { x: Math.round(point.x - w / 2), y: Math.round(point.y - h / 2), w, h };
}

function drawRoom(ctx, image, rect, department, isBottleneck, t) {
  if (isBottleneck) {
    const pulse = getPulse(department);
    ctx.globalAlpha = 0.26 + pulse * 0.28;
    ctx.fillStyle = "#ff654f";
    ctx.fillRect(rect.x - 5, rect.y - 5, rect.w + 10, rect.h + 10);
    ctx.globalAlpha = 1;
  }

  if (image) {
    ctx.drawImage(image, rect.x, rect.y, rect.w, rect.h);
  } else {
    ctx.fillStyle = "rgba(10, 22, 35, 0.92)";
    ctx.fillRect(rect.x, rect.y, rect.w, rect.h);
  }

  ctx.strokeStyle = isBottleneck ? "#ff654f" : department.color;
  ctx.lineWidth = isBottleneck ? 3 : 2;
  ctx.strokeRect(rect.x, rect.y, rect.w, rect.h);

  const name = t(`department.${department.id}`);
  ctx.fillStyle = "rgba(7, 16, 26, 0.82)";
  ctx.fillRect(rect.x, rect.y - 14, Math.min(rect.w, name.length * 7 + 10), 13);
  ctx.fillStyle = department.color;
  ctx.font = "700 11px monospace";
  ctx.fillText(name, rect.x + 4, rect.y - 4);
}

// Animation is selected automatically from simulation state: employees filling
// active processing slots are seated (working); the rest are idle and may blink
// or take a walk to the water cooler.
function drawDepartmentEmployees(ctx, sprites, department, rect, time, wanderers) {
  const staff = department.staff ?? [];
  const maxVisible = Math.min(staff.length, 6);
  const activeCount = department.active.length;
  const liveliness = DEPARTMENT_LIVELINESS[department.id] ?? 0.5;

  for (let index = 0; index < maxVisible; index += 1) {
    const employee = staff[index];
    const working = index < activeCount;
    const frame = getEmployeeFrame(employee, department.id, index, working, rect, time, liveliness);
    const characterSet = sprites.employees[employee.characterType] ?? {};
    const image = characterSet[frame.state] ?? characterSet.idle;
    const size = Math.round(rect.w * (working ? 0.5 : 0.4));

    if (frame.wandering) {
      wanderers.push({ image, x: frame.x, y: frame.y, size });
    } else {
      drawEmployeeSprite(ctx, image, frame.x, frame.y, size);
    }
  }
}

function getEmployeeFrame(employee, departmentId, index, working, rect, time, liveliness) {
  const home = deskSlot(rect, index);
  if (working) {
    return { state: "sitting", x: home.x, y: home.y, wandering: false };
  }

  const seed = hashId(employee.id);
  const state = blinkState(time, seed);

  // Occasionally leave the desk for the water cooler and walk back.
  const cycle = 9000 + (seed % 7000);
  const phase = ((time + seed * 263) % cycle) / cycle;
  const runWindow = 0.16 + liveliness * 0.22;

  if (phase > 1 - runWindow) {
    const p = (phase - (1 - runWindow)) / runWindow;
    if (p < 0.4) {
      const k = p / 0.4;
      const pos = lerpPoint(home, COOLER_POINT, k);
      return { state: `walk_${walkDir(home, COOLER_POINT)}`, x: pos.x, y: pos.y, wandering: true };
    }
    if (p < 0.6) {
      return { state, x: COOLER_POINT.x, y: COOLER_POINT.y, wandering: true };
    }
    const k = (p - 0.6) / 0.4;
    const pos = lerpPoint(COOLER_POINT, home, k);
    return { state: `walk_${walkDir(COOLER_POINT, home)}`, x: pos.x, y: pos.y, wandering: true };
  }

  return { state, x: home.x, y: home.y, wandering: false };
}

function deskSlot(rect, index) {
  const cols = 3;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const slotW = rect.w / cols;
  return {
    x: rect.x + slotW * (col + 0.5),
    y: rect.y + rect.h * 0.52 + row * rect.h * 0.26,
  };
}

function drawEmployeeSprite(ctx, image, x, y, size) {
  if (!image) return;
  // Anchored bottom-center so the character's feet sit on the slot point.
  ctx.drawImage(image, x - size / 2, y - size, size, size);
}

function blinkState(time, seed) {
  return (time + seed * 97) % 2600 < 160 ? "idle_blink" : "idle";
}

function walkDir(from, to) {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  if (Math.abs(dx) > Math.abs(dy)) return dx > 0 ? "right" : "left";
  return dy > 0 ? "down" : "up";
}

function drawDepartmentStats(ctx, department, rect, t) {
  const throughput = department.throughputWindow?.length ?? 0;
  const utilization = Math.round((department.bottleneck?.utilization ?? 0) * 100);
  const growth = department.bottleneck?.queueGrowthRate ?? 0;
  const x = rect.x + rect.w - 44;
  const y = rect.y + 12;

  ctx.fillStyle = "rgba(7, 16, 26, 0.78)";
  ctx.fillRect(x - 3, y - 9, 45, 50);
  ctx.fillStyle = "#dcecff";
  ctx.font = "700 9px monospace";
  ctx.fillText(`${t("stat.queue")} ${department.queue.length}`, x, y);
  ctx.fillText(`${t("stat.util")} ${utilization}%`, x, y + 12);
  ctx.fillText(`${t("stat.growth")} ${growth >= 0 ? "+" : ""}${growth.toFixed(1)}`, x, y + 24);
  ctx.fillText(`${t("stat.throughput")} ${throughput}${t("stat.perMinute")}`, x, y + 36);
}

function drawBottleneckWarning(ctx, rect, department) {
  const pulse = getPulse(department);
  const centerX = rect.x + rect.w / 2;
  const topY = rect.y - 20;

  ctx.fillStyle = `rgba(255, 101, 79, ${0.18 + pulse * 0.22})`;
  ctx.beginPath();
  ctx.arc(centerX, topY + 10, 18 + pulse * 6, 0, Math.PI * 2);
  ctx.fill();

  ctx.fillStyle = "#ff654f";
  ctx.beginPath();
  ctx.moveTo(centerX, topY);
  ctx.lineTo(centerX + 13, topY + 22);
  ctx.lineTo(centerX - 13, topY + 22);
  ctx.closePath();
  ctx.fill();

  ctx.fillStyle = "#07101b";
  ctx.font = "900 16px monospace";
  ctx.fillText("!", centerX - 4, topY + 19);
}

function drawWaterCooler(ctx, sprites) {
  const image = sprites.office?.water_cooler;
  const size = 30;
  if (image) {
    ctx.drawImage(image, COOLER_POINT.x - size / 2, COOLER_POINT.y - size, size, size);
  } else {
    ctx.fillStyle = "#4bb4ff";
    ctx.fillRect(COOLER_POINT.x - 6, COOLER_POINT.y - 16, 12, 16);
  }
}

// Cap how many queued tokens are drawn per department. The exact queue size is
// always shown in the room stats; this only bounds rendering so a large backlog
// (e.g. a long-overloaded department after offline catch-up) cannot drag the
// frame rate down. An id->task map keeps lookups O(1) regardless of backlog.
const MAX_QUEUE_TOKENS = 8;

function drawTasks(ctx, state, sprites) {
  const byId = new Map(state.tasks.map((task) => [task.id, task]));

  // Moving tokens travel along the workflow lanes.
  for (const task of state.tasks) {
    if (task.status !== "moving") continue;
    const start = getRoutePoint(state, task.fromDepartmentId);
    const end = getRoutePoint(state, task.targetDepartmentId);
    if (!start || !end) continue;
    drawTaskToken(ctx, interpolateBend(start, end, task.progress), sprites.tasks[`${task.kind}_token`], task.kind);
  }

  // Queued tokens stack beside their department, capped for performance.
  for (const department of state.departments) {
    const visible = Math.min(department.queue.length, MAX_QUEUE_TOKENS);
    for (let index = 0; index < visible; index += 1) {
      const task = byId.get(department.queue[index]);
      if (!task) continue;
      drawTaskToken(ctx, queuedPosition(department, index), sprites.tasks[`${task.kind}_token`], task.kind);
    }
  }
}

function drawTaskToken(ctx, point, image, kind) {
  if (image) {
    ctx.drawImage(image, point.x - 11, point.y - 11, 22, 22);
    return;
  }
  ctx.fillStyle = kind === "bug" ? "#ff654f" : "#ffffff";
  ctx.fillRect(point.x - 5, point.y - 7, 10, 13);
}

function drawPaymentEndpoint(ctx, metrics, t) {
  ctx.fillStyle = "#0d1824";
  ctx.strokeStyle = "#58d86b";
  ctx.lineWidth = 2;
  ctx.fillRect(PAYMENT_POINT.x - 58, PAYMENT_POINT.y - 16, 116, 34);
  ctx.strokeRect(PAYMENT_POINT.x - 58, PAYMENT_POINT.y - 16, 116, 34);
  ctx.fillStyle = "#66da7a";
  ctx.font = "700 13px monospace";
  ctx.fillText(t("canvas.payment"), PAYMENT_POINT.x - 30, PAYMENT_POINT.y - 1);
  ctx.fillStyle = "#dcecff";
  ctx.font = "700 9px monospace";
  ctx.fillText(`${t("canvas.revenue")} ${formatCompact(metrics.revenue)}`, PAYMENT_POINT.x - 42, PAYMENT_POINT.y + 12);
}

// The Accounting System emits a stream of invoice pulses toward the payment
// endpoint while it auto-clears its queue.
function drawAutomationOverlays(ctx, state, effects, t) {
  if (!effects?.autoInvoice) return;
  const accounting = state.departments.find((department) => department.id === "accounting");
  if (!accounting) return;

  const point = getPoint(accounting);
  const badgeX = point.x - 46;
  const badgeY = point.y + 30;

  ctx.fillStyle = "#0d2032";
  ctx.strokeStyle = "#f5c846";
  ctx.lineWidth = 1.5;
  ctx.fillRect(badgeX, badgeY, 92, 15);
  ctx.strokeRect(badgeX, badgeY, 92, 15);
  ctx.fillStyle = "#f5c846";
  ctx.font = "700 9px monospace";
  ctx.fillText(t("canvas.autoInvoice"), badgeX + 6, badgeY + 11);

  for (let i = 0; i < 3; i += 1) {
    const phase = ((Date.now() / 900) + i / 3) % 1;
    const dot = interpolateBend(point, PAYMENT_POINT, phase);
    ctx.fillStyle = "#f5c846";
    ctx.globalAlpha = 0.85 * (1 - phase * 0.4);
    ctx.beginPath();
    ctx.arc(dot.x, dot.y, 3, 0, Math.PI * 2);
    ctx.fill();
    ctx.globalAlpha = 1;
  }
}

function getRoutePoint(state, id) {
  if (id === "client") return CLIENT_POINT;
  if (id === "payment") return PAYMENT_POINT;
  const department = state.departments.find((item) => item.id === id);
  return department ? getPoint(department) : null;
}

function getPoint(department) {
  return { x: department.x * WIDTH, y: department.y * HEIGHT };
}

function drawBend(ctx, start, end) {
  const midY = (start.y + end.y) / 2;
  ctx.beginPath();
  ctx.moveTo(start.x, start.y);
  ctx.lineTo(start.x, midY);
  ctx.lineTo(end.x, midY);
  ctx.lineTo(end.x, end.y);
  ctx.stroke();
}

function interpolateBend(start, end, progress) {
  const clamped = Math.max(0, Math.min(1, progress));
  const midY = (start.y + end.y) / 2;
  const points = [start, { x: start.x, y: midY }, { x: end.x, y: midY }, end];
  const segment = Math.min(2, Math.floor(clamped * 3));
  const local = clamped * 3 - segment;
  return {
    x: lerp(points[segment].x, points[segment + 1].x, local),
    y: lerp(points[segment].y, points[segment + 1].y, local),
  };
}

function queuedPosition(department, index) {
  const base = getPoint(department);
  const safeIndex = Math.max(0, index);
  return {
    x: base.x + 52 - Math.floor(safeIndex / 6) * 13,
    y: base.y - 24 + (safeIndex % 6) * 9,
  };
}

function line(ctx, x1, y1, x2, y2) {
  ctx.beginPath();
  ctx.moveTo(x1, y1);
  ctx.lineTo(x2, y2);
  ctx.stroke();
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

function lerpPoint(a, b, t) {
  return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
}

function hashId(id) {
  let hash = 0;
  for (let i = 0; i < id.length; i += 1) {
    hash = (hash * 31 + id.charCodeAt(i)) >>> 0;
  }
  return hash;
}

function formatCompact(value) {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}K`;
  return `$${Math.round(value)}`;
}

function getPulse(department) {
  const severity = department.bottleneck?.severity ?? 0;
  const phase = ((Date.now() / 260) + department.x * 3 + department.y * 5) % (Math.PI * 2);
  return Math.max(0, Math.sin(phase)) * Math.max(0.35, severity);
}
