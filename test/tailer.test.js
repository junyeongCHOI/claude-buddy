import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { Tailer } from '../src/main/tailer.js';

function fixture(t, content = '', options) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'buddy-tailer-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const file = path.join(dir, 'session.jsonl');
  fs.writeFileSync(file, content);
  return { file, tail: new Tailer(file, options) };
}

test('첫 read는 history이고 이후에는 새로 추가한 줄만 읽는다', (t) => {
  const { file, tail } = fixture(t, '첫 줄\n둘째 줄\n');
  assert.deepEqual(tail.read(), { lines: ['첫 줄', '둘째 줄'], history: true });
  assert.deepEqual(tail.read(), { lines: [], history: false });
  fs.appendFileSync(file, '셋째 줄\n넷째 줄\n');
  assert.deepEqual(tail.read(), { lines: ['셋째 줄', '넷째 줄'], history: false });
  assert.deepEqual(tail.read(), { lines: [], history: false });
});

test('historyBytes보다 크면 중간부터 읽힌 첫 줄을 버린다', (t) => {
  const { tail } = fixture(t, 'discarded-first\nsecond\nthird\n', {
    historyBytes: Buffer.byteLength('first\nsecond\nthird\n'),
  });
  assert.deepEqual(tail.read(), { lines: ['second', 'third'], history: true });
});

test('줄 끝 없는 조각은 다음 read의 내용과 이어 붙인다', (t) => {
  const { file, tail } = fixture(t, 'complete\npar');
  assert.deepEqual(tail.read(), { lines: ['complete'], history: true });
  assert.deepEqual(tail.read(), { lines: [], history: false });
  fs.appendFileSync(file, 'tial');
  assert.deepEqual(tail.read(), { lines: [], history: false });
  fs.appendFileSync(file, '\nnext\n');
  assert.deepEqual(tail.read(), { lines: ['partial', 'next'], history: false });
});

for (const splitAt of [1, 2]) {
  test(`한글 첫 글자의 ${splitAt}바이트 뒤에서 쓰기가 나뉘어도 보존한다`, (t) => {
    const { file, tail } = fixture(t);
    assert.deepEqual(tail.read(), { lines: [], history: true });
    const bytes = Buffer.from('한글 테스트\n', 'utf8');
    fs.appendFileSync(file, bytes.subarray(0, splitAt));
    assert.deepEqual(tail.read(), { lines: [], history: false });
    fs.appendFileSync(file, bytes.subarray(splitAt));
    assert.deepEqual(tail.read(), { lines: ['한글 테스트'], history: false });
  });
}

test('파일이 줄어들면 남은 조각을 버리고 처음부터 읽는다', (t) => {
  const { file, tail } = fixture(t, 'old complete line\nold incomplete fragment');
  tail.read();
  fs.writeFileSync(file, 'new\n');
  assert.deepEqual(tail.read(), { lines: ['new'], history: false });
  fs.appendFileSync(file, 'next\n');
  assert.deepEqual(tail.read(), { lines: ['next'], history: false });
});

test('아직 없는 파일은 null이며 생성 후에는 history로 읽는다', (t) => {
  const { file, tail } = fixture(t);
  fs.unlinkSync(file);
  assert.equal(tail.read(), null);
  fs.writeFileSync(file, 'created\n');
  assert.deepEqual(tail.read(), { lines: ['created'], history: true });
});

test('history 시작점이 줄 경계이면 완전한 첫 줄을 보존한다', (t) => {
  const { tail } = fixture(t, 'old\nkeep\nlast\n', { historyBytes: Buffer.byteLength('keep\nlast\n') });
  assert.deepEqual(tail.read(), { lines: ['keep', 'last'], history: true });
});

test('history가 줄 중간에서 시작하고 개행이 없어도 잘린 줄을 이후에 내보내지 않는다', (t) => {
  const { file, tail } = fixture(t, 'discard-this-fragment', { historyBytes: 8 });
  assert.deepEqual(tail.read(), { lines: [], history: true });
  fs.appendFileSync(file, '-end\nwhole\n');
  assert.deepEqual(tail.read(), { lines: ['whole'], history: false });
});
