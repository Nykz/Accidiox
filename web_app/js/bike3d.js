// Accidiox 3D Instrument Cluster — a persistent WebGL panel styled after a
// Tesla-style top-down instrument cluster.
//
// Loads a real Yamaha R1 model (assets/models/yamaha_r1.glb) for the demo.
// Its mesh names are generic ("Object_8", "Object_19" — it came from a
// converted game asset with no semantic labels), so the two wheels were
// identified geometrically: the two meshes with a near-perfect circular
// cross-section (thin on the bike's left-right axis, equal height/depth),
// positioned symmetrically front and rear. If the model ever fails to
// load (network issue, moved file), a simple procedural bike is used
// instead so the cluster never shows nothing.
//
// Camera sweeps once from a low angle behind the bike up to a fixed
// top-down view and stays there. The bike's body never tilts with real
// sensor data (removed on request): it sits still when parked, and the
// wheels visibly spin when the bike is moving, driven by real speed.

import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { MeshoptDecoder } from "three/addons/libs/meshopt_decoder.module.js";
// The black Yamaha and Vespa files are meshopt-compressed (95MB -> ~1-4MB
// each after optimizing textures/geometry for this small on-screen
// cluster) - this decoder is required to load THOSE two files. The
// original blue Yamaha isn't compressed and ignores it harmlessly.

(function () {
  // Each model's wheel nodes were identified geometrically (bounding-box
  // shape/position analysis, not name lookup - none of these exports have
  // semantic mesh names). The Vespa has no wheelNodes: Sketchfab merged
  // both its wheels into one mesh spanning the whole scooter, so spinning
  // it as a rigid piece would rotate the wheels around the scooter's
  // center like a pinwheel instead of each spinning around its own axle -
  // visibly wrong, so it's left static (still switchable, just no spin).
  const BIKE_MODELS = [
    { key: "yamaha_blue", label: "Yamaha R1", path: "assets/models/yamaha_r1.glb", wheelNodes: ["Object_8", "Object_19"] },
    { key: "yamaha_black", label: "Yamaha R1 (Black)", path: "assets/models/yamaha_r1_black.glb", wheelNodes: ["Object_23", "Object_24"] },
    { key: "vespa", label: "Vespa Scooter", path: "assets/models/vespa.glb", wheelNodes: [] }
  ];
  const BIKE_STORAGE_KEY = "accidiox_selected_bike";

  let wheelMeshes = [];
  let currentSpeedKmh = 0;
  let spinLoopRunning = false;
  let spinRenderFn = null;

  function setSpeed(kmh) {
    currentSpeedKmh = Math.max(0, kmh || 0);
    if (currentSpeedKmh > 0 && !spinLoopRunning) {
      spinLoopRunning = true;
      requestAnimationFrame(spinLoop);
    }
  }
  window.__setBikeSpeed = setSpeed;

  function spinLoop() {
    if (currentSpeedKmh <= 0) {
      spinLoopRunning = false;
      return;
    }
    const radiansPerFrame = (currentSpeedKmh / 3.6) * 0.02;
    wheelMeshes.forEach((w) => { w.rotation.x += radiansPerFrame; });
    if (spinRenderFn) spinRenderFn();
    requestAnimationFrame(spinLoop);
  }

  function makeRoadTexture() {
    const canvas = document.createElement("canvas");
    canvas.width = 256;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#d7dade";
    ctx.fillRect(0, 0, 256, 512);
    ctx.fillStyle = "#7b7f88";
    ctx.fillRect(58, 0, 140, 512);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 9;
    ctx.setLineDash([42, 34]);
    ctx.beginPath();
    ctx.moveTo(128, 0);
    ctx.lineTo(128, 512);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 5);
    return tex;
  }

  // Fallback bike, used only if the real model fails to load. Built with
  // top-down silhouette as the priority: mirrors, footpegs, and a tapered
  // fairing/tail read clearly as "motorcycle" from directly above.
  function buildFallbackBike() {
    const group = new THREE.Group();
    wheelMeshes = [];

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x2f6fe0, metalness: 0.55, roughness: 0.25 });
    const fairingMat = new THREE.MeshStandardMaterial({ color: 0x1d4fc4, metalness: 0.5, roughness: 0.3 });
    const silverMat = new THREE.MeshStandardMaterial({ color: 0xd8dbe0, metalness: 0.7, roughness: 0.25 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x22252b, metalness: 0.5, roughness: 0.4 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x131417, roughness: 0.95 });
    const glassMat = new THREE.MeshStandardMaterial({ color: 0x9fd8e8, metalness: 0.2, roughness: 0.1, transparent: true, opacity: 0.55 });
    const headlightMat = new THREE.MeshStandardMaterial({ color: 0xfff6d8, emissive: 0xffe27a, emissiveIntensity: 1.1 });
    const taillightMat = new THREE.MeshStandardMaterial({ color: 0xff4444, emissive: 0xbb1111, emissiveIntensity: 1.0 });

    function makeWheel(z) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.14, 16, 32), tireMat);
      tire.rotation.y = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.24, 0.24, 0.15, 6), silverMat);
      rim.rotation.z = Math.PI / 2;
      wheel.add(tire, rim);
      wheel.position.set(0, 0.42, z);
      wheel.traverse((m) => { m.castShadow = true; });
      wheelMeshes.push(wheel);
      return wheel;
    }
    group.add(makeWheel(-0.98), makeWheel(0.98));

    function makeFender(z) {
      const fender = new THREE.Mesh(new THREE.CylinderGeometry(0.47, 0.47, 0.22, 16, 1, false, 0, Math.PI * 0.8), silverMat);
      fender.rotation.z = Math.PI / 2;
      fender.rotation.y = Math.PI / 2;
      fender.position.set(0, 0.6, z);
      return fender;
    }
    group.add(makeFender(0.98), makeFender(-0.98));

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.14, 0.13, 1.75), darkMat);
    frame.position.set(0, 0.58, 0);
    group.add(frame);

    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.32, 16, 12), bodyMat);
    tank.scale.set(0.85, 0.62, 1.35);
    tank.position.set(0, 0.88, 0.05);
    group.add(tank);

    const nose = new THREE.Mesh(new THREE.ConeGeometry(0.26, 0.7, 12), fairingMat);
    nose.rotation.x = Math.PI / 2;
    nose.position.set(0, 0.82, 1.15);
    group.add(nose);

    const screen = new THREE.Mesh(new THREE.CircleGeometry(0.22, 12, 0, Math.PI), glassMat);
    screen.rotation.x = -0.5;
    screen.rotation.z = Math.PI;
    screen.position.set(0, 1.0, 0.95);
    group.add(screen);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.36, 0.13, 0.5), darkMat);
    seat.position.set(0, 0.86, -0.42);
    group.add(seat);

    const tail = new THREE.Mesh(new THREE.ConeGeometry(0.2, 0.55, 8), fairingMat);
    tail.rotation.x = -Math.PI / 2;
    tail.position.set(0, 0.84, -0.95);
    group.add(tail);

    const taillight = new THREE.Mesh(new THREE.BoxGeometry(0.16, 0.07, 0.04), taillightMat);
    taillight.position.set(0, 0.86, -1.18);
    group.add(taillight);

    function makeMirror(x) {
      const grp = new THREE.Group();
      const stalk = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.22, 6), darkMat);
      stalk.rotation.z = Math.PI / 2.6 * Math.sign(x);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 8), darkMat);
      head.position.set(x > 0 ? 0.19 : -0.19, 0.09, 0);
      grp.add(stalk, head);
      grp.position.set(x, 1.12, 0.75);
      return grp;
    }
    group.add(makeMirror(0.32), makeMirror(-0.32));

    function makeFootpeg(x) {
      const peg = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.22, 8), darkMat);
      peg.rotation.z = Math.PI / 2;
      peg.position.set(x, 0.52, -0.15);
      return peg;
    }
    group.add(makeFootpeg(0.24), makeFootpeg(-0.24));

    const forkGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.62, 10);
    const forkL = new THREE.Mesh(forkGeo, silverMat);
    forkL.position.set(0.12, 0.62, 0.98);
    forkL.rotation.x = -0.24;
    const forkR = forkL.clone();
    forkR.position.x = -0.12;
    group.add(forkL, forkR);

    const handlebarPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.26, 12), darkMat);
    handlebarPost.position.set(0, 1.05, 0.82);
    group.add(handlebarPost);

    const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.028, 0.028, 0.66, 12), darkMat);
    handlebar.rotation.z = Math.PI / 2;
    handlebar.position.set(0, 1.15, 0.86);
    group.add(handlebar);

    const gripGeo = new THREE.CylinderGeometry(0.045, 0.045, 0.1, 10);
    const gripL = new THREE.Mesh(gripGeo, darkMat);
    gripL.rotation.z = Math.PI / 2;
    gripL.position.set(0.36, 1.15, 0.86);
    const gripR = gripL.clone();
    gripR.position.x = -0.36;
    group.add(gripL, gripR);

    const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.1, 12, 12), headlightMat);
    headlight.position.set(0, 0.85, 1.35);
    group.add(headlight);

    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.09, 0.7, 12), silverMat);
    exhaust.rotation.z = Math.PI / 2;
    exhaust.rotation.y = 0.18;
    exhaust.position.set(0.26, 0.46, -0.95);
    group.add(exhaust);

    group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    // No rotation here — the parent bikeAnchor already applies the 180°
    // flip so front points toward the top of the screen; this fallback
    // bike was authored facing the same local +Z convention as the GLB.
    return group;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function init() {
    const canvas = document.getElementById("bikeCanvas");
    const wrap = document.getElementById("bikeClusterWrap");
    if (!canvas) return;

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) {
      if (wrap) wrap.classList.add("cluster-unavailable");
      return;
    }

    const width = canvas.clientWidth || 320;
    const height = canvas.clientHeight || 220;

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(48, width / height, 0.1, 100);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;

    const key = new THREE.DirectionalLight(0xffffff, 2.0);
    key.position.set(3, 6, 3);
    key.castShadow = true;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xbcd4ff, 1.0);
    fill.position.set(-4, 3, -2);
    scene.add(fill);

    scene.add(new THREE.AmbientLight(0xffffff, 0.65));

    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(9, 16),
      new THREE.MeshStandardMaterial({ map: makeRoadTexture(), roughness: 0.95, metalness: 0 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.position.y = 0;
    ground.receiveShadow = true;
    scene.add(ground);

    spinRenderFn = () => renderer.render(scene, camera);

    const bikeAnchor = new THREE.Group();
    // Rotate the WRAPPER, not the loaded model's own scene node — the
    // model's root already carries a baked-in up-axis correction from
    // export, and overwriting its .rotation.y directly composes with that
    // in confusing, hard-to-predict ways. A clean empty parent group has
    // no such baggage, so a rotation on it always does exactly what it
    // looks like.
    //
    // The model's nose sits at local +Z (confirmed via an axis-helper
    // side-view render), and the resting camera's "up" is world -Z (see
    // upEnd below), meaning +Z maps to the BOTTOM of the screen. No
    // rotation needed here for the nose to face the viewer/bottom of the
    // cluster rather than away toward the top.
    bikeAnchor.rotation.y = 0;
    scene.add(bikeAnchor);

    const loader = new GLTFLoader();
    loader.setMeshoptDecoder(MeshoptDecoder);

    let currentModelIndex = 0;
    const savedKey = localStorage.getItem(BIKE_STORAGE_KEY);
    const savedIndex = BIKE_MODELS.findIndex((m) => m.key === savedKey);
    if (savedIndex >= 0) currentModelIndex = savedIndex;

    function loadModel(entry) {
      // Clear whatever's currently in the anchor (previous model or the
      // fallback bike) before loading the new one.
      while (bikeAnchor.children.length > 0) bikeAnchor.remove(bikeAnchor.children[0]);
      wheelMeshes = [];

      loader.load(
        entry.path,
        (gltf) => {
          const model = gltf.scene;

          // Every model here came in at real-world scale already, sitting
          // at y=0 — no repositioning needed, just added to the
          // pre-rotated bikeAnchor above.
          model.traverse((m) => {
            if (m.isMesh) { m.castShadow = true; m.receiveShadow = true; }
          });

          const found = entry.wheelNodes
            .map((name) => model.getObjectByName(name))
            .filter(Boolean);
          wheelMeshes = found;

          bikeAnchor.add(model);
          if (spinRenderFn) spinRenderFn();
        },
        undefined,
        (err) => {
          console.warn(`[3D Cluster] ${entry.label} failed to load, using fallback bike:`, err.message || err);
          bikeAnchor.add(buildFallbackBike());
          if (spinRenderFn) spinRenderFn();
        }
      );
    }

    loadModel(BIKE_MODELS[currentModelIndex]);

    const switchBtn = document.getElementById("btnSwitchBike");
    const switchLabel = document.getElementById("bikeSwitchLabel");
    function updateSwitchLabel() {
      if (switchLabel) switchLabel.textContent = BIKE_MODELS[currentModelIndex].label;
    }
    updateSwitchLabel();

    if (switchBtn) {
      switchBtn.addEventListener("click", () => {
        currentModelIndex = (currentModelIndex + 1) % BIKE_MODELS.length;
        const entry = BIKE_MODELS[currentModelIndex];
        localStorage.setItem(BIKE_STORAGE_KEY, entry.key);
        updateSwitchLabel();
        loadModel(entry);
      });
    }

    const camStart = new THREE.Vector3(0, 0.55, 2.6);
    const camEnd = new THREE.Vector3(0.001, 7.2, -0.001);
    const lookTarget = new THREE.Vector3(0, 0.5, 0);
    // A camera looking straight down has its view direction parallel to
    // the default "up" vector (0,1,0), which makes lookAt()'s orientation
    // undefined/unstable — rotate "up" toward (0,0,-1) as the camera rises
    // so it's always perpendicular to the view direction, never parallel.
    const upStart = new THREE.Vector3(0, 1, 0);
    const upEnd = new THREE.Vector3(0, 0, -1);
    const introDuration = 2200;
    let startTime = null;

    function frame(ts) {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const t = Math.min(elapsed / introDuration, 1);
      const e = easeInOutCubic(t);

      camera.position.lerpVectors(camStart, camEnd, e);
      camera.up.lerpVectors(upStart, upEnd, e).normalize();
      camera.lookAt(lookTarget);

      renderer.render(scene, camera);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else if (wrap) {
        wrap.classList.add("cluster-ready");
      }
    }
    requestAnimationFrame(frame);

    window.addEventListener("resize", () => {
      const w = canvas.clientWidth || width;
      const h = canvas.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      renderer.render(scene, camera);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
