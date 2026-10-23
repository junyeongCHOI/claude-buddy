// Claude Code 트랜스크립트(JSONL) 한 줄을 "활동"으로 바꾼다.
// 메인 프로세스(실제 데이터)와 렌더러(데모 모드) 양쪽에서 쓴다.
//
// 활동 종류
//   prompt      사용자가 보낸 요청 (서브에이전트는 받은 임무)
//   thinking    확장 사고 블록 (내용은 보통 비어 있음)
//   text        에이전트가 말한 텍스트
//   tool        도구 호출 시작          { id, name, cat, icon, vk | verb, arg }
//   tool_result 도구 호출 끝            { id, isError }
//   interrupt   사용자가 중단함
//   notify      백그라운드 작업 알림 도착
//   turn_end    턴 종료
//   title       세션 제목

const clip = (s, n) => {
  if (s == null) return '';
  const t = String(s).replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1) + '…' : t;
};

const base = (p) => {
  if (!p) return '';
  const parts = String(p).split('/').filter(Boolean);
  return parts[parts.length - 1] || String(p);
};

const host = (u) => {
  try {
    return new URL(u).host.replace(/^www\./, '');
  } catch {
    return clip(u, 40);
  }
};

const TOOLS = {
  Read: { cat: 'read', icon: '📖', vk: 'Read', arg: (i) => base(i.file_path) },
  NotebookRead: { cat: 'read', icon: '📖', vk: 'NotebookRead', arg: (i) => base(i.notebook_path) },
  Grep: { cat: 'read', icon: '🔍', vk: 'Grep', arg: (i) => i.pattern },
  Glob: { cat: 'read', icon: '🗂️', vk: 'Glob', arg: (i) => i.pattern },
  LS: { cat: 'read', icon: '🗂️', vk: 'LS', arg: (i) => base(i.path) },
  Edit: { cat: 'write', icon: '✏️', vk: 'Edit', arg: (i) => base(i.file_path) },
  MultiEdit: { cat: 'write', icon: '✏️', vk: 'Edit', arg: (i) => base(i.file_path) },
  Write: { cat: 'write', icon: '📝', vk: 'Write', arg: (i) => base(i.file_path) },
  NotebookEdit: { cat: 'write', icon: '📝', vk: 'NotebookEdit', arg: (i) => base(i.notebook_path) },
  Bash: { cat: 'run', icon: '⌨️', vk: 'Bash', arg: (i) => i.description || i.command },
  BashOutput: { cat: 'run', icon: '📟', vk: 'BashOutput', arg: () => '' },
  KillShell: { cat: 'run', icon: '🛑', vk: 'KillShell', arg: () => '' },
  Monitor: { cat: 'run', icon: '📟', vk: 'Monitor', arg: (i) => i.description || '' },
  WebSearch: { cat: 'web', icon: '🌐', vk: 'WebSearch', arg: (i) => i.query },
  WebFetch: { cat: 'web', icon: '🌍', vk: 'WebFetch', arg: (i) => host(i.url) },
  Agent: { cat: 'agent', icon: '🐣', vk: 'Agent', arg: (i) => i.description || i.subagent_type },
  Task: { cat: 'agent', icon: '🐣', vk: 'Agent', arg: (i) => i.description || i.subagent_type },
  SendMessage: { cat: 'agent', icon: '✉️', vk: 'SendMessage', arg: (i) => i.to || '' },
  TodoWrite: { cat: 'plan', icon: '📋', vk: 'TodoWrite', arg: () => '' },
  EnterPlanMode: { cat: 'plan', icon: '🗺️', vk: 'EnterPlanMode', arg: () => '' },
  ExitPlanMode: { cat: 'ask', icon: '🗺️', vk: 'ExitPlanMode', arg: () => '' },
  AskUserQuestion: { cat: 'ask', icon: '🙋', vk: 'AskUserQuestion', arg: (i) => i.questions?.[0]?.question },
  Skill: { cat: 'skill', icon: '🪄', vk: 'Skill', arg: (i) => i.skill },
  ToolSearch: { cat: 'other', icon: '🧰', vk: 'ToolSearch', arg: () => '' },
  Artifact: { cat: 'write', icon: '🖼️', vk: 'Artifact', arg: (i) => base(i.file_path) || i.action },
};

// mcp__<server>__<tool>
const MCP_SPECIAL = {
  ccd_turn__update_plan: { cat: 'plan', icon: '📋', vk: 'TodoWrite' },
  ccd_turn__wrap_up: { cat: 'plan', icon: '🏁', vk: 'WrapUp' },
};

function mcpTool(name, input) {
  const rest = name.slice(5);
  const sep = rest.indexOf('__');
  const server = sep >= 0 ? rest.slice(0, sep) : rest;
  const tool = sep >= 0 ? rest.slice(sep + 2) : rest;
  const special = MCP_SPECIAL[rest];
  if (special) return { ...special, arg: '' };
  const looksLikeId = /^[0-9a-f]{8}-[0-9a-f]{4}-/.test(server);
  const s = server.toLowerCase();
  const isBrowser = s.includes('browser') || s.includes('chrome') || s.includes('playwright');
  const arg = input?.url ? host(input.url) : input?.query || input?.description || '';
  return {
    cat: isBrowser ? 'web' : 'mcp',
    icon: isBrowser ? '🧭' : '🔌',
    verb: tool.replace(/_/g, ' '),
    arg: arg || (looksLikeId ? '' : server.replace(/^plugin_/, '')),
  };
}

export function toolActivity(name, input = {}, id = null, ts = Date.now()) {
  let spec;
  if (name.startsWith('mcp__')) spec = mcpTool(name, input);
  else {
    const t = TOOLS[name];
    spec = t
      ? { cat: t.cat, icon: t.icon, vk: t.vk, arg: safe(() => t.arg(input || {})) }
      : { cat: 'other', icon: '🔧', verb: name, arg: '' };
  }
  // 아는 도구는 언어와 상관없는 키(vk)만 넘기고 화면에서 번역한다. MCP·모르는 도구는 이름을 그대로 verb 로
  const act = { type: 'tool', id, name, cat: spec.cat, icon: spec.icon, ...(spec.vk ? { vk: spec.vk } : { verb: spec.verb }), arg: clip(spec.arg, 60), ts };
  const task = taskOf(name, input);
  if (task) act.task = task;
  const plan = planOf(name, input);
  if (plan) act.plan = plan;
  if (name === 'Agent' || name === 'Task') {
    act.agentType = input?.subagent_type || 'general-purpose';
    act.description = clip(input?.description, 80);
    act.background = !!input?.run_in_background;
  }
  return act;
}

// 할 일 목록에서 지금 하고 있는 일 (보드·말풍선에 '생각 중' 대신 보여 준다)
function taskOf(name, input) {
  if (name === 'TodoWrite' && Array.isArray(input?.todos)) {
    const t = input.todos.find((x) => x?.status === 'in_progress');
    return t ? clip(t.activeForm || t.content, 60) : '';
  }
  if (name === 'TaskUpdate' && input?.status === 'in_progress') return clip(input.activeForm || input.subject, 60);
  return null;
}

// 데스크톱 앱의 할 일 목록 (update_plan): 항목 전체가 오거나, 다음 칸으로 넘기기·특정 칸 시작만 온다
function planOf(name, input) {
  if (!name.endsWith('ccd_turn__update_plan') || !input) return null;
  const plan = {};
  if (Array.isArray(input.items)) plan.items = input.items.map((x) => ({ content: clip(x?.content, 60), status: x?.status }));
  if (input.advance) plan.advance = true;
  if (Number.isInteger(input.start)) plan.start = input.start;
  return plan.items || plan.advance || plan.start ? plan : null;
}

function safe(fn) {
  try {
    return fn() ?? '';
  } catch {
    return '';
  }
}

const tsOf = (entry) => {
  const t = Date.parse(entry?.timestamp);
  return Number.isFinite(t) ? t : Date.now();
};

// 시스템이 끼워 넣은 꼬리표들을 걷어내고 사람이 쓴 부분만 남긴다
function cleanUserText(text) {
  return String(text)
    .replace(/<system-reminder>[\s\S]*?<\/system-reminder>/g, '')
    .replace(/<\/?pasted_content[^>]*>/g, '')
    .trim();
}

function classifyUserText(raw, ts) {
  const text = cleanUserText(raw);
  if (!text) return null;
  if (text.startsWith('[Request interrupted')) return { type: 'interrupt', ts };
  if (text.startsWith('<task-notification')) {
    const summary = /<summary>([\s\S]*?)<\/summary>/.exec(text)?.[1] || '';
    return { type: 'notify', text: clip(summary, 100), ts }; // 요약이 없으면 화면에서 '백그라운드 작업 알림'
  }
  if (text.startsWith('<scheduled-task')) {
    const name = /name="([^"]+)"/.exec(text)?.[1] || '';
    return { type: 'prompt', text: `⏰ ${name}`.trim(), ts };
  }
  if (text.startsWith('<command-name>')) {
    const name = /<command-name>([^<]*)<\/command-name>/.exec(text)?.[1] || '';
    return { type: 'command', text: name, ts };
  }
  if (text.startsWith('<local-command') || text.startsWith('<side-sessions-event') || text.startsWith('<ci-monitor-event')) {
    return null;
  }
  return { type: 'prompt', text: clip(text, 400), ts };
}

/**
 * 트랜스크립트 한 항목 → 활동 배열
 * @param {any} entry JSON.parse 된 한 줄
 */
export function parseEntry(entry) {
  if (!entry || typeof entry !== 'object') return [];
  const ts = tsOf(entry);
  switch (entry.type) {
    case 'assistant': {
      const content = entry.message?.content;
      if (!Array.isArray(content)) return [];
      const out = [];
      for (const b of content) {
        if (b?.type === 'thinking' || b?.type === 'redacted_thinking') {
          out.push({ type: 'thinking', text: clip(b.thinking || '', 160), ms: entry.thinkingDurationMs || 0, ts });
        } else if (b?.type === 'text') {
          const t = String(b.text || '').trim();
          if (t) out.push({ type: 'text', text: clip(t, 400), ts });
        } else if (b?.type === 'tool_use') {
          out.push(toolActivity(b.name || '?', b.input || {}, b.id || null, ts));
        }
      }
      return out;
    }
    case 'user': {
      if (entry.isMeta) return [];
      const content = entry.message?.content;
      if (typeof content === 'string') {
        const a = classifyUserText(content, ts);
        return a ? [a] : [];
      }
      if (!Array.isArray(content)) return [];
      const out = [];
      const texts = [];
      for (const b of content) {
        if (b?.type === 'tool_result') {
          out.push({ type: 'tool_result', id: b.tool_use_id, isError: !!b.is_error, ts });
        } else if (b?.type === 'text') {
          texts.push(b.text || '');
        }
      }
      if (texts.length) {
        const a = classifyUserText(texts.join('\n'), ts);
        if (a) out.push(a);
      }
      return out;
    }
    case 'system': {
      if (entry.subtype === 'stop_hook_summary' || entry.subtype === 'turn_duration') return [{ type: 'turn_end', ts }];
      return [];
    }
    case 'custom-title':
      return entry.customTitle ? [{ type: 'title', text: entry.customTitle, source: 'custom', ts }] : [];
    case 'agent-name':
      return entry.agentName ? [{ type: 'title', text: entry.agentName, source: 'agent', ts }] : [];
    case 'summary':
      return entry.summary ? [{ type: 'title', text: entry.summary, source: 'summary', ts }] : [];
    default:
      return [];
  }
}

// api-request 계열처럼 크고 쓸모없는 줄은 JSON 파싱 전에 거른다
export function isSkippableLine(line) {
  return (
    line.length < 2 ||
    line.startsWith('{"type":"api-request') ||
    line.startsWith('{"type":"file-history') ||
    line.startsWith('{"type":"atis-latch') ||
    line.startsWith('{"type":"queue-operation') ||
    line.startsWith('{"type":"last-prompt')
  );
}

export { clip };
