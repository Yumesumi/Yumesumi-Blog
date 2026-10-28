/**
 * 全站导航。
 *
 * 顶栏、移动端菜单与页脚共用同一份配置，避免三处各写一遍后不一致。
 */
export interface NavItem {
  label: string;
  labelZh: string;
  href: string;
  key: string;
}

export const PRIMARY_NAV: NavItem[] = [
  { label: 'HOME', labelZh: '首页', href: '/', key: 'home' },
  { label: 'TAGS', labelZh: '标签', href: '/tags/', key: 'tags' },
  { label: 'ABOUT', labelZh: '关于', href: '/about/', key: 'about' },
  { label: 'SEARCH', labelZh: '搜索', href: '/search/', key: 'search' },
];
