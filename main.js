import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClient } from '@supabase/supabase-js';

// ============================================================================
// 1. CONFIGURACIÓN GLOBAL, ARMAMENTO (CALL OF DUTY) Y TIERS (ALBION ONLINE)
// ============================================================================
const SUPABASE_URL = 'https://yvaizvkoneqqhqkqftcn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QG8X26MRcrGwpWoT7B6odw_VaQpr72j';
const R2_URL = 'https://pub-44db97c536044e3ab6a203cf451fb50d.r2.dev';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const WORLD_SIZE = 400;
const BOUND = WORLD_SIZE / 2;
const SAFE_ZONE_RADIUS = 28; // Radio del Refugio Central (Zona Segura estilo Albion)
const PLAYER_SPEED = 8.5;
const SPRINT_MULTIPLIER = 1.55;
const PLAYER_RADIUS = 0.45;
const DT_CAP = 0.05;

const BOSS_WAVES = [3, 6, 9, 12, 15];
const BEAR_WAVES = [2, 4, 7, 10, 13];
const WOLF_WAVES = [2, 5, 8, 11, 14];
const DEER_COUNT = 120;
const WOLF_COUNT = 120;
const DRAGON_COUNT = 4;
const ORE_NODES_COUNT = 45;

// Sistema de Tiers estilo Albion Online
const TIERS = {
  1: { name: 'TIER 1 · RECLUTA',    dmgMult: 1.0,  maxHpBonus: 0,   gatherBonus: 1, color: '#bdc3c7' },
  2: { name: 'TIER 2 · EXPLORADOR', dmgMult: 1.25, maxHpBonus: 35,  gatherBonus: 2, color: '#2ecc71' },
  3: { name: 'TIER 3 · MERCENARIO', dmgMult: 1.55, maxHpBonus: 80,  gatherBonus: 3, color: '#3498db' },
  4: { name: 'TIER 4 · VETERANO',   dmgMult: 1.95, maxHpBonus: 140, gatherBonus: 4, color: '#9b59b6' },
  5: { name: 'TIER 5 · SEÑOR ÉXODO',dmgMult: 2.50, maxHpBonus: 220, gatherBonus: 6, color: '#f1c40f' }
};

// Armamento táctico estilo Call of Duty (con soporte ADS / Mira de precisión)
const WEAPONS_ORDER = ['pistol', 'shotgun', 'rifle', 'sniper'];
const WEAPONS = {
  pistol: {
    name: 'Pistola Táctica',
    cooldown: 0.20,
    pellets: 1,
    spread: 0.012,
    adsSpread: 0.002,
    damage: 20,
    maxAmmo: Infinity,
    range: 85,
    adsFov: 55,
    headshotMult: 1.8
  },
  shotgun: {
    name: 'Escopeta Combate',
    cooldown: 0.62,
    pellets: 8,
    spread: 0.095,
    adsSpread: 0.055,
    damage: 11,
    maxAmmo: 32,
    range: 30,
    adsFov: 60,
    headshotMult: 1.5
  },
  rifle: {
    name: 'Rifle Asalto M4',
    cooldown: 0.085,
    pellets: 1,
    spread: 0.022,
    adsSpread: 0.004,
    damage: 14,
    maxAmmo: 120,
    range: 130,
    adsFov: 48,
    headshotMult: 1.9
  },
  sniper: {
    name: 'Francotirador Cal.50',
    cooldown: 0.95,
    pellets: 1,
    spread: 0.045,
    adsSpread: 0.0005,
    damage: 95,
    maxAmmo: 15,
    range: 240,
    adsFov: 26,
    headshotMult: 2.5
  }
};

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ============================================================================
// 2. ESTADO DEL JUGADOR Y MOTOR DE PERSISTENCIA HÍBRIDO (SUPABASE + LOCAL)
// ============================================================================
let currentUser = null;
let isGuest = true;
let playerName = 'Agente';
let score = 0;
let gold = 0;
let wave = 1;

// Recursos de Albion Online
const resources = {
  wood: 0,
  ore: 0,
  hide: 0,
  scales: 0
};

const player = {
  position: new THREE.Vector3(0, 0, 0),
  hp: 100,
  maxHp: 100,
  stamina: 100,
  maxStamina: 100,
  lvl: 1,
  xp: 0,
  xpNext: 100,
  tier: 1,
  weapon: 'pistol',
  ammo: { pistol: Infinity, shotgun: 0, rifle: 0, sniper: 0 },
  recoil: 0,
  swayPhase: 0,
  isADS: false,
  isSprinting: false,
  inSafeZone: true
};

function getLocalSaveKey(identifier) {
  return `exodo_save_${(identifier || 'default').toLowerCase().trim()}`;
}

function saveToLocalBackup() {
  const key = getLocalSaveKey(playerName);
  const payload = {
    playerName,
    gold,
    score,
    lvl: player.lvl,
    xp: player.xp,
    tier: player.tier,
    resources: { ...resources },
    ammo: {
      shotgun: player.ammo.shotgun,
      rifle: player.ammo.rifle,
      sniper: player.ammo.sniper
    },
    updatedAt: Date.now()
  };
  try {
    localStorage.setItem(key, JSON.stringify(payload));
  } catch (e) {
    console.warn('No se pudo guardar en LocalStorage:', e);
  }
}

function loadFromLocalBackup(identifier) {
  const key = getLocalSaveKey(identifier);
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function applyLoadedProfile(data) {
  if (!data) return;
  if (typeof data.gold === 'number') gold = data.gold;
  if (typeof data.score === 'number') score = data.score;
  if (typeof data.lvl === 'number') player.lvl = data.lvl;
  if (typeof data.xp === 'number') player.xp = data.xp;
  if (typeof data.tier === 'number') player.tier = Math.min(5, Math.max(1, data.tier));
  if (data.resources) {
    resources.wood = data.resources.wood || 0;
    resources.ore = data.resources.ore || 0;
    resources.hide = data.resources.hide || 0;
    resources.scales = data.resources.scales || 0;
  }
  if (data.ammo) {
    player.ammo.shotgun = data.ammo.shotgun || 0;
    player.ammo.rifle = data.ammo.rifle || 0;
    player.ammo.sniper = data.ammo.sniper || 0;
  }
  recalcPlayerStats();
}

function recalcPlayerStats() {
  const tierInfo = TIERS[player.tier] || TIERS[1];
  player.maxHp = 100 + (player.lvl - 1) * 15 + tierInfo.maxHpBonus;
  if (player.hp > player.maxHp) player.hp = player.maxHp;
  player.xpNext = player.lvl * 100;
  const badge = document.getElementById('tier-badge');
  if (badge) {
    badge.textContent = tierInfo.name;
    badge.style.background = tierInfo.color;
  }
}

async function saveProgress() {
  saveToLocalBackup();
  const statusEl = document.getElementById('save-status');
  if (statusEl) statusEl.textContent = 'Guardado localmente ✓';

  if (isGuest || !currentUser) return;
  try {
    const { error } = await supabase.from('profiles').update({
      gold: gold,
      score: Math.max(score, currentUser.score || 0),
      updated_at: new Date().toISOString()
    }).eq('id', currentUser.id);

    if (!error && statusEl) {
      statusEl.textContent = 'Sincronizado en Supabase Cloud ✓';
    }
  } catch (err) {
    console.warn('Supabase offline, mantenido en respaldo local:', err);
  }
}

// ============================================================================
// 3. AUTENTICACIÓN HÍBRIDA (NUNCA SE BLOQUEA POR FAILED TO FETCH)
// ============================================================================
const authEmail = document.getElementById('auth-email');
const authPass = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');
const authSection = document.getElementById('auth-section');
const startSection = document.getElementById('start-section');
const welcomeName = document.getElementById('welcome-name');

function showAuthMessage(msg, isSuccess = false) {
  if (!authError) return;
  authError.textContent = msg;
  authError.style.color = isSuccess ? '#2ecc71' : '#ff6b6b';
  authError.style.display = 'block';
}

function proceedToLobby(name, modeLabel) {
  playerName = name.substring(0, 16);
  const localData = loadFromLocalBackup(playerName);
  if (localData) applyLoadedProfile(localData);

  document.getElementById('profile-name').textContent = playerName;
  authSection.style.display = 'none';
  welcomeName.textContent = `${playerName} (${modeLabel})`;
  startSection.style.display = 'block';

  // Pre-cargar modelos de Cloudflare R2 mientras el jugador está en el lobby
  loadOptionalGLB();
}

document.getElementById('registerBtn').onclick = async () => {
  const rawInput = (authEmail.value || '').trim();
  const pwd = (authPass.value || '').trim();
  if (!rawInput || pwd.length < 4) {
    return showAuthMessage('Ingresa un correo/nombre y una contraseña de al menos 4 caracteres.');
  }

  const emailToUse = rawInput.includes('@') ? rawInput : `${rawInput.toLowerCase().replace(/[^a-z0-9]/g, '')}@exodo.game`;
  const cleanName = rawInput.split('@')[0];

  showAuthMessage('Registrando agente...', true);

  try {
    const { data, error } = await supabase.auth.signUp({
      email: emailToUse,
      password: pwd
    });

    if (error) throw error;

    if (data && data.user) {
      currentUser = data.user;
      isGuest = false;
      await supabase.from('profiles').upsert([{
        id: currentUser.id,
        username: cleanName,
        gold: 50,
        score: 0
      }]);
    }
    gold = 50; // Bono de bienvenida
    saveToLocalBackup();
    showAuthMessage('¡Agente registrado en la nube! Entrando al lobby...', true);
    setTimeout(() => proceedToLobby(cleanName, 'Agente Cloud'), 600);
  } catch (err) {
    console.warn('Aviso registro Supabase (usando registro híbrido local):', err);
    // Registro en almacenamiento local si Supabase da Failed to Fetch o límite de correo
    isGuest = false;
    const localKey = `exodo_auth_${cleanName.toLowerCase()}`;
    localStorage.setItem(localKey, JSON.stringify({ username: cleanName, password: pwd }));
    gold = 50;
    playerName = cleanName;
    saveToLocalBackup();
    showAuthMessage('Modo Híbrido Activo: Agente registrado en este dispositivo.', true);
    setTimeout(() => proceedToLobby(cleanName, 'Agente Híbrido'), 700);
  }
};

document.getElementById('loginBtn').onclick = async () => {
  const rawInput = (authEmail.value || '').trim();
  const pwd = (authPass.value || '').trim();
  if (!rawInput || !pwd) {
    return showAuthMessage('Ingresa tu correo/nombre de agente y contraseña.');
  }

  const emailToUse = rawInput.includes('@') ? rawInput : `${rawInput.toLowerCase().replace(/[^a-z0-9]/g, '')}@exodo.game`;
  const cleanName = rawInput.split('@')[0];

  showAuthMessage('Conectando con el servidor...', true);

  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: emailToUse,
      password: pwd
    });

    if (error) throw error;

    currentUser = data.user;
    isGuest = false;

    const { data: profile } = await supabase
      .from('profiles')
      .select('gold, score, username')
      .eq('id', currentUser.id)
      .single();

    if (profile) {
      gold = profile.gold || 0;
      score = profile.score || 0;
      currentUser.score = score;
    }
    proceedToLobby(profile?.username || cleanName, 'Agente Cloud');
  } catch (err) {
    console.warn('Fallo login directo Supabase, verificando bóveda híbrida local:', err);
    const localKey = `exodo_auth_${cleanName.toLowerCase()}`;
    const savedAuth = localStorage.getItem(localKey);
    if (savedAuth) {
      const parsed = JSON.parse(savedAuth);
      if (parsed.password === pwd) {
        isGuest = false;
        return proceedToLobby(cleanName, 'Agente Híbrido');
      }
    }
    // Si aún no existía localmente, lo dejamos entrar creando su perfil local con esa clave
    localStorage.setItem(localKey, JSON.stringify({ username: cleanName, password: pwd }));
    proceedToLobby(cleanName, 'Agente Local');
  }
};

document.getElementById('playGuestBtn').onclick = () => {
  isGuest = true;
  const randomName = 'Mercenario_' + Math.floor(100 + Math.random() * 899);
  proceedToLobby(randomName, 'Local');
};

document.getElementById('manual-save-btn').onclick = () => {
  saveProgress();
  showMsg('💾 Progreso e inventario guardados');
};

// ============================================================================
// 4. SINTETIZADOR DE AUDIO TÁCTICO
// ============================================================================
let audioCtx = null;
function ensureAudio() {
  if (!audioCtx) {
    try {
      audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    } catch (e) {}
  }
}

function beep(f, d, type = 'square', v = 0.05, slide = null) {
  if (!audioCtx) return;
  try {
    const t = audioCtx.currentTime;
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(f, t);
    if (slide) o.frequency.exponentialRampToValueAtTime(Math.max(20, slide), t + d);
    g.gain.setValueAtTime(v, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + d);
    o.connect(g).connect(audioCtx.destination);
    o.start(t);
    o.stop(t + d + 0.02);
  } catch (e) {}
}

const SFX = {
  shoot:      () => beep(880, 0.06, 'square', 0.05, 210),
  shotgun:    () => beep(260, 0.14, 'sawtooth', 0.08, 85),
  rifle:      () => beep(1150, 0.045, 'square', 0.045, 360),
  sniper:     () => { beep(190, 0.22, 'sawtooth', 0.10, 45); setTimeout(() => beep(600, 0.10, 'triangle', 0.05, 180), 40); },
  enemyShoot: () => beep(240, 0.08, 'sawtooth', 0.04, 100),
  hit:        () => beep(190, 0.05, 'square', 0.05),
  headshot:   () => { beep(1400, 0.07, 'sine', 0.08); setTimeout(() => beep(1850, 0.09, 'sine', 0.07), 45); },
  death:      () => beep(380, 0.18, 'sawtooth', 0.06, 80),
  pickup:     () => { beep(660, 0.08, 'sine', 0.06); setTimeout(() => beep(990, 0.1, 'sine', 0.05), 60); },
  gather:     () => { beep(320, 0.07, 'triangle', 0.07, 180); setTimeout(() => beep(480, 0.08, 'sine', 0.05), 70); },
  craft:      () => { beep(440, 0.09, 'triangle', 0.08); setTimeout(() => beep(660, 0.09, 'triangle', 0.08), 90); setTimeout(() => beep(1100, 0.18, 'sine', 0.08), 180); },
  health:     () => { beep(440, 0.12, 'sine', 0.07); setTimeout(() => beep(880, 0.15, 'sine', 0.06), 100); },
  hostage:    () => { beep(523, 0.1, 'sine', 0.07); setTimeout(() => beep(784, 0.1, 'sine', 0.07), 100); setTimeout(() => beep(1047, 0.2, 'sine', 0.07), 200); },
  boss:       () => beep(80, 0.5, 'sawtooth', 0.09, 40),
  bossDie:    () => { beep(150, 0.3, 'sawtooth', 0.09, 60); setTimeout(() => beep(100, 0.5, 'sawtooth', 0.09, 40), 200); },
  bear:       () => beep(120, 0.4, 'sawtooth', 0.08, 50),
  wolf:       () => beep(320, 0.3, 'sawtooth', 0.06, 180),
  dragon:     () => beep(65, 0.6, 'sawtooth', 0.09, 30),
  fire:       () => beep(200, 0.25, 'sawtooth', 0.06, 80),
  gameover:   () => beep(200, 0.8, 'sawtooth', 0.09, 50)
};

document.addEventListener('click', ensureAudio, { once: true });
document.addEventListener('keydown', ensureAudio, { once: true });

// ============================================================================
// 5. FEEDBACK VISUAL TÁCTICO (VIÑETA DE SANGRE, FLOATING TEXTS, KILLFEED)
// ============================================================================
let msgTimer = null;
function showMsg(text) {
  const el = document.getElementById('msg');
  if (!el) return;
  el.textContent = text;
  el.style.opacity = 1;
  clearTimeout(msgTimer);
  msgTimer = setTimeout(() => { el.style.opacity = 0; }, 1800);
}

function triggerDamageVignette() {
  const vig = document.getElementById('damage-vignette');
  if (!vig) return;
  vig.classList.add('hurt');
  clearTimeout(vig._timer);
  vig._timer = setTimeout(() => vig.classList.remove('hurt'), 350);
}

function spawnFloatingText(text, color = '#ffcc00') {
  const container = document.getElementById('floating-texts');
  if (!container) return;
  const el = document.createElement('div');
  el.className = 'float-txt';
  el.textContent = text;
  el.style.color = color;
  el.style.left = `${50 + (Math.random() - 0.5) * 14}%`;
  el.style.top = `${44 + (Math.random() - 0.5) * 10}%`;
  container.appendChild(el);
  setTimeout(() => el.remove(), 900);
}

function addKillfeed(text) {
  const kf = document.getElementById('killfeed');
  if (!kf) return;
  const item = document.createElement('div');
  item.className = 'kill-item';
  item.textContent = text;
  kf.appendChild(item);
  setTimeout(() => item.remove(), 3500);
}

function addXP(amount) {
  player.xp += amount;
  while (player.xp >= player.xpNext) {
    player.xp -= player.xpNext;
    player.lvl++;
    recalcPlayerStats();
    player.hp = player.maxHp;
    SFX.craft();
    showMsg(`⚡ ¡NIVEL ${player.lvl} ALCANZADO! Salud máxima aumentada`);
  }
}

// ============================================================================
// 6. ESCENA THREE.JS, ILUMINACIÓN Y TEXTURAS PROCEDURALES + R2
// ============================================================================
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x7ec0ee);
scene.fog = new THREE.Fog(0x7ec0ee, 65, 230);

const camera = new THREE.PerspectiveCamera(72, innerWidth / innerHeight, 0.1, 400);

const ambient = new THREE.AmbientLight(0xffffff, 0.65);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xfff3c4, 1.15);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
sun.shadow.camera.left = -55;
sun.shadow.camera.right = 55;
sun.shadow.camera.top = 55;
sun.shadow.camera.bottom = -55;
sun.shadow.camera.near = 1;
sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0005;
scene.add(sun);
scene.add(sun.target);

window.addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

function makeGrassTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#386624';
  x.fillRect(0, 0, 256, 256);
  for (let i = 0; i < 4000; i++) {
    const px = Math.random() * 256;
    const py = Math.random() * 256;
    const g = 50 + Math.random() * 70;
    x.fillStyle = `rgb(${20 + Math.random() * 25},${g},${15 + Math.random() * 25})`;
    x.fillRect(px, py, 1.5, 1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(60, 60);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return t;
}

function makeWoodTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#8B6B47';
  x.fillRect(0, 0, 128, 128);
  for (let i = 0; i < 20; i++) {
    x.strokeStyle = `rgba(50,25,10,${0.1 + Math.random() * 0.2})`;
    x.lineWidth = 1 + Math.random();
    x.beginPath();
    x.moveTo(0, Math.random() * 128);
    x.lineTo(128, Math.random() * 128);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(2, 2);
  return t;
}

function makeBarkTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#4a2e1a';
  x.fillRect(0, 0, 64, 64);
  for (let i = 0; i < 20; i++) {
    x.strokeStyle = `rgba(30,15,5,${0.2 + Math.random() * 0.3})`;
    x.lineWidth = 1 + Math.random() * 1.5;
    const px = Math.random() * 64;
    x.beginPath();
    x.moveTo(px, 0);
    x.lineTo(px + (Math.random() - 0.5) * 8, 64);
    x.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Suelo principal y bordes invisibles
const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
const groundMat = new THREE.MeshLambertMaterial({ map: makeGrassTexture() });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const boundaryMat = new THREE.MeshLambertMaterial({ color: 0x2a3d1e, transparent: true, opacity: 0.0 });
const boundaryBoxes = [];
function addBoundary(x, z, w, d) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, 5, d), boundaryMat);
  m.position.set(x, 2.5, z);
  scene.add(m);
  boundaryBoxes.push(new THREE.Box3().setFromObject(m));
}
addBoundary(0, -BOUND, WORLD_SIZE, 2);
addBoundary(0, BOUND, WORLD_SIZE, 2);
addBoundary(-BOUND, 0, 2, WORLD_SIZE);
addBoundary(BOUND, 0, 2, WORLD_SIZE);

// ============================================================================
// 7. CARGADOR Y NORMALIZADOR INTELIGENTE DE CLOUDFLARE R2 (GLB + PNG)
// ============================================================================
const glbLoader = new GLTFLoader();
const texLoader = new THREE.TextureLoader();
texLoader.setCrossOrigin('anonymous');

const glbCache = {
  avatar: null,
  characterG: null,
  dragon: null,
  colorMapTex: null,
  texGTex: null
};
let r2Loaded = false;

function loadR2Texture(filename) {
  return new Promise(resolve => {
    const encoded = encodeURIComponent(filename);
    texLoader.load(
      `${R2_URL}/${encoded}`,
      tex => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.flipY = false;
        resolve(tex);
      },
      undefined,
      () => resolve(null)
    );
  });
}

function tryLoadGLB(filename) {
  return new Promise(resolve => {
    const encoded = encodeURIComponent(filename);
    glbLoader.load(
      `${R2_URL}/${encoded}`,
      gltf => resolve(gltf.scene),
      undefined,
      err => {
        console.warn(`No se pudo cargar ${filename} desde R2:`, err);
        resolve(null);
      }
    );
  });
}

// Limpia planos de fondo gigantes (como el telón de DragonAttenuation.glb) y ajusta escala a metros reales
function normalizeModel(rootScene, targetSize, isDragon = false, fallbackTexture = null) {
  if (!rootScene) return null;
  const wrapper = new THREE.Group();
  const model = rootScene.clone(true);

  const meshesToRemove = [];
  model.traverse(child => {
    if (child.isMesh) {
      const n = (child.name || '').toLowerCase();
      // En DragonAttenuation.glb el telón de fondo se llama Cloth / Backdrop / Plane
      if (isDragon && (n.includes('cloth') || n.includes('backdrop') || n.includes('plane') || n.includes('background') || n.includes('floor') || n.includes('stage'))) {
        meshesToRemove.push(child);
        return;
      }
      if (child.geometry) {
        child.geometry.computeBoundingBox();
        const gb = child.geometry.boundingBox;
        if (gb && isDragon) {
          const sx = gb.max.x - gb.min.x;
          const sz = gb.max.z - gb.min.z;
          // Si alguna sub-malla es una sábana plana gigante (> 12 unidades), la descartamos
          if (sx > 12 || sz > 12) {
            meshesToRemove.push(child);
            return;
          }
        }
      }
      child.castShadow = true;
      child.receiveShadow = true;
      // Si el modelo requiere textura externa de R2 o material estándar seguro
      if (child.material) {
        if (child.material.transmission !== undefined && child.material.transmission > 0) {
          // Convertir material de atenuación pesada a material táctico fluido
          child.material = new THREE.MeshStandardMaterial({
            color: child.material.attenuationColor || child.material.color || 0xb33939,
            roughness: 0.35,
            metalness: 0.2
          });
        } else if (fallbackTexture && !child.material.map) {
          child.material = child.material.clone();
          child.material.map = fallbackTexture;
          child.material.needsUpdate = true;
        }
      }
    }
  });

  for (const m of meshesToRemove) {
    if (m.parent) m.parent.remove(m);
  }

  // Calcular BoundingBox limpio y normalizar a targetSize
  const box = new THREE.Box3().setFromObject(model);
  const size = new THREE.Vector3();
  const center = new THREE.Vector3();
  box.getSize(size);
  box.getCenter(center);

  const maxDim = isDragon ? Math.max(size.x, size.y, size.z) : size.y;
  if (maxDim > 0.0001 && isFinite(maxDim)) {
    const scaleFactor = targetSize / maxDim;
    model.scale.multiplyScalar(scaleFactor);
    // Recalcular tras escalar
    const scaledBox = new THREE.Box3().setFromObject(model);
    const scaledCenter = new THREE.Vector3();
    scaledBox.getCenter(scaledCenter);
    model.position.x -= scaledCenter.x;
    model.position.z -= scaledCenter.z;
    if (isDragon) {
      model.position.y -= scaledCenter.y;
    } else {
      model.position.y -= scaledBox.min.y; // Pies exactamente en Y = 0
    }
  }

  wrapper.add(model);
  return wrapper;
}

async function loadOptionalGLB() {
  if (r2Loaded) return;
  const statusEl = document.getElementById('loading-r2-status');
  try {
    if (statusEl) statusEl.textContent = 'Descargando modelos y texturas desde Cloudflare R2...';

    const [colorMap, texG, rawAvatar, rawCharG, rawDragon] = await Promise.all([
      loadR2Texture('mapa de colores.png'),
      loadR2Texture('textura g.png'),
      tryLoadGLB('avatar.glb'),
      tryLoadGLB('caracter-g.glb'),
      tryLoadGLB('DragonAttenuation.glb')
    ]);

    glbCache.colorMapTex = colorMap;
    glbCache.texGTex = texG;
    glbCache.avatar = normalizeModel(rawAvatar, 1.85, false, colorMap);
    glbCache.characterG = normalizeModel(rawCharG, 1.85, false, texG || colorMap);
    glbCache.dragon = normalizeModel(rawDragon, 5.2, true, null);

    r2Loaded = true;
    const loadedList = [];
    if (glbCache.avatar) loadedList.push('avatar.glb');
    if (glbCache.characterG) loadedList.push('caracter-g.glb');
    if (glbCache.dragon) loadedList.push('DragonAttenuation.glb');

    if (statusEl) {
      statusEl.textContent = loadedList.length > 0
        ? `✓ R2 Conectado (${loadedList.join(', ')})`
        : '✓ Motor 3D Procedural Activo (Modo Rápido)';
      statusEl.style.color = '#2ecc71';
    }
  } catch (e) {
    console.warn('Error cargando recursos R2:', e);
    if (statusEl) statusEl.textContent = '✓ Motor 3D Procedural Listo';
  }
}

// ============================================================================
// 8. MODELOS 3D PROCEDURALES, NODOS DE RECURSOS (ALBION) Y COLISIONES
// ============================================================================
const wallMeshes = [];
const wallBoxes = [];
const buildings = [];
const hostageObjects = [];
const treeData = [];
const oreData = [];

const woodMat = new THREE.MeshLambertMaterial({ map: makeWoodTexture() });
const barkMat = new THREE.MeshLambertMaterial({ map: makeBarkTexture() });
const concreteMat = new THREE.MeshLambertMaterial({ color: 0x6b6b6b });
const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a1e14 });
const oreRockMat = new THREE.MeshLambertMaterial({ color: 0x4b5358 });
const oreCrystalMat = new THREE.MeshLambertMaterial({ color: 0x00d2ff, emissive: 0x003344 });
const safeZoneMat = new THREE.MeshBasicMaterial({ color: 0x2ecc71, side: THREE.DoubleSide, transparent: true, opacity: 0.35 });

const leafMats = [
  new THREE.MeshLambertMaterial({ color: 0x2d5016 }),
  new THREE.MeshLambertMaterial({ color: 0x3a6b1f }),
  new THREE.MeshLambertMaterial({ color: 0x1f3a10 }),
  new THREE.MeshLambertMaterial({ color: 0x4a7a2a })
];

function addWallMesh(x, y, z, w, h, d, mat) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat);
  m.position.set(x, y, z);
  m.castShadow = true;
  m.receiveShadow = true;
  scene.add(m);
  wallMeshes.push(m);
  const box = new THREE.Box3().setFromObject(m);
  box.max.y = 2.5; // Permite pasar bajo techos sin atascarse
  wallBoxes.push(box);
  return m;
}

function createTreeMesh() {
  const group = new THREE.Group();
  const trunkH = 2.5 + Math.random() * 1.5;
  const trunk = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.32, trunkH, 7), barkMat);
  trunk.position.y = trunkH / 2;
  trunk.castShadow = true;
  trunk.receiveShadow = true;
  group.add(trunk);

  const numLeaves = 4 + Math.floor(Math.random() * 3);
  for (let i = 0; i < numLeaves; i++) {
    const r = 1.1 + Math.random() * 0.8;
    const leaf = new THREE.Mesh(
      new THREE.SphereGeometry(r, 7, 5),
      leafMats[Math.floor(Math.random() * leafMats.length)]
    );
    leaf.position.set((Math.random() - 0.5) * 1.4, trunkH + (Math.random() - 0.2) * 1.4, (Math.random() - 0.5) * 1.4);
    leaf.castShadow = true;
    leaf.receiveShadow = true;
    group.add(leaf);
  }
  return group;
}

function addTree(x, z) {
  const tree = createTreeMesh();
  tree.position.set(x, 0, z);
  tree.rotation.y = Math.random() * Math.PI * 2;
  scene.add(tree);

  const trunkBox = new THREE.Mesh(
    new THREE.BoxGeometry(0.7, 3, 0.7),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  trunkBox.position.set(x, 1.5, z);
  scene.add(trunkBox);
  wallMeshes.push(trunkBox);
  wallBoxes.push(new THREE.Box3().setFromObject(trunkBox));
  treeData.push({ x, z, mesh: tree, box: trunkBox, harvested: false, respawnTimer: 0 });
}

function createOreNodeMesh() {
  const g = new THREE.Group();
  const base = new THREE.Mesh(new THREE.DodecahedronGeometry(0.95, 0), oreRockMat);
  base.position.y = 0.6;
  base.scale.set(1.2, 0.85, 1.1);
  base.castShadow = true;
  g.add(base);

  for (let i = 0; i < 4; i++) {
    const crystal = new THREE.Mesh(new THREE.OctahedronGeometry(0.28, 0), oreCrystalMat);
    crystal.position.set((Math.random() - 0.5) * 0.9, 0.85 + Math.random() * 0.3, (Math.random() - 0.5) * 0.9);
    g.add(crystal);
  }
  return g;
}

function addOreNode(x, z) {
  const ore = createOreNodeMesh();
  ore.position.set(x, 0, z);
  ore.rotation.y = Math.random() * Math.PI * 2;
  scene.add(ore);
  oreData.push({ x, z, mesh: ore, harvested: false, respawnTimer: 0 });
}

let grassMaterial = null;
let grassMesh = null;
function createGrassField(count) {
  if (grassMesh) scene.remove(grassMesh);
  const geo = new THREE.PlaneGeometry(0.12, 1.1);
  geo.translate(0, 0.55, 0);
  grassMaterial = new THREE.MeshLambertMaterial({ color: 0x4a7a2a, side: THREE.DoubleSide });
  grassMaterial.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = { value: 0 };
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nuniform float uTime;\nvarying float vGrassY;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvGrassY = position.y;\nfloat worldX = instanceMatrix[3].x;\nfloat worldZ = instanceMatrix[3].z;\nfloat wind = sin(uTime * 1.4 + worldX * 0.35 + worldZ * 0.25) * 0.18;\nwind += sin(uTime * 2.6 + worldX * 0.6) * 0.07;\nfloat hN = clamp(position.y, 0.0, 1.1) / 1.1;\ntransformed.x += wind * hN * hN;\ntransformed.z += wind * 0.4 * hN * hN;`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nvarying float vGrassY;`)
      .replace('#include <color_fragment>', `#include <color_fragment>\nfloat hMix = clamp(vGrassY / 1.1, 0.0, 1.0);\nvec3 baseC = vec3(0.12, 0.28, 0.07);\nvec3 tipC = vec3(0.5, 0.75, 0.22);\ndiffuseColor.rgb = mix(baseC, tipC, pow(hMix, 0.7));`);
    grassMaterial.userData.shader = shader;
  };

  grassMesh = new THREE.InstancedMesh(geo, grassMaterial, count);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < count; i++) {
    let x, z, tries = 0;
    do {
      x = (Math.random() - 0.5) * (WORLD_SIZE - 8);
      z = (Math.random() - 0.5) * (WORLD_SIZE - 8);
      tries++;
    } while (tries < 5 && checkCollision(x, z, 0.5));
    dummy.position.set(x, 0, z);
    dummy.rotation.y = Math.random() * Math.PI;
    dummy.scale.set(0.7 + Math.random() * 0.6, 0.7 + Math.random() * 0.6, 1);
    dummy.updateMatrix();
    grassMesh.setMatrixAt(i, dummy.matrix);
  }
  grassMesh.instanceMatrix.needsUpdate = true;
  scene.add(grassMesh);
}

function createHumanoid(shirtColor, skinColor = 0xf0c090, scale = 1) {
  const g = new THREE.Group();
  const shirt = new THREE.MeshLambertMaterial({ color: shirtColor });
  const skin = new THREE.MeshLambertMaterial({ color: skinColor });
  const dark = new THREE.MeshLambertMaterial({ color: 0x223344 });
  const boot = new THREE.MeshLambertMaterial({ color: 0x111111 });
  const hair = new THREE.MeshLambertMaterial({ color: 0x2a1a0a });
  const belt = new THREE.MeshLambertMaterial({ color: 0x3a2010 });

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.11 * scale, 16, 12), skin);
  head.scale.set(1, 1.15, 1);
  head.position.y = 1.7 * scale;
  head.castShadow = true;
  g.add(head);

  const hairMesh = new THREE.Mesh(new THREE.SphereGeometry(0.115 * scale, 14, 10, 0, Math.PI * 2, 0, Math.PI * 0.55), hair);
  hairMesh.position.y = 1.72 * scale;
  hairMesh.castShadow = true;
  g.add(hairMesh);

  const eyeWhite = new THREE.MeshLambertMaterial({ color: 0xffffff });
  const eyePupil = new THREE.MeshBasicMaterial({ color: 0x000000 });
  for (const sx of [-1, 1]) {
    const w = new THREE.Mesh(new THREE.SphereGeometry(0.028 * scale, 8, 6), eyeWhite);
    w.position.set(0.038 * sx * scale, 1.72 * scale, -0.09 * scale);
    g.add(w);
    const p = new THREE.Mesh(new THREE.SphereGeometry(0.014 * scale, 6, 6), eyePupil);
    p.position.set(0.038 * sx * scale, 1.72 * scale, -0.115 * scale);
    g.add(p);
  }

  const nose = new THREE.Mesh(new THREE.ConeGeometry(0.022 * scale, 0.04 * scale, 5), skin);
  nose.rotation.x = Math.PI / 2;
  nose.position.set(0, 1.68 * scale, -0.11 * scale);
  g.add(nose);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.05 * scale, 0.06 * scale, 0.08 * scale, 8), skin);
  neck.position.y = 1.58 * scale;
  g.add(neck);

  const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42 * scale, 0.55 * scale, 0.24 * scale), shirt);
  torso.position.y = 1.25 * scale;
  torso.castShadow = true;
  g.add(torso);

  const beltMesh = new THREE.Mesh(new THREE.BoxGeometry(0.44 * scale, 0.06 * scale, 0.26 * scale), belt);
  beltMesh.position.y = 0.96 * scale;
  g.add(beltMesh);

  const hips = new THREE.Mesh(new THREE.BoxGeometry(0.4 * scale, 0.16 * scale, 0.24 * scale), dark);
  hips.position.y = 0.86 * scale;
  g.add(hips);

  for (const sx of [-1, 1]) {
    const upper = new THREE.Mesh(new THREE.CapsuleGeometry(0.055 * scale, 0.28 * scale, 3, 8), shirt);
    upper.position.set(sx * 0.26 * scale, 1.32 * scale, 0);
    upper.rotation.z = sx * 0.08;
    upper.castShadow = true;
    g.add(upper);

    const fore = new THREE.Mesh(new THREE.CapsuleGeometry(0.05 * scale, 0.26 * scale, 3, 8), skin);
    fore.position.set(sx * 0.28 * scale, 0.95 * scale, -0.02 * scale);
    g.add(fore);

    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.08 * scale, 0.09 * scale, 0.08 * scale), skin);
    hand.position.set(sx * 0.28 * scale, 0.72 * scale, -0.03 * scale);
    g.add(hand);

    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.075 * scale, 0.42 * scale, 3, 8), dark);
    leg.position.set(sx * 0.11 * scale, 0.5 * scale, 0);
    leg.castShadow = true;
    g.add(leg);

    const bootMesh = new THREE.Mesh(new THREE.BoxGeometry(0.13 * scale, 0.1 * scale, 0.22 * scale), boot);
    bootMesh.position.set(sx * 0.11 * scale, 0.08 * scale, -0.04 * scale);
    g.add(bootMesh);
  }
  return g;
}

function createWeaponMesh(type) {
  const g = new THREE.Group();
  const black = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const metal = new THREE.MeshLambertMaterial({ color: 0x555555 });
  const wood = new THREE.MeshLambertMaterial({ color: 0x5a3020 });
  const skin = new THREE.MeshLambertMaterial({ color: 0xf0c090 });
  const lens = new THREE.MeshBasicMaterial({ color: 0x00d2ff });

  if (type === 'pistol') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.28), black);
    body.position.set(0, 0, -0.14);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.018, 0.018, 0.1, 8), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.01, -0.28);
    g.add(barrel);
    const grip = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.16, 0.09), black);
    grip.position.set(0, -0.1, -0.02);
    grip.rotation.x = 0.15;
    g.add(grip);
    const hand = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.11, 0.1), skin);
    hand.position.set(0, -0.07, -0.01);
    g.add(hand);
  } else if (type === 'shotgun') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.11, 0.5), black);
    body.position.set(0, 0, -0.2);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.55);
    g.add(barrel);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.35), wood);
    stock.position.set(0, -0.03, 0.25);
    g.add(stock);
    const pump = new THREE.Mesh(new THREE.BoxGeometry(0.09, 0.09, 0.15), wood);
    pump.position.set(0, -0.03, -0.35);
    g.add(pump);
  } else if (type === 'rifle') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.65), black);
    body.position.set(0, 0, -0.25);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.45, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.02, -0.72);
    g.add(barrel);
    const mag = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.2, 0.1), black);
    mag.position.set(0, -0.1, -0.2);
    g.add(mag);
    const stock = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.12, 0.3), black);
    stock.position.set(0, -0.02, 0.3);
    g.add(stock);
  } else if (type === 'sniper') {
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.12, 0.78), wood);
    body.position.set(0, 0, -0.3);
    g.add(body);
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.024, 0.024, 0.75, 10), metal);
    barrel.rotation.x = Math.PI / 2;
    barrel.position.set(0, 0.03, -0.95);
    g.add(barrel);
    const scope = new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.042, 0.32, 12), black);
    scope.rotation.x = Math.PI / 2;
    scope.position.set(0, 0.11, -0.32);
    g.add(scope);
    const glass = new THREE.Mesh(new THREE.CircleGeometry(0.038, 10), lens);
    glass.position.set(0, 0.11, -0.49);
    g.add(glass);
  }
  return g;
}

function createBearMesh() {
  const g = new THREE.Group();
  const fur = new THREE.MeshLambertMaterial({ color: 0x3a2415 });
  const darkFur = new THREE.MeshLambertMaterial({ color: 0x241509 });
  const snout = new THREE.MeshLambertMaterial({ color: 0x1a0f06 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0x000000 });
  const clawMat = new THREE.MeshLambertMaterial({ color: 0x111111 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(0.8, 12, 10), fur);
  body.scale.set(1.4, 1, 1);
  body.position.y = 1.0;
  body.castShadow = true;
  g.add(body);

  const hump = new THREE.Mesh(new THREE.SphereGeometry(0.5, 10, 8), fur);
  hump.position.set(-0.3, 1.5, 0);
  hump.scale.set(1.2, 0.8, 1);
  g.add(hump);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 10), fur);
  head.position.set(1.1, 1.3, 0);
  head.castShadow = true;
  g.add(head);

  const nose = new THREE.Mesh(new THREE.SphereGeometry(0.25, 10, 8), snout);
  nose.scale.set(1.3, 0.8, 1);
  nose.position.set(1.55, 1.15, 0);
  g.add(nose);

  for (const sz of [-1, 1]) {
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.07, 6, 6), eyeMat);
    eye.position.set(1.45, 1.45, 0.25 * sz);
    g.add(eye);
    const ear = new THREE.Mesh(new THREE.SphereGeometry(0.15, 8, 6), fur);
    ear.position.set(0.9, 1.75, 0.35 * sz);
    g.add(ear);
  }

  const legGeo = new THREE.CylinderGeometry(0.18, 0.14, 0.7, 8);
  for (const [lx, lz] of [[0.6, 0.55], [0.6, -0.55], [-0.6, 0.55], [-0.6, -0.55]]) {
    const leg = new THREE.Mesh(legGeo, darkFur);
    leg.position.set(lx, 0.35, lz);
    g.add(leg);
    for (let i = -1; i <= 1; i++) {
      const claw = new THREE.Mesh(new THREE.ConeGeometry(0.04, 0.15, 4), clawMat);
      claw.rotation.x = -Math.PI / 2;
      claw.position.set(lx + 0.15, 0.05, lz + i * 0.1);
      g.add(claw);
    }
  }
  return g;
}

function createDragonMesh() {
  const g = new THREE.Group();
  const bodyMat = new THREE.MeshLambertMaterial({ color: 0x5c0a0a });
  const wingMat = new THREE.MeshLambertMaterial({ color: 0x851414, side: THREE.DoubleSide });
  const hornMat = new THREE.MeshLambertMaterial({ color: 0x1a0505 });
  const eyeMat = new THREE.MeshBasicMaterial({ color: 0xffcc00 });

  const body = new THREE.Mesh(new THREE.SphereGeometry(1.2, 12, 10), bodyMat);
  body.scale.set(2.2, 1.1, 1);
  body.castShadow = true;
  g.add(body);

  const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.5, 1.5, 8), bodyMat);
  neck.position.set(1.8, 0.6, 0);
  neck.rotation.z = -0.5;
  g.add(neck);

  const head = new THREE.Mesh(new THREE.SphereGeometry(0.6, 10, 8), bodyMat);
  head.position.set(2.6, 1.1, 0);
  head.scale.set(1.5, 1, 1);
  head.castShadow = true;
  g.add(head);

  for (const sz of [-1, 1]) {
    const horn = new THREE.Mesh(new THREE.ConeGeometry(0.12, 0.5, 6), hornMat);
    horn.position.set(2.3, 1.6, 0.2 * sz);
    horn.rotation.z = 0.3;
    g.add(horn);
    const eye = new THREE.Mesh(new THREE.SphereGeometry(0.1, 6, 6), eyeMat);
    eye.position.set(2.9, 1.2, 0.3 * sz);
    g.add(eye);
    const wing = new THREE.Mesh(new THREE.PlaneGeometry(3.8, 2.2), wingMat);
    wing.position.set(-0.3, 1.2, 1.6 * sz);
    wing.rotation.x = sz * 0.3;
    wing.rotation.z = 0.2;
    g.add(wing);
  }

  const tail = new THREE.Mesh(new THREE.ConeGeometry(0.4, 3, 6), bodyMat);
  tail.rotation.z = Math.PI / 2;
  tail.position.set(-2.5, 0, 0);
  g.add(tail);
  return g;
}

function createMarker(text, color) {
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const x = c.getContext('2d');
  x.font = 'bold 96px system-ui';
  x.textAlign = 'center';
  x.textBaseline = 'middle';
  x.strokeStyle = '#000';
  x.lineWidth = 10;
  x.strokeText(text, 64, 64);
  x.fillStyle = '#' + color.toString(16).padStart(6, '0');
  x.fillText(text, 64, 64);
  const tex = new THREE.CanvasTexture(c);
  return new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
}

// ============================================================================
// 9. MOTOR DE COLISIONES Y LÍNEA DE VISIÓN (enemySeesPlayer INCLUIDO)
// ============================================================================
function checkCollision(x, z, radius) {
  for (const box of wallBoxes) {
    const cx = Math.max(box.min.x, Math.min(x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(z, box.max.z));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  for (const box of boundaryBoxes) {
    const cx = Math.max(box.min.x, Math.min(x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(z, box.max.z));
    const dx = x - cx;
    const dz = z - cz;
    if (dx * dx + dz * dz < radius * radius) return true;
  }
  return false;
}

function enemySeesPlayer(e) {
  if (player.inSafeZone) return false; // En el Refugio Seguro los enemigos no te detectan
  const px = player.position.x;
  const pz = player.position.z;
  const ex = e.mesh.position.x;
  const ez = e.mesh.position.z;
  const dx = px - ex;
  const dz = pz - ez;
  const distSq = dx * dx + dz * dz;
  if (distSq > e.visionRange * e.visionRange) return false;

  const facingX = -Math.sin(e.mesh.rotation.y);
  const facingZ = -Math.cos(e.mesh.rotation.y);
  const dist = Math.sqrt(distSq);
  const dot = (dx / dist) * facingX + (dz / dist) * facingZ;
  if (dot < Math.cos(e.visionAngle / 2)) return false;

  const origin = new THREE.Vector3(ex, 1.5, ez);
  const dir = new THREE.Vector3(dx / dist, 0, dz / dist);
  const ray = new THREE.Raycaster(origin, dir, 0, dist);
  const hits = ray.intersectObjects(wallMeshes, false);
  return hits.length === 0;
}

// ============================================================================
// 10. GENERADOR DEL MUNDO, REFUGIO SEGURO Y NODOS DE RECURSOS
// ============================================================================
let safeZoneRingMesh = null;

function generateWorld() {
  for (const m of wallMeshes) scene.remove(m);
  for (const t of treeData) scene.remove(t.mesh);
  for (const o of oreData) scene.remove(o.mesh);
  wallMeshes.length = 0;
  wallBoxes.length = 0;
  buildings.length = 0;
  hostageObjects.length = 0;
  treeData.length = 0;
  oreData.length = 0;

  // Anillo visual del Refugio Seguro Central (Estilo Albion)
  if (!safeZoneRingMesh) {
    const ringGeo = new THREE.RingGeometry(SAFE_ZONE_RADIUS - 0.6, SAFE_ZONE_RADIUS, 64);
    safeZoneRingMesh = new THREE.Mesh(ringGeo, safeZoneMat);
    safeZoneRingMesh.rotation.x = -Math.PI / 2;
    safeZoneRingMesh.position.y = 0.06;
    scene.add(safeZoneRingMesh);
  }

  // Edificios con puertas anchas (4.2m) y rehenes
  for (let i = 0; i < 7; i++) {
    for (let t = 0; t < 30; t++) {
      const bw = 12 + Math.random() * 8;
      const bd = 12 + Math.random() * 8;
      const bx = -BOUND + 12 + Math.random() * (WORLD_SIZE - 24 - bw);
      const bz = -BOUND + 12 + Math.random() * (WORLD_SIZE - 24 - bd);
      // No construir encima del Refugio Central
      if (Math.hypot(bx + bw / 2, bz + bd / 2) < SAFE_ZONE_RADIUS + 14) continue;

      let ok = true;
      for (const b of buildings) {
        if (bx < b.x + b.w + 6 && bx + bw + 6 > b.x && bz < b.z + b.d + 6 && bz + bd + 6 > b.z) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;

      const wallH = 4.2;
      const wallT = 0.5;
      const cx = bx + bw / 2;
      const cz = bz + bd / 2;
      const doorW = 4.2;

      addWallMesh(cx, wallH / 2, bz, bw, wallH, wallT, woodMat);
      addWallMesh(bx + (bw - doorW) / 4, wallH / 2, bz + bd, (bw - doorW) / 2, wallH, wallT, woodMat);
      addWallMesh(bx + bw - (bw - doorW) / 4, wallH / 2, bz + bd, (bw - doorW) / 2, wallH, wallT, woodMat);
      addWallMesh(bx + bw, wallH / 2, cz, wallT, wallH, bd, woodMat);
      addWallMesh(bx, wallH / 2, cz, wallT, wallH, bd, woodMat);

      const roof = new THREE.Mesh(new THREE.BoxGeometry(bw + 0.6, 0.3, bd + 0.6), roofMat);
      roof.position.set(cx, wallH + 0.15, cz);
      roof.castShadow = true;
      scene.add(roof);

      const building = { x: bx, z: bz, w: bw, d: bd, door: { x: cx, z: bz + bd, w: doorW } };

      if (Math.random() < 0.85) {
        const hx = bx + 2.5 + Math.random() * (bw - 5);
        const hz = bz + 2.5 + Math.random() * (bd - 5);
        const h = createHumanoid(0xf39c12, 0xe6a23c, 1);
        h.position.set(hx, 0, hz);
        scene.add(h);
        const marker = createMarker('!', 0xffcc00);
        marker.position.set(hx, 2.6, hz);
        scene.add(marker);
        const hostage = { x: hx, z: hz, mesh: h, marker, freed: false, building };
        building.hostage = hostage;
        hostageObjects.push(hostage);
      }
      buildings.push(building);
      break;
    }
  }

  // Trincheras y coberturas tácticas (Estilo Call of Duty)
  for (let i = 0; i < 24; i++) {
    for (let t = 0; t < 20; t++) {
      const w = 2 + Math.random() * 3.5;
      const h = 1.6 + Math.random() * 1.8;
      const d = 2 + Math.random() * 3.5;
      const x = -BOUND + 8 + Math.random() * (WORLD_SIZE - 16 - w);
      const z = -BOUND + 8 + Math.random() * (WORLD_SIZE - 16 - d);
      if (Math.hypot(x, z) < SAFE_ZONE_RADIUS + 4) continue;
      let ok = true;
      for (const b of buildings) {
        if (x < b.x + b.w + 3 && x + w + 3 > b.x && z < b.z + b.d + 3 && z + d + 3 > b.z) {
          ok = false;
          break;
        }
      }
      if (!ok) continue;
      addWallMesh(x + w / 2, h / 2, z + d / 2, w, h, d, concreteMat);
      break;
    }
  }

  // Bosques talables (Madera 🪵)
  for (let i = 0; i < 75; i++) {
    for (let t = 0; t < 30; t++) {
      const x = -BOUND + 6 + Math.random() * (WORLD_SIZE - 12);
      const z = -BOUND + 6 + Math.random() * (WORLD_SIZE - 12);
      if (Math.hypot(x, z) < SAFE_ZONE_RADIUS - 2) continue;
      if (checkCollision(x, z, 2.2)) continue;
      addTree(x, z);
      break;
    }
  }

  // Vetas de Mineral extraíbles (Mineral ⛏️)
  for (let i = 0; i < ORE_NODES_COUNT; i++) {
    for (let t = 0; t < 30; t++) {
      const x = -BOUND + 8 + Math.random() * (WORLD_SIZE - 16);
      const z = -BOUND + 8 + Math.random() * (WORLD_SIZE - 16);
      if (Math.hypot(x, z) < SAFE_ZONE_RADIUS) continue;
      if (checkCollision(x, z, 2.0)) continue;
      addOreNode(x, z);
      break;
    }
  }
}
// ============================================================================
// 11. CONSTRUCCIÓN DEL JUGADOR Y ARMAMENTO EQUIPADO
// ============================================================================
let playerMesh = null;
let playerGunGroup = null;

function buildPlayer() {
  if (playerMesh) scene.remove(playerMesh);

  if (glbCache.avatar) {
    playerMesh = glbCache.avatar.clone(true);
  } else {
    playerMesh = createHumanoid(0x2980b9, 0xf0c090, 1);
  }

  playerMesh.position.copy(player.position);
  scene.add(playerMesh);

  playerGunGroup = new THREE.Group();
  playerGunGroup.position.set(0.28, 1.25, -0.28);
  playerMesh.add(playerGunGroup);
  updatePlayerWeaponMesh();
}

function updatePlayerWeaponMesh() {
  if (!playerGunGroup) return;
  while (playerGunGroup.children.length) {
    playerGunGroup.remove(playerGunGroup.children[0]);
  }
  playerGunGroup.add(createWeaponMesh(player.weapon));
}

// ============================================================================
// 12. ENEMIGOS INDIVIDUALES (SAQUEADORES, OSOS Y JEFES DE ZONA)
// ============================================================================
let enemies = [];
let boss = null;
let waveTimer = 0;
let spawnTimer = 0;
let bearSpawnTimer = 0;
let running = false;
let gameOver = false;

function spawnEnemy(x, z) {
  let mesh;
  if (glbCache.characterG) {
    mesh = glbCache.characterG.clone(true);
  } else {
    mesh = createHumanoid(0xc0392b, 0xe0a080, 1);
  }
  mesh.position.set(x, 0, z);
  scene.add(mesh);

  const hpVal = 55 + wave * 16;
  const e = {
    mesh,
    hp: hpVal,
    maxHp: hpVal,
    speed: 2.6 + wave * 0.15,
    r: 0.6,
    height: 1.85,
    visionRange: 26,
    visionAngle: Math.PI * 0.75,
    alert: false,
    lastSeenX: x,
    lastSeenZ: z,
    lastSeenTime: 999,
    shootCd: 1.45 + Math.random() * 0.5,
    lastShot: 0,
    wanderAng: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    isBoss: false,
    isBear: false,
    strafeDir: Math.random() < 0.5 ? -1 : 1
  };
  mesh.userData.enemyRef = e;
  enemies.push(e);
  return e;
}

function spawnBoss(x, z) {
  const mesh = createHumanoid(0x6a0000, 0x8a1010, 1.75);
  mesh.position.set(x, 0, z);
  scene.add(mesh);

  const hpVal = 650 + wave * 120;
  const e = {
    mesh,
    title: `⚠ COMANDANTE SAQUEADOR (OLEADA ${wave}) ⚠`,
    hp: hpVal,
    maxHp: hpVal,
    speed: 2.2 + wave * 0.1,
    r: 1.05,
    height: 3.1,
    visionRange: 40,
    visionAngle: Math.PI,
    alert: true,
    lastSeenX: x,
    lastSeenZ: z,
    lastSeenTime: 0,
    shootCd: 0.95,
    lastShot: 0,
    wanderAng: 0,
    wanderTimer: 0,
    isBoss: true,
    isBear: false,
    strafeDir: 1
  };
  mesh.userData.enemyRef = e;
  enemies.push(e);
  boss = e;
  SFX.boss();
  showMsg('⚠ ¡UN COMANDANTE SAQUEADOR HA ENTRADO EN LA ZONA!');
  updateBossBar();
}

function spawnBear(x, z) {
  const mesh = createBearMesh();
  mesh.position.set(x, 0, z);
  scene.add(mesh);

  const hpVal = 190 + wave * 35;
  const e = {
    mesh,
    hp: hpVal,
    maxHp: hpVal,
    speed: 3.8,
    r: 1.0,
    height: 1.8,
    visionRange: 18,
    visionAngle: Math.PI * 2,
    alert: false,
    lastSeenX: x,
    lastSeenZ: z,
    lastSeenTime: 999,
    shootCd: 0,
    lastShot: 0,
    meleeCd: 1.15,
    lastBite: 0,
    wanderAng: Math.random() * Math.PI * 2,
    wanderTimer: 0,
    isBoss: false,
    isBear: true,
    strafeDir: 1
  };
  mesh.userData.enemyRef = e;
  enemies.push(e);
  SFX.bear();
  return e;
}

function damageEnemy(e, baseDmg, isHeadshot = false) {
  const tierMult = (TIERS[player.tier] || TIERS[1]).dmgMult;
  const finalDmg = Math.round(baseDmg * tierMult * (isHeadshot ? WEAPONS[player.weapon].headshotMult : 1));
  e.hp -= finalDmg;
  e.alert = true;
  e.lastSeenX = player.position.x;
  e.lastSeenZ = player.position.z;
  e.lastSeenTime = 0;

  if (isHeadshot) {
    SFX.headshot();
    spawnFloatingText(`🎯 CRÍTICO -${finalDmg}`, '#ff3333');
  } else {
    SFX.hit();
    spawnFloatingText(`-${finalDmg}`, '#ffcc00');
  }
  showHitmarker();

  if (e.hp <= 0) {
    killEnemy(e, isHeadshot);
  } else if (e.isBoss) {
    boss = e;
    updateBossBar();
  }
}

function killEnemy(e, wasHeadshot = false) {
  const gatherBonus = (TIERS[player.tier] || TIERS[1]).gatherBonus;
  if (e.isBoss) {
    score += 300 + wave * 50;
    gold += 120;
    addXP(120);
    SFX.bossDie();
    addKillfeed(`👑 Comandante abatido (+120 Oro)`);
    for (let k = 0; k < 8; k++) {
      spawnLoot(e.mesh.position.x + (Math.random() - 0.5) * 3.5, e.mesh.position.z + (Math.random() - 0.5) * 3.5, 'coin');
    }
    spawnLoot(e.mesh.position.x, e.mesh.position.z, 'health');
    spawnLoot(e.mesh.position.x + 1.8, e.mesh.position.z, 'weapon:sniper');
    if (boss === e) boss = null;
    updateBossBar();
  } else if (e.isBear) {
    score += 85 + wave * 10;
    gold += 35;
    resources.hide += 3 * gatherBonus;
    addXP(45);
    SFX.death();
    addKillfeed(`🐻 Oso salvaje cazado (+${3 * gatherBonus} Piel)`);
    spawnLoot(e.mesh.position.x, e.mesh.position.z, 'health');
    spawnLoot(e.mesh.position.x + 1, e.mesh.position.z, 'coin');
  } else {
    score += (wasHeadshot ? 25 : 15) + wave;
    gold += wasHeadshot ? 12 : 8;
    addXP(20);
    SFX.death();
    addKillfeed(`${wasHeadshot ? '🎯 Headshot a' : '⚔️'} Saqueador (+${wasHeadshot ? 12 : 8} Oro)`);
    const r = Math.random();
    if (r < 0.14) spawnLoot(e.mesh.position.x, e.mesh.position.z, 'health');
    else if (r < 0.25) {
      const dropW = Math.random() < 0.45 ? 'shotgun' : (Math.random() < 0.8 ? 'rifle' : 'sniper');
      spawnLoot(e.mesh.position.x, e.mesh.position.z, 'weapon:' + dropW);
    } else {
      spawnLoot(e.mesh.position.x, e.mesh.position.z, 'coin');
    }
  }
  scene.remove(e.mesh);
  enemies = enemies.filter(x => x !== e);
  updateHUD();
}

// ============================================================================
// 13. FAUNA INSTANCIADA (CIERVOS Y JAURÍAS DE LOBOS - PIELES DE ALBION)
// ============================================================================
const instancedSystems = {};

function createInstancedSystem(name, parts, count) {
  if (instancedSystems[name]) {
    for (const p of instancedSystems[name].instancedParts) {
      scene.remove(p.mesh);
    }
  }
  const instancedParts = parts.map(p => {
    const im = new THREE.InstancedMesh(p.geo, p.mat, count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = !isTouch;
    im.userData.sysName = name;
    im.userData.offset = p.offset;
    scene.add(im);
    return { mesh: im, offset: p.offset };
  });

  const data = Array.from({ length: count }, () => ({
    alive: false,
    x: 0,
    z: 0,
    yaw: 0,
    hp: 0,
    maxHp: 0,
    baseY: 0,
    wanderAng: 0,
    wanderTimer: 0,
    lastBite: 0
  }));

  const dummy = new THREE.Object3D();
  instancedSystems[name] = { name, instancedParts, data, count, dummy };

  for (let i = 0; i < count; i++) {
    dummy.position.set(0, -1000, 0);
    dummy.scale.set(0, 0, 0);
    dummy.updateMatrix();
    for (const part of instancedParts) part.mesh.setMatrixAt(i, dummy.matrix);
  }
  for (const part of instancedParts) part.mesh.instanceMatrix.needsUpdate = true;
  return instancedSystems[name];
}

function initInstancedSystems() {
  const deerParts = [
    { geo: new THREE.BoxGeometry(1.2, 0.7, 0.6), mat: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }), offset: { x: 0, y: 0.8, z: 0 } },
    { geo: new THREE.BoxGeometry(0.4, 0.4, 0.4), mat: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }), offset: { x: 0.65, y: 1.3, z: 0 } },
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), mat: new THREE.MeshLambertMaterial({ color: 0x3a1f0a }), offset: { x: 0.55, y: 1.65, z: 0.1 } },
    { geo: new THREE.CylinderGeometry(0.06, 0.06, 0.6, 6), mat: new THREE.MeshLambertMaterial({ color: 0x3a1f0a }), offset: { x: 0.55, y: 1.65, z: -0.1 } }
  ];
  createInstancedSystem('deer', deerParts, DEER_COUNT);

  const wolfParts = [
    { geo: new THREE.BoxGeometry(1.4, 0.6, 0.5), mat: new THREE.MeshLambertMaterial({ color: 0x555555 }), offset: { x: 0, y: 0.65, z: 0 } },
    { geo: new THREE.BoxGeometry(0.4, 0.4, 0.4), mat: new THREE.MeshLambertMaterial({ color: 0x555555 }), offset: { x: 0.75, y: 0.85, z: 0 } },
    { geo: new THREE.ConeGeometry(0.12, 0.3, 6), mat: new THREE.MeshLambertMaterial({ color: 0x555555 }), offset: { x: 1.05, y: 0.8, z: 0 } },
    { geo: new THREE.ConeGeometry(0.08, 0.15, 4), mat: new THREE.MeshLambertMaterial({ color: 0x222222 }), offset: { x: 0.65, y: 1.15, z: 0.12 } },
    { geo: new THREE.ConeGeometry(0.08, 0.15, 4), mat: new THREE.MeshLambertMaterial({ color: 0x222222 }), offset: { x: 0.65, y: 1.15, z: -0.12 } }
  ];
  createInstancedSystem('wolf', wolfParts, WOLF_COUNT);
}

function spawnInstanced(name, x, z, hp) {
  const sys = instancedSystems[name];
  if (!sys) return -1;
  for (let i = 0; i < sys.count; i++) {
    if (!sys.data[i].alive) {
      const d = sys.data[i];
      d.alive = true;
      d.x = x;
      d.z = z;
      d.yaw = Math.random() * Math.PI * 2;
      d.hp = hp;
      d.maxHp = hp;
      d.wanderAng = Math.random() * Math.PI * 2;
      d.wanderTimer = 0;
      d.lastBite = 0;
      updateInstanceMatrix(sys, i);
      return i;
    }
  }
  return -1;
}

function updateInstanceMatrix(sys, i) {
  const d = sys.data[i];
  const dummy = sys.dummy;
  dummy.position.set(d.x, d.baseY || 0, d.z);
  dummy.rotation.set(0, d.yaw, 0);
  const s = d.alive ? 1 : 0;
  dummy.scale.set(s, s, s);
  dummy.updateMatrix();
  for (const part of sys.instancedParts) {
    const mat = dummy.matrix.clone();
    const off = new THREE.Matrix4().makeTranslation(part.offset.x, part.offset.y, part.offset.z);
    mat.multiply(off);
    part.mesh.setMatrixAt(i, mat);
  }
}

function commitInstanced(sys) {
  for (const part of sys.instancedParts) {
    part.mesh.instanceMatrix.needsUpdate = true;
  }
}

function updateInstancedAI(dt) {
  const deerSys = instancedSystems.deer;
  if (deerSys) {
    for (let i = 0; i < deerSys.count; i++) {
      const d = deerSys.data[i];
      if (!d.alive) continue;
      const dx = player.position.x - d.x;
      const dz = player.position.z - d.z;
      const dd = Math.hypot(dx, dz);
      if (dd < 16) {
        d.yaw = Math.atan2(-dx, -dz);
        d.x -= (dx / dd) * 5.5 * dt;
        d.z -= (dz / dd) * 5.5 * dt;
      } else {
        d.wanderTimer -= dt;
        if (d.wanderTimer <= 0) {
          d.wanderTimer = 2 + Math.random() * 3;
          d.wanderAng = Math.random() * Math.PI * 2;
        }
        d.yaw = Math.atan2(-Math.cos(d.wanderAng), -Math.sin(d.wanderAng));
        d.x += Math.cos(d.wanderAng) * 0.85 * dt;
        d.z += Math.sin(d.wanderAng) * 0.85 * dt;
      }
      d.x = Math.max(-BOUND + 4, Math.min(BOUND - 4, d.x));
      d.z = Math.max(-BOUND + 4, Math.min(BOUND - 4, d.z));
      updateInstanceMatrix(deerSys, i);
    }
    commitInstanced(deerSys);
  }

  const wolfSys = instancedSystems.wolf;
  if (wolfSys) {
    for (let i = 0; i < wolfSys.count; i++) {
      const d = wolfSys.data[i];
      if (!d.alive) continue;
      const dx = player.position.x - d.x;
      const dz = player.position.z - d.z;
      const dd = Math.hypot(dx, dz);

      if (dd < 20 && !player.inSafeZone) {
        d.yaw = Math.atan2(-dx, -dz);
        if (dd > 1.8) {
          d.x += (dx / dd) * 5.2 * dt;
          d.z += (dz / dd) * 5.2 * dt;
        } else {
          d.lastBite += dt;
          if (d.lastBite >= 0.9) {
            d.lastBite = 0;
            player.hp -= 8;
            SFX.hit();
            triggerDamageVignette();
            updateHUD();
            if (player.hp <= 0) {
              triggerGameOver();
              return;
            }
          }
        }
      } else {
        d.wanderTimer -= dt;
        if (d.wanderTimer <= 0) {
          d.wanderTimer = 1.5 + Math.random() * 2.5;
          d.wanderAng = Math.random() * Math.PI * 2;
        }
        d.yaw = Math.atan2(-Math.cos(d.wanderAng), -Math.sin(d.wanderAng));
        d.x += Math.cos(d.wanderAng) * 1.25 * dt;
        d.z += Math.sin(d.wanderAng) * 1.25 * dt;
      }
      d.x = Math.max(-BOUND + 4, Math.min(BOUND - 4, d.x));
      d.z = Math.max(-BOUND + 4, Math.min(BOUND - 4, d.z));
      updateInstanceMatrix(wolfSys, i);
    }
    commitInstanced(wolfSys);
  }
}

function damageInstanced(sysName, index, baseDmg) {
  const sys = instancedSystems[sysName];
  if (!sys) return;
  const d = sys.data[index];
  if (!d || !d.alive) return;

  const tierInfo = TIERS[player.tier] || TIERS[1];
  const finalDmg = Math.round(baseDmg * tierInfo.dmgMult);
  d.hp -= finalDmg;
  SFX.hit();
  showHitmarker();
  spawnFloatingText(`-${finalDmg}`, '#ffcc00');

  if (d.hp <= 0) {
    d.alive = false;
    updateInstanceMatrix(sys, index);
    commitInstanced(sys);
    const hideGain = (sysName === 'wolf' ? 2 : 1) * tierInfo.gatherBonus;
    resources.hide += hideGain;

    if (sysName === 'wolf') {
      score += 30 + wave * 5;
      gold += 12;
      addXP(25);
      addKillfeed(`🐺 Lobo abatido (+${hideGain} Piel)`);
      spawnLoot(d.x, d.z, 'coin');
    } else if (sysName === 'deer') {
      score += 20;
      gold += 15;
      addXP(15);
      addKillfeed(`🦌 Ciervo cazado (+${hideGain} Piel)`);
      spawnLoot(d.x, d.z, 'coin');
    }
    updateHUD();
  } else {
    updateInstanceMatrix(sys, index);
    commitInstanced(sys);
  }
}

// ============================================================================
// 14. DRAGONES ANCESTRALES VULNERABLES (ESCAMAS DE DRAGÓN DE ALBION)
// ============================================================================
let dragons = [];
let dragonFireballs = [];

function spawnDragons() {
  for (const old of dragons) scene.remove(old.mesh);
  dragons = [];

  for (let i = 0; i < DRAGON_COUNT; i++) {
    const mesh = glbCache.dragon ? glbCache.dragon.clone(true) : createDragonMesh();
    // Vuelan a altura accesible (13 a 17m) para poder apuntarles y liquidarlos
    mesh.position.set(
      -BOUND + 45 + Math.random() * (WORLD_SIZE - 90),
      13 + Math.random() * 4,
      -BOUND + 45 + Math.random() * (WORLD_SIZE - 90)
    );
    scene.add(mesh);

    const hpVal = 750 + wave * 80;
    const dg = {
      mesh,
      title: '🐉 DRAGÓN DE ATENUACIÓN ANCESTRAL 🐉',
      hp: hpVal,
      maxHp: hpVal,
      angle: Math.random() * Math.PI * 2,
      fireCd: 3.0 + Math.random() * 2.0
    };
    mesh.userData.dragonRef = dg;
    dragons.push(dg);
  }
  SFX.dragon();
}

function damageDragon(dg, baseDmg) {
  const tierInfo = TIERS[player.tier] || TIERS[1];
  const finalDmg = Math.round(baseDmg * tierInfo.dmgMult);
  dg.hp -= finalDmg;
  SFX.hit();
  showHitmarker();
  spawnFloatingText(`🐉 -${finalDmg}`, '#ff5500');
  boss = dg;
  updateBossBar();

  if (dg.hp <= 0) {
    scene.remove(dg.mesh);
    dragons = dragons.filter(d => d !== dg);
    const scaleGain = 2 * tierInfo.gatherBonus;
    resources.scales += scaleGain;
    score += 550;
    gold += 180;
    addXP(200);
    SFX.bossDie();
    addKillfeed(`🐉 ¡DRAGÓN ABATIDO! (+${scaleGain} Escamas, +180 Oro)`);
    showMsg(`🐉 ¡DRAGÓN ANCESTRAL LIQUIDADO! +${scaleGain} Escamas`);

    spawnLoot(dg.mesh.position.x, dg.mesh.position.z, 'health');
    spawnLoot(dg.mesh.position.x + 1.5, dg.mesh.position.z, 'weapon:sniper');
    for (let k = 0; k < 12; k++) {
      spawnLoot(dg.mesh.position.x + (Math.random() - 0.5) * 6, dg.mesh.position.z + (Math.random() - 0.5) * 6, 'coin');
    }
    if (boss === dg) boss = null;
    updateBossBar();
    updateHUD();
  }
}

function updateDragons(dt) {
  for (const dg of dragons) {
    dg.angle += dt * 0.38;
    dg.mesh.position.x += Math.cos(dg.angle) * 4.2 * dt;
    dg.mesh.position.z += Math.sin(dg.angle) * 4.2 * dt;
    dg.mesh.rotation.y = -dg.angle;

    const b = BOUND - 25;
    dg.mesh.position.x = Math.max(-b, Math.min(b, dg.mesh.position.x));
    dg.mesh.position.z = Math.max(-b, Math.min(b, dg.mesh.position.z));

    dg.fireCd -= dt;
    const dx = player.position.x - dg.mesh.position.x;
    const dz = player.position.z - dg.mesh.position.z;
    const dd = Math.hypot(dx, dz);

    if (dd < 32 && dg.fireCd <= 0 && !player.inSafeZone) {
      dg.fireCd = 2.6 + Math.random() * 1.5;
      SFX.fire();
      const fb = new THREE.Mesh(
        new THREE.SphereGeometry(0.65, 8, 8),
        new THREE.MeshBasicMaterial({ color: 0xff5500 })
      );
      fb.position.copy(dg.mesh.position);
      scene.add(fb);
      dragonFireballs.push({
        mesh: fb,
        vx: (dx / dd) * 12,
        vy: -7.5,
        vz: (dz / dd) * 12,
        life: 4.0
      });
    }
  }

  for (let i = dragonFireballs.length - 1; i >= 0; i--) {
    const fb = dragonFireballs[i];
    fb.mesh.position.x += fb.vx * dt;
    fb.mesh.position.y += fb.vy * dt;
    fb.mesh.position.z += fb.vz * dt;
    fb.vy -= 12 * dt;
    fb.life -= dt;

    const dx = fb.mesh.position.x - player.position.x;
    const dy = fb.mesh.position.y - 1.2;
    const dz = fb.mesh.position.z - player.position.z;

    if (dx * dx + dy * dy + dz * dz < 1.6 * 1.6 && !player.inSafeZone) {
      player.hp -= 22;
      SFX.hit();
      triggerDamageVignette();
      showMsg('🔥 ¡Fuego de Dragón! -22 HP');
      updateHUD();
      scene.remove(fb.mesh);
      dragonFireballs.splice(i, 1);
      if (player.hp <= 0) {
        triggerGameOver();
        return;
      }
      continue;
    }

    if (fb.life <= 0 || fb.mesh.position.y < 0) {
      scene.remove(fb.mesh);
      dragonFireballs.splice(i, 1);
    }
  }
}

// ============================================================================
// 15. PROYECTILES ENEMIGOS Y BOTÍN (LOOT)
// ============================================================================
let enemyProjectiles = [];
let loot = [];

function spawnEnemyProjectile(from, dir, dmg) {
  const mesh = new THREE.Mesh(
    new THREE.SphereGeometry(0.18, 8, 8),
    new THREE.MeshBasicMaterial({ color: 0xff4444 })
  );
  mesh.position.copy(from);
  scene.add(mesh);
  enemyProjectiles.push({ mesh, velocity: dir.clone().multiplyScalar(21), life: 3.0, damage: dmg });
}

function spawnLoot(x, z, type) {
  let mesh;
  if (type === 'coin') {
    mesh = new THREE.Mesh(
      new THREE.CylinderGeometry(0.26, 0.26, 0.08, 16),
      new THREE.MeshLambertMaterial({ color: 0xffcc00, emissive: 0x664400 })
    );
    mesh.rotation.x = Math.PI / 2;
  } else if (type === 'health') {
    const grp = new THREE.Group();
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.15, 0.15), new THREE.MeshLambertMaterial({ color: 0x2ecc71, emissive: 0x0a3a1a })));
    grp.add(new THREE.Mesh(new THREE.BoxGeometry(0.15, 0.5, 0.15), new THREE.MeshLambertMaterial({ color: 0x2ecc71, emissive: 0x0a3a1a })));
    mesh = grp;
  } else if (type.startsWith('weapon:')) {
    const wn = type.split(':')[1];
    mesh = createWeaponMesh(wn);
    mesh.scale.set(1.8, 1.8, 1.8);
  }
  mesh.position.set(x, 0.6, z);
  mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(mesh);
  loot.push({ mesh, type, life: 35, phase: Math.random() * Math.PI * 2 });
}

// ============================================================================
// 16. RECOLECCIÓN ALBION (MADERA Y MINERAL) Y RESCATE DE REHENES
// ============================================================================
function tryFreeHostage(autoCheck = false) {
  for (const h of hostageObjects) {
    if (h.freed) continue;
    const dx = h.x - player.position.x;
    const dz = h.z - player.position.z;
    const radius = autoCheck ? 3.8 : 5.5;
    if (dx * dx + dz * dz < radius * radius) {
      h.freed = true;
      scene.remove(h.mesh);
      if (h.marker) scene.remove(h.marker);
      score += 85;
      gold += 35;
      addXP(50);
      spawnLoot(h.x, h.z, 'health');
      spawnLoot(h.x + 1, h.z, 'weapon:shotgun');
      SFX.hostage();
      addKillfeed('🛟 Rehén rescatado (+35 Oro, +50 XP)');
      showMsg('🛟 ¡Rehén liberado! +35 Oro y Suministros');
      updateHUD();
      return true;
    }
  }
  return false;
}

function tryInteractOrGather() {
  // 1. Prioridad: Rescatar rehén cercano
  if (tryFreeHostage(false)) return;

  const gatherBonus = (TIERS[player.tier] || TIERS[1]).gatherBonus;

  // 2. Extraer veta de Mineral cercana
  for (const o of oreData) {
    if (o.harvested) continue;
    const dx = o.x - player.position.x;
    const dz = o.z - player.position.z;
    if (dx * dx + dz * dz < 4.2 * 4.2) {
      o.harvested = true;
      o.respawnTimer = 30;
      o.mesh.visible = false;
      const gain = 2 * gatherBonus;
      resources.ore += gain;
      addXP(15);
      SFX.gather();
      spawnFloatingText(`⛏️ +${gain} Mineral`, '#00d2ff');
      updateHUD();
      return;
    }
  }

  // 3. Talar árbol cercano
  for (const t of treeData) {
    if (t.harvested) continue;
    const dx = t.x - player.position.x;
    const dz = t.z - player.position.z;
    if (dx * dx + dz * dz < 4.2 * 4.2) {
      t.harvested = true;
      t.respawnTimer = 25;
      t.mesh.visible = false;
      const gain = 2 * gatherBonus;
      resources.wood += gain;
      addXP(12);
      SFX.gather();
      spawnFloatingText(`🪵 +${gain} Madera`, '#e67e22');
      updateHUD();
      return;
    }
  }

  showMsg('Acércate a un Árbol 🪵, Veta ⛏️ o Rehén para interactuar (Tecla E)');
}

function updateResourceNodes(dt) {
  for (const t of treeData) {
    if (t.harvested) {
      t.respawnTimer -= dt;
      if (t.respawnTimer <= 0) {
        t.harvested = false;
        t.mesh.visible = true;
      }
    }
  }
  for (const o of oreData) {
    if (o.harvested) {
      o.respawnTimer -= dt;
      if (o.respawnTimer <= 0) {
        o.harvested = false;
        o.mesh.visible = true;
      }
    }
  }
}

// ============================================================================
// 17. CONTROLES PC (MOUSE + TECLADO) Y MÓVIL MULTITOUCH
// ============================================================================
const keys = {};
const mouse = { down: false };
let yaw = 0;
let pitch = -0.05;
let lastShotTime = 0;
const raycaster = new THREE.Raycaster();

function setADS(state) {
  player.isADS = state;
  const ch = document.getElementById('crosshair');
  if (ch) ch.classList.toggle('ads', player.isADS);
  const adsBtn = document.getElementById('m-ads');
  if (adsBtn) adsBtn.classList.toggle('active-toggle', player.isADS);
}

function cycleWeapon(dir) {
  let idx = WEAPONS_ORDER.indexOf(player.weapon);
  for (let i = 0; i < WEAPONS_ORDER.length; i++) {
    idx = (idx + dir + WEAPONS_ORDER.length) % WEAPONS_ORDER.length;
    const w = WEAPONS_ORDER[idx];
    if (w === 'pistol' || player.ammo[w] > 0) {
      player.weapon = w;
      updatePlayerWeaponMesh();
      updateHUD();
      return;
    }
  }
}

function selectWeapon(w) {
  if (w === 'pistol' || player.ammo[w] > 0) {
    player.weapon = w;
    updatePlayerWeaponMesh();
    updateHUD();
  } else {
    showMsg('Sin munición para ' + WEAPONS[w].name);
  }
}

document.addEventListener('keydown', e => {
  const k = e.key.toLowerCase();
  keys[k] = true;
  if (k === 'e') tryInteractOrGather();
  else if (k === 'q') cycleWeapon(1);
  else if (k === '1') selectWeapon('pistol');
  else if (k === '2') selectWeapon('shotgun');
  else if (k === '3') selectWeapon('rifle');
  else if (k === '4') selectWeapon('sniper');
  else if (k === 'b') toggleShop();
  else if (k === 'escape') {
    const m = document.getElementById('shop-modal');
    if (m && m.classList.contains('show')) m.classList.remove('show');
  }
});

document.addEventListener('keyup', e => {
  keys[e.key.toLowerCase()] = false;
});

// Bloqueo de puntero y clic derecho ADS en PC
renderer.domElement.addEventListener('contextmenu', e => e.preventDefault());

renderer.domElement.addEventListener('click', () => {
  const shopOpen = document.getElementById('shop-modal')?.classList.contains('show');
  if (!isTouch && running && !gameOver && !shopOpen && document.pointerLockElement !== renderer.domElement) {
    renderer.domElement.requestPointerLock();
  }
});

document.addEventListener('pointerlockchange', () => {
  const crosshair = document.getElementById('crosshair');
  if (document.pointerLockElement === renderer.domElement) {
    crosshair.classList.add('active');
  } else {
    if (!isTouch) crosshair.classList.remove('active');
    mouse.down = false;
    setADS(false);
  }
});

document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === renderer.domElement) {
    const sens = player.isADS ? 0.0012 : 0.0022;
    yaw -= e.movementX * sens;
    pitch -= e.movementY * sens;
    pitch = Math.max(-Math.PI / 2.6, Math.min(Math.PI / 3.2, pitch));
  }
});

document.addEventListener('mousedown', e => {
  if (!running || gameOver || e.target !== renderer.domElement) return;
  if (e.button === 0) mouse.down = true;
  if (e.button === 2) setADS(true);
});

document.addEventListener('mouseup', e => {
  if (e.button === 0) mouse.down = false;
  if (e.button === 2) setADS(false);
});

window.addEventListener('blur', () => {
  mouse.down = false;
  setADS(false);
  for (const k in keys) keys[k] = false;
});

// Controles Móviles Multitáctiles Simultáneos
let moveTouchId = null;
let lookTouchId = null;
const jsBase = document.getElementById('joystick-base');
const jsKnob = document.getElementById('joystick-knob');
let moveStartX = 0, moveStartY = 0;
let lookLastX = 0, lookLastY = 0;

if (isTouch) {
  document.getElementById('mobile-ui').classList.add('active');
  document.getElementById('crosshair').classList.add('active');

  renderer.domElement.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!running || gameOver) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX < innerWidth * 0.45 && moveTouchId === null) {
        moveTouchId = t.identifier;
        moveStartX = t.clientX;
        moveStartY = t.clientY;
        jsBase.style.left = t.clientX + 'px';
        jsBase.style.top = t.clientY + 'px';
        jsBase.classList.add('visible');
      } else if (t.clientX >= innerWidth * 0.45 && lookTouchId === null) {
        lookTouchId = t.identifier;
        lookLastX = t.clientX;
        lookLastY = t.clientY;
      }
    }
  }, { passive: false });

  renderer.domElement.addEventListener('touchmove', e => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveTouchId) {
        let dx = t.clientX - moveStartX;
        let dy = t.clientY - moveStartY;
        const len = Math.hypot(dx, dy);
        const maxLen = 50;
        if (len > maxLen) {
          dx = (dx / len) * maxLen;
          dy = (dy / len) * maxLen;
        }
        jsKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        const nx = dx / maxLen;
        const ny = dy / maxLen;
        keys['w'] = ny < -0.28;
        keys['s'] = ny > 0.28;
        keys['a'] = nx < -0.28;
        keys['d'] = nx > 0.28;
      } else if (t.identifier === lookTouchId) {
        const dx = t.clientX - lookLastX;
        const dy = t.clientY - lookLastY;
        const sens = player.isADS ? 0.0028 : 0.005;
        yaw -= dx * sens;
        pitch -= dy * sens;
        pitch = Math.max(-Math.PI / 2.6, Math.min(Math.PI / 3.2, pitch));
        lookLastX = t.clientX;
        lookLastY = t.clientY;
      }
    }
  }, { passive: false });

  const handleTouchEnd = e => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveTouchId) {
        moveTouchId = null;
        keys['w'] = keys['s'] = keys['a'] = keys['d'] = false;
        jsKnob.style.transform = 'translate(-50%, -50%)';
        jsBase.classList.remove('visible');
      } else if (t.identifier === lookTouchId) {
        lookTouchId = null;
      }
    }
  };

  renderer.domElement.addEventListener('touchend', handleTouchEnd, { passive: false });
  renderer.domElement.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  const fireBtn = document.getElementById('m-fire');
  fireBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); mouse.down = true; }, { passive: false });
  fireBtn.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); mouse.down = false; }, { passive: false });
  fireBtn.addEventListener('touchcancel', e => { e.stopPropagation(); mouse.down = false; }, { passive: false });

  document.getElementById('m-ads').addEventListener('touchstart', e => {
    e.preventDefault();
    e.stopPropagation();
    setADS(!player.isADS);
  }, { passive: false });

  document.getElementById('m-sprint').addEventListener('touchstart', e => {
    e.preventDefault();
    e.stopPropagation();
    keys['shift'] = !keys['shift'];
    e.currentTarget.classList.toggle('active-toggle', keys['shift']);
  }, { passive: false });

  document.getElementById('m-gather').addEventListener('touchstart', e => {
    e.preventDefault();
    e.stopPropagation();
    tryInteractOrGather();
  }, { passive: false });

  document.getElementById('m-switch').addEventListener('touchstart', e => {
    e.preventDefault();
    e.stopPropagation();
    cycleWeapon(1);
  }, { passive: false });

  document.getElementById('m-shop').addEventListener('touchstart', e => {
    e.preventDefault();
    e.stopPropagation();
    toggleShop();
  }, { passive: false });
}

// ============================================================================
// 18. BALÍSTICA TÁCTICA CALL OF DUTY (MIRA ADS + DETECCIÓN DE HEADSHOT)
// ============================================================================
let muzzleLight = null;

function shootOnce() {
  const w = WEAPONS[player.weapon];
  const camDir = new THREE.Vector3();
  camera.getWorldDirection(camDir);
  const camOrigin = camera.position.clone();

  const targets = wallMeshes.slice().concat(enemies.map(e => e.mesh));
  for (const dg of dragons) targets.push(dg.mesh);
  for (const sysName in instancedSystems) {
    for (const part of instancedSystems[sysName].instancedParts) {
      targets.push(part.mesh);
    }
  }

  const camRay = new THREE.Raycaster(camOrigin, camDir, 0.1, 260);
  const camHits = camRay.intersectObjects(targets, true);
  const aimPoint = camHits.length > 0
    ? camHits[0].point.clone()
    : camOrigin.clone().add(camDir.clone().multiplyScalar(120));

  const weaponOrigin = new THREE.Vector3(player.position.x, 1.52, player.position.z);
  const aimDir = aimPoint.clone().sub(weaponOrigin).normalize();
  const activeSpread = player.isADS ? w.adsSpread : w.spread;

  for (let p = 0; p < w.pellets; p++) {
    const dir = aimDir.clone();
    dir.x += (Math.random() - 0.5) * activeSpread * 2;
    dir.y += (Math.random() - 0.5) * activeSpread * 2;
    dir.z += (Math.random() - 0.5) * activeSpread * 2;
    dir.normalize();

    raycaster.set(weaponOrigin, dir);
    raycaster.far = w.range;
    const hits = raycaster.intersectObjects(targets, true);
    let endPoint = weaponOrigin.clone().add(dir.clone().multiplyScalar(w.range));

    if (hits.length > 0) {
      endPoint = hits[0].point.clone();
      const obj = hits[0].object;
      let parent = obj;
      while (parent && !parent.userData.enemyRef && !parent.userData.dragonRef) {
        parent = parent.parent;
      }

      if (parent && parent.userData.enemyRef) {
        const enemy = parent.userData.enemyRef;
        const hitHeight = endPoint.y - enemy.mesh.position.y;
        const isHeadshot = !enemy.isBear && hitHeight > (enemy.height * 0.76);
        damageEnemy(enemy, w.damage, isHeadshot);
      } else if (parent && parent.userData.dragonRef) {
        damageDragon(parent.userData.dragonRef, w.damage);
      } else if (obj.userData.sysName !== undefined && hits[0].instanceId !== undefined) {
        damageInstanced(obj.userData.sysName, hits[0].instanceId, w.damage);
      }
    }
    spawnTracer(weaponOrigin, endPoint);
  }

  player.recoil = Math.min(player.recoil + (player.isADS ? 0.04 : 0.08), 0.16);
  spawnMuzzleFlash(weaponOrigin.clone().add(aimDir.clone().multiplyScalar(0.6)));

  if (player.weapon === 'shotgun') SFX.shotgun();
  else if (player.weapon === 'rifle') SFX.rifle();
  else if (player.weapon === 'sniper') SFX.sniper();
  else SFX.shoot();

  if (player.ammo[player.weapon] !== Infinity) {
    player.ammo[player.weapon]--;
    if (player.ammo[player.weapon] <= 0) {
      player.weapon = 'pistol';
      setADS(false);
    }
    updatePlayerWeaponMesh();
    updateHUD();
  }
}

function spawnTracer(from, to) {
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
  const mat = new THREE.LineBasicMaterial({ color: 0xffeaa7, transparent: true, opacity: 0.9 });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  setTimeout(() => {
    scene.remove(line);
    geo.dispose();
    mat.dispose();
  }, 75);
}

function spawnMuzzleFlash(pos) {
  if (muzzleLight) scene.remove(muzzleLight);
  muzzleLight = new THREE.PointLight(0xffaa33, 3, 5);
  muzzleLight.position.copy(pos);
  scene.add(muzzleLight);
  setTimeout(() => {
    if (muzzleLight) {
      scene.remove(muzzleLight);
      muzzleLight = null;
    }
  }, 60);
}

function showHitmarker() {
  const hm = document.getElementById('hitmarker');
  if (!hm) return;
  hm.classList.add('show');
  clearTimeout(hm._timer);
  hm._timer = setTimeout(() => hm.classList.remove('show'), 120);
}

// ============================================================================
// 19. HUD, RADAR MINIMAPA, MERCADO Y FORJA DE TIERS (ALBION CRAFTING)
// ============================================================================
window.updateHUD = function() {
  recalcPlayerStats();
  document.getElementById('hp').textContent = Math.max(0, Math.ceil(player.hp));
  document.getElementById('maxhp').textContent = player.maxHp;
  document.getElementById('hpfill').style.width = Math.max(0, (player.hp / player.maxHp) * 100) + '%';
  document.getElementById('stamina-fill').style.width = Math.max(0, (player.stamina / player.maxStamina) * 100) + '%';
  document.getElementById('xp-fill').style.width = Math.min(100, (player.xp / player.xpNext) * 100) + '%';
  document.getElementById('lvl').textContent = player.lvl;

  document.getElementById('score').textContent = score;
  document.getElementById('gold').textContent = gold;
  document.getElementById('wave').textContent = wave;

  document.getElementById('res-wood').textContent = resources.wood;
  document.getElementById('res-ore').textContent = resources.ore;
  document.getElementById('res-hide').textContent = resources.hide;
  document.getElementById('res-scales').textContent = resources.scales;

  const w = WEAPONS[player.weapon];
  const ammo = player.ammo[player.weapon];
  document.getElementById('weapon').textContent = `${w.name} T${player.tier} [${ammo === Infinity ? '∞' : ammo}]`;

  document.querySelectorAll('.wslot').forEach(el => {
    const wp = el.dataset.w;
    el.classList.toggle('active', wp === player.weapon);
    el.classList.toggle('empty', wp !== 'pistol' && player.ammo[wp] <= 0);
  });
};

window.updateBossBar = function() {
  const bar = document.getElementById('bossbar');
  if (!bar) return;
  if (boss && boss.hp > 0) {
    bar.style.display = 'block';
    document.getElementById('bossname').textContent = boss.title || '⚠ JEFE DE ZONA / DRAGÓN ⚠';
    document.getElementById('bosshp').style.width = Math.max(0, (boss.hp / boss.maxHp) * 100) + '%';
  } else {
    bar.style.display = 'none';
  }
};

// Radar táctico 2D en tiempo real
const minimapCanvas = document.getElementById('minimap');
const minimapCtx = minimapCanvas ? minimapCanvas.getContext('2d') : null;

function drawMinimap() {
  if (!minimapCtx) return;
  const w = minimapCanvas.width;
  const h = minimapCanvas.height;
  const cx = w / 2;
  const cy = h / 2;
  const scale = 0.85; // 1 metro = 0.85px en el radar

  minimapCtx.fillStyle = '#142411';
  minimapCtx.fillRect(0, 0, w, h);

  // Anillo de barrido táctico
  minimapCtx.strokeStyle = 'rgba(255, 255, 255, 0.12)';
  minimapCtx.beginPath();
  minimapCtx.arc(cx, cy, 35, 0, Math.PI * 2);
  minimapCtx.stroke();
  minimapCtx.beginPath();
  minimapCtx.arc(cx, cy, 65, 0, Math.PI * 2);
  minimapCtx.stroke();

  // Dibujar Refugio Seguro relativo al jugador
  const safeX = cx + (0 - player.position.x) * scale;
  const safeY = cy + (0 - player.position.z) * scale;
  minimapCtx.strokeStyle = '#2ecc71';
  minimapCtx.lineWidth = 1.5;
  minimapCtx.beginPath();
  minimapCtx.arc(safeX, safeY, SAFE_ZONE_RADIUS * scale, 0, Math.PI * 2);
  minimapCtx.stroke();

  // Vetas de mineral cercanas (azul cian)
  minimapCtx.fillStyle = '#00d2ff';
  for (const o of oreData) {
    if (o.harvested) continue;
    const rx = cx + (o.x - player.position.x) * scale;
    const ry = cy + (o.z - player.position.z) * scale;
    if (rx > 4 && rx < w - 4 && ry > 4 && ry < h - 4) {
      minimapCtx.fillRect(rx - 1.5, ry - 1.5, 3, 3);
    }
  }

  // Rehenes no liberados (amarillo)
  minimapCtx.fillStyle = '#ffcc00';
  for (const host of hostageObjects) {
    if (host.freed) continue;
    const rx = cx + (host.x - player.position.x) * scale;
    const ry = cy + (host.z - player.position.z) * scale;
    if (rx > 4 && rx < w - 4 && ry > 4 && ry < h - 4) {
      minimapCtx.beginPath();
      minimapCtx.arc(rx, ry, 3.5, 0, Math.PI * 2);
      minimapCtx.fill();
    }
  }

  // Enemigos (rojo)
  minimapCtx.fillStyle = '#ff3b30';
  for (const e of enemies) {
    const rx = cx + (e.mesh.position.x - player.position.x) * scale;
    const ry = cy + (e.mesh.position.z - player.position.z) * scale;
    if (rx > 4 && rx < w - 4 && ry > 4 && ry < h - 4) {
      minimapCtx.beginPath();
      minimapCtx.arc(rx, ry, e.isBoss ? 4.5 : 2.8, 0, Math.PI * 2);
      minimapCtx.fill();
    }
  }

  // Dragones (naranja brillante)
  minimapCtx.fillStyle = '#ff9500';
  for (const dg of dragons) {
    const rx = cx + (dg.mesh.position.x - player.position.x) * scale;
    const ry = cy + (dg.mesh.position.z - player.position.z) * scale;
    if (rx > 4 && rx < w - 4 && ry > 4 && ry < h - 4) {
      minimapCtx.beginPath();
      minimapCtx.arc(rx, ry, 4.5, 0, Math.PI * 2);
      minimapCtx.fill();
    }
  }

  // Jugador y cono de visión en el centro
  minimapCtx.save();
  minimapCtx.translate(cx, cy);
  minimapCtx.rotate(-yaw);
  minimapCtx.fillStyle = 'rgba(0, 210, 255, 0.2)';
  minimapCtx.beginPath();
  minimapCtx.moveTo(0, 0);
  minimapCtx.arc(0, 0, 28, -Math.PI / 2 - 0.45, -Math.PI / 2 + 0.45);
  minimapCtx.closePath();
  minimapCtx.fill();

  minimapCtx.fillStyle = '#ffffff';
  minimapCtx.beginPath();
  minimapCtx.arc(0, 0, 3.5, 0, Math.PI * 2);
  minimapCtx.fill();
  minimapCtx.restore();
}

const SHOP_ITEMS = [
  { id: 'health', name: 'Botiquín Militar +60 HP', desc: 'Restaura salud inmediata', price: 25, apply: () => { player.hp = Math.min(player.maxHp, player.hp + 60); } },
  { id: 'shotgun', name: 'Escopeta de Combate', desc: 'Incluye 32 cartuchos calibre 12', price: 75, apply: () => { player.ammo.shotgun += 32; player.weapon = 'shotgun'; updatePlayerWeaponMesh(); } },
  { id: 'rifle', name: 'Rifle de Asalto M4', desc: 'Incluye 120 balas automáticas', price: 110, apply: () => { player.ammo.rifle += 120; player.weapon = 'rifle'; updatePlayerWeaponMesh(); } },
  { id: 'sniper', name: 'Francotirador Cal.50', desc: 'Daño letal a larga distancia (15 balas)', price: 160, apply: () => { player.ammo.sniper += 15; player.weapon = 'sniper'; updatePlayerWeaponMesh(); } },
  { id: 'ammoPack', name: 'Caja de Munición Táctica', desc: '+24 Escopeta, +60 Rifle, +8 Francotirador', price: 55, apply: () => { player.ammo.shotgun += 24; player.ammo.rifle += 60; player.ammo.sniper += 8; } }
];

const CRAFT_RECIPES = [
  {
    tier: 2,
    name: 'Equipamiento TIER 2 · Explorador',
    desc: '+25% Daño, +35 Salud Máx, x2 Recolección',
    cost: { gold: 40, wood: 6, ore: 4, hide: 4, scales: 0 }
  },
  {
    tier: 3,
    name: 'Equipamiento TIER 3 · Mercenario',
    desc: '+55% Daño, +80 Salud Máx, x3 Recolección',
    cost: { gold: 100, wood: 14, ore: 10, hide: 10, scales: 0 }
  },
  {
    tier: 4,
    name: 'Equipamiento TIER 4 · Veterano',
    desc: '+95% Daño, +140 Salud Máx, x4 Recolección',
    cost: { gold: 220, wood: 25, ore: 20, hide: 18, scales: 2 }
  },
  {
    tier: 5,
    name: 'Equipamiento TIER 5 · Señor del Éxodo',
    desc: '+150% Daño, +220 Salud Máx, x6 Recolección',
    cost: { gold: 450, wood: 40, ore: 35, hide: 30, scales: 5 }
  }
];

function toggleShop() {
  const m = document.getElementById('shop-modal');
  if (m.classList.contains('show')) {
    m.classList.remove('show');
    if (!isTouch && running && !gameOver) renderer.domElement.requestPointerLock();
    return;
  }
  if (document.pointerLockElement) document.exitPointerLock();
  renderShop();
  m.classList.add('show');
}

function canAffordCraft(c) {
  return gold >= c.gold && resources.wood >= c.wood && resources.ore >= c.ore && resources.hide >= c.hide && resources.scales >= c.scales;
}

function renderShop() {
  document.getElementById('shop-gold').textContent = gold;
  document.getElementById('shop-wood').textContent = resources.wood;
  document.getElementById('shop-ore').textContent = resources.ore;
  document.getElementById('shop-hide').textContent = resources.hide;
  document.getElementById('shop-scales').textContent = resources.scales;

  const cont = document.getElementById('shop-items');
  cont.innerHTML = '';
  for (const item of SHOP_ITEMS) {
    const div = document.createElement('div');
    div.className = 'shop-item';
    div.innerHTML = `<div><div class="name">${item.name}</div><div class="desc">${item.desc}</div></div>`;
    const btn = document.createElement('button');
    btn.textContent = `${item.price} 🟡`;
    btn.disabled = gold < item.price;
    btn.onclick = () => {
      if (gold < item.price) return;
      gold -= item.price;
      item.apply();
      SFX.pickup();
      updateHUD();
      renderShop();
      saveProgress();
    };
    div.appendChild(btn);
    cont.appendChild(div);
  }

  const craftCont = document.getElementById('craft-items');
  craftCont.innerHTML = '';
  for (const rec of CRAFT_RECIPES) {
    const div = document.createElement('div');
    div.className = 'shop-item';
    const costStr = `${rec.cost.gold}🟡 · ${rec.cost.wood}🪵 · ${rec.cost.ore}⛏️ · ${rec.cost.hide}🦌${rec.cost.scales ? ` · ${rec.cost.scales}🐉` : ''}`;
    div.innerHTML = `<div><div class="name">${rec.name}</div><div class="desc">${rec.desc}</div><div class="desc" style="color:#ffcc00">Requiere: ${costStr}</div></div>`;
    const btn = document.createElement('button');
    if (player.tier >= rec.tier) {
      btn.textContent = 'FORJADO ✓';
      btn.disabled = true;
    } else {
      btn.textContent = `Forjar T${rec.tier}`;
      btn.disabled = !canAffordCraft(rec.cost);
      btn.onclick = () => {
        if (!canAffordCraft(rec.cost)) return;
        gold -= rec.cost.gold;
        resources.wood -= rec.cost.wood;
        resources.ore -= rec.cost.ore;
        resources.hide -= rec.cost.hide;
        resources.scales -= rec.cost.scales;
        player.tier = rec.tier;
        recalcPlayerStats();
        player.hp = player.maxHp;
        SFX.craft();
        showMsg(`⚒️ ¡HAS FORJADO ${TIERS[player.tier].name}!`);
        updateHUD();
        renderShop();
        saveProgress();
      };
    }
    div.appendChild(btn);
    craftCont.appendChild(div);
  }
}

document.getElementById('shop-close').onclick = () => {
  document.getElementById('shop-modal').classList.remove('show');
  if (!isTouch && running && !gameOver) renderer.domElement.requestPointerLock();
};

// ============================================================================
// 20. MULTIJUGADOR EN TIEMPO REAL (SUPABASE REALTIME)
// ============================================================================
const myPlayerId = Math.random().toString(36).substring(2, 10);
let mpChannel = null;
const remotePlayers = {};

async function connectMultiplayer() {
  try {
    mpChannel = supabase.channel('loot-shooter-global', {
      config: { broadcast: { self: true }, presence: { key: myPlayerId } }
    });

    mpChannel.on('broadcast', { event: 'move' }, ({ payload }) => {
      if (payload.id === myPlayerId) return;
      let rp = remotePlayers[payload.id];
      if (!rp) {
        const mesh = glbCache.avatar ? glbCache.avatar.clone(true) : createHumanoid(0x00ccff, 0xf0c090, 1);
        mesh.position.set(payload.x, 0, payload.z);
        scene.add(mesh);

        const c = document.createElement('canvas');
        c.width = 256;
        c.height = 64;
        const ctx = c.getContext('2d');
        ctx.font = 'bold 30px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000';
        ctx.fillText(payload.name || 'Agente', 128, 32);
        ctx.fillStyle = '#00d2ff';
        ctx.fillText(payload.name || 'Agente', 128, 30);
        const tex = new THREE.CanvasTexture(c);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
        label.scale.set(2.8, 0.7, 1);
        label.position.y = 2.4;
        mesh.add(label);

        remotePlayers[payload.id] = { mesh, name: payload.name };
      }
      rp.mesh.position.set(payload.x, 0, payload.z);
      rp.mesh.rotation.y = payload.yaw;
    });

    mpChannel.on('presence', { event: 'sync' }, () => {
      const state = mpChannel.presenceState();
      const count = Math.max(1, Object.keys(state).length);
      document.getElementById('mp-online').textContent = count;
    });

    await mpChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED') {
        await mpChannel.track({ name: playerName, tier: player.tier, at: Date.now() });
      }
    });

    setInterval(() => {
      if (mpChannel && running && !gameOver) {
        mpChannel.send({
          type: 'broadcast',
          event: 'move',
          payload: { id: myPlayerId, name: playerName, x: player.position.x, z: player.position.z, yaw }
        });
      }
    }, 110);
  } catch (e) {
    console.warn('Multijugador en modo local:', e);
  }
}

// ============================================================================
// 21. BUCLE PRINCIPAL DE JUEGO, ZONA SEGURA Y REINICIO
// ============================================================================
function randomFreePos(minDist) {
  for (let t = 0; t < 40; t++) {
    const ang = Math.random() * Math.PI * 2;
    const d = Math.max(minDist, SAFE_ZONE_RADIUS + 6) + Math.random() * 55;
    const x = Math.cos(ang) * d;
    const z = Math.sin(ang) * d;
    if (Math.abs(x) > BOUND - 6 || Math.abs(z) > BOUND - 6) continue;
    if (checkCollision(x, z, 1.5)) continue;
    return { x, z };
  }
  return { x: BOUND * 0.65, z: BOUND * 0.65 };
}

function spawnEnemyRandom() {
  const p = randomFreePos(32);
  spawnEnemy(p.x, p.z);
}

function spawnBearRandom() {
  const p = randomFreePos(38);
  spawnBear(p.x, p.z);
}

function spawnWavePickups() {
  const p1 = randomFreePos(18);
  spawnLoot(p1.x, p1.z, 'weapon:' + (Math.random() < 0.5 ? 'shotgun' : 'rifle'));
  const p2 = randomFreePos(18);
  spawnLoot(p2.x, p2.z, 'health');
}

function reset() {
  for (const e of enemies) scene.remove(e.mesh);
  for (const l of loot) scene.remove(l.mesh);
  for (const p of enemyProjectiles) scene.remove(p.mesh);
  for (const fb of dragonFireballs) scene.remove(fb.mesh);
  for (const h of hostageObjects) {
    scene.remove(h.mesh);
    if (h.marker) scene.remove(h.marker);
  }
  enemies = [];
  loot = [];
  enemyProjectiles = [];
  dragonFireballs = [];
  boss = null;

  generateWorld();
  if (!grassMesh) createGrassField(isTouch ? 3500 : 7500);
  initInstancedSystems();

  recalcPlayerStats();
  player.position.set(0, 0, 0);
  player.hp = player.maxHp;
  player.stamina = player.maxStamina;
  player.weapon = 'pistol';
  player.recoil = 0;
  setADS(false);
  yaw = 0;
  pitch = -0.05;

  buildPlayer();
  updatePlayerWeaponMesh();

  wave = 1;
  waveTimer = 0;
  spawnTimer = 0;
  bearSpawnTimer = 0;
  gameOver = false;

  for (let i = 0; i < DEER_COUNT; i++) {
    const p = randomFreePos(28);
    spawnInstanced('deer', p.x, p.z, 30);
  }
  for (let i = 0; i < WOLF_COUNT; i++) {
    const p = randomFreePos(34);
    spawnInstanced('wolf', p.x, p.z, 65);
  }
  for (let i = 0; i < 6; i++) spawnEnemyRandom();
  spawnDragons();
  spawnWavePickups();
  updateHUD();
  updateBossBar();
}

function update(dt, t) {
  if (grassMaterial && grassMaterial.userData.shader) {
    grassMaterial.userData.shader.uniforms.uTime.value = t;
  }
  if (!running || gameOver) return;

  // Verificar si el jugador está dentro del Refugio Seguro Central (Albion Safe Zone)
  const distFromCenter = Math.hypot(player.position.x, player.position.z);
  const wasSafe = player.inSafeZone;
  player.inSafeZone = distFromCenter <= SAFE_ZONE_RADIUS;
  if (wasSafe !== player.inSafeZone) {
    const zEl = document.getElementById('zone-indicator');
    if (zEl) {
      if (player.inSafeZone) {
        zEl.textContent = '🛡️ ZONA SEGURA (REFUGIO CENTRAL)';
        zEl.className = 'zone-safe';
      } else {
        zEl.textContent = '💀 ZONA ROJA SALVAJE (PELIGRO LETAL)';
        zEl.className = 'zone-danger';
      }
    }
  }
  // En la Zona Segura regeneras vida suavemente
  if (player.inSafeZone && player.hp < player.maxHp) {
    player.hp = Math.min(player.maxHp, player.hp + dt * 4);
  }

  // Movimiento y Sprint Táctico con Estamina
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw));
  const right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw));
  const moveDir = new THREE.Vector3();
  if (keys['w'] || keys['arrowup']) moveDir.add(fwd);
  if (keys['s'] || keys['arrowdown']) moveDir.sub(fwd);
  if (keys['d'] || keys['arrowright']) moveDir.add(right);
  if (keys['a'] || keys['arrowleft']) moveDir.sub(right);

  const wantsSprint = keys['shift'] && moveDir.lengthSq() > 0 && !player.isADS;
  if (wantsSprint && player.stamina > 5) {
    player.isSprinting = true;
    player.stamina = Math.max(0, player.stamina - dt * 22);
  } else {
    player.isSprinting = false;
    player.stamina = Math.min(player.maxStamina, player.stamina + dt * 16);
  }

  if (moveDir.lengthSq() > 0) {
    moveDir.normalize();
    const currentSpeed = PLAYER_SPEED * (player.isSprinting ? SPRINT_MULTIPLIER : (player.isADS ? 0.65 : 1.0));
    const dx = moveDir.x * currentSpeed * dt;
    const dz = moveDir.z * currentSpeed * dt;
    if (!checkCollision(player.position.x + dx, player.position.z, PLAYER_RADIUS)) player.position.x += dx;
    if (!checkCollision(player.position.x, player.position.z + dz, PLAYER_RADIUS)) player.position.z += dz;
    player.swayPhase += dt * (player.isSprinting ? 13 : 8);
  }

  // Rescate automático al pasar junto a un rehén
  tryFreeHostage(true);
  updateResourceNodes(dt);

  playerMesh.position.copy(player.position);
  playerMesh.rotation.y = yaw;
  const swayX = Math.sin(player.swayPhase) * (player.isADS ? 0.002 : 0.01);
  playerGunGroup.position.x = (player.isADS ? 0.08 : 0.28) + swayX;
  player.recoil = Math.max(0, player.recoil - dt * 0.85);

  lastShotTime += dt;
  if (mouse.down && lastShotTime >= WEAPONS[player.weapon].cooldown && player.ammo[player.weapon] > 0) {
    lastShotTime = 0;
    shootOnce();
  }

  // Zoom dinámico de cámara (FOV ADS estilo Call of Duty)
  const targetFov = player.isADS ? WEAPONS[player.weapon].adsFov : (player.isSprinting ? 78 : 72);
  if (Math.abs(camera.fov - targetFov) > 0.1) {
    camera.fov += (targetFov - camera.fov) * Math.min(1, dt * 12);
    camera.updateProjectionMatrix();
  }

  const camDir = new THREE.Vector3(
    -Math.sin(yaw) * Math.cos(pitch),
    Math.sin(pitch),
    -Math.cos(yaw) * Math.cos(pitch)
  );
  const shoulderOffset = player.isADS ? 0.35 : 0.7;
  const shoulder = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(shoulderOffset);
  const camDist = player.isADS ? 2.4 : 4.4;
  const camPos = new THREE.Vector3(
    player.position.x,
    player.position.y + 1.7 + player.recoil * 0.5,
    player.position.z
  ).add(camDir.clone().multiplyScalar(-camDist)).add(shoulder);

  if (camPos.y < 0.5) camPos.y = 0.5;
  camera.position.lerp(camPos, 1 - Math.pow(0.0005, dt));
  camera.lookAt(
    new THREE.Vector3(
      player.position.x,
      player.position.y + 1.7 + player.recoil * 0.5,
      player.position.z
    ).add(shoulder).add(camDir)
  );

  sun.position.set(player.position.x + 30, 60, player.position.z + 20);
  sun.target.position.set(player.position.x, 0, player.position.z);
  sun.target.updateMatrixWorld();

  // IA de Enemigos Individuales
  for (const e of enemies) {
    const dx = player.position.x - e.mesh.position.x;
    const dz = player.position.z - e.mesh.position.z;
    const d = Math.hypot(dx, dz);

    if (e.isBear) {
      if (d < 16 && !player.inSafeZone) {
        e.alert = true;
        e.lastSeenX = player.position.x;
        e.lastSeenZ = player.position.z;
        e.lastSeenTime = 0;
        e.mesh.rotation.y = Math.atan2(-dx, -dz);
        if (d > 1.8) {
          const nx = e.mesh.position.x + (dx / d) * e.speed * dt;
          const nz = e.mesh.position.z + (dz / d) * e.speed * dt;
          if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
          if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
        } else {
          e.lastBite += dt;
          if (e.lastBite >= e.meleeCd) {
            e.lastBite = 0;
            player.hp -= 18;
            SFX.hit();
            triggerDamageVignette();
            showMsg('🐻 ¡Zarpazo de Oso! -18 HP');
            updateHUD();
            if (player.hp <= 0) {
              triggerGameOver();
              return;
            }
          }
        }
      } else {
        e.alert = false;
        e.wanderTimer -= dt;
        if (e.wanderTimer <= 0) {
          e.wanderTimer = 2 + Math.random() * 3;
          e.wanderAng = Math.random() * Math.PI * 2;
        }
        e.mesh.rotation.y = Math.atan2(-Math.cos(e.wanderAng), -Math.sin(e.wanderAng));
        const nx = e.mesh.position.x + Math.cos(e.wanderAng) * e.speed * 0.4 * dt;
        const nz = e.mesh.position.z + Math.sin(e.wanderAng) * e.speed * 0.4 * dt;
        if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
        if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
      }
      continue;
    }

    const sees = enemySeesPlayer(e);
    if (sees) {
      e.alert = true;
      e.lastSeenX = player.position.x;
      e.lastSeenZ = player.position.z;
      e.lastSeenTime = 0;
      e.mesh.rotation.y = Math.atan2(-dx, -dz);
    } else {
      e.lastSeenTime += dt;
    }

    if (e.alert && e.lastSeenTime < 6 && !player.inSafeZone) {
      const tdx = e.lastSeenX - e.mesh.position.x;
      const tdz = e.lastSeenZ - e.mesh.position.z;
      const td = Math.hypot(tdx, tdz);
      if (td > (e.isBoss ? 12 : 7)) {
        const nx = e.mesh.position.x + (tdx / td) * e.speed * dt;
        const nz = e.mesh.position.z + (tdz / td) * e.speed * dt;
        if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
        if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
        e.mesh.rotation.y = Math.atan2(-tdx, -tdz);
      } else if (sees) {
        const perpAng = Math.atan2(tdz, tdx) + (Math.PI / 2) * e.strafeDir;
        const nx = e.mesh.position.x + Math.cos(perpAng) * e.speed * 0.6 * dt;
        const nz = e.mesh.position.z + Math.sin(perpAng) * e.speed * 0.6 * dt;
        if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
        if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
        if (Math.random() < 0.01) e.strafeDir *= -1;
      }

      if (sees) {
        e.lastShot += dt;
        if (e.lastShot >= e.shootCd) {
          e.lastShot = 0;
          const origin = new THREE.Vector3(e.mesh.position.x, 1.3, e.mesh.position.z);
          const dir = new THREE.Vector3(dx, 0, dz).normalize();
          if (e.isBoss) {
            for (let k = -1; k <= 1; k++) {
              const ang = Math.atan2(dir.z, dir.x) + k * 0.15;
              spawnEnemyProjectile(origin, new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), 14);
            }
          } else {
            spawnEnemyProjectile(origin, dir, 9);
          }
          SFX.enemyShoot();
        }
      }
    } else {
      e.alert = false;
      e.wanderTimer -= dt;
      if (e.wanderTimer <= 0) {
        e.wanderTimer = 1.5 + Math.random() * 2.5;
        e.wanderAng = Math.random() * Math.PI * 2;
      }
      e.mesh.rotation.y = Math.atan2(-Math.cos(e.wanderAng), -Math.sin(e.wanderAng));
      const nx = e.mesh.position.x + Math.cos(e.wanderAng) * e.speed * 0.35 * dt;
      const nz = e.mesh.position.z + Math.sin(e.wanderAng) * e.speed * 0.35 * dt;
      if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
      if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
    }
  }

  updateInstancedAI(dt);
  updateDragons(dt);

  // Colisión de proyectiles enemigos
  for (let i = enemyProjectiles.length - 1; i >= 0; i--) {
    const p = enemyProjectiles[i];
    p.mesh.position.addScaledVector(p.velocity, dt);
    p.life -= dt;
    const pdx = p.mesh.position.x - player.position.x;
    const pdy = p.mesh.position.y - 1.2;
    const pdz = p.mesh.position.z - player.position.z;
    if (pdx * pdx + pdy * pdy + pdz * pdz < 0.65 * 0.65 && !player.inSafeZone) {
      player.hp -= p.damage;
      SFX.hit();
      triggerDamageVignette();
      scene.remove(p.mesh);
      enemyProjectiles.splice(i, 1);
      updateHUD();
      if (player.hp <= 0) {
        triggerGameOver();
        return;
      }
      continue;
    }
    if (p.life <= 0 || p.mesh.position.y < 0) {
      scene.remove(p.mesh);
      enemyProjectiles.splice(i, 1);
    }
  }

  // Recolección de botín en el suelo
  for (let i = loot.length - 1; i >= 0; i--) {
    const l = loot[i];
    l.life -= dt;
    l.mesh.rotation.y += dt * 2.2;
    l.mesh.position.y = 0.6 + Math.sin(t * 3 + l.phase) * 0.15;
    const ldx = l.mesh.position.x - player.position.x;
    const ldz = l.mesh.position.z - player.position.z;
    if (ldx * ldx + ldz * ldz < 1.8 * 1.8) {
      if (l.type === 'coin') {
        score += 10;
        gold += 10;
        addXP(8);
        SFX.pickup();
        spawnFloatingText('+10 Oro 🟡', '#ffcc00');
      } else if (l.type === 'health') {
        player.hp = Math.min(player.maxHp, player.hp + 45);
        SFX.health();
        spawnFloatingText('+45 HP ❤️', '#2ecc71');
      } else if (l.type.startsWith('weapon:')) {
        const wn = l.type.split(':')[1];
        player.weapon = wn;
        player.ammo[wn] = (player.ammo[wn] || 0) + WEAPONS[wn].maxAmmo;
        updatePlayerWeaponMesh();
        SFX.pickup();
        showMsg(`🔫 ${WEAPONS[wn].name} equipada`);
      }
      scene.remove(l.mesh);
      loot.splice(i, 1);
      updateHUD();
      continue;
    }
    if (l.life <= 0) {
      scene.remove(l.mesh);
      loot.splice(i, 1);
    }
  }

  for (const h of hostageObjects) {
    if (!h.freed && h.marker) {
      h.marker.position.y = 2.6 + Math.sin(t * 3) * 0.15;
    }
  }

  // Control de Oleadas
  spawnTimer += dt;
  const normalCount = enemies.filter(e => !e.isBoss && !e.isBear).length;
  const maxEnemies = Math.min(22, 10 + Math.floor(wave / 2));
  if (spawnTimer > 2.4 && normalCount < maxEnemies) {
    spawnTimer = 0;
    spawnEnemyRandom();
  }

  bearSpawnTimer += dt;
  const bearCount = enemies.filter(e => e.isBear).length;
  if (bearSpawnTimer > 14 && bearCount < 4 && wave >= 2) {
    bearSpawnTimer = 0;
    spawnBearRandom();
  }

  waveTimer += dt;
  if (waveTimer > 42) {
    waveTimer = 0;
    wave++;
    saveProgress();
    showMsg(`🔥 ¡OLEADA ${wave} INICIADA!`);
    updateHUD();
    spawnWavePickups();
    if (BOSS_WAVES.includes(wave) && !boss) {
      const p = randomFreePos(30);
      spawnBoss(p.x, p.z);
    }
    if (BEAR_WAVES.includes(wave)) spawnBearRandom();
    if (dragons.length < 2) spawnDragons();
  }

  // Actualizar barras continuas y radar
  document.getElementById('stamina-fill').style.width = Math.max(0, (player.stamina / player.maxStamina) * 100) + '%';
  document.getElementById('hp').textContent = Math.max(0, Math.ceil(player.hp));
  document.getElementById('hpfill').style.width = Math.max(0, (player.hp / player.maxHp) * 100) + '%';
  drawMinimap();
}

window.triggerGameOver = function() {
  gameOver = true;
  SFX.gameover();
  if (document.pointerLockElement) document.exitPointerLock();

  // Penalización suave estilo Albion (pierdes solo el 15% del oro en Zona Roja, pero conservas tu Tier y Armas)
  const lostGold = Math.floor(gold * 0.15);
  gold = Math.max(0, gold - lostGold);
  saveProgress();

  const ov = document.getElementById('overlay');
  ov.innerHTML = `
    <h1 style="color:#e74c3c">CAÍSTE EN LA ZONA ROJA</h1>
    <p>Agente: <b style="color:#2ecc71">${playerName}</b> · <b style="color:#f1c40f">${TIERS[player.tier].name}</b></p>
    <p>Puntuación: <b style="color:#ffcc00">${score}</b> · Nivel: <b style="color:#00d2ff">${player.lvl}</b></p>
    <p>Oro Recuperado en el Refugio: <b style="color:#ffcc00">${gold}</b> 🟡 <span style="font-size:12px;color:#ff6b6b">(-${lostGold} saqueado)</span></p>
    <p>Recursos a salvo: 🪵 ${resources.wood} · ⛏️ ${resources.ore} · 🦌 ${resources.hide} · 🐉 ${resources.scales}</p>
    <p style="font-size: 12px; color: #2ecc71; margin-top: 6px;">✓ Tu progreso, Nivel y Equipamiento Tier han sido guardados.</p>
    <button id="restartBtn">REAPARECER EN EL REFUGIO CENTRAL</button>
  `;
  ov.style.display = 'flex';
  document.getElementById('restartBtn').onclick = () => {
    ov.style.display = 'none';
    reset();
    running = true;
    if (!isTouch) renderer.domElement.requestPointerLock();
  };
};

document.getElementById('startBtn').onclick = async () => {
  const btn = document.getElementById('startBtn');
  btn.textContent = 'DESPLEGANDO EN EL VALLE...';
  btn.disabled = true;
  await loadOptionalGLB();
  document.getElementById('overlay').style.display = 'none';
  reset();
  running = true;
  if (!isTouch) renderer.domElement.requestPointerLock();
  connectMultiplayer();
};

// Autoguardado periódico cada 20 segundos
setInterval(() => {
  if (running && !gameOver) saveProgress();
}, 20000);

let last = performance.now();
function loop(now) {
  const dt = Math.min(DT_CAP, (now - last) / 1000);
  last = now;
  const t = now / 1000;
  update(dt, t);
  renderer.render(scene, camera);
  requestAnimationFrame(loop);
}

requestAnimationFrame(loop);
