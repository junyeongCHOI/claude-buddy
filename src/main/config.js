import fs from 'node:fs';
import path from 'node:path';
import { LANGS } from '../shared/i18n.js';

const DEFAULTS = {
  stageDisplayId: null, // 캐릭터가 노는 디스플레이
  showPanel: true, // 관계도 패널
  showSleeping: true, // 오래 쉬는 세션도 보이기
  pinnedOnly: true, // Claude 앱에서 고정한 세션만
  scale: 1,
  language: 'system', // 'system' 이면 시스템 언어, 아니면 ko·en·ja·zh
};

export function loadConfig(dir) {
  const file = path.join(dir, 'config.json');
  let saved = {};
  try {
    saved = JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    /* 처음 실행 */
  }
  const config = { ...DEFAULTS, ...saved };
  const normalize = () => {
    if (![0.75, 1, 1.5].includes(config.scale)) config.scale = 1;
    if (config.language !== 'system' && !LANGS.includes(config.language)) config.language = 'system';
  };
  normalize();
  const save = () => {
    normalize();
    try {
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(config, null, 2));
    } catch (err) {
      console.warn('[config] 저장 실패', err.message);
    }
  };
  return { config, save };
}
