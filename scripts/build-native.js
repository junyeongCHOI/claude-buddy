// native/winwatch.swift 를 컴파일한다. 바이너리가 최신이면 건너뛴다.
// swiftc 가 없으면 경고만 하고 넘어간다 (캐릭터는 바닥에서만 돌아다님).
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const src = path.join(root, 'native', 'winwatch.swift');
const out = path.join(root, 'native', 'bin', 'winwatch');

if (process.platform !== 'darwin') process.exit(0);

const mtime = (p) => {
  try {
    return fs.statSync(p).mtimeMs;
  } catch {
    return 0;
  }
};

if (mtime(out) >= mtime(src)) process.exit(0);

fs.mkdirSync(path.dirname(out), { recursive: true });
try {
  console.log('[claude-buddy] 창 위치 헬퍼 컴파일 중…');
  execFileSync('swiftc', ['-O', src, '-o', out], { stdio: 'inherit' });
} catch (err) {
  console.warn('[claude-buddy] swiftc 로 컴파일하지 못했어요. 창 위를 걷는 기능 없이 실행합니다.', err.message);
}
