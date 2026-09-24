# TÀI LIỆU ĐẶC TẢ GIAO DIỆN LẬP TRÌNH ỨNG DỤNG (API SPECIFICATION)
## DỰ ÁN: STUĐIÔ AI — BACKEND RESTFUL SERVICES V1
**Base URL**: `http://localhost:8000/api/v1` (Môi trường Dev) / `https://studio-ai.edu.vn/api/v1` (Production)  
**Chuẩn dữ liệu**: `JSON over HTTP` | `UTF-8`  
**Chuẩn xác thực**: `OAuth2 Bearer Token (JWT)` qua header `Authorization: Bearer <access_token>`  
**Ngày cập nhật**: 24/09/2026  

---

## 1. QUY ƯỚC CHUNG & MÃ TRẠNG THÁI HTTP (HTTP STATUS CODES)

| Mã trạng thái (Status Code) | Ý nghĩa nghiệp vụ |
| :--- | :--- |
| `200 OK` | Yêu cầu xử lý thành công, trả về dữ liệu. |
| `201 Created` | Tạo mới tài nguyên thành công (Task, FocusSession, Event, Note). |
| `400 Bad Request` | Tham số hoặc dữ liệu gửi lên không hợp lệ (giờ kết thúc trước giờ bắt đầu, mật khẩu quá ngắn...). |
| `401 Unauthorized` | Thiếu token, token hết hạn hoặc chữ ký JWT không hợp lệ. |
| `403 Forbidden` | Tài khoản không có quyền truy cập vào tài nguyên của người khác. |
| `404 Not Found` | Không tìm thấy tài nguyên tương ứng trong database. |
| `422 Unprocessable Entity` | Dữ liệu không thỏa mãn Pydantic Schema validation. |
| `500 Internal Server Error`| Lỗi nội bộ phía máy chủ. |

---

## 2. NHÓM ENDPOINT XÁC THỰC & NGƯỜI DÙNG (`/api/v1/auth`)

### 2.1. Đăng ký tài khoản mới
* **Endpoint**: `POST /auth/register`
* **Quyền truy cập**: Public (Không yêu cầu Token)
* **Request Body**:
  ```json
  {
    "email": "sinhvien@vnu.edu.vn",
    "password": "Password123@",
    "full_name": "Nguyễn Văn A",
    "university": "ĐHQG TP.HCM",
    "major": "Khoa học Máy tính",
    "student_id": "21120001"
  }
  ```
* **Response (HTTP 201 Created)**:
  ```json
  {
    "access_token": "eyJhbGciOi...",
    "refresh_token": "eyJhbGciOi...",
    "token_type": "bearer",
    "user": {
      "id": "uuid-v4-string",
      "email": "sinhvien@vnu.edu.vn",
      "full_name": "Nguyễn Văn A",
      "university": "ĐHQG TP.HCM",
      "major": "Khoa học Máy tính",
      "is_onboarded": false
    }
  }
  ```

### 2.2. Đăng nhập hệ thống
* **Endpoint**: `POST /auth/login`
* **Quyền truy cập**: Public
* **Request Body**:
  ```json
  {
    "email": "sinhvien@vnu.edu.vn",
    "password": "Password123@"
  }
  ```
* **Response (HTTP 200 OK)**: Cung cấp cặp Token và thông tin User Profile tương tự như trên.

### 2.3. Làm mới Access Token (Silent 401 Refresh)
* **Endpoint**: `POST /auth/refresh`
* **Request Body**:
  ```json
  {
    "refresh_token": "eyJhbGciOi..."
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "access_token": "eyJhbGciOi_new_token...",
    "token_type": "bearer"
  }
  ```

### 2.4. Đổi mật khẩu tài khoản bảo mật
* **Endpoint**: `POST /auth/change-password`
* **Quyền truy cập**: Yêu cầu Bearer Token
* **Request Body**:
  ```json
  {
    "old_password": "Password123@",
    "new_password": "NewSecretPassword2026!"
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Đổi mật khẩu thành công. Vui lòng sử dụng mật khẩu mới cho các lần đăng nhập tiếp theo."
  }
  ```

### 2.5. Gửi hoặc gửi lại mã OTP (3rd-Party Provider: Resend / SMTP / Console)
* **Endpoint**: `POST /auth/send-otp` hoặc `POST /auth/resend-otp`
* **Quyền truy cập**: Public (Rate limit: 10 lần / 10 phút, cooldown 60s)
* **Request Body**:
  ```json
  {
    "email": "sinhvien@vnu.edu.vn"
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "status": "success",
    "provider": "resend_api",
    "message": "Đã gửi mã xác minh 6 số đến sinhvien@vnu.edu.vn (qua resend_api)."
  }
  ```

### 2.6. Quên mật khẩu & Tạo OTP khôi phục
* **Endpoint**: `POST /auth/forgot`
* **Request Body**:
  ```json
  {
    "email": "sinhvien@vnu.edu.vn"
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "status": "success",
    "provider": "resend_api",
    "message": "Đã gửi mã xác minh 6 số đến sinhvien@vnu.edu.vn (hiệu lực 10 phút)."
  }
  ```

---

## 3. NHÓM ENDPOINT NHỊP SINH HỌC & ONBOARDING (`/api/v1/onboarding` & `/api/v1/circadian`)

### 3.1. Hoàn tất khảo sát Chronotype Onboarding
* **Endpoint**: `POST /onboarding/complete`
* **Quyền truy cập**: Yêu cầu Bearer Token
* **Request Body**:
  ```json
  {
    "chronotype": "owl",
    "sleep_time": "00:30",
    "wake_time": "08:00",
    "target_daily_focus_hours": 6.0,
    "study_level": "university"
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "status": "success",
    "chronotype": "owl",
    "message": "Chào mừng Cú Đêm! Stuđiô AI đã cá nhân hóa khung giờ vàng 20:30 - 23:30 cho bạn."
  }
  ```

### 3.2. Lấy mức xung năng lượng sinh học thời gian thực
* **Endpoint**: `GET /circadian/pulse`
* **Caching**: In-Memory TTL = 120s
* **Response (HTTP 200 OK)**:
  ```json
  {
    "pulse_percent": 94,
    "state": "peak_alpha",
    "state_label": "Đỉnh Alpha Não Bộ (10Hz)",
    "is_golden_hour": true,
    "golden_hour_range": "16:00 - 18:30 & 20:30 - 23:30",
    "chronotype": "owl",
    "recommendation": "Khung giờ vàng tối ưu nhất trong ngày để làm đồ án nặng và bài tập lớn."
  }
  ```

---

## 4. NHÓM ENDPOINT QUẢN LÝ NHIỆM VỤ & AI BẺ KHÓA (`/api/v1/tasks`)

### 4.1. AI Bẻ khóa Nhiệm vụ (AI Task Deconstruct - Bước 1 Preview)
* **Endpoint**: `POST /tasks/ai-decompose`
* **Mô tả**: Gọi Google Gemini AI bẻ khóa bài tập thành các micro-sprints 25 phút. Database chưa bị ghi dữ liệu.
* **Request Body**:
  ```json
  {
    "title": "Báo cáo Machine Learning: Phân loại ảnh ResNet-50",
    "description": "Nộp báo cáo định dạng chuẩn IEEE, tập dữ liệu CIFAR-10",
    "subject": "Trí tuệ nhân tạo (CS301)",
    "complexity": "complex"
  }
  ```
* **Response (HTTP 200 OK)**:
  ```json
  {
    "task_title": "Báo cáo Machine Learning ResNet-50",
    "summary_advice": "Tập trung tiền xử lý dữ liệu và vẽ ma trận nhầm lẫn rõ ràng.",
    "subject_name": "Trí tuệ nhân tạo",
    "subject_code": "CS301",
    "priority": "high",
    "complexity": "complex",
    "subtasks": [
      {
        "title": "Tiền xử lý Data CIFAR-10 & Augmentation",
        "estimated_minutes": 25,
        "pomodoro_count": 1,
        "recommended_circadian_window": "Khung giờ vàng tối (20:30 - 23:30)"
      },
      {
        "title": "Huấn luyện mô hình & Trích xuất Confusion Matrix",
        "estimated_minutes": 25,
        "pomodoro_count": 1,
        "recommended_circadian_window": "Khung giờ vàng tối (20:30 - 23:30)"
      },
      {
        "title": "Biên soạn báo cáo theo chuẩn IEEE Conference",
        "estimated_minutes": 25,
        "pomodoro_count": 1,
        "recommended_circadian_window": "Khung giờ vàng tối (20:30 - 23:30)"
      }
    ]
  }
  ```

### 4.2. Lưu nhiệm vụ chính thức (Bước 2 Commit)
* **Endpoint**: `POST /tasks/`
* **Request Body**:
  ```json
  {
    "title": "Báo cáo Machine Learning ResNet-50",
    "description": "Nộp báo cáo chuẩn IEEE",
    "subject_name": "Trí tuệ nhân tạo",
    "subject_code": "CS301",
    "priority": "high",
    "complexity": "complex",
    "deadline": "2026-09-30T23:59:00",
    "subtasks": [
      { "title": "Bước 1: Tiền xử lý Data", "estimated_minutes": 25, "pomodoro_count": 1 },
      { "title": "Bước 2: Train mô hình", "estimated_minutes": 25, "pomodoro_count": 1 },
      { "title": "Bước 3: Viết báo cáo", "estimated_minutes": 25, "pomodoro_count": 1 }
    ]
  }
  ```
* **Response (HTTP 201 Created)**: Trả về thực thể `Task` kèm danh sách `MicroSubtask` đã lưu.

### 4.3. Đánh dấu hoàn thành / mở lại Task (Cascade Toggle)
* **Endpoint**: `PATCH /tasks/{task_id}`
* **Request Body**:
  ```json
  {
    "status": "completed"
  }
  ```
* **Xử lý ngầm**: Khi chuyển sang `completed`, toàn bộ subtasks con tự động chuyển `is_completed = true`. Khi chuyển về `in_progress`, toàn bộ subtasks con được mở lại.

### 4.4. Thêm Micro-Sprint trực tiếp vào Task có sẵn
* **Endpoint**: `POST /tasks/{task_id}/subtasks`
* **Request Body**:
  ```json
  {
    "title": "Đọc tài liệu tham khảo bài báo số 4",
    "estimated_minutes": 25,
    "pomodoro_count": 1
  }
  ```
* **Response (HTTP 200 OK)**: Trả về danh sách subtasks mới nhất đã cập nhật `order_index` liên tục.

### 4.5. Xóa nhiệm vụ an toàn khóa ngoại
* **Endpoint**: `DELETE /tasks/{task_id}`
* **Xử lý ngầm**: Gỡ liên kết `task_id = NULL` tại các bảng `schedule_events` và `focus_sessions` trước khi xóa task, bảo vệ toàn vẹn dữ liệu thống kê.

---

## 5. NHÓM ENDPOINT LỊCH TRÌNH & CÂN BẰNG TỰ ĐỘNG (`/api/v1/schedule`)

### 5.1. Lấy danh sách sự kiện lịch trình (Timeline)
* **Endpoint**: `GET /schedule/timeline`
* **Query Params**: `date_from` (YYYY-MM-DD), `date_to` (YYYY-MM-DD)
* **Caching**: In-Memory TTL = 30s
* **Response**: Mảng danh sách các sự kiện được sắp xếp tăng dần theo ngày và giờ bắt đầu.

### 5.2. Thuật toán AI Tự động Cân bằng Lịch (Auto-Balance)
* **Endpoint**: `POST /schedule/auto-balance`
* **Request Body**: `{}`
* **Response (HTTP 200 OK)**:
  ```json
  {
    "status": "success",
    "message": "Thuật toán AI đã tự động tối ưu và sắp xếp 3 phiên học sâu vào khung giờ vàng (owl).",
    "events_count": 12,
    "balanced_count": 3
  }
  ```

### 5.3. Đồng bộ Bài tập từ Hệ thống Trường (LMS Sync)
* **Endpoint**: `POST /schedule/lms-sync`
* **Request Body**:
  ```json
  {
    "provider": "canvas",
    "include_timeline": true
  }
  ```
* **Response (HTTP 200 OK)**: Tự động nhập danh mục môn học kỳ hiện tại và xếp lịch học sâu vào khung giờ vàng đầu tiên của người dùng.

---

## 6. NHÓM ENDPOINT HỌC SÂU & BẤM GIỜ POMODORO (`/api/v1/focus`)

### 6.1. Ghi nhận phiên tập trung Deep Work
* **Endpoint**: `POST /focus/record`
* **Request Body**:
  ```json
  {
    "task_id": "uuid-task-optional",
    "target_minutes": 25,
    "actual_minutes": 25,
    "distractions_count": 1,
    "ambient_sound_used": true,
    "complete_next_subtask": true
  }
  ```
* **Response (HTTP 201 Created)**:
  ```json
  {
    "status": "success",
    "session_id": "uuid-session",
    "actual_minutes": 25,
    "completed_subtask": "Tiền xử lý Data CIFAR-10",
    "message": "Đã ghi nhận 25 phút học sâu và hoàn thành micro-sprint tiếp theo!"
  }
  ```

---

## 7. NHÓM ENDPOINT CỐ VẤN HỌC THUẬT RAG (`/api/v1/advisor`)

### 7.1. Tải lên tài liệu giáo trình / Rubric
* **Endpoint**: `POST /advisor/upload`
* **Content-Type**: `multipart/form-data`
* **Form Data**: `file` (File binary: `.pdf`, `.docx`, `.tex`, `.txt`, `.md` tối đa 25MB)
* **Response (HTTP 200 OK)**:
  ```json
  {
    "status": "success",
    "filename": "Giao_Trinh_Triet_Hoc_MLN.pdf",
    "size_kb": 1420,
    "message": "Đã nạp tài liệu thành công vào bộ nhớ học thuật AI."
  }
  ```

### 7.2. Đổi tên phiên thảo luận (Inline Session Rename)
* **Endpoint**: `PATCH /advisor/sessions/{session_id}`
* **Request Body**:
  ```json
  {
    "title": "Phân tích đồ án ResNet-50 và ma trận nhầm lẫn"
  }
  ```
* **Response (HTTP 200 OK)**: Trả về phiên thảo luận đã cập nhật tiêu đề mới.

---

## 8. NHÓM ENDPOINT PHÂN TÍCH & CHỨNG CHỈ SỐ (`/api/v1/analytics`)

### 8.1. Bảng điều khiển phân tích học tập (Analytics Dashboard)
* **Endpoint**: `GET /analytics/dashboard?range=week`
* **Caching**: In-Memory TTL = 60s
* **Response (HTTP 200 OK)**:
  ```json
  {
    "range": "week",
    "weekly_focus_hours": [2.5, 3.0, 1.5, 4.0, 2.0, 3.5, 1.0],
    "week_days": ["Thứ 2", "Thứ 3", "Thứ 4", "Thứ 5", "Thứ 6", "Thứ 7", "Chủ Nhật"],
    "total_week_hours": 17.5,
    "circadian_alignment_score": 88,
    "task_completion_rate": 75,
    "current_streak_days": 5,
    "zen_efficiency_index": 82,
    "burnout_risk": "Cực kỳ thấp (Vùng an toàn)"
  }
  ```

### 8.2. Cấp chứng nhận kỷ luật học thuật mã hóa SHA-256
* **Endpoint**: `GET /analytics/certificate`
* **Response (HTTP 200 OK)**:
  ```json
  {
    "status": "verified",
    "certificate_id": "STU-CERT-2026-A1B2C3D4",
    "title": "CHỨNG NHẬN KỶ LUẬT HỌC TẬP & DEEP WORK",
    "student": {
      "full_name": "Nguyễn Văn A",
      "student_id": "21120001",
      "university": "ĐHQG TP.HCM",
      "major": "Khoa học Máy tính"
    },
    "metrics": {
      "total_hours": 24.5,
      "total_sessions": 28,
      "streak_days": 7,
      "circadian_score": 92
    },
    "verification_hash": "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    "verification_url": "https://studio-ai.edu.vn/verify-cert?id=STU-CERT-2026-A1B2C3D4&hash=e3b0c442...",
    "qr_payload": "STU-AI:CERT:STU-CERT-2026-A1B2C3D4|Nguyễn Văn A|24.5h|7d|e3b0c44298fc"
  }
  ```

---
*Bản đặc tả API này là tài liệu chuẩn hóa duy nhất của hệ thống Stuđiô AI phiên bản v1, phục vụ công tác kiểm thử và nghiệm thu Outcome 1.*
