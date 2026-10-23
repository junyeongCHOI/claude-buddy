import test from 'node:test';
import assert from 'node:assert/strict';
import { newAgent, applyActivity, setStatus, publicAgent } from '../src/shared/agent-state.js';

const makeAgent = () => newAgent({ key: 'sid', sessionId: 'sid', kind: 'main', status: 'busy' });
const tool = (id, ts = 100) => ({
  type: 'tool', id, name: 'Read', cat: 'read', icon: '📖', verb: '읽는 중', arg: `${id}.js`, ts,
});

test('tool은 pending에 추가되고 tool_result는 해당 id만 제거한다', () => {
  const a = makeAgent();
  assert.equal(applyActivity(a, tool('T1')), true);
  applyActivity(a, tool('T2', 200));
  assert.deepEqual(a.pending.map((p) => p.id), ['T1', 'T2']);
  assert.deepEqual(a.current, { type: 'tool', ts: 200 });
  assert.equal(a.counts.tools, 2);
  assert.equal(applyActivity(a, { type: 'tool_result', id: 'T1', isError: true, ts: 300 }), true);
  assert.deepEqual(a.pending.map((p) => p.id), ['T2']);
  assert.equal(a.counts.errors, 1);
  assert.deepEqual(a.current, { type: 'between', ts: 300 });
  applyActivity(a, { type: 'tool_result', id: '없는 id', ts: 400 });
  assert.deepEqual(a.pending.map((p) => p.id), ['T2']);
  applyActivity(a, { type: 'tool_result', id: 'T2', ts: 500 });
  assert.deepEqual(a.pending, []);
});

test('prompt는 pending을 비우고 lastPrompt와 현재 활동을 갱신한다', () => {
  const a = makeAgent();
  applyActivity(a, tool('T1'));
  assert.equal(applyActivity(a, { type: 'prompt', text: '새 요청', ts: 200 }), true);
  assert.deepEqual(a.pending, []);
  assert.equal(a.lastPrompt, '새 요청');
  assert.deepEqual(a.current, { type: 'prompt', text: '새 요청', ts: 200 });
  assert.equal(a.lastEventAt, 200);
});

test('setStatus idle은 pending을 비우고 상태 변경 시각을 갱신한다', () => {
  const a = makeAgent();
  applyActivity(a, tool('T1'));
  const at = a.statusSince + 1000;
  assert.equal(setStatus(a, 'idle', at), true);
  assert.equal(a.status, 'idle');
  assert.equal(a.statusSince, at);
  assert.deepEqual(a.pending, []);
  assert.equal(setStatus(a, 'idle', at + 1000), false);
  assert.equal(a.statusSince, at);
});

test('log는 최신 30개, pending은 최신 8개만 유지한다', () => {
  const a = makeAgent();
  for (let i = 1; i <= 35; i++) applyActivity(a, { type: 'text', text: `메시지 ${i}`, ts: i });
  assert.equal(a.log.length, 30);
  assert.equal(a.log[0].text, '메시지 6');
  assert.equal(a.log.at(-1).text, '메시지 35');
  for (let i = 1; i <= 10; i++) applyActivity(a, tool(`T${i}`, 100 + i));
  assert.deepEqual(a.pending.map((p) => p.id), ['T3', 'T4', 'T5', 'T6', 'T7', 'T8', 'T9', 'T10']);
});

test('publicAgent는 최근 log 12개와 독립된 pending 배열 및 counts를 반환한다', () => {
  const a = makeAgent();
  for (let i = 1; i <= 20; i++) applyActivity(a, { type: 'text', text: `메시지 ${i}`, ts: i });
  applyActivity(a, tool('T1'));
  const copy = publicAgent(a);
  assert.notStrictEqual(copy, a);
  assert.notStrictEqual(copy.log, a.log);
  assert.deepEqual(copy.log, a.log.slice(-12));
  assert.equal(copy.log.length, 12);
  assert.notStrictEqual(copy.pending, a.pending);
  assert.deepEqual(copy.pending, a.pending);
  assert.notStrictEqual(copy.counts, a.counts);
  copy.name = '바뀐 이름';
  copy.pending.pop();
  copy.log.pop();
  copy.counts.tools = 999;
  assert.equal(a.name, '');
  assert.equal(a.pending.length, 1);
  assert.equal(a.log.length, 21);
  assert.equal(a.counts.tools, 1);
});

for (const type of ['interrupt', 'turn_end']) {
  test(`${type}도 실행 중 도구를 비운다`, () => {
    const a = makeAgent();
    applyActivity(a, tool('T1'));
    assert.equal(applyActivity(a, { type, ts: 200 }), true);
    assert.deepEqual(a.pending, []);
    assert.deepEqual(a.current, { type, ts: 200 });
  });
}

test('applyActivity: 로그는 언어와 상관없는 키로 남긴다 (글은 화면에서 번역)', () => {
  const a = newAgent({ key: 'k', kind: 'main' });
  applyActivity(a, { type: 'tool', id: 't1', name: 'Read', cat: 'read', icon: '📖', vk: 'Read', arg: 'a.js', ts: 1 });
  applyActivity(a, { type: 'tool_result', id: 't1', isError: true, ts: 2 });
  applyActivity(a, { type: 'interrupt', ts: 3 });
  applyActivity(a, { type: 'notify', text: '', ts: 4 });
  applyActivity(a, { type: 'notify', text: '빌드 끝', ts: 5 });
  assert.deepEqual(a.log.map(({ ts, ...rest }) => rest), [
    { icon: '📖', vk: 'Read', verb: undefined, arg: 'a.js' },
    { icon: '💦', tk: 'log.error' },
    { icon: '✋', tk: 'log.interrupted' },
    { icon: '📬', tk: 'log.notify' },
    { icon: '📬', text: '빌드 끝' },
  ]);
  assert.equal(a.pending.length, 0);
});
