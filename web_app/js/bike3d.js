// Accidiox 3D Instrument Cluster — a persistent WebGL panel (not a splash
// that disappears), styled after a Tesla-style top-down instrument
// cluster. No 3D asset was available to import, so the bike is built from
// primitive geometry in code. Camera sweeps once from a low angle behind
// the bike up to a fixed top-down view and STAYS there — there is no
// decorative idle spin. Once parked at the top-down view, the bike's own
// orientation is driven by real telemetry (roll/pitch from the ESP32), so
// if the bike is stationary it visibly stays still, and if it leans, the
// model leans with it.
//
// Fails silently (hides the canvas, the rest of the card still works) if
// WebGL/Three.js is unavailable — this is a nice-to-have, never a blocker
// to the safety features underneath it.

(function () {
  let bikeGroup = null;
  let introDone = false;

  function setTilt(rollDeg, pitchDeg) {
    if (!bikeGroup || !introDone) return;
    const clampedRoll = Math.max(-45, Math.min(45, rollDeg || 0));
    const clampedPitch = Math.max(-45, Math.min(45, pitchDeg || 0));
    bikeGroup.rotation.z = -clampedRoll * (Math.PI / 180);
    bikeGroup.rotation.x = clampedPitch * (Math.PI / 180);
    if (window.__renderBikeCluster) window.__renderBikeCluster();
  }
  window.__setBikeTilt = setTilt;

  function makeRoadTexture(THREE) {
    const canvas = document.createElement("canvas");
    canvas.width = 128;
    canvas.height = 512;
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#7b7f88";
    ctx.fillRect(0, 0, 128, 512);
    ctx.strokeStyle = "#ffffff";
    ctx.lineWidth = 9;
    ctx.setLineDash([42, 34]);
    ctx.beginPath();
    ctx.moveTo(64, 0);
    ctx.lineTo(64, 512);
    ctx.stroke();
    const tex = new THREE.CanvasTexture(canvas);
    tex.wrapS = THREE.RepeatWrapping;
    tex.wrapT = THREE.RepeatWrapping;
    tex.repeat.set(1, 5);
    return tex;
  }

  function buildBike(THREE) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.5, roughness: 0.3 });
    const lightBodyMat = new THREE.MeshStandardMaterial({ color: 0xeef1f5, metalness: 0.3, roughness: 0.35 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x2a2e37, metalness: 0.5, roughness: 0.4 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x161719, roughness: 0.95 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee, emissive: 0x0c4a5c, emissiveIntensity: 0.7, metalness: 0.3, roughness: 0.3
    });

    function makeWheel(z) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 16, 32), tireMat);
      tire.rotation.y = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 24), lightBodyMat);
      rim.rotation.z = Math.PI / 2;
      wheel.add(tire, rim);
      wheel.position.set(0, 0.42, z);
      wheel.traverse((m) => { m.castShadow = true; });
      return wheel;
    }
    group.add(makeWheel(-0.95), makeWheel(0.95));

    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.1, 1.7), darkMat);
    frame.position.set(0, 0.6, 0);
    frame.castShadow = true;
    group.add(frame);

    const tank = new THREE.Mesh(new THREE.SphereGeometry(0.3, 16, 12), bodyMat);
    tank.scale.set(0.9, 0.7, 1.5);
    tank.position.set(0, 0.85, 0.15);
    tank.castShadow = true;
    group.add(tank);

    const seat = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.75), darkMat);
    seat.position.set(0, 0.85, -0.55);
    seat.castShadow = true;
    group.add(seat);

    const forkGeo = new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10);
    const forkL = new THREE.Mesh(forkGeo, lightBodyMat);
    forkL.position.set(0.12, 0.65, 0.95);
    forkL.rotation.x = -0.22;
    const forkR = forkL.clone();
    forkR.position.x = -0.12;
    group.add(forkL, forkR);

    const handlebarPost = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3, 12), darkMat);
    handlebarPost.position.set(0, 1.05, 0.88);
    group.add(handlebarPost);

    const handlebar = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.58, 12), darkMat);
    handlebar.rotation.z = Math.PI / 2;
    handlebar.position.set(0, 1.18, 0.9);
    group.add(handlebar);

    const headlight = new THREE.Mesh(new THREE.SphereGeometry(0.09, 12, 12), accentMat);
    headlight.position.set(0, 0.9, 1.0);
    group.add(headlight);

    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.65, 12), lightBodyMat);
    exhaust.rotation.z = Math.PI / 2;
    exhaust.rotation.y = 0.18;
    exhaust.position.set(0.22, 0.48, -0.9);
    exhaust.castShadow = true;
    group.add(exhaust);

    group.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    return group;
  }

  function easeInOutCubic(t) {
    return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  }

  function init() {
    const canvas = document.getElementById("bikeCanvas");
    const wrap = document.getElementById("bikeClusterWrap");
    if (!canvas || typeof THREE === "undefined") {
      if (wrap) wrap.classList.add("cluster-unavailable");
      return;
    }

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

    const camera = new THREE.PerspectiveCamera(42, width / height, 0.1, 100);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;

    const key = new THREE.DirectionalLight(0xffffff, 1.8);
    key.position.set(3, 6, 3);
    key.castShadow = true;
    scene.add(key);

    const fill = new THREE.DirectionalLight(0xbcd4ff, 0.9);
    fill.position.set(-4, 3, -2);
    scene.add(fill);

    scene.add(new THREE.AmbientLight(0xffffff, 0.55));

    const road = new THREE.Mesh(
      new THREE.PlaneGeometry(2.3, 16),
      new THREE.MeshStandardMaterial({ map: makeRoadTexture(THREE), roughness: 0.95, metalness: 0 })
    );
    road.rotation.x = -Math.PI / 2;
    road.position.y = 0;
    road.receiveShadow = true;
    scene.add(road);

    bikeGroup = buildBike(THREE);
    scene.add(bikeGroup);

    const camStart = new THREE.Vector3(0, 0.55, 2.6);
    const camEnd = new THREE.Vector3(0.001, 7.6, -0.001);
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
      } else {
        introDone = true;
        if (wrap) wrap.classList.add("cluster-ready");
        renderer.render(scene, camera);
      }
    }
    requestAnimationFrame(frame);

    // Live loop: only re-renders when telemetry actually changes the
    // bike's tilt (see setTilt above) — no continuous animation while
    // parked, matching "still bike = still model."
    window.__renderBikeCluster = () => {
      if (introDone) renderer.render(scene, camera);
    };

    window.addEventListener("resize", () => {
      const w = canvas.clientWidth || width;
      const h = canvas.clientHeight || height;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
      if (introDone) renderer.render(scene, camera);
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
