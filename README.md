# Mini Task Manager

Aplikasi untuk membuat task, memindahkan status `to_do → pending → in_progress → done`, dan melihat siapa mengubah status apa dan kapan.

- Frontend: React + TypeScript (Vite, TanStack Query)
- Backend: Node.js + Express + TypeScript
- Database: SQLite (`better-sqlite3`)
- Kontrak API: zod schema di `shared/`, dipakai backend dan frontend

Semua yang diminta brief ada: create, ubah status sesuai urutan, delete, list, audit log per task yang tidak bisa diubah, update idempotent, dan validasi alur di backend. Di atas itu saya menambah empat hal. Keempatnya memperkuat audit log dan konsistensi data, dua hal yang paling ditekankan brief:

| Tambahan                              | Masalah yang ditutup                                                                                                                                            |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Activity feed (`GET /api/audit-logs`) | Brief menyebut "tidak jelas siapa mengubah apa". Riwayat per task hanya menjawab itu untuk satu task. Feed menampilkan semua perubahan, bisa difilter per user. |
| Proteksi klik basi (`expectedStatus`) | Dua user membuka halaman yang sama dan klik tombol yang sama. User kedua diberi tahu siapa yang sudah memindahkan task, dan UI-nya ikut sinkron.                |
| Hash chain di audit log               | Trigger database menolak edit lewat SQLite, tapi tidak menahan orang yang mengedit file `.db` langsung. Hash chain membuat edit seperti itu terdeteksi.         |
| Docker + CI                           | Reviewer cukup menjalankan `docker compose up`. CI menjalankan format, lint, typecheck, test, build, dan smoke test image di setiap push.                       |

## Cara menjalankan

### Docker

```bash
docker compose up --build
```

Buka http://localhost:3001. Satu container melayani API dan UI. Data disimpan di volume `data`.

### Mode development

Butuh Node.js 20+.

```bash
npm install            # install shared, backend, frontend

npm run dev:backend    # API di http://localhost:3001, data di backend/data/app.db
npm run dev:frontend   # UI di http://localhost:5173, /api diteruskan ke backend

npm run check          # format, lint, typecheck, semua test (dijalankan juga oleh CI)
npm run build          # bundle backend (esbuild) dan build frontend (vite)
```

Backend dan frontend dijalankan di dua terminal. Untuk reset data, hapus folder `backend/data/`.

## Arsitektur

```
shared/src/index.ts          kontrak API: zod schema, tipe turunan, alur status, daftar user

backend/src/
  domain/
    statusPolicy.ts          aturan perubahan status (fungsi murni, tanpa I/O)
    auditChain.ts            hitung dan verifikasi hash chain (fungsi murni)
    errors.ts                error domain bertipe, tanpa status HTTP
  db/
    migrations.ts            migrasi berurutan, versi disimpan di PRAGMA user_version
    connection.ts            buka SQLite, set pragma, jalankan migrasi
  repositories/              SQL saja, prepared statement dibuat sekali
  services/taskService.ts    use case: transaksi, keputusan domain, tulis audit log
  http/app.ts                route, parsing input dengan schema, mapping error ke HTTP
  server.ts                  baca env (divalidasi), start server, shutdown rapi

frontend/src/
  api/client.ts              fetch + validasi setiap respons dengan schema dari shared
  api/hooks.ts               query dan mutation TanStack Query
  views/                     TasksView, ActivityView
  components/                AppShell, TaskRow, HistoryPanel, LogEntry, CreateTaskDialog
  lib/                       format waktu, label status, ikon
```

Arah dependensi di backend satu arah: `http → services → domain + repositories → db`. Domain tidak tahu soal HTTP atau SQL, jadi aturan status bisa dites tanpa database dan dibaca dalam satu file pendek. Hanya `http/app.ts` yang memutuskan status code.

### Kontrak frontend dan backend

Semua tipe request dan respons diturunkan dari zod schema di `shared`. Backend mem-parse setiap body, query, param, dan header `X-Actor` dengan schema itu. Frontend mem-parse setiap respons dengan schema yang sama, jadi kalau backend berubah tanpa menyesuaikan kontrak, frontend gagal dengan pesan jelas dan tidak menampilkan data yang salah. TypeScript menangkap perbedaan saat compile, schema menangkapnya saat runtime.

### UI

Desain mengikuti Human Interface Guidelines Apple:

- Font sistem (SF Pro di perangkat Apple, Inter di tempat lain) dengan peran tipografi HIG: Large Title, Headline, Body, Footnote.
- Warna semantik Apple (label, secondary label, fill, separator, grouped background) dengan nilai terang dan gelap. Status memakai warna sistem: abu-abu, oranye, biru, hijau. Elemen interaktif memakai satu token `--tint`.
- Pola Apple: sidebar translucent seperti macOS, tile status seperti smart list di Reminders, daftar inset grouped seperti Settings, sheet iOS (Cancel, judul, Add), alert, dan HUD toast.
- Appearance bisa Auto (ikut sistem), Light, atau Dark. Desain menghormati setelan reduced transparency, increased contrast, dan reduced motion.

Aturan bisnis terlihat di layar:

- Tile status menampilkan jumlah task per tahap dalam urutan alur. Klik satu tile untuk memfilter daftar.
- Ada dua tampilan: list dan board. Di board, saat sebuah kartu ditarik, hanya kolom status berikutnya yang menerima kartu itu. Kolom lain ditandai "Not allowed", dan drop di sana tidak melakukan apa-apa. Backend tetap menolak kalau aturan dilanggar lewat jalur lain.
- Setiap baris hanya menawarkan satu aksi: pindah ke status berikutnya. Task `done` menampilkan "Completed". Tombol riwayat dan hapus muncul saat kursor atau fokus keyboard ada di baris, dan selalu terlihat di layar sentuh.
- Riwayat dimulai dari titik "Created as To do", lalu setiap perubahan dengan avatar actor, transisi dari → ke, kalimat sesuai contoh di brief, dan hash entri.
- Halaman Activity mengelompokkan perubahan per hari, menampilkan status integritas hash chain, dan grafik siapa memindahkan task ke status apa.

Riwayat dibuka sebagai inspector. Di layar lebar (≥ 1280 px) inspector tidak modal dan menggeser konten ke kiri, jadi klik task lain langsung mengganti isinya. Di layar lebih kecil inspector menjadi sheet modal, dan di HP muncul dari bawah. Semua dialog memakai elemen `<dialog>` bawaan browser, jadi fokus terkunci di dalam dialog, Escape menutupnya, dan fokus kembali ke tombol yang membukanya. Shortcut: `N` untuk task baru, `/` untuk mencari. Tampilan dicek di lebar 1440, 1100, dan 390 px, mode terang dan gelap, tanpa scroll horizontal.

Data server dikelola TanStack Query. Daftar task, riwayat, dan activity feed di-refresh tiap 10 detik selama tab terbuka. Setiap query punya key sendiri per task dan filter, jadi respons lambat untuk task A tidak bisa muncul di panel task B. Ada test untuk kasus ini.

### API

Request ubah status mengirim actor lewat header `X-Actor` (`john.doe`, `jane.smith`, atau `budi.santoso`). Saya pakai header karena actor adalah identitas pemanggil, sama seperti token auth nanti. Kalau auth ditambahkan, header ini diganti user dari session dan body request tetap sama.

| Method | Path                        | Body / query                  | Hasil                                           |
| ------ | --------------------------- | ----------------------------- | ----------------------------------------------- |
| GET    | `/api/tasks`                | -                             | `Task[]`, tanpa task yang sudah dihapus         |
| POST   | `/api/tasks`                | `{ title, description? }`     | `201 Task`, status awal `to_do`                 |
| PUT    | `/api/tasks/:id/status`     | `{ status, expectedStatus? }` | `200 { task, changed, lastChange }`             |
| DELETE | `/api/tasks/:id`            | -                             | `204`                                           |
| GET    | `/api/tasks/:id/audit-logs` | -                             | `AuditLog[]` satu task, urut dari yang terlama  |
| GET    | `/api/audit-logs`           | `?actor=&taskId=`             | `AuditLog[]` semua task, urut dari yang terlama |
| GET    | `/api/audit-logs/verify`    | -                             | `{ valid, checked, headHash, brokenAt? }`       |
| GET    | `/api/health`               | -                             | `{ ok: true }`, dipakai healthcheck Docker      |

`lastChange` adalah log yang menghasilkan status task saat ini. Kalau `changed: false`, client bisa melihat siapa yang sudah mengubahnya.

Format error: `{ "error": { "code": "...", "message": "...", "details"?: {...} } }`.

| Kasus                                                      | Status | Code                 | `details`                                |
| ---------------------------------------------------------- | ------ | -------------------- | ---------------------------------------- |
| Input tidak valid (body, query, param, header, JSON rusak) | 400    | `INVALID_REQUEST`    | `issues: [{ path, message }]`            |
| Task tidak ada atau sudah dihapus                          | 404    | `TASK_NOT_FOUND`     |                                          |
| Lompat tahap atau mundur                                   | 409    | `INVALID_TRANSITION` |                                          |
| `expectedStatus` beda dengan status sekarang               | 409    | `STALE_STATUS`       | `task` terbaru dan `lastChange`          |
| Status sama dengan status sekarang                         | 200    | -                    | respons `changed: false`, tanpa log baru |

### Model data

```
tasks       id, title, description, status, created_at, updated_at, deleted_at
audit_logs  id, task_id → tasks.id, task_title, actor,
            from_status, to_status, created_at, prev_hash, hash
```

Satu baris log menjawab empat pertanyaan di brief: task mana (`task_id`, `task_title`), siapa (`actor`), dari status apa ke status apa (`from_status`, `to_status`), dan kapan (`created_at`, UTC ISO 8601).

`hash` adalah SHA-256 dari `prev_hash` ditambah isi baris itu. `prev_hash` adalah `hash` baris sebelumnya, dari task mana pun. Baris pertama memakai 64 karakter `0`.

Skema dibuat lewat migrasi berurutan di `db/migrations.ts`. Versi yang sudah jalan disimpan di `PRAGMA user_version`, setiap migrasi jalan dalam transaksinya sendiri, dan migrasi yang sudah dirilis tidak pernah diubah. Server menolak start kalau file database lebih baru dari kodenya, atau dibuat sebelum ada migrasi.

## Asumsi

- Status hanya boleh maju satu tahap: `to_do → pending → in_progress → done`. Lompat tahap dan mundur ditolak, dan `done` adalah status akhir. Kalau nanti butuh fitur "buka ulang task", saya tambahkan sebagai transisi baru.
- Task baru selalu mulai dari `to_do`. Client tidak bisa memilih status awal.
- Update ke status yang sama mengembalikan `200` dengan `changed: false`. Client yang retry setelah timeout tetap dapat respons sukses, dan log tidak dobel.
- Hanya perubahan status yang dicatat di audit log, sesuai brief. Create dan delete tidak menulis log.
- Delete berupa soft delete. Audit log merujuk ke task, jadi baris task tetap disimpan dengan `deleted_at` terisi. Task yang dihapus tidak muncul di daftar dan tidak bisa diubah, tapi riwayatnya tetap ada di activity feed dan di `GET /tasks/:id/audit-logs`.
- Log menyimpan salinan title saat kejadian. Title belum bisa diedit sekarang, tapi kalau fitur edit ditambahkan, log lama tetap menampilkan title lama.
- Field task: `id`, `title`, `description`, `status`, `createdAt`, `updatedAt`. `title` wajib diisi (maks 200 karakter), `description` opsional (maks 2000) dan disimpan sebagai string kosong kalau tidak dikirim.
- Daftar actor di-hardcode, dan backend menolak nama di luar daftar. Client masih bisa mengaku sebagai user lain. Saya terima risiko ini karena brief meminta tanpa auth.
- Urutan log memakai `id` (autoincrement), tidak memakai timestamp, supaya dua kejadian di milidetik yang sama tetap urut. Activity feed juga urut dari yang terlama, mengikuti brief.

## Trade-off

- SQLite dibanding file JSON atau memory. Dengan file JSON, saya harus menulis sendiri logika agar update task dan insert log terjadi bersamaan, juga mekanisme agar log tidak bisa diubah. SQLite sudah punya transaksi dan trigger, dan tetap berupa satu file tanpa server database. Konsekuensinya ada satu dependency native.
- Layer tanpa ORM. Repository berisi SQL dan prepared statement, service berisi transaksi, domain berisi aturan. Untuk dua tabel, ORM menambah konsep tanpa mengurangi kode yang berarti, sedangkan pemisahan layer membuat aturan status bisa dites tanpa database.
- zod untuk kontrak. Satu dependency untuk validasi input di backend, validasi respons di frontend, dan tipe di keduanya. Alternatifnya tipe TypeScript saja, yang hilang saat runtime.
- TanStack Query untuk data server. Versi sebelumnya memakai `useEffect` + `fetch` manual, dan punya bug: respons lambat untuk task lama bisa menimpa riwayat task yang baru dipilih. Library ini menyelesaikan race itu lewat query key, plus polling, pembatalan request, dan invalidasi cache setelah mutation. Biayanya satu dependency dan konsep baru untuk developer yang belum kenal.
- `expectedStatus` tidak mengubah hasil akhir data. Karena alurnya linear, request basi akan ditolak sebagai `INVALID_TRANSITION` atau menjadi no-op. Yang ditambahkan `expectedStatus` adalah penjelasan yang benar untuk user ("jane.smith sudah memindahkan task ini") dan data task terbaru supaya UI sinkron. Kalau nanti alurnya bercabang, cek ini menjadi syarat kebenaran data.
- Hash chain global, tidak per task. Satu rantai lebih sederhana untuk diverifikasi, dan penghapusan baris di tengah langsung ketahuan. Setiap insert membaca hash terakhir di dalam transaksi tulis yang sama. SQLite memang menulis satu per satu, jadi ini tidak menambah antrean. Verifikasi membaca baris satu per satu lewat iterator, tidak memuat seluruh tabel ke memori, tapi tetap O(n).
- Polling 10 detik dibanding WebSocket atau SSE. Polling cukup satu opsi di query dan tidak butuh koneksi yang harus dijaga. Jeda sampai 10 detik ditutup oleh cek `expectedStatus`.
- Bundle backend dengan esbuild. Hasilnya satu file `dist/server.cjs`. Image runtime hanya berisi file itu, build frontend, dan driver SQLite native, tanpa dev dependency, dan jalan sebagai user `node` dengan healthcheck.

## Kalau ada waktu lebih

- Menyimpan hash terakhir di luar database secara berkala. Tanpa itu, orang yang menulis ulang seluruh rantai dari awal tidak terdeteksi (lihat jawaban pertanyaan pertama).
- Test end-to-end di browser (Playwright) di CI. Sekarang screenshot dicek manual.
- Pagination untuk task dan activity feed.
- Menampilkan task yang sudah dihapus di UI.
- SSE untuk update realtime, menggantikan polling.

## Pertanyaan

### Bagaimana kamu memastikan audit log tidak ter-modifikasi?

1. Tidak ada endpoint untuk mengubah atau menghapus log. `auditLogRepository` hanya punya `append` dan fungsi baca. `append` menolak dipanggil di luar transaksi, supaya log tidak bisa tertulis tanpa perubahan status yang menyertainya.
2. Trigger SQLite `BEFORE UPDATE` dan `BEFORE DELETE` pada `audit_logs` membatalkan query dengan pesan `audit_logs is append-only`. Trigger ini tetap berlaku kalau ada bug di kode atau seseorang menjalankan SQL manual lewat `sqlite3`. Ada test yang menjalankan `UPDATE` dan `DELETE` langsung ke tabel dan memastikan keduanya gagal.
3. Foreign key aktif, jadi task yang sudah punya log tidak bisa dihapus permanen. Delete hanya mengisi `deleted_at`.
4. Setiap baris menyimpan hash baris sebelumnya. Orang yang punya akses ke file bisa menghapus trigger lalu mengedit atau menghapus baris, tapi `GET /api/audit-logs/verify` akan menunjukkan baris pertama yang rusak. Halaman Activity menampilkan hasil verifikasi ini. Test unit dan test API mengedit, menghapus, dan menukar urutan baris, lalu memastikan verifikasi gagal di baris yang tepat.

Update status dan insert log ada di satu transaksi. Kalau salah satunya gagal, SQLite membatalkan keduanya, sehingga status task dan log selalu sesuai.

Batasnya: orang yang punya akses ke file bisa menghitung ulang seluruh rantai dari baris pertama, dan hasilnya tetap valid. Untuk mendeteksi itu, hash terakhir harus disimpan di tempat yang tidak bisa diakses orang tersebut. UI menampilkan hash terakhir supaya bisa dicatat, tapi penyimpanan otomatis ke luar belum saya buat.

### Bagian mana dari solusi ini yang paling berisiko jika digunakan oleh banyak user?

Risiko terbesar ada di identitas actor, karena header `X-Actor` diterima tanpa verifikasi. Dengan banyak user, siapa pun bisa mencatat perubahan atas nama orang lain. Hash chain menjamin log tidak diubah setelah ditulis, tapi tidak menjamin isi `actor` benar saat ditulis. Auth akan menutup celah ini.

Risiko kedua adalah perubahan status yang bersamaan. Perubahan status berjalan dalam empat langkah: baca status sekarang, putuskan, update, tulis log. Kalau dua request membaca status yang sama sebelum salah satunya menulis, keduanya bisa lolos validasi. Di aplikasi ini hal itu tidak terjadi karena `better-sqlite3` synchronous dan transaksi memakai `BEGIN IMMEDIATE`, yang mengunci database sebelum membaca. Hash chain juga bergantung pada kunci ini, karena dua insert yang membaca hash terakhir yang sama akan memecah rantai. Jaminan ini hanya berlaku untuk satu file SQLite. Kalau pindah ke Postgres dengan beberapa instance API, saya perlu `SELECT ... FOR UPDATE` pada task dan pada baris log terakhir.

Yang tersisa adalah kapasitas: SQLite hanya mengizinkan satu penulisan dalam satu waktu, verifikasi membaca seluruh log, dan activity feed belum punya pagination. Untuk tim internal ini cukup, untuk traffic besar tidak.

### Jika task ini berkembang menjadi sistem besar, bagian mana yang akan kamu refactor terlebih dahulu dan kenapa?

Pencatatan audit log.

Sekarang `taskService.changeStatus` memanggil `auditLogs.append` secara eksplisit di dalam transaksinya. Repository sudah menolak `append` di luar transaksi, tapi tidak bisa memaksa developer memanggilnya. Kalau task bertambah fitur seperti assignee, due date, dan komentar, setiap operasi baru harus ingat menulis log. Kalau ada yang lupa, perubahan itu tidak tercatat dan tidak ada error yang muncul.

Saya akan mengubah setiap perubahan state menjadi domain event, misalnya `TaskStatusChanged { taskId, from, to, actor }`. Fungsi domain mengembalikan event, dan satu unit of work menyimpan perubahan data beserta event dan hash-nya dalam satu transaksi. Operasi tanpa event tidak punya jalan untuk menulis ke database, jadi log tidak bisa terlewat. Activity feed dan notifikasi membaca event yang sama.

Bersamaan dengan itu, `nextStatus()` yang sekarang berupa daftar linear akan saya ubah jadi tabel transisi, supaya jenis task lain bisa punya alur status sendiri. `decideStatusChange` sudah terpisah sebagai fungsi murni dengan test untuk semua kombinasi, jadi perubahan ini terbatas di satu file. Saat itu `expectedStatus` menjadi wajib, karena dengan alur bercabang request basi bisa lolos validasi.

Setelah itu saya akan menambah auth, karena kolom actor di log baru bisa dipercaya kalau identitas user diverifikasi server.

### Jika kamu menggunakan AI, jelaskan bagian mana yang dibantu AI dan bagaimana kamu memvalidasinya.

Saya memakai Claude lewat Claude Code. AI menulis sebagian besar kode dan draf README ini: struktur workspace, skema dan migrasi SQLite, hash chain, layer backend, test, komponen dan tampilan frontend, Docker dan CI, serta jawaban pertanyaan di atas.

Saya memilih SQLite, memberi referensi desain UI, memilih fitur tambahan dari usulan AI, dan meminta review ulang kode dengan standar staff engineer. Review itu menemukan masalah yang lalu diperbaiki: tidak ada migrasi skema, race condition saat mengambil riwayat, aturan domain tercampur dengan SQL, error domain membawa status HTTP, dan validasi input tanpa schema. Keputusan desain lain diusulkan AI lalu saya review dan setujui: menolak lompat tahap dan mundur, update ke status yang sama sebagai no-op `200`, dan soft delete.

Validasi yang sudah dijalankan:

- `npm run check` menjalankan format check, ESLint (termasuk aturan React hooks), typecheck ketiga package, dan 65 test:
  - Backend unit: semua 16 kombinasi status di `decideStatusChange` plus kasus `expectedStatus`; hash chain mendeteksi baris yang diedit, dihapus, atau ditukar; migrasi berjalan sekali, rollback saat gagal, dan menolak database yang tidak dikenal.
  - Backend API: alur status lengkap, penolakan lompat tahap dan mundur tanpa menulis log, idempotensi, urutan log, log tetap ada setelah task dihapus, trigger menolak `UPDATE`/`DELETE`, `STALE_STATUS`, filter activity feed, format error dan path setiap field yang tidak valid.
  - Frontend: client menolak respons yang tidak sesuai kontrak, klik basi menampilkan pesan dan menyinkronkan baris, task `done` tidak punya tombol lanjut, dan respons lambat tidak menimpa riwayat task lain, dan board hanya menerima drop di kolom status berikutnya.
- Kedua server dijalankan, lalu request dikirim lewat proxy frontend dengan `curl`.
- Tampilan dicek dengan screenshot Playwright di lebar 1440, 1024, dan 390 px, termasuk alur saat user lain sudah memindahkan task lebih dulu.
- Image Docker di-build dan dijalankan: status healthy, berjalan sebagai user `node`, berhenti bersih dalam 1 detik, dan data tetap ada setelah container di-restart.
