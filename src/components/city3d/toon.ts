// la-game 的 3D 畫風：三階卡通著色 + 墨色描邊（對應 2D SVG 的平塗色塊 + #37474f 描邊）。
import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries, mergeVertices } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { PALETTE, type Model3D, type Part } from '@/lib/city3d/model-dsl';

export const OUTLINE = { ink: '#37474f', hover: '#ffb300', found: '#00796b' } as const;

let gradient: THREE.DataTexture | null = null;

/** 三階明暗（亮面、中間調、暗面），不做連續漸層 */
export function toonGradient(): THREE.DataTexture {
  if (gradient) return gradient;
  gradient = new THREE.DataTexture(new Uint8Array([110, 190, 255]), 3, 1, THREE.RedFormat);
  gradient.minFilter = gradient.magFilter = THREE.NearestFilter;
  gradient.generateMipmaps = false;
  gradient.needsUpdate = true;
  return gradient;
}

export function toonMaterial(params: THREE.MeshToonMaterialParameters = {}): THREE.MeshToonMaterial {
  return new THREE.MeshToonMaterial({ gradientMap: toonGradient(), ...params });
}

const OUTLINE_VERTEX = `
uniform float width;
void main() {
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vec3 n = normalize(normalMatrix * normal);
  // 依距離放大，畫面上的線寬大致固定
  mv.xyz += n * width * clamp(-mv.z, 0.6, 60.0);
  gl_Position = projectionMatrix * mv;
}`;
const OUTLINE_FRAGMENT = `
uniform vec3 color;
void main() {
  gl_FragColor = vec4(color, 1.0);
  #include <colorspace_fragment>
}`;

/** 反轉外殼描邊：只畫背面、沿法線往外推 */
export function outlineMaterial(color: string = OUTLINE.ink, width = 0.0028): THREE.ShaderMaterial {
  return new THREE.ShaderMaterial({
    uniforms: { color: { value: new THREE.Color(color) }, width: { value: width } },
    vertexShader: OUTLINE_VERTEX,
    fragmentShader: OUTLINE_FRAGMENT,
    side: THREE.BackSide,
  });
}

function partGeometry(part: Part): THREE.BufferGeometry {
  let g: THREE.BufferGeometry;
  switch (part.s) {
    case 'box': {
      const [w, h, d] = part.size;
      const round = Math.min(part.round ?? 0, Math.min(w, h, d) / 2 - 1e-4);
      g = round > 0.004 ? new RoundedBoxGeometry(w, h, d, 2, round) : new THREE.BoxGeometry(w, h, d);
      break;
    }
    case 'cyl': g = new THREE.CylinderGeometry(part.r1, part.r0, part.h, part.seg ?? 16); break;
    case 'sph': g = new THREE.SphereGeometry(part.rad, 16, 12); break;
    case 'cone': g = new THREE.ConeGeometry(part.rad, part.h, part.seg ?? 16); break;
    case 'tor': g = new THREE.TorusGeometry(part.R, part.t, 8, 24, part.arc ?? Math.PI * 2); break;
  }
  if (part.s === 'sph' && part.scale) g.scale(...part.scale);
  if (part.r) {
    const [rx, ry, rz] = part.r.map(THREE.MathUtils.degToRad);
    g.applyMatrix4(new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(rx, ry, rz)));
  }
  g.translate(...part.p);
  const flat = g.index ? g.toNonIndexed() : g;
  if (flat !== g) g.dispose();
  flat.deleteAttribute('uv');
  const color = new THREE.Color(PALETTE[part.c]);
  const count = flat.attributes.position.count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i++) colors.set([color.r, color.g, color.b], i * 3);
  flat.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  return flat;
}

export interface BuiltModel {
  geometry: THREE.BufferGeometry;
  /** 描邊用：合併頂點後的平滑法線，外殼在方塊轉角才不會裂開 */
  outline: THREE.BufferGeometry | null;
}

export function buildModel(model: Model3D): BuiltModel {
  const parts = model.parts.map(partGeometry);
  const geometry = mergeGeometries(parts);
  for (const p of parts) p.dispose();
  if (!geometry) throw new Error('模型合併失敗');
  geometry.computeBoundingSphere();
  if (model.outline === false) return { geometry, outline: null };
  const hull = new THREE.BufferGeometry();
  hull.setAttribute('position', geometry.attributes.position.clone());
  const outline = mergeVertices(hull, 1e-3);
  hull.dispose();
  outline.computeVertexNormals();
  return { geometry, outline };
}
