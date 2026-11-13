# Hướng Dẫn Triển Khai (Deployment Guide) — TaskFlow

Tài liệu này hướng dẫn chi tiết cách triển khai toàn bộ hệ thống **TaskFlow (QuanLyCongViec)** lên môi trường Production hoàn toàn miễn phí hoặc chi phí tối ưu nhất theo mô hình:
- **Backend (NestJS API)** & **Database (PostgreSQL)**: Triển khai trên **Render.com** (hoặc Railway / Supabase).
- **Frontend (React 19 + Vite)**: Triển khai trên **Vercel** (Global CDN, tốc độ cao, miễn phí).
- **Tuỳ chọn VPS / Server riêng**: Triển khai trọn gói bằng **Docker Compose** chỉ với 1 câu lệnh.

---

## Phần 1: Triển Khai Backend & PostgreSQL Lên Render

### Cách 1: Tự động 100% bằng Render Blueprint (Khuyên dùng)
Dự án đã có sẵn file cấu hình `render.yaml` ở thư mục gốc. Render sẽ tự động tạo PostgreSQL Database và NestJS Web Service được liên kết sẵn với nhau.

1. Đăng ký/Đăng nhập vào [Render.com](https://render.com/).
2. Nhấn vào **New +** ở thanh điều hướng trên cùng → Chọn **Blueprint**.
3. Kết nối tài khoản GitHub và chọn kho lưu trữ `QuanLyCongViec` (chọn nhánh `develop` hoặc `main`).
4. Render sẽ tự động đọc file `render.yaml` và hiển thị 2 dịch vụ sẽ được tạo:
   - **taskflow-db**: Cơ sở dữ liệu PostgreSQL (Tự sinh chuỗi kết nối `DATABASE_URL`).
   - **taskflow-backend**: Web Service chạy Node.js (Tự động chạy Prisma migration và khởi động server).
5. Nhấn **Apply**.
6. Render sẽ tự động tạo database và deploy backend. Sau khi deploy hoàn tất, bạn sẽ nhận được đường link backend dạng:
   ```text
   https://taskflow-backend-xxxx.onrender.com
   ```
7. Bạn có thể kiểm tra sức khỏe backend bằng cách mở trình duyệt truy cập:
   ```text
   https://taskflow-backend-xxxx.onrender.com/health
   ```
   Nếu trả về `{"status":"ok"}` là Backend đã sẵn sàng!

---

### Cách 2: Tạo thủ công từng dịch vụ trên Render (Nếu không dùng Blueprint)

Nếu bạn muốn tạo từng dịch vụ bằng tay:

#### Bước 1.1: Tạo PostgreSQL Database
1. Trên Render Dashboard, nhấn **New +** → Chọn **PostgreSQL**.
2. Đặt tên: `taskflow-db`, Database: `taskflow`, User: `taskflow_user`.
3. Chọn Plan **Free**. Nhấn **Create Database**.
4. Chờ database chuyển sang trạng thái `Available`, sao chép dòng **Internal Database URL** (hoặc **External Database URL**).

#### Bước 1.2: Tạo Web Service Backend
1. Nhấn **New +** → Chọn **Web Service**.
2. Chọn repo `QuanLyCongViec` (nhánh `develop` hoặc `main`).
3. Cấu hình các thông số:
   - **Name**: `taskflow-backend`
   - **Region**: Singapore (hoặc Oregon)
   - **Branch**: `develop` (hoặc `main`)
   - **Runtime**: `Node`
   - **Build Command**:
     ```bash
     npm ci && npx prisma generate --schema=apps/backend/prisma/schema.prisma && npm run build:shared && npm run build:backend && npx prisma migrate deploy --schema=apps/backend/prisma/schema.prisma
     ```
   - **Start Command**:
     ```bash
     node apps/backend/dist/main.js
     ```
4. Cuộn xuống phần **Environment Variables**, thêm các biến sau:
   - `NODE_ENV` = `production`
   - `PORT` = `3000`
   - `DATABASE_URL` = *(Dán URL database đã copy ở Bước 1.1)*
   - `JWT_SECRET` = *(Chuỗi ngẫu nhiên bảo mật trên 32 ký tự, ví dụ: `d9823fha98fhu23hf9823hf98awef89`)*
   - `JWT_EXPIRATION` = `7d`
   - `INTERNAL_API_KEY` = *(Chuỗi ngẫu nhiên làm secret cho cronjob và worker nội bộ)*
   - `CORS_ORIGINS` = `*` *(Hoặc URL frontend Vercel của bạn)*
5. Nhấn **Create Web Service** và chờ Render hoàn tất build.

---

## Phần 2: Triển Khai Frontend Lên Vercel

1. Đăng ký/Đăng nhập vào [Vercel](https://vercel.com/).
2. Nhấn **Add New...** → Chọn **Project**.
3. Tìm và chọn repository `QuanLyCongViec` từ GitHub → Nhấn **Import**.
4. Cấu hình Project trên Vercel:
   - **Framework Preset**: Chọn `Vite`.
   - **Root Directory**: Giữ nguyên `./` (Dự án đã có sẵn `vercel.json` ở thư mục gốc hỗ trợ monorepo npm workspaces).
   - **Build and Output Settings**:
     - *Build Command*: `npm run build:shared && npm run build:frontend`
     - *Output Directory*: `apps/frontend/dist`
     - *Install Command*: `npm install`
5. Mở rộng mục **Environment Variables** và thêm biến sau:
   - **Key**: `VITE_API_BASE_URL`
   - **Value**: URL backend Render của bạn (Ví dụ: `https://taskflow-backend-xxxx.onrender.com`)
6. Nhấn **Deploy**.
7. Sau 1-2 phút, Vercel sẽ cung cấp cho bạn một domain trực tiếp (Ví dụ: `https://quanlycongviec.vercel.app`).

---

## Phần 3: Kiểm Tra Hoạt Động & Hoàn Tất

1. Mở trang web Vercel trên trình duyệt.
2. Đăng ký tài khoản quản trị viên / thành viên đầu tiên.
3. Thử nghiệm các tính năng chính:
   - Tạo công việc mới (Task), tạo danh mục (Category).
   - Mở màn hình **Lịch** (Calendar) để xem các chế độ Tháng, Tuần, Ngày, Lịch biểu.
   - Thử kéo thả đổi hạn chót (Drag & Drop deadline shift).
   - Mở 2 tab trình duyệt cùng lúc để kiểm tra tính năng đồng bộ thời gian thực (**Realtime SSE**).
4. *(Tùy chọn bảo mật)*: Sau khi có domain Vercel, bạn có thể quay lại Render Backend, sửa biến môi trường `CORS_ORIGINS` từ `*` thành domain Vercel cụ thể (Ví dụ: `https://quanlycongviec.vercel.app`) để bảo mật tuyệt đối.

---

## Phần 4: Triển Khai Tự Host Bằng Docker Compose (VPS / Server riêng)

Nếu bạn có máy chủ riêng (Ubuntu/Debian) hoặc muốn chạy thử trên máy local:

```bash
# 1. Clone repository
git clone https://github.com/luongviettienns/QuanLyCongViec.git
cd QuanLyCongViec

# 2. Khởi chạy toàn bộ hệ thống (PostgreSQL + Backend NestJS + Frontend Nginx)
docker compose up -d --build

# 3. Xem nhật ký hoạt động
docker compose logs -f
```

Hệ thống sẽ tự động chạy tại:
- **Frontend**: `http://localhost` (Port 80)
- **Backend API**: `http://localhost:3000/api` (Port 3000)
- **Database**: PostgreSQL chạy trên port 5432
