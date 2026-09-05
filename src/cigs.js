// 담배 4종. 실제 브랜드 표기는 하지 않고 색·연기 느낌만 다르게 한다.
export const CIG_TYPES = [
  {
    id: 'masse',
    name: '마쎄',
    tagline: '부드럽게 술술',
    pack: { base: '#f5f6fa', accent: '#1f3f95', label: '#1f3f95' },
    smoke: { rgb: [236, 236, 242], alpha: 0.5 },
    menthol: false,
    burnRate: 1.0,
  },
  {
    id: 'malle',
    name: '말레',
    tagline: '진하고 묵직하게',
    pack: { base: '#c8102e', accent: '#ffffff', label: '#ffffff' },
    smoke: { rgb: [205, 205, 210], alpha: 0.72 },
    menthol: false,
    burnRate: 1.15,
  },
  {
    id: 'abul',
    name: '아블',
    tagline: '캡슐 톡, 민트 폭발',
    pack: { base: '#e8fbf4', accent: '#00a884', label: '#00795f' },
    smoke: { rgb: [196, 255, 240], alpha: 0.58 },
    menthol: true,
    sparkle: '#7dffe0',
    burnRate: 1.0,
  },
  {
    id: 'icejack',
    name: '아이스잭',
    tagline: '얼음장 같은 청량함',
    pack: { base: '#0b1f3a', accent: '#7cc7ff', label: '#cfe9ff' },
    smoke: { rgb: [205, 236, 255], alpha: 0.6 },
    menthol: true,
    sparkle: '#a8dcff',
    burnRate: 0.95,
  },
];

export function getCigType(id) {
  return CIG_TYPES.find((t) => t.id === id) ?? CIG_TYPES[0];
}
