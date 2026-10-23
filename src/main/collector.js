// ~/.claude 를 지켜보면서 세션·에이전트·서브에이전트 상태를 만든다.
//
//   ~/.claude/sessions/<pid>.json                         살아 있는 세션 목록 (이름, cwd, busy/idle)
//   ~/.claude/projects/<cwd>/<sessionId>.jsonl            메인 에이전트 트랜스크립트
//   ~/.claude/projects/<cwd>/<sessionId>/subagents/
//       agent-<id>.jsonl                                  서브에이전트 트랜스크립트
//       agent-<id>.meta.json                              { agentType, description, toolUseId, spawnDepth, finished }
//
// 이벤트
//   'agent'         publicAgent(a)               새 에이전트 또는 상태 변화
//   'agent-remove'  { key, reason }              'finished' | 'gone'
//   'activity'      { key, activity }            실시간 활동 (애니메이션 트리거용)
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { EventEmitter } from 'node:events';
import { parseEntry, isSkippableLine, clip } from '../shared/activity.js';
import { newAgent, applyActivity, setStatus, publicAgent } from '../shared/agent-state.js';
import { Tailer } from './tailer.js';

const MIN = 60_000;
const TRANSIENT_FRESH = 90_000; // 레지스트리에 없는 트랜스크립트가 이 안에 바뀌었으면 세션으로 본다
const TRANSIENT_BUSY = 45_000;
const TRANSIENT_DROP = 10 * MIN;
const SUB_FRESH = 10 * MIN; // 처음 발견했을 때 이보다 오래 멈춰 있으면 무시
const SUB_STALE = 12 * MIN; // 메인이 쉬는데 이만큼 조용하면 끝난 걸로 본다
const MAIN_HISTORY = 768 * 1024;
const SUB_HISTORY = 512 * 1024;

const TITLE_RANK = { custom: 3, agent: 2, summary: 1 };

function isAlive(pid) {
  try {
    process.kill(pid, 0);
    return true;
  } catch (e) {
    return e.code === 'EPERM';
  }
}

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return null;
  }
}

function mtimeOf(file) {
  try {
    return fs.statSync(file).mtimeMs;
  } catch {
    return 0;
  }
}

const encodeCwd = (cwd) => cwd.replace(/[^A-Za-z0-9]/g, '-');

// 사용자 결정이 필요한 상태만 waiting. 모르는 값은 "사용자를 부르지 않게" busy 로 본다.
const WAITING = new Set(['waiting', 'needs_input', 'requires_action', 'blocked']);
function normStatus(s) {
  if (s === 'busy' || s === 'idle') return s;
  if (!s) return 'idle';
  return WAITING.has(s) ? 'waiting' : 'busy';
}

const displayName = (s) => s.name || s.title || path.basename(s.cwd || '') || s.id.slice(0, 8);

const DESKTOP_CONFIG = path.join(os.homedir(), 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');

// Claude 데스크톱 앱 사이드바에 고정한 세션들: 이름에 pinned 가 들어간 키 아래의 'code:local_<id>' 값
function pinnedOf(data) {
  const ids = new Set();
  const walk = (o, pinned) => {
    if (Array.isArray(o)) {
      for (const v of o) {
        if (pinned && typeof v === 'string') {
          const m = /^code:(local_[\w-]+)$/.exec(v);
          if (m) ids.add(m[1]);
        } else walk(v, pinned);
      }
    } else if (o && typeof o === 'object') {
      for (const [k, v] of Object.entries(o)) walk(v, pinned || /pinned/i.test(k));
    }
  };
  walk(data, false);
  return ids;
}

export function readPinned(file) {
  const data = readJson(file);
  return data ? pinnedOf(data) : null;
}

// 데스크톱 앱 화면에 지금 열려 있는 코드 세션들 (가운데 칸 + 나눠 보기 칸)
export function viewingOf(data) {
  const st = data?.preferences?.epitaxyPrefs?.['desktop-frame.paneStore.v1']?.state;
  const ids = new Set();
  const walk = (o) => {
    if (typeof o === 'string') {
      if (/^local_[\w-]+$/.test(o)) ids.add(o);
    } else if (o && typeof o === 'object') for (const v of Object.values(o)) walk(v);
  };
  walk(st?.lastPrimaryCodeSession);
  walk(st?.extraPanesByMode?.code);
  return ids;
}

export class Collector extends EventEmitter {
  /**
   * @param {object} o
   * @param {boolean} o.pinnedOnly  데스크톱 앱에서 고정한 세션만 (고정 정보를 못 읽으면 전부)
   */
  constructor({ claudeDir = path.join(os.homedir(), '.claude'), pinnedOnly = false, desktopConfig = DESKTOP_CONFIG } = {}) {
    super();
    this.pinnedOnly = pinnedOnly;
    this.desktopConfig = desktopConfig;
    this.pinned = null; // Set<hostSessionId> | null(못 읽음)
    this.viewing = new Set(); // 데스크톱 앱에 지금 열려 있는 hostSessionId
    this.pinnedMtime = -1;
    this.sessionsDir = path.join(claudeDir, 'sessions');
    this.projectsDir = path.join(claudeDir, 'projects');
    this.sessions = new Map(); // sessionId → session
    this.agents = new Map(); // key → agent 상태
    this.tails = new Map(); // key → Tailer
    this.toolOwner = new Map(); // Agent 도구 호출 id → 부른 에이전트 key
    this.subSeen = new Map(); // 무시했거나 끝난 서브에이전트 key → 그때 jsonl mtime
    this.gone = new Map(); // 레지스트리에서 사라진 세션 id → 시각 (트랜스크립트로 되살리지 않기)
    this.dirty = new Set();
    this.timers = [];
  }

  start() {
    this.#safe(() => this.scanRegistry());
    this.#safe(() => this.scanSubagents());
    this.#safe(() => this.scanTransient());
    this.timers.push(setInterval(() => this.#safe(() => this.scanRegistry()), 1000));
    this.timers.push(setInterval(() => this.#safe(() => this.pollTails()), 300));
    this.timers.push(setInterval(() => this.#safe(() => this.scanSubagents()), 1200));
    this.timers.push(setInterval(() => this.#safe(() => this.scanTransient()), 5000));
  }

  stop() {
    this.timers.forEach(clearInterval);
    this.timers = [];
  }

  snapshot() {
    return { agents: [...this.agents.values()].map(publicAgent) };
  }

  setPinnedOnly(on) {
    this.pinnedOnly = on;
    this.#safe(() => this.scanRegistry());
    this.#safe(() => this.scanTransient());
  }

  #refreshPinned() {
    let mtime = 0;
    try {
      mtime = fs.statSync(this.desktopConfig).mtimeMs;
    } catch {
      /* 데스크톱 앱 없음 */
    }
    if (mtime === this.pinnedMtime) return;
    this.pinnedMtime = mtime;
    const data = mtime ? readJson(this.desktopConfig) : null;
    this.pinned = data ? pinnedOf(data) : null;
    const viewing = data ? viewingOf(data) : new Set();
    if ([...viewing].sort().join() !== [...this.viewing].sort().join()) {
      this.viewing = viewing;
      this.emit('viewing', [...viewing]);
    }
  }

  /** 고정 필터를 통과하는가 (고정 정보를 못 읽으면 모두 통과) */
  #allowed(hostSessionId) {
    if (!this.pinnedOnly || !this.pinned) return true;
    return !!hostSessionId && this.pinned.has(hostSessionId);
  }

  #safe(fn) {
    try {
      fn();
    } catch (err) {
      console.error('[collector]', err);
    }
  }

  // ── 세션 ──────────────────────────────────────────────

  scanRegistry() {
    let files = [];
    try {
      files = fs.readdirSync(this.sessionsDir);
    } catch {
      /* 아직 없음 */
    }
    this.#refreshPinned();
    const seen = new Set();
    for (const f of files) {
      if (!/^\d+\.json$/.test(f)) continue;
      const d = readJson(path.join(this.sessionsDir, f));
      if (!d?.sessionId || !d.pid || !isAlive(d.pid)) continue;
      if (!this.#allowed(d.hostSessionId)) continue;
      seen.add(d.sessionId);
      this.#upsertSession({
        id: d.sessionId,
        pid: d.pid,
        cwd: d.cwd || '',
        name: d.name || '',
        status: normStatus(d.status),
        entrypoint: d.entrypoint || '',
        source: 'registry',
        statusAt: d.statusUpdatedAt,
        hostSessionId: d.hostSessionId || null,
      });
    }
    for (const s of [...this.sessions.values()]) {
      if (s.source === 'registry' && !seen.has(s.id)) {
        this.gone.set(s.id, Date.now());
        this.#removeSession(s.id, 'gone');
      }
    }
    this.#flush();
  }

  // 레지스트리에 안 잡히는 세션(claude -p 등)도 최근에 쓰인 트랜스크립트로 찾는다
  scanTransient() {
    const now = Date.now();
    // 레지스트리 밖 세션은 고정할 수 없으니 고정 필터가 켜져 있으면 보여주지 않는다
    if (this.pinnedOnly && this.pinned) {
      for (const s of [...this.sessions.values()]) if (s.source === 'transcript') this.#removeSession(s.id, 'gone');
      this.#flush();
      return;
    }
    let dirs = [];
    try {
      dirs = fs.readdirSync(this.projectsDir);
    } catch {
      return;
    }
    for (const d of dirs) {
      const dir = path.join(this.projectsDir, d);
      let files;
      try {
        files = fs.readdirSync(dir);
      } catch {
        continue;
      }
      for (const f of files) {
        if (!f.endsWith('.jsonl')) continue;
        const id = f.slice(0, -6);
        if (this.sessions.has(id) || this.gone.has(id)) continue;
        const file = path.join(dir, f);
        if (now - mtimeOf(file) > TRANSIENT_FRESH) continue;
        this.#upsertSession({ id, pid: null, cwd: '', name: '', status: 'busy', entrypoint: '', source: 'transcript', statusAt: mtimeOf(file) }, file);
      }
    }
    for (const s of [...this.sessions.values()]) {
      if (s.source !== 'transcript') continue;
      const t = this.tails.get(s.id);
      if (!t || now - t.mtimeMs > TRANSIENT_DROP) this.#removeSession(s.id, 'gone');
    }
    for (const [id, at] of this.gone) if (now - at > TRANSIENT_DROP) this.gone.delete(id);
    this.#flush();
  }

  #upsertSession(info, transcript = null) {
    let s = this.sessions.get(info.id);
    if (!s) {
      s = { ...info, title: '', titleRank: 0, transcript, dir: null, lookedAt: 0 };
      if (!transcript) this.#locateTranscript(s);
      else s.dir = transcript.slice(0, -6);
      this.sessions.set(s.id, s);

      const a = newAgent({
        key: s.id,
        sessionId: s.id,
        kind: 'main',
        name: displayName(s),
        cwd: s.cwd,
        entrypoint: s.entrypoint,
        status: s.status,
        // 생김새·보드 자리를 정하는 고유값: 데스크톱 앱 사이드바 id 는 재시작해도 그대로다
        seed: s.hostSessionId || `${s.cwd}|${s.pid ?? s.id}`,
      });
      this.agents.set(a.key, a);
      if (s.transcript) this.#attach(a, s.transcript, MAIN_HISTORY);
      if (a.status !== 'busy') a.pending = [];
      // 앱을 켠 시각이 아니라 실제로 상태가 바뀐 시각부터 센다 (오래 쉰 세션은 바로 잠들도록)
      a.statusSince = info.statusAt || a.lastEventAt || a.statusSince;
      a.name = displayName(s);
      this.emit('agent', publicAgent(a));
      this.dirty.delete(a.key);
      return;
    }

    let changed = false;
    for (const k of ['pid', 'cwd', 'name', 'entrypoint', 'source', 'hostSessionId']) {
      if (info[k] != null && info[k] !== '' && s[k] !== info[k]) {
        s[k] = info[k];
        changed = true;
      }
    }
    const a = this.agents.get(s.id);
    if (!a) return;
    if (info.status) this.#setStatus(a, info.status);
    if (!s.transcript && Date.now() - s.lookedAt > 5000) {
      this.#locateTranscript(s);
      if (s.transcript) this.#attach(a, s.transcript, MAIN_HISTORY);
    }
    if (changed) {
      a.name = displayName(s);
      a.cwd = s.cwd;
      a.entrypoint = s.entrypoint;
      this.dirty.add(a.key);
    }
  }

  #setStatus(a, status) {
    const prev = a.status;
    if (setStatus(a, status)) {
      this.dirty.add(a.key);
      this.emit('activity', { key: a.key, activity: { type: 'status', from: prev, to: status, ts: Date.now() } });
    }
  }

  #locateTranscript(s) {
    s.lookedAt = Date.now();
    const name = `${s.id}.jsonl`;
    let found = null;
    if (s.cwd) {
      const direct = path.join(this.projectsDir, encodeCwd(s.cwd), name);
      if (fs.existsSync(direct)) found = direct;
    }
    if (!found) {
      let dirs = [];
      try {
        dirs = fs.readdirSync(this.projectsDir);
      } catch {
        /* 없음 */
      }
      for (const d of dirs) {
        const p = path.join(this.projectsDir, d, name);
        if (fs.existsSync(p)) {
          found = p;
          break;
        }
      }
    }
    if (found) {
      s.transcript = found;
      s.dir = found.slice(0, -6);
    }
  }

  #removeSession(id, reason) {
    if (!this.sessions.delete(id)) return;
    for (const [key, a] of [...this.agents]) {
      if (a.sessionId !== id) continue;
      this.agents.delete(key);
      this.tails.delete(key);
      this.dirty.delete(key);
      this.emit('agent-remove', { key, reason });
    }
    // 이 세션 몫의 기록은 더 필요 없다
    const prefix = `${id}:`;
    for (const k of this.subSeen.keys()) if (k.startsWith(prefix)) this.subSeen.delete(k);
    for (const [tool, owner] of this.toolOwner) if (owner === id || owner.startsWith(prefix)) this.toolOwner.delete(tool);
  }

  // ── 트랜스크립트 ───────────────────────────────────────

  #attach(agent, file, historyBytes) {
    const t = new Tailer(file, { historyBytes });
    this.tails.set(agent.key, t);
    this.#read(agent, t);
  }

  #read(agent, t) {
    const r = t.read();
    if (!r) return;
    const s = this.sessions.get(agent.sessionId);
    for (const line of r.lines) {
      if (isSkippableLine(line)) continue;
      let entry;
      try {
        entry = JSON.parse(line);
      } catch {
        continue;
      }
      if (s && !s.cwd && entry.cwd) {
        s.cwd = entry.cwd;
        agent.cwd = entry.cwd;
        if (agent.kind === 'main') agent.name = displayName(s);
      }
      for (const act of parseEntry(entry)) this.#ingest(agent, act, r.history);
    }
  }

  #ingest(agent, act, history) {
    if (act.type === 'title') {
      const s = this.sessions.get(agent.sessionId);
      const rank = TITLE_RANK[act.source] || 0;
      if (agent.kind === 'main' && s && rank >= s.titleRank) {
        s.title = act.text;
        s.titleRank = rank;
        const name = displayName(s);
        if (agent.name !== name) {
          agent.name = name;
          this.dirty.add(agent.key);
        }
      }
      return;
    }
    if (act.type === 'tool' && (act.name === 'Agent' || act.name === 'Task') && act.id) {
      this.toolOwner.set(act.id, agent.key);
    }
    if (agent.kind === 'sub' && act.type === 'prompt' && !agent.description) {
      agent.description = clip(act.text, 80);
    }
    if (applyActivity(agent, act)) this.dirty.add(agent.key);
    if (!history) this.emit('activity', { key: agent.key, activity: act });
  }

  pollTails() {
    for (const [key, t] of this.tails) {
      const a = this.agents.get(key);
      if (!a) {
        this.tails.delete(key);
        continue;
      }
      this.#read(a, t);
    }
    const now = Date.now();
    for (const s of this.sessions.values()) {
      if (s.source !== 'transcript') continue;
      const a = this.agents.get(s.id);
      const t = this.tails.get(s.id);
      if (a && t) this.#setStatus(a, now - t.mtimeMs < TRANSIENT_BUSY ? 'busy' : 'idle');
    }
    this.#flush();
  }

  // ── 서브에이전트 ───────────────────────────────────────

  scanSubagents() {
    const now = Date.now();
    for (const s of this.sessions.values()) {
      if (!s.dir) continue;
      const subDir = path.join(s.dir, 'subagents');
      let files;
      try {
        files = fs.readdirSync(subDir);
      } catch {
        continue;
      }
      for (const f of files) {
        const m = /^agent-(.+)\.jsonl$/.exec(f);
        if (!m) continue;
        const agentId = m[1];
        const key = `${s.id}:${agentId}`;
        const jsonl = path.join(subDir, f);
        const mtime = mtimeOf(jsonl);
        const a = this.agents.get(key);

        if (!a) {
          const seenAt = this.subSeen.get(key);
          if (seenAt !== undefined && seenAt >= mtime) continue;
          const meta = readJson(path.join(subDir, `agent-${agentId}.meta.json`));
          if (meta?.finished === true || now - mtime > SUB_FRESH) {
            this.subSeen.set(key, mtime);
            continue;
          }
          this.#addSub(s, agentId, key, jsonl, meta);
          continue;
        }

        const meta = readJson(path.join(subDir, `agent-${agentId}.meta.json`));
        const mainBusy = this.agents.get(s.id)?.status === 'busy';
        if (meta?.finished === true || (!mainBusy && now - mtime > SUB_STALE)) {
          this.#finishSub(key, mtime);
          continue;
        }
        // 부모를 나중에 알게 된 경우 (중첩 서브에이전트)
        if (a.parentKey === s.id && meta?.toolUseId) {
          const owner = this.toolOwner.get(meta.toolUseId);
          if (owner && owner !== a.parentKey && owner !== key && this.agents.has(owner)) {
            a.parentKey = owner;
            a.depth = (this.agents.get(owner).depth || 0) + 1;
            this.dirty.add(key);
          }
        }
      }
    }
    this.#flush();
  }

  #addSub(s, agentId, key, jsonl, meta) {
    let parentKey = (meta?.toolUseId && this.toolOwner.get(meta.toolUseId)) || s.id;
    if (!this.agents.has(parentKey)) parentKey = s.id;
    const parent = this.agents.get(parentKey);
    const a = newAgent({
      key,
      sessionId: s.id,
      agentId,
      parentKey,
      kind: 'sub',
      agentType: meta?.agentType || 'agent',
      description: meta?.description || '',
      depth: (parent?.depth ?? 0) + 1,
      name: meta?.description || meta?.agentType || '', // 비면 화면에서 '도우미'
      cwd: s.cwd,
      status: 'busy',
      seed: agentId,
    });
    this.agents.set(key, a);
    this.#attach(a, jsonl, SUB_HISTORY);
    this.emit('agent', publicAgent(a));
    this.dirty.delete(key);
  }

  #finishSub(key, mtime) {
    const a = this.agents.get(key);
    if (!a) return;
    const t = this.tails.get(key);
    if (t) this.#read(a, t); // 마지막 몇 줄
    a.finished = true;
    setStatus(a, 'done');
    this.emit('agent', publicAgent(a));
    this.agents.delete(key);
    this.tails.delete(key);
    this.dirty.delete(key);
    this.subSeen.set(key, mtime || Date.now());
    this.emit('agent-remove', { key, reason: 'finished' });
  }

  #flush() {
    for (const key of this.dirty) {
      const a = this.agents.get(key);
      if (a) this.emit('agent', publicAgent(a));
    }
    this.dirty.clear();
  }
}
