// 大網格細分：滾筒世界在頂點上彎曲（lib/city3d/curvature.ts），一整片的地面、長牆、長路面只有四個角會彎，
// 中間拉成直線就會和周圍錯開。這裡把三角形沿最長邊對半切，直到每條邊都短於「該處的上限」。
// 上限只看邊的中點離遊戲區多遠（近處 3 m、越遠越粗），共用的邊在兩個三角形裡切法一樣，不會裂縫。
import * as THREE from 'three';

export interface SubdivideOptions {
  /** 遊戲區中心（世界座標 x, z） */
  center: [number, number];
  /** 近處邊長上限（公尺） */
  near: number;
  /** 這個距離以內都用 near */
  radius: number;
  /** 超過 radius 後每公尺增加多少上限 */
  growth: number;
}

/** 三角形數超過這個就不再細分（避免地圖邊緣的大平面切爆） */
const MAX_TRIANGLES = 600_000;

export function edgeLimit(x: number, z: number, o: SubdivideOptions): number {
  const d = Math.hypot(x - o.center[0], z - o.center[1]);
  return o.near + Math.max(0, d - o.radius) * o.growth;
}

/** 回傳新的非索引幾何（含原本所有頂點屬性，線性內插）；沒有需要切的就回傳原幾何 */
export function subdivide(source: THREE.BufferGeometry, matrix: THREE.Matrix4, o: SubdivideOptions): THREE.BufferGeometry {
  const geo = source.index ? source.toNonIndexed() : source;
  const names = Object.keys(geo.attributes);
  const attrs = names.map((n) => geo.attributes[n] as THREE.BufferAttribute);
  const sizes = attrs.map((a) => a.itemSize);
  const stride = sizes.reduce((a, b) => a + b, 0);
  const posOffset = sizes.slice(0, names.indexOf('position')).reduce((a, b) => a + b, 0);
  const count = geo.attributes.position.count;

  // 每個頂點打包成一段 stride 長的陣列
  const pack = (i: number) => {
    const v = new Float32Array(stride);
    let k = 0;
    attrs.forEach((a, j) => {
      for (let c = 0; c < sizes[j]; c++) v[k++] = a.array[i * sizes[j] + c];
    });
    return v;
  };
  const world = new THREE.Vector3();
  const worldOf = (v: Float32Array) => world.set(v[posOffset], v[posOffset + 1], v[posOffset + 2]).applyMatrix4(matrix);
  const mid = (a: Float32Array, b: Float32Array) => a.map((x, i) => (x + b[i]) / 2);
  /** [邊長, 邊長 ÷ 中點的上限]；比值 > 1 就要切 */
  const measure = (a: Float32Array, b: Float32Array): [number, number] => {
    const pa = worldOf(a).clone();
    const pb = worldOf(b);
    const len = pa.distanceTo(pb);
    return [len, len / edgeLimit((pa.x + pb.x) / 2, (pa.z + pb.z) / 2, o)];
  };

  const out: Float32Array[] = [];
  let changed = false;
  const stack: Float32Array[][] = [];
  for (let t = 0; t < count; t += 3) stack.push([pack(t), pack(t + 1), pack(t + 2)]);
  while (stack.length) {
    const [a, b, c] = stack.pop()!;
    const m3 = [measure(a, b), measure(b, c), measure(c, a)];
    if (m3.every(([, r]) => r <= 1) || out.length / 3 + stack.length > MAX_TRIANGLES) {
      out.push(a, b, c);
      continue;
    }
    changed = true;
    // 有邊太長就從「幾何上最長」的邊中點切（切非最長邊會產生越來越細的三角形），保持原本的繞行方向；
    // 太長的邊遲早會變成所在三角形的最長邊而被切在中點，所以共用邊兩側切法一致
    const lens = m3.map(([len]) => len);
    const worst = lens.indexOf(Math.max(...lens));
    if (worst === 0) { const m = mid(a, b); stack.push([a, m, c], [m, b, c]); }
    else if (worst === 1) { const m = mid(b, c); stack.push([a, b, m], [a, m, c]); }
    else { const m = mid(c, a); stack.push([a, b, m], [m, b, c]); }
  }
  if (!changed) return source;

  const result = new THREE.BufferGeometry();
  let offset = 0;
  names.forEach((name, j) => {
    const size = sizes[j];
    const arr = new Float32Array(out.length * size);
    out.forEach((v, i) => {
      for (let c = 0; c < size; c++) arr[i * size + c] = v[offset + c];
    });
    offset += size;
    result.setAttribute(name, new THREE.BufferAttribute(arr, size, attrs[j].normalized));
  });
  if (result.attributes.normal) {
    // 內插後的法線長度會變短，卡通著色要單位向量
    const n = result.attributes.normal as THREE.BufferAttribute;
    const v = new THREE.Vector3();
    for (let i = 0; i < n.count; i++) {
      v.fromBufferAttribute(n, i).normalize();
      n.setXYZ(i, v.x, v.y, v.z);
    }
  }
  result.computeBoundingSphere();
  return result;
}
