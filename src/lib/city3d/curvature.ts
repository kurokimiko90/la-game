// 「滾筒世界」：離鏡頭越遠的東西往下彎，地平線變成一道弧，遠處大樓沉下去，畫面聚焦在身邊幾十公尺。
// 在世界座標裡往下彎：y -= k · (離鏡頭的水平距離)²（像站在小星球上），鏡頭越高越弱，
// 鳥瞰（高 110 m）與陰影貼圖（光源在 120 m）時完全不彎，所以陰影仍然對得上。
// 這裡是純數學（JS 與 GLSL 同一組常數），點選時用 unbendY 把射線還原成彎曲前的世界。

/** 彎曲強度：水平 30 m 往下 0.9 m、100 m 往下 10 m（銀座大樓高 30–60 m，太彎會像往內倒） */
export const CURVE_K = 0.001;
/** 鏡頭高度低於 FULL 時全彎、高於 NONE 時不彎 */
export const CURVE_FULL_BELOW = 25;
export const CURVE_NONE_ABOVE = 40;

export function curveAmount(cameraY: number): number {
  const t = (CURVE_NONE_ABOVE - cameraY) / (CURVE_NONE_ABOVE - CURVE_FULL_BELOW);
  return CURVE_K * Math.min(1, Math.max(0, t));
}

/** 世界座標的點彎曲後的 y；dx、dz = 離鏡頭的水平距離 */
export const bendY = (y: number, dx: number, dz: number, k: number) => y - k * (dx * dx + dz * dz);
/** 畫面上看到的點（已彎曲）還原成彎曲前的 y（水平距離不變，所以是精確反函數） */
export const unbendY = (y: number, dx: number, dz: number, k: number) => y + k * (dx * dx + dz * dz);

const f = (n: number) => n.toFixed(4);

/**
 * 插在 gl_Position 前的 GLSL：mv 是 view space 的 vec4。
 * 轉回「以鏡頭為原點的世界方向」量水平距離，再沿世界的上方向（在 view space 裡是 viewMatrix 第二欄）往下推。
 * three.js 的 viewMatrix、cameraPosition 在所有材質（含 ShaderMaterial）都有。
 */
export function curveGLSL(mv: string): string {
  return `{
    vec3 curveW = transpose(mat3(viewMatrix)) * ${mv}.xyz;
    float curveK = ${f(CURVE_K)} * clamp((${f(CURVE_NONE_ABOVE)} - cameraPosition.y) / ${f(CURVE_NONE_ABOVE - CURVE_FULL_BELOW)}, 0.0, 1.0);
    ${mv}.xyz -= curveK * dot(curveW.xz, curveW.xz) * viewMatrix[1].xyz;
  }`;
}
