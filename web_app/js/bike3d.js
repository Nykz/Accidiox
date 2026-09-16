// Accidiox 3D Intro — a real WebGL scene with a procedurally-built
// two-wheeler (no external 3D asset available, so the bike is constructed
// from primitive geometry), and a camera move from a low 3/4 angle up to
// a bird's-eye top-down view, then a slow idle rotation.
//
// Fails silently into the normal dashboard if WebGL/Three.js is unavailable
// (older phones, data-saver mode, etc.) — the splash is a nice-to-have,
// never a blocker to using the safety features underneath it.

(function () {
  function dismissSplash() {
    const splash = document.getElementById("bikeSplash");
    if (!splash) return;
    splash.classList.add("fade-out");
    setTimeout(() => { splash.style.display = "none"; }, 700);
  }
  window.__dismissBikeSplash = dismissSplash;

  function buildBike(THREE) {
    const group = new THREE.Group();

    const bodyMat = new THREE.MeshStandardMaterial({ color: 0x3b82f6, metalness: 0.65, roughness: 0.25 });
    const darkMat = new THREE.MeshStandardMaterial({ color: 0x161a22, metalness: 0.4, roughness: 0.5 });
    const tireMat = new THREE.MeshStandardMaterial({ color: 0x08090c, roughness: 0.95 });
    const accentMat = new THREE.MeshStandardMaterial({
      color: 0x22d3ee, emissive: 0x0c4a5c, emissiveIntensity: 0.9, metalness: 0.3, roughness: 0.3
    });

    function makeWheel(z) {
      const wheel = new THREE.Group();
      const tire = new THREE.Mesh(new THREE.TorusGeometry(0.42, 0.13, 16, 32), tireMat);
      tire.rotation.y = Math.PI / 2;
      const rim = new THREE.Mesh(new THREE.CylinderGeometry(0.26, 0.26, 0.14, 24), darkMat);
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

    const forkL = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.6, 10), darkMat);
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

    const exhaust = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.08, 0.65, 12), darkMat);
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
    if (!canvas || typeof THREE === "undefined") {
      dismissSplash();
      return;
    }

    let renderer;
    try {
      renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
    } catch (e) {
      dismissSplash();
      return;
    }

    const width = canvas.clientWidth || window.innerWidth;
    const height = canvas.clientHeight || window.innerHeight;

    const scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x0a0d13, 0.05);

    const camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
    renderer.setSize(width, height);
    renderer.shadowMap.enabled = true;

    const key = new THREE.DirectionalLight(0x9fc4ff, 2.4);
    key.position.set(4, 6, 3);
    key.castShadow = true;
    scene.add(key);

    const rim = new THREE.DirectionalLight(0x22d3ee, 1.6);
    rim.position.set(-4, 3, -3);
    scene.add(rim);

    scene.add(new THREE.AmbientLight(0x22335a, 0.7));

    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(6, 64),
      new THREE.MeshStandardMaterial({ color: 0x11151f, roughness: 0.9, metalness: 0.1 })
    );
    ground.rotation.x = -Math.PI / 2;
    ground.receiveShadow = true;
    scene.add(ground);

    const bike = buildBike(THREE);
    scene.add(bike);

    const camStart = new THREE.Vector3(2.7, 1.25, 3.1);
    const camEnd = new THREE.Vector3(0.01, 5.6, 0.01);
    const lookTarget = new THREE.Vector3(0, 0.55, 0);
    const introDuration = 2400;
    let startTime = null;
    let idle = false;

    function frame(ts) {
      if (!startTime) startTime = ts;
      const elapsed = ts - startTime;
      const t = Math.min(elapsed / introDuration, 1);
      const e = easeInOutCubic(t);

      camera.position.lerpVectors(camStart, camEnd, e);
      camera.lookAt(lookTarget);
      bike.rotation.y = e * Math.PI * 0.55;

      renderer.render(scene, camera);

      if (t < 1) {
        requestAnimationFrame(frame);
      } else if (!idle) {
        idle = true;
        setTimeout(dismissSplash, 500);
        requestAnimationFrame(idleLoop);
      }
    }

    function idleLoop() {
      bike.rotation.y += 0.0028;
      renderer.render(scene, camera);
      requestAnimationFrame(idleLoop);
    }

    requestAnimationFrame(frame);

    window.addEventListener("resize", () => {
      const w = canvas.clientWidth || window.innerWidth;
      const h = canvas.clientHeight || window.innerHeight;
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
      renderer.setSize(w, h);
    });

    // Never let the splash hang around if something above goes wrong.
    setTimeout(() => {
      if (!idle) dismissSplash();
    }, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();
