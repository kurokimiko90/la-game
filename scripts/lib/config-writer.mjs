// 把一個場景寫進 content/scene-config.json：只動 world、order 兩行和這個場景的區塊，
// 其他場景（手寫的）格式原封不動，diff 才看得懂。純函式（文字進、文字出）。

/** 單行 JSON，格式同手寫的設定：`{"a": [1, 2], "b": "x"}` */
export function inline(value) {
  return JSON.stringify(value, null, 1).replace(/\n\s*/g, ' ').replace(/([[{]) /g, '$1').replace(/ ([\]}])/g, '$1');
}

function sceneBlock(id, cfg) {
  const lines = Object.entries(cfg).map(([key, value]) => {
    if (key === 'bands' || key === 'place') {
      const entries = Object.entries(value).map(([k, v]) => `        ${JSON.stringify(k)}: ${inline(v)}`);
      return entries.length ? `      "${key}": {\n${entries.join(',\n')}\n      }` : `      "${key}": {}`;
    }
    return `      ${JSON.stringify(key)}: ${inline(value)}`;
  });
  return `    ${JSON.stringify(id)}: {\n${lines.join(',\n')}\n    }`;
}

/** 找到 `"id": {` 區塊的範圍（大括號配對，略過字串內容） */
function findBlock(text, id) {
  const start = text.indexOf(`\n    ${JSON.stringify(id)}: {`);
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  for (let i = text.indexOf('{', start); i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}' && --depth === 0) return { start, end: i + 1 };
  }
  throw new Error(`scene-config.json 的 ${id} 區塊大括號沒有配對`);
}

/**
 * @param {string} text scene-config.json 原文
 * @param {string} id 場景 id
 * @param {object} cfg 場景設定
 * @param {{ world: { width: number, height: number }, order: string[] }} top
 * @returns {string}
 */
export function upsertScene(text, id, cfg, { world, order }) {
  let out = text
    .replace(/"world": \{[^}]*\}/, `"world": ${inline(world)}`)
    .replace(/"order": \[[^\]]*\]/, `"order": ${inline(order)}`);
  const block = findBlock(out, id);
  if (block) {
    out = `${out.slice(0, block.start)}\n${sceneBlock(id, cfg)}${out.slice(block.end)}`;
  } else {
    const end = out.lastIndexOf('\n    }\n  }\n}');
    if (end < 0) throw new Error('scene-config.json 的結尾格式和預期不同，無法插入新場景');
    out = `${out.slice(0, end)}\n    },\n${sceneBlock(id, cfg)}\n  }\n}\n`;
  }
  JSON.parse(out); // 寫壞就在這裡丟錯，不寫進檔案
  return out;
}
