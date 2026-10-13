import * as THREE from 'three';
import { Box, raycastBoxes } from '../world/collision';

interface Shot {
  mesh: THREE.Group;
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  damage: number;
  life: number;
}

const UP = new THREE.Vector3(0, 1, 0);
const streakGeo = new THREE.CylinderGeometry(0.035, 0.012, 0.9, 6);
streakGeo.translate(0, -0.45, 0);
const headGeo = new THREE.SphereGeometry(0.09, 8, 6);

/** Slow, visible enemy bullets: red ink streaks you can dodge (especially in slow-mo). */
export class Projectiles {
  private shots: Shot[] = [];
  private streakMat = new THREE.MeshBasicMaterial({ color: '#c0302a' });
  private headMat = new THREE.MeshBasicMaterial({ color: '#6e1414' });

  constructor(private scene: THREE.Scene) {}

  spawn(from: THREE.Vector3, dir: THREE.Vector3, speed: number, damage: number): void {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(streakGeo, this.streakMat), new THREE.Mesh(headGeo, this.headMat));
    g.quaternion.setFromUnitVectors(UP, dir);
    g.position.copy(from);
    this.scene.add(g);
    this.shots.push({ mesh: g, pos: from.clone(), vel: dir.clone().multiplyScalar(speed), damage, life: 5 });
  }

  /**
   * Advance shots. `hitPlayer` tests a point against the player; returns
   * damage dealt this frame. `onImpact` is called when a shot hits the world.
   */
  update(
    dt: number,
    boxes: Box[],
    hitPlayer: (p: THREE.Vector3) => boolean,
    onImpact: (p: THREE.Vector3, box: Box) => void,
  ): number {
    let dmg = 0;
    const step = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const probe = new THREE.Vector3();
    for (let i = this.shots.length - 1; i >= 0; i--) {
      const s = this.shots[i];
      s.life -= dt;
      step.copy(s.vel).multiplyScalar(dt);
      const len = step.length();
      dir.copy(step).divideScalar(len || 1);

      let hit = false;
      // Sub-sample the segment against the player capsule.
      const n = Math.max(1, Math.ceil(len / 0.2));
      for (let k = 1; k <= n; k++) {
        probe.copy(s.pos).addScaledVector(step, k / n);
        if (hitPlayer(probe)) {
          dmg += s.damage;
          hit = true;
          break;
        }
      }
      if (!hit) {
        const wh = raycastBoxes(boxes, s.pos, dir, len);
        if (wh) {
          probe.copy(s.pos).addScaledVector(dir, wh.t);
          onImpact(probe, wh.box);
          hit = true;
        }
      }
      if (hit || s.life <= 0) {
        this.scene.remove(s.mesh);
        this.shots.splice(i, 1);
        continue;
      }
      s.pos.add(step);
      s.mesh.position.copy(s.pos);
    }
    return dmg;
  }

  clear(): void {
    for (const s of this.shots) this.scene.remove(s.mesh);
    this.shots = [];
  }
}
