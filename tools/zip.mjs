// Minimal deterministic zip writer (deflate, no dependencies): the same files give the same bytes,
// so a release's SHA-256 can be reproduced from the tagged commit.
import { crc32, deflateRawSync } from 'node:zlib';

// 1980-01-01 00:00, the earliest DOS timestamp: every entry gets it.
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

/** entries: [{ path: 'swarm/SKILL.md', data: Buffer, mode?: 0o644 }] → zip Buffer. Directories are implied. */
export function zip(entries) {
    const files = [...entries].sort((a, b) => Buffer.compare(Buffer.from(a.path), Buffer.from(b.path)));
    const locals = [];
    const centrals = [];
    let offset = 0;
    for (const { path, data, mode = 0o644 } of files) {
        const name = Buffer.from(path, 'utf8');
        const packed = deflateRawSync(data, { level: 9 });
        const store = packed.length >= data.length;
        const body = store ? data : packed;
        const crc = crc32(data);

        const local = Buffer.alloc(30);
        local.writeUInt32LE(0x04034b50, 0);
        local.writeUInt16LE(20, 4); // version needed
        local.writeUInt16LE(0x0800, 6); // UTF-8 names
        local.writeUInt16LE(store ? 0 : 8, 8);
        local.writeUInt16LE(DOS_TIME, 10);
        local.writeUInt16LE(DOS_DATE, 12);
        local.writeUInt32LE(crc, 14);
        local.writeUInt32LE(body.length, 18);
        local.writeUInt32LE(data.length, 22);
        local.writeUInt16LE(name.length, 26);
        local.writeUInt16LE(0, 28);
        locals.push(local, name, body);

        const central = Buffer.alloc(46);
        central.writeUInt32LE(0x02014b50, 0);
        central.writeUInt16LE((3 << 8) | 20, 4); // made by: Unix, so the mode below is honoured
        central.writeUInt16LE(20, 6);
        central.writeUInt16LE(0x0800, 8);
        central.writeUInt16LE(store ? 0 : 8, 10);
        central.writeUInt16LE(DOS_TIME, 12);
        central.writeUInt16LE(DOS_DATE, 14);
        central.writeUInt32LE(crc, 16);
        central.writeUInt32LE(body.length, 20);
        central.writeUInt32LE(data.length, 24);
        central.writeUInt16LE(name.length, 28);
        central.writeUInt32LE(((0o100000 | mode) << 16) >>> 0, 38); // regular file + permissions
        central.writeUInt32LE(offset, 42);
        centrals.push(central, name);

        offset += local.length + name.length + body.length;
    }
    const cd = Buffer.concat(centrals);
    const end = Buffer.alloc(22);
    end.writeUInt32LE(0x06054b50, 0);
    end.writeUInt16LE(files.length, 8);
    end.writeUInt16LE(files.length, 10);
    end.writeUInt32LE(cd.length, 12);
    end.writeUInt32LE(offset, 16);
    return Buffer.concat([...locals, cd, end]);
}
