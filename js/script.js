import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";

// ---------- constants ----------
const CUBIE_SIZE = 0.96;
const GAP = 1; // grid spacing between cubie centers
const POSITIONS = [-1, 0, 1];
const COLORS = {
    right: 0xd2402c, // +X R
    left: 0xff8a1e,  // -X L
    up: 0xf5f5f5,    // +Y U
    down: 0xf7d51d,  // -Y D
    front: 0x2fa84f, // +Z F
    back: 0x3a63e0,  // -Z B
    inner: 0x0c0c0c,
};
const SNAP = Math.PI / 2;

// ---------- scene setup ----------
const container = document.getElementById("cube-canvas");
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x14171c);

const camera = new THREE.PerspectiveCamera(45, 1, 0.1, 100);
const DEFAULT_CAM_POS = new THREE.Vector3(5.2, 4.6, 6.2);
camera.position.copy(DEFAULT_CAM_POS);

const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
container.appendChild(renderer.domElement);

scene.add(new THREE.HemisphereLight(0xffffff, 0x404040, 1.1));
const dirLight = new THREE.DirectionalLight(0xffffff, 0.6);
dirLight.position.set(6, 10, 8);
scene.add(dirLight);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enableDamping = true;
controls.dampingFactor = 0.12;
controls.enablePan = false;
controls.minDistance = 5;
controls.maxDistance = 14;
controls.target.set(0, 0, 0);

function resize() {
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}
window.addEventListener("resize", resize);

// ---------- cube model ----------
const cubeGroup = new THREE.Group();
scene.add(cubeGroup);

function makeCubieMaterials(gx, gy, gz) {
    // BoxGeometry face order: +X, -X, +Y, -Y, +Z, -Z
    return [
        new THREE.MeshLambertMaterial({ color: gx === 1 ? COLORS.right : COLORS.inner }),
        new THREE.MeshLambertMaterial({ color: gx === -1 ? COLORS.left : COLORS.inner }),
        new THREE.MeshLambertMaterial({ color: gy === 1 ? COLORS.up : COLORS.inner }),
        new THREE.MeshLambertMaterial({ color: gy === -1 ? COLORS.down : COLORS.inner }),
        new THREE.MeshLambertMaterial({ color: gz === 1 ? COLORS.front : COLORS.inner }),
        new THREE.MeshLambertMaterial({ color: gz === -1 ? COLORS.back : COLORS.inner }),
    ];
}

const geometry = new THREE.BoxGeometry(CUBIE_SIZE, CUBIE_SIZE, CUBIE_SIZE);
const edgesGeometry = new THREE.EdgesGeometry(geometry);

let cubies = [];

function buildCube() {
    cubies.forEach((c) => cubeGroup.remove(c));
    cubies = [];
    for (const gx of POSITIONS) {
        for (const gy of POSITIONS) {
            for (const gz of POSITIONS) {
                if (gx === 0 && gy === 0 && gz === 0) continue;
                const mesh = new THREE.Mesh(geometry, makeCubieMaterials(gx, gy, gz));
                mesh.position.set(gx * GAP, gy * GAP, gz * GAP);
                const line = new THREE.LineSegments(
                    edgesGeometry,
                    new THREE.LineBasicMaterial({ color: 0x0a0a0a })
                );
                mesh.add(line);
                cubeGroup.add(mesh);
                cubies.push(mesh);
            }
        }
    }
}
buildCube();

// ---------- move engine ----------
// axis: "x" | "y" | "z"; layer: -1 | 0 | 1 (grid coordinate); angle in radians about the world axis
let animating = false;
const pivot = new THREE.Group();

function cubiesInLayer(axis, layer) {
    return cubies.filter((c) => Math.round(c.position[axis] / GAP) === layer);
}

function snapTransform(obj) {
    obj.position.set(
        Math.round(obj.position.x / GAP) * GAP,
        Math.round(obj.position.y / GAP) * GAP,
        Math.round(obj.position.z / GAP) * GAP
    );
    // Round the rotation matrix entries directly (they are always exactly
    // -1/0/1 for this cube's orientation group) instead of Euler angles,
    // which would risk gimbal-lock snapping errors near +/-90 deg pitch.
    const m = new THREE.Matrix4().makeRotationFromQuaternion(obj.quaternion);
    const el = m.elements;
    for (const i of [0, 1, 2, 4, 5, 6, 8, 9, 10]) el[i] = Math.round(el[i]);
    obj.quaternion.setFromRotationMatrix(m);
}

function axisVector(axis) {
    return new THREE.Vector3(axis === "x" ? 1 : 0, axis === "y" ? 1 : 0, axis === "z" ? 1 : 0);
}

function rotateLayer(axis, layer, angle, duration = 160) {
    return new Promise((resolve) => {
        const layerCubies = cubiesInLayer(axis, layer);
        const axisVec = axisVector(axis);
        pivot.rotation.set(0, 0, 0);
        pivot.position.set(0, 0, 0);
        cubeGroup.add(pivot);
        layerCubies.forEach((c) => pivot.attach(c));

        const start = performance.now();
        function step(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            pivot.quaternion.setFromAxisAngle(axisVec, angle * eased);
            if (t < 1) {
                requestAnimationFrame(step);
            } else {
                pivot.updateMatrixWorld();
                layerCubies.forEach((c) => {
                    cubeGroup.attach(c);
                    snapTransform(c);
                });
                cubeGroup.remove(pivot);
                resolve();
            }
        }
        requestAnimationFrame(step);
    });
}

// Face notation: R,L,U,D,F,B (+ "'" for prime, "2" for double).
// Convention (X right, Y up, Z front, right-handed): a clockwise turn of a
// positive-side face (R/U/F), viewed from outside that face, is a NEGATIVE
// rotation about the corresponding world axis; negative-side faces (L/D/B)
// use the opposite sign.
const AXIS_BY_FACE = { R: "x", L: "x", U: "y", D: "y", F: "z", B: "z" };
const LAYER_BY_FACE = { R: 1, L: -1, U: 1, D: -1, F: 1, B: -1 };
const BASE_SIGN_BY_FACE = { R: -1, L: 1, U: -1, D: 1, F: -1, B: 1 };
const FACES = ["R", "L", "U", "D", "F", "B"];

async function applyMove(move) {
    const face = move[0];
    const mod = move.slice(1); // "", "'", "2"
    const turns = mod === "2" ? 2 : 1;
    const sign = BASE_SIGN_BY_FACE[face] * (mod === "'" ? -1 : 1);
    await rotateLayer(
        AXIS_BY_FACE[face],
        LAYER_BY_FACE[face],
        sign * SNAP * turns,
        mod === "2" ? 200 : 150
    );
}

async function scramble(count = 22) {
    if (animating) return;
    animating = true;
    setControlsEnabled(true);
    hideSolvedBanner();
    let lastFace = null;
    const mods = ["", "'", "2"];
    for (let i = 0; i < count; i++) {
        let face;
        do {
            face = FACES[Math.floor(Math.random() * FACES.length)];
        } while (face === lastFace);
        lastFace = face;
        const mod = mods[Math.floor(Math.random() * mods.length)];
        await applyMove(face + mod);
    }
    animating = false;
}

function resetCube() {
    if (animating) return;
    buildCube();
    hideSolvedBanner();
}

// ---------- solved detection ----------
const FACE_NORMALS = [
    new THREE.Vector3(1, 0, 0), new THREE.Vector3(-1, 0, 0),
    new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, -1, 0),
    new THREE.Vector3(0, 0, 1), new THREE.Vector3(0, 0, -1),
];

function outwardFaceColor(cubie, worldNormal) {
    let best = -1;
    let bestIdx = -1;
    FACE_NORMALS.forEach((n, i) => {
        const wn = n.clone().applyQuaternion(cubie.quaternion);
        const d = wn.dot(worldNormal);
        if (d > best) {
            best = d;
            bestIdx = i;
        }
    });
    if (best < 0.9) return null;
    return cubie.material[bestIdx].color.getHex();
}

function isSolved() {
    const faceAxis = [["x", 1], ["x", -1], ["y", 1], ["y", -1], ["z", 1], ["z", -1]];
    for (const [axis, layer] of faceAxis) {
        const worldNormal = axisVector(axis).multiplyScalar(layer);
        let refColor = null;
        for (const c of cubiesInLayer(axis, layer)) {
            const color = outwardFaceColor(c, worldNormal);
            if (color === null) continue;
            if (refColor === null) refColor = color;
            else if (color !== refColor) return false;
        }
    }
    return true;
}

function showSolvedBanner() {
    document.getElementById("solved-banner").hidden = false;
}
function hideSolvedBanner() {
    document.getElementById("solved-banner").hidden = true;
}

// ---------- pointer interaction: orbit view vs. layer drag ----------
const raycaster = new THREE.Raycaster();
const pointerNdc = new THREE.Vector2();
let dragState = null;
const DRAG_THRESHOLD = 6; // px
const ROTATE_SENSITIVITY = 0.012;

function setControlsEnabled(v) {
    controls.enabled = v;
}

function getNdc(event) {
    const rect = renderer.domElement.getBoundingClientRect();
    pointerNdc.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
    pointerNdc.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
    return pointerNdc;
}

// Projects a world point to CSS pixel coordinates (y-down), matching
// event.clientX/clientY, so screen-space direction comparisons stay consistent.
function worldToScreenPx(vec3) {
    const v = vec3.clone().project(camera);
    const rect = renderer.domElement.getBoundingClientRect();
    return {
        x: (v.x * 0.5 + 0.5) * rect.width,
        y: (-v.y * 0.5 + 0.5) * rect.height,
    };
}

function pickCubie(event) {
    getNdc(event);
    raycaster.setFromCamera(pointerNdc, camera);
    const hits = raycaster.intersectObjects(cubies, false);
    return hits.length ? hits[0] : null;
}

renderer.domElement.addEventListener(
    "pointerdown",
    (event) => {
        if (animating) return;
        const hit = pickCubie(event);
        if (!hit) return; // let OrbitControls handle background drag (view orbit)

        event.stopPropagation();
        setControlsEnabled(false);
        renderer.domElement.setPointerCapture(event.pointerId);

        const normal = hit.face.normal.clone().transformDirection(hit.object.matrixWorld).round();
        // candidate tangent axes = the two basis axes orthogonal to the face normal
        const axes = ["x", "y", "z"].filter((a) => Math.abs(normal[a]) < 0.5);

        dragState = {
            pointerId: event.pointerId,
            cubie: hit.object,
            normal,
            cubieCenter: hit.object.position.clone(),
            axes,
            startClientX: event.clientX,
            startClientY: event.clientY,
            rotating: false,
        };
    },
    { capture: true }
);

renderer.domElement.addEventListener("pointermove", (event) => {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const totalDx = event.clientX - dragState.startClientX;
    const totalDy = event.clientY - dragState.startClientY;

    if (!dragState.rotating) {
        if (Math.hypot(totalDx, totalDy) < DRAG_THRESHOLD) return;

        // Pick whichever candidate tangent axis's on-screen projection best
        // matches the drag direction; that becomes the "swept" axis (D).
        const originPx = worldToScreenPx(dragState.cubieCenter);
        let bestAxisName = null;
        let bestDir = null;
        let bestAbsScore = -Infinity;
        for (const axisName of dragState.axes) {
            const tipPx = worldToScreenPx(dragState.cubieCenter.clone().add(axisVector(axisName)));
            const dir = { x: tipPx.x - originPx.x, y: tipPx.y - originPx.y };
            const len = Math.hypot(dir.x, dir.y) || 1;
            dir.x /= len;
            dir.y /= len;
            const score = totalDx * dir.x + totalDy * dir.y;
            if (Math.abs(score) > bestAbsScore) {
                bestAbsScore = Math.abs(score);
                bestAxisName = axisName;
                bestDir = dir;
            }
        }

        // Rotation axis = faceNormal x sweptAxis (right-hand rule); this makes
        // the grabbed point visually follow the mouse regardless of camera angle.
        const rotationAxisVec = dragState.normal.clone().cross(axisVector(bestAxisName)).normalize();
        const rotationAxisName = ["x", "y", "z"].find(
            (a) => Math.abs(Math.abs(rotationAxisVec[a]) - 1) < 0.01
        );
        const layer = Math.round(dragState.cubie.position[rotationAxisName] / GAP);

        dragState.rotating = true;
        dragState.screenDir = bestDir;
        dragState.axisSignedVec = rotationAxisVec;
        dragState.axis = rotationAxisName;
        dragState.layer = layer;
        dragState.layerCubies = cubiesInLayer(rotationAxisName, layer);
        dragState.angle = 0;

        pivot.rotation.set(0, 0, 0);
        pivot.position.set(0, 0, 0);
        cubeGroup.add(pivot);
        dragState.layerCubies.forEach((c) => pivot.attach(c));
        return;
    }

    const score = totalDx * dragState.screenDir.x + totalDy * dragState.screenDir.y;
    dragState.angle = score * ROTATE_SENSITIVITY;
    pivot.quaternion.setFromAxisAngle(dragState.axisSignedVec, dragState.angle);
});

async function finishDrag(event) {
    if (!dragState || event.pointerId !== dragState.pointerId) return;
    const ds = dragState;
    dragState = null;

    if (!ds.rotating) {
        setControlsEnabled(true);
        return;
    }

    animating = true;
    const targetAngle = Math.round(ds.angle / SNAP) * SNAP;
    const from = ds.angle;
    const duration = 120;
    const start = performance.now();
    await new Promise((resolve) => {
        function step(now) {
            const t = Math.min(1, (now - start) / duration);
            const eased = 1 - Math.pow(1 - t, 3);
            pivot.quaternion.setFromAxisAngle(ds.axisSignedVec, from + (targetAngle - from) * eased);
            if (t < 1) requestAnimationFrame(step);
            else resolve();
        }
        requestAnimationFrame(step);
    });

    pivot.updateMatrixWorld();
    ds.layerCubies.forEach((c) => {
        cubeGroup.attach(c);
        snapTransform(c);
    });
    cubeGroup.remove(pivot);
    animating = false;
    setControlsEnabled(true);

    if (isSolved()) showSolvedBanner();
}

renderer.domElement.addEventListener("pointerup", finishDrag);
renderer.domElement.addEventListener("pointercancel", finishDrag);

// ---------- UI wiring ----------
document.getElementById("btn-scramble").addEventListener("click", () => scramble());
document.getElementById("btn-reset").addEventListener("click", () => resetCube());
document.getElementById("btn-view").addEventListener("click", () => {
    camera.position.copy(DEFAULT_CAM_POS);
    controls.target.set(0, 0, 0);
    controls.update();
});

// ---------- render loop ----------
function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
resize();
animate();
