// 紀錄用的時間戳：本機時區（東九區）的 ISO 8601，帶偏移量（2026-09-23T22:27:18.597+09:00），仍可被 Date 解析。
const pad = (n, w = 2) => String(n).padStart(w, '0');

export function localIso(date = new Date()) {
  const offset = -date.getTimezoneOffset();
  const sign = offset >= 0 ? '+' : '-';
  const abs = Math.abs(offset);
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`
    + `T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${pad(date.getMilliseconds(), 3)}`
    + `${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}
