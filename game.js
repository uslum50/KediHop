/* ==========================================================
   ZIPLAYAN KEDİCİK — 2D Platform Oyunu
   Vanilla JS + Canvas. PWA olarak paketlenip PWABuilder ile
   APK'ya çevrilmeye uygundur (dış kütüphane yok).
   ========================================================== */

(() => {
  "use strict";

  // ---------- Sabitler ----------
  const TOTAL_LEVELS = 10;
  const GRAVITY = 1700;          // px/s^2
  const JUMP_VELOCITY = -680;    // px/s
  const MOVE_SPEED = 250;        // px/s (ileri butonuna basılıyken)
  const FRICTION_DECEL = 900;    // buton bırakılınca yavaşlama
  const POWER_DURATION = 15;     // saniye
  const CAT_W = 46, CAT_H = 42;
  const GROUND_HEIGHT = 90;
  const SAVE_KEY = "kedicikOyunu_v1";

  // ---------- Canvas ----------
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, groundY = 0;

  function resize() {
    W = window.innerWidth;
    H = window.innerHeight;
    canvas.width = W;
    canvas.height = H;
    canvas.style.width = W + "px";
    canvas.style.height = H + "px";
    groundY = H - GROUND_HEIGHT;
  }
  window.addEventListener("resize", resize);
  resize();

  // ---------- Kaydetme ----------
  function loadSave() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) return JSON.parse(raw);
    } catch (e) {}
    return { currentLevel: 1, unlockedLevel: 1 };
  }
  function writeSave() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) {}
  }
  let save = loadSave();

  // ---------- Oyun durumu ----------
  const Screens = {
    MENU: "menu", PLAYING: "playing", PAUSED: "paused",
    LEVEL_COMPLETE: "levelComplete", GAME_OVER: "gameOver",
    ALL_COMPLETE: "allComplete", LEVEL_SELECT: "levelSelect", HOWTO: "howto"
  };
  let screen = Screens.MENU;

  let input = { moveHeld: false, backHeld: false, jumpPressed: false };

  let level = null;      // aktif bölüm verisi
  let player = null;     // aktif kedicik verisi
  let camX = 0;
  let lastTime = 0;
  let elapsedInLevel = 0;

  // ---------- Bölüm üretimi ----------
  // Deterministik basit PRNG (seed = bölüm numarası) — her denemede aynı bölüm.
  function makeRng(seed) {
    let s = seed * 9301 + 49297;
    return function () {
      s = (s * 9301 + 49297) % 233280;
      return s / 233280;
    };
  }

  function generateLevel(levelNum) {
    const rng = makeRng(levelNum * 7 + 13);
    // Bölüm uzunluğu, yaklaşık 2 dakikalık oynanışa denk gelecek şekilde kademeli artar.
    const length = 3600 + levelNum * 420;
    const obstacles = [];
    const boxes = [];

    const difficulty = 1 + levelNum * 0.12;
    let x = 700; // ilk engelden önce boşluk

    while (x < length - 500) {
      const gap = (260 + rng() * 260) / difficulty;
      x += gap;
      if (x > length - 500) break;

      const kind = rng() < 0.72 ? "spike" : "flame";
      const w = kind === "spike" ? 36 + rng() * 18 : 22 + rng() * 12;
      const h = kind === "spike" ? 46 + rng() * 20 : 26 + rng() * 14;
      obstacles.push({ x, w, h, kind, destroyed: false });
    }

    // Soru işaretli kutular, engellerin arasına serpiştirilir.
    let bx = 500;
    while (bx < length - 400) {
      bx += 900 + rng() * 700;
      if (bx > length - 400) break;
      boxes.push({
        x: bx, y: groundY - 190, size: 46,
        used: false,
        fireSpawned: false, fireTaken: false, fireGrounded: false,
        fireX: bx + 23, fireY: groundY - 190, fireVy: 0
      });
    }

    return { num: levelNum, length, obstacles, boxes, finishX: length - 120 };
  }

  function startLevel(levelNum) {
    level = generateLevel(levelNum);
    player = {
      x: 80, y: groundY - CAT_H,
      vx: 0, vy: 0,
      w: CAT_W, h: CAT_H,
      onGround: true,
      powered: false,
      powerTimer: 0,
      dead: false,
      finished: false,
      facing: 1,
      runPhase: 0,
      squash: 1
    };
    camX = 0;
    elapsedInLevel = 0;
    save.currentLevel = levelNum;
    writeSave();
    document.getElementById("hudLevel").textContent = "Bölüm " + levelNum;
    setPowerHUD(false);
    screen = Screens.PLAYING;
    hideAllOverlays();
    document.getElementById("btnPause").classList.remove("hidden");
  }

  function retryLevel() {
    startLevel(level.num);
  }

  function goToNextLevel() {
    const next = level.num + 1;
    if (next > TOTAL_LEVELS) {
      screen = Screens.ALL_COMPLETE;
      hideAllOverlays();
      document.getElementById("gameCompleteOverlay").classList.remove("hidden");
      document.getElementById("btnPause").classList.add("hidden");
      save.currentLevel = 1;
      save.unlockedLevel = Math.max(save.unlockedLevel, TOTAL_LEVELS);
      writeSave();
      return;
    }
    save.unlockedLevel = Math.max(save.unlockedLevel, next);
    writeSave();
    startLevel(next);
  }

  // ---------- Girdi (dokunmatik / mouse) ----------
  const btnMove = document.getElementById("btnMove");
  const btnBack = document.getElementById("btnBack");
  const btnJump = document.getElementById("btnJump");

  function bindHold(el, onDown, onUp) {
    const down = (e) => { e.preventDefault(); onDown(); };
    const up = (e) => { e.preventDefault(); onUp(); };
    el.addEventListener("touchstart", down, { passive: false });
    el.addEventListener("touchend", up, { passive: false });
    el.addEventListener("touchcancel", up, { passive: false });
    el.addEventListener("mousedown", down);
    window.addEventListener("mouseup", up);
  }

  bindHold(btnMove, () => { input.moveHeld = true; }, () => { input.moveHeld = false; });
  bindHold(btnBack, () => { input.backHeld = true; }, () => { input.backHeld = false; });
  bindHold(btnJump, () => { input.jumpPressed = true; }, () => {});

  // ---------- Fizik / güncelleme ----------
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  function update(dt) {
    if (screen !== Screens.PLAYING) return;
    elapsedInLevel += dt;

    // --- Yatay hareket ---
    if (input.backHeld) {
      player.vx = -MOVE_SPEED;
      player.facing = -1;
    } else if (input.moveHeld) {
      player.vx = MOVE_SPEED;
      player.facing = 1;
    } else if (player.vx > 0) {
      player.vx = Math.max(0, player.vx - FRICTION_DECEL * dt);
    } else if (player.vx < 0) {
      player.vx = Math.min(0, player.vx + FRICTION_DECEL * dt);
    }

    // --- Zıplama ---
    if (input.jumpPressed) {
      if (player.onGround) {
        player.vy = JUMP_VELOCITY;
        player.onGround = false;
        player.squash = 1.25;
      }
      input.jumpPressed = false;
    }

    // --- Dikey fizik ---
    player.vy += GRAVITY * dt;
    player.x += player.vx * dt;
    player.y += player.vy * dt;

    if (player.y + player.h >= groundY) {
      player.y = groundY - player.h;
      player.vy = 0;
      player.onGround = true;
    }

    if (player.x < 0) player.x = 0;
    if (player.x > level.length) player.x = level.length;

    // koşu animasyon fazı
    if (Math.abs(player.vx) > 5) player.runPhase += dt * 10;
    player.squash += (1 - player.squash) * Math.min(1, dt * 8);

    // --- Güç süresi ---
    if (player.powered) {
      player.powerTimer -= dt;
      if (player.powerTimer <= 0) {
        player.powered = false;
        setPowerHUD(false);
      } else {
        document.getElementById("powerTimerText").textContent = Math.ceil(player.powerTimer);
      }
    }

    // --- Soru kutuları ---
    for (const box of level.boxes) {
      if (!box.used) {
        if (rectsOverlap(player.x, player.y, player.w, player.h, box.x, box.y, box.size, box.size)) {
          box.used = true;
          box.fireSpawned = true;
          box.fireX = box.x + box.size / 2;
          box.fireY = box.y;
          box.fireVy = 0;
          box.fireGrounded = false;
        }
      }
      if (box.fireSpawned && !box.fireTaken) {
        const fw = 30, fh = 34;
        const groundLevel = groundY - fh;
        if (!box.fireGrounded) {
          // ateş yerçekimiyle yere düşer
          box.fireVy += GRAVITY * 0.6 * dt;
          box.fireY += box.fireVy * dt;
          if (box.fireY >= groundLevel) {
            box.fireY = groundLevel;
            box.fireVy = 0;
            box.fireGrounded = true;
          }
        }
        if (rectsOverlap(player.x, player.y, player.w, player.h, box.fireX - fw / 2, box.fireY, fw, fh)) {
          box.fireTaken = true;
          player.powered = true;
          player.powerTimer = POWER_DURATION;
          setPowerHUD(true);
        }
      }
    }

    // --- Engeller ---
    for (const obs of level.obstacles) {
      if (obs.destroyed) continue;
      const oy = groundY - obs.h;
      if (rectsOverlap(player.x, player.y, player.w, player.h, obs.x, oy, obs.w, obs.h)) {
        if (player.powered) {
          obs.destroyed = true; // güçlü kedicik engeli dağıtır
        } else {
          triggerGameOver();
          return;
        }
      }
    }

    // --- Bitiş çizgisi ---
    if (player.x + player.w >= level.finishX) {
      triggerLevelComplete();
      return;
    }

    // --- Kamera ---
    const targetCamX = Math.max(0, player.x - W * 0.35);
    camX += (targetCamX - camX) * Math.min(1, dt * 6);
    camX = Math.min(camX, Math.max(0, level.length - W));
  }

  function triggerGameOver() {
    screen = Screens.GAME_OVER;
    document.getElementById("gameOverOverlay").classList.remove("hidden");
    document.getElementById("btnPause").classList.add("hidden");
  }

  function triggerLevelComplete() {
    screen = Screens.LEVEL_COMPLETE;
    document.getElementById("levelCompleteText").textContent =
      "Bölüm " + level.num + " bitti! Harika iş çıkardın.";
    document.getElementById("levelCompleteOverlay").classList.remove("hidden");
    document.getElementById("btnPause").classList.add("hidden");
    save.unlockedLevel = Math.max(save.unlockedLevel, Math.min(TOTAL_LEVELS, level.num + 1));
    writeSave();
  }

  function setPowerHUD(on) {
    const el = document.getElementById("hudPower");
    if (on) el.classList.remove("hidden"); else el.classList.add("hidden");
  }

  // ---------- Çizim ----------
  function drawBackground() {
    // gökyüzü (CSS gradyanı zaten canvas arkasında) — bulutlar ve tepeler
    ctx.save();
    ctx.translate(-camX * 0.3, 0);
    ctx.fillStyle = "#FFFFFFcc";
    for (let i = 0; i < 14; i++) {
      const cx = i * 380 + 120;
      const cy = 70 + (i % 3) * 40;
      drawCloud(cx, cy);
    }
    ctx.restore();

    ctx.save();
    ctx.translate(-camX * 0.6, 0);
    ctx.fillStyle = "#8FD98A";
    for (let i = 0; i < 20; i++) {
      const hx = i * 260 - 60;
      ctx.beginPath();
      ctx.ellipse(hx, groundY + 30, 160, 70, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawCloud(x, y) {
    ctx.beginPath();
    ctx.ellipse(x, y, 30, 18, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 26, y + 6, 24, 15, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 26, y + 6, 22, 14, 0, 0, Math.PI * 2);
    ctx.fill();
  }

  function drawGround() {
    ctx.save();
    ctx.translate(-camX, 0);
    ctx.fillStyle = "#B97A4E";
    ctx.fillRect(0, groundY, level.length + W, GROUND_HEIGHT + 10);
    ctx.fillStyle = "#5FBF63";
    ctx.fillRect(0, groundY, level.length + W, 18);
    ctx.fillStyle = "#4FAE53";
    for (let gx = 0; gx < level.length + W; gx += 34) {
      ctx.fillRect(gx, groundY, 4, 18);
    }
    ctx.restore();
  }

  function drawObstacle(obs) {
    if (obs.destroyed) return;
    const oy = groundY - obs.h;
    if (obs.kind === "spike") {
      ctx.fillStyle = "#8C8C99";
      ctx.beginPath();
      ctx.moveTo(obs.x, groundY);
      ctx.lineTo(obs.x + obs.w / 2, oy);
      ctx.lineTo(obs.x + obs.w, groundY);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = "#5B5B66";
      ctx.lineWidth = 2;
      ctx.stroke();
    } else if (obs.kind === "flame") {
      drawObstacleFlame(obs.x, obs.w, obs.h);
    }
  }

  function drawObstacleFlame(obsX, obsW, obsH) {
    const cx = obsX + obsW / 2;
    const baseY = groundY;
    const flicker = 1 + Math.sin(elapsedInLevel * 9 + obsX) * 0.1;
    const h = obsH * flicker;
    const w = obsW;
    ctx.save();
    const grad = ctx.createRadialGradient(cx, baseY - h * 0.5, 2, cx, baseY - h * 0.4, h * 0.7);
    grad.addColorStop(0, "#FFE27A");
    grad.addColorStop(0.5, "#FF8A3D");
    grad.addColorStop(1, "#FF4D4D");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(cx - w * 0.32, baseY);
    ctx.quadraticCurveTo(cx - w * 0.5, baseY - h * 0.5, cx - w * 0.12, baseY - h * 0.85);
    ctx.quadraticCurveTo(cx - w * 0.02, baseY - h * 0.6, cx + w * 0.14, baseY - h * 0.78);
    ctx.quadraticCurveTo(cx + w * 0.06, baseY - h, cx + w * 0.32, baseY - h * 0.88);
    ctx.quadraticCurveTo(cx + w * 0.55, baseY - h * 0.55, cx + w * 0.2, baseY - h * 0.25);
    ctx.quadraticCurveTo(cx + w * 0.4, baseY - h * 0.3, cx + w * 0.32, baseY);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBox(box) {
    ctx.save();
    ctx.fillStyle = box.used ? "#B5A184" : "#F2B33D";
    roundRect(box.x, box.y, box.size, box.size, 8);
    ctx.fill();
    ctx.strokeStyle = "#8C6A1F";
    ctx.lineWidth = 3;
    roundRect(box.x, box.y, box.size, box.size, 8);
    ctx.stroke();
    if (!box.used) {
      ctx.fillStyle = "#fff";
      ctx.font = "bold 26px 'Baloo 2', sans-serif";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText("?", box.x + box.size / 2, box.y + box.size / 2 + 2);
    }
    ctx.restore();

    if (box.fireSpawned && !box.fireTaken) {
      drawFire(box.fireX, box.fireY);
    }
  }

  function drawFire(x, y) {
    ctx.save();
    ctx.translate(x, y);
    const grad = ctx.createRadialGradient(0, 18, 2, 0, 14, 20);
    grad.addColorStop(0, "#FFE27A");
    grad.addColorStop(0.5, "#FF8A3D");
    grad.addColorStop(1, "#FF4D4D");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0, 32);
    ctx.quadraticCurveTo(-16, 14, -4, 2);
    ctx.quadraticCurveTo(-2, 10, 4, 4);
    ctx.quadraticCurveTo(2, -6, 10, 0);
    ctx.quadraticCurveTo(18, 12, 6, 22);
    ctx.quadraticCurveTo(14, 20, 0, 32);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawFinish(x) {
    ctx.save();
    ctx.strokeStyle = "#5B5B66";
    ctx.lineWidth = 6;
    ctx.beginPath();
    ctx.moveTo(x, groundY);
    ctx.lineTo(x, groundY - 190);
    ctx.stroke();
    // bayrak — kareli desen
    const flagW = 46, flagH = 32, top = groundY - 190;
    for (let r = 0; r < 4; r++) {
      for (let c = 0; c < 5; c++) {
        ctx.fillStyle = (r + c) % 2 === 0 ? "#2B2B33" : "#fff";
        ctx.fillRect(x + c * (flagW / 5), top + r * (flagH / 4), flagW / 5, flagH / 4);
      }
    }
    ctx.restore();
  }

  function drawCat() {
    const powered = player.powered;
    const bodyColor = powered ? "#FF5C4D" : "#FFA23D";
    const bellyColor = powered ? "#FFD1B0" : "#FFE8CC";
    const bob = player.onGround ? Math.sin(player.runPhase) * 3 : 0;

    ctx.save();
    ctx.translate(player.x + player.w / 2, player.y + player.h / 2 + bob);
    ctx.scale(player.facing, 1);
    const squashX = player.onGround ? player.squash : 1 / player.squash;
    const squashY = player.onGround ? (2 - player.squash) : player.squash;
    ctx.scale(squashX, squashY);

    // kuyruk
    ctx.strokeStyle = bodyColor;
    ctx.lineWidth = 9;
    ctx.lineCap = "round";
    ctx.beginPath();
    ctx.moveTo(-player.w / 2 + 2, 2);
    ctx.quadraticCurveTo(-player.w / 2 - 16, -18 + Math.sin(player.runPhase * 1.4) * 6, -player.w / 2 - 6, -26);
    ctx.stroke();

    // gövde
    ctx.fillStyle = bodyColor;
    roundRect(-player.w / 2, -player.h / 2, player.w, player.h, 14);
    ctx.fill();

    // karın
    ctx.fillStyle = bellyColor;
    ctx.beginPath();
    ctx.ellipse(2, player.h / 2 - 14, player.w / 2 - 10, player.h / 2 - 14, 0, 0, Math.PI * 2);
    ctx.fill();

    // kulaklar
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.moveTo(-player.w / 2 + 4, -player.h / 2 + 4);
    ctx.lineTo(-player.w / 2 - 6, -player.h / 2 - 16);
    ctx.lineTo(-player.w / 2 + 16, -player.h / 2 + 2);
    ctx.closePath(); ctx.fill();
    ctx.beginPath();
    ctx.moveTo(player.w / 2 - 4, -player.h / 2 + 4);
    ctx.lineTo(player.w / 2 + 8, -player.h / 2 - 16);
    ctx.lineTo(player.w / 2 - 16, -player.h / 2 + 2);
    ctx.closePath(); ctx.fill();
    ctx.fillStyle = "#FF6F91";
    ctx.beginPath();
    ctx.moveTo(-player.w / 2 - 1, -player.h / 2 - 3);
    ctx.lineTo(-player.w / 2 - 6, -player.h / 2 - 13);
    ctx.lineTo(-player.w / 2 + 8, -player.h / 2 + 1);
    ctx.closePath(); ctx.fill();

    // yüz — büyük çizgi film gözleri
    ctx.fillStyle = "#2B2B33";
    ctx.beginPath(); ctx.arc(-6, -6, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(12, -6, 5.5, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.beginPath(); ctx.arc(-7.5, -8, 1.8, 0, Math.PI * 2); ctx.fill();
    ctx.beginPath(); ctx.arc(10.5, -8, 1.8, 0, Math.PI * 2); ctx.fill();

    // burun + ağız
    ctx.fillStyle = "#FF6F91";
    ctx.beginPath(); ctx.arc(3, 3, 3, 0, Math.PI * 2); ctx.fill();
    ctx.strokeStyle = "#2B2B33";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(3, 5);
    ctx.quadraticCurveTo(3, 10, -3, 9);
    ctx.moveTo(3, 5);
    ctx.quadraticCurveTo(3, 10, 9, 9);
    ctx.stroke();

    // bıyıklar
    ctx.strokeStyle = powered ? "#ffffffcc" : "#ffffffdd";
    ctx.lineWidth = 1.6;
    for (const dy of [-2, 2, 6]) {
      ctx.beginPath();
      ctx.moveTo(-player.w / 2 - 2, dy);
      ctx.lineTo(-player.w / 2 - 18, dy - 3);
      ctx.stroke();
    }

    // ateş güç halesi
    if (powered) {
      ctx.globalAlpha = 0.35 + Math.sin(elapsedInLevel * 12) * 0.15;
      ctx.fillStyle = "#FFB37A";
      ctx.beginPath();
      ctx.arc(0, 0, player.w * 0.85, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();

    // patiler (basit)
    ctx.save();
    ctx.fillStyle = bodyColor;
    const legOffset = player.onGround ? Math.sin(player.runPhase) * 6 : 0;
    ctx.beginPath();
    ctx.ellipse(player.x + player.w / 2 - 10 + legOffset, player.y + player.h - 2, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(player.x + player.w / 2 + 10 - legOffset, player.y + player.h - 2, 7, 6, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function draw() {
    ctx.clearRect(0, 0, W, H);
    if (screen === Screens.PLAYING || screen === Screens.PAUSED) {
      drawBackground();
      drawGround();
      ctx.save();
      ctx.translate(-camX, 0);
      for (const box of level.boxes) drawBox(box);
      for (const obs of level.obstacles) drawObstacle(obs);
      drawFinish(level.finishX);
      drawCat();
      ctx.restore();
    }
  }

  // ---------- Oyun döngüsü ----------
  function loop(t) {
    const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
    lastTime = t;
    if (screen === Screens.PLAYING) update(dt);
    draw();
    requestAnimationFrame(loop);
  }
  requestAnimationFrame(loop);

  // ---------- UI olayları ----------
  function hideAllOverlays() {
    document.querySelectorAll(".overlay").forEach(el => el.classList.add("hidden"));
  }

  function showMenu() {
    screen = Screens.MENU;
    hideAllOverlays();
    document.getElementById("btnPause").classList.add("hidden");
    document.getElementById("continueLevelNum").textContent = save.currentLevel;
    document.getElementById("menuOverlay").classList.remove("hidden");
  }

  function buildLevelGrid() {
    const grid = document.getElementById("levelGrid");
    grid.innerHTML = "";
    for (let i = 1; i <= TOTAL_LEVELS; i++) {
      const btn = document.createElement("button");
      btn.className = "levelTile";
      btn.textContent = i;
      if (i > save.unlockedLevel) {
        btn.classList.add("locked");
        btn.disabled = true;
        btn.textContent = "🔒";
      } else if (i === save.currentLevel) {
        btn.classList.add("current");
      }
      btn.addEventListener("click", () => {
        if (i <= save.unlockedLevel) startLevel(i);
      });
      grid.appendChild(btn);
    }
  }

  document.getElementById("btnContinue").addEventListener("click", () => startLevel(save.currentLevel));
  document.getElementById("btnLevelSelect").addEventListener("click", () => {
    buildLevelGrid();
    hideAllOverlays();
    document.getElementById("levelSelectOverlay").classList.remove("hidden");
  });
  document.getElementById("btnBackFromSelect").addEventListener("click", showMenu);
  document.getElementById("btnHowTo").addEventListener("click", () => {
    hideAllOverlays();
    document.getElementById("howToOverlay").classList.remove("hidden");
  });
  document.getElementById("btnBackFromHowTo").addEventListener("click", showMenu);
  document.getElementById("btnNextLevel").addEventListener("click", goToNextLevel);
  document.getElementById("btnRetry").addEventListener("click", retryLevel);
  document.getElementById("btnRetryMenu").addEventListener("click", showMenu);
  document.getElementById("btnPlayAgain").addEventListener("click", () => {
    save.currentLevel = 1;
    writeSave();
    showMenu();
  });

  document.getElementById("btnPause").addEventListener("click", () => {
    if (screen !== Screens.PLAYING) return;
    screen = Screens.PAUSED;
    document.getElementById("pauseOverlay").classList.remove("hidden");
  });
  document.getElementById("btnResume").addEventListener("click", () => {
    hideAllOverlays();
    screen = Screens.PLAYING;
  });
  document.getElementById("btnPauseMenu").addEventListener("click", showMenu);

  showMenu();
})();
