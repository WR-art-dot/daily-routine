export const DB_NAME = 'lifeapp';
export const DB_VERSION = 1;

export const STORES = {
  plan: { keyPath: 'id', indexes: { by_date: 'date', by_module: 'module' } },
  memos: { keyPath: 'id', indexes: { by_createdAt: 'createdAt' } },
  media: { keyPath: 'id', indexes: { by_status: 'status', by_plannedDate: 'plannedDate' } },
  projects: { keyPath: 'id', indexes: { by_status: 'status' } },
  devTasks: { keyPath: 'id', indexes: { by_project: 'projectId' } },
  bugs: { keyPath: 'id', indexes: { by_project: 'projectId', by_status: 'status' } },
  releases: { keyPath: 'id', indexes: { by_project: 'projectId' } },
  devLogs: { keyPath: 'id', indexes: { by_project: 'projectId', by_date: 'date' } },
  refs: { keyPath: 'id', indexes: { by_status: 'status', by_year: 'year' } },
  events: { keyPath: 'id', indexes: { by_datetime: 'datetime' } },
  outputs: { keyPath: 'id', indexes: { by_kind: 'kind' } },
  exercises: { keyPath: 'id', indexes: { by_part: 'part' } },
  workouts: { keyPath: 'id', indexes: { by_date: 'date' } },
  foods: { keyPath: 'id', indexes: { by_name: 'name' } },
  meals: { keyPath: 'id', indexes: { by_date: 'date' } },
  weights: { keyPath: 'id', indexes: { by_date: 'date' } },
  wishes: { keyPath: 'id', indexes: { by_status: 'status' } },
  settings: { keyPath: 'key', indexes: {} }
};

export const STORE_NAMES = Object.keys(STORES);

export const MODULES = [
  { id: 'today', name: '今日计划', icon: 'today', color: 'var(--m-today)' },
  { id: 'media', name: '自媒体', icon: 'media', color: 'var(--m-media)' },
  { id: 'dev', name: '开发工作', icon: 'dev', color: 'var(--m-dev)' },
  { id: 'study', name: '学习工作', icon: 'study', color: 'var(--m-study)' },
  { id: 'fitness', name: '运动计划', icon: 'fitness', color: 'var(--m-fitness)' },
  { id: 'food', name: '饮食计划', icon: 'food', color: 'var(--m-food)' },
  { id: 'play', name: '游戏娱乐', icon: 'play', color: 'var(--m-play)' }
];

export function moduleMeta(id) {
  return MODULES.find((m) => m.id === id) || MODULES[0];
}

export const PLATFORMS = ['公众号', '小红书', 'B站', '知乎', '其他'];

export const MEDIA_STATUS = [
  { id: 'idea', name: '想法' },
  { id: 'outline', name: '大纲' },
  { id: 'drafting', name: '写作中' },
  { id: 'published', name: '已发布' }
];

export const PROJECT_STATUS = [
  { id: 'active', name: '进行中', color: 'var(--ok)' },
  { id: 'paused', name: '暂停', color: 'var(--warn)' },
  { id: 'done', name: '已完成', color: 'var(--accent)' },
  { id: 'archived', name: '搁置', color: 'var(--ink-3)' }
];

export const TASK_GROUPS = [
  { id: 'feature', name: '功能' },
  { id: 'fix', name: '修复' },
  { id: 'refactor', name: '优化' }
];

export const BUG_SEVERITY = [
  { id: 'blocker', name: '严重' },
  { id: 'major', name: '一般' },
  { id: 'minor', name: '轻微' }
];

export const REF_STATUS = [
  { id: 'todo', name: '待读' },
  { id: 'reading', name: '在读' },
  { id: 'done', name: '已读' }
];

export const EVENT_KINDS = [
  { id: 'meeting', name: '组会' },
  { id: 'course', name: '课程' },
  { id: 'deadline', name: '截止' }
];

export const OUTPUT_KINDS = [
  { id: 'outline', name: '提纲' },
  { id: 'abstract', name: '摘要' },
  { id: 'fragment', name: '片段' }
];

export const BODY_PARTS = [
  { id: 'chest', name: '胸' },
  { id: 'back', name: '背' },
  { id: 'legs', name: '腿' },
  { id: 'shoulders', name: '肩' },
  { id: 'arms', name: '臂' },
  { id: 'core', name: '核心' },
  { id: 'cardio', name: '有氧' }
];

export const MEAL_SLOTS = [
  { id: 'breakfast', name: '早餐' },
  { id: 'lunch', name: '午餐' },
  { id: 'dinner', name: '晚餐' },
  { id: 'snack', name: '加餐' }
];

export const WISH_KINDS = [
  { id: 'game', name: '游戏' },
  { id: 'show', name: '剧' },
  { id: 'book', name: '书' },
  { id: 'outing', name: '出行' },
  { id: 'place', name: '店' }
];

export const WISH_STATUS = [
  { id: 'want', name: '想做' },
  { id: 'doing', name: '在做' },
  { id: 'done', name: '已完成' },
  { id: 'onhold', name: '搁置' }
];

export function labelOf(list, id) {
  const hit = list.find((x) => x.id === id);
  return hit ? hit.name : id;
}
