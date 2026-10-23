// native/bin/winwatch 를 띄워서 화면 위 창·위젯 위치를 받는다.
import { spawn } from 'node:child_process';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import readline from 'node:readline';

export class WindowWatcher extends EventEmitter {
  constructor(bin) {
    super();
    this.bin = bin;
    this.proc = null;
    this.list = [];
    this.stopped = false;
    this.failures = 0;
  }

  start() {
    this.stopped = false;
    if (process.platform !== 'darwin' || !fs.existsSync(this.bin)) {
      console.warn('[windows] 창 위치 헬퍼가 없어서 바닥에서만 놀아요:', this.bin);
      return;
    }
    const proc = spawn(this.bin, [String(process.pid), '120'], { stdio: ['ignore', 'pipe', 'inherit'] });
    this.proc = proc;
    // 실행 권한·아키텍처 문제 등으로 못 띄우면 'error' 가 온다 — 없으면 메인 프로세스가 죽는다
    proc.on('error', (err) => {
      console.warn('[windows] 창 위치 헬퍼 실행 실패:', err.message);
    });
    readline.createInterface({ input: proc.stdout }).on('line', (line) => {
      try {
        const v = JSON.parse(line);
        if (Array.isArray(v)) {
          this.list = v;
          this.emit('windows', v);
        } else if (v?.t === 'click') this.emit('click', v);
      } catch {
        /* 무시 */
      }
    });
    proc.on('close', (code) => {
      if (this.proc === proc) this.proc = null;
      if (this.stopped) return;
      // 계속 죽으면 점점 늦게, 열 번 넘게 실패하면 포기 (바닥에서만 논다)
      this.failures = code === 0 ? 0 : this.failures + 1;
      if (this.failures > 10) return console.warn('[windows] 창 위치 헬퍼를 포기합니다');
      setTimeout(() => this.start(), Math.min(30000, 2000 * 2 ** Math.max(0, this.failures - 1)));
    });
  }

  stop() {
    this.stopped = true;
    this.proc?.kill();
    this.proc = null;
  }
}
