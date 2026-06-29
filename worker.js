/**
 * SIPADI — Cloudflare Worker
 * Auth + API untuk Cloudflare D1 (SQLite) + R2 (File Storage)
 * Deploy: wrangler deploy
 */

import { compare, hash } from 'bcryptjs';

// ── CORS headers ──────────────────────────────────────────────
const CORS = {
  'Access-Control-Allow-Origin':  '*',
  'Access-Control-Allow-Methods': 'GET,POST,PUT,DELETE,OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type,Authorization',
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json', ...CORS },
  });
}

function err(msg, status = 400) {
  return json({ error: msg }, status);
}

// ── Token sederhana (32-byte random hex, disimpan di tabel sessions) ─
function genToken() {
  const arr = new Uint8Array(32);
  crypto.getRandomValues(arr);
  return [...arr].map(b => b.toString(16).padStart(2, '0')).join('');
}

// ── Verifikasi token dari header Authorization: Bearer <token> ──
async function verifyToken(request, db) {
  const auth = request.headers.get('Authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
  if (!token) return null;

  const now = new Date().toISOString();
  const row = await db.prepare(
    `SELECT s.user_id, u.role, u.satker, u.nama, u.email
     FROM sessions s JOIN users u ON s.user_id = u.id
     WHERE s.token = ? AND s.expires_at > ? AND u.status = 'aktif'`
  ).bind(token, now).first();

  return row || null;
}

// ── UUID v4 sederhana ─────────────────────────────────────────
function uuid() {
  const b = new Uint8Array(16);
  crypto.getRandomValues(b);
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = [...b].map(x => x.toString(16).padStart(2,'0'));
  return `${h.slice(0,4).join('')}-${h.slice(4,6).join('')}-${h.slice(6,8).join('')}-${h.slice(8,10).join('')}-${h.slice(10).join('')}`;
}

// ════════════════════════════════════════════════════════════════
// ROUTES
// ════════════════════════════════════════════════════════════════
export default {
  async fetch(request, env) {
    // Preflight CORS
    if (request.method === 'OPTIONS') {
      return new Response(null, { status: 204, headers: CORS });
    }

    const url  = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, ''); // hapus trailing slash
    const db   = env.DB;

    // ── POST /auth/login ─────────────────────────────────────
    if (path === '/auth/login' && request.method === 'POST') {
      const { email, password } = await request.json().catch(() => ({}));
      if (!email || !password) return err('Email dan password wajib diisi');

      const user = await db.prepare(
        `SELECT * FROM users WHERE email = ? AND status = 'aktif'`
      ).bind(email.trim().toLowerCase()).first();

      if (!user) return err('Email tidak ditemukan atau akun nonaktif', 401);

      const ok = await compare(password, user.password_hash);
      if (!ok) return err('Password salah', 401);

      // Buat session — expired 8 jam
      const token     = genToken();
      const expiresAt = new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString();
      await db.prepare(
        `INSERT INTO sessions (token, user_id, expires_at) VALUES (?, ?, ?)`
      ).bind(token, user.id, expiresAt).run();

      // Hapus session lama milik user ini (opsional — bersihkan)
      await db.prepare(
        `DELETE FROM sessions WHERE user_id = ? AND expires_at < datetime('now')`
      ).bind(user.id).run();

      return json({
        token,
        user: { id: user.id, nama: user.nama, email: user.email, role: user.role, satker: user.satker }
      });
    }

    // ── POST /auth/logout ────────────────────────────────────
    if (path === '/auth/logout' && request.method === 'POST') {
      const auth  = request.headers.get('Authorization') || '';
      const token = auth.startsWith('Bearer ') ? auth.slice(7) : null;
      if (token) await db.prepare(`DELETE FROM sessions WHERE token = ?`).bind(token).run();
      return json({ ok: true });
    }

    // ── GET /auth/me ─────────────────────────────────────────
    if (path === '/auth/me' && request.method === 'GET') {
      const user = await verifyToken(request, db);
      if (!user) return err('Unauthorized', 401);
      return json({ user });
    }

    // ════════ SEMUA ROUTE BERIKUT BUTUH AUTH ═════════════════
    const me = await verifyToken(request, db);
    if (!me) return err('Unauthorized — token tidak valid atau expired', 401);

    const isAdmin = ['kabupaten','admin'].includes(me.role);

    // ── GET /satker ──────────────────────────────────────────
    if (path === '/satker' && request.method === 'GET') {
      const { results } = await db.prepare(
        `SELECT * FROM satuan_kerja ORDER BY kode`
      ).all();
      return json(results);
    }

    // ── GET /nikah ───────────────────────────────────────────
    if (path === '/nikah' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '500'), 1000);
      let q, rows;
      if (isAdmin) {
        rows = await db.prepare(
          `SELECT * FROM register_nikah ORDER BY tgl DESC LIMIT ?`
        ).bind(limit).all();
      } else if (me.role === 'kua') {
        const kuaNama = me.satker.replace('KUA Kecamatan ', '');
        rows = await db.prepare(
          `SELECT * FROM register_nikah WHERE kua = ? ORDER BY tgl DESC LIMIT ?`
        ).bind(kuaNama, limit).all();
      } else {
        return json([]);
      }
      return json(rows.results || []);
    }

    // ── POST /nikah ──────────────────────────────────────────
    if (path === '/nikah' && request.method === 'POST') {
      if (!['kabupaten','admin','kua'].includes(me.role))
        return err('Akses ditolak', 403);

      const b  = await request.json();
      const id = uuid();
      await db.prepare(`
        INSERT INTO register_nikah
          (id,no_akta,no_pmrk,tgl,suami,suami_nik,suami_ttl,suami_pek,suami_alamat,
           istri,istri_nik,istri_ttl,istri_pek,istri_alamat,kua,tempat,wali,
           status,hash,file_url,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        id, b.no_akta||'', b.no_pmrk||'', b.tgl||'',
        b.suami||'', b.suami_nik||'', b.suami_ttl||'', b.suami_pek||'', b.suami_alamat||'',
        b.istri||'', b.istri_nik||'', b.istri_ttl||'', b.istri_pek||'', b.istri_alamat||'',
        b.kua||'', b.tempat||'', b.wali||'',
        b.status||'terverifikasi', b.hash||'', b.file_url||'', me.user_id
      ).run();
      return json({ id }, 201);
    }

    // ── PUT /nikah/:id ───────────────────────────────────────
    const nikahEdit = path.match(/^\/nikah\/([^/]+)$/);
    if (nikahEdit && request.method === 'PUT') {
      if (!['kabupaten','admin','kua'].includes(me.role))
        return err('Akses ditolak', 403);
      const id = nikahEdit[1];
      const b  = await request.json();
      await db.prepare(`
        UPDATE register_nikah SET
          no_akta=?,no_pmrk=?,tgl=?,suami=?,suami_nik=?,suami_ttl=?,suami_pek=?,suami_alamat=?,
          istri=?,istri_nik=?,istri_ttl=?,istri_pek=?,istri_alamat=?,kua=?,tempat=?,wali=?,
          status=?,hash=?,file_url=?
        WHERE id=?
      `).bind(
        b.no_akta||'', b.no_pmrk||'', b.tgl||'',
        b.suami||'', b.suami_nik||'', b.suami_ttl||'', b.suami_pek||'', b.suami_alamat||'',
        b.istri||'', b.istri_nik||'', b.istri_ttl||'', b.istri_pek||'', b.istri_alamat||'',
        b.kua||'', b.tempat||'', b.wali||'',
        b.status||'terverifikasi', b.hash||'', b.file_url||'', id
      ).run();
      return json({ ok: true });
    }

    // ── DELETE /nikah/:id ────────────────────────────────────
    if (nikahEdit && request.method === 'DELETE') {
      if (!isAdmin) return err('Akses ditolak', 403);
      await db.prepare(`DELETE FROM register_nikah WHERE id = ?`).bind(nikahEdit[1]).run();
      return json({ ok: true });
    }

    // ── GET /ijazah ──────────────────────────────────────────
    if (path === '/ijazah' && request.method === 'GET') {
      const limit = Math.min(parseInt(url.searchParams.get('limit') || '500'), 1000);
      let rows;
      if (isAdmin) {
        rows = await db.prepare(
          `SELECT * FROM ijazah ORDER BY thn DESC LIMIT ?`
        ).bind(limit).all();
      } else if (me.role === 'madrasah') {
        rows = await db.prepare(
          `SELECT * FROM ijazah WHERE madrasah = ? ORDER BY thn DESC LIMIT ?`
        ).bind(me.satker, limit).all();
      } else {
        return json([]);
      }
      return json(rows.results || []);
    }

    // ── POST /ijazah ─────────────────────────────────────────
    if (path === '/ijazah' && request.method === 'POST') {
      if (!['kabupaten','admin','madrasah'].includes(me.role))
        return err('Akses ditolak', 403);
      const b  = await request.json();
      const id = uuid();
      await db.prepare(`
        INSERT INTO ijazah (id,no,thn,nama,ttl,nisn,madrasah,jenjang,jurusan,nilai,kepala,status,hash,file_url,created_by)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        id, b.no||'', b.thn||'', b.nama||'', b.ttl||'', b.nisn||'',
        b.madrasah||'', b.jenjang||'', b.jurusan||'', b.nilai||'', b.kepala||'',
        b.status||'terverifikasi', b.hash||'', b.file_url||'', me.user_id
      ).run();
      return json({ id }, 201);
    }

    // ── PUT /ijazah/:id ──────────────────────────────────────
    const ijazahEdit = path.match(/^\/ijazah\/([^/]+)$/);
    if (ijazahEdit && request.method === 'PUT') {
      if (!['kabupaten','admin','madrasah'].includes(me.role))
        return err('Akses ditolak', 403);
      const b = await request.json();
      await db.prepare(`
        UPDATE ijazah SET no=?,thn=?,nama=?,ttl=?,nisn=?,madrasah=?,jenjang=?,
          jurusan=?,nilai=?,kepala=?,status=?,hash=?,file_url=?
        WHERE id=?
      `).bind(
        b.no||'', b.thn||'', b.nama||'', b.ttl||'', b.nisn||'',
        b.madrasah||'', b.jenjang||'', b.jurusan||'', b.nilai||'', b.kepala||'',
        b.status||'terverifikasi', b.hash||'', b.file_url||'', ijazahEdit[1]
      ).run();
      return json({ ok: true });
    }

    // ── DELETE /ijazah/:id ───────────────────────────────────
    if (ijazahEdit && request.method === 'DELETE') {
      if (!isAdmin) return err('Akses ditolak', 403);
      await db.prepare(`DELETE FROM ijazah WHERE id = ?`).bind(ijazahEdit[1]).run();
      return json({ ok: true });
    }

    // ── GET /operators ───────────────────────────────────────
    if (path === '/operators' && request.method === 'GET') {
      if (!isAdmin) return err('Akses ditolak', 403);
      const { results } = await db.prepare(
        `SELECT id,nama,email,role,satker,hp,status,created_at FROM users ORDER BY nama`
      ).all();
      return json(results);
    }

    // ── POST /operators ──────────────────────────────────────
    if (path === '/operators' && request.method === 'POST') {
      if (!isAdmin) return err('Akses ditolak', 403);
      const b = await request.json();
      if (!b.email || !b.password) return err('Email dan password wajib');
      const existing = await db.prepare(`SELECT id FROM users WHERE email = ?`)
        .bind(b.email.toLowerCase()).first();
      if (existing) return err('Email sudah terdaftar');

      const pwHash = await hash(b.password, 10);
      const id     = uuid();
      await db.prepare(`
        INSERT INTO users (id,nama,email,password_hash,role,satker,hp,status)
        VALUES (?,?,?,?,?,?,?,?)
      `).bind(
        id, b.nama||'', b.email.toLowerCase(), pwHash,
        b.role||'kua', b.satker||'', b.hp||'', b.status||'aktif'
      ).run();
      return json({ id }, 201);
    }

    // ── PUT /operators/:id ───────────────────────────────────
    const opEdit = path.match(/^\/operators\/([^/]+)$/);
    if (opEdit && request.method === 'PUT') {
      if (!isAdmin) return err('Akses ditolak', 403);
      const b  = await request.json();
      const id = opEdit[1];

      if (b.password) {
        const pwHash = await hash(b.password, 10);
        await db.prepare(`
          UPDATE users SET nama=?,role=?,satker=?,hp=?,status=?,password_hash=? WHERE id=?
        `).bind(b.nama||'', b.role||'kua', b.satker||'', b.hp||'', b.status||'aktif', pwHash, id).run();
      } else {
        await db.prepare(`
          UPDATE users SET nama=?,role=?,satker=?,hp=?,status=? WHERE id=?
        `).bind(b.nama||'', b.role||'kua', b.satker||'', b.hp||'', b.status||'aktif', id).run();
      }
      return json({ ok: true });
    }

    // ── DELETE /operators/:id ────────────────────────────────
    if (opEdit && request.method === 'DELETE') {
      if (!isAdmin) return err('Akses ditolak', 403);
      await db.prepare(`DELETE FROM users WHERE id = ?`).bind(opEdit[1]).run();
      return json({ ok: true });
    }

    // ── POST /auth/change-password ───────────────────────────
    if (path === '/auth/change-password' && request.method === 'POST') {
      const { old_password, new_password } = await request.json().catch(() => ({}));
      if (!old_password || !new_password) return err('Password lama dan baru wajib diisi');
      const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(me.user_id).first();
      const ok   = await compare(old_password, user.password_hash);
      if (!ok) return err('Password lama salah', 401);
      const pwHash = await hash(new_password, 10);
      await db.prepare(`UPDATE users SET password_hash = ? WHERE id = ?`).bind(pwHash, me.user_id).run();
      return json({ ok: true });
    }

    // ── GET /verify/:hash ────────────────────────────────────
    // Public endpoint — tidak butuh auth (untuk QR code verifikasi)
    if (path.startsWith('/verify/')) {
      const hashVal = decodeURIComponent(path.slice(8));
      const nikah = await db.prepare(
        `SELECT id,no_akta,tgl,suami,istri,kua,status,hash FROM register_nikah WHERE hash = ?`
      ).bind(hashVal).first();
      if (nikah) return json({ type: 'nikah', data: nikah });

      const ijazah = await db.prepare(
        `SELECT id,no,thn,nama,madrasah,jenjang,status,hash FROM ijazah WHERE hash = ?`
      ).bind(hashVal).first();
      if (ijazah) return json({ type: 'ijazah', data: ijazah });

      return json({ type: null, data: null }, 404);
    }

    // ── GET /pegawai ─────────────────────────────────────────
    if (path === '/pegawai' && request.method === 'GET') {
      if (!['kabupaten','admin','kepegawaian'].includes(me.role))
        return json([]);
      const { results } = await db.prepare(
        `SELECT * FROM pegawai ORDER BY nama`
      ).all();
      return json(results);
    }

    // ── POST /pegawai ─────────────────────────────────────────
    if (path === '/pegawai' && request.method === 'POST') {
      if (!['kabupaten','admin','kepegawaian'].includes(me.role))
        return err('Akses ditolak', 403);
      const b  = await request.json();
      const id = uuid();
      await db.prepare(`
        INSERT INTO pegawai (id,nip,nama,gelar,ttl,tgl_lahir,jk,jabatan,satker,golongan,
          tmt_golongan,eselon,tmt_jabatan,jenis,pendidikan,prodi,hp,email,status,catatan,file_url,hash)
        VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      `).bind(
        id, b.nip||'', b.nama||'', b.gelar||'', b.ttl||'', b.tgl_lahir||'',
        b.jk||'L', b.jabatan||'', b.satker||'', b.golongan||'',
        b.tmt_golongan||'', b.eselon||'', b.tmt_jabatan||'', b.jenis||'PNS',
        b.pendidikan||'', b.prodi||'', b.hp||'', b.email||'',
        b.status||'aktif', b.catatan||'', b.file_url||'', b.hash||''
      ).run();
      return json({ id }, 201);
    }

    // ── PUT /pegawai/:id ──────────────────────────────────────
    const pegEdit = path.match(/^\/pegawai\/([^/]+)$/);
    if (pegEdit && request.method === 'PUT') {
      if (!['kabupaten','admin','kepegawaian'].includes(me.role))
        return err('Akses ditolak', 403);
      const b = await request.json();
      await db.prepare(`
        UPDATE pegawai SET nip=?,nama=?,gelar=?,ttl=?,tgl_lahir=?,jk=?,jabatan=?,satker=?,
          golongan=?,tmt_golongan=?,eselon=?,tmt_jabatan=?,jenis=?,pendidikan=?,prodi=?,
          hp=?,email=?,status=?,catatan=?,file_url=?,hash=?
        WHERE id=?
      `).bind(
        b.nip||'', b.nama||'', b.gelar||'', b.ttl||'', b.tgl_lahir||'',
        b.jk||'L', b.jabatan||'', b.satker||'', b.golongan||'',
        b.tmt_golongan||'', b.eselon||'', b.tmt_jabatan||'', b.jenis||'PNS',
        b.pendidikan||'', b.prodi||'', b.hp||'', b.email||'',
        b.status||'aktif', b.catatan||'', b.file_url||'', b.hash||'', pegEdit[1]
      ).run();
      return json({ ok: true });
    }

    // ── DELETE /pegawai/:id ───────────────────────────────────
    if (pegEdit && request.method === 'DELETE') {
      if (!isAdmin) return err('Akses ditolak', 403);
      await db.prepare(`DELETE FROM pegawai WHERE id = ?`).bind(pegEdit[1]).run();
      return json({ ok: true });
    }

    // ── R2 Upload URL (presigned PUT) ─────────────────────────
    // GET /upload-url?folder=nikah/Ajung&ext=pdf
    if (path === '/upload-url' && request.method === 'GET') {
      // Worker menggenerate key, lalu client upload langsung ke R2 public URL
      // Alternatif: Worker yang upload jika R2 bucket tidak public
      const folder = url.searchParams.get('folder') || 'misc';
      const ext    = (url.searchParams.get('ext') || 'pdf').replace(/[^a-z0-9]/gi,'');
      const key    = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;

      // Upload via Worker (pipe body ke R2)
      return json({ key, uploadEndpoint: `/upload/${encodeURIComponent(key)}` });
    }

    // ── PUT /upload/:key — pipe file ke R2 ───────────────────
    if (path.startsWith('/upload/') && request.method === 'PUT') {
      const key         = decodeURIComponent(path.slice(8));
      const contentType = request.headers.get('Content-Type') || 'application/octet-stream';
      await env.R2.put(key, request.body, { httpMetadata: { contentType } });
      const publicUrl = `${env.R2_PUBLIC_URL}/${key}`;
      return json({ url: publicUrl });
    }

    return err('Route tidak ditemukan', 404);
  }
};
