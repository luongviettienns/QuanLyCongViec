# Tiến Độ Dự Án (Project Progress)

## Tổng Quan Kiến Trúc & Tình Trạng
- **Monorepo:** `apps/backend` (NestJS + Prisma + PostgreSQL), `apps/frontend` (React + Vite + Ant Design), `packages/shared`.
- **Nhánh phát triển chính:** `develop`.
- **Trạng thái CI/Verification:** Backend E2E Test (88/88 passed), Frontend Lint (0 errors), Build toàn bộ monorepo (PASS).

---

## Nhật Ký Các Phase & Đầu Việc

### Phase 1: Tối ưu & Khắc phục Backend Core (P0 & P1)
- [x] **P0 - Phân quyền Reorder**: Ngăn chặn vượt quyền khi reorder không đổi status bằng việc kiểm tra quyền `canReorder()` trong `TaskWorkflowService`.
- [x] **P1 - Ma trận State Transition**: Đảm bảo Assignee không thể chuyển trực tiếp từ `TODO` sang `DONE` (phải qua `IN_PROGRESS`).
- [x] **P1 - Bắt buộc lý do Return Task**: Bắt buộc `reason` trong `ReturnTaskDto` và loại bỏ lý do tự sinh mặc định.
- [x] **P1 - Thống nhất luồng cập nhật nghiệp vụ**: Không cho phép thay đổi `status`, `teamId`, `assigneeId` qua `PUT /tasks/:id`.
- [x] **P1 - Unique Task Title**: Thêm unique index chống trùng tiêu đề theo phạm vi nhóm hoặc cá nhân ở cấp cơ sở dữ liệu PostgreSQL.
- [x] Cập nhật E2E test suite backend (88/88 test cases passed).
- [x] Merge nhánh `feat/refactor-tasks-service` vào `develop`.

### Phase 2: Frontend Architecture Refactoring
- [x] Tái cấu trúc theo Feature-based Architecture (`features/auth`, `features/tasks`, `features/categories`, `features/teams`, `features/dashboard`, `app/layouts`).
- [x] Tách biệt rõ ràng UI Components, Hooks, API services và Domain Types.
- [x] Khắc phục các cảnh báo Ant Design v6 (`Drawer.size`, `Statistic.styles.content`, `Space.orientation`, `Modal.destroyOnHidden`).
- [x] Merge nhánh `refactor/frontend-structure` vào `develop`.

### Phase 3: Hoàn thiện Trải nghiệm Xác thực (Auth UX Fixes)
- [x] **Sửa lỗi thông báo sai khi Đăng xuất (Logout UX)**:
  - Loại bỏ lệnh gọi nhầm `onReload()` khi click Đăng xuất trong `AppLayout.tsx` (nguyên nhân kích hoạt các API `/tasks`, `/categories`, `/teams` sau khi token đã bị xoá, dẫn đến 401 Unauthorized).
  - Bổ sung cơ chế nhận diện `markManualLogout()` trong `auth.api.ts` để chặn `notifyUnauthorized` hiển thị sai *"Phiên đăng nhập đã hết hạn, vui lòng đăng nhập lại"* khi người dùng chủ động đăng xuất.
  - Tự động hủy thông báo phiên hết hạn (`message.destroy('session-expired')`) và hiển thị thông báo đăng xuất thành công (`message.success('Đăng xuất thành công')`).
  - Kiểm thử lint & build toàn bộ frontend và monorepo thành công.
