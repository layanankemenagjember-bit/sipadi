-- ═══════════════════════════════════════════════════════════
-- SIPADI — Cloudflare D1 Schema
-- Database: SQLite (D1)
-- Jalankan: wrangler d1 execute sipadi-db --file=schema.sql
-- ═══════════════════════════════════════════════════════════

-- ── USERS (operator & admin) ─────────────────────────────────
CREATE TABLE IF NOT EXISTS users (
  id            TEXT PRIMARY KEY,
  nama          TEXT NOT NULL,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role          TEXT NOT NULL CHECK(role IN ('kabupaten','kua','madrasah','kepegawaian','admin')),
  satker        TEXT NOT NULL DEFAULT '',
  hp            TEXT DEFAULT '',
  status        TEXT NOT NULL DEFAULT 'aktif' CHECK(status IN ('aktif','nonaktif')),
  created_at    TEXT DEFAULT (datetime('now'))
);

-- ── SATUAN KERJA ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS satuan_kerja (
  id         TEXT PRIMARY KEY,
  kode       TEXT NOT NULL UNIQUE,
  nama       TEXT NOT NULL,
  jenis      TEXT NOT NULL CHECK(jenis IN ('kua','mi','mts','ma')),
  kepala     TEXT DEFAULT '',
  alamat     TEXT DEFAULT '',
  telp       TEXT DEFAULT '',
  status     TEXT NOT NULL DEFAULT 'aktif' CHECK(status IN ('aktif','nonaktif')),
  created_at TEXT DEFAULT (datetime('now'))
);

-- ── REGISTER NIKAH ───────────────────────────────────────────
CREATE TABLE IF NOT EXISTS register_nikah (
  id           TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  no_akta      TEXT NOT NULL,
  no_pmrk      TEXT DEFAULT '',
  tgl          TEXT NOT NULL,
  suami        TEXT NOT NULL,
  suami_nik    TEXT DEFAULT '',
  suami_ttl    TEXT DEFAULT '',
  suami_pek    TEXT DEFAULT '',
  suami_alamat TEXT DEFAULT '',
  istri        TEXT NOT NULL,
  istri_nik    TEXT DEFAULT '',
  istri_ttl    TEXT DEFAULT '',
  istri_pek    TEXT DEFAULT '',
  istri_alamat TEXT DEFAULT '',
  kua          TEXT NOT NULL,
  tempat       TEXT DEFAULT '',
  wali         TEXT DEFAULT '',
  status       TEXT DEFAULT 'terverifikasi',
  hash         TEXT DEFAULT '',
  file_url     TEXT DEFAULT '',
  created_by   TEXT DEFAULT '',
  created_at   TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_nikah_kua ON register_nikah(kua);
CREATE INDEX IF NOT EXISTS idx_nikah_tgl ON register_nikah(tgl);
CREATE INDEX IF NOT EXISTS idx_nikah_suami ON register_nikah(suami);

-- ── IJAZAH ───────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS ijazah (
  id         TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  no         TEXT NOT NULL,
  thn        TEXT NOT NULL,
  nama       TEXT NOT NULL,
  ttl        TEXT DEFAULT '',
  nisn       TEXT DEFAULT '',
  madrasah   TEXT NOT NULL,
  jenjang    TEXT NOT NULL CHECK(jenjang IN ('MI','MTs','MA')),
  jurusan    TEXT DEFAULT '',
  nilai      TEXT DEFAULT '',
  kepala     TEXT DEFAULT '',
  status     TEXT DEFAULT 'terverifikasi',
  hash       TEXT DEFAULT '',
  file_url   TEXT DEFAULT '',
  created_by TEXT DEFAULT '',
  created_at TEXT DEFAULT (datetime('now'))
);
CREATE INDEX IF NOT EXISTS idx_ijazah_madrasah ON ijazah(madrasah);
CREATE INDEX IF NOT EXISTS idx_ijazah_thn ON ijazah(thn);
CREATE INDEX IF NOT EXISTS idx_ijazah_nama ON ijazah(nama);

-- ── SESSIONS (token JWT sederhana) ───────────────────────────
CREATE TABLE IF NOT EXISTS sessions (
  token      TEXT PRIMARY KEY,
  user_id    TEXT NOT NULL,
  expires_at TEXT NOT NULL,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_exp  ON sessions(expires_at);

-- ── KEPEGAWAIAN ──────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS pegawai (
  id            TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  nip           TEXT DEFAULT '',
  nama          TEXT NOT NULL,
  gelar         TEXT DEFAULT '',
  ttl           TEXT DEFAULT '',
  tgl_lahir     TEXT DEFAULT '',
  jk            TEXT DEFAULT 'L',
  jabatan       TEXT DEFAULT '',
  satker        TEXT DEFAULT '',
  golongan      TEXT DEFAULT '',
  tmt_golongan  TEXT DEFAULT '',
  eselon        TEXT DEFAULT '',
  tmt_jabatan   TEXT DEFAULT '',
  jenis         TEXT DEFAULT 'PNS',
  pendidikan    TEXT DEFAULT '',
  prodi         TEXT DEFAULT '',
  hp            TEXT DEFAULT '',
  email         TEXT DEFAULT '',
  status        TEXT DEFAULT 'aktif',
  catatan       TEXT DEFAULT '',
  file_url      TEXT DEFAULT '',
  hash          TEXT DEFAULT '',
  created_at    TEXT DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS riwayat_golongan (
  id          TEXT PRIMARY KEY DEFAULT (lower(hex(randomblob(16)))),
  pegawai_id  TEXT NOT NULL,
  dari        TEXT DEFAULT '',
  ke          TEXT NOT NULL,
  tmt         TEXT NOT NULL,
  no_sk       TEXT DEFAULT '',
  keterangan  TEXT DEFAULT '',
  FOREIGN KEY (pegawai_id) REFERENCES pegawai(id) ON DELETE CASCADE
);
