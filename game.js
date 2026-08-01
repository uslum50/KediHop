/* ==========================================================
   ZIPLAYAN KEDİCİK — 2D Platform Oyunu
   Vanilla JS + Canvas. PWA olarak paketlenip PWABuilder ile
   APK'ya çevrilmeye uygundur (dış kütüphane yok).
   ========================================================== */

(() => {
  "use strict";

  // ---------- Sabitler ----------
  const TOTAL_LEVELS = 40;
  const POLE_START_LEVEL = 10; // bu bölümden sonra "inip çıkan çubuk" engeli görünür
  const DRAGON_START_LEVEL = 15; // bu bölümden sonra bitiş öncesi ejderha çıkar
  const DRAGON_FIGHT_DURATION = 15; // saniye
  const DRAGON_GROUND_DUR = 1.8;    // yerde durma süresi
  const DRAGON_RISE_DUR = 0.32;     // zıplayarak yükselme süresi
  const DRAGON_APEX_DUR = 0.3;      // havada kalma süresi
  const DRAGON_FALL_DUR = 0.32;     // inme süresi
  const DRAGON_FIRE_DELAY = 0.7;    // yerdeyken ateş atmadan önceki bekleme
  const DRAGON_HOP_HEIGHT = 132;    // zıplayınca çıktığı yükseklik (kediciğin zıplama yüksekliğiyle aynı)
  const GRAVITY = 1700;          // px/s^2
  const JUMP_VELOCITY = -680;    // px/s
  const MOVE_SPEED = 250;        // px/s (ileri butonuna basılıyken)
  const FRICTION_DECEL = 900;    // buton bırakılınca yavaşlama
  const POWER_DURATION = 8;     // saniye
  const CAT_W = 46, CAT_H = 42;
  const PLAYER_HIT_INSET = 9;    // görsel ile çarpışma kutusu arasındaki boşluk (px)
  const GROUND_HEIGHT = 90;
  const SAVE_KEY = "kedicikOyunu_v1";

  // ---------- Canvas ----------
  const canvas = document.getElementById("gameCanvas");
  const ctx = canvas.getContext("2d");
  let W = 0, H = 0, groundY = 0;

  // ---------- Ejderha görseli ----------
  const dragonImg = new Image();
  let dragonImgLoaded = false;
  dragonImg.onload = () => { dragonImgLoaded = true; };
  dragonImg.src = "icons/dragon.png"; // dosya yolunu kendi klasör yapına göre değiştir

  // ---------- İlerleme yüzdesi HUD'u (duraklat butonunun yanında) ----------
  const hudProgress = document.createElement("div");
  hudProgress.id = "hudProgress";
  Object.assign(hudProgress.style, {
    position: "fixed",
    zIndex: "5",
    color: "#fff",
    fontWeight: "bold",
    fontFamily: "'Baloo 2', sans-serif",
    fontSize: "15px",
    textShadow: "0 1px 3px rgba(0,0,0,0.6)",
    background: "rgba(0,0,0,0.35)",
    padding: "6px 10px",
    borderRadius: "12px",
    display: "none",
    pointerEvents: "none"
  });
  hudProgress.textContent = "%0";
  document.body.appendChild(hudProgress);

  function updateProgressHUD() {
    const btn = document.getElementById("btnPause");
    if (!level || btn.classList.contains("hidden")) {
      hudProgress.style.display = "none";
      return;
    }
    const pct = Math.max(0, Math.min(100, Math.round((player.x / level.finishX) * 100)));
    hudProgress.textContent = "%" + pct;
    const r = btn.getBoundingClientRect();
    hudProgress.style.display = "block";
    hudProgress.style.top = r.top + (r.height - hudProgress.offsetHeight) / 2 + "px";
    hudProgress.style.left = (r.left - hudProgress.offsetWidth - 8) + "px";
  }

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
  let furthestX = 0;      // bu denemede ulaşılan en uzak x
  let checkpointX = null; // bölümün %50'sinden sonra yanılırsa buradan devam edilir

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
    // Bölüm uzunluğu ve zorluk 20 bölüm boyunca kademeli olarak artar.
    const length = 3200 + levelNum * 300;
    const obstacles = [];
    const boxes = [];

    const difficulty = 1 + levelNum * 0.075;
    let x = 700; // ilk engelden önce boşluk

    // Ejderha bölümü varsa, normal engelleri onun alanına taşırmayalım.
    const dragonZoneStart = levelNum > DRAGON_START_LEVEL ? length - 620 : Infinity;

    while (x < length - 500) {
      const gap = (260 + rng() * 260) / difficulty;
      x += gap;
      if (x > length - 500) break;
      if (x > dragonZoneStart) break; // ejderha alanına normal engel koyma

      let kind;
      if (levelNum > POLE_START_LEVEL && rng() < 0.32) {
        kind = "pole";
      } else {
        kind = rng() < 0.72 ? "spike" : "flame";
      }

      if (kind === "pole") {
        const poleLow = 0;                    // tamamen yere iner, üstünden yürünebilir
        const poleHigh = 205 + rng() * 55;    // yukarıdayken geçilemez
        const speed = 0.70 + rng() * 0.35;    // yavaş iniş-çıkış
        const phase = rng() * Math.PI * 2;
        obstacles.push({
          x, w: 26, kind, destroyed: false,
          poleLow, poleHigh, speed, phase
        });
      } else {
        const w = kind === "spike" ? 36 + rng() * 18 : 22 + rng() * 12;
        const h = kind === "spike" ? 46 + rng() * 20 : 26 + rng() * 14;
        obstacles.push({ x, w, h, kind, destroyed: false });
      }
    }

    // ---- Ejderha (bitiş çizgisinden önceki mini patron karşılaşması) ----
    let dragon = null;
    if (levelNum > DRAGON_START_LEVEL) {
      const dragonX = length - 260;
      const h = 128;
      const groundCy = groundY - h / 2 + 4; // yerdeyken (normal duruş) merkez y
      dragon = {
        x: dragonX, w: 118, h,
        groundCy,
        hopCy: groundCy - DRAGON_HOP_HEIGHT, // zıplayınca çıktığı merkez y
        cy: groundCy,
        state: "ground",       // ground -> rising -> apex -> falling -> ground ...
        stateTimer: DRAGON_GROUND_DUR,
        phaseElapsed: 0,
        firedThisPhase: false,
        triggerX: dragonX - 380,
        wallX: dragonX - 74,
        active: false, done: false, leaving: false,
        timer: DRAGON_FIGHT_DURATION,
        leaveTimer: 0,
        bobPhase: 0,
        fireList: []
      };
    }

    // Soru işaretli kutu — her bölümde sadece 1 tane, yani süper güç bölüm başına 1 kez alınabilir.
    const boxX = length * (0.38 + rng() * 0.28);
    boxes.push({
      x: boxX, y: groundY - 190, size: 46,
      used: false,
      fireSpawned: false, fireTaken: false, fireGrounded: false,
      fireX: boxX + 23, fireY: groundY - 190, fireVy: 0
    });

    return { num: levelNum, length, obstacles, boxes, finishX: length - 120, dragon };
  }

  function startLevel(levelNum, resumeX) {
    level = generateLevel(levelNum);
    const resuming = typeof resumeX === "number";
    const startX = resuming ? Math.min(resumeX, level.finishX - 60) : 80;
    player = {
      x: startX, y: groundY - CAT_H,
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
    camX = Math.max(0, startX - W * 0.35);
    furthestX = startX;
    if (!resuming) checkpointX = null; // taze başlangıçta kontrol noktası sıfırlanır
    elapsedInLevel = 0;
    save.currentLevel = levelNum;
    writeSave();
    document.getElementById("hudLevel").textContent = "Bölüm " + levelNum + "/" + TOTAL_LEVELS;
    setPowerHUD(false);
    screen = Screens.PLAYING;
    hideAllOverlays();
    document.getElementById("btnPause").classList.remove("hidden");
    updateProgressHUD();
  }

  function retryLevel() {
    startLevel(level.num, checkpointX !== null ? checkpointX : undefined);
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
  bindHold(btnJump, () => { input.jumpPressed = true; getAudioCtx(); }, () => {});

  // ---------- Ses efektleri (dış dosya yok, doğrudan üretilir) ----------
  let audioCtx = null;
  function getAudioCtx() {
    try {
      if (!audioCtx) {
        const AC = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AC();
      }
      if (audioCtx.state === "suspended") audioCtx.resume();
      return audioCtx;
    } catch (e) { return null; }
  }
  function playTone(freqStart, freqEnd, duration, type, volume) {
    const ac = getAudioCtx();
    if (!ac) return;
    try {
      const osc = ac.createOscillator();
      const gain = ac.createGain();
      osc.type = type;
      osc.frequency.setValueAtTime(freqStart, ac.currentTime);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, freqEnd), ac.currentTime + duration);
      gain.gain.setValueAtTime(volume, ac.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ac.currentTime + duration);
      osc.connect(gain).connect(ac.destination);
      osc.start();
      osc.stop(ac.currentTime + duration);
    } catch (e) {}
  }
  function playJumpSound() {
    playTone(420, 780, 0.16, "square", 0.16);
  }
  function playHitSound() {
    playTone(260, 50, 0.35, "sawtooth", 0.22);
    setTimeout(() => playTone(160, 30, 0.25, "sawtooth", 0.16), 60);
  }

  // ---------- Fizik / güncelleme ----------
  function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
    return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
  }

  // İnip çıkan çubuğun o anki yüksekliğini hesaplar (0.5+0.5*sin ile 0..1 arası döngü).
  function poleHeight(obs, t) {
    const cycle = 0.5 + 0.5 * Math.sin(t * obs.speed + obs.phase);
    return obs.poleLow + (obs.poleHigh - obs.poleLow) * cycle;
  }

  // Diken/alev görselleri sivri üçgen şeklinde olduğu için tam kare kutu yerine
  // görsele daha yakın, içeri çekilmiş bir çarpışma alanı kullanıyoruz.
  function obstacleHitbox(obs) {
    if (obs.kind === "pole") {
      const h = poleHeight(obs, elapsedInLevel);
      const oy = groundY - h;
      const insetX = obs.w * 0.2;
      return { x: obs.x + insetX, y: oy, w: obs.w - insetX * 2, h };
    }
    const oy = groundY - obs.h;
    const insetX = obs.w * (obs.kind === "spike" ? 0.26 : 0.22);
    const insetTop = obs.h * (obs.kind === "spike" ? 0.32 : 0.2);
    return { x: obs.x + insetX, y: oy + insetTop, w: obs.w - insetX * 2, h: obs.h - insetTop };
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
        playJumpSound();
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
    if (player.x > furthestX) furthestX = player.x;

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
    const hpx = player.x + PLAYER_HIT_INSET;
    const hpy = player.y + PLAYER_HIT_INSET;
    const hpw = player.w - PLAYER_HIT_INSET * 2;
    const hph = player.h - PLAYER_HIT_INSET * 2;
    for (const obs of level.obstacles) {
      if (obs.destroyed) continue;
      const hb = obstacleHitbox(obs);
      if (rectsOverlap(hpx, hpy, hpw, hph, hb.x, hb.y, hb.w, hb.h)) {
        if (player.powered) {
          obs.destroyed = true; // güçlü kedicik engeli dağıtır
        } else {
          triggerGameOver();
          return;
        }
      }
    }

    // --- Ejderha karşılaşması ---
    if (level.dragon) {
      const d = level.dragon;

      if (!d.leaving) updateDragonMotion(d, dt);

      if (!d.active && !d.done && player.x + player.w >= d.triggerX) {
        d.active = true;
        d.timer = DRAGON_FIGHT_DURATION;
        d.fireList = [];
        d.state = "ground";
        d.stateTimer = DRAGON_GROUND_DUR;
        d.phaseElapsed = 0;
        d.firedThisPhase = false;
      }

      if (d.active) {
        d.timer -= dt;

        // ejderha savaşı bitene kadar yol kapalı
        if (player.x + player.w > d.wallX) {
          player.x = d.wallX - player.w;
          if (player.vx > 0) player.vx = 0;
        }

        if (d.timer <= 0) {
          d.active = false;
          d.done = true;
          d.leaving = true;
          d.leaveTimer = 1.1;
          d.fireList = [];
        }
      }

      // uçup giden ejderha animasyonu
      if (d.leaving) {
        d.leaveTimer -= dt;
        d.cy -= dt * 200;
        if (d.leaveTimer <= 0) d.leaving = false;
      }

      // ateş toplarını güncelle ve çarpışma kontrolü yap
      for (const f of d.fireList) {
        f.x += f.vx * dt;
      }
      d.fireList = d.fireList.filter(f => !f.hit && f.x > camX - 200);

      for (const f of d.fireList) {
        if (rectsOverlap(hpx, hpy, hpw, hph, f.x - f.w / 2, f.y, f.w, f.h)) {
          if (player.powered) {
            f.hit = true;
          } else {
            triggerGameOver();
            return;
          }
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
    playHitSound();
    // bölümün yarısından fazlası geçildiyse, tekrar denemede oradan başlanır
    if (furthestX >= level.finishX * 0.5) {
      checkpointX = furthestX;
    } else {
      checkpointX = null;
    }
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

  // Ejderha sırayla iki tür ateş topu atar:
  // "ground"  -> yerde ilerler, kedicik ZIPLAYARAK üstünden geçmeli.
  // "air"     -> baş hizasının üstünde uçar, kedicik YERİNDE DURARAK (zıplamadan) kurtulmalı.
  // Ejderha yerde/havada döngüsel olarak hareket eder:
  // ground  -> bir süre yerde durur, bu sırada YERDEN ateş atar (kedicik ZIPLAYARAK kaçmalı)
  // rising  -> zıplayarak yükselir
  // apex    -> tepe noktasında (kediciğin kendi zıplama yüksekliğiyle aynı) HAVADAN ateş atar
  //            (kedicik YERİNDE DURARAK / zıplamayarak kaçmalı)
  // falling -> yere iner, döngü baştan başlar
  function updateDragonMotion(d, dt) {
    d.bobPhase += dt; // kanat çırpma animasyonu
    d.phaseElapsed += dt;
    d.stateTimer -= dt;

    if (d.state === "ground") {
      d.cy = d.groundCy;
      if (d.active && !d.firedThisPhase && d.phaseElapsed >= DRAGON_FIRE_DELAY) {
        spawnGroundFire(d);
        d.firedThisPhase = true;
      }
      if (d.stateTimer <= 0) {
        d.state = "rising"; d.stateTimer = DRAGON_RISE_DUR;
        d.phaseElapsed = 0; d.firedThisPhase = false;
      }
    } else if (d.state === "rising") {
      const t = Math.min(1, 1 - Math.max(0, d.stateTimer) / DRAGON_RISE_DUR);
      d.cy = d.groundCy + (d.hopCy - d.groundCy) * t;
      if (d.stateTimer <= 0) {
        d.state = "apex"; d.stateTimer = DRAGON_APEX_DUR;
        d.phaseElapsed = 0; d.firedThisPhase = false;
      }
    } else if (d.state === "apex") {
      d.cy = d.hopCy;
      if (d.active && !d.firedThisPhase) {
        spawnAirFire(d);
        d.firedThisPhase = true;
      }
      if (d.stateTimer <= 0) {
        d.state = "falling"; d.stateTimer = DRAGON_FALL_DUR;
        d.phaseElapsed = 0; d.firedThisPhase = false;
      }
    } else if (d.state === "falling") {
      const t = Math.min(1, 1 - Math.max(0, d.stateTimer) / DRAGON_FALL_DUR);
      d.cy = d.hopCy + (d.groundCy - d.hopCy) * t;
      if (d.stateTimer <= 0) {
        d.state = "ground"; d.stateTimer = DRAGON_GROUND_DUR;
        d.phaseElapsed = 0; d.firedThisPhase = false;
      }
    }
  }

  // Yerde giden ateş: zeminde ilerler, kedicik ZIPLAYARAK üstünden geçmeli.
  function spawnGroundFire(d) {
    d.fireList.push({
      kind: "ground", x: d.x, y: groundY - 46, w: 34, h: 46,
      vx: -270, hit: false
    });
  }

  // Havadan giden ateş: tam kediciğin zıplayınca ulaştığı yükseklikte gider,
  // bu yüzden kedicik YERİNDE DURARAK (zıplamadan) kaçmalı.
  function spawnAirFire(d) {
    d.fireList.push({
      kind: "air", x: d.x, y: groundY - 178, w: 38, h: 44,
      vx: -230, hit: false
    });
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
    } else if (obs.kind === "pole") {
      drawPole(obs);
    }
  }

  function drawPole(obs) {
    const h = poleHeight(obs, elapsedInLevel);
    const oy = groundY - h;
    const w = obs.w;
    ctx.save();
    // taban plakası
    ctx.fillStyle = "#5B5B66";
    ctx.fillRect(obs.x - 6, groundY - 8, w + 12, 8);
    // çubuğun kendisi
    const grad = ctx.createLinearGradient(obs.x, 0, obs.x + w, 0);
    grad.addColorStop(0, "#C9CDD6");
    grad.addColorStop(0.5, "#8C8C99");
    grad.addColorStop(1, "#5B5B66");
    ctx.fillStyle = grad;
    ctx.fillRect(obs.x, oy, w, h);
    // uç kısmı (tehlike şeridi)
    ctx.fillStyle = "#FF4D4D";
    ctx.fillRect(obs.x, oy, w, 10);
    ctx.fillStyle = "#fff";
    ctx.fillRect(obs.x, oy + 10, w, 6);
    ctx.restore();
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

  function drawDragonFire(f) {
    ctx.save();
    const grad = ctx.createRadialGradient(f.x, f.y + f.h / 2, 2, f.x, f.y + f.h / 2, f.w);
    grad.addColorStop(0, "#FFE27A");
    grad.addColorStop(0.5, "#FF8A3D");
    grad.addColorStop(1, "#FF4D4D");
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.ellipse(f.x, f.y + f.h / 2, f.w / 2, f.h / 2, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawDragon(d) {
    if (d.done && !d.leaving) return;
    const cx = d.x + d.w / 2;
    const cy = d.cy;
    const alpha = d.leaving ? Math.max(0, d.leaveTimer / 1.1) : 1;

    ctx.save();
    ctx.globalAlpha = alpha;

    if (dragonImgLoaded) {
      const breathe = Math.sin(d.bobPhase * 3) * 3; // hafif nefes alma hareketi
      const dw = d.w * 2.35; // görsel, çarpışma kutusundan biraz büyük çizilir
      const dh = dw * (dragonImg.height / dragonImg.width);
      // görsel zaten sola bakıp sola ateş püskürtüyor — oyundaki yönle uyumlu, çevirmeye gerek yok
      ctx.drawImage(dragonImg, cx - dw * 0.42, cy - dh / 2 + breathe, dw, dh);
    } else {
      // görsel henüz yüklenmediyse basit bir yedek şekil göster
      ctx.translate(cx, cy);
      ctx.fillStyle = "#C23B3B";
      roundRect(-d.w / 2, -d.h / 2, d.w, d.h, 24);
      ctx.fill();
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
      if (level.dragon) {
        drawDragon(level.dragon);
        for (const f of level.dragon.fireList) drawDragonFire(f);
      }
      drawCat();
      ctx.restore();

      if (level.dragon && level.dragon.active) {
        ctx.save();
        ctx.textAlign = "center";
        ctx.font = "bold 22px 'Baloo 2', sans-serif";
        ctx.fillStyle = "#fff";
        ctx.strokeStyle = "#2B2B33";
        ctx.lineWidth = 4;
        const txt = "🐉 " + Math.max(0, Math.ceil(level.dragon.timer)) + " sn";
        ctx.strokeText(txt, W / 2, 46);
        ctx.fillText(txt, W / 2, 46);
        ctx.restore();
      }
    }
  }

  // ---------- Oyun döngüsü ----------
  function loop(t) {
    const dt = Math.min(0.033, (t - lastTime) / 1000 || 0);
    lastTime = t;
    if (screen === Screens.PLAYING) update(dt);
    draw();
    updateProgressHUD();
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
