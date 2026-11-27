#!/usr/bin/env node
// Verifica em Node puro (Windows + Unix) se `agentic-os.skill` bate com `skills/agentic-os/{SKILL,wizard}.md`.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import zlib from 'node:zlib';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(REPO, 'agentic-os.skill');

function readZip(buf) {
  const map = new Map();
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 65557); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) {
      eocd = i;
      break;
    }
  }
  if (eocd === -1) throw new Error('ZIP inválido (EOCD ausente)');
  const total = buf.readUInt16LE(eocd + 10);
  let ptr = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (buf.readUInt32LE(ptr) !== 0x02014b50) throw new Error('ZIP inválido (central header)');
    const method = buf.readUInt16LE(ptr + 10);
    const compSize = buf.readUInt32LE(ptr + 20);
    const nameLen = buf.readUInt16LE(ptr + 28);
    const extraLen = buf.readUInt16LE(ptr + 30);
    const commentLen = buf.readUInt16LE(ptr + 32);
    const localOffset = buf.readUInt32LE(ptr + 42);
    const name = buf.toString('utf8', ptr + 46, ptr + 46 + nameLen);
    ptr += 46 + nameLen + extraLen + commentLen;

    if (buf.readUInt32LE(localOffset) !== 0x04034b50) throw new Error('ZIP inválido (local header)');
    const lName = buf.readUInt16LE(localOffset + 26);
    const lExtra = buf.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + lName + lExtra;
    const raw = buf.subarray(start, start + compSize);
    const data = method === 0 ? raw : method === 8 ? zlib.inflateRawSync(raw) : null;
    if (!data) throw new Error(`Método ZIP não suportado: ${method}`);
    map.set(name, data.toString('utf8').replace(/\r\n/g, '\n'));
  }
  return map;
}

if (!fs.existsSync(OUT)) {
  console.error('FAIL: agentic-os.skill não existe. Rode: node scripts/build-skill.mjs');
  process.exit(1);
}

const files = readZip(fs.readFileSync(OUT));
let fail = 0;
for (const f of ['SKILL.md', 'wizard.md']) {
  const src = fs.readFileSync(path.join(REPO, 'skills', 'agentic-os', f), 'utf8').replace(/\r\n/g, '\n');
  const packed = files.get(`agentic-os/${f}`);
  if (packed !== src) {
    console.error(`FAIL: agentic-os.skill está DESATUALIZADO em relação a skills/agentic-os/${f}.`);
    fail = 1;
  }
}
if (fail) {
  console.error('      Rode: node scripts/build-skill.mjs  e commite o resultado.');
  process.exit(1);
}
console.log('OK: agentic-os.skill está sincronizado com skills/agentic-os/{SKILL,wizard}.md');
