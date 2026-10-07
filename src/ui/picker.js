import * as THREE from 'three';
import { cutPlane } from '../scene/materials.js';

/**
 * Works out which engine part is under the pointer.
 *
 * three's Raycaster knows nothing about clipping planes or hidden parents, so each hit is
 * checked by hand: skip anything sliced away by the cutaway, anything inside a hidden group,
 * and any shell that x-ray has made see-through.
 */
export function createPicker({ canvas, camera, engine, isEnabled, onHover, onPick }) {
  const ray = new THREE.Raycaster();
  ray.layers.enableAll(); // the orange section faces are drawn on a separate layer
  const ndc = new THREE.Vector2();

  const visibleDeep = (o) => {
    for (let n = o; n; n = n.parent) if (!n.visible) return false;
    return true;
  };
  const partOf = (o) => {
    for (let n = o; n; n = n.parent) if (n.name && engine.parts[n.name] === n) return n.name;
    return null;
  };

  /** @returns {{id: string, part: string, point: THREE.Vector3} | null} */
  function pickAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    const hits = ray.intersectObjects(engine.pickRoots, true);
    for (const h of hits) {
      const o = h.object;
      if (!o.userData.infoId || o.userData.noPick) continue;
      if (cutPlane.distanceToPoint(h.point) < -1e-4) continue; // sliced away
      const m = o.material;
      if (m.userData?.ghost && m.opacity < 0.5) continue; // see-through shell
      if (!visibleDeep(o)) continue;
      return { id: o.userData.infoId, part: partOf(o), point: h.point.clone() };
    }
    return null;
  }

  /** The ray under the pointer, for dragging things across a plane. */
  function rayAt(clientX, clientY) {
    const r = canvas.getBoundingClientRect();
    ndc.set(((clientX - r.left) / r.width) * 2 - 1, -((clientY - r.top) / r.height) * 2 + 1);
    ray.setFromCamera(ndc, camera);
    return ray.ray;
  }

  // hover is resolved once per frame, however many pointer events arrive
  let pending = null;
  let inside = false;
  let down = null;
  let lastHover = null;

  canvas.addEventListener('pointermove', (e) => {
    inside = true;
    pending = { x: e.clientX, y: e.clientY, buttons: e.buttons };
  });
  canvas.addEventListener('pointerleave', () => {
    inside = false;
    pending = null;
    if (lastHover !== null) {
      lastHover = null;
      onHover(null, 0, 0);
    }
  });
  canvas.addEventListener('pointerdown', (e) => {
    if (e.button !== 0) return;
    down = { x: e.clientX, y: e.clientY, t: performance.now() };
  });
  canvas.addEventListener('pointerup', (e) => {
    if (!down) return;
    const moved = Math.hypot(e.clientX - down.x, e.clientY - down.y);
    const quick = performance.now() - down.t < 450;
    down = null;
    // a click, not the end of an orbit drag
    if (moved < 6 && quick && isEnabled()) onPick(pickAt(e.clientX, e.clientY), e);
  });

  return {
    pickAt,
    rayAt,
    /** Call once per frame. */
    update() {
      if (!pending) return;
      const p = pending;
      pending = null;
      if (!inside) return;
      // while a button is held the user is orbiting or dragging: leave the hover alone
      if (p.buttons !== 0 || !isEnabled()) {
        if (lastHover !== null && !isEnabled()) {
          lastHover = null;
          onHover(null, p.x, p.y);
        }
        return;
      }
      const hit = pickAt(p.x, p.y);
      const id = hit ? hit.id : null;
      lastHover = id;
      onHover(id, p.x, p.y);
    },
    clearHover() {
      if (lastHover !== null) {
        lastHover = null;
        onHover(null, 0, 0);
      }
    },
  };
}
