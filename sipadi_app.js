
// ═══════════ DATA CONSTANTS ═══════════
const KUA=['Ajung','Ambulu','Arjasa','Balung','Bangsalsari','Gumukmas','Jember','Jenggawah','Jombang','Kalisat','Kaliwates','Kencong','Ledokombo','Mayang','Mumbulsari','Panti','Patrang','Puger','Semboro','Silo','Sukorambi','Sukowono','Sumberbaru','Sumberjambe','Sumbersari','Tanggul','Tempurejo','Umbulsari','Wuluhan','Pakusari','Rambipuji'];
const MI=['MIN 1 Jember','MIN 2 Jember','MIN 3 Jember','MIN 4 Jember','MIN 5 Jember','MIN 6 Jember'];
const MTS=['MTsN 1 Jember','MTsN 2 Jember','MTsN 3 Jember','MTsN 4 Jember','MTsN 5 Jember','MTsN 6 Jember','MTsN 7 Jember','MTsN 8 Jember','MTsN 9 Jember','MTsN 10 Jember','MTsN 11 Jember'];
const MAN=['MAN 1 Jember','MAN 2 Jember','MAN 3 Jember'];
const ALLM=[...MI,...MTS,...MAN];

// ═══════════ STATE ═══════════
// ══════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════
// MESIN OCR: TESSERACT.JS
// ✅ 100% GRATIS SELAMANYA — tanpa API key, tanpa CC, tanpa registrasi
// ✅ Berjalan di browser — data dokumen TIDAK keluar dari perangkat
// ✅ Mendukung bahasa Indonesia (Latin) + 100+ bahasa lainnya
// ✅ Tidak ada batas request per hari/bulan
// ══════════════════════════════════════════════════════

// Core OCR Engine menggunakan Tesseract.js
async function doOcrWithTesseract(file, onProgress) {
  const isImage = file.type.startsWith('image/');
  const isPdf   = file.type === 'application/pdf';

  if (!isImage && !isPdf) throw new Error('Format tidak didukung. Gunakan JPG, PNG, atau PDF.');

  let rawText = '';

  if (isImage) {
    // ── OCR langsung pada gambar ──
    const worker = await Tesseract.createWorker('ind+eng', 1, {
      logger: m => { if (onProgress && m.status === 'recognizing text') onProgress(Math.round(m.progress*100)); }
    });
    const { data: { text } } = await worker.recognize(file);
    await worker.terminate();
    rawText = text;

  } else if (isPdf) {
    // ── Render setiap halaman PDF ke canvas, lalu OCR ──
    if (!window.pdfjsLib) throw new Error('PDF.js belum siap. Coba lagi sesaat.');
    const arrayBuf = await file.arrayBuffer();
    const pdf      = await window.pdfjsLib.getDocument({ data: arrayBuf }).promise;
    const maxPages = Math.min(pdf.numPages, 4); // Maks 4 halaman

    for (let p = 1; p <= maxPages; p++) {
      if (onProgress) onProgress(Math.round((p-1)/maxPages*80));
      const page     = await pdf.getPage(p);
      const viewport = page.getViewport({ scale: 2.5 }); // Skala tinggi = akurasi lebih baik
      const canvas   = document.createElement('canvas');
      canvas.width   = viewport.width;
      canvas.height  = viewport.height;
      await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;

      const worker = await Tesseract.createWorker('ind+eng', 1, { logger: ()=>{} });
      const { data: { text } } = await worker.recognize(canvas);
      await worker.terminate();
      rawText += text + '\n';
    }
  }

  return rawText.trim();
}

// ══════════════════════════════════════════════════════
// PARSER TEKS OCR → DATA TERSTRUKTUR
// Mengekstrak field dari teks mentah hasil OCR
// ══════════════════════════════════════════════════════

function parseNikahText(raw) {
  const t = raw.replace(/\r\n/g,'\n');
  const g = (patterns) => {
    for (const p of patterns) {
      const m = t.match(p);
      if (m && m[1] && m[1].trim().length > 1) return m[1].trim();
    }
    return '';
  };
  // Tangkap tanggal dalam format DD-MM-YYYY atau DD/MM/YYYY atau teks bulan Indonesia
  const tglMatch = t.match(/(\d{1,2}[\s\-\/](Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember|\d{1,2})[\s\-\/]\d{4})/i)
    || t.match(/tanggal[^:]*:\s*([^\n]+)/i);
  const bulanMap = {januari:'01',februari:'02',maret:'03',april:'04',mei:'05',juni:'06',
    juli:'07',agustus:'08',september:'09',oktober:'10',november:'11',desember:'12'};
  let tgl = tglMatch ? tglMatch[1].trim() : '';
  // Konversi ke YYYY-MM-DD jika bisa
  const tglParse = tgl.match(/(\d{1,2})\s+(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember)\s+(\d{4})/i);
  if (tglParse) tgl = `${tglParse[3]}-${bulanMap[tglParse[2].toLowerCase()]}-${tglParse[1].padStart(2,'0')}`;

  return {
    noAkta:        g([/nomor akta[^:]*:\s*([^\n]+)/i, /no\.?\s*akta[^:]*:\s*([^\n]+)/i, /akta nikah[^:]*:\s*([^\n]+)/i, /(\d{4}[\.\-\/]\d{2,4}[\.\-\/]\d{2,6})/]),
    noPmrk:        g([/nomor pemeriksaan[^:]*:\s*([^\n]+)/i, /no\.?\s*pmrk[^:]*:\s*([^\n]+)/i, /pemeriksaan[^:]*:\s*([^\n]+)/i]),
    tglNikah:      tgl,
    namaSuami:     g([/nama\s+suami[^:]*:\s*([^\n]+)/i, /suami\s*:\s*([^\n]+)/i, /laki-laki\s*:\s*([^\n]+)/i]),
    nikSuami:      g([/nik\s+suami[^:]*:\s*([^\n]+)/i, /nik\s*\(suami\)[^:]*:\s*([^\n]+)/i]),
    ttlSuami:      g([/tempat.*lahir.*suami[^:]*:\s*([^\n]+)/i, /lahir\s+suami[^:]*:\s*([^\n]+)/i]),
    pekerjaanSuami:g([/pekerjaan\s+suami[^:]*:\s*([^\n]+)/i]),
    alamatSuami:   g([/alamat\s+suami[^:]*:\s*([^\n]+)/i]),
    namaIstri:     g([/nama\s+ist[re]i[^:]*:\s*([^\n]+)/i, /ist[re]i\s*:\s*([^\n]+)/i, /perempuan\s*:\s*([^\n]+)/i]),
    nikIstri:      g([/nik\s+ist[re]i[^:]*:\s*([^\n]+)/i, /nik\s*\(ist[re]i\)[^:]*:\s*([^\n]+)/i]),
    ttlIstri:      g([/tempat.*lahir.*ist[re]i[^:]*:\s*([^\n]+)/i, /lahir\s+ist[re]i[^:]*:\s*([^\n]+)/i]),
    pekerjaanIstri:g([/pekerjaan\s+ist[re]i[^:]*:\s*([^\n]+)/i]),
    alamatIstri:   g([/alamat\s+ist[re]i[^:]*:\s*([^\n]+)/i]),
    namaWali:      g([/nama\s+wali[^:]*:\s*([^\n]+)/i, /wali\s+nikah[^:]*:\s*([^\n]+)/i, /wali\s*:\s*([^\n]+)/i]),
    kua:           g([/kua\s+kecamatan[^:]*:\s*([^\n]+)/i, /kantor\s+urusan\s+agama[^:]*:\s*([^\n]+)/i, /kecamatan[^:]*:\s*([^\n]+)/i]),
    tempatAkad:    g([/tempat\s+akad[^:]*:\s*([^\n]+)/i, /tempat\s+nikah[^:]*:\s*([^\n]+)/i]),
  };
}

function parseIjazahText(raw) {
  const t = raw.replace(/\r\n/g,'\n');
  const g = (patterns) => {
    for (const p of patterns) {
      const m = t.match(p);
      if (m && m[1] && m[1].trim().length > 1) return m[1].trim();
    }
    return '';
  };
  // Deteksi jenjang
  let jenjang = '';
  if (/\bMA\b|MADRASAH ALIYAH/i.test(t)) jenjang = 'MA';
  else if (/\bMTs\b|MADRASAH TSANAWIYAH/i.test(t)) jenjang = 'MTs';
  else if (/\bMI\b|MADRASAH IBTIDAIYAH/i.test(t)) jenjang = 'MI';

  return {
    noIjazah:    g([/nomor[^:]*ijazah[^:]*:\s*([^\n]+)/i, /no\.?\s*ijazah[^:]*:\s*([^\n]+)/i, /nomor\s*:\s*([^\n]+)/i]),
    namaSiswa:   g([/nama\s+siswa[^:]*:\s*([^\n]+)/i, /nama\s+peserta[^:]*:\s*([^\n]+)/i, /nama\s*:\s*([^\n]+)/i, /yang\s+bernama[^:]*:\s*([^\n]+)/i]),
    ttl:         g([/tempat.*tanggal\s+lahir[^:]*:\s*([^\n]+)/i, /ttl[^:]*:\s*([^\n]+)/i, /lahir\s*:\s*([^\n]+)/i]),
    nisn:        g([/nisn[^:]*:\s*([^\n]+)/i, /nomor\s+induk\s+siswa\s+nasional[^:]*:\s*([^\n]+)/i]),
    madrasah:    g([/nama\s+madrasah[^:]*:\s*([^\n]+)/i, /madrasah[^:]*:\s*([^\n]+)/i, /sekolah[^:]*:\s*([^\n]+)/i, /(M[AI]N?\s+\d+[^\n]*)/i, /(MTsN?\s+\d+[^\n]*)/i]),

    jenjang:     jenjang,
    jurusan:     g([/jurusan[^:]*:\s*([^\n]+)/i, /program\s+studi[^:]*:\s*([^\n]+)/i, /kompetensi[^:]*:\s*([^\n]+)/i]),
    tahunLulus:  g([/tahun\s+pelajaran[^:]*:\s*([^\n]+)/i, /lulus\s+tahun[^:]*:\s*([^\n]+)/i, /(\d{4}\/\d{4})/]),
    nilaiRataRata: g([/nilai\s+rata[^:]*:\s*([^\n]+)/i, /rata.rata[^:]*:\s*([^\n]+)/i]),
  };
}

// ══════════════════════════════════════════════════════
// KONFIGURASI SIPADI — Cloudflare Workers + D1 + R2
// ── Auth & Database : Cloudflare Workers + D1 (SQLite)
// ── File Arsip      : Cloudflare R2 (zero egress fee)
// Ganti WORKER_URL setelah deploy: wrangler deploy
// ══════════════════════════════════════════════════════
const WORKER_URL = 'https://sipadi-worker.kemenagjember.workers.dev';
// Contoh: 'https://sipadi-worker.kemenag-jember.workers.dev'
// Setelah wrangler deploy, URL muncul di output terminal

// ── Helper API — semua request ke Worker ─────────────
let _token = localStorage.getItem('sipadi_token') || null;

async function api(method, path, body = null, isUpload = false) {
  const opts = {
    method,
    headers: { 'Authorization': _token ? `Bearer ${_token}` : '' }
  };
  if (body && !isUpload) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  } else if (body && isUpload) {
    opts.headers['Content-Type'] = body.type || 'application/octet-stream';
    opts.body = body;
  }
  const res  = await fetch(WORKER_URL + path, opts);
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

// ══════════════════════════════════════════════════════════════════
// ENKRIPSI NIK — AES-GCM via Web Crypto API (built-in browser)
// PENTING: Ganti NIK_SECRET dengan string acak panjang milik Anda
// Simpan string ini di tempat aman — jangan ubah setelah data masuk!
// Generate: buka Console browser → ketik: crypto.getRandomValues(new Uint8Array(32)).join(',')
// ══════════════════════════════════════════════════════════════════
const NIK_SECRET = 'KmngJmb2025!xR9#pQ7wL3nB8vZ1sY4k'; // wajib diisi

async function getNikKey(){
  const raw = new TextEncoder().encode(NIK_SECRET.padEnd(32,'0').substring(0,32));
  return crypto.subtle.importKey('raw', raw, {name:'AES-GCM'}, false, ['encrypt','decrypt']);
}

async function encryptNIK(nik){
  if(!nik || nik.trim()==='') return null;
  if(NIK_SECRET==='GANTI_DENGAN_32_BYTE_SECRET_ANDA') return nik;
  try{
    const key = await getNikKey();
    const iv  = crypto.getRandomValues(new Uint8Array(12));
    const enc = await crypto.subtle.encrypt({name:'AES-GCM',iv}, key, new TextEncoder().encode(nik));
    const combined = new Uint8Array(iv.byteLength + enc.byteLength);
    combined.set(iv, 0); combined.set(new Uint8Array(enc), iv.byteLength);
    return 'ENC:' + btoa(String.fromCharCode(...combined));
  }catch(e){ console.warn('Enkripsi NIK gagal:', e.message); return nik; }
}

async function decryptNIK(val){
  if(!val || !val.startsWith('ENC:')) return val||'';
  if(NIK_SECRET==='GANTI_DENGAN_32_BYTE_SECRET_ANDA') return val;
  try{
    const key  = await getNikKey();
    const data = Uint8Array.from(atob(val.slice(4)), c=>c.charCodeAt(0));
    const iv   = data.slice(0,12);
    const enc  = data.slice(12);
    const dec  = await crypto.subtle.decrypt({name:'AES-GCM',iv}, key, enc);
    return new TextDecoder().decode(dec);
  }catch(e){ console.warn('Dekripsi NIK gagal:', e.message); return '[terenkripsi]'; }
}

// Tidak ada Supabase client — semua melalui Worker API
const sb = null; // placeholder agar kode lama tidak error

// ═══════════ STATE ═══════════
const S={
  role:'kabupaten',
  satker:'Kemenag Kab. Jember',
  userId: null,
  userEmail: null,
  nikah:[],
  ijazah:[],
  ops:[],
  sk:{kua:[],mi:[],mts:[],man:[]}
};

// ═══════════ UTILITIES ═══════════
async function mkH(s){
  // SHA-256 kriptografis asli via Web Crypto API (built-in browser)
  try {
    const data   = new TextEncoder().encode(String(s));
    const buf    = await crypto.subtle.digest('SHA-256', data);
    const hex    = [...new Uint8Array(buf)].map(b=>b.toString(16).padStart(2,'0')).join('');
    return 'sha256:' + hex;
  } catch(e) {
    // Fallback jika crypto.subtle tidak tersedia (jarang terjadi)
    console.warn('crypto.subtle tidak tersedia:', e.message);
    return 'sha256:' + Math.random().toString(36).substring(2);
  }
}
function er(c){return`<tr><td colspan="${c}" style="text-align:center;padding:44px;color:#6B7280;font-family:'Inter',sans-serif;font-style:italic;font-size:14px">— Belum ada data —</td></tr>`;}
function fmt(d){return d?new Date(d).toLocaleDateString('id-ID',{day:'2-digit',month:'short',year:'numeric'}):'-';}

// ═══════════ INIT DATA ═══════════
function initData(){
  // Data Satuan Kerja — data riil struktural Kemenag Jember (bukan dummy)
  S.sk.kua  = KUA.map((k,i)=>({id:'k'+i, nama:'KUA Kecamatan '+k, kode:'KUA'+String(i+1).padStart(2,'0'), kepala:'', op:0, dok:0, status:'aktif'}));
  S.sk.mi   = MI.map((m,i) =>({id:'mi'+i,nama:m, kode:'MIN'+String(i+1).padStart(2,'0'), kepala:'', op:0, dok:0, status:'aktif'}));
  S.sk.mts  = MTS.map((m,i)=>({id:'mt'+i,nama:m, kode:'MTS'+String(i+1).padStart(2,'0'), kepala:'', op:0, dok:0, status:'aktif'}));
  S.sk.man  = MAN.map((m,i)=>({id:'mn'+i,nama:m, kode:'MAN'+String(i+1).padStart(2,'0'), kepala:'', op:0, dok:0, status:'aktif'}));
  // Nikah, Ijazah, Operator — kosong, diisi dari Workers API via loadAllData()
  // File attachment: di-upload ke Cloudflare R2 via uploadFile()
  S.nikah   = [];
  S.ijazah  = [];
  S.ops     = [];
  S.pegawai = [];
  S.riwayat = [];
}

// ══════════════════════════════════════════════════════
// AUTH — CLOUDFLARE WORKERS
// ══════════════════════════════════════════════════════

// Login Google OAuth — tidak tersedia di Workers, sembunyikan tombol
async function lG(){
  showLoginError('Login Google tidak tersedia. Gunakan Email + Password.');
}

// Login Email + Password
// ── Brute Force Protection ──
const BF = {
  MAX_ATTEMPTS : 5,
  LOCKOUT_MS   : 15 * 60 * 1000, // 15 menit
  key          : 'spd_bf',
  get(){try{return JSON.parse(localStorage.getItem(this.key)||'{}');}catch{return{};}},
  set(d){try{localStorage.setItem(this.key,JSON.stringify(d));}catch{}},
  isLocked(email){
    const d=this.get(); const e=d[email];
    if(!e) return false;
    if(e.count>=this.MAX_ATTEMPTS){
      const remaining=this.LOCKOUT_MS-(Date.now()-e.lastFail);
      if(remaining>0) return Math.ceil(remaining/1000);
      // Lockout habis — reset
      delete d[email]; this.set(d);
    }
    return false;
  },
  fail(email){
    const d=this.get();
    d[email]={count:(d[email]?.count||0)+1, lastFail:Date.now()};
    this.set(d);
    return this.MAX_ATTEMPTS - d[email].count;
  },
  reset(email){
    const d=this.get(); delete d[email]; this.set(d);
  }
};

function showLoginError(msg){
  let el=document.getElementById('loginErr');
  if(!el){
    el=document.createElement('div');
    el.id='loginErr';
    el.style.cssText='margin-top:12px;padding:10px 14px;background:rgba(192,57,43,.12);border:1px solid rgba(192,57,43,.3);border-radius:10px;font-size:12px;color:#8B2020;text-align:center;font-weight:600;line-height:1.5';
    document.querySelector('.lbtn-main').insertAdjacentElement('afterend',el);
  }
  el.textContent=msg;
  el.style.display='block';
}
function hideLoginError(){
  const el=document.getElementById('loginErr');
  if(el) el.style.display='none';
}

let lockoutTimer=null;
function startLockoutCountdown(email,seconds){
  const btn=document.querySelector('.lbtn-main');
  if(lockoutTimer) clearInterval(lockoutTimer);
  let s=seconds;
  const tick=()=>{
    const m=Math.floor(s/60), sec=s%60;
    setLoginLoading(true,`🔒 Terkunci ${m}:${String(sec).padStart(2,'0')}`);
    showLoginError(`Terlalu banyak percobaan gagal. Coba lagi dalam ${m} menit ${sec} detik.`);
    s--;
    if(s<0){
      clearInterval(lockoutTimer);
      setLoginLoading(false);
      hideLoginError();
      BF.reset(email);
    }
  };
  tick();
  lockoutTimer=setInterval(tick,1000);
}

async function doLogin(){
  const email = document.getElementById('em').value.trim().toLowerCase();
  const pass  = document.getElementById('pw')?.value || '';
  hideLoginError();
  if(!email){ showLoginError('Masukkan email terlebih dahulu.'); return; }

  // Cek brute force lockout
  const locked = BF.isLocked(email);
  if(locked){ startLockoutCountdown(email, locked); return; }

  await new Promise(r => setTimeout(r, 300)); // anti timing-attack delay
  setLoginLoading(true);

  try {
    const data = await api('POST', '/auth/login', { email, password: pass });
    BF.reset(email);
    _token = data.token;
    localStorage.setItem('sipadi_token', _token);
    const u = data.user;
    pL(u.nama, u.email, u.role, u.satker);
  } catch(e) {
    setLoginLoading(false);
    const remaining = BF.fail(email);
    if(remaining <= 0){
      startLockoutCountdown(email, Math.ceil(BF.LOCKOUT_MS / 1000));
    } else {
      showLoginError(`Login gagal: ${e.message}. Sisa percobaan: ${remaining}x.`);
    }
  }
}

function setLoginLoading(on, msg){
  const btn=document.querySelector('.lbtn-main');
  if(!btn) return;
  btn.disabled = on;
  btn.textContent = on ? (msg || '⟳ Memuat...') : 'MASUK KE SISTEM';
  btn.style.opacity = on ? '.75' : '1';
}


function pL(nm, em, role, satker){
  S.role    = role;
  S.satker  = satker || 'Kemenag Kab. Jember';
  S.userEmail = em;
  const rL={kabupaten:'Operator Kabupaten',kua:'Operator KUA Kecamatan',madrasah:'Operator Madrasah',kepegawaian:'Operator Kepegawaian',admin:'Administrator',viewer:'Viewer'};
  document.getElementById('sbAv').textContent = nm[0].toUpperCase();
  document.getElementById('sbNm').textContent = nm;
  document.getElementById('sbRo').textContent = rL[role]||role;
  document.getElementById('topChip').textContent = S.satker;
  // Akses kontrol per role
  const hideEl = (id) => { const e=document.getElementById(id); if(e) e.style.display='none'; };
  const showEl = (id) => { const e=document.getElementById(id); if(e) e.style.display=''; };

  // Sembunyikan semua dulu, lalu tampilkan sesuai role
  const allMenus = ['nNikah','nIjazah','nKepeg','sAdm','nSk','nOp','nVerif','nScan','nLap','nGuide'];
  allMenus.forEach(hideEl);

  if (role === 'kua') {
    // Operator KUA: hanya Register Nikah + Scan + Verifikasi
    showEl('nNikah');
    showEl('nVerif');
    showEl('nScan');

  } else if (role === 'madrasah') {
    // Operator Madrasah: hanya Arsip Ijazah + Scan + Verifikasi
    showEl('nIjazah');
    showEl('nVerif');
    showEl('nScan');

  } else if (role === 'kepegawaian') {
    // Operator Kepegawaian: hanya modul Kepegawaian + Verifikasi
    showEl('nKepeg');
    showEl('nVerif');

  } else if (role === 'kabupaten' || role === 'admin') {
    // Admin Kabupaten: semua menu tampil
    allMenus.forEach(showEl);
  }

  // Tombol "Tambah Pegawai" hanya untuk kepegawaian & kabupaten
  const btnTambah = document.getElementById('btnTambahPegawai');
  if (btnTambah) btnTambah.style.display =
    ['kabupaten','kepegawaian','admin'].includes(role) ? '' : 'none';
  // Tampilkan dropdown KUA & Madrasah hanya untuk admin kabupaten
  const isAdmin = role==='kabupaten'||role==='admin';
  const nkw = document.getElementById('nKuaWrap');
  const imw = document.getElementById('iMadWrap');
  if(nkw) nkw.style.display = isAdmin ? '' : 'none';
  if(imw) imw.style.display = isAdmin ? '' : 'none';
  initData();
  popSelects();
  document.getElementById('lp').style.display='none';
  document.getElementById('app').style.display='block';
  // Render awal: struktur satuan kerja langsung, tabel data tunggu Workers API
  updD(); renderSk();
  if(sb) showLoadingTables(); else { renderN(); renderI(); renderO(); renderLap(); }

  // Arahkan ke halaman default sesuai role
  if (role === 'kua') {
    nav('n', document.getElementById('nNikah'));
  } else if (role === 'madrasah') {
    nav('i', document.getElementById('nIjazah'));
  } else if (role === 'kepegawaian') {
    nav('kp', document.getElementById('nKepeg'));
  } else {
    nav('d', document.getElementById('nDash'));
  }

  // Muat data dari Workers API (async)
  loadAllData();
}

async function doLogout(){
  try { await api('POST', '/auth/logout'); } catch(e) {}
  _token = null;
  localStorage.removeItem('sipadi_token');
  S.userId=null; S.userEmail=null; S.role=null; S.satker=null;
  S.nikah=[]; S.ijazah=[]; S.pegawai=[]; S.riwayat=[]; S.ops=[];
  ['nbN','nbI','nbD','nbKp'].forEach(id=>{const e=document.getElementById(id);if(e)e.textContent='0';});
  document.getElementById('lp').style.display='flex';
  document.getElementById('app').style.display='none';
}

// ══════════════════════════════════════════════════════
// LOAD DATA DARI CLOUDFLARE WORKERS + D1
// ══════════════════════════════════════════════════════

async function loadOps(){
  try {
    const data = await api('GET', '/operators');
    S.ops = data.map(r=>({
      id:r.id, nama:r.nama, email:r.email,
      role:r.role, satker:r.satker||'',
      hp:r.hp||'', status:r.status||'aktif'
    }));
    updD(); renderO();
  } catch(e) { console.warn('loadOps error:', e.message); }
}

async function loadAllData(){
  S.nikah=[]; S.ijazah=[]; S.ops=[]; S.pegawai=[]; S.riwayat=[];
  showLoadingTables();
  const loads = [];
  if(['kabupaten','admin','kua'].includes(S.role))         loads.push(loadNikah());
  if(['kabupaten','admin','madrasah'].includes(S.role))    loads.push(loadIjazah());
  if(['kabupaten','admin','kepegawaian'].includes(S.role)) loads.push(loadPegawai());
  if(['kabupaten','admin'].includes(S.role))               loads.push(loadOps());
  await Promise.all(loads);
  updD(); renderN(); renderI(); renderSk(); renderO(); renderLap();
}

function showLoadingTables(){
  const loadHtml = `<tr><td colspan="8" style="text-align:center;padding:32px;color:#6B7280">
    <span style="animation:spin 1s linear infinite;display:inline-block;font-size:18px;margin-right:8px">⟳</span>
    Memuat data dari server...
  </td></tr>`;
  ['dN','dI','tSk','tO'].forEach(id=>{
    const el = document.getElementById(id);
    if(el) el.innerHTML = loadHtml;
  });
}

async function loadNikah(){
  try {
    const data = await api('GET', '/nikah?limit=500');
    S.nikah = await Promise.all(data.map(async r=>({
      id:r.id, noAkta:r.no_akta, noPmrk:r.no_pmrk,
      tgl:r.tgl, suami:r.suami, suamiNik:await decryptNIK(r.suami_nik),
      suamiTtl:r.suami_ttl, suamiPek:r.suami_pek, suamiAlamat:r.suami_alamat||'',
      istri:r.istri, istriNik:await decryptNIK(r.istri_nik),
      istriTtl:r.istri_ttl, istriPek:r.istri_pek, istriAlamat:r.istri_alamat||'',
      kua:r.kua, tempat:r.tempat, wali:r.wali,
      status:r.status, hash:r.hash, fileUrl:r.file_url
    })));
    updD(); renderN(); renderLap();
  } catch(e) { console.warn('loadNikah error:', e.message); }
}

async function loadIjazah(){
  try {
    const data = await api('GET', '/ijazah?limit=500');
    S.ijazah = data.map(r=>({
      id:r.id, no:r.no, thn:r.thn,
      nama:r.nama, ttl:r.ttl, madrasah:r.madrasah,
      satker:r.madrasah, jenjang:r.jenjang, nisn:r.nisn,
      jurusan:r.jurusan, nilai:r.nilai,
      status:r.status, hash:r.hash, fileUrl:r.file_url
    }));
    updD(); renderI(); renderLap();
  } catch(e) { console.warn('loadIjazah error:', e.message); }
}

// ══════════════════════════════════════════════════════
// UPLOAD FILE KE CLOUDFLARE R2 via Workers
// File dikirim ke Worker → Worker pipe ke R2 bucket
// ══════════════════════════════════════════════════════

async function uploadFile(file, folder){
  if(!file) return null;
  try {
    const maxSize = 50 * 1024 * 1024; // 50MB
    if(file.size > maxSize){
      const ok = window.confirm(
        `File terlalu besar (${(file.size/1024/1024).toFixed(1)}MB).\n\nMaksimal 50MB. Simpan data tanpa file?`
      );
      if(!ok) throw new Error('Upload dibatalkan user');
      return null;
    }
    const ext    = file.name.split('.').pop().toLowerCase().replace(/[^a-z0-9]/g,'');
    const folder2 = folder.replace(/[^a-zA-Z0-9/_-]/g,'_');
    const key    = `${folder2}/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
    // Upload via Worker (Worker yang pegang credentials R2)
    const res  = await fetch(`${WORKER_URL}/upload/${encodeURIComponent(key)}`, {
      method:  'PUT',
      headers: {
        'Authorization': `Bearer ${_token}`,
        'Content-Type':  file.type || 'application/octet-stream'
      },
      body: file
    });
    if(!res.ok){ console.warn('Upload Worker error:', res.status); return null; }
    const data = await res.json();
    return data.url || null;
  } catch(e) {
    console.warn('Upload error (lanjut tanpa file):', e.message);
    return null;
  }
}

// ══════════════════════════════════════════════════════
// CEK SESSION SAAT LOAD
// ══════════════════════════════════════════════════════

async function checkSession(){
  const saved = localStorage.getItem('sipadi_token');
  if(!saved) return;
  _token = saved;
  try {
    const data = await api('GET', '/auth/me');
    const u = data.user;
    pL(u.nama, u.email, u.role, u.satker);
  } catch(e) {
    _token = null;
    localStorage.removeItem('sipadi_token');
  }
}

// ═══════════ POPULATE SELECTS ═══════════
function popSelects(){
  // KUA filters
  // Populate kpSk
const kpSkEl=document.getElementById('kpSk');if(kpSkEl){kpSkEl.innerHTML='<option value="">- Pilih Satker -</option>'+[...S.sk.kua,...S.sk.mi,...S.sk.mts,...S.sk.man].map(s=>`<option value="${s.nama}">${s.nama}</option>`).join('');}
  ['fKua','nKua'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML=id==='fKua'?'<option value="">Semua KUA</option>':'<option value="">-- Pilih KUA --</option>';
    KUA.forEach(k=>el.innerHTML+=`<option value="${k}">KUA Kecamatan ${k}</option>`);
  });
  // Madrasah filters
  ['fMad','iMad'].forEach(id=>{
    const el=document.getElementById(id);if(!el)return;
    el.innerHTML=id==='fMad'?'<option value="">Semua Madrasah</option>':'<option value="">-- Pilih Madrasah --</option>';
    [['Ibtidaiyah (MI)',MI],['Tsanawiyah (MTs)',MTS],['Aliyah (MA)',MAN]].forEach(([lbl,arr])=>{
      el.innerHTML+=`<optgroup label="${lbl}">`;arr.forEach(m=>el.innerHTML+=`<option value="${m}">${m}</option>`);el.innerHTML+=`</optgroup>`;
    });
  });
  // Operator satker
  const os=document.getElementById('oSk');if(os){os.innerHTML='<option value="">-- Pilih --</option>';KUA.forEach(k=>os.innerHTML+=`<option>KUA Kecamatan ${k}</option>`);ALLM.forEach(m=>os.innerHTML+=`<option>${m}</option>`);}
}

// ═══════════ DASHBOARD ═══════════
function updD(){
  const act=S.ops.filter(o=>o.status==='aktif').length;
  document.getElementById('stN').textContent=S.nikah.length;
  document.getElementById('stI').textContent=S.ijazah.length;
  document.getElementById('stO').textContent=act;
  document.getElementById('nbD').textContent=S.nikah.length+S.ijazah.length+(S.pegawai?.length||0);document.getElementById('nbKp').textContent=(S.pegawai?.length||0);
  document.getElementById('nbN').textContent=S.nikah.length;
  document.getElementById('nbI').textContent=S.ijazah.length;
  document.getElementById('dN').innerHTML=S.nikah.slice(0,5).map(n=>`<tr><td class="td-mono">${n.noAkta}</td><td class="td-bold">${n.suami}</td><td>${n.istri}</td><td><span class="badge badge-jade">${n.kua}</span></td></tr>`).join('')||er(4);
  document.getElementById('dI').innerHTML=S.ijazah.slice(0,5).map(i=>`<tr><td class="td-mono">${i.no}</td><td class="td-bold">${i.nama}</td><td>${i.madrasah}</td><td>${i.thn}</td></tr>`).join('')||er(4);
}

// ═══════════ NIKAH ═══════════
let nq='';
function fN(v){if(v!==undefined)nq=v.toLowerCase();renderN();}
function renderN(){
  const kf=document.getElementById('fKua')?.value||'';
  let d=S.nikah.filter(n=>(!nq||n.noAkta.includes(nq)||n.suami.toLowerCase().includes(nq)||n.istri.toLowerCase().includes(nq))&&(!kf||n.kua===kf)&&(S.role==='kabupaten'||n.kua===S.satker.replace('KUA Kecamatan ','')));
  document.getElementById('nCt').textContent=d.length+' data';
  document.getElementById('tN').innerHTML=d.length?d.map((n,i)=>`<tr><td style="color:#6B7280">${i+1}</td><td class="td-mono">${n.noAkta}</td><td>${fmt(n.tgl)}</td><td class="td-bold">${n.suami}</td><td>${n.istri}</td><td><span class="badge badge-jade">${n.kua}</span></td><td><span class="badge ${n.status==='terverifikasi'?'badge-jade':'badge-gold'}">${n.status==='terverifikasi'?'✓ Valid':'⏳ Pending'}</span></td><td><div style="display:flex;gap:5px"><button class="btn btn-glass btn-sm" onclick="pvN('${n.id}')">👁</button><button class="btn btn-jade btn-sm" onclick="edN('${n.id}')">✏</button><button class="btn btn-red btn-sm" onclick="dlN('${n.id}')">✕</button></div></td></tr>`).join(''):er(8);
}
async function saveN(){
  const id     = document.getElementById('nId').value;
  const na     = document.getElementById('nNA').value.trim();
  const sm     = document.getElementById('nSm').value.trim();
  const st     = document.getElementById('nSt').value.trim();
  const alamat = document.getElementById('nSmAlamat').value.trim();
  const tgl    = document.getElementById('nTgl').value;
  const wali   = document.getElementById('nWali').value.trim();

  // Validasi 5 field wajib operator KUA
  if(!na)  { alert('Nomor akta nikah wajib diisi'); return; }
  if(!sm)  { alert('Nama pengantin laki-laki wajib diisi'); return; }
  if(!st)  { alert('Nama pengantin perempuan wajib diisi'); return; }
  if(!alamat){ alert('Alamat wajib diisi'); return; }
  if(!tgl) { alert('Tanggal nikah wajib diisi'); return; }
  if(!wali){ alert('Nama wali nikah wajib diisi'); return; }

  // Nonaktifkan tombol simpan saat proses
  const btnSimpan = document.getElementById('btnSimpanNikah');
  if(btnSimpan){ btnSimpan.disabled = true; btnSimpan.textContent = '⏳ Menyimpan...'; }

  try {
    // KUA: ambil dari satker operator, atau dari dropdown jika admin
    const kua = (S.role==='kabupaten'||S.role==='admin')
      ? document.getElementById('nKua').value
      : S.satker.replace('KUA Kecamatan ','');

    // Nomor akta: dari OCR atau generate otomatis
    const hash = await mkH(sm + st + tgl);

    const fileInput = document.getElementById('nFile');
    const fileObj = fileInput?.files?.[0] || null;

    const row = {
      no_akta:      na,
      no_pmrk:      document.getElementById('nNP').value||null,
      tgl,
      suami:        sm,
      suami_nik:    await encryptNIK(document.getElementById('nSmNik').value)||null,
      suami_ttl:    document.getElementById('nSmTtl').value||null,
      suami_pek:    document.getElementById('nSmPek').value||null,
      suami_alamat: alamat,
      istri:        st,
      istri_nik:    await encryptNIK(document.getElementById('nStNik').value)||null,
      istri_ttl:    document.getElementById('nStTtl').value||null,
      istri_pek:    document.getElementById('nStPek').value||null,
      istri_alamat: document.getElementById('nStAlamat').value||alamat,
      kua,
      tempat:       document.getElementById('nTmp').value||('Balai Nikah KUA Kecamatan '+kua),
      wali,
      status:       'terverifikasi',
      hash,
      file_url:     fileUrl,
      created_by:   S.userId||null
    };

    // Upload file dulu jika ada
    let fileUrl = null;
    if(fileObj){
      fileUrl = await uploadFile(fileObj, 'nikah/'+kua.replace(/\s+/g,'_'));
    }
    if(fileUrl) row.file_url = fileUrl;

    try {
      let savedId = id;
      if(id){
        await api('PUT', `/nikah/${id}`, row);
      } else {
        const res = await api('POST', '/nikah', row);
        savedId = res.id;
      }
      await loadNikah();
      closeM('mNikah');
      showToast('✅ Register Nikah berhasil disimpan!', 'success');
    } catch(e) {
      alert('Gagal simpan: ' + e.message);
      return;
    }
  } catch(e) {
    alert('Error saat menyimpan: ' + e.message);
    console.error('saveN error:', e);
  } finally {
    if(btnSimpan){ btnSimpan.disabled = false; btnSimpan.textContent = '💾 Simpan Data'; }
  }
}
function edN(id){
  const n=S.nikah.find(x=>x.id===id); if(!n)return;
  const set=(k,v)=>{const e=document.getElementById(k);if(e)e.value=v||'';};
  // 5 field utama
  set('nSm',      n.suami);
  set('nSt',      n.istri);
  set('nSmAlamat',n.suamiAlamat||n.istriAlamat||'');
  set('nTgl',     n.tgl);
  set('nWali',    n.wali);
  // field hidden (dari OCR)
  set('nId',   n.id);
  set('nNA',   n.noAkta);
  set('nNP',   n.noPmrk);
  set('nSmTtl',n.suamiTtl); set('nSmNik',n.suamiNik); set('nSmPek',n.suamiPek);
  set('nStTtl',n.istriTtl); set('nStNik',n.istriNik); set('nStPek',n.istriPek);
  set('nTmp',  n.tempat);
  if(S.role==='kabupaten'||S.role==='admin') set('nKua', n.kua);
  openM('mNikah');
  switchNikahTab('manual');
}
async function dlN(id){
  if(!confirm('Hapus data register nikah ini?')) return;
  try {
    await api('DELETE', `/nikah/${id}`);
    await loadNikah();
  } catch(e) { alert('Gagal hapus: '+e.message); }
}
function pvN(id){
  const n=S.nikah.find(x=>x.id===id);if(!n)return;
  const url=location.origin+location.pathname+'#verify/'+n.hash;
  document.getElementById('pvT').textContent='📋 Akta Nikah — '+n.noAkta;

  if(n.fileUrl){
    // Tampilkan file asli dengan overlay QR + watermark + tombol download watermark
    document.getElementById('pvB').innerHTML=`
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 14px;background:rgba(34,199,122,.08);border:1px solid rgba(34,199,122,.2);border-radius:8px">
          <div style="font-size:12px;color:#4de3a0">📄 <strong>File Scan Asli</strong> · ${n.noAkta}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a href="${n.fileUrl}" target="_blank" style="padding:5px 12px;background:rgba(34,199,122,.12);color:#4de3a0;border:1px solid rgba(34,199,122,.25);border-radius:6px;font-size:11px;font-weight:700;text-decoration:none">🔗 File Asli</a>
            <button onclick="downloadWatermarked('${id}')" style="padding:5px 14px;background:linear-gradient(135deg,#0f5c3a,#16784d);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">⬇ Download + Watermark</button>
          </div>
        </div>
        <div style="position:relative;border-radius:8px;overflow:hidden">
          <iframe src="${n.fileUrl}" style="width:100%;height:520px;border:none;border-radius:8px;background:#fff" id="pdfFrame"></iframe>
          <!-- Overlay watermark visual -->
          <div style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10">
            <!-- Watermark teks diagonal -->
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:52px;font-weight:900;color:rgba(13,92,58,.12);white-space:nowrap;font-family:'Instrument Sans',sans-serif;letter-spacing:4px;user-select:none">SIPADI TERVERIFIKASI</div>
            <!-- QR di pojok kanan atas -->
            <div style="position:absolute;top:10px;right:10px;background:rgba(255,255,255,.92);padding:6px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2)">
              <div id="pvQR" style="width:64px;height:64px"></div>
              <div style="font-size:7px;text-align:center;color:#0d5c3a;font-weight:700;margin-top:3px">SCAN VERIFIKASI</div>
            </div>
            <!-- Badge status -->
            <div style="position:absolute;bottom:10px;right:10px;background:rgba(13,92,58,.9);color:#fff;padding:5px 12px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:1px">✓ TERVERIFIKASI · SIPADI</div>
          </div>
        </div>
      </div>`;
    setTimeout(()=>{
      const el=document.getElementById('pvQR');
      if(el&&window.QRCode){
        el.innerHTML='';
        new QRCode(el,{text:url,width:64,height:64,colorDark:'#0d5c3a',colorLight:'#ffffff'});
      }
    },250);
  } else {
    // Tidak ada file asli — tampilkan generated akta
    document.getElementById('pvB').innerHTML=`<div class="doc-preview" id="pArea">
    <div class="doc-header">
      <div style="width:65px;height:65px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
  <svg viewBox="0 0 65 65" xmlns="http://www.w3.org/2000/svg" width="65" height="65">
    <defs><linearGradient id="lgd" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a6b3c"/><stop offset="100%" stop-color="#0a3d20"/></linearGradient></defs>
    <circle cx="32" cy="32" r="30" fill="url(#lgd)" stroke="#c8922a" stroke-width="1.5"/>
    <text x="32" y="44" text-anchor="middle" font-family="Playfair Display,Georgia,serif" font-size="30" font-weight="900" fill="#f5c842">A</text>
  </svg>
</div>
      <div class="doc-header-text"><div class="dept">Republik Indonesia — Kementerian Agama</div><h1>AKTA NIKAH</h1><div class="subtitle">KUA Kecamatan ${n.kua} — Kabupaten Jember, Jawa Timur</div></div>
      <div class="doc-verified-stamp" style="position:absolute;top:16px;right:16px;width:80px;height:80px;border-radius:50%;border:3px solid #0d5c3a;display:flex;align-items:center;justify-content:center;text-align:center;font-size:7.5px;font-weight:700;color:#0d5c3a;letter-spacing:1px;text-transform:uppercase;transform:rotate(-15deg);opacity:.65;font-family:'Instrument Sans',sans-serif;line-height:1.3;padding:8px">DOKUMEN<br>TERVERIFIKASI<br>SIPADI</div>
        <div class="doc-qr"><div id="dqr"></div><p>Scan untuk verifikasi</p><p>${n.noAkta}</p></div>
    </div>
    <div class="doc-row"><span class="k">Nomor Akta</span><span class="v">${n.noAkta}</span></div>
    <div class="doc-row"><span class="k">No. Pemeriksaan</span><span class="v">${n.noPmrk||'-'}</span></div>
    <div class="doc-row"><span class="k">Tanggal Nikah</span><span class="v">${fmt(n.tgl)}</span></div>
    <div class="doc-row"><span class="k">KUA Kecamatan</span><span class="v">${n.kua}, Kab. Jember</span></div>
    <div class="doc-section">I. Data Suami</div>
    <div class="doc-row"><span class="k">Nama Lengkap</span><span class="v">${n.suami}</span></div>
    <div class="doc-row"><span class="k">Tempat, Tgl Lahir</span><span class="v">${n.suamiTtl||'-'}</span></div>
    <div class="doc-row"><span class="k">NIK</span><span class="v" style="font-family:'DM Mono',monospace">${n.suamiNik||'-'}</span></div>
    <div class="doc-row"><span class="k">Pekerjaan</span><span class="v">${n.suamiPek||'-'}</span></div>
    <div class="doc-section">II. Data Istri</div>
    <div class="doc-row"><span class="k">Nama Lengkap</span><span class="v">${n.istri}</span></div>
    <div class="doc-row"><span class="k">Tempat, Tgl Lahir</span><span class="v">${n.istriTtl||'-'}</span></div>
    <div class="doc-row"><span class="k">NIK</span><span class="v" style="font-family:'DM Mono',monospace">${n.istriNik||'-'}</span></div>
    <div class="doc-row"><span class="k">Pekerjaan</span><span class="v">${n.istriPek||'-'}</span></div>
    <div class="doc-section">Lainnya</div>
    <div class="doc-row"><span class="k">Wali Nikah</span><span class="v">${n.wali||'-'}</span></div>
    <div class="doc-row"><span class="k">Tempat Akad</span><span class="v">${n.tempat||'-'}</span></div>
    <div class="doc-hash">🔒 <strong>SHA-256:</strong> <span>${n.hash}</span> <span style="background:#dcfce7;color:#15803d;padding:2px 10px;border-radius:6px;font-size:10px;font-weight:700">✓ Terautentikasi</span></div>
  </div>`;
    setTimeout(()=>{const el=document.getElementById('dqr');if(el&&window.QRCode){el.innerHTML='';new QRCode(el,{text:url,width:70,height:70,colorDark:'#0d5c3a',colorLight:'#ffffff'});}},250);
  }
  openM('mPrev');
}

async function downloadWatermarked(id){
  const n=S.nikah.find(x=>x.id===id);if(!n||!n.fileUrl)return;
  const btn=event.target;
  btn.textContent='⏳ Memproses...';btn.disabled=true;
  try {
    const verifyUrl=location.origin+location.pathname+'#verify/'+n.hash;
    // Fetch PDF asli
    const pdfBytes = await fetch(n.fileUrl).then(r=>r.arrayBuffer());
    const { PDFDocument, rgb, degrees } = PDFLib;
    const pdfDoc = await PDFDocument.load(pdfBytes, {ignoreEncryption:true});
    const pages = pdfDoc.getPages();

    // Generate QR sebagai PNG data URL
    const qrDiv = document.createElement('div');
    qrDiv.style.cssText='position:fixed;left:-9999px;top:0;width:120px;height:120px';
    document.body.appendChild(qrDiv);
    await new Promise(res=>{
      new QRCode(qrDiv,{text:verifyUrl,width:120,height:120,colorDark:'#0d5c3a',colorLight:'#ffffff'});
      setTimeout(res,600);
    });
    const qrCanvas = qrDiv.querySelector('canvas');
    const qrDataUrl = qrCanvas ? qrCanvas.toDataURL('image/png') : null;
    document.body.removeChild(qrDiv);

    // Embed QR image
    let qrImage = null;
    if(qrDataUrl){
      const qrData = await fetch(qrDataUrl).then(r=>r.arrayBuffer());
      qrImage = await pdfDoc.embedPng(qrData);
    }

    // Terapkan ke setiap halaman
    for(const page of pages){
      const {width,height} = page.getSize();
      const font = await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

      // Watermark teks diagonal di tengah setiap halaman
      page.drawText('SIPADI TERVERIFIKASI', {
        x: width/2 - 180,
        y: height/2,
        size: 42,
        font,
        color: rgb(0.05, 0.36, 0.15),
        opacity: 0.08,
        rotate: degrees(35),
      });

      // QR di pojok kanan atas (hanya halaman pertama)
      if(qrImage && page === pages[0]){
        const qrSize = 90;
        page.drawImage(qrImage,{
          x: width - qrSize - 12,
          y: height - qrSize - 12,
          width: qrSize,
          height: qrSize,
          opacity: 0.92,
        });
        // Label di bawah QR
        page.drawText('Scan Verifikasi', {
          x: width - qrSize - 12,
          y: height - qrSize - 24,
          size: 7,
          font,
          color: rgb(0.05, 0.36, 0.15),
          opacity: 0.8,
        });
        page.drawText(n.noAkta, {
          x: width - qrSize - 12,
          y: height - qrSize - 33,
          size: 6,
          font,
          color: rgb(0.05, 0.36, 0.15),
          opacity: 0.7,
        });
      }

      // Footer strip bawah setiap halaman
      page.drawRectangle({
        x: 0, y: 0,
        width: width, height: 18,
        color: rgb(0.05, 0.36, 0.15),
        opacity: 0.85,
      });
      page.drawText(`SIPADI · Kemenag Kab. Jember · ${n.noAkta} · Terverifikasi ${new Date().toLocaleDateString('id-ID')}`, {
        x: 10, y: 5,
        size: 7,
        font,
        color: rgb(1,1,1),
        opacity: 0.95,
      });
    }

    // Download
    const outBytes = await pdfDoc.save();
    const blob = new Blob([outBytes],{type:'application/pdf'});
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `SIPADI_${n.noAkta}_terverifikasi.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    btn.textContent='✅ Selesai!';
    setTimeout(()=>{btn.textContent='⬇ Download + Watermark';btn.disabled=false;},2000);
  } catch(e){
    console.error(e);
    alert('Gagal proses watermark: '+e.message);
    btn.textContent='⬇ Download + Watermark';btn.disabled=false;
  }
}

// ═══════════ IJAZAH ═══════════
let iq='';
function fI(v){if(v!==undefined)iq=v.toLowerCase();renderI();}
function renderI(){
  const mf=document.getElementById('fMad')?.value||'',jf=document.getElementById('fJenj')?.value||'';
  let d=S.ijazah.filter(i=>(!iq||i.no.toLowerCase().includes(iq)||i.nama.toLowerCase().includes(iq)||String(i.nisn||'').includes(iq))&&(!mf||i.madrasah===mf)&&(!jf||i.jenjang===jf)&&(S.role==='kabupaten'||i.madrasah===S.satker));
  document.getElementById('iCt').textContent=d.length+' data';
  document.getElementById('tI').innerHTML=d.length?d.map((n,i)=>`<tr><td style="color:#6B7280">${i+1}</td><td class="td-mono">${n.no}</td><td class="td-bold">${n.nama}</td><td>${n.madrasah}</td><td><span class="badge ${n.jenjang==='MA'?'badge-blue':n.jenjang==='MTs'?'badge-gold':'badge-jade'}">${n.jenjang}</span></td><td>${n.thn}</td><td><span class="badge ${n.status==='terverifikasi'?'badge-jade':'badge-gold'}">${n.status==='terverifikasi'?'✓ Valid':'⏳'}</span></td><td><div style="display:flex;gap:5px"><button class="btn btn-glass btn-sm" onclick="pvI('${n.id}')">👁</button><button class="btn btn-jade btn-sm" onclick="edI('${n.id}')">✏</button><button class="btn btn-red btn-sm" onclick="dlI('${n.id}')">✕</button></div></td></tr>`).join(''):er(8);
}
async function saveI(){
  const id     = document.getElementById('iId').value;
  const no     = document.getElementById('iNo').value.trim();
  const seri   = document.getElementById('iSeri').value.trim();
  const nm     = document.getElementById('iNm').value.trim();
  const ttl    = document.getElementById('iTtl').value.trim();
  const kepala = document.getElementById('iKepala').value.trim();

  if(!no)    { alert('Nomor ijazah wajib diisi'); return; }
  if(!seri)  { alert('Nomor seri wajib diisi'); return; }
  if(!nm)    { alert('Nama siswa wajib diisi'); return; }
  if(!ttl)   { alert('Tempat, tanggal lahir wajib diisi'); return; }
  if(!kepala){ alert('Nama kepala madrasah wajib diisi'); return; }

  const btnSimpan = document.getElementById('btnSimpanIjazah');
  if(btnSimpan){ btnSimpan.disabled=true; btnSimpan.textContent='⏳ Menyimpan...'; btnSimpan.style.opacity='0.7'; }

  try {
    const mad = (S.role==='kabupaten'||S.role==='admin')
      ? document.getElementById('iMad').value
      : S.satker;

    const thn = parseInt(document.getElementById('iThn').value) || new Date().getFullYear();
    const jenjang = mad.startsWith('MIN')||mad.startsWith('MI')?'MI'
                  : mad.startsWith('MTs')?'MTs':'MA';
    const hash = await mkH(no + seri + nm);

    const fileInput = document.getElementById('iFile');
    const fileObj = fileInput?.files?.[0] || null;

    // Simpan data dulu TANPA file, lalu upload file di background
    const row = {
      no, no_seri: seri, thn,
      nama: nm, ttl,
      kepala_madrasah: kepala,
      madrasah: mad, jenjang,
      nisn:    document.getElementById('iNisn').value||null,
      jurusan: document.getElementById('iJur').value||null,
      nilai:   parseFloat(document.getElementById('iNilai').value)||null,
      status:  'terverifikasi',
      hash, file_url: null,
      created_by: S.userId||null
    };

    // Upload file dulu jika ada
    let fileUrl = null;
    if(fileObj){
      fileUrl = await uploadFile(fileObj, 'ijazah/'+mad.replace(/\s+/g,'_'));
    }
    if(fileUrl) row.file_url = fileUrl;

    try {
      if(id){
        await api('PUT', `/ijazah/${id}`, row);
      } else {
        await api('POST', '/ijazah', row);
      }
      await loadIjazah();
      closeM('mIjazah');
      showToast('✅ Ijazah berhasil disimpan!', 'success');
    } catch(e) {
      alert('Gagal simpan: ' + e.message);
      return;
    }
  } catch(e) {
    alert('Error saat menyimpan: '+e.message);
    console.error('saveI error:',e);
  } finally {
    const btn2 = document.getElementById('btnSimpanIjazah');
    if(btn2){ btn2.disabled=false; btn2.textContent='💾 Simpan Ijazah'; }
  }
}

function edI(id){
  const n=S.ijazah.find(x=>x.id===id); if(!n)return;
  const set=(k,v)=>{const e=document.getElementById(k);if(e)e.value=v||'';};
  // 5 field utama
  set('iNo',    n.no);
  set('iSeri',  n.noSeri||n.no_seri||'');
  set('iNm',    n.nama);
  set('iTtl',   n.ttl);
  set('iKepala',n.kepala||n.kepala_madrasah||'');
  // field hidden
  set('iId',    n.id);
  set('iThn',   n.thn);
  set('iNisn',  n.nisn);
  set('iJur',   n.jurusan);
  set('iNilai', n.nilai);
  if(S.role==='kabupaten'||S.role==='admin') set('iMad', n.madrasah);
  openM('mIjazah');
  switchIjazahTab('manual');
}
async function dlI(id){
  if(!confirm('Hapus data ijazah?')) return;
  try {
    await api('DELETE', `/ijazah/${id}`);
    await loadIjazah();
  } catch(e) { alert('Gagal hapus: '+e.message); }
}
function pvI(id){
  const n=S.ijazah.find(x=>x.id===id);if(!n)return;
  const url=location.origin+location.pathname+'#verify/'+n.hash;
  const jL=n.jenjang==='MI'?'MADRASAH IBTIDAIYAH':n.jenjang==='MTs'?'MADRASAH TSANAWIYAH':'MADRASAH ALIYAH';
  document.getElementById('pvT').textContent='🎓 Ijazah — '+n.nama;

  if(n.fileUrl){
    // Tampilkan file scan asli dengan overlay QR + watermark
    document.getElementById('pvB').innerHTML=`
      <div style="display:flex;flex-direction:column;gap:10px">
        <div style="display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:8px;padding:10px 14px;background:rgba(240,200,74,.07);border:1px solid rgba(240,200,74,.2);border-radius:8px">
          <div style="font-size:12px;color:#f0c84a">📄 <strong>File Scan Asli</strong> · ${n.nama} · ${n.no}</div>
          <div style="display:flex;gap:8px;flex-wrap:wrap">
            <a href="${n.fileUrl}" target="_blank" style="padding:5px 12px;background:rgba(240,200,74,.1);color:#f0c84a;border:1px solid rgba(240,200,74,.25);border-radius:6px;font-size:11px;font-weight:700;text-decoration:none">🔗 File Asli</a>
            <button onclick="downloadWatermarkedI('${id}')" style="padding:5px 14px;background:linear-gradient(135deg,#0f5c3a,#16784d);color:#fff;border:none;border-radius:6px;font-size:11px;font-weight:700;cursor:pointer">⬇ Download + Watermark</button>
          </div>
        </div>
        <div style="position:relative;border-radius:8px;overflow:hidden">
          <iframe src="${n.fileUrl}" style="width:100%;height:520px;border:none;border-radius:8px;background:#fff"></iframe>
          <div style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;z-index:10">
            <div style="position:absolute;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:48px;font-weight:900;color:rgba(13,92,58,.11);white-space:nowrap;font-family:'Instrument Sans',sans-serif;letter-spacing:4px;user-select:none">SIPADI TERVERIFIKASI</div>
            <div style="position:absolute;top:10px;right:10px;background:rgba(255,255,255,.92);padding:6px;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.2)">
              <div id="pvQR" style="width:64px;height:64px"></div>
              <div style="font-size:7px;text-align:center;color:#0d5c3a;font-weight:700;margin-top:3px">SCAN VERIFIKASI</div>
            </div>
            <div style="position:absolute;bottom:10px;right:10px;background:rgba(13,92,58,.9);color:#fff;padding:5px 12px;border-radius:6px;font-size:10px;font-weight:700;letter-spacing:1px">✓ TERVERIFIKASI · SIPADI</div>
          </div>
        </div>
      </div>`;
    setTimeout(()=>{
      const el=document.getElementById('pvQR');
      if(el&&window.QRCode){ el.innerHTML=''; new QRCode(el,{text:url,width:64,height:64,colorDark:'#0d5c3a',colorLight:'#ffffff'}); }
    },250);
  } else {
    // Tidak ada file — tampilkan generated preview
    document.getElementById('pvB').innerHTML=`<div class="doc-preview" id="pArea">
    <div class="doc-header">
      <div style="width:65px;height:65px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
  <svg viewBox="0 0 65 65" xmlns="http://www.w3.org/2000/svg" width="65" height="65">
    <defs><linearGradient id="lgd" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a6b3c"/><stop offset="100%" stop-color="#0a3d20"/></linearGradient></defs>
    <circle cx="32" cy="32" r="30" fill="url(#lgd)" stroke="#c8922a" stroke-width="1.5"/>
    <text x="32" y="44" text-anchor="middle" font-family="Playfair Display,Georgia,serif" font-size="30" font-weight="900" fill="#f5c842">A</text>
  </svg>
</div>
      <div class="doc-header-text"><div class="dept">Kementerian Agama Republik Indonesia</div><h1>IJAZAH ${jL}</h1><div class="subtitle">${n.madrasah} — Kabupaten Jember, Jawa Timur</div></div>
      <div class="doc-qr"><div id="dqr"></div><p>Scan untuk verifikasi</p><p>${n.no}</p></div>
    </div>
    <div class="doc-row"><span class="k">Nomor Ijazah</span><span class="v">${n.no}</span></div>
    <div class="doc-row"><span class="k">Tahun Lulus</span><span class="v">${n.thn}</span></div>
    <div class="doc-section">Data Peserta Didik</div>
    <div class="doc-row"><span class="k">Nama Lengkap</span><span class="v">${n.nama}</span></div>
    <div class="doc-row"><span class="k">Tempat, Tgl Lahir</span><span class="v">${n.ttl||'-'}</span></div>
    <div class="doc-row"><span class="k">NISN</span><span class="v" style="font-family:'DM Mono',monospace">${n.nisn||'-'}</span></div>
    <div class="doc-row"><span class="k">Madrasah</span><span class="v">${n.madrasah}</span></div>
    <div class="doc-row"><span class="k">Jurusan</span><span class="v">${n.jurusan||'-'}</span></div>
    <div class="doc-row"><span class="k">Nilai Rata-rata</span><span class="v">${n.nilai||'-'}</span></div>
    <div class="doc-hash">🔒 <strong>SHA-256:</strong> <span>${n.hash}</span> <span style="background:#dcfce7;color:#15803d;padding:2px 10px;border-radius:6px;font-size:10px;font-weight:700">✓ Terautentikasi</span></div>
  </div>`;
    setTimeout(()=>{const el=document.getElementById('dqr');if(el&&window.QRCode){el.innerHTML='';new QRCode(el,{text:url,width:70,height:70,colorDark:'#0d5c3a'});}},250);
  }
  openM('mPrev');
}

async function downloadWatermarkedI(id){
  const n=S.ijazah.find(x=>x.id===id);if(!n||!n.fileUrl)return;
  const btn=event.target;
  btn.textContent='⏳ Memproses...';btn.disabled=true;
  try {
    const verifyUrl=location.origin+location.pathname+'#verify/'+n.hash;
    const pdfBytes=await fetch(n.fileUrl).then(r=>r.arrayBuffer());
    const {PDFDocument,rgb,degrees}=PDFLib;
    const pdfDoc=await PDFDocument.load(pdfBytes,{ignoreEncryption:true});
    const pages=pdfDoc.getPages();

    // Generate QR
    const qrDiv=document.createElement('div');
    qrDiv.style.cssText='position:fixed;left:-9999px;top:0;width:120px;height:120px';
    document.body.appendChild(qrDiv);
    await new Promise(res=>{
      new QRCode(qrDiv,{text:verifyUrl,width:120,height:120,colorDark:'#0d5c3a',colorLight:'#ffffff'});
      setTimeout(res,600);
    });
    const qrCanvas=qrDiv.querySelector('canvas');
    const qrDataUrl=qrCanvas?qrCanvas.toDataURL('image/png'):null;
    document.body.removeChild(qrDiv);

    let qrImage=null;
    if(qrDataUrl){
      const qrData=await fetch(qrDataUrl).then(r=>r.arrayBuffer());
      qrImage=await pdfDoc.embedPng(qrData);
    }

    for(const page of pages){
      const {width,height}=page.getSize();
      const font=await pdfDoc.embedFont(PDFLib.StandardFonts.HelveticaBold);

      page.drawText('SIPADI TERVERIFIKASI',{
        x:width/2-180, y:height/2,
        size:42, font,
        color:rgb(0.05,0.36,0.15),
        opacity:0.08,
        rotate:degrees(35),
      });

      if(qrImage && page===pages[0]){
        const qrSize=90;
        page.drawImage(qrImage,{
          x:width-qrSize-12, y:height-qrSize-12,
          width:qrSize, height:qrSize, opacity:0.92,
        });
        page.drawText('Scan Verifikasi',{x:width-qrSize-12,y:height-qrSize-24,size:7,font,color:rgb(0.05,0.36,0.15),opacity:0.8});
        page.drawText(n.no,{x:width-qrSize-12,y:height-qrSize-33,size:6,font,color:rgb(0.05,0.36,0.15),opacity:0.7});
      }

      page.drawRectangle({x:0,y:0,width,height:18,color:rgb(0.05,0.36,0.15),opacity:0.85});
      page.drawText(`SIPADI · Kemenag Kab. Jember · ${n.no} · ${n.nama} · Terverifikasi ${new Date().toLocaleDateString('id-ID')}`,{
        x:10,y:5,size:7,font,color:rgb(1,1,1),opacity:0.95,
      });
    }

    const outBytes=await pdfDoc.save();
    const blob=new Blob([outBytes],{type:'application/pdf'});
    const a=document.createElement('a');
    a.href=URL.createObjectURL(blob);
    a.download=`SIPADI_Ijazah_${n.nama.replace(/\s+/g,'_')}_${n.no.replace(/\//g,'-')}.pdf`;
    a.click();
    URL.revokeObjectURL(a.href);
    btn.textContent='✅ Selesai!';
    setTimeout(()=>{btn.textContent='⬇ Download + Watermark';btn.disabled=false;},2000);
  } catch(e){
    console.error(e);
    alert('Gagal proses watermark: '+e.message);
    btn.textContent='⬇ Download + Watermark';btn.disabled=false;
  }
}

// ═══════════ SATUAN KERJA ═══════════
let stC='kua';
function stT(t,btn){stC=t;document.querySelectorAll('#pSk .tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');const tt={kua:'🕌 KUA Kabupaten Jember (31 Kecamatan)',mi:'🏫 Madrasah Ibtidaiyah Negeri (6)',mts:'🏫 Madrasah Tsanawiyah Negeri (11)',man:'🏫 Madrasah Aliyah Negeri (3)'};document.getElementById('stTit').textContent=tt[t];renderSk();}
function renderSk(){
  const d=S.sk[stC]||[];
  document.getElementById('tSk').innerHTML=d.map((s,i)=>{
    const stBadge = (s.status||'aktif')==='aktif'
      ? '<span class="badge badge-jade">✓ Aktif</span>'
      : '<span class="badge badge-red">✗ Non-Aktif</span>';
    return `<tr>
      <td style="color:#6B7280">${i+1}</td>
      <td class="td-bold">${s.nama}</td>
      <td class="td-mono">${s.kode}</td>
      <td>${s.op}</td>
      <td><span class="badge badge-gold">${s.dok} dok</span></td>
      <td>${stBadge}</td>
      <td><button class="btn btn-jade btn-sm" onclick="editSk('${s.id}')">✏ Edit</button></td>
    </tr>`;
  }).join('')||er(7);
}

function editSk(id){
  const s = [...(S.sk.kua||[]),...(S.sk.mi||[]),...(S.sk.mts||[]),...(S.sk.man||[])].find(x=>x.id===id);
  if(!s) return;
  document.getElementById('skId').value    = s.id;
  document.getElementById('skTipe').value  = stC;
  document.getElementById('skNama').value  = s.nama;
  document.getElementById('skKode').value  = s.kode;
  document.getElementById('skKepala').value= s.kepala||'';
  document.getElementById('skStatus').value= s.status||'aktif';
  document.getElementById('mSkTitle').textContent = '✏️ EDIT — ' + s.nama;
  openM('mSkEdit');
}

function saveSk(){
  const id    = document.getElementById('skId').value;
  const tipe  = document.getElementById('skTipe').value;
  const nama  = document.getElementById('skNama').value.trim();
  const kode  = document.getElementById('skKode').value.trim();
  const kepala= document.getElementById('skKepala').value.trim();
  const status= document.getElementById('skStatus').value;
  if(!nama){ showToast('Nama Satuan Kerja wajib diisi','error'); return; }
  const arr = S.sk[tipe];
  if(!arr) return;
  const idx = arr.findIndex(x=>x.id===id);
  if(idx>=0){
    arr[idx] = {...arr[idx], nama, kode, kepala, status};
    closeM('mSkEdit');
    renderSk();
    showToast('✅ Data satuan kerja berhasil diperbarui');
  }
}

// ═══════════ OPERATOR ═══════════
let oq='';
function fO(v){oq=v.toLowerCase();renderO();}
function renderO(){let d=S.ops.filter(o=>!oq||o.nama.toLowerCase().includes(oq)||o.email.includes(oq));document.getElementById('tO').innerHTML=d.length?d.map((o,i)=>`<tr><td style="color:#6B7280">${i+1}</td><td class="td-bold">${o.nama}</td><td class="td-mono">${o.email}</td><td>${o.satker}</td><td><span class="badge ${o.role==='kabupaten'?'badge-blue':o.role==='kua'?'badge-jade':'badge-gold'}">${o.role}</span></td><td><span class="badge ${o.status==='aktif'?'badge-jade':'badge-red'}">${o.status}</span></td><td><div style="display:flex;gap:5px"><button class="btn btn-jade btn-sm" onclick="edO('${o.id}')">✏</button><button class="btn btn-red btn-sm" onclick="dlO('${o.id}')">✕</button></div></td></tr>`).join(''):er(7);}
async function saveO(){
  const id     = document.getElementById('oId').value;
  const nm     = document.getElementById('oNm').value.trim();
  const em     = document.getElementById('oEm').value.trim();
  const role   = document.getElementById('oRl').value;
  const satker = document.getElementById('oSk').value;
  const hp     = document.getElementById('oHp').value.trim();
  const status = document.getElementById('oSt').value;
  const pw     = document.getElementById('oPw')?.value||'';
  const pw2    = document.getElementById('oPw2')?.value||'';

  // Validasi dasar
  if(!nm||!em){ showToast('Nama dan email wajib diisi','error'); return; }
  if(!id){
    // Operator BARU — butuh password
    if(!pw){ showToast('Password wajib diisi untuk operator baru','error'); return; }
    if(pw.length < 8){ showToast('Password minimal 8 karakter','error'); return; }
    if(pw !== pw2){ showToast('Konfirmasi password tidak cocok','error'); return; }
  }

  const btn = document.getElementById('btnSimpanOper');
  if(btn){ btn.disabled=true; btn.textContent='⟳ Menyimpan...'; }

  try {
    const body = { nama:nm, email:em, role, satker, hp, status };
    if(pw) body.password = pw;

    if(id){
      await api('PUT', `/operators/${id}`, body);
      showToast('✅ Data operator berhasil diperbarui');
    } else {
      await api('POST', '/operators', body);
      showToast('✅ Operator berhasil didaftarkan!');
    }
    await loadOps();
    closeM('mOper');

  } catch(e){
    showToast('❌ ' + e.message, 'error');
  } finally {
    if(btn){ btn.disabled=false; btn.textContent='💾 Simpan & Daftarkan'; }
  }
}
function edO(id){
  const o=S.ops.find(x=>x.id===id);
  if(!o) return;
  document.getElementById('oId').value  = o.id;
  document.getElementById('oNm').value  = o.nama;
  document.getElementById('oEm').value  = o.email;
  document.getElementById('oRl').value  = o.role;
  document.getElementById('oSk').value  = o.satker;
  document.getElementById('oHp').value  = o.hp||'';
  document.getElementById('oSt').value  = o.status;
  // Sembunyikan field password saat edit (password tidak diubah dari sini)
  const pw = document.getElementById('oPwWrap');
  if(pw) pw.style.display = 'none';
  const btn = document.getElementById('btnSimpanOper');
  if(btn) btn.textContent = '💾 Simpan Perubahan';
  // Update judul modal
  document.querySelector('#mOper .modal-head h3').textContent = '✏️ EDIT OPERATOR';
  openM('mOper');
}
async function dlO(id){
  if(!confirm('Hapus operator?')) return;
  try {
    await api('DELETE', `/operators/${id}`);
    await loadOps();
  } catch(e) { alert('Gagal hapus: '+e.message); }
}

// ═══════════ VERIFIKASI ═══════════
async function verD(){
  const q=document.getElementById('vIn').value.trim();if(!q)return;
  const r=document.getElementById('vRes');
  r.innerHTML='<div style="text-align:center;padding:20px;color:#6B7280">🔍 Mencari dokumen...</div>';

  // Cari di lokal dulu
  let dn=S.nikah.find(x=>x.hash===q||x.noAkta===q);
  let di=S.ijazah.find(x=>x.hash===q||x.no===q);

  // Jika tidak ada di lokal, cari ke Workers API
  if(!dn && !di){
    try {
      const res = await api('GET', `/verify/${encodeURIComponent(q)}`);
      if(res.type==='nikah' && res.data){
        const row=res.data;
        dn={id:row.id,noAkta:row.no_akta,hash:row.hash,suami:row.suami,istri:row.istri,kua:row.kua,status:row.status};
      } else if(res.type==='ijazah' && res.data){
        const row=res.data;
        di={id:row.id,no:row.no,hash:row.hash,nama:row.nama,madrasah:row.madrasah,thn:row.thn,status:row.status};
      }
    } catch(e) { console.warn('verD lookup:', e.message); }
  }

  const doc=dn||di; const isN=!!dn;
  if(doc){
    r.innerHTML=`<div class="alert alert-ok" style="margin-bottom:14px">✅ Dokumen VALID — terautentikasi dalam sistem SIPADI Kemenag Kab. Jember</div>
    <div class="card" style="animation:none"><div class="card-body">
      <div style="display:flex;gap:10px;margin-bottom:8px">
        <span class="badge badge-jade">${isN?'Register Nikah':'Ijazah Madrasah'}</span>
        <span class="badge ${doc.status==='terverifikasi'?'badge-jade':'badge-gold'}">${doc.status}</span>
      </div>
      <div class="doc-row" style="color:#374151"><span class="k" style="color:#6B7280">Nomor</span><span class="v td-mono">${isN?doc.noAkta:doc.no}</span></div>
      ${isN
        ?`<div class="doc-row" style="color:#374151"><span class="k" style="color:#6B7280">Pasangan</span><span class="v">${doc.suami} &amp; ${doc.istri}</span></div>
          <div class="doc-row" style="color:#374151"><span class="k" style="color:#6B7280">KUA</span><span class="v">${doc.kua}</span></div>`
        :`<div class="doc-row" style="color:#374151"><span class="k" style="color:#6B7280">Siswa</span><span class="v">${doc.nama}</span></div>
          <div class="doc-row" style="color:#374151"><span class="k" style="color:#6B7280">Madrasah</span><span class="v">${doc.madrasah}</span></div>`
      }
      <div style="margin-top:12px;padding:10px;background:rgba(0,0,0,.3);border-radius:8px;font-family:'DM Mono',monospace;font-size:10px;color:#6B7280">🔒 ${doc.hash}</div>
    </div></div>`;
  } else {
    r.innerHTML=`<div class="alert alert-err">❌ Dokumen <strong>tidak ditemukan</strong> atau hash tidak valid dalam sistem SIPADI</div>`;
  }
}

// ═══════════ SCAN ═══════════
function scT(t,btn){document.querySelectorAll('#pSc .tab-btn').forEach(b=>b.classList.remove('active'));btn.classList.add('active');document.getElementById('scNA').style.display=t==='n'?'block':'none';document.getElementById('scIA').style.display=t==='i'?'block':'none';}
function procF(e,t,rid){const f=e.target.files[0];if(f)procFR(f,t,rid);}
async function procFR(file,t,rid){
  const el=document.getElementById(rid);if(!el)return;
  const allowed=['application/pdf','image/jpeg','image/png','image/jpg'];
  if(!allowed.includes(file.type)){el.innerHTML=`<div class="alert alert-err">❌ Format tidak didukung (PDF/JPG/PNG).</div>`;return;}
  if(file.size>20*1024*1024){el.innerHTML=`<div class="alert alert-err">❌ File terlalu besar (maks 20 MB).</div>`;return;}

  el.innerHTML=`<div class="alert alert-info" style="display:flex;align-items:center;gap:10px"><span style="animation:spin 1s linear infinite;display:inline-block;font-size:18px">⟳</span><span>Memproses <strong>${file.name}</strong> dengan Tesseract.js OCR…</span></div>`;

  try{
    const rawText = await doOcrWithTesseract(file, pct => {
      el.innerHTML=`<div class="alert alert-info" style="display:flex;align-items:center;gap:10px"><span style="animation:spin 1s linear infinite;display:inline-block;font-size:18px">⟳</span><span>OCR berjalan… <strong>${pct}%</strong></span></div>`;
    });
    if(!rawText||rawText.trim().length<10) throw new Error('Teks tidak terdeteksi. Pastikan scan jelas.');

    const h=await mkH(file.name+file.size);
    if(t==='n'){
      const d=parseNikahText(rawText);
      el.innerHTML=`<div class="alert alert-ok" style="margin-bottom:12px">✅ Berhasil dibaca! Periksa data sebelum disimpan.</div>
      <div class="card" style="animation:none"><div class="card-body">
        <div class="grid-2">
          <div class="fg"><label>Nomor Akta (OCR)</label><input class="fc" value="${d.noAkta||''}" id="sNA"></div>
          <div class="fg"><label>Tanggal Nikah</label><input class="fc" type="date" value="${d.tglNikah||''}" id="sTgl"></div>
        </div>
        <div class="grid-2">
          <div class="fg"><label>Nama Suami (OCR)</label><input class="fc" value="${d.namaSuami||''}" id="sSm"></div>
          <div class="fg"><label>Nama Istri (OCR)</label><input class="fc" value="${d.namaIstri||''}" id="sSt"></div>
        </div>
        <div style="margin:6px 0 12px;padding:9px 12px;background:rgba(45,122,79,.06);border:1px solid rgba(45,122,79,.15);border-radius:8px;font-family:'DM Mono',monospace;font-size:10px;color:var(--mode-text3)">🔒 Hash: ${h}</div>
        <button class="btn btn-jade" onclick="impScan()">📥 Import ke Register Nikah</button>
      </div></div>`;
    } else {
      const d=parseIjazahText(rawText);
      el.innerHTML=`<div class="alert alert-ok" style="margin-bottom:12px">✅ Ijazah terdeteksi!</div>
      <div class="card" style="animation:none"><div class="card-body">
        <div class="grid-2">
          <div class="fg"><label>No Ijazah (OCR)</label><input class="fc" value="${d.noIjazah||''}"></div>
          <div class="fg"><label>Nama Siswa</label><input class="fc" value="${d.namaSiswa||''}"></div>
        </div>
        <div class="grid-2">
          <div class="fg"><label>Madrasah</label><input class="fc" value="${d.madrasah||''}"></div>
          <div class="fg"><label>Tahun Lulus</label><input class="fc" value="${d.tahunLulus||''}"></div>
        </div>
        <div style="margin:6px 0 12px;padding:9px 12px;background:rgba(45,122,79,.06);border:1px solid rgba(45,122,79,.15);border-radius:8px;font-family:'DM Mono',monospace;font-size:10px;color:var(--mode-text3)">🔒 Hash: ${h}</div>
        <button class="btn btn-gold" onclick="alert('Diimport ke arsip ijazah')">📥 Import Ijazah</button>
      </div></div>`;
    }
  }catch(err){
    el.innerHTML=`<div class="alert alert-err">❌ Gagal OCR: ${err.message}. Gunakan input manual.</div>`;
  }
}

function impScan(){const na=document.getElementById('sNA')?.value;if(na){document.getElementById('nNA').value=na;document.getElementById('nTgl').value=document.getElementById('sTgl')?.value||'';document.getElementById('nSm').value=document.getElementById('sSm')?.value||'';document.getElementById('nSt').value=document.getElementById('sSt')?.value||'';openM('mNikah');}}

// ═══════════ GUIDE TABS ═══════════
function gTab(t,btn){
  document.querySelectorAll('.guide-tab').forEach(b=>b.classList.remove('active'));btn.classList.add('active');
  document.getElementById('gFirebase').style.display=t==='firebase'?'block':'none';
  document.getElementById('gNetlify').style.display=t==='netlify'?'block':'none';
}

// ═══════════ LAPORAN ═══════════
function renderLap(){
  const nb={};S.nikah.forEach(n=>{nb[n.kua]=(nb[n.kua]||0)+1;});const nt=Math.max(S.nikah.length,1);
  const ln=document.getElementById('lapN');if(ln)ln.innerHTML=Object.entries(nb).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="bar-row"><div class="bar-name">KUA ${k}</div><div class="bar-track"><div class="bar-fill jade" style="width:${~~(v/nt*100)}%"></div></div><div class="bar-val">${v}</div></div>`).join('')||`<p style="color:#6B7280;font-size:13px;text-align:center;padding:28px;font-family:'Cormorant Garamond',serif;font-style:italic">Belum ada data</p>`;
  const ib={};S.ijazah.forEach(i=>{ib[i.madrasah]=(ib[i.madrasah]||0)+1;});const it=Math.max(S.ijazah.length,1);
  const li=document.getElementById('lapI');if(li)li.innerHTML=Object.entries(ib).sort((a,b)=>b[1]-a[1]).map(([k,v])=>`<div class="bar-row"><div class="bar-name">${k}</div><div class="bar-track"><div class="bar-fill gold" style="width:${~~(v/it*100)}%"></div></div><div class="bar-val">${v}</div></div>`).join('')||`<p style="color:#6B7280;font-size:13px;text-align:center;padding:28px;font-family:'Cormorant Garamond',serif;font-style:italic">Belum ada data</p>`;
}

// ═══════════ PRINT ═══════════
// ══════════════════════════════════════════════════════════════════
// FIX 5: BACKUP & EXPORT
// ══════════════════════════════════════════════════════════════════
function downloadFile(content, filename, mime){
  const blob = new Blob([content], {type: mime});
  const url  = URL.createObjectURL(blob);
  const a    = document.createElement('a');
  a.href=url; a.download=filename; a.click();
  URL.revokeObjectURL(url);
  // Catat waktu backup terakhir
  const ts = new Date().toLocaleString('id-ID');
  try{ localStorage.setItem('spd_last_backup', ts); }catch{}
  document.getElementById('lastBackup').textContent = ts;
  showToast('✅ File berhasil didownload: '+filename);
}

function exportCSV(tipe){
  let rows=[], headers=[], fname='';
  const ts = new Date().toISOString().split('T')[0];
  if(tipe==='nikah'){
    headers=['No Akta','No Pmrk','Tanggal','Nama Suami','NIK Suami','Ttl Suami','Pekerjaan Suami','Nama Istri','NIK Istri','Ttl Istri','Pekerjaan Istri','KUA','Wali','Tempat Akad','Status','Hash'];
    rows = S.nikah.map(n=>[n.noAkta,n.noPmrk,n.tgl,n.suami,n.suamiNik||'',n.suamiTtl||'',n.suamiPek||'',n.istri,n.istriNik||'',n.istriTtl||'',n.istriPek||'',n.kua,n.wali||'',n.tempat||'',n.status,n.hash]);
    fname=`register_nikah_${ts}.csv`;
  } else if(tipe==='ijazah'){
    headers=['No Ijazah','Nama Siswa','TTL','Madrasah','Jenjang','NISN','Jurusan','Tahun','Nilai','Status','Hash'];
    rows = S.ijazah.map(i=>[i.no,i.nama,i.ttl||'',i.madrasah,i.jenjang,i.nisn||'',i.jurusan||'',i.thn,i.nilai||'',i.status,i.hash]);
    fname=`arsip_ijazah_${ts}.csv`;
  } else if(tipe==='pegawai'){
    headers=['NIP','Nama','Jabatan','Golongan','Satker','Jenis','Status','Email','HP'];
    rows = S.pegawai.map(p=>[p.nip||'',p.nama,p.jabatan||'',p.golongan||'',p.satker||'',p.jenis||'',p.status||'',p.email||'',p.hp||'']);
    fname=`pegawai_${ts}.csv`;
  }
  if(!rows.length){ showToast('Tidak ada data untuk diexport','error'); return; }
  const esc=v=>'"'+String(v||'').replace(/"/g,'""')+'"';
  const csv=[headers.map(esc).join(','),...rows.map(r=>r.map(esc).join(','))].join('\n');
  downloadFile('\uFEFF'+csv, fname, 'text/csv;charset=utf-8');
}

function exportJSON(tipe){
  const ts=new Date().toISOString().split('T')[0];
  let data,fname;
  if(tipe==='nikah')       {data=S.nikah;   fname=`register_nikah_${ts}.json`;}
  else if(tipe==='ijazah') {data=S.ijazah;  fname=`arsip_ijazah_${ts}.json`;}
  else if(tipe==='pegawai'){data=S.pegawai; fname=`pegawai_${ts}.json`;}
  if(!data?.length){ showToast('Tidak ada data untuk diexport','error'); return; }
  downloadFile(JSON.stringify({exported:new Date().toISOString(),total:data.length,data}, null, 2), fname, 'application/json');
}

function exportAll(){
  const ts=new Date().toISOString().split('T')[0];
  const all={
    exported:new Date().toISOString(),
    versi:'SIPADI v2.0',
    satker:'Kemenag Kab. Jember',
    total:{nikah:S.nikah.length, ijazah:S.ijazah.length, pegawai:S.pegawai.length},
    register_nikah:S.nikah,
    arsip_ijazah:S.ijazah,
    pegawai:S.pegawai
  };
  downloadFile(JSON.stringify(all,null,2), `backup_sipadi_${ts}.json`, 'application/json');
}

// ══════════════════════════════════════════════════════════════════
// FIX 3: AUDIT LOG — tampilkan di halaman Laporan
// ══════════════════════════════════════════════════════════════════
async function loadAuditLog(){
  showToast('Audit log belum tersedia di Workers','warn'); return;
  /*
  const tb=document.getElementById('tAudit');
  if(!tb) return;
  tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:#6B7280">⟳ Memuat...</td></tr>';
  try{
    const {data,error}=await sb.from('audit_log')
      .select('*').order('created_at',{ascending:false}).limit(100);
    if(error) throw new Error(error.message);
    if(!data?.length){
      tb.innerHTML='<tr><td colspan="5" style="text-align:center;padding:20px;color:#6B7280">Belum ada log aktivitas</td></tr>';
      return;
    }
    const aksiColor={INSERT:'badge-jade',UPDATE:'badge-gold',DELETE:'badge-red'};
    tb.innerHTML=data.map(r=>`<tr>
      <td style="font-size:11px;white-space:nowrap">${new Date(r.created_at).toLocaleString('id-ID')}</td>
      <td><span class="badge ${aksiColor[r.aksi]||'badge-blue'}">${r.aksi}</span></td>
      <td class="td-mono" style="font-size:11px">${r.tabel}</td>
      <td style="font-size:11px">${r.user_email||'-'}</td>
      <td style="font-size:11px;color:#6B7280">${r.record_id||'-'}</td>
    </tr>`).join('');
    showToast('✅ Audit log dimuat: '+data.length+' entri');
  }catch(e){
    tb.innerHTML=`<tr><td colspan="5" style="text-align:center;padding:20px;color:#C0392B">❌ ${e.message} — pastikan tabel audit_log sudah dibuat via rls_setup.sql</td></tr>`;
  }
}

// Tampilkan audit card hanya untuk admin kabupaten
function initLapPage(){
  const card=document.getElementById('auditCard');
  if(card) card.style.display=['kabupaten','admin'].includes(S.role)?'':'none';
  // Tampilkan waktu backup terakhir
  try{
    const last=localStorage.getItem('spd_last_backup');
    const el=document.getElementById('lastBackup');
    if(el&&last) el.textContent=last;
  }catch{}
}

function doPrint(){
  const el=document.getElementById('pArea');
  if(!el){alert('Tidak ada dokumen untuk dicetak');return;}
  const w=window.open('','_blank');
  const fonts='https://fonts.googleapis.com/css2?family=Playfair+Display:wght@400;700;900&family=Cormorant+Garamond:ital,wght@0,400;0,600;1,400&family=Instrument+Sans:wght@400;600&family=DM+Mono:wght@400&display=swap';
  w.document.write('<!DOCTYPE html><html><head><title>Cetak SIPADI</title>'
    +'<link href="'+fonts+'" rel="stylesheet">'
    +'<style>'
    +'*{box-sizing:border-box;margin:0;padding:0}'
    +'body{font-family:\'Instrument Sans\',sans-serif;margin:28px;background:#fff;color:#1a1a1a}'
    +'.doc-preview{background:#fff;color:#1a1a1a;position:relative}'
    +'.doc-header{display:flex;align-items:center;gap:16px;border-bottom:3px double #0d5c3a;padding-bottom:16px;margin-bottom:20px}'
    +'.doc-header-text{flex:1;text-align:center}'
    +'.doc-header-text .dept{font-family:\'Cormorant Garamond\',serif;font-size:10px;letter-spacing:2px;color:#666;text-transform:uppercase;font-style:italic}'
    +'.doc-header-text h1{font-family:\'Playfair Display\',serif;font-size:20px;font-weight:900;color:#0d5c3a;letter-spacing:3px;margin:4px 0}'
    +'.doc-header-text .subtitle{font-size:11px;color:#888}'
    +'.doc-qr{text-align:center}'
    +'.doc-qr p{font-size:9px;color:#aaa;margin-top:4px;font-family:\'DM Mono\',monospace}'
    +'.doc-section{font-family:\'Playfair Display\',serif;font-size:9px;font-weight:700;letter-spacing:2.5px;color:#0d5c3a;text-transform:uppercase;padding:10px 0 8px;border-bottom:1px solid #c8e6d0;margin-bottom:10px}'
    +'.doc-row{display:flex;gap:10px;margin-bottom:8px;font-size:12px}'
    +'.doc-row .k{color:#888;min-width:140px;flex-shrink:0;font-family:\'Cormorant Garamond\',serif;font-style:italic}'
    +'.doc-row .v{font-weight:600;color:#222}'
    +'.doc-hash{margin-top:18px;padding:10px 14px;background:#f0faf5;border:1px solid #b8e0cc;border-radius:8px;font-family:\'DM Mono\',monospace;font-size:10px;color:#555;display:flex;align-items:center;gap:8px;flex-wrap:wrap}'
    +'canvas,img{display:block}'
    +'.doc-preview::after{content:"SIPADI — KEMENAG JEMBER";position:fixed;top:50%;left:50%;transform:translate(-50%,-50%) rotate(-35deg);font-size:52px;font-weight:900;letter-spacing:6px;color:rgba(13,92,58,.07);white-space:nowrap;pointer-events:none;font-family:\'Playfair Display\',serif;z-index:0}'
    +'@media print{body{margin:0}.doc-preview::after{position:fixed}}'
    +'</style></head><body>');
  w.document.write(el.innerHTML);
  w.document.write('</body></html>');
  w.document.close();
  setTimeout(()=>w.print(),700);
}

// ═══════════ NAVIGATION ═══════════
const pM={d:'pD',n:'pN',i:'pI',sk:'pSk',op:'pOp',kp:'pKp',vf:'pVf',sc:'pSc',guide:'pGuide',lp:'pLp'};
const tM={d:'Dashboard',n:'Register Nikah',i:'Arsip Ijazah',sk:'Satuan Kerja',op:'Kelola Operator',kp:'Kepegawaian',vf:'Verifikasi Dokumen',sc:'Scan Dokumen',guide:'Panduan Deploy',lp:'Laporan & Statistik'};
function nav(k,btn){
  Object.values(pM).forEach(pid=>{const e=document.getElementById(pid);if(e)e.classList.remove('active');});
  const p=document.getElementById(pM[k]);if(p)p.classList.add('active');
  document.getElementById('pgT').textContent=tM[k]||k;
  document.getElementById('pgB').textContent=tM[k]||k;
  document.querySelectorAll('.nav-item').forEach(n=>n.classList.remove('active'));
  if(btn)btn.classList.add('active');
}
// ══════════════════════════════════════════════════════
// OCR IJAZAH
// ══════════════════════════════════════════════════════

let ocrIjazahData = null;

function switchIjazahTab(tab) {
  const tOcr = document.getElementById('iTabOcr');
  const tMan = document.getElementById('iTabManual');
  const pOcr = document.getElementById('iPanelOcr');
  const pFrm = document.getElementById('iPanelForm');
  const btn  = document.getElementById('btnSimpanIjazah');
  const on   = 'flex:1;padding:10px;border-radius:10px;border:none;cursor:pointer;font-family:\'Instrument Sans\',sans-serif;font-size:12px;font-weight:600;letter-spacing:.5px;transition:.2s;';
  if (tab === 'ocr') {
    tOcr.style.cssText = on+'background:linear-gradient(135deg,var(--leaf),var(--leaf2));color:#fff;box-shadow:0 4px 14px rgba(15,92,58,.4)';
    tMan.style.cssText = on+'background:transparent;color:#6B7280';
    pOcr.style.display = 'block'; pFrm.style.display = 'none'; btn.style.display = 'none';
  } else {
    tOcr.style.cssText = on+'background:transparent;color:#6B7280';
    tMan.style.cssText = on+'background:linear-gradient(135deg,var(--ember),var(--ember2));color:var(--ink);box-shadow:0 4px 14px rgba(184,128,42,.35)';
    pOcr.style.display = 'none'; pFrm.style.display = 'block'; btn.style.display = 'inline-flex';
    const lbl = document.getElementById('iFormLabel');
    if (lbl && lbl.textContent === 'Input Manual') lbl.textContent = 'Input Manual';
  }
}

function handleIjazahDrop(e) {
  e.preventDefault();
  const file = e.dataTransfer.files[0];
  if (file) processIjazahOcr(file);
}

function handleIjazahFile(input) {
  const file = input.files[0];
  if (file) processIjazahOcr(file);
}

async function processIjazahOcr(file) {
  const allowed = ['application/pdf','image/jpeg','image/png','image/jpg'];
  if (!allowed.includes(file.type)) { showIjazahStatus('error','❌ Format tidak didukung (JPG/PNG/PDF).'); return; }
  if (file.size > 20*1024*1024) { showIjazahStatus('error','❌ File terlalu besar (maks 20 MB).'); return; }

  showIjazahStatus('loading','🔄 Membaca ijazah dengan Tesseract.js… mohon tunggu.');
  document.getElementById('iOcrPreview').style.display = 'none';

  try {
    const rawText = await doOcrWithTesseract(file, pct => {
      showIjazahStatus('loading', `🔄 OCR berjalan… ${pct}%`);
    });
    if (!rawText || rawText.trim().length < 20)
      throw new Error('Teks tidak terdeteksi. Pastikan scan cukup jelas.');

    const parsed = parseIjazahText(rawText);
    parsed._rawText  = rawText;
    parsed._fileName = file.name;
    parsed._file     = file;
    ocrIjazahData = parsed;

    showIjazahStatus('success','✅ Ijazah berhasil dibaca! Periksa data di bawah.');
    renderIjazahPreview(parsed);
  } catch(err) {
    showIjazahStatus('error','❌ ' + err.message + '. Gunakan Input Manual.');
  }
}

function showIjazahStatus(type, msg) {
  const el = document.getElementById('iOcrStatus');
  if (!el) return;
  const s = {
    loading: 'background:rgba(30,80,180,.1);border:1px solid rgba(30,80,180,.2);color:#8ec8ff',
    success: 'background:rgba(15,92,58,.1);border:1px solid rgba(15,92,58,.25);color:#2D9A56',
    error:   'background:rgba(192,48,64,.08);border:1px solid rgba(192,48,64,.2);color:#ff8090'
  };
  el.style.cssText = `display:flex;padding:14px 18px;border-radius:12px;margin-bottom:16px;font-size:13px;align-items:center;gap:10px;${s[type]}`;
  el.innerHTML = type === 'loading'
    ? `<span style="animation:spin 1s linear infinite;display:inline-block;font-size:18px">⟳</span><span>${msg}</span>`
    : `<span>${msg}</span>`;
}

function renderIjazahPreview(d) {
  const grid = document.getElementById('iOcrGrid');
  const prev = document.getElementById('iOcrPreview');
  if (!grid || !prev) return;
  const fields = [
    ['📄 No. Ijazah', d.noIjazah], ['📅 Tahun Lulus', d.tahunLulus],
    ['👤 Nama Siswa', d.namaSiswa], ['📍 Tempat Lahir', d.ttl],
    ['🔢 NISN',       d.nisn],      ['🏫 Madrasah',    d.madrasah],
    ['🎓 Jenjang',   d.jenjang],   ['📚 Jurusan',      d.jurusan],
    ['📊 Nilai',      d.nilaiRataRata],
  ];
  grid.innerHTML = fields.map(([lbl, val]) => `
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px 13px">
      <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#6B7280;margin-bottom:4px">${lbl}</div>
      <div style="font-size:12.5px;color:${val?'var(--cream)':'var(--cream4)'};font-weight:${val?'500':'400'};font-style:${val?'normal':'italic'}">${val||'— tidak terbaca —'}</div>
    </div>`).join('');
  prev.style.display = 'block';
}

function applyIjazahOcr() {
  if (!ocrIjazahData) return;
  const d = ocrIjazahData;
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val||''; };
  set('iNo',    d.noIjazah);
  set('iThn',   d.tahunLulus);
  set('iNm',    d.namaSiswa);
  set('iTtl',   d.ttl);
  set('iNisn',  d.nisn);
  set('iJur',   d.jurusan);
  set('iNilai', d.nilaiRataRata);
  // Cari madrasah di dropdown
  const sel = document.getElementById('iMad');
  if (sel && d.madrasah) {
    for (let i = 0; i < sel.options.length; i++) {
      if (sel.options[i].value.toLowerCase().includes(d.madrasah.toLowerCase()) ||
          d.madrasah.toLowerCase().includes(sel.options[i].value.toLowerCase())) {
        sel.selectedIndex = i; break;
      }
    }
  }
  const fp = document.getElementById('iFilePreview');
  if (fp && d._fileName) { fp.style.display='block'; fp.innerHTML=`📄 File: <strong>${d._fileName}</strong> (dari OCR)`; }
  const lbl = document.getElementById('iFormLabel');
  if (lbl) lbl.textContent = '✅ Data dari OCR — Koreksi jika perlu';
  switchIjazahTab('manual');
}

function clearIjazahOcr() {
  ocrIjazahData = null;
  const f = document.getElementById('iOcrFile');
  if (f) f.value = '';
  ['iOcrStatus','iOcrPreview'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.style.display = 'none';
  });
}

function resetIjazahModal() {
  clearIjazahOcr();
  switchIjazahTab('ocr');
  ['iId','iNo','iThn','iNm','iTtl','iNisn','iJur','iNilai'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const fp = document.getElementById('iFilePreview');
  if (fp) fp.style.display = 'none';
  const lbl = document.getElementById('iFormLabel');
  if (lbl) lbl.textContent = 'Input Manual';
}

let ocrRawData = null; // Simpan hasil OCR sementara

function switchNikahTab(tab) {
  const tabOcr    = document.getElementById('tabOcr');
  const tabManual = document.getElementById('tabManual');
  const panelOcr  = document.getElementById('panelOcr');
  const panelForm = document.getElementById('panelForm');
  const btnSimpan = document.getElementById('btnSimpanNikah');
  const lbl       = document.getElementById('formModeLabel');

  if (tab === 'ocr') {
    // Tampilkan panel OCR, sembunyikan form
    tabOcr.style.cssText    = 'flex:1;padding:10px;border-radius:10px;border:none;cursor:pointer;font-family:\'Instrument Sans\',sans-serif;font-size:12px;font-weight:600;letter-spacing:.5px;transition:.2s;background:linear-gradient(135deg,var(--leaf),var(--leaf2));color:#fff;box-shadow:0 4px 14px rgba(15,92,58,.4)';
    tabManual.style.cssText = 'flex:1;padding:10px;border-radius:10px;border:none;cursor:pointer;font-family:\'Instrument Sans\',sans-serif;font-size:12px;font-weight:600;letter-spacing:.5px;transition:.2s;background:transparent;color:#6B7280';
    panelOcr.style.display  = 'block';
    panelForm.style.display = 'none';
    btnSimpan.style.display = 'none';
  } else {
    // Tampilkan form manual langsung
    tabOcr.style.cssText    = 'flex:1;padding:10px;border-radius:10px;border:none;cursor:pointer;font-family:\'Instrument Sans\',sans-serif;font-size:12px;font-weight:600;letter-spacing:.5px;transition:.2s;background:transparent;color:#6B7280';
    tabManual.style.cssText = 'flex:1;padding:10px;border-radius:10px;border:none;cursor:pointer;font-family:\'Instrument Sans\',sans-serif;font-size:12px;font-weight:600;letter-spacing:.5px;transition:.2s;background:linear-gradient(135deg,var(--ember),var(--ember2));color:var(--ink);box-shadow:0 4px 14px rgba(184,128,42,.35)';
    panelOcr.style.display  = 'none';
    panelForm.style.display = 'block';
    btnSimpan.style.display = 'inline-flex';
    if (lbl) lbl.textContent = 'Input Manual';
  }
}

function handleOcrDrop(e) {
  e.preventDefault();
  document.getElementById('ocrDropZone').style.borderColor = 'rgba(34,199,122,.25)';
  const file = e.dataTransfer.files[0];
  if (file) processOcrFile(file);
}

function handleOcrFile(input) {
  const file = input.files[0];
  if (file) processOcrFile(file);
}

async function processOcrFile(file) {
  const allowed = ['application/pdf','image/jpeg','image/png','image/jpg'];
  if (!allowed.includes(file.type)) { showOcrStatus('error','❌ Format tidak didukung. Gunakan JPG, PNG, atau PDF.'); return; }
  if (file.size > 20*1024*1024) { showOcrStatus('error','❌ File terlalu besar (maks 20 MB).'); return; }

  showOcrStatus('loading','🔄 Membaca dokumen dengan Tesseract.js... mohon tunggu.');
  document.getElementById('ocrPreview').style.display = 'none';

  try {
    const rawText = await doOcrWithTesseract(file, pct => {
      showOcrStatus('loading', `🔄 OCR berjalan… ${pct}%`);
    });
    if (!rawText || rawText.trim().length < 20)
      throw new Error('Teks tidak terdeteksi. Pastikan scan cukup jelas dan tidak buram.');

    const parsed = parseNikahText(rawText);
    parsed._rawText  = rawText;
    parsed._fileName = file.name;
    parsed._file     = file;
    ocrRawData = parsed;

    showOcrStatus('success','✅ Dokumen berhasil dibaca! Periksa data di bawah sebelum digunakan.');
    renderOcrPreview(parsed);
  } catch(err) {
    console.error('OCR error:', err);
    showOcrStatus('error','❌ ' + err.message + '. Coba Input Manual.');
  }
}

function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result.split(',')[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function showOcrStatus(type, msg) {
  const el = document.getElementById('ocrStatus');
  if (!el) return;
  el.style.display = 'flex';
  const styles = {
    loading: 'background:rgba(30,80,180,.1);border:1px solid rgba(30,80,180,.2);color:#8ec8ff',
    success: 'background:rgba(15,92,58,.1);border:1px solid rgba(15,92,58,.25);color:#2D9A56',
    error:   'background:rgba(192,48,64,.08);border:1px solid rgba(192,48,64,.2);color:#ff8090'
  };
  el.style.cssText = `display:flex;padding:14px 18px;border-radius:12px;margin-bottom:16px;font-size:13px;align-items:center;gap:10px;${styles[type]}`;
  el.innerHTML = type === 'loading'
    ? `<span style="animation:spin 1s linear infinite;display:inline-block;font-size:18px">⟳</span><span>${msg}</span>`
    : `<span>${msg}</span>`;
}

function renderOcrPreview(data) {
  const grid = document.getElementById('ocrResultGrid');
  const prev = document.getElementById('ocrPreview');
  if (!grid || !prev) return;

  const fields = [
    ['📄 No. Akta',       data.noAkta],
    ['🔢 No. Pemeriksaan',data.noPmrk],
    ['📅 Tanggal Nikah',  data.tglNikah],
    ['🤵 Nama Suami',     data.namaSuami],
    ['🪪 NIK Suami',      data.nikSuami],
    ['📍 Lahir Suami',    data.ttlSuami],
    ['💼 Pekerjaan Suami',data.pekerjaanSuami],
    ['🏠 Alamat Suami',   data.alamatSuami],
    ['👰 Nama Istri',     data.namaIstri],
    ['🪪 NIK Istri',      data.nikIstri],
    ['📍 Lahir Istri',    data.ttlIstri],
    ['💼 Pekerjaan Istri',data.pekerjaanIstri],
    ['🏠 Alamat Istri',   data.alamatIstri],
    ['🕌 KUA',            data.kua],
    ['📍 Tempat Akad',    data.tempatAkad],
    ['👤 Wali Nikah',     data.namaWali],
  ];

  grid.innerHTML = fields.map(([label, val]) => `
    <div style="background:rgba(255,255,255,.03);border:1px solid rgba(255,255,255,.07);border-radius:10px;padding:10px 13px">
      <div style="font-size:9px;letter-spacing:1.5px;text-transform:uppercase;color:#6B7280;margin-bottom:4px">${label}</div>
      <div style="font-size:12.5px;color:${val ? 'var(--cream)' : 'var(--cream4)'};font-weight:${val ? '500' : '400'};font-style:${val ? 'normal' : 'italic'}">${val || '— tidak terbaca —'}</div>
    </div>
  `).join('');

  prev.style.display = 'block';
}

function applyOcrToForm() {
  if (!ocrRawData) return;
  const d = ocrRawData;

  // Isi semua field form
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.value = val || ''; };
  set('nNA',       d.noAkta);
  set('nNP',       d.noPmrk);
  set('nTgl',      d.tglNikah);
  set('nSm',       d.namaSuami);
  set('nSmNik',    d.nikSuami);
  set('nSmTtl',    d.ttlSuami);
  set('nSmPek',    d.pekerjaanSuami);
  set('nSmAlamat', d.alamatSuami);
  set('nSt',       d.namaIstri);
  set('nStNik',    d.nikIstri);
  set('nStTtl',    d.ttlIstri);
  set('nStPek',    d.pekerjaanIstri);
  set('nStAlamat', d.alamatIstri);
  set('nTmp',      d.tempatAkad);
  set('nWali',     d.namaWali);

  // Set KUA dropdown
  const kuaSel = document.getElementById('nKua');
  if (kuaSel && d.kua) {
    for (let i = 0; i < kuaSel.options.length; i++) {
      if (kuaSel.options[i].value.toLowerCase().includes(d.kua.toLowerCase()) ||
          d.kua.toLowerCase().includes(kuaSel.options[i].value.toLowerCase())) {
        kuaSel.selectedIndex = i;
        break;
      }
    }
  }

  // Simpan info file
  const prevEl = document.getElementById('nFilePreview');
  if (prevEl && d._fileName) {
    prevEl.style.display = 'block';
    prevEl.innerHTML = `📄 File: <strong>${d._fileName}</strong> (dari OCR)`;
  }

  // Pindah ke panel form
  const lbl = document.getElementById('formModeLabel');
  if (lbl) lbl.textContent = '✅ Data dari OCR — Koreksi jika perlu';

  const panelOcr  = document.getElementById('panelOcr');
  const panelForm = document.getElementById('panelForm');
  const btnSimpan = document.getElementById('btnSimpanNikah');
  const tabOcr    = document.getElementById('tabOcr');
  const tabManual = document.getElementById('tabManual');

  if (panelOcr)  panelOcr.style.display  = 'none';
  if (panelForm) panelForm.style.display = 'block';
  if (btnSimpan) btnSimpan.style.display = 'inline-flex';
  if (tabOcr)    tabOcr.style.cssText    = 'flex:1;padding:10px;border-radius:10px;border:none;cursor:pointer;font-family:\'Instrument Sans\',sans-serif;font-size:12px;font-weight:600;letter-spacing:.5px;transition:.2s;background:transparent;color:#6B7280';
  if (tabManual) tabManual.style.cssText = 'flex:1;padding:10px;border-radius:10px;border:none;cursor:pointer;font-family:\'Instrument Sans\',sans-serif;font-size:12px;font-weight:600;letter-spacing:.5px;transition:.2s;background:linear-gradient(135deg,var(--ember),var(--ember2));color:var(--ink);box-shadow:0 4px 14px rgba(184,128,42,.35)';
}

function clearOcr() {
  ocrRawData = null;
  const ocrFile = document.getElementById('ocrFile');
  if (ocrFile) ocrFile.value = '';
  const status  = document.getElementById('ocrStatus');
  const preview = document.getElementById('ocrPreview');
  if (status)  status.style.display  = 'none';
  if (preview) preview.style.display = 'none';
}

// Reset OCR saat modal nikah ditutup
function resetNikahModal() {
  clearOcr();
  switchNikahTab('ocr');
  // Reset semua field form
  ['nId','nNA','nNP','nTgl','nSm','nSmNik','nSmTtl','nSmPek','nSmAlamat',
   'nSt','nStNik','nStTtl','nStPek','nStAlamat','nTmp','nWali'].forEach(id => {
    const el = document.getElementById(id);
    if (el) el.value = '';
  });
  const fp = document.getElementById('nFilePreview');
  if (fp) fp.style.display = 'none';
}

// ══════════════════════════════════════════════════════

function openM(id){
  // Reset modal operator saat dibuka untuk tambah baru
  if(id === 'mOper' && !document.getElementById('oId').value){
    const pw = document.getElementById('oPwWrap');
    if(pw) pw.style.display = '';
    const btn = document.getElementById('btnSimpanOper');
    if(btn) btn.textContent = '💾 Simpan & Daftarkan';
    document.querySelector('#mOper .modal-head h3').textContent = '👤 TAMBAH OPERATOR BARU';
    ['oPw','oPw2'].forEach(f=>{ const el=document.getElementById(f); if(el) el.value=''; });
  }
  document.getElementById(id)?.classList.add('open');
  if (id === 'mNikah') {
    const isEdit = document.getElementById('nId')?.value;
    if (!isEdit) resetNikahModal();
    else { switchNikahTab('manual'); const lbl=document.getElementById('formModeLabel'); if(lbl)lbl.textContent='✏️ Edit Data Register Nikah'; }
  }
  if (id === 'mIjazah') {
    const isEdit = document.getElementById('iId')?.value;
    if (!isEdit) resetIjazahModal();
    else { switchIjazahTab('manual'); const lbl=document.getElementById('iFormLabel'); if(lbl)lbl.textContent='✏️ Edit Data Ijazah'; }
  }
}
function closeM(id){
  document.getElementById(id)?.classList.remove('open');
  ['nId','iId','oId'].forEach(f=>{const e=document.getElementById(f);if(e)e.value='';});
  if (id === 'mNikah') clearOcr();
  if (id === 'mIjazah') clearIjazahOcr();
}
document.querySelectorAll('.modal-overlay').forEach(m=>{m.addEventListener('click',e=>{if(e.target===m)m.classList.remove('open');});});
// Auto-check session on load
initTheme();
checkSession();

// Workers: tidak perlu warm-up ping, zero cold start


// ══════════════════════════════════════════════════════
// MODUL KEPEGAWAIAN
// ══════════════════════════════════════════════════════

// Data kepegawaian
// ═══════════════════════════════════════════════════════════════
// MODUL KEPEGAWAIAN — CRUD + Riwayat + Statistik + Role Access
// ═══════════════════════════════════════════════════════════════

if (!S.pegawai)  S.pegawai  = [];
if (!S.riwayat)  S.riwayat  = [];   // riwayat kenaikan golongan

// ─── TAB SWITCHER ───────────────────────────────────────────────
function kpSwitchTab(tab) {
  ['list','golongan','satker'].forEach(t => {
    const panel = document.getElementById('kpPanel' + t.charAt(0).toUpperCase() + t.slice(1));
    if (panel) panel.style.display = 'none';
  });
  const btn1 = document.getElementById('kpTab1');
  const btn2 = document.getElementById('kpTab2');
  const btn3 = document.getElementById('kpTab3');
  const activeStyle   = "padding:8px 18px;border-radius:9px;border:none;cursor:pointer;font-family:'Instrument Sans',sans-serif;font-size:12px;font-weight:600;background:linear-gradient(135deg,var(--leaf),var(--leaf2));color:#fff;box-shadow:0 4px 12px rgba(15,92,58,.35)";
  const inactiveStyle = "padding:8px 18px;border-radius:9px;border:none;cursor:pointer;font-family:'Instrument Sans',sans-serif;font-size:12px;font-weight:600;background:transparent;color:#6B7280";
  if (btn1) btn1.style.cssText = tab==='list'     ? activeStyle : inactiveStyle;
  if (btn2) btn2.style.cssText = tab==='golongan' ? activeStyle : inactiveStyle;
  if (btn3) btn3.style.cssText = tab==='satker'   ? activeStyle : inactiveStyle;

  const active = document.getElementById(
    tab==='list'?'kpPanelList':tab==='golongan'?'kpPanelGolongan':'kpPanelSatker'
  );
  if (active) active.style.display = '';

  if (tab==='satker')   renderKpSatker();
  if (tab==='golongan') renderRiwayat();
}

// ─── RENDER DAFTAR PEGAWAI ──────────────────────────────────────
function renderKp() {
  const q      = (document.getElementById('kpQ')?.value || '').toLowerCase();
  const fJenis  = document.getElementById('kpFJenis')?.value  || '';
  const fStatus = document.getElementById('kpFStatus')?.value || '';
  const fSatker = document.getElementById('kpFSatker')?.value || '';

  // Filter akses: kepegawaian lihat semua, satker lain hanya miliknya
  let data = S.pegawai.filter(p =>
    ['kabupaten','kepegawaian'].includes(S.role) || p.satker === S.satker
  );
  if (fJenis)  data = data.filter(p => p.jenis  === fJenis);
  if (fStatus) data = data.filter(p => p.status === fStatus);
  if (fSatker) data = data.filter(p => p.satker === fSatker);
  if (q) data = data.filter(p =>
    p.nama.toLowerCase().includes(q) ||
    (p.nip||'').includes(q) ||
    (p.jabatan||'').toLowerCase().includes(q) ||
    (p.satker||'').toLowerCase().includes(q)
  );

  // Update statistik
  updKpStat();

  const ct = document.getElementById('kpCt');
  if (ct) ct.textContent = data.length + ' data';
  document.getElementById('nbKp').textContent = S.pegawai.filter(p=>p.status==='aktif').length;

  const tb = document.getElementById('tKp');
  if (!tb) return;
  tb.innerHTML = data.length ? data.map((p, i) => `
    <tr>
      <td style="color:#6B7280">${i+1}</td>
      <td class="td-mono" style="font-size:11px">${p.nip||'-'}</td>
      <td>
        <div class="td-bold">${p.nama}</div>
        ${p.gelar?`<div style="font-size:11px;color:#6B7280">${p.gelar}</div>`:''}
      </td>
      <td style="font-size:12px">${p.jabatan||'-'}</td>
      <td><span class="badge badge-jade" style="font-family:'DM Mono',monospace">${p.golongan||'-'}</span></td>
      <td><span class="badge ${p.jenis==='PNS'?'badge-jade':p.jenis==='PPPK'?'badge-gold':''}">
        ${p.jenis||'PNS'}</span></td>
      <td style="font-size:11px;color:#374151">${p.satker||'-'}</td>
      <td><span class="badge ${p.status==='aktif'?'badge-jade':p.status==='pensiun'?'badge-gold':'badge-red'}">
        ${p.status||'aktif'}</span></td>
      <td>
        <div style="display:flex;gap:4px">
          <button class="btn btn-glass btn-sm" onclick="pvKp('${p.id}')" title="Lihat detail">👁</button>
          ${canEditKp() ? `
          <button class="btn btn-jade btn-sm" onclick="edKp('${p.id}')" title="Edit">✏</button>
          <button class="btn btn-glass btn-sm" onclick="addRiwayat('${p.id}')" title="Kenaikan Golongan">📈</button>
          <button class="btn btn-red btn-sm" onclick="dlKp('${p.id}')" title="Hapus">✕</button>` : ''}
        </div>
      </td>
    </tr>`).join('') : er(9);
}

function canEditKp() {
  return ['kabupaten','kepegawaian'].includes(S.role);
}

// ─── STATISTIK KEPEGAWAIAN ──────────────────────────────────────
function updKpStat() {
  const aktif = S.pegawai.filter(p =>
    ['kabupaten','kepegawaian'].includes(S.role) || p.satker === S.satker
  );
  const set = (id,v) => { const e=document.getElementById(id); if(e) e.textContent=v; };
  set('kpStatTotal',   aktif.length);
  set('kpStatPns',     aktif.filter(p=>p.jenis==='PNS').length);
  set('kpStatPppk',    aktif.filter(p=>p.jenis==='PPPK').length);
  set('kpStatHon',     aktif.filter(p=>p.jenis==='Honorer').length);
  set('kpStatPensiun', aktif.filter(p=>p.status==='pensiun'||p.status==='mutasi').length);
}

// ─── RENDER PER SATKER ──────────────────────────────────────────
function renderKpSatker() {
  const grid = document.getElementById('kpSatkerGrid');
  if (!grid) return;
  // Kelompokkan per satker
  const map = {};
  S.pegawai.forEach(p => {
    if (!map[p.satker]) map[p.satker] = { total:0, pns:0, pppk:0, hon:0 };
    map[p.satker].total++;
    if (p.jenis==='PNS')     map[p.satker].pns++;
    if (p.jenis==='PPPK')    map[p.satker].pppk++;
    if (p.jenis==='Honorer') map[p.satker].hon++;
  });
  const entries = Object.entries(map).sort((a,b)=>b[1].total-a[1].total);
  grid.innerHTML = entries.length ? entries.map(([sk,d]) => `
    <div style="background:var(--mode-card-bg,rgba(255,255,255,.04));border:1px solid var(--mode-border,rgba(255,255,255,.07));border-radius:14px;padding:18px 20px">
      <div style="font-size:13px;font-weight:700;color:#111827;margin-bottom:12px;line-height:1.3">${sk}</div>
      <div style="display:flex;justify-content:space-between;margin-bottom:6px">
        <span style="font-size:11px;color:#6B7280">Total</span>
        <span style="font-size:16px;font-weight:900;color:#2D9A56">${d.total}</span>
      </div>
      <div style="display:flex;gap:8px;flex-wrap:wrap">
        <span style="font-size:10px;background:rgba(34,199,122,.1);color:#2D9A56;padding:2px 8px;border-radius:10px;border:1px solid rgba(34,199,122,.2)">PNS: ${d.pns}</span>
        <span style="font-size:10px;background:rgba(184,128,42,.1);color:var(--em3);padding:2px 8px;border-radius:10px;border:1px solid rgba(184,128,42,.2)">P3K: ${d.pppk}</span>
        <span style="font-size:10px;background:rgba(120,60,180,.1);color:#c8a0ff;padding:2px 8px;border-radius:10px;border:1px solid rgba(150,80,220,.2)">Hon: ${d.hon}</span>
      </div>
      <div style="height:4px;background:rgba(255,255,255,.08);border-radius:2px;margin-top:12px;overflow:hidden">
        <div style="height:100%;width:${Math.min(100,d.pns/Math.max(1,d.total)*100)}%;background:var(--leaf3);border-radius:2px"></div>
      </div>
    </div>`).join('') : `<div style="color:#6B7280;font-size:13px;padding:20px">Belum ada data pegawai.</div>`;
}

// ─── RIWAYAT GOLONGAN ───────────────────────────────────────────
function renderRiwayat() {
  const tb = document.getElementById('tRiwayat');
  if (!tb) return;
  // Filter berdasarkan pegawai di satker masing-masing
  const pegawaiIds = S.pegawai
    .filter(p => ['kabupaten','kepegawaian'].includes(S.role) || p.satker===S.satker)
    .map(p => p.id);
  const data = S.riwayat.filter(r => pegawaiIds.includes(r.pegawaiId))
    .sort((a,b)=>b.tmt.localeCompare(a.tmt));
  tb.innerHTML = data.length ? data.map(r => {
    const peg = S.pegawai.find(p => p.id===r.pegawaiId);
    return `<tr>
      <td class="td-bold">${peg?.nama||'-'}</td>
      <td class="td-mono" style="font-size:11px">${peg?.nip||'-'}</td>
      <td><span class="badge" style="background:rgba(255,255,255,.07);color:#374151">${r.dari||'-'}</span></td>
      <td><span class="badge badge-jade">${r.ke||'-'}</span></td>
      <td>${fmt(r.tmt)}</td>
      <td class="td-mono" style="font-size:11px">${r.noSk||'-'}</td>
      <td style="font-size:12px;color:#6B7280">${r.keterangan||'-'}</td>
      <td><button class="btn btn-red btn-sm" onclick="dlRiwayat('${r.id}')">✕</button></td>
    </tr>`;
  }).join('') : er(8);
}

// shortcut tambah riwayat dari tombol di tabel pegawai
function addRiwayat(pegawaiId) {
  const p = S.pegawai.find(x=>x.id===pegawaiId);
  if (!p) return;
  // Pre-select pegawai & golongan saat ini
  setTimeout(()=>{
    const sel = document.getElementById('rwPegawai');
    if (sel) sel.value = pegawaiId;
    const dari = document.getElementById('rwDari');
    if (dari && p.golongan) dari.value = p.golongan;
  }, 100);
  openM('mRiwayat');
}

async function saveRiwayat() {
  const pegId = document.getElementById('rwPegawai').value;
  const ke    = document.getElementById('rwKe').value;
  const tmt   = document.getElementById('rwTmt').value;
  if (!pegId) { alert('Pilih pegawai'); return; }
  if (!ke)    { alert('Pilih golongan baru'); return; }
  if (!tmt)   { alert('Isi TMT'); return; }

  const row = {
    id:        document.getElementById('rwId').value || 'RW' + Date.now(),
    pegawaiId: pegId,
    dari:      document.getElementById('rwDari').value,
    ke,
    tmt,
    noSk:      document.getElementById('rwNoSk').value,
    keterangan:document.getElementById('rwKet').value,
  };

  // Update golongan pegawai juga
  const px = S.pegawai.findIndex(p=>p.id===pegId);
  if (px>=0) S.pegawai[px].golongan = ke;

  try {
    await api('POST', '/pegawai', { // simpan via endpoint khusus jika ada, atau gunakan update golongan
      ...S.pegawai.find(p=>p.id===pegId), golongan: ke
    });
  } catch(e) { console.warn('saveRiwayat:', e.message); }
  // Simpan lokal dulu
  S.riwayat.unshift(row);
  // Update golongan di state lokal
  const px = S.pegawai.findIndex(p=>p.id===pegId);
  if(px>=0) S.pegawai[px].golongan = ke;
  renderRiwayat(); renderKp();
  closeM('mRiwayat');
  showToast('✅ Riwayat golongan disimpan');
}

async function dlRiwayat(id) {
  if (!confirm('Hapus riwayat ini?')) return;
  S.riwayat = S.riwayat.filter(r=>r.id!==id);
  renderRiwayat();
}

// ─── SAVE / EDIT / DELETE PEGAWAI ───────────────────────────────
async function saveKp() {
  const id    = document.getElementById('kpId').value;
  const nip   = document.getElementById('kpNip').value.trim();
  const nama  = document.getElementById('kpNama').value.trim();
  const jabat = document.getElementById('kpJab').value.trim();
  const sk    = document.getElementById('kpSk').value;
  if (!nama)  { alert('Nama pegawai wajib diisi'); return; }
  if (!jabat) { alert('Jabatan wajib diisi'); return; }
  if (!sk)    { alert('Satuan kerja wajib dipilih'); return; }

  const fileInput = document.getElementById('kpFile');
  let fileUrl = null;
  if (fileInput?.files?.[0]) {
    fileUrl = await uploadFile(fileInput.files[0], 'kepegawaian/' + sk.replace(/\s+/g,'_'));
  }

  const row = {
    id:         id || 'KP' + Date.now(),
    nip, nama,
    gelar:      document.getElementById('kpGelar').value,
    ttl:        document.getElementById('kpTtl').value,
    tglLahir:   document.getElementById('kpTgl').value,
    jk:         document.getElementById('kpJk').value,
    jabatan:    jabat,
    satker:     sk,
    golongan:   document.getElementById('kpGol').value,
    tmtGol:     document.getElementById('kpTmtGol').value,
    eselon:     document.getElementById('kpEs').value,
    tmtJab:     document.getElementById('kpTmtJab').value,
    jenis:      document.getElementById('kpJns').value,
    pendidikan: document.getElementById('kpPend').value,
    prodi:      document.getElementById('kpProdi').value,
    hp:         document.getElementById('kpHp').value,
    email:      document.getElementById('kpEmail').value,
    status:     document.getElementById('kpStatus').value,
    catatan:    document.getElementById('kpCatatan').value,
    fileUrl,
    hash: await mkH(nip + nama + jabat),
  };

  const dbRow = {
    nip: row.nip, nama: row.nama, gelar: row.gelar,
    tgl_lahir: row.tglLahir||null, ttl: row.ttl, jk: row.jk,
    jabatan: row.jabatan, satker: row.satker, golongan: row.golongan,
    tmt_golongan: row.tmtGol||null, eselon: row.eselon,
    tmt_jabatan:  row.tmtJab||null, jenis: row.jenis,
    pendidikan: row.pendidikan, prodi: row.prodi,
    hp: row.hp, email: row.email, status: row.status,
    catatan: row.catatan, file_url: row.fileUrl, hash: row.hash
  };
  try {
    if (id) { await api('PUT', `/pegawai/${id}`, dbRow); }
    else     { await api('POST', '/pegawai', dbRow); }
    await loadPegawai();
    closeM('mKepeg');
  } catch(e) { alert('Gagal simpan: '+e.message); }
}

function edKp(id) {
  const p = S.pegawai.find(x=>x.id===id); if(!p) return;
  const set = (k,v) => { const e=document.getElementById(k); if(e) e.value=v||''; };
  set('kpId',p.id); set('kpNip',p.nip); set('kpNama',p.nama); set('kpGelar',p.gelar);
  set('kpTtl',p.ttl); set('kpTgl',p.tglLahir); set('kpJk',p.jk);
  set('kpJab',p.jabatan); set('kpSk',p.satker); set('kpGol',p.golongan);
  set('kpTmtGol',p.tmtGol); set('kpEs',p.eselon); set('kpTmtJab',p.tmtJab);
  set('kpJns',p.jenis); set('kpPend',p.pendidikan); set('kpProdi',p.prodi);
  set('kpHp',p.hp); set('kpEmail',p.email); set('kpStatus',p.status);
  set('kpCatatan',p.catatan);
  openM('mKepeg');
}

async function dlKp(id) {
  if (!confirm('Hapus data pegawai ini? Riwayat golongannya ikut terhapus.')) return;
  try {
    await api('DELETE', `/pegawai/${id}`);
    await loadPegawai();
  } catch(e) { alert('Gagal hapus: '+e.message); }
}

// ─── PREVIEW SK PEGAWAI ─────────────────────────────────────────
function pvKp(id) {
  const p = S.pegawai.find(x=>x.id===id); if(!p) return;
  const url = location.origin + location.pathname + '#verify/' + p.hash;
  const rwPeg = S.riwayat.filter(r=>r.pegawaiId===p.id).sort((a,b)=>b.tmt.localeCompare(a.tmt));
  document.getElementById('pvT').textContent = '👔 Data Pegawai — ' + p.nama;
  document.getElementById('pvB').innerHTML = `<div class="doc-preview" id="pArea" style="position:relative">
    <div class="doc-verified-stamp" style="position:absolute;top:16px;right:16px;width:80px;height:80px;border-radius:50%;border:3px solid #0d5c3a;display:flex;align-items:center;justify-content:center;text-align:center;font-size:7.5px;font-weight:700;color:#0d5c3a;letter-spacing:1px;text-transform:uppercase;transform:rotate(-15deg);opacity:.65;line-height:1.3;padding:8px">DOKUMEN<br>TERVERIFIKASI<br>SIPADI</div>
    <div class="doc-header">
      <div style="width:65px;height:65px;display:flex;align-items:center;justify-content:center;flex-shrink:0">
        <svg viewBox="0 0 65 65" xmlns="http://www.w3.org/2000/svg" width="65" height="65">
          <defs><linearGradient id="lgd3" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="#1a6b3c"/><stop offset="100%" stop-color="#0a3d20"/></linearGradient></defs>
          <circle cx="32" cy="32" r="30" fill="url(#lgd3)" stroke="#c8922a" stroke-width="1.5"/>
          <text x="32" y="44" text-anchor="middle" font-family="Playfair Display,Georgia,serif" font-size="30" font-weight="900" fill="#f5c842">A</text>
        </svg>
      </div>
      <div class="doc-header-text">
        <div class="dept">Republik Indonesia — Kementerian Agama</div>
        <h1>DATA KEPEGAWAIAN</h1>
        <div class="subtitle">Kemenag Kab. Jember — ${p.satker}</div>
      </div>
      <div class="doc-qr"><div id="dqrKp"></div><p style="font-size:9px;color:#aaa;margin-top:4px;font-family:'DM Mono',monospace">${(p.hash||'').slice(0,16)}</p></div>
    </div>
    <div class="doc-section">Identitas Pegawai</div>
    <div class="doc-row"><span class="k">Nama Lengkap</span><span class="v">${p.nama}${p.gelar?' '+p.gelar:''}</span></div>
    <div class="doc-row"><span class="k">NIP</span><span class="v" style="font-family:'DM Mono',monospace">${p.nip||'-'}</span></div>
    <div class="doc-row"><span class="k">Tempat / Tgl Lahir</span><span class="v">${p.ttl||'-'}${p.tglLahir?', '+fmt(p.tglLahir):''}</span></div>
    <div class="doc-row"><span class="k">Jenis Kelamin</span><span class="v">${p.jk==='L'?'Laki-laki':'Perempuan'}</span></div>
    <div class="doc-section">Jabatan &amp; Kepangkatan</div>
    <div class="doc-row"><span class="k">Jabatan</span><span class="v">${p.jabatan||'-'}</span></div>
    <div class="doc-row"><span class="k">Satuan Kerja</span><span class="v">${p.satker||'-'}</span></div>
    <div class="doc-row"><span class="k">Golongan / Ruang</span><span class="v">${p.golongan||'-'}</span></div>
    <div class="doc-row"><span class="k">Eselon</span><span class="v">${p.eselon||'-'}</span></div>
    <div class="doc-row"><span class="k">Jenis Pegawai</span><span class="v">${p.jenis||'PNS'}</span></div>
    <div class="doc-row"><span class="k">Status</span><span class="v">${p.status||'aktif'}</span></div>
    ${rwPeg.length ? `<div class="doc-section">Riwayat Kenaikan Golongan</div>
    <table style="width:100%;border-collapse:collapse;font-size:11px;margin-bottom:12px">
      <thead><tr style="background:#f0faf5"><th style="padding:6px 10px;text-align:left;color:#555;border-bottom:1px solid #c8e6d0">Dari</th><th style="padding:6px 10px;text-align:left;color:#555;border-bottom:1px solid #c8e6d0">Ke</th><th style="padding:6px 10px;text-align:left;color:#555;border-bottom:1px solid #c8e6d0">TMT</th><th style="padding:6px 10px;text-align:left;color:#555;border-bottom:1px solid #c8e6d0">No. SK</th></tr></thead>
      <tbody>${rwPeg.map(r=>`<tr><td style="padding:5px 10px;border-bottom:1px solid #e8f5f0;color:#555">${r.dari||'-'}</td><td style="padding:5px 10px;border-bottom:1px solid #e8f5f0;font-weight:700;color:#1a6b3c">${r.ke}</td><td style="padding:5px 10px;border-bottom:1px solid #e8f5f0;color:#555">${fmt(r.tmt)}</td><td style="padding:5px 10px;border-bottom:1px solid #e8f5f0;color:#888">${r.noSk||'-'}</td></tr>`).join('')}</tbody>
    </table>` : ''}
    <div class="doc-hash">🔐 Hash: <strong style="font-family:'DM Mono',monospace;font-size:10px">${p.hash||'-'}</strong>
      <a href="${url}" style="color:#1a6b3c;margin-left:8px;font-size:10px" target="_blank">🔗 Verifikasi Online</a>
    </div>
  </div>`;
  openM('mPrev');
  setTimeout(()=>{
    const el=document.getElementById('dqrKp');
    if(el&&window.QRCode){el.innerHTML='';new QRCode(el,{text:url,width:70,height:70,colorDark:'#0d5c3a',colorLight:'#ffffff'});}
  }, 250);
}

// loadPegawai sudah didefinisikan di bagian atas (Workers API)

// ─── INISIALISASI DATA DEMO ──────────────────────────────────────
function initKepegawaian() {
  if (!S.pegawai)  S.pegawai  = [];
  if (!S.riwayat)  S.riwayat  = [];
  S.pegawai = [
    {id:'KP1',nip:'197802142006041001',nama:'Drs. H. Ahmad Syukri',gelar:'M.Ag',ttl:'Jember',tglLahir:'1978-02-14',jk:'L',jabatan:'Kepala KUA',satker:'KUA Kecamatan Ajung',golongan:'IVa',tmtGol:'2020-04-01',eselon:'IV/a',tmtJab:'2019-01-15',jenis:'PNS',pendidikan:'S2',prodi:'Hukum Islam',hp:'081234560001',email:'ahmad.syukri@kemenag.go.id',status:'aktif',hash:'sha256:demo-kp1'},
    {id:'KP2',nip:'198503212010012002',nama:'Hj. Siti Fatimah',gelar:'S.Ag',ttl:'Bondowoso',tglLahir:'1985-03-21',jk:'P',jabatan:'Penghulu Muda',satker:'KUA Kecamatan Sumbersari',golongan:'IIIb',tmtGol:'2022-04-01',eselon:'Non Eselon',tmtJab:'2021-06-01',jenis:'PNS',pendidikan:'S1',prodi:'Ahwal Syakhsiyyah',hp:'081234560002',email:'siti.fatimah@kemenag.go.id',status:'aktif',hash:'sha256:demo-kp2'},
    {id:'KP3',nip:'199001152015031003',nama:'Muhammad Ilham Saputra',gelar:'S.Pd',ttl:'Jember',tglLahir:'1990-01-15',jk:'L',jabatan:'Guru PAI',satker:'MAN 1 Jember',golongan:'IIIa',tmtGol:'2021-04-01',eselon:'Non Eselon',tmtJab:'2020-07-01',jenis:'PNS',pendidikan:'S1',prodi:'Pendidikan Agama Islam',hp:'081234560003',email:'m.ilham@kemenag.go.id',status:'aktif',hash:'sha256:demo-kp3'},
    {id:'KP4',nip:'',nama:'Rizki Ramadhan',gelar:'',ttl:'Jember',tglLahir:'1995-07-10',jk:'L',jabatan:'Staf Tata Usaha',satker:'KUA Kecamatan Kalisat',golongan:'',tmtGol:'',eselon:'Non Eselon',tmtJab:'2022-01-01',jenis:'Honorer',pendidikan:'S1',prodi:'Administrasi Publik',hp:'081234560004',email:'',status:'aktif',hash:'sha256:demo-kp4'},
    {id:'KP5',nip:'198012102008011004',nama:'H. Bambang Setiawan',gelar:'M.Pd',ttl:'Lumajang',tglLahir:'1980-12-10',jk:'L',jabatan:'Kepala Madrasah',satker:'MTsN 1 Jember',golongan:'IVb',tmtGol:'2023-04-01',eselon:'IV/a',tmtJab:'2022-03-01',jenis:'PNS',pendidikan:'S2',prodi:'Manajemen Pendidikan',hp:'081234560005',email:'bambang@kemenag.go.id',status:'aktif',hash:'sha256:demo-kp5'},
    {id:'KP6',nip:'197505202001121005',nama:'Dra. Hj. Nurul Hidayah',gelar:'',ttl:'Jember',tglLahir:'1975-05-20',jk:'P',jabatan:'Guru Senior',satker:'MAN 2 Jember',golongan:'IVc',tmtGol:'2022-04-01',eselon:'Non Eselon',tmtJab:'2010-01-01',jenis:'PNS',pendidikan:'S1',prodi:'Bahasa Arab',hp:'081234560006',email:'nurul.hidayah@kemenag.go.id',status:'pensiun',hash:'sha256:demo-kp6'},
    {id:'KP7',nip:'199505152019031007',nama:'Ahmad Ridwan Fauzi',gelar:'S.Ag',ttl:'Probolinggo',tglLahir:'1995-05-15',jk:'L',jabatan:'Penghulu',satker:'KUA Kecamatan Mumbulsari',golongan:'IIIa',tmtGol:'2022-04-01',eselon:'Non Eselon',tmtJab:'2021-01-01',jenis:'PPPK',pendidikan:'S1',prodi:'Hukum Keluarga Islam',hp:'081234560007',email:'a.ridwan@kemenag.go.id',status:'aktif',hash:'sha256:demo-kp7'},
  ];
  S.riwayat = [
    {id:'RW1',pegawaiId:'KP1',dari:'IIId',ke:'IVa',tmt:'2020-04-01',noSk:'SK/Kep-123/2020',keterangan:'Kenaikan Pangkat Reguler'},
    {id:'RW2',pegawaiId:'KP2',dari:'IIIa',ke:'IIIb',tmt:'2022-04-01',noSk:'SK/Kep-456/2022',keterangan:'Kenaikan Pangkat Reguler'},
    {id:'RW3',pegawaiId:'KP5',dari:'IVa',ke:'IVb',tmt:'2023-04-01',noSk:'SK/Kep-789/2023',keterangan:'Kenaikan Pangkat Pilihan'},
  ];
  // Populate dropdown rwPegawai
  const sel = document.getElementById('rwPegawai');
  if (sel) {
    sel.innerHTML = '<option value="">— Pilih Pegawai —</option>' +
      S.pegawai.map(p=>`<option value="${p.id}">${p.nama}${p.nip?' ('+p.nip+')':''}</option>`).join('');
  }
  // Populate filter satker kepegawaian
  const kpFs = document.getElementById('kpFSatker');
  if (kpFs) {
    const satkers = [...new Set(S.pegawai.map(p=>p.satker))].sort();
    kpFs.innerHTML = '<option value="">Semua Satker</option>' +
      satkers.map(s=>`<option value="${s}">${s}</option>`).join('');
    // Tampilkan filter satker hanya untuk admin/kepegawaian
    if (['kabupaten','kepegawaian'].includes(S.role)) kpFs.style.display='';
  }
  updKpStat();
  renderKp();
}

// ═══════════ PASSWORD TOGGLE ═══════════
function togglePw(){
  const inp = document.getElementById('pw');
  const icon = document.getElementById('eyeIcon');
  if(!inp) return;
  const show = inp.type === 'password';
  inp.type = show ? 'text' : 'password';
  // Ganti ikon: mata terbuka vs mata tertutup (coretan)
  icon.innerHTML = show
    ? '<path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/>'
    : '<path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/>';
}

// ═══════════ THEME TOGGLE ═══════════
function showToast(msg, type='success'){
  // Hapus toast lama jika ada
  const old = document.getElementById('aToast');
  if(old) old.remove();
  const t = document.createElement('div');
  t.id = 'aToast';
  const bg = type==='success' ? '#2D7A4F' : type==='error' ? '#8B2020' : type==='warn' ? '#B8860B' : '#1E50B4';
  t.style.cssText = `position:fixed;bottom:24px;right:24px;z-index:99999;
    background:${bg};color:#fff;padding:12px 20px;border-radius:12px;
    font-family:'Instrument Sans',sans-serif;font-size:14px;font-weight:600;
    box-shadow:0 8px 32px rgba(0,0,0,.2);display:flex;align-items:center;gap:10px;
    animation:slideInToast .3s ease;max-width:320px;`;
  t.innerHTML = msg;
  // Tambah CSS animasi jika belum ada
  if(!document.getElementById('toastStyle')){
    const st = document.createElement('style');
    st.id = 'toastStyle';
    st.textContent = '@keyframes slideInToast{from{transform:translateX(120%);opacity:0}to{transform:translateX(0);opacity:1}}';
    document.head.appendChild(st);
  }
  document.body.appendChild(t);
  setTimeout(()=>{ t.style.animation='slideInToast .3s ease reverse'; setTimeout(()=>t.remove(), 300); }, 3000);
}

function toggleTheme(){ /* light only */ }
function initTheme(){
  document.documentElement.classList.add('light');
  const btn = document.getElementById('themeBtn');
  if(btn){ btn.textContent='☀️'; btn.title='Light mode'; }
}
(function(){ document.documentElement.classList.add('light'); })();


// ── Expose semua fungsi ke global window (fix untuk Vercel) ──
// ══ FORCE GLOBAL REGISTRATION ══
// Assign all functions to window explicitly, no typeof guard
setTimeout(function() {
  var fns = [
    'addRiwayat','applyIjazahOcr','applyOcrToForm','clearIjazahOcr','clearOcr',
    'closeM','dlI','dlKp','dlN','dlO','dlRiwayat','doLogin','doLogout','doPrint',
    'downloadWatermarked','downloadWatermarkedI','edI','edKp','edN','edO','editSk',
    'exportAll','exportCSV','exportJSON','fI','fN','fO','gTab',
    'handleIjazahDrop','handleIjazahFile','handleOcrDrop','handleOcrFile',
    'impScan','kpSwitchTab','loadAuditLog','nav','openM','procF',
    'pvI','pvKp','pvN','renderKp','saveI','saveKp','saveN','saveO','saveSk',
    'scT','stT','switchIjazahTab','switchNikahTab','togglePw','verD'
  ];
  fns.forEach(function(name) {
    try {
      var fn = eval(name);
      if (typeof fn === 'function') window[name] = fn;
    } catch(e) {}
  });
}, 0);
