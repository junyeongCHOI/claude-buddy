// JSONL 파일 끝을 따라 읽는다. 처음 붙을 때는 끝부분 historyBytes 만큼을 "과거"로 읽고,
// 그 뒤로는 새로 붙은 줄만 돌려준다. 줄 단위(0x0A)로 자르므로 UTF-8 이 깨지지 않는다.
import fs from 'node:fs';

const MAX_CHUNK = 4 * 1024 * 1024;

export class Tailer {
  constructor(file, { historyBytes = 1024 * 1024 } = {}) {
    this.file = file;
    this.historyBytes = historyBytes;
    this.offset = null;
    this.rest = Buffer.alloc(0);
    this.mtimeMs = 0;
  }

  /** @returns {{lines: string[], history: boolean} | null} 파일이 없으면 null */
  read() {
    let st;
    try {
      st = fs.statSync(this.file);
    } catch {
      return null;
    }
    this.mtimeMs = st.mtimeMs;

    if (this.offset === null) {
      const start = Math.max(0, st.size - this.historyBytes);
      // 줄 중간에서 시작하면 첫 개행까지는 잘린 조각이라 버린다 (바로 앞이 개행이면 줄 경계)
      this.skipPartial = start > 0 && this.#readRange(start - 1, start)[0] !== 0x0a;
      const buf = this.#readRange(start, st.size);
      this.offset = start + buf.length;
      return { lines: this.#split(buf), history: true };
    }

    if (st.size < this.offset) {
      // 파일이 다시 써짐
      this.offset = 0;
      this.rest = Buffer.alloc(0);
      this.skipPartial = false;
    }
    if (st.size === this.offset) return { lines: [], history: false };

    const end = Math.min(st.size, this.offset + MAX_CHUNK);
    const buf = this.#readRange(this.offset, end);
    this.offset += buf.length;
    return { lines: this.#split(buf), history: false };
  }

  #readRange(start, end) {
    const len = end - start;
    if (len <= 0) return Buffer.alloc(0);
    const fd = fs.openSync(this.file, 'r');
    try {
      const buf = Buffer.allocUnsafe(len);
      const n = fs.readSync(fd, buf, 0, len, start);
      return buf.subarray(0, n);
    } finally {
      fs.closeSync(fd);
    }
  }

  #split(buf) {
    let data = this.rest.length ? Buffer.concat([this.rest, buf]) : buf;
    if (this.skipPartial) {
      const nl = data.indexOf(0x0a);
      if (nl < 0) {
        this.rest = Buffer.alloc(0);
        return [];
      }
      data = data.subarray(nl + 1);
      this.skipPartial = false;
    }
    const lines = [];
    let from = 0;
    for (;;) {
      const nl = data.indexOf(0x0a, from);
      if (nl < 0) break;
      if (nl > from) lines.push(data.toString('utf8', from, nl));
      from = nl + 1;
    }
    this.rest = Buffer.from(data.subarray(from));
    return lines;
  }
}
