export const ROUTES = [
  { name: 'home', path: '/home', title: '首页', icon: 'home', load: () => import('../views/home.js') },
  { name: 'today', path: '/today', title: '今日计划', icon: 'today', load: () => import('../views/today.js') },
  { name: 'media', path: '/media', title: '自媒体', icon: 'media', load: () => import('../views/media.js') },
  { name: 'dev', path: '/dev/:projectId?/:tab?', title: '开发工作', icon: 'dev', load: () => import('../views/dev.js') },
  { name: 'study', path: '/study', title: '学习工作', icon: 'study', load: () => import('../views/study.js') },
  { name: 'fitness', path: '/fitness', title: '运动计划', icon: 'fitness', load: () => import('../views/fitness.js') },
  { name: 'food', path: '/food', title: '饮食计划', icon: 'food', load: () => import('../views/food.js') },
  { name: 'play', path: '/play', title: '游戏娱乐', icon: 'play', load: () => import('../views/play.js') },
  { name: 'settings', path: '/settings', title: '数据与设置', icon: 'settings', load: () => import('../views/settings.js') }
];

export const RAIL = ROUTES.filter((r) => r.name !== 'settings');
export const SETTINGS_ROUTE = ROUTES.find((r) => r.name === 'settings');

function parseQuery(str) {
  const out = {};
  if (!str) return out;
  for (const pair of str.split('&')) {
    if (!pair) continue;
    const [k, v = ''] = pair.split('=');
    out[decodeURIComponent(k)] = decodeURIComponent(v);
  }
  return out;
}

function matchSegs(pattern, segs) {
  const parts = pattern.split('/').filter(Boolean);
  const params = {};
  let i = 0;
  for (const raw of parts) {
    const optional = raw.endsWith('?');
    const part = optional ? raw.slice(0, -1) : raw;
    if (part.startsWith(':')) {
      const key = part.slice(1);
      if (i < segs.length) {
        params[key] = decodeURIComponent(segs[i]);
        i += 1;
      } else if (optional) {
        params[key] = null;
      } else {
        return null;
      }
    } else if (segs[i] === part) {
      i += 1;
    } else {
      return null;
    }
  }
  return i === segs.length ? params : null;
}

export function parseRoute(hash) {
  const raw = String(hash || '').replace(/^#/, '');
  const qIndex = raw.indexOf('?');
  const rawPath = qIndex >= 0 ? raw.slice(0, qIndex) : raw;
  const query = parseQuery(qIndex >= 0 ? raw.slice(qIndex + 1) : '');
  const segs = rawPath.split('/').filter(Boolean);

  for (const route of ROUTES) {
    const params = matchSegs(route.path, segs);
    if (params) {
      return { name: route.name, route, params, query, path: '/' + segs.join('/') };
    }
  }
  return { name: 'home', route: ROUTES[0], params: {}, query, path: '/home', fallback: true };
}

export function routeInfo(name) {
  return ROUTES.find((r) => r.name === name) || ROUTES[0];
}

export function navigate(path, opts = {}) {
  const next = '#' + (path.startsWith('/') ? path : '/' + path);
  if (opts.replace || !location.hash) {
    history.replaceState(null, '', next);
    dispatchEvent(new HashChangeEvent('hashchange'));
  } else if (location.hash !== next) {
    location.hash = next;
  }
}

export function start(cb) {
  if (!location.hash) history.replaceState(null, '', '#/home');
  const handler = () => cb(parseRoute(location.hash));
  window.addEventListener('hashchange', handler);
  handler();
  return () => window.removeEventListener('hashchange', handler);
}
