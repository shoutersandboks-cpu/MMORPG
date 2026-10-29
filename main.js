import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { createClient } from '@supabase/supabase-js';

// ============ CONFIG & SUPABASE ============
const SUPABASE_URL = 'https://yvaizvkoneqqhqkqftcn.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QG8X26MRcrGwpWoT7B6odw_VaQpr72j';
const R2_URL = 'https://pub-44db97c536044e3ab6a203cf451fb50d.r2.dev';
const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

const WORLD_SIZE = 400;
const PLAYER_SPEED = 8;
const PLAYER_RADIUS = 0.45;
const DT_CAP = 0.05;
const BOSS_WAVES = [3, 6, 9, 12];
const BEAR_WAVES = [2, 4, 7, 10];
const WOLF_WAVES = [2, 5, 8, 11];
const DEER_COUNT = 150;
const WOLF_COUNT = 150;
const DRAGON_COUNT = 4;

const WEAPONS_ORDER = ['pistol', 'shotgun', 'rifle'];
const WEAPONS = {
  pistol:  { name:'Pistola',  cooldown:0.22, pellets:1, spread:0.008, damage:18, maxAmmo:Infinity, range:80 },
  shotgun: { name:'Escopeta', cooldown:0.60, pellets:7, spread:0.10,  damage:9,  maxAmmo:24,       range:25 },
  rifle:   { name:'Rifle',    cooldown:0.09, pellets:1, spread:0.020, damage:11, maxAmmo:100,      range:120 }
};

const isTouch = 'ontouchstart' in window || navigator.maxTouchPoints > 0;

// ============ ESTADO Y GUARDADO ============
let currentUser = null;
let isGuest = true;
let score = 0, gold = 0, wave = 1;
let playerName = 'Invitado';

async function saveProgress() {
  if (isGuest || !currentUser) return;
  try {
    const { error } = await supabase.from('profiles').update({
      gold: gold,
      score: Math.max(score, currentUser.score || 0) 
    }).eq('id', currentUser.id);
    if (!error) document.getElementById('save-status').textContent = 'Partida guardada';
  } catch (err) { console.error('Error guardando:', err); }
}

// ============ AUTENTICACIÓN UI ============
const authEmail = document.getElementById('auth-email');
const authPass = document.getElementById('auth-password');
const authError = document.getElementById('auth-error');
const authSection = document.getElementById('auth-section');
const startSection = document.getElementById('start-section');
const welcomeName = document.getElementById('welcome-name');

function showAuthError(msg) {
  authError.textContent = msg;
  authError.style.display = 'block';
}

document.getElementById('registerBtn').onclick = async () => {
  if(!authEmail.value || !authPass.value) return showAuthError('Ingresa correo y contraseña');
  const { data, error } = await supabase.auth.signUp({ email: authEmail.value, password: authPass.value });
  if (error) showAuthError(error.message);
  else {
    showAuthError('¡Registro exitoso! Ya puedes iniciar sesión.');
    authError.style.color = '#2ecc71';
  }
};

document.getElementById('loginBtn').onclick = async () => {
  if(!authEmail.value || !authPass.value) return showAuthError('Ingresa correo y contraseña');
  const { data, error } = await supabase.auth.signInWithPassword({ email: authEmail.value, password: authPass.value });
  if (error) return showAuthError('Credenciales inválidas.');
  
  currentUser = data.user;
  isGuest = false;
  playerName = currentUser.email.split('@')[0];
  
  // Cargar datos del perfil
  const { data: profile } = await supabase.from('profiles').select('gold, score, username').eq('id', currentUser.id).single();
  if (profile) {
    gold = profile.gold || 0;
    if(profile.username) playerName = profile.username;
  } else {
    // Si no tiene perfil, lo creamos
    await supabase.from('profiles').insert([{ id: currentUser.id, username: playerName, gold: 0, score: 0 }]);
  }
  
  document.getElementById('profile-name').textContent = playerName;
  authSection.style.display = 'none';
  welcomeName.textContent = playerName;
  startSection.style.display = 'block';
};

document.getElementById('playGuestBtn').onclick = () => {
  isGuest = true;
  playerName = 'Agente_' + Math.floor(Math.random()*1000);
  document.getElementById('profile-name').textContent = playerName;
  authSection.style.display = 'none';
  welcomeName.textContent = playerName + ' (Invitado)';
  startSection.style.display = 'block';
};

// ============ AUDIO ============
let audioCtx = null;
function ensureAudio(){ if(!audioCtx){ try{audioCtx = new (window.AudioContext||window.webkitAudioContext)();}catch(e){} } }
function beep(f,d,type='square',v=0.05,slide=null){
  if(!audioCtx) return;
  try{
    const t=audioCtx.currentTime, o=audioCtx.createOscillator(), g=audioCtx.createGain();
    o.type=type; o.frequency.setValueAtTime(f,t);
    if(slide) o.frequency.exponentialRampToValueAtTime(Math.max(20,slide), t+d);
    g.gain.setValueAtTime(v,t); g.gain.exponentialRampToValueAtTime(0.001,t+d);
    o.connect(g).connect(audioCtx.destination); o.start(t); o.stop(t+d+0.02);
  }catch(e){}
}
const SFX = {
  shoot:()=>beep(900,0.06,'square',0.05,200),
  shotgun:()=>beep(300,0.12,'sawtooth',0.07,100),
  rifle:()=>beep(1200,0.04,'square',0.04,400),
  enemyShoot:()=>beep(240,0.08,'sawtooth',0.04,100),
  hit:()=>beep(180,0.05,'square',0.05),
  death:()=>beep(400,0.18,'sawtooth',0.06,80),
  pickup:()=>{beep(660,0.08,'sine',0.06);setTimeout(()=>beep(990,0.1,'sine',0.05),60);},
  health:()=>{beep(440,0.12,'sine',0.07);setTimeout(()=>beep(880,0.15,'sine',0.06),100);},
  hostage:()=>{beep(523,0.1,'sine',0.07);setTimeout(()=>beep(784,0.1,'sine',0.07),100);setTimeout(()=>beep(1047,0.2,'sine',0.07),200);},
  boss:()=>beep(80,0.5,'sawtooth',0.09,40),
  bossDie:()=>{beep(150,0.3,'sawtooth',0.09,60);setTimeout(()=>beep(100,0.5,'sawtooth',0.09,40),200);},
  bear:()=>beep(120,0.4,'sawtooth',0.08,50),
  wolf:()=>beep(320,0.3,'sawtooth',0.06,180),
  dragon:()=>beep(60,0.6,'sawtooth',0.09,30),
  fire:()=>beep(200,0.25,'sawtooth',0.06,80),
  gameover:()=>beep(200,0.8,'sawtooth',0.09,50)
};
document.addEventListener('click', ensureAudio, {once:true});
document.addEventListener('keydown', ensureAudio, {once:true});

// ============ MOTOR GRÁFICO (THREE.JS) ============
const renderer = new THREE.WebGLRenderer({antialias:true});
renderer.setPixelRatio(Math.min(window.devicePixelRatio, isTouch ? 1 : 1.5));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
document.body.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87CEEB);
scene.fog = new THREE.Fog(0x87CEEB, 60, 220);
const camera = new THREE.PerspectiveCamera(72, innerWidth/innerHeight, 0.1, 400);

const ambient = new THREE.AmbientLight(0xffffff, 0.55);
scene.add(ambient);
const sun = new THREE.DirectionalLight(0xfff3c4, 1.1);
sun.castShadow = true;
sun.shadow.mapSize.set(isTouch ? 1024 : 2048, isTouch ? 1024 : 2048);
sun.shadow.camera.left = -50; sun.shadow.camera.right = 50;
sun.shadow.camera.top = 50; sun.shadow.camera.bottom = -50;
sun.shadow.camera.near = 1; sun.shadow.camera.far = 200;
sun.shadow.bias = -0.0005;
scene.add(sun); scene.add(sun.target);

addEventListener('resize', () => {
  camera.aspect = innerWidth/innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

// ============ TEXTURAS ============
function makeGrassTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 256;
  const x = c.getContext('2d');
  x.fillStyle = '#3d6b28'; x.fillRect(0,0,256,256);
  for(let i=0;i<4000;i++){
    const px=Math.random()*256, py=Math.random()*256, g=50+Math.random()*70;
    x.fillStyle = `rgb(${20+Math.random()*25},${g},${15+Math.random()*25})`;
    x.fillRect(px,py,1.5,1.5);
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(60,60);
  t.anisotropy = renderer.capabilities.getMaxAnisotropy(); return t;
}
function makeWoodTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 128;
  const x = c.getContext('2d');
  x.fillStyle = '#8B6B47'; x.fillRect(0,0,128,128);
  for(let i=0;i<20;i++){
    x.strokeStyle = `rgba(50,25,10,${0.1+Math.random()*0.2})`;
    x.lineWidth = 1+Math.random();
    x.beginPath(); x.moveTo(0, Math.random()*128); x.lineTo(128, Math.random()*128); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(2,2); return t;
}
function makeBarkTexture(){
  const c = document.createElement('canvas'); c.width = c.height = 64;
  const x = c.getContext('2d');
  x.fillStyle = '#4a2e1a'; x.fillRect(0,0,64,64);
  for(let i=0;i<20;i++){
    x.strokeStyle = `rgba(30,15,5,${0.2+Math.random()*0.3})`;
    x.lineWidth = 1+Math.random()*1.5; const px = Math.random()*64;
    x.beginPath(); x.moveTo(px, 0); x.lineTo(px + (Math.random()-0.5)*8, 64); x.stroke();
  }
  const t = new THREE.CanvasTexture(c); t.wrapS = t.wrapT = THREE.RepeatWrapping; return t;
}

const woodMat = new THREE.MeshLambertMaterial({ map: makeWoodTexture() });
const barkMat = new THREE.MeshLambertMaterial({ map: makeBarkTexture() });
const concreteMat = new THREE.MeshLambertMaterial({ color: 0x6b6b6b });
const roofMat = new THREE.MeshLambertMaterial({ color: 0x3a1e14 });
const leafMats = [
  new THREE.MeshLambertMaterial({ color: 0x2d5016 }), new THREE.MeshLambertMaterial({ color: 0x3a6b1f }),
  new THREE.MeshLambertMaterial({ color: 0x1f3a10 }), new THREE.MeshLambertMaterial({ color: 0x4a7a2a })
];

// ============ GENERACIÓN DE MUNDO ============
const groundGeo = new THREE.PlaneGeometry(WORLD_SIZE, WORLD_SIZE);
const groundMat = new THREE.MeshLambertMaterial({ map: makeGrassTexture() });
const ground = new THREE.Mesh(groundGeo, groundMat);
ground.rotation.x = -Math.PI/2; ground.receiveShadow = true; scene.add(ground);

const BOUND = WORLD_SIZE/2;
const boundaryMat = new THREE.MeshLambertMaterial({ color: 0x2a3d1e, transparent:true, opacity:0.0 });
const boundaryBoxes = [];
function addBoundary(x,z,w,d){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,5,d), boundaryMat);
  m.position.set(x,2.5,z); scene.add(m); boundaryBoxes.push(new THREE.Box3().setFromObject(m));
}
addBoundary(0, -BOUND, WORLD_SIZE, 2); addBoundary(0, BOUND, WORLD_SIZE, 2);
addBoundary(-BOUND, 0, 2, WORLD_SIZE); addBoundary(BOUND, 0, 2, WORLD_SIZE);

const wallMeshes = [], wallBoxes = [], buildings = [], hostageObjects = [], treeData = [];
function addWallMesh(x, y, z, w, h, d, mat){
  const m = new THREE.Mesh(new THREE.BoxGeometry(w,h,d), mat);
  m.position.set(x, y, z); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  wallMeshes.push(m);
  const box = new THREE.Box3().setFromObject(m);
  box.max.y = 2.5; // Tope para no chocar con techos bajos
  wallBoxes.push(box); return m;
}

// ============ R2 GLB LOADER ============
const glbLoader = new GLTFLoader();
const glbCache = { avatar: null, dragon: null };

async function tryLoadGLB(filename){
  return new Promise(resolve => {
    glbLoader.load(`${R2_URL}/${filename}`, gltf => resolve(gltf.scene), undefined, () => resolve(null));
  });
}
async function loadOptionalGLB(){
  try {
    const results = await Promise.allSettled([ tryLoadGLB('avatar.glb'), tryLoadGLB('DragonAttenuation.glb') ]);
    glbCache.avatar = results[0].status === 'fulfilled' ? results[0].value : null;
    glbCache.dragon = results[1].status === 'fulfilled' ? results[1].value : null;
  } catch(e){ console.warn('GLB load failed:', e); }
}
// ============ PLAYER ============
let playerMesh, playerGunGroup;
const player = { position: new THREE.Vector3(0,0,0), hp: 100, maxHp: 100, lvl: 1, weapon: 'pistol', ammo: { pistol: Infinity, shotgun: 0, rifle: 0 }, recoil: 0, swayPhase: 0 };

function buildPlayer(){
  if (glbCache.avatar){
    playerMesh = glbCache.avatar.clone();
    playerMesh.scale.set(1,1,1);
    playerMesh.traverse(c => { if (c.isMesh) c.castShadow = true; });
  } else {
    // Fallback: Avatar de bloques básico si no carga de R2
    const g = new THREE.Group();
    const mat = new THREE.MeshLambertMaterial({ color: 0x3498db });
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), mat);
    torso.position.y = 1.25; torso.castShadow = true; g.add(torso);
    playerMesh = g;
  }
  playerMesh.position.copy(player.position);
  scene.add(playerMesh);
  playerGunGroup = new THREE.Group();
  playerGunGroup.position.set(0.28, 1.25, -0.28);
  playerMesh.add(playerGunGroup);
  updatePlayerWeaponMesh();
}

function updatePlayerWeaponMesh(){
  while (playerGunGroup.children.length) playerGunGroup.remove(playerGunGroup.children[0]);
  
  const g = new THREE.Group();
  const black = new THREE.MeshLambertMaterial({ color: 0x1a1a1a });
  const metal = new THREE.MeshLambertMaterial({ color: 0x555555 });
  
  if (player.weapon === 'pistol'){
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.28), black); body.position.set(0, 0, -0.14); g.add(body);
  } else if (player.weapon === 'shotgun'){
    const barrel = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.65, 10), metal);
    barrel.rotation.x = Math.PI/2; barrel.position.set(0, 0.02, -0.55); g.add(barrel);
  } else if (player.weapon === 'rifle'){
    const body = new THREE.Mesh(new THREE.BoxGeometry(0.07, 0.1, 0.65), black); body.position.set(0, 0, -0.25); g.add(body);
  }
  playerGunGroup.add(g);
}

// ============ ENEMIES (Humanos, Osos, Jefes) ============
let enemies = [];
let boss = null;
let waveTimer = 0, spawnTimer = 0, bearSpawnTimer = 0;
let running = false, gameOver = false;

function spawnEnemy(x, z){
  const mat = new THREE.MeshLambertMaterial({ color: 0xc0392b });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.42, 1.5, 0.24), mat);
  mesh.position.set(x, 0.75, z); scene.add(mesh);
  const e = { mesh, hp: 50 + wave*15, maxHp: 50 + wave*15, speed: 2.5 + wave*0.15, r: 0.6, visionRange: 22, visionAngle: Math.PI * 0.7, alert: false, lastSeenX: x, lastSeenZ: z, lastSeenTime: 999, shootCd: 1.5 + Math.random()*0.6, lastShot: 0, wanderAng: Math.random()*Math.PI*2, wanderTimer: 0, isBoss: false, isBear: false, strafeDir: Math.random()<0.5?-1:1 };
  mesh.userData.enemyRef = e; enemies.push(e); return e;
}

function spawnBoss(x, z){
  const mat = new THREE.MeshLambertMaterial({ color: 0x6a0000 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(0.7, 2.5, 0.4), mat);
  mesh.position.set(x, 1.25, z); scene.add(mesh);
  const e = { mesh, hp: 600 + wave*100, maxHp: 600 + wave*100, speed: 2 + wave*0.1, r: 1, visionRange: 35, visionAngle: Math.PI * 0.9, alert: true, lastSeenX: x, lastSeenZ: z, lastSeenTime: 0, shootCd: 1.0, lastShot: 0, wanderAng: 0, wanderTimer: 0, isBoss: true, isBear: false, strafeDir: 1 };
  mesh.userData.enemyRef = e; enemies.push(e); boss = e;
  SFX.boss(); updateBossBar();
}

function spawnBear(x, z){
  const mat = new THREE.MeshLambertMaterial({ color: 0x3a2415 });
  const mesh = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.2, 1.8), mat);
  mesh.position.set(x, 0.6, z); scene.add(mesh);
  const e = { mesh, hp: 180 + wave*30, maxHp: 180 + wave*30, speed: 3.5, r: 1.0, visionRange: 15, visionAngle: Math.PI*2, alert: false, lastSeenX: x, lastSeenZ: z, lastSeenTime: 999, shootCd: 0, lastShot: 0, meleeCd: 1.2, lastBite: 0, wanderAng: Math.random()*Math.PI*2, wanderTimer: 0, isBoss: false, isBear: true, strafeDir: 1 };
  mesh.userData.enemyRef = e; enemies.push(e); SFX.bear(); return e;
}

function damageEnemy(e, dmg){
  e.hp -= dmg;
  e.alert = true; e.lastSeenX = player.position.x; e.lastSeenZ = player.position.z; e.lastSeenTime = 0;
  SFX.hit(); showHitmarker();
  if (e.hp <= 0) killEnemy(e);
  if (e.isBoss) updateBossBar();
}

function killEnemy(e){
  if (e.isBoss){
    score += 250 + wave*50; gold += 100; SFX.bossDie();
    for (let k = 0; k < 8; k++) spawnLoot(e.mesh.position.x + (Math.random()-0.5)*3, e.mesh.position.z + (Math.random()-0.5)*3, 'coin');
    spawnLoot(e.mesh.position.x, e.mesh.position.z, 'health');
    spawnLoot(e.mesh.position.x + 2, e.mesh.position.z, 'weapon:rifle');
    boss = null; updateBossBar();
  } else if (e.isBear){
    score += 80 + wave*10; gold += 30; SFX.death();
    spawnLoot(e.mesh.position.x, e.mesh.position.z, 'health'); spawnLoot(e.mesh.position.x + 1, e.mesh.position.z, 'coin');
  } else {
    score += 15 + wave; gold += 8; SFX.death();
    const r = Math.random();
    if (r < 0.12) spawnLoot(e.mesh.position.x, e.mesh.position.z, 'health');
    else if (r < 0.22) spawnLoot(e.mesh.position.x, e.mesh.position.z, 'weapon:' + (Math.random()<0.5?'shotgun':'rifle'));
    else spawnLoot(e.mesh.position.x, e.mesh.position.z, 'coin');
  }
  scene.remove(e.mesh); enemies = enemies.filter(x => x !== e); updateHUD();
}

// ============ INSTANCED ANIMALS ============
const instancedSystems = {};
function createInstancedSystem(name, parts, count){
  const instancedParts = parts.map(p => {
    const im = new THREE.InstancedMesh(p.geo, p.mat, count);
    im.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    im.castShadow = !isTouch; im.userData.sysName = name; im.userData.offset = p.offset;
    scene.add(im); return { mesh: im, offset: p.offset };
  });
  const data = Array.from({ length: count }, () => ({ alive: false, x: 0, z: 0, yaw: 0, hp: 0, maxHp: 0, baseY: 0, wanderAng: 0, wanderTimer: 0, meleeCd: 0, lastBite: 0, strafeDir: 1 }));
  const dummy = new THREE.Object3D(); const tmpM = new THREE.Matrix4();
  instancedSystems[name] = { name, instancedParts, data, count, dummy, tmpM };
  for (let i = 0; i < count; i++){
    dummy.position.set(0, -1000, 0); dummy.scale.set(0, 0, 0); dummy.updateMatrix();
    for (const part of instancedParts) part.mesh.setMatrixAt(i, dummy.matrix);
  }
  for (const part of instancedParts) part.mesh.instanceMatrix.needsUpdate = true;
  return instancedSystems[name];
}

function initInstancedSystems(){
  const deerParts = [{ geo: new THREE.BoxGeometry(1.2, 0.7, 0.6), mat: new THREE.MeshLambertMaterial({ color: 0x8b5a2b }), offset: { x: 0, y: 0.8, z: 0 } }];
  createInstancedSystem('deer', deerParts, DEER_COUNT);
  const wolfParts = [{ geo: new THREE.BoxGeometry(1.4, 0.6, 0.5), mat: new THREE.MeshLambertMaterial({ color: 0x555555 }), offset: { x: 0, y: 0.65, z: 0 } }];
  createInstancedSystem('wolf', wolfParts, WOLF_COUNT);
}

function spawnInstanced(name, x, z, hp){
  const sys = instancedSystems[name];
  if (!sys) return -1;
  for (let i = 0; i < sys.count; i++){
    if (!sys.data[i].alive){
      const d = sys.data[i];
      d.alive = true; d.x = x; d.z = z; d.yaw = Math.random() * Math.PI * 2; d.hp = hp; d.maxHp = hp; d.wanderAng = Math.random() * Math.PI * 2; d.wanderTimer = 0; d.lastBite = 0;
      updateInstanceMatrix(sys, i); return i;
    }
  }
  return -1;
}

function updateInstanceMatrix(sys, i){
  const d = sys.data[i], dummy = sys.dummy;
  dummy.position.set(d.x, d.baseY || 0, d.z); dummy.rotation.set(0, d.yaw, 0);
  const s = d.alive ? 1 : 0; dummy.scale.set(s, s, s); dummy.updateMatrix();
  for (const part of sys.instancedParts){
    const mat = dummy.matrix.clone(), off = new THREE.Matrix4().makeTranslation(part.offset.x, part.offset.y, part.offset.z);
    mat.multiply(off); part.mesh.setMatrixAt(i, mat);
  }
}
function commitInstanced(sys){ for (const part of sys.instancedParts) part.mesh.instanceMatrix.needsUpdate = true; }

function updateInstancedAI(dt){
  const deerSys = instancedSystems.deer;
  if (deerSys){
    for (let i = 0; i < deerSys.count; i++){
      const d = deerSys.data[i]; if (!d.alive) continue;
      const dx = player.position.x - d.x, dz = player.position.z - d.z, dd = Math.hypot(dx, dz);
      if (dd < 15){
        d.yaw = Math.atan2(-dx, -dz); d.x -= (dx/dd) * 5 * dt; d.z -= (dz/dd) * 5 * dt;
      } else {
        d.wanderTimer -= dt;
        if (d.wanderTimer <= 0){ d.wanderTimer = 2 + Math.random()*3; d.wanderAng = Math.random()*Math.PI*2; }
        d.yaw = Math.atan2(-Math.cos(d.wanderAng), -Math.sin(d.wanderAng)); d.x += Math.cos(d.wanderAng) * 0.8 * dt; d.z += Math.sin(d.wanderAng) * 0.8 * dt;
      }
      d.x = Math.max(-BOUND+3, Math.min(BOUND-3, d.x)); d.z = Math.max(-BOUND+3, Math.min(BOUND-3, d.z));
      updateInstanceMatrix(deerSys, i);
    }
    commitInstanced(deerSys);
  }
  const wolfSys = instancedSystems.wolf;
  if (wolfSys){
    for (let i = 0; i < wolfSys.count; i++){
      const d = wolfSys.data[i]; if (!d.alive) continue;
      const dx = player.position.x - d.x, dz = player.position.z - d.z, dd = Math.hypot(dx, dz);
      if (dd < 18){
        d.yaw = Math.atan2(-dx, -dz);
        if (dd > 1.8){ d.x += (dx/dd) * 5 * dt; d.z += (dz/dd) * 5 * dt; }
        else {
          d.lastBite += dt;
          if (d.lastBite >= 0.9){
            d.lastBite = 0; player.hp -= 8; SFX.hit(); updateHUD();
            if (player.hp <= 0){ triggerGameOver(); return; }
          }
        }
      } else {
        d.wanderTimer -= dt;
        if (d.wanderTimer <= 0){ d.wanderTimer = 1.5 + Math.random()*2.5; d.wanderAng = Math.random()*Math.PI*2; }
        d.yaw = Math.atan2(-Math.cos(d.wanderAng), -Math.sin(d.wanderAng)); d.x += Math.cos(d.wanderAng) * 1.2 * dt; d.z += Math.sin(d.wanderAng) * 1.2 * dt;
      }
      d.x = Math.max(-BOUND+3, Math.min(BOUND-3, d.x)); d.z = Math.max(-BOUND+3, Math.min(BOUND-3, d.z));
      updateInstanceMatrix(wolfSys, i);
    }
    commitInstanced(wolfSys);
  }
}

function damageInstanced(sysName, index, dmg){
  const sys = instancedSystems[sysName]; if (!sys) return;
  const d = sys.data[index]; if (!d || !d.alive) return;
  d.hp -= dmg; SFX.hit(); showHitmarker();
  if (d.hp <= 0){
    d.alive = false; updateInstanceMatrix(sys, index); commitInstanced(sys);
    if (sysName === 'wolf'){ score += 30 + wave*5; gold += 12; spawnLoot(d.x, d.z, 'coin'); }
    else if (sysName === 'deer'){ score += 20; gold += 15; spawnLoot(d.x, d.z, 'coin'); spawnLoot(d.x + 1, d.z, 'coin'); }
    updateHUD();
  } else { updateInstanceMatrix(sys, index); commitInstanced(sys); }
}

// ============ DRAGONES ============
let dragons = [];
let dragonFireballs = [];
function spawnDragons(){
  for (let i = 0; i < DRAGON_COUNT; i++){
    const mesh = glbCache.dragon ? glbCache.dragon.clone() : new THREE.Mesh(new THREE.BoxGeometry(2,2,4), new THREE.MeshLambertMaterial({color: 0x4a0a0a}));
    if (glbCache.dragon) mesh.scale.set(1.5, 1.5, 1.5);
    mesh.position.set(-BOUND + 40 + Math.random() * (WORLD_SIZE - 80), 22 + Math.random() * 8, -BOUND + 40 + Math.random() * (WORLD_SIZE - 80));
    mesh.castShadow = true; scene.add(mesh);
    const dg = { mesh, hp: 800 + wave*50, maxHp: 800 + wave*50, angle: Math.random() * Math.PI * 2, fireCd: 3 + Math.random()*2 };
    mesh.userData.dragonRef = dg; dragons.push(dg);
  }
  SFX.dragon();
}

function damageDragon(dg, dmg){
  dg.hp -= dmg; SFX.hit(); showHitmarker();
  boss = dg; updateBossBar();
  if (dg.hp <= 0){
    scene.remove(dg.mesh); dragons = dragons.filter(d => d !== dg);
    score += 500; gold += 150; SFX.bossDie();
    spawnLoot(dg.mesh.position.x, dg.mesh.position.z, 'health');
    for (let k = 0; k < 15; k++) spawnLoot(dg.mesh.position.x + (Math.random()-0.5)*5, dg.mesh.position.z + (Math.random()-0.5)*5, 'coin');
    boss = null; updateBossBar(); updateHUD(); showMsg('¡Dragón abatido!');
  }
}

function updateDragons(dt){
  for (const dg of dragons){
    dg.angle += dt * 0.4;
    dg.mesh.position.x += Math.cos(dg.angle) * 3 * dt; dg.mesh.position.z += Math.sin(dg.angle) * 3 * dt;
    dg.mesh.rotation.y = -dg.angle;
    const b = BOUND - 20;
    dg.mesh.position.x = Math.max(-b, Math.min(b, dg.mesh.position.x)); dg.mesh.position.z = Math.max(-b, Math.min(b, dg.mesh.position.z));
    dg.fireCd -= dt;
    const dx = player.position.x - dg.mesh.position.x, dz = player.position.z - dg.mesh.position.z, dd = Math.hypot(dx, dz);
    if (dd < 25 && dg.fireCd <= 0){
      dg.fireCd = 2.5 + Math.random()*1.5; SFX.fire();
      const fb = new THREE.Mesh(new THREE.SphereGeometry(0.7, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff5500 }));
      fb.position.copy(dg.mesh.position); scene.add(fb);
      dragonFireballs.push({ mesh: fb, vx: dx / dd * 10, vy: -8, vz: dz / dd * 10, life: 4 });
    }
  }
  for (let i = dragonFireballs.length-1; i >= 0; i--){
    const fb = dragonFireballs[i];
    fb.mesh.position.x += fb.vx * dt; fb.mesh.position.y += fb.vy * dt; fb.mesh.position.z += fb.vz * dt;
    fb.vy -= 15 * dt; fb.life -= dt;
    const dx = fb.mesh.position.x - player.position.x, dy = fb.mesh.position.y - 1.2, dz = fb.mesh.position.z - player.position.z;
    if (dx*dx + dy*dy + dz*dz < 1.5*1.5){
      player.hp -= 25; SFX.hit(); showMsg('¡Dragón te quemó! -25'); updateHUD();
      scene.remove(fb.mesh); dragonFireballs.splice(i, 1);
      if (player.hp <= 0){ triggerGameOver(); return; }
      continue;
    }
    if (fb.life <= 0 || fb.mesh.position.y < 0){ scene.remove(fb.mesh); dragonFireballs.splice(i, 1); }
  }
}

// ============ PROYECTILES Y LOOT ============
let enemyProjectiles = [], loot = [];
function spawnEnemyProjectile(from, dir, dmg){
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.18, 8, 8), new THREE.MeshBasicMaterial({ color: 0xff4444 }));
  mesh.position.copy(from); scene.add(mesh);
  enemyProjectiles.push({ mesh, velocity: dir.clone().multiplyScalar(20), life: 3, damage: dmg });
}
function spawnLoot(x, z, type){
  let mesh;
  if (type === 'coin'){
    mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.25, 0.08, 16), new THREE.MeshLambertMaterial({ color: 0xffcc00, emissive: 0x664400 }));
    mesh.rotation.x = Math.PI/2;
  } else if (type === 'health'){
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.5, 0.5), new THREE.MeshLambertMaterial({ color: 0x2ecc71 }));
  } else if (type.startsWith('weapon:')){
    mesh = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.2, 0.2), new THREE.MeshLambertMaterial({ color: 0x555555 }));
  }
  mesh.position.set(x, 0.6, z); mesh.traverse(o => { if (o.isMesh) o.castShadow = true; });
  scene.add(mesh); loot.push({ mesh, type, life: 30, phase: Math.random()*Math.PI*2 });
}

// ============ COLISIONES ============
function checkCollision(x, z, radius){
  for (const box of wallBoxes){
    const cx = Math.max(box.min.x, Math.min(x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(z, box.max.z));
    const dx = x - cx, dz = z - cz;
    if (dx*dx + dz*dz < radius*radius) return true;
  }
  for (const box of boundaryBoxes){
    const cx = Math.max(box.min.x, Math.min(x, box.max.x));
    const cz = Math.max(box.min.z, Math.min(z, box.max.z));
    const dx = x - cx, dz = z - cz;
    if (dx*dx + dz*dz < radius*radius) return true;
  }
  return false;
}

function enemySeesPlayer(e){
  const px = player.position.x, pz = player.position.z, ex = e.mesh.position.x, ez = e.mesh.position.z, dx = px - ex, dz = pz - ez, distSq = dx*dx + dz*dz;
  if (distSq > e.visionRange*e.visionRange) return false;
  const facingX = -Math.sin(e.mesh.rotation.y), facingZ = -Math.cos(e.mesh.rotation.y), dist = Math.sqrt(distSq), dot = (dx/dist)*facingX + (dz/dist)*facingZ;
  if (dot < Math.cos(e.visionAngle/2)) return false;
  const origin = new THREE.Vector3(ex, 1.5, ez), dir = new THREE.Vector3(dx/dist, 0, dz/dist), ray = new THREE.Raycaster(origin, dir, 0, dist), hits = ray.intersectObjects(wallMeshes, false);
  return hits.length === 0;
}

// ============ CONTROLES E INPUT (PC) ============
const keys = {};
const mouse = { down: false };
let yaw = 0, pitch = -0.05, lastShotTime = 0;
const raycaster = new THREE.Raycaster();

function cycleWeapon(dir){
  let idx = WEAPONS_ORDER.indexOf(player.weapon);
  for (let i = 0; i < WEAPONS_ORDER.length; i++){
    idx = (idx + dir + WEAPONS_ORDER.length) % WEAPONS_ORDER.length;
    const w = WEAPONS_ORDER[idx];
    if (w === 'pistol' || player.ammo[w] > 0){ player.weapon = w; updatePlayerWeaponMesh(); updateHUD(); return; }
  }
}
function selectWeapon(w){
  if (w === 'pistol' || player.ammo[w] > 0){ player.weapon = w; updatePlayerWeaponMesh(); updateHUD(); }
  else showMsg('No tienes ' + WEAPONS[w].name);
}

document.addEventListener('keydown', e => {
  keys[e.key.toLowerCase()] = true; const k = e.key.toLowerCase();
  if (k === 'e') tryFreeHostage(); else if (k === 'q') cycleWeapon(1); else if (k === '1') selectWeapon('pistol'); else if (k === '2') selectWeapon('shotgun'); else if (k === '3') selectWeapon('rifle'); else if (k === 'b') toggleShop();
});
document.addEventListener('keyup', e => keys[e.key.toLowerCase()] = false);

renderer.domElement.addEventListener('click', () => {
  if (!isTouch && running && !gameOver && document.pointerLockElement !== renderer.domElement) renderer.domElement.requestPointerLock();
});
document.addEventListener('pointerlockchange', () => {
  const crosshair = document.getElementById('crosshair');
  if (document.pointerLockElement === renderer.domElement) crosshair.classList.add('active');
  else { if (!isTouch) crosshair.classList.remove('active'); mouse.down = false; }
});
document.addEventListener('mousemove', e => {
  if (document.pointerLockElement === renderer.domElement){
    yaw -= e.movementX * 0.0022; pitch -= e.movementY * 0.0022; pitch = Math.max(-Math.PI/3, Math.min(Math.PI/4, pitch));
  }
});
document.addEventListener('mousedown', e => { if (e.button === 0 && running && !gameOver && e.target === renderer.domElement) mouse.down = true; });
document.addEventListener('mouseup', e => { if (e.button === 0) mouse.down = false; });
addEventListener('blur', () => { mouse.down = false; for (const k in keys) keys[k] = false; });

// ============ CONTROLES E INPUT (MOBILE MULTITOUCH) ============
let moveTouchId = null, lookTouchId = null;
const jsBase = document.getElementById('joystick-base');
const jsKnob = document.getElementById('joystick-knob');
let moveStartX = 0, moveStartY = 0, lookLastX = 0, lookLastY = 0;

if (isTouch){
  document.getElementById('mobile-ui').classList.add('active');
  document.getElementById('crosshair').classList.add('active');
  
  renderer.domElement.addEventListener('touchstart', e => {
    e.preventDefault();
    if (!running || gameOver) return;
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.clientX < innerWidth * 0.45 && moveTouchId === null) {
        moveTouchId = t.identifier; moveStartX = t.clientX; moveStartY = t.clientY;
        jsBase.style.left = t.clientX + 'px'; jsBase.style.top = t.clientY + 'px'; jsBase.classList.add('visible');
      } else if (t.clientX >= innerWidth * 0.45 && lookTouchId === null) {
        lookTouchId = t.identifier; lookLastX = t.clientX; lookLastY = t.clientY;
      }
    }
  }, { passive: false });

  renderer.domElement.addEventListener('touchmove', e => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveTouchId) {
        let dx = t.clientX - moveStartX, dy = t.clientY - moveStartY;
        const len = Math.hypot(dx, dy), maxLen = 50;
        if (len > maxLen){ dx = dx/len*maxLen; dy = dy/len*maxLen; }
        jsKnob.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
        const nx = dx / maxLen, ny = dy / maxLen;
        keys['w'] = ny < -0.3; keys['s'] = ny > 0.3; keys['a'] = nx < -0.3; keys['d'] = nx > 0.3;
      } else if (t.identifier === lookTouchId) {
        const dx = t.clientX - lookLastX, dy = t.clientY - lookLastY;
        yaw -= dx * 0.005; pitch -= dy * 0.005; pitch = Math.max(-Math.PI/3, Math.min(Math.PI/4, pitch));
        lookLastX = t.clientX; lookLastY = t.clientY;
      }
    }
  }, { passive: false });

  const handleTouchEnd = e => {
    e.preventDefault();
    for (let i = 0; i < e.changedTouches.length; i++) {
      const t = e.changedTouches[i];
      if (t.identifier === moveTouchId) {
        moveTouchId = null; keys['w'] = keys['s'] = keys['a'] = keys['d'] = false;
        jsKnob.style.transform = 'translate(-50%, -50%)'; jsBase.classList.remove('visible');
      } else if (t.identifier === lookTouchId) lookTouchId = null;
    }
  };
  renderer.domElement.addEventListener('touchend', handleTouchEnd, { passive: false });
  renderer.domElement.addEventListener('touchcancel', handleTouchEnd, { passive: false });

  const fireBtn = document.getElementById('m-fire');
  fireBtn.addEventListener('touchstart', e => { e.preventDefault(); e.stopPropagation(); mouse.down = true; }, { passive: false });
  fireBtn.addEventListener('touchend', e => { e.preventDefault(); e.stopPropagation(); mouse.down = false; }, { passive: false });
  fireBtn.addEventListener('touchcancel', e => { e.stopPropagation(); mouse.down = false; }, { passive: false });
  
  document.getElementById('m-switch').addEventListener('touchstart', e => { e.preventDefault(); cycleWeapon(1); }, { passive: false });
  document.getElementById('m-shop').addEventListener('touchstart', e => { e.preventDefault(); toggleShop(); }, { passive: false });
}

// ============ SHOOTING ============
let muzzleLight = null;
function shootOnce(){
  const w = WEAPONS[player.weapon], camDir = new THREE.Vector3(); camera.getWorldDirection(camDir); const camOrigin = camera.position.clone();
  const targets = wallMeshes.slice().concat(enemies.map(e => e.mesh));
  for (const dg of dragons) targets.push(dg.mesh);
  for (const sysName in instancedSystems){ for (const part of instancedSystems[sysName].instancedParts) targets.push(part.mesh); }
  const camRay = new THREE.Raycaster(camOrigin, camDir, 0.1, 200), camHits = camRay.intersectObjects(targets, true);
  let aimPoint = camHits.length > 0 ? camHits[0].point.clone() : camOrigin.clone().add(camDir.clone().multiplyScalar(100));
  const weaponOrigin = new THREE.Vector3(player.position.x, 1.5, player.position.z), aimDir = aimPoint.clone().sub(weaponOrigin).normalize();
  for (let p = 0; p < w.pellets; p++){
    const dir = aimDir.clone(); dir.x += (Math.random()-0.5) * w.spread * 2; dir.y += (Math.random()-0.5) * w.spread * 2; dir.z += (Math.random()-0.5) * w.spread * 2; dir.normalize();
    raycaster.set(weaponOrigin, dir); raycaster.far = w.range; const hits = raycaster.intersectObjects(targets, true);
    let endPoint = weaponOrigin.clone().add(dir.clone().multiplyScalar(w.range));
    if (hits.length > 0){
      endPoint = hits[0].point.clone(); const obj = hits[0].object; let parent = obj;
      while (parent && !parent.userData.enemyRef && !parent.userData.dragonRef) parent = parent.parent;
      if (parent && parent.userData.enemyRef) damageEnemy(parent.userData.enemyRef, w.damage);
      else if (parent && parent.userData.dragonRef) damageDragon(parent.userData.dragonRef, w.damage);
      else if (obj.userData.sysName !== undefined && hits[0].instanceId !== undefined) damageInstanced(obj.userData.sysName, hits[0].instanceId, w.damage);
    }
    spawnTracer(weaponOrigin, endPoint);
  }
  player.recoil = Math.min(player.recoil + 0.08, 0.15); spawnMuzzleFlash(weaponOrigin.clone().add(aimDir.clone().multiplyScalar(0.6)));
  if (player.weapon === 'shotgun') SFX.shotgun(); else if (player.weapon === 'rifle') SFX.rifle(); else SFX.shoot();
  if (player.ammo[player.weapon] !== Infinity){
    player.ammo[player.weapon]--; if (player.ammo[player.weapon] <= 0) player.weapon = 'pistol';
    updatePlayerWeaponMesh(); updateHUD();
  }
}
function spawnTracer(from, to){
  const geo = new THREE.BufferGeometry().setFromPoints([from, to]), mat = new THREE.LineBasicMaterial({ color: 0xffff88, transparent: true, opacity: 0.95 });
  const line = new THREE.Line(geo, mat); scene.add(line); setTimeout(() => { scene.remove(line); geo.dispose(); mat.dispose(); }, 80);
}
function spawnMuzzleFlash(pos){
  if (muzzleLight) scene.remove(muzzleLight);
  muzzleLight = new THREE.PointLight(0xffaa33, 3, 5); muzzleLight.position.copy(pos); scene.add(muzzleLight);
  setTimeout(() => { if (muzzleLight){ scene.remove(muzzleLight); muzzleLight = null; } }, 60);
}
function showHitmarker(){
  const hm = document.getElementById('hitmarker'); hm.classList.add('show');
  clearTimeout(hm._timer); hm._timer = setTimeout(() => hm.classList.remove('show'), 120);
}

// ============ HOSTAGES ============
function tryFreeHostage(){
  for (const h of hostageObjects){
    if (h.freed) continue;
    const dx = h.x - player.position.x, dz = h.z - player.position.z;
    if (dx*dx + dz*dz < 5.0*5.0){
      h.freed = true; scene.remove(h.mesh); scene.remove(h.marker);
      score += 75; gold += 30; spawnLoot(h.x, h.z, 'health'); spawnLoot(h.x + 1, h.z, 'weapon:shotgun');
      SFX.hostage(); showMsg('¡Rehén liberado! +75'); updateHUD(); return;
    }
  }
}

// ============ HUD & SHOP ============
function updateHUD(){
  document.getElementById('hp').textContent = Math.max(0, Math.ceil(player.hp));
  document.getElementById('hpfill').style.width = Math.max(0, player.hp/player.maxHp*100) + '%';
  document.getElementById('score').textContent = score; document.getElementById('gold').textContent = gold; document.getElementById('wave').textContent = wave;
  const w = WEAPONS[player.weapon], ammo = player.ammo[player.weapon];
  document.getElementById('weapon').textContent = `${w.name} [${ammo === Infinity ? '∞' : ammo}]`;
  document.querySelectorAll('.wslot').forEach(el => {
    const wp = el.dataset.w; el.classList.toggle('active', wp === player.weapon); el.classList.toggle('empty', wp !== 'pistol' && player.ammo[wp] <= 0);
  });
}
function updateBossBar(){
  const bar = document.getElementById('bossbar');
  if (boss){ bar.style.display = 'block'; document.getElementById('bosshp').style.width = Math.max(0, boss.hp/boss.maxHp*100) + '%'; }
  else bar.style.display = 'none';
}
let msgTimer;
function showMsg(text){
  const el = document.getElementById('msg'); el.textContent = text; el.style.opacity = 1;
  clearTimeout(msgTimer); msgTimer = setTimeout(() => { el.style.opacity = 0; }, 1600);
}

const SHOP_ITEMS = [
  { id:'health', name:'Vida +50', desc:'Recupera 50 HP', price:25, apply:()=>{ player.hp = Math.min(player.maxHp, player.hp + 50); }},
  { id:'shotgun', name:'Escopeta', desc:'Arma con 24 balas', price:80, apply:()=>{ player.ammo.shotgun = 24; player.weapon = 'shotgun'; updatePlayerWeaponMesh(); }},
  { id:'rifle', name:'Rifle', desc:'Arma con 100 balas', price:120, apply:()=>{ player.ammo.rifle = 100; player.weapon = 'rifle'; updatePlayerWeaponMesh(); }},
  { id:'ammoShotgun', name:'+24 balas escopeta', desc:'Recarga escopeta', price:35, apply:()=>{ player.ammo.shotgun += 24; }},
  { id:'ammoRifle', name:'+50 balas rifle', desc:'Recarga rifle', price:40, apply:()=>{ player.ammo.rifle += 50; }},
  { id:'maxhp', name:'Vida máxima +25', desc:'Aumenta HP máximo', price:100, apply:()=>{ player.maxHp += 25; player.hp += 25; }}
];
function toggleShop(){
  const m = document.getElementById('shop-modal');
  if (m.classList.contains('show')){ m.classList.remove('show'); return; }
  renderShop(); m.classList.add('show');
}
function renderShop(){
  document.getElementById('shop-gold').textContent = gold;
  const cont = document.getElementById('shop-items'); cont.innerHTML = '';
  for (const item of SHOP_ITEMS){
    const div = document.createElement('div'); div.className = 'shop-item';
    div.innerHTML = `<div><div class="name">${item.name}</div><div class="desc">${item.desc}</div></div>`;
    const btn = document.createElement('button'); btn.textContent = `${item.price} 🟡`; btn.disabled = gold < item.price;
    btn.onclick = () => { if (gold < item.price) return; gold -= item.price; item.apply(); SFX.pickup(); updateHUD(); renderShop(); };
    div.appendChild(btn); cont.appendChild(div);
  }
}
document.getElementById('shop-close').onclick = () => document.getElementById('shop-modal').classList.remove('show');

// ============ MULTIPLAYER (SUPABASE CHANNEL) ============
const myPlayerId = Math.random().toString(36).substring(2, 10);
let mpChannel = null;
const remotePlayers = {};
async function connectMultiplayer(){
  try {
    mpChannel = supabase.channel('loot-shooter-global', { config: { broadcast: { self: true }, presence: { key: myPlayerId } } });
    mpChannel.on('broadcast', { event: 'move' }, ({ payload }) => {
      if (payload.id === myPlayerId) return;
      let rp = remotePlayers[payload.id];
      if (!rp){
        // Si hay avatar custom lo clona, sino usa el bloque azul por defecto
        let mesh;
        if (glbCache.avatar){
            mesh = glbCache.avatar.clone();
            mesh.scale.set(1,1,1);
        } else {
            const g = new THREE.Group();
            const mat = new THREE.MeshLambertMaterial({ color: 0x00ccff });
            const torso = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.55, 0.24), mat);
            torso.position.y = 1.25; g.add(torso);
            mesh = g;
        }
        mesh.position.set(payload.x, 0, payload.z); mesh.traverse(c => { if (c.isMesh) c.castShadow = true; }); scene.add(mesh);
        
        // Etiqueta flotante con el nombre del usuario
        const c = document.createElement('canvas'); c.width = 256; c.height = 64; const ctx = c.getContext('2d');
        ctx.font = 'bold 32px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
        ctx.fillStyle = '#000'; ctx.fillText(payload.name || 'Agente', 128, 32);
        ctx.fillStyle = '#00ccff'; ctx.fillText(payload.name || 'Agente', 128, 30);
        const tex = new THREE.CanvasTexture(c);
        const label = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, depthTest: false }));
        label.scale.set(3, 0.75, 1); label.position.y = 2.5; mesh.add(label);
        
        remotePlayers[payload.id] = { mesh, name: payload.name };
      }
      rp.mesh.position.set(payload.x, 0, payload.z); rp.mesh.rotation.y = payload.yaw;
    });
    mpChannel.on('presence', { event: 'sync' }, () => {
      const state = mpChannel.presenceState(), count = Object.keys(state).length;
      document.getElementById('mp-online').textContent = count;
    });
    await mpChannel.subscribe(async (status) => {
      if (status === 'SUBSCRIBED'){ await mpChannel.track({ name: playerName, at: Date.now() }); console.log('Multiplayer Conectado'); }
    });
    setInterval(() => {
      if (mpChannel && running && !gameOver){
        mpChannel.send({ type: 'broadcast', event: 'move', payload: { id: myPlayerId, name: playerName, x: player.position.x, z: player.position.z, yaw } });
      }
    }, 100);
  } catch(e){ console.warn('Multiplayer error:', e); document.getElementById('mp-online').textContent = 'offline'; }
}

// ============ BUCLE DE JUEGO ============
function randomFreePos(minDist){
  for (let t = 0; t < 40; t++){
    const ang = Math.random()*Math.PI*2, d = minDist + Math.random()*40, x = Math.cos(ang)*d, z = Math.sin(ang)*d;
    if (Math.abs(x) > BOUND-5 || Math.abs(z) > BOUND-5) continue;
    if (checkCollision(x, z, 1.5)) continue;
    return { x, z };
  }
  return { x: BOUND*0.7, z: BOUND*0.7 };
}
function spawnEnemyRandom(){ const p = randomFreePos(20); spawnEnemy(p.x, p.z); }
function spawnBearRandom(){ const p = randomFreePos(30); spawnBear(p.x, p.z); }
function spawnWavePickups(){
  const p1 = randomFreePos(8); spawnLoot(p1.x, p1.z, 'weapon:' + (Math.random()<0.5?'shotgun':'rifle'));
  const p2 = randomFreePos(8); spawnLoot(p2.x, p2.z, 'health');
}

function reset(){
  for (const e of enemies) scene.remove(e.mesh); for (const l of loot) scene.remove(l.mesh);
  for (const p of enemyProjectiles) scene.remove(p.mesh); for (const fb of dragonFireballs) scene.remove(fb.mesh);
  enemies = []; loot = []; enemyProjectiles = []; dragonFireballs = []; boss = null;
  
  // Limpiamos sistema de rehenes antiguo
  for (const h of hostageObjects) { scene.remove(h.mesh); if(h.marker) scene.remove(h.marker); }
  
  generateWorld(); // Regenera mapa nuevo
  
  if (!grassMesh) initInstancedSystems();
  for (const sysName in instancedSystems){ const sys = instancedSystems[sysName]; for (let i = 0; i < sys.count; i++) sys.data[i].alive = false; commitInstanced(sys); }
  
  player.position.set(0, 0, 0); player.hp = player.maxHp = 100; player.lvl = 1; player.weapon = 'pistol'; player.ammo = { pistol: Infinity, shotgun: 0, rifle: 0 }; player.recoil = 0;
  yaw = 0; pitch = -0.05;
  if (!playerMesh) buildPlayer();
  playerMesh.position.copy(player.position); updatePlayerWeaponMesh();
  
  // No reiniciamos el ORO ni SCORE si tiene guardado.
  wave = 1; waveTimer = 0; spawnTimer = 0; bearSpawnTimer = 0; gameOver = false;
  
  for (let i = 0; i < DEER_COUNT; i++){ const p = randomFreePos(15); spawnInstanced('deer', p.x, p.z, 25); }
  for (let i = 0; i < WOLF_COUNT; i++){ const p = randomFreePos(25); spawnInstanced('wolf', p.x, p.z, 60); }
  for (let i = 0; i < 5; i++) spawnEnemyRandom();
  if (dragons.length === 0) spawnDragons();
  spawnWavePickups(); updateHUD(); updateBossBar();
}

function update(dt, t){
  if (!running || gameOver) return;
  const fwd = new THREE.Vector3(-Math.sin(yaw), 0, -Math.cos(yaw)), right = new THREE.Vector3(Math.cos(yaw), 0, -Math.sin(yaw)), moveDir = new THREE.Vector3();
  if (keys['w'] || keys['arrowup']) moveDir.add(fwd); if (keys['s'] || keys['arrowdown']) moveDir.sub(fwd);
  if (keys['d'] || keys['arrowright']) moveDir.add(right); if (keys['a'] || keys['arrowleft']) moveDir.sub(right);
  if (moveDir.lengthSq() > 0){
    moveDir.normalize();
    const dx = moveDir.x * PLAYER_SPEED * dt, dz = moveDir.z * PLAYER_SPEED * dt;
    if (!checkCollision(player.position.x + dx, player.position.z, PLAYER_RADIUS)) player.position.x += dx;
    if (!checkCollision(player.position.x, player.position.z + dz, PLAYER_RADIUS)) player.position.z += dz;
    player.swayPhase += dt * 8;
  }
  
  tryFreeHostage(); // Revisar si chocamos con un rehén automáticamente
  
  playerMesh.position.copy(player.position); playerMesh.rotation.y = yaw;
  const swayX = Math.sin(player.swayPhase) * 0.01; playerGunGroup.position.x = 0.28 + swayX;
  player.recoil = Math.max(0, player.recoil - dt * 0.8);
  lastShotTime += dt;
  if (mouse.down && lastShotTime >= WEAPONS[player.weapon].cooldown && player.ammo[player.weapon] > 0){ lastShotTime = 0; shootOnce(); }
  
  // Cámara Hombro PC/Móvil
  const camDir = new THREE.Vector3(-Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
  const shoulder = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw)).multiplyScalar(0.7), camDist = 4.5;
  const camPos = new THREE.Vector3(player.position.x, player.position.y + 1.7 + player.recoil*0.5, player.position.z).add(camDir.clone().multiplyScalar(-camDist)).add(shoulder);
  if (camPos.y < 0.5) camPos.y = 0.5;
  camera.position.lerp(camPos, 1 - Math.pow(0.001, dt));
  camera.lookAt(new THREE.Vector3(player.position.x, player.position.y + 1.7 + player.recoil*0.5, player.position.z).add(shoulder).add(camDir));
  
  sun.position.set(player.position.x + 30, 60, player.position.z + 20); sun.target.position.set(player.position.x, 0, player.position.z); sun.target.updateMatrixWorld();
  
  // IA Enemigos Individuales
  for (const e of enemies){
    const dx = player.position.x - e.mesh.position.x, dz = player.position.z - e.mesh.position.z, d = Math.hypot(dx, dz);
    if (e.isBear){
      if (d < 15){
        e.alert = true; e.lastSeenX = player.position.x; e.lastSeenZ = player.position.z; e.lastSeenTime = 0; e.mesh.rotation.y = Math.atan2(-dx, -dz);
        if (d > 1.8){
          const nx = e.mesh.position.x + (dx/d) * e.speed * dt, nz = e.mesh.position.z + (dz/d) * e.speed * dt;
          if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
          if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
        } else {
          e.lastBite += dt;
          if (e.lastBite >= e.meleeCd){
            e.lastBite = 0; player.hp -= 20; SFX.hit(); showMsg('¡Oso te mordió! -20'); updateHUD();
            if (player.hp <= 0){ triggerGameOver(); return; }
          }
        }
      } else {
        e.alert = false; e.wanderTimer -= dt;
        if (e.wanderTimer <= 0){ e.wanderTimer = 2 + Math.random()*3; e.wanderAng = Math.random()*Math.PI*2; }
        e.mesh.rotation.y = Math.atan2(-Math.cos(e.wanderAng), -Math.sin(e.wanderAng));
        const nx = e.mesh.position.x + Math.cos(e.wanderAng) * e.speed * 0.4 * dt, nz = e.mesh.position.z + Math.sin(e.wanderAng) * e.speed * 0.4 * dt;
        if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
        if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
      }
      continue;
    }
    const sees = enemySeesPlayer(e);
    if (sees){ e.alert = true; e.lastSeenX = player.position.x; e.lastSeenZ = player.position.z; e.lastSeenTime = 0; e.mesh.rotation.y = Math.atan2(-dx, -dz); } else e.lastSeenTime += dt;
    if (e.alert && e.lastSeenTime < 6){
      const tdx = e.lastSeenX - e.mesh.position.x, tdz = e.lastSeenZ - e.mesh.position.z, td = Math.hypot(tdx, tdz);
      if (td > (e.isBoss ? 12 : 6)){
        const nx = e.mesh.position.x + (tdx/td) * e.speed * dt, nz = e.mesh.position.z + (tdz/td) * e.speed * dt;
        if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
        if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
        e.mesh.rotation.y = Math.atan2(-tdx, -tdz);
      } else if (sees){
        const perpAng = Math.atan2(tdz, tdx) + Math.PI/2 * e.strafeDir, nx = e.mesh.position.x + Math.cos(perpAng) * e.speed * 0.6 * dt, nz = e.mesh.position.z + Math.sin(perpAng) * e.speed * 0.6 * dt;
        if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
        if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
        if (Math.random() < 0.01) e.strafeDir *= -1;
      }
      if (sees){
        e.lastShot += dt;
        if (e.lastShot >= e.shootCd){
          e.lastShot = 0; const origin = new THREE.Vector3(e.mesh.position.x, 1.3, e.mesh.position.z), dir = new THREE.Vector3(dx, 0, dz).normalize();
          if (e.isBoss){ for (let k = -1; k <= 1; k++){ const ang = Math.atan2(dir.z, dir.x) + k*0.15; spawnEnemyProjectile(origin, new THREE.Vector3(Math.cos(ang), 0, Math.sin(ang)), 14); } }
          else spawnEnemyProjectile(origin, dir, 10);
          SFX.enemyShoot();
        }
      }
    } else {
      e.alert = false; e.wanderTimer -= dt;
      if (e.wanderTimer <= 0){ e.wanderTimer = 1.5 + Math.random()*2.5; e.wanderAng = Math.random()*Math.PI*2; }
      e.mesh.rotation.y = Math.atan2(-Math.cos(e.wanderAng), -Math.sin(e.wanderAng));
      const nx = e.mesh.position.x + Math.cos(e.wanderAng) * e.speed * 0.35 * dt, nz = e.mesh.position.z + Math.sin(e.wanderAng) * e.speed * 0.35 * dt;
      if (!checkCollision(nx, e.mesh.position.z, e.r)) e.mesh.position.x = nx;
      if (!checkCollision(e.mesh.position.x, nz, e.r)) e.mesh.position.z = nz;
    }
  }
  
  updateInstancedAI(dt); updateDragons(dt);
  
  for (let i = enemyProjectiles.length-1; i >= 0; i--){
    const p = enemyProjectiles[i]; p.mesh.position.addScaledVector(p.velocity, dt); p.life -= dt;
    const pdx = p.mesh.position.x - player.position.x, pdy = p.mesh.position.y - 1.2, pdz = p.mesh.position.z - player.position.z;
    if (pdx*pdx + pdy*pdy + pdz*pdz < 0.6*0.6){
      player.hp -= p.damage; SFX.hit(); scene.remove(p.mesh); enemyProjectiles.splice(i, 1); updateHUD();
      if (player.hp <= 0){ triggerGameOver(); return; }
      continue;
    }
    if (p.life <= 0 || p.mesh.position.y < 0){ scene.remove(p.mesh); enemyProjectiles.splice(i, 1); }
  }
  
  for (let i = loot.length-1; i >= 0; i--){
    const l = loot[i]; l.life -= dt; l.mesh.rotation.y += dt * 2; l.mesh.position.y = 0.6 + Math.sin(t*3 + l.phase) * 0.15;
    const ldx = l.mesh.position.x - player.position.x, ldz = l.mesh.position.z - player.position.z;
    if (ldx*ldx + ldz*ldz < 1.6*1.6){
      if (l.type === 'coin'){
        score += 5; gold += 5;
        if (score > 0 && score % 100 === 0 && player.lvl < 10){ player.lvl++; player.maxHp += 15; player.hp = Math.min(player.maxHp, player.hp + 20); showMsg('¡Subiste de nivel!'); }
        SFX.pickup();
      } else if (l.type === 'health'){ player.hp = Math.min(player.maxHp, player.hp + 40); SFX.health(); showMsg('+40 Vida'); }
      else if (l.type.startsWith('weapon:')){ const wn = l.type.split(':')[1]; player.weapon = wn; player.ammo[wn] = WEAPONS[wn].maxAmmo; updatePlayerWeaponMesh(); SFX.pickup(); showMsg(WEAPONS[wn].name + ' equipada'); }
      scene.remove(l.mesh); loot.splice(i, 1); updateHUD(); continue;
    }
    if (l.life <= 0){ scene.remove(l.mesh); loot.splice(i, 1); }
  }
  
  for (const h of hostageObjects){ if (!h.freed && h.marker) h.marker.position.y = 2.6 + Math.sin(t*3)*0.15; }
  
  spawnTimer += dt;
  const normalCount = enemies.filter(e => !e.isBoss && !e.isBear).length, maxEnemies = Math.min(18, 8 + Math.floor(wave/2));
  if (spawnTimer > 2.5 && normalCount < maxEnemies){ spawnTimer = 0; spawnEnemyRandom(); }
  
  bearSpawnTimer += dt;
  const bearCount = enemies.filter(e => e.isBear).length;
  if (bearSpawnTimer > 15 && bearCount < 3 && wave >= 2){ bearSpawnTimer = 0; spawnBearRandom(); }
  
  waveTimer += dt;
  if (waveTimer > 40){
    waveTimer = 0; wave++; updateHUD(); spawnWavePickups();
    if (BOSS_WAVES.includes(wave) && !boss){ const p = randomFreePos(25); spawnBoss(p.x, p.z); }
    if (BEAR_WAVES.includes(wave)) spawnBearRandom();
  }
}

// ============ GAMEOVER Y ARRANQUE ============
function triggerGameOver(){
  gameOver = true; SFX.gameover();
  document.exitPointerLock(); 
  
  // GUARDAR AUTOMÁTICAMENTE AL MORIR
  saveProgress();
  
  const ov = document.getElementById('overlay');
  ov.innerHTML = `
    <h1 style="color:#e74c3c">CAÍSTE EN COMBATE</h1>
    <p>Agente: <b style="color:#2ecc71">${playerName}</b></p>
    <p>Puntuación Total: <b style="color:#ffcc00">${score}</b></p>
    <p>Oro Acumulado: <b style="color:#ffcc00">${gold}</b> 🟡</p>
    <p>Oleada alcanzada: <b style="color:#ffcc00">${wave}</b></p>
    <p style="font-size: 12px; color: #aaa; margin-top: 5px;">Tu oro y progreso han sido sincronizados.</p>
    <button id="restartBtn">VOLVER A DESPLEGAR</button>
  `;
  ov.style.display = 'flex';
  document.getElementById('restartBtn').onclick = () => { ov.style.display = 'none'; reset(); running = true; if (!isTouch) renderer.domElement.requestPointerLock(); };
}

document.getElementById('startBtn').onclick = async () => {
  document.getElementById('overlay').style.display = 'none';
  await loadOptionalGLB(); buildPlayer(); reset(); running = true;
  if (!isTouch) renderer.domElement.requestPointerLock();
  connectMultiplayer();
};

let last = performance.now();
function loop(now){
  const dt = Math.min(DT_CAP, (now - last)/1000); last = now; const t = now/1000;
  update(dt, t); renderer.render(scene, camera); requestAnimationFrame(loop);
}
if (!isTouch) document.addEventListener('keydown', ensureAudio, {once:true});
requestAnimationFrame(loop);
