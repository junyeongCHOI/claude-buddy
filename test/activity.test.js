import test from 'node:test';
import assert from 'node:assert/strict';
import { parseEntry, toolActivity, isSkippableLine } from '../src/shared/activity.js';

const timestamp = '2026-10-23T01:02:03.000Z';
const ts = Date.parse(timestamp);
const user = (content, extra = {}) => ({ type: 'user', timestamp, message: { content }, ...extra });

test('parseEntry: assistant 사고 시간, 텍스트, 도구 호출을 순서대로 변환한다', () => {
  const actual = parseEntry({
    type: 'assistant',
    timestamp,
    thinkingDurationMs: 1234,
    message: { content: [
      { type: 'thinking', thinking: '이유를 생각한다' },
      { type: 'text', text: '  파일을 읽겠습니다.  ' },
      { type: 'tool_use', id: 'read-1', name: 'Read', input: { file_path: '/tmp/설명.md' } },
    ] },
  });
  assert.deepEqual(actual, [
    { type: 'thinking', text: '이유를 생각한다', ms: 1234, ts },
    { type: 'text', text: '파일을 읽겠습니다.', ts },
    { type: 'tool', id: 'read-1', name: 'Read', cat: 'read', icon: '📖', vk: 'Read', arg: '설명.md', ts },
  ]);
});

test('parseEntry: 가려진 사고와 시간이 없는 사고도 처리한다', () => {
  assert.deepEqual(parseEntry({
    type: 'assistant', timestamp, message: { content: [{ type: 'redacted_thinking' }] },
  }), [{ type: 'thinking', text: '', ms: 0, ts }]);
});

for (const [name, raw, expected] of [
  ['문자열 요청', '  테스트를 작성해 줘  ', { type: 'prompt', text: '테스트를 작성해 줘', ts }],
  ['중단', '[Request interrupted by user for tool use]', { type: 'interrupt', ts }],
  ['백그라운드 알림', '<task-notification><task-id>a1</task-id><summary>X</summary></task-notification>', { type: 'notify', text: 'X', ts }],
  ['예약 요청', '<scheduled-task name="n">실행</scheduled-task>', { type: 'prompt', text: '⏰ n', ts }],
  ['슬래시 명령', '<command-name>/x</command-name>', { type: 'command', text: '/x', ts }],
  ['시스템 꼬리표 제거', '<system-reminder>내부 정보</system-reminder>사람 요청', { type: 'prompt', text: '사람 요청', ts }],
]) {
  test(`parseEntry: ${name}`, () => {
    assert.deepEqual(parseEntry(user(raw)), [expected]);
  });
}

for (const isError of [true, false]) {
  test(`parseEntry: tool_result 오류 여부 ${isError}`, () => {
    assert.deepEqual(parseEntry(user([
      { type: 'tool_result', tool_use_id: 'T1', is_error: isError, content: '결과' },
    ])), [{ type: 'tool_result', id: 'T1', isError, ts }]);
  });
}

test('parseEntry: 사용자 블록의 결과와 여러 텍스트를 함께 처리한다', () => {
  assert.deepEqual(parseEntry(user([
    { type: 'tool_result', tool_use_id: 'T1' },
    { type: 'text', text: '첫 줄' },
    { type: 'text', text: '둘째 줄' },
  ])), [
    { type: 'tool_result', id: 'T1', isError: false, ts },
    { type: 'prompt', text: '첫 줄 둘째 줄', ts },
  ]);
});

test('parseEntry: 시스템 알림만 있는 요청과 isMeta 요청을 무시한다', () => {
  assert.deepEqual(parseEntry(user('<system-reminder>내부\n정보</system-reminder>')), []);
  assert.deepEqual(parseEntry(user('숨겨진 요청', { isMeta: true })), []);
  assert.deepEqual(parseEntry(user([{ type: 'text', text: '숨겨진 요청' }], { isMeta: true })), []);
});

for (const subtype of ['stop_hook_summary', 'turn_duration']) {
  test(`parseEntry: system ${subtype}은 턴 종료`, () => {
    assert.deepEqual(parseEntry({ type: 'system', subtype, timestamp }), [{ type: 'turn_end', ts }]);
  });
}

for (const [type, field, source] of [
  ['custom-title', 'customTitle', 'custom'],
  ['agent-name', 'agentName', 'agent'],
  ['summary', 'summary', 'summary'],
]) {
  test(`parseEntry: ${type} 제목 출처를 보존한다`, () => {
    assert.deepEqual(parseEntry({ type, [field]: '새 제목', timestamp }), [
      { type: 'title', text: '새 제목', source, ts },
    ]);
  });
}

test('parseEntry: 모르는 종류와 비어 있거나 잘못된 내용을 무시한다', () => {
  for (const entry of [
    null, undefined, '문자열', 1, {}, { type: 'unknown' },
    { type: 'system', subtype: 'unknown' },
    { type: 'assistant', message: { content: '문자열' } },
    { type: 'assistant', message: { content: [null, { type: 'text', text: ' ' }, { type: 'unknown' }] } },
    user(null),
  ]) assert.deepEqual(parseEntry(entry), []);
});

test('toolActivity: Bash 설명을 명령보다 우선하며 설명이 없으면 명령을 쓴다', () => {
  assert.deepEqual(toolActivity('Bash', { description: '테스트 실행', command: 'npm test' }, 'T1', ts), {
    type: 'tool', id: 'T1', name: 'Bash', cat: 'run', icon: '⌨️', vk: 'Bash', arg: '테스트 실행', ts,
  });
  assert.equal(toolActivity('Bash', { command: 'npm test' }).arg, 'npm test');
});

test('toolActivity: Read는 파일명, WebFetch는 www.를 뺀 호스트를 쓴다', () => {
  assert.equal(toolActivity('Read', { file_path: '/Users/사용자/프로젝트/main.js' }).arg, 'main.js');
  const web = toolActivity('WebFetch', { url: 'https://www.example.com/docs?q=1' });
  assert.equal(web.cat, 'web');
  assert.equal(web.arg, 'example.com');
});

test('toolActivity: Agent 종류, 설명, 백그라운드 여부를 보존한다', () => {
  assert.deepEqual(toolActivity('Agent', {
    subagent_type: 'Explore', description: '구조 조사', run_in_background: true,
  }, 'T1', ts), {
    type: 'tool', id: 'T1', name: 'Agent', cat: 'agent', icon: '🐣', vk: 'Agent',
    arg: '구조 조사', ts, agentType: 'Explore', description: '구조 조사', background: true,
  });
  const fallback = toolActivity('Agent');
  assert.equal(fallback.agentType, 'general-purpose');
  assert.equal(fallback.description, '');
  assert.equal(fallback.background, false);
  assert.equal(toolActivity('Agent', { subagent_type: 'Explore' }).arg, 'Explore');
});

test('toolActivity: 계획 MCP 도구를 plan으로 분류한다', () => {
  assert.equal(toolActivity('mcp__ccd_turn__update_plan').cat, 'plan');
});

for (const server of ['browser', 'plugin_browser_tools', 'ChromeDevTools', 'playwright']) {
  test(`toolActivity: ${server} 서버를 web으로 분류한다`, () => {
    const act = toolActivity(`mcp__${server}__open_page`, { url: 'https://www.example.com/page' });
    assert.equal(act.cat, 'web');
    assert.equal(act.arg, 'example.com');
    assert.equal(act.verb, 'open page');
  });
}

test('toolActivity: 일반 MCP와 모르는 도구를 구별한다', () => {
  assert.equal(toolActivity('mcp__notes__find_note', { query: '테스트' }).cat, 'mcp');
  const unknown = toolActivity('UnknownTool');
  assert.equal(unknown.cat, 'other');
  assert.equal(unknown.verb, 'UnknownTool');
});

test('toolActivity: 인자는 60자까지 보존하고 넘으면 말줄임표를 붙인다', () => {
  assert.equal(toolActivity('Bash', { command: '가'.repeat(60) }).arg, '가'.repeat(60));
  assert.equal(toolActivity('Bash', { command: '가'.repeat(61) }).arg, '가'.repeat(59) + '…');
});

test('isSkippableLine: 짧은 줄과 불필요한 이벤트를 거른다', () => {
  for (const line of ['', '{']) assert.equal(isSkippableLine(line), true);
  for (const type of ['api-request', 'api-request-start', 'file-history-snapshot', 'atis-latch', 'queue-operation', 'last-prompt']) {
    assert.equal(isSkippableLine(JSON.stringify({ type })), true, type);
  }
  for (const type of ['assistant', 'user', 'system', 'custom-title', 'agent-name', 'unknown']) {
    assert.equal(isSkippableLine(JSON.stringify({ type })), false, type);
  }
});
