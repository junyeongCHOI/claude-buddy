// 모니터마다 하나씩 있는 투명 오버레이 화면.
// 첫 화면(home, 패널이 있는 모니터)은 이 문서이고, 나머지 모니터는 window.open 으로 연 자식 창이다.
// 자식 창은 같은 렌더러 프로세스라 이 스크립트가 DOM 을 직접 만지고, 캐릭터·보드 요소를 창 사이로 옮긴다.

import { getLang } from '../shared/i18n.js';

export class View {
  constructor(id, rect, win) {
    this.id = String(id);
    this.win = win;
    this.doc = win.document;
    this.boards = this.doc.getElementById('boards');
    this.stage = this.doc.getElementById('stage');
    this.fx = this.doc.getElementById('fx');
    this.ui = this.doc.getElementById('ui');
    this.interactive = false;
    this.setRect(rect);
  }

  setRect(r) {
    this.x = r.x;
    this.y = r.y;
    this.w = r.w;
    this.h = r.h;
  }
}

const SHELL = (css) =>
  `<!doctype html><html lang="${getLang()}"><head><meta charset="utf-8">` +
  `<link rel="stylesheet" href="${css}"></head><body>` +
  '<div id="boards"></div>' +
  '<div id="stage"></div><div id="fx"></div><div id="ui"></div></body></html>';

/** 다른 모니터용 자식 창을 열고 오버레이 뼈대를 채운다 (메인 프로세스가 창 위치·투명·클릭 통과를 맞춘다) */
export function openChildView(display) {
  // 위치·크기를 같이 넘겨야 부모 창 옆으로 계단식 배치되지 않는다
  const win = window.open('about:blank', `buddy-display-${display.id}`, `left=${display.x},top=${display.y},width=${display.w},height=${display.h}`);
  if (!win) return null;
  const doc = win.document;
  doc.open();
  doc.write(SHELL(new URL('style.css', location.href).href)); // 고정된 뼈대만 쓴다 (사용자 데이터 없음)
  doc.close();
  return new View(display.id, display, win);
}
