// 小鎮居民：每個委託由一位居民提出（清單模式要幾樣東西、聽音模式由他念出單字）。
// 外觀是參數化的簡單頭像（src/components/game/ResidentAvatar.tsx），不另外生成素材。
import type { StageMode } from './stages';

export type Headwear = 'none' | 'cap' | 'chef' | 'nurse' | 'helmet' | 'beret' | 'bun' | 'pilot' | 'straw';

export interface ResidentLook {
  skin: string;
  hair: string;
  top: string;
  headwear: Headwear;
  glasses?: boolean;
}

export interface Resident {
  name: string;
  role: string;
  look: ResidentLook;
}

const SKIN = { light: '#ffe0c7', mid: '#f1c27d', tan: '#d9a066', deep: '#a86b3c' } as const;
const HAIR = { black: '#2f2a28', brown: '#6d4c41', grey: '#b0bec5', gold: '#e0b24d' } as const;

const r = (name: string, role: string, look: ResidentLook): Resident => ({ name, role, look });

const CAST: Record<string, readonly Resident[]> = {
  park: [
    r('阿綠', '公園園丁', { skin: SKIN.tan, hair: HAIR.brown, top: '#7cb342', headwear: 'straw' }),
    r('小美', '遛狗的女孩', { skin: SKIN.light, hair: HAIR.black, top: '#f06292', headwear: 'bun' }),
    r('王奶奶', '來野餐的奶奶', { skin: SKIN.light, hair: HAIR.grey, top: '#9575cd', headwear: 'none', glasses: true }),
  ],
  street: [
    r('老陳', '雜貨店老闆', { skin: SKIN.mid, hair: HAIR.black, top: '#ef6c00', headwear: 'cap' }),
    r('麗莎', '麵包店老闆', { skin: SKIN.light, hair: HAIR.gold, top: '#ffffff', headwear: 'chef' }),
    r('阿哲', '送貨員', { skin: SKIN.deep, hair: HAIR.black, top: '#1e88e5', headwear: 'cap' }),
  ],
  riverside: [
    r('小河', '咖啡店店員', { skin: SKIN.light, hair: HAIR.brown, top: '#6d4c41', headwear: 'beret' }),
    r('林伯', '釣魚的伯伯', { skin: SKIN.tan, hair: HAIR.grey, top: '#43a047', headwear: 'straw' }),
    r('Mia', '散步的旅客', { skin: SKIN.mid, hair: HAIR.gold, top: '#26c6da', headwear: 'none', glasses: true }),
  ],
  supermarket: [
    r('阿芳', '收銀員', { skin: SKIN.light, hair: HAIR.black, top: '#e53935', headwear: 'cap' }),
    r('大明', '理貨員', { skin: SKIN.mid, hair: HAIR.brown, top: '#fb8c00', headwear: 'none' }),
    r('張媽媽', '來買菜的媽媽', { skin: SKIN.light, hair: HAIR.black, top: '#8e24aa', headwear: 'bun' }),
  ],
  station: [
    r('李站長', '站長', { skin: SKIN.mid, hair: HAIR.grey, top: '#1a237e', headwear: 'pilot' }),
    r('小安', '趕車的學生', { skin: SKIN.light, hair: HAIR.brown, top: '#29b6f6', headwear: 'none' }),
    r('Ken', '背包客', { skin: SKIN.tan, hair: HAIR.black, top: '#558b2f', headwear: 'cap' }),
  ],
  restaurant: [
    r('吳師傅', '主廚', { skin: SKIN.mid, hair: HAIR.black, top: '#ffffff', headwear: 'chef' }),
    r('小雅', '服務生', { skin: SKIN.light, hair: HAIR.brown, top: '#212121', headwear: 'bun' }),
    r('胖虎', '肚子餓的客人', { skin: SKIN.tan, hair: HAIR.black, top: '#ff7043', headwear: 'none' }),
  ],
  school: [
    r('林老師', '班導師', { skin: SKIN.light, hair: HAIR.black, top: '#5c6bc0', headwear: 'none', glasses: true }),
    r('小宇', '值日生', { skin: SKIN.mid, hair: HAIR.brown, top: '#ffca28', headwear: 'cap' }),
    r('陳伯', '工友伯伯', { skin: SKIN.tan, hair: HAIR.grey, top: '#78909c', headwear: 'none' }),
  ],
  hospital: [
    r('周醫師', '醫生', { skin: SKIN.light, hair: HAIR.black, top: '#e3f2fd', headwear: 'none', glasses: true }),
    r('小護士', '護理師', { skin: SKIN.mid, hair: HAIR.brown, top: '#f8bbd0', headwear: 'nurse' }),
    r('黃爺爺', '來看病的爺爺', { skin: SKIN.tan, hair: HAIR.grey, top: '#8d6e63', headwear: 'beret' }),
  ],
  airport: [
    r('Amy', '空服員', { skin: SKIN.light, hair: HAIR.gold, top: '#0d47a1', headwear: 'bun' }),
    r('趙機長', '機長', { skin: SKIN.mid, hair: HAIR.black, top: '#263238', headwear: 'pilot' }),
    r('Leo', '出國的旅客', { skin: SKIN.deep, hair: HAIR.black, top: '#ffa726', headwear: 'cap' }),
  ],
  library: [
    r('蘇小姐', '圖書館員', { skin: SKIN.light, hair: HAIR.brown, top: '#6d4c41', headwear: 'bun', glasses: true }),
    r('阿書', '寫作業的學生', { skin: SKIN.mid, hair: HAIR.black, top: '#26a69a', headwear: 'none' }),
    r('Mr. Green', '說故事的爺爺', { skin: SKIN.light, hair: HAIR.grey, top: '#388e3c', headwear: 'beret', glasses: true }),
  ],
  'post-office': [
    r('郵差阿伯', '郵差', { skin: SKIN.tan, hair: HAIR.grey, top: '#2e7d32', headwear: 'cap' }),
    r('小晴', '櫃檯人員', { skin: SKIN.light, hair: HAIR.black, top: '#43a047', headwear: 'none' }),
    r('Tom', '寄包裹的人', { skin: SKIN.mid, hair: HAIR.gold, top: '#ef5350', headwear: 'none', glasses: true }),
  ],
  'fire-station': [
    r('強哥', '消防員', { skin: SKIN.tan, hair: HAIR.black, top: '#c62828', headwear: 'helmet' }),
    r('小芬', '救護員', { skin: SKIN.light, hair: HAIR.brown, top: '#fb8c00', headwear: 'helmet' }),
    r('馬隊長', '消防隊長', { skin: SKIN.mid, hair: HAIR.grey, top: '#37474f', headwear: 'pilot' }),
  ],
};

// 自動擴展新增、還沒寫居民的街區
const GENERIC: readonly Resident[] = [
  r('小鈴', '好奇的小孩', { skin: SKIN.light, hair: HAIR.black, top: '#ffb300', headwear: 'bun' }),
  r('阿德', '熱心的鄰居', { skin: SKIN.mid, hair: HAIR.brown, top: '#00897b', headwear: 'cap' }),
  r('Nana', '剛搬來的新住戶', { skin: SKIN.deep, hair: HAIR.black, top: '#7e57c2', headwear: 'none', glasses: true }),
];

export function residentsOf(sceneId: string): readonly Resident[] {
  return CAST[sceneId] ?? GENERIC;
}

/** 第 index 個委託由誰提出：依序輪流 */
export function residentFor(sceneId: string, index: number): Resident {
  const cast = residentsOf(sceneId);
  return cast[((index % cast.length) + cast.length) % cast.length];
}

export function requestLine(mode: StageMode, count: number): string {
  if (mode === 'audio') return '我在找這個，你聽——';
  if (mode === 'recall') return '你還記得它原本放在哪裡嗎？';
  return `可以幫我找這 ${count} 樣東西嗎？`;
}

const THANKS = ['謝謝你！幫了大忙', '太好了，就是這些！', '你真厲害，謝謝！', '找得好快！感謝～'];

export function thanksLine(index: number): string {
  return THANKS[((index % THANKS.length) + THANKS.length) % THANKS.length];
}
