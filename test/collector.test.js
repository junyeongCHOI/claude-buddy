import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Collector, readPinned, viewingOf } from '../src/main/collector.js';

const timestamp = '2026-10-23T01:02:03.000Z';
const prompt = (text) => ({ type: 'user', timestamp, message: { content: text } });
const assistant = (content) => ({ type: 'assistant', timestamp, message: { content } });
const agentTool = (id) => ({ type: 'tool_use', id, name: 'Agent', input: { subagent_type: 'Explore', description: `임무 ${id}` } });
const jsonl = (entries) => entries.map((entry) => JSON.stringify(entry)).join('\n') + '\n';

function fixture(t, entries = []) {
  const claudeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-collector-'));
  t.after(() => fs.rmSync(claudeDir, { recursive: true, force: true }));
  const sid = 'session-test-1';
  const cwd = path.join(claudeDir, '작업 폴더', 'my_project.v1');
  const projectDir = path.join(claudeDir, 'projects', cwd.replace(/[^A-Za-z0-9]/g, '-'));
  const sessionsDir = path.join(claudeDir, 'sessions');
  fs.mkdirSync(projectDir, { recursive: true });
  fs.mkdirSync(sessionsDir, { recursive: true });
  const registry = path.join(sessionsDir, `${process.pid}.json`);
  const transcript = path.join(projectDir, `${sid}.jsonl`);
  const record = { pid: process.pid, sessionId: sid, cwd, name: '레지스트리 이름', status: 'busy' };
  const writeRegistry = (changes = {}) => {
    Object.assign(record, changes);
    fs.writeFileSync(registry, JSON.stringify(record));
  };
  const writeSub = (id, meta, subEntries = [prompt('서브 임무')]) => {
    const dir = path.join(projectDir, sid, 'subagents');
    fs.mkdirSync(dir, { recursive: true });
    const file = path.join(dir, `agent-${id}.jsonl`);
    const metaFile = path.join(dir, `agent-${id}.meta.json`);
    fs.writeFileSync(file, subEntries.length ? jsonl(subEntries) : '');
    fs.writeFileSync(metaFile, JSON.stringify(meta));
    return { file, metaFile };
  };
  writeRegistry();
  fs.writeFileSync(transcript, entries.length ? jsonl(entries) : '');
  const collector = new Collector({ claudeDir });
  const events = { agents: [], activities: [], removals: [] };
  collector.on('agent', (a) => events.agents.push(a));
  collector.on('activity', (a) => events.activities.push(a));
  collector.on('agent-remove', (a) => events.removals.push(a));
  t.after(() => collector.stop());
  return { collector, events, sid, cwd, registry, transcript, projectDir, writeRegistry, writeSub };
}

test('scanRegistry는 살아 있는 메인을 만들고 레지스트리 이름과 과거 활동을 반영한다', (t) => {
  const { collector, events, sid, cwd, transcript } = fixture(t, [
    { type: 'custom-title', customTitle: '다른 제목', timestamp },
    prompt('처음 요청'),
    assistant([{ type: 'text', text: '처음 응답' }]),
  ]);
  collector.scanRegistry();
  const a = collector.snapshot().agents.find((a) => a.key === sid);
  assert.ok(a);
  assert.equal(a.kind, 'main');
  assert.equal(a.name, '레지스트리 이름');
  assert.equal(a.cwd, cwd);
  assert.equal(a.status, 'busy');
  assert.equal(a.lastPrompt, '처음 요청');
  assert.equal(a.lastText, '처음 응답');
  assert.equal(collector.sessions.get(sid).transcript, transcript);
  assert.equal(events.agents.length, 1);
  assert.deepEqual(events.activities, []);
  assert.deepEqual(collector.timers, []);
});

test('pollTails는 추가된 활동을 반영하고 같은 활동을 다시 내보내지 않는다', (t) => {
  const { collector, events, sid, transcript } = fixture(t, [prompt('처음 요청')]);
  collector.scanRegistry();
  fs.appendFileSync(transcript, jsonl([
    assistant([{ type: 'tool_use', id: 'R1', name: 'Read', input: { file_path: '/tmp/main.js' } }]),
  ]));
  collector.pollTails();
  assert.equal(collector.agents.get(sid).pending[0].id, 'R1');
  assert.equal(events.activities.length, 1);
  assert.equal(events.activities[0].key, sid);
  assert.equal(events.activities[0].activity.type, 'tool');
  assert.equal(events.activities[0].activity.arg, 'main.js');
  fs.appendFileSync(transcript, jsonl([
    { type: 'user', timestamp, message: { content: [{ type: 'tool_result', tool_use_id: 'R1' }] } },
    assistant([{ type: 'text', text: '완료했습니다' }]),
  ]));
  collector.pollTails();
  assert.deepEqual(collector.agents.get(sid).pending, []);
  assert.equal(collector.agents.get(sid).lastText, '완료했습니다');
  assert.deepEqual(events.activities.map((e) => e.activity.type), ['tool', 'tool_result', 'text']);
  collector.pollTails();
  assert.equal(events.activities.length, 3);
  assert.equal(events.agents.at(-1).lastText, '완료했습니다');
});

test('레지스트리 busy→idle 변경은 status 활동을 내보내고 pending을 비운다', (t) => {
  const { collector, events, sid, writeRegistry } = fixture(t, [assistant([agentTool('T1')])]);
  collector.scanRegistry();
  assert.equal(collector.agents.get(sid).pending.length, 1);
  writeRegistry({ status: 'idle' });
  collector.scanRegistry();
  assert.equal(events.activities.length, 1);
  const event = events.activities[0];
  assert.equal(event.key, sid);
  assert.deepEqual({ ...event.activity, ts: 0 }, { type: 'status', from: 'busy', to: 'idle', ts: 0 });
  assert.ok(Number.isFinite(event.activity.ts));
  assert.deepEqual(collector.agents.get(sid).pending, []);
  assert.equal(events.agents.at(-1).status, 'idle');
  collector.scanRegistry();
  assert.equal(events.activities.length, 1);
});

test('서브 메타와 Agent 호출 id로 부모 및 중첩 관계를 연결한다', (t) => {
  const { collector, events, sid, writeSub } = fixture(t, [assistant([agentTool('T1')])]);
  writeSub('a1', { agentType: 'Explore', description: '상위 조사', toolUseId: 'T1', spawnDepth: 1 }, [
    prompt('상위 조사 요청'), assistant([agentTool('T2')]),
  ]);
  writeSub('a2', { agentType: 'Plan', description: '중첩 계획', toolUseId: 'T2', spawnDepth: 2 });
  collector.scanRegistry();
  collector.scanSubagents();
  const first = events.agents.find((a) => a.key === `${sid}:a1`);
  const second = events.agents.find((a) => a.key === `${sid}:a2`);
  assert.ok(first);
  assert.ok(second);
  assert.equal(first.kind, 'sub');
  assert.equal(first.parentKey, sid);
  assert.equal(first.agentType, 'Explore');
  assert.equal(first.description, '상위 조사');
  assert.equal(first.lastPrompt, '상위 조사 요청');
  assert.equal(first.depth, 1);
  assert.equal(second.parentKey, `${sid}:a1`);
  assert.equal(second.depth, 2);
  assert.equal(second.agentType, 'Plan');
});

test('중첩 부모의 호출을 나중에 읽어도 다음 탐색에서 부모를 고친다', (t) => {
  const { collector, sid, writeSub } = fixture(t, [assistant([agentTool('T1')])]);
  writeSub('a2', { toolUseId: 'T2', spawnDepth: 2 });
  collector.scanRegistry();
  collector.scanSubagents();
  assert.equal(collector.agents.get(`${sid}:a2`).parentKey, sid);
  writeSub('a1', { toolUseId: 'T1', spawnDepth: 1 }, [assistant([agentTool('T2')])]);
  collector.scanSubagents();
  collector.scanSubagents();
  assert.equal(collector.agents.get(`${sid}:a2`).parentKey, `${sid}:a1`);
  assert.equal(collector.agents.get(`${sid}:a2`).depth, 2);
});

test('meta.finished는 마지막 활동을 읽고 finished 제거 이벤트를 보낸다', (t) => {
  const { collector, events, sid, writeSub } = fixture(t, [assistant([agentTool('T1')])]);
  const meta = { agentType: 'Explore', description: '조사', toolUseId: 'T1', spawnDepth: 1 };
  const { file, metaFile } = writeSub('a1', meta);
  collector.scanRegistry();
  collector.scanSubagents();
  fs.appendFileSync(file, jsonl([assistant([{ type: 'text', text: '최종 보고' }])]));
  fs.writeFileSync(metaFile, JSON.stringify({ ...meta, finished: true }));
  collector.scanSubagents();
  assert.deepEqual(events.removals, [{ key: `${sid}:a1`, reason: 'finished' }]);
  const last = events.agents.at(-1);
  assert.equal(last.key, `${sid}:a1`);
  assert.equal(last.finished, true);
  assert.equal(last.status, 'done');
  assert.equal(last.lastText, '최종 보고');
  assert.equal(collector.agents.has(`${sid}:a1`), false);
  assert.equal(collector.tails.has(`${sid}:a1`), false);
  collector.scanSubagents();
  assert.equal(events.removals.length, 1);
  assert.equal(collector.agents.has(`${sid}:a1`), false);
});

test('레지스트리를 지우면 메인과 서브 모두 gone으로 제거한다', (t) => {
  const { collector, events, sid, registry, writeSub } = fixture(t, [assistant([agentTool('T1')])]);
  writeSub('a1', { toolUseId: 'T1' });
  collector.scanRegistry();
  collector.scanSubagents();
  fs.unlinkSync(registry);
  collector.scanRegistry();
  assert.deepEqual(events.removals.sort((a, b) => a.key.localeCompare(b.key)), [
    { key: sid, reason: 'gone' }, { key: `${sid}:a1`, reason: 'gone' },
  ].sort((a, b) => a.key.localeCompare(b.key)));
  assert.equal(collector.sessions.size, 0);
  assert.equal(collector.agents.size, 0);
  assert.equal(collector.tails.size, 0);
});

test('scanTransient는 레지스트리에 없는 최근 트랜스크립트를 세션으로 찾는다', (t) => {
  const { collector, events, sid, cwd, registry, transcript, projectDir } = fixture(t);
  fs.writeFileSync(transcript, jsonl([
    { ...prompt('일회성 요청'), cwd },
    assistant([{ type: 'text', text: '일회성 응답' }]),
  ]));
  fs.unlinkSync(registry);
  const stale = path.join(projectDir, 'old-session.jsonl');
  fs.writeFileSync(stale, jsonl([prompt('오래된 요청')]));
  const old = new Date(Date.now() - 120_000);
  fs.utimesSync(stale, old, old);
  collector.scanRegistry();
  assert.equal(collector.agents.size, 0);
  collector.scanTransient();
  assert.equal(collector.sessions.get(sid).source, 'transcript');
  assert.equal(collector.sessions.get(sid).transcript, transcript);
  const a = events.agents.find((a) => a.key === sid);
  assert.ok(a);
  assert.equal(a.kind, 'main');
  assert.equal(a.status, 'busy');
  assert.equal(a.cwd, cwd);
  assert.equal(a.lastPrompt, '일회성 요청');
  assert.equal(a.lastText, '일회성 응답');
  assert.equal(collector.agents.has('old-session'), false);
  collector.scanTransient();
  assert.equal(events.agents.length, 1);
  assert.deepEqual(collector.timers, []);
});

test('readPinned는 pinned 가 들어간 키 아래의 code:local_ 세션만 모은다', (t) => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-pinned-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'claude_desktop_config.json');
  fs.writeFileSync(file, JSON.stringify({
    mcpServers: { x: { args: ['code:local_not-pinned'] } },
    preferences: { epitaxyPrefs: { slice: { pinnedOrder: ['code:local_a1', 'chat:abc', 'code:local_b2'], homeProjectsPinnedOrder: [] } } },
  }));
  assert.deepEqual([...readPinned(file)].sort(), ['local_a1', 'local_b2']);
  assert.equal(readPinned(path.join(dir, 'none.json')), null);
});

test('pinnedOnly 면 고정한 세션만 보이고, 고정을 풀면 gone 으로 사라진다', (t) => {
  const { collector, events, sid, writeRegistry } = fixture(t);
  const file = path.join(os.tmpdir(), `buddy-desktop-${process.pid}-${Date.now()}.json`);
  t.after(() => fs.rmSync(file, { force: true }));
  const pin = (ids) => {
    fs.writeFileSync(file, JSON.stringify({ preferences: { p: { pinnedOrder: ids.map((id) => `code:${id}`) } } }));
    const t2 = new Date(Date.now() + Math.random() * 100000);
    fs.utimesSync(file, t2, t2);
  };
  collector.desktopConfig = file;
  collector.pinnedOnly = true;
  writeRegistry({ hostSessionId: 'local_me' });
  pin(['local_other']);
  collector.scanRegistry();
  assert.equal(collector.agents.has(sid), false);
  pin(['local_me']);
  collector.scanRegistry();
  assert.equal(collector.agents.has(sid), true);
  pin([]);
  collector.scanRegistry();
  assert.equal(collector.agents.has(sid), false);
  assert.deepEqual(events.removals.at(-1), { key: sid, reason: 'gone' });
});

test('고정 정보를 못 읽으면 pinnedOnly 여도 모두 보여 준다', (t) => {
  const { collector, sid } = fixture(t);
  collector.desktopConfig = path.join(os.tmpdir(), 'no-such-claude-config.json');
  collector.pinnedOnly = true;
  collector.scanRegistry();
  assert.equal(collector.agents.has(sid), true);
});

test('모르는 레지스트리 상태는 waiting 이 아니라 busy 로 본다 (사용자를 잘못 부르지 않게)', (t) => {
  const { collector, sid, writeRegistry } = fixture(t);
  writeRegistry({ status: 'compacting' });
  collector.scanRegistry();
  assert.equal(collector.agents.get(sid).status, 'busy');
  writeRegistry({ status: 'needs_input' });
  collector.scanRegistry();
  assert.equal(collector.agents.get(sid).status, 'waiting');
});

test('생김새 시드는 데스크톱 앱 사이드바 id 를 쓴다 (pid 가 바뀌어도 같은 동물)', (t) => {
  const { collector, sid, writeRegistry } = fixture(t);
  writeRegistry({ hostSessionId: 'local_stable' });
  collector.scanRegistry();
  assert.equal(collector.agents.get(sid).seed, 'local_stable');
});

test('레지스트리에서 사라진 세션은 최근 트랜스크립트가 있어도 되살리지 않는다', (t) => {
  const { collector, sid, registry } = fixture(t, [prompt('안녕')]);
  collector.scanRegistry();
  assert.equal(collector.agents.has(sid), true);
  fs.rmSync(registry);
  collector.scanRegistry();
  assert.equal(collector.agents.has(sid), false);
  collector.scanTransient();
  assert.equal(collector.agents.has(sid), false);
});

test('viewingOf는 데스크톱 앱 가운데 칸과 나눠 보기 칸에 열린 세션을 모은다', () => {
  const state = (s) => ({ preferences: { epitaxyPrefs: { 'desktop-frame.paneStore.v1': { state: s } } } });
  assert.deepEqual([...viewingOf(state({ lastPrimaryCodeSession: { id: 'local_a1', type: 'local' }, extraPanesByMode: { code: [] } }))], ['local_a1']);
  assert.deepEqual(
    [...viewingOf(state({ lastPrimaryCodeSession: { id: 'local_a1' }, extraPanesByMode: { code: [{ session: { id: 'local_b2' } }, 'local_c3'] } }))].sort(),
    ['local_a1', 'local_b2', 'local_c3'],
  );
  assert.deepEqual([...viewingOf(state({ lastPrimaryCodeSession: { id: 'cowork_x' } }))], []);
  assert.deepEqual([...viewingOf({})], []);
});
