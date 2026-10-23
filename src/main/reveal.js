// 캐릭터를 누르면 그 세션이 돌고 있는 곳을 앞으로 가져온다.
//  - Claude 데스크톱 앱 세션: claude:// 링크로 그 세션을 연다
//  - 터미널·IDE 세션: 프로세스 부모를 거슬러 올라가 그 앱을 찾아 앞으로. Terminal·iTerm2 면 그 탭까지 고른다
import { execFile } from 'node:child_process';
import { shell } from 'electron';

const run = (cmd, args) =>
  new Promise((resolve) => execFile(cmd, args, { timeout: 3000 }, (err, out) => resolve(err ? '' : String(out))));

async function procInfo(pid) {
  const out = (await run('ps', ['-o', 'ppid=,tty=,comm=', '-p', String(pid)])).trim();
  const m = /^(\d+)\s+(\S+)\s+(.+)$/.exec(out);
  return m ? { ppid: Number(m[1]), tty: m[2], comm: m[3] } : null;
}

/** pid 의 조상 중 처음 나오는 .app 번들 경로 */
async function appOf(pid) {
  for (let i = 0, p = pid; i < 15 && p > 1; i++) {
    const info = await procInfo(p);
    if (!info) return null;
    const at = info.comm.indexOf('.app/');
    if (at > 0) return info.comm.slice(0, at + 4);
    p = info.ppid;
  }
  return null;
}

/** pid 의 조상 중 처음 나오는 .app 프로세스의 pid (그 세션이 도는 터미널·IDE) */
export async function hostAppPid(pid) {
  for (let i = 0, p = pid; i < 15 && p > 1; i++) {
    const info = await procInfo(p);
    if (!info) return null;
    if (info.comm.includes('.app/')) return p;
    p = info.ppid;
  }
  return null;
}

// tty 는 argv 로만 넘긴다 (스크립트 문자열에 끼워 넣지 않음)
const TERMINAL_TAB = `on run argv
  set target to item 1 of argv
  tell application "Terminal"
    repeat with w in windows
      repeat with t in tabs of w
        if tty of t is target then
          set selected of t to true
          set index of w to 1
        end if
      end repeat
    end repeat
    activate
  end tell
end run`;

const ITERM_TAB = `on run argv
  set target to item 1 of argv
  tell application "iTerm2"
    repeat with w in windows
      repeat with t in tabs of w
        repeat with s in sessions of t
          if tty of s is target then
            select w
            select t
            select s
          end if
        end repeat
      end repeat
    end repeat
    activate
  end tell
end run`;

/**
 * @param {{pid?: number, entrypoint?: string, hostSessionId?: string}} s  수집기의 세션 정보
 * @returns {Promise<string>} 무엇을 했는지 ('desktop' | 'terminal' | 'iterm' | 'app' | '')
 */
export async function revealSession(s) {
  if (!s) return '';
  if (/^local_[\w-]+$/.test(s.hostSessionId || '')) {
    await shell.openExternal(`claude://claude.ai/epitaxy/${s.hostSessionId}`);
    return 'desktop';
  }
  if (!s.pid) return '';
  const [info, appPath] = await Promise.all([procInfo(s.pid), appOf(s.pid)]);
  const tty = info?.tty && info.tty !== '??' ? `/dev/${info.tty}` : '';
  const name = appPath?.split('/').pop() || '';
  if (tty && name === 'Terminal.app') {
    await run('osascript', ['-e', TERMINAL_TAB, tty]);
    return 'terminal';
  }
  if (tty && /^iTerm/.test(name)) {
    await run('osascript', ['-e', ITERM_TAB, tty]);
    return 'iterm';
  }
  if (appPath) {
    await run('open', ['-a', appPath]);
    return 'app';
  }
  return '';
}
