import test from 'node:test';
import assert from 'node:assert/strict';
import { deriveMode, boardText, SLEEP_AFTER, LISTEN_FOR, TALK_FOR } from '../src/renderer/mode.js';
import { setLang } from '../src/shared/i18n.js';

setLang('ko');

const now = 1_000_000;
const agent = (fields = {}) => ({
  kind: 'main', status: 'busy', finished: false, pending: [], current: null,
  statusSince: now, lastEventAt: now, ...fields,
});

test('수면 기준은 10분이다', () => {
  assert.equal(SLEEP_AFTER, 10 * 60_000);
});

for (const [name, fields, expected] of [
  ['완료는 대기보다 우선', { finished: true, status: 'waiting' }, 'returning'],
  ['명시적 대기는 도구보다 우선', { status: 'waiting', pending: [{ cat: 'read' }] }, 'waiting'],
  ['서브는 idle이어도 작업 중', { kind: 'sub', status: 'idle' }, 'thinking'],
  ['서브도 명시적 대기는 유지', { kind: 'sub', status: 'waiting' }, 'waiting'],
  ['질문 도구', { pending: [{ cat: 'ask' }] }, 'waiting'],
  ['에이전트 호출', { pending: [{ cat: 'agent' }] }, 'supervise'],
  ['일반 도구', { pending: [{ cat: 'read' }] }, 'work'],
  ['마지막 pending이 기준', { pending: [{ cat: 'ask' }, { cat: 'run' }] }, 'work'],
  ['pending은 최근 요청보다 우선', { pending: [{ cat: 'read' }], current: { type: 'prompt', ts: now } }, 'work'],
  ['최근 요청', { current: { type: 'prompt', ts: now - LISTEN_FOR + 1 } }, 'listening'],
  ['요청 경계', { current: { type: 'prompt', ts: now - LISTEN_FOR } }, 'thinking'],
  ['최근 발언', { current: { type: 'text', ts: now - TALK_FOR + 1 } }, 'talking'],
  ['발언 경계', { current: { type: 'text', ts: now - TALK_FOR } }, 'thinking'],
  ['활동 없는 busy', {}, 'thinking'],
  ['pending 필드 없는 busy', { pending: undefined }, 'thinking'],
  ['쉬는 메인은 최근 요청이 있어도 idle', { status: 'idle', current: { type: 'prompt', ts: now } }, 'idle'],
  ['수면 경계는 idle', { status: 'idle', statusSince: now - SLEEP_AFTER, lastEventAt: now - SLEEP_AFTER }, 'idle'],
  ['수면 기준 초과는 sleep', { status: 'idle', statusSince: now - SLEEP_AFTER - 1, lastEventAt: now - SLEEP_AFTER - 1 }, 'sleep'],
  ['최근 상태 변경이 잠을 미룸', { status: 'idle', statusSince: now - 10, lastEventAt: now - SLEEP_AFTER - 1 }, 'idle'],
  ['최근 활동이 잠을 미룸', { status: 'idle', statusSince: now - SLEEP_AFTER - 1, lastEventAt: now - 10 }, 'idle'],
  ['서브는 오래 idle이어도 생각 중', { kind: 'sub', status: 'idle', statusSince: 1, lastEventAt: 1 }, 'thinking'],
]) {
  test(`deriveMode: ${name}`, () => {
    assert.equal(deriveMode(agent(fields), now), expected);
  });
}

for (const [name, mode, fields, expected] of [
  ['도구', 'work', { pending: [{ icon: '📖', vk: 'Read', arg: 'main.js' }] }, ['📖 읽는 중', 'main.js']],
  ['MCP 도구는 이름 그대로', 'work', { pending: [{ icon: '🔌', verb: 'open page', arg: 'x' }] }, ['🔌 open page', 'x']],
  ['도구 인자 없음', 'work', { pending: [{ icon: '📖', verb: '읽는 중' }] }, ['📖 읽는 중', '']],
  ['도구 없음', 'work', {}, null],
  ['마지막 도구', 'work', { pending: [{ icon: '📖', verb: '읽는 중' }, { icon: '⌨️', verb: '실행 중', arg: 'npm test' }] }, ['⌨️ 실행 중', 'npm test']],
  ['도우미 설명', 'supervise', { pending: [{ description: '조사', arg: '대체' }] }, ['👀 도우미 기다리는 중', '조사']],
  ['도우미 인자', 'supervise', { pending: [{ arg: '대체' }] }, ['👀 도우미 기다리는 중', '대체']],
  ['도우미 정보 없음', 'supervise', {}, ['👀 도우미 기다리는 중', '']],
  ['질문', 'waiting', { pending: [{ cat: 'ask', arg: '어느 파일인가요?', verb: '질문' }] }, ['🙋 확인이 필요해요!', '어느 파일인가요?']],
  ['질문 인자 없음', 'waiting', { pending: [{ cat: 'ask', verb: '질문' }] }, ['🙋 확인이 필요해요!', '질문']],
  ['상태 대기', 'waiting', {}, ['🙋 확인이 필요해요!', 'Claude 창을 봐 주세요']],
  ['일반 도구 대기', 'waiting', { pending: [{ cat: 'read' }] }, ['🙋 확인이 필요해요!', 'Claude 창을 봐 주세요']],
  ['요청', 'listening', { lastPrompt: '테스트 작성' }, ['📨 새 요청 받았어요', '테스트 작성']],
  ['요청 없음', 'listening', {}, ['📨 새 요청 받았어요', '']],
  ['현재 발언', 'talking', { current: { text: '현재' }, lastText: '이전' }, ['💬 할 말', '현재']],
  ['마지막 발언', 'talking', { lastText: '이전' }, ['💬 할 말', '이전']],
  ['발언 없음', 'talking', {}, ['💬 할 말', '']],
  ['생각', 'thinking', {}, ['💭 생각 중…', '']],
  ['완료', 'done', { lastText: '결과' }, ['✅ 다 했어요!', '결과']],
  ['완료 발언 없음', 'done', {}, ['✅ 다 했어요!', '']],
  ['휴식', 'idle', { lastPrompt: '테스트' }, ['☕ 쉬는 중', '마지막 요청: 테스트']],
  ['휴식 요청 없음', 'idle', {}, ['☕ 쉬는 중', '']],
  ['복귀', 'returning', { description: '조사 결과' }, ['📜 끝! 보고하러 가요', '조사 결과']],
  ['복귀 설명 없음', 'returning', {}, ['📜 끝! 보고하러 가요', '']],
  ['수면', 'sleep', {}, null],
  ['모르는 모드', 'unknown', {}, null],
]) {
  test(`boardText: ${name}`, () => {
    assert.deepEqual(boardText(agent(fields), mode), expected);
  });
}
