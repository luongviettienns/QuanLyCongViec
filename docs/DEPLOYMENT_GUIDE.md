# Deploy demo TaskFlow

Render Blueprint tạo một Web Service chạy cả giao diện React và API NestJS, cùng một PostgreSQL riêng cho demo. Render tự tạo khóa ứng dụng, nối cơ sở dữ liệu và chạy Prisma migration khi khởi động.

## Deploy từ GitHub

1. Đảm bảo nhánh `main` trên GitHub đã có cấu hình demo trong `render.yaml`. Nếu bạn vừa cập nhật cấu hình ở máy, commit và push nhánh đó trước.
2. Mở [Deploy to Render](https://render.com/deploy?repo=https://github.com/luongviettienns/QuanLyCongViec/tree/main), đăng nhập Render và xác nhận tạo Blueprint. Kiểm tra Web Service `taskflow-demo` và PostgreSQL `taskflow-db` đều ở gói **Free**.
3. Khi Web Service báo **Live**, mở URL `onrender.com` của dịch vụ. Bạn có thể mở thêm đường dẫn `/health` trên cùng domain để kiểm tra API trả về `"status":"ok"`.
4. Đăng ký tài khoản thử, đăng nhập và tạo một công việc mẫu. Gửi URL gốc cho senior để họ tự đăng ký. Dùng dữ liệu giả lập trong đợt demo.

Để cập nhật demo sau khi push bản mới, vào Web Service trên Render và chọn **Manual Deploy → Deploy latest commit**.

Web Service Free có thể cần khoảng một phút để khởi động lại sau 15 phút không có truy cập. PostgreSQL Free hết hạn sau 30 ngày kể từ khi tạo. [Giới hạn gói Free của Render](https://render.com/docs/free).

## Chạy trên máy riêng bằng Docker Compose

Từ thư mục gốc, chạy `docker compose up -d --build` rồi mở `http://localhost`. Dùng `docker compose logs -f` để xem log.
