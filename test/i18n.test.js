import test from 'node:test';
import assert from 'node:assert/strict';
import { LANGS, resolveLang, setLang, getLang, t, toolVerb, logText, agentLabel } from '../src/shared/i18n.js';

test.afterEach(() => setLang('ko'));

for (const [name, pref, preferred, expected] of [
  ['직접 고른 언어', 'ja', ['ko-KR'], 'ja'],
  ['시스템 한국어', 'system', ['ko-KR', 'en-US'], 'ko'],
  ['시스템 일본어', 'system', ['ja-JP'], 'ja'],
  ['번체 중국어도 중국어', 'system', ['zh-Hant-TW'], 'zh'],
  ['밑줄 형식', 'system', ['zh_CN'], 'zh'],
  ['지원 안 하는 언어는 건너뜀', 'system', ['fr-FR', 'ja-JP'], 'ja'],
  ['아무것도 못 고르면 영어', 'system', ['fr-FR', 'de'], 'en'],
  ['목록이 비면 영어', 'system', [], 'en'],
  ['이상한 설정값은 시스템 언어', 'xx', ['ko'], 'ko'],
]) {
  test(`resolveLang: ${name}`, () => {
    assert.equal(resolveLang(pref, preferred), expected);
  });
}

test('모든 언어가 한국어와 같은 키를 가진다', () => {
  setLang('ko');
  const probe = (l) => {
    setLang(l);
    return t;
  };
  // 키 목록은 영어로 떨어지는지로 확인한다: 각 언어에서 영어 문장과 같으면 빠진 것
  const keys = ['tray.gather', 'panel.pinnedBtn', 'card.recent', 'bt.done', 'st.calling-done', 'call.ask', 'tool.WrapUp', 'animal.rabbit', 'fur.blue'];
  for (const l of LANGS.filter((x) => x !== 'en')) {
    for (const k of keys) {
      const en = probe('en')(k);
      assert.notEqual(probe(l)(k), en, `${l}:${k}`);
    }
  }
});

test('setLang: 모르는 언어는 영어', () => {
  setLang('fr');
  assert.equal(getLang(), 'en');
});

test('t: 자리 채우기와 없는 키', () => {
  setLang('ko');
  assert.equal(t('card.helpersWorking', { n: 2 }), '2마리 일하는 중');
  assert.equal(t('nope.key'), 'nope.key');
  setLang('en');
  assert.equal(t('ago.m', { n: 5 }), '5m ago');
});

test('toolVerb: 아는 도구는 번역, MCP 는 그대로', () => {
  setLang('en');
  assert.equal(toolVerb({ vk: 'Read' }), 'Reading');
  setLang('ja');
  assert.equal(toolVerb({ vk: 'Bash' }), '実行中');
  assert.equal(toolVerb({ verb: 'open page', name: 'mcp__x__open_page' }), 'open page');
  assert.equal(toolVerb({ name: 'Mystery' }), 'Mystery');
});

test('logText: 키·도구·글', () => {
  setLang('zh');
  assert.equal(logText({ tk: 'log.interrupted' }), '已中断');
  assert.equal(logText({ vk: 'Edit', arg: 'a.js' }), '修改中 · a.js');
  assert.equal(logText({ vk: 'TodoWrite', arg: '' }), '整理待办');
  assert.equal(logText({ text: '안녕' }), '안녕');
});

test('agentLabel: 메인은 이름, 서브는 종류 · 임무', () => {
  setLang('en');
  assert.equal(agentLabel({ kind: 'main', name: '세션' }), '세션');
  assert.equal(agentLabel({ kind: 'sub', agentType: 'Explore', description: '조사' }), 'Explore · 조사');
  assert.equal(agentLabel({ kind: 'sub', description: '조사' }), 'Helper · 조사');
  assert.equal(agentLabel({ kind: 'sub' }), 'Helper');
});
