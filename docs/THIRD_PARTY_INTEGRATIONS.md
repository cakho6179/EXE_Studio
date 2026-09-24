# TÀI LIỆU ĐẶC TẢ TÍCH HỢP BÊN THỨ 3 TOÀN HỆ THỐNG
## DỰ ÁN: STUĐIÔ AI — 3RD-PARTY INTEGRATION ARCHITECTURE
**Môn học**: EXE201 — Khởi nghiệp và Đổi mới sáng tạo  
**Ngày phát hành**: 24/09/2026  

---

## 1. TỔNG QUAN KIẾN TRÚC TÍCH HỢP BÊN THỨ 3 (INTEGRATION ECOSYSTEM)

Hệ thống **Stuđiô AI** kết nối với 7 nhóm dịch vụ bên thứ ba (3rd-Party Services) nhằm tự động hóa tối đa trải nghiệm người dùng, bảo mật và phục vụ kiểm chứng kinh doanh môn học EXE201:

```mermaid
flowchart TB
    subgraph Core [HỆ THỐNG CỐT LÕI STUĐIÔ AI]
        FE["React 19 SPA (Client)"]
        BE["FastAPI REST Engine (Server)"]
    end

    subgraph AI_Layer [1. TRÍ TUỆ NHÂN TẠO (AI/LLM)]
        Gemini["Google Gemini 1.5/2.0 Flash API\n(Task Deconstructor & RAG Advisor)"]
    end

    subgraph Auth_Layer [2. DANH TÍNH & XÁC THỰC]
        GoogleAuth["Google Identity OAuth2\n(1-Click Student Login)"]
        Resend["Resend Cloud REST API / SMTP\n(OTP Email Verification)"]
    end

    subgraph LMS_Layer [3. HỆ THỐNG HỌC TẬP ĐẠI HỌC (LMS)]
        Canvas["Canvas LMS REST API\n(Deadlines & Syllabus Sync)"]
        GoogleClass["Google Classroom API\n(Coursework Sync)"]
    end

    subgraph Payment_Layer [4. THANH TOÁN TỰ ĐỘNG (MONETIZATION)]
        VietQR["VietQR / PayOS API\n(Mã QR Ngân hàng tự động kích hoạt)"]
        MoMo["MoMo Payment Gateway\n(Ví điện tử sinh viên)"]
    end

    subgraph Cloud_Layer [5. CƠ SỞ DỮ LIỆU & LƯU TRỮ]
        Supabase["Supabase / Neon Cloud PostgreSQL\n(Connection Pooling PgBouncer)"]
        CloudflareR2["Cloudflare R2 / AWS S3\n(Document Storage PDF/Docx)"]
    end

    subgraph Edge_Telemetry [6. MẠNG BIÊN & ĐO LƯỜNG]
        Cloudflare["Cloudflare Edge SSL & Tunnel\n(Vượt tường lửa FPT Wi-Fi)"]
        GA4["Google Analytics 4 SDK\n(Telemetry & Funnel Tracking)"]
        Sentry["Sentry Error Monitoring\n(Crash & Bug Tracking)"]
    end

    BE <--> Gemini
    FE <--> GoogleAuth
    BE <--> Resend
    BE <--> Canvas
    BE <--> GoogleClass
    BE <--> VietQR
    BE <--> MoMo
    BE <--> Supabase
    BE <--> CloudflareR2
    FE <--> Cloudflare
    FE <--> GA4
    FE & BE <--> Sentry
```

---

## 2. CHI TIẾT 7 THÀNH PHẦN TÍCH HỢP BÊN THỨ 3

### 2.1. Nhóm Trí tuệ Nhân tạo (AI & LLM Services)
* **Đối tác cung cấp**: **Google DeepMind / Google Gemini API** (`gemini-1.5-flash` / `gemini-2.0-flash`).
* **Phương thức liên kết**:
  * Gọi trực tiếp qua **Google GenAI Python SDK** bằng HTTPS REST API.
  * Xác thực qua biến môi trường: `GEMINI_API_KEY`.
* **Thành phần chức năng đảm nhiệm**:
  1. **AI Task Deconstructor v3.2 (`app/services/ai_service.py`)**: Đọc đề bài tập, đồ án và bẻ khóa thành chuỗi micro-sprints 25 phút kèm thời lượng và khung giờ vàng. Ép kiểu JSON Schema đầu ra nghiêm ngặt.
  2. **Academic Advisor RAG (`app/api/v1/advisor.py`)**: Nạp tài liệu giáo trình (PDF, Word, LaTeX), trích xuất danh mục tài liệu tham khảo chuẩn BibTeX và xuất ghi chú Markdown Obsidian.
  3. **Heuristic Fallback Engine**: Tự động kích hoạt thuật toán phân rã cục bộ khi mất mạng hoặc hết quota AI, đảm bảo hệ thống không bao giờ bị đơ.

---

### 2.2. Nhóm Danh tính & Xác thực (Identity & Authentication)
* **Đối tác cung cấp**:
  1. **Google Identity Services (Google OAuth 2.0)**:
     * *Phương thức*: Xác thực token phía Client qua Google One Tap / Google Button, gửi `id_token` về Backend xác minh với `GOOGLE_CLIENT_ID`.
     * *Chức năng*: Đăng nhập 1 chạm bằng tài khoản trường `@fpt.edu.vn` hoặc `@vnuhcm.edu.vn`.
  2. **Resend REST API / Gmail SMTP**:
     * *Phương thức*: Gọi REST API `https://api.resend.com/emails` (Port 443) bằng `httpx` hoặc kết nối TLS SMTP qua `smtplib`.
     * *Chức năng*: Gửi mã OTP 6 số xác minh tài khoản và đặt lại mật khẩu với mẫu email nhận diện thương hiệu.

---

### 2.3. Nhóm Hệ thống Học tập Đại học (Academic LMS Ecosystem)
* **Đối tác cung cấp**: **Instructure Canvas LMS API** & **Google Classroom API**.
* **Phương thức liên kết**:
  * Sử dụng **OAuth2 Bearer Token** hoặc **Personal Access Token (PAT)** do sinh viên cung cấp tại `LmsSyncModal.jsx`.
  * Endpoint Canvas: `GET /api/v1/courses/:course_id/assignments`.
* **Thành phần chức năng đảm nhiệm**:
  * Tự động kéo toàn bộ danh sách bài nộp, ngày hết hạn và tiêu chí chấm điểm (rubric) về hệ thống.
  * Tự động đẩy các bài tập này vào thuật toán `Auto-Balance` để xếp vào khung giờ vàng của sinh viên.

---

### 2.4. Nhóm Cổng Thanh toán Trực tuyến (Payment Gateways for EXE201 Sales)
* **Đối tác cung cấp**: **VietQR (PayOS)** & **Ví điện tử MoMo**.
* **Phương thức liên kết**:
  * **PayOS Open API**: Tạo mã QR thanh toán động có gắn mã đơn hàng và số tiền chính xác (`POST https://api.payos.vn/v2/payment-requests`).
  * **Webhook Callback (`POST /api/v1/billing/webhook`)**: Khi sinh viên chuyển khoản quét mã VietQR qua app ngân hàng, hệ thống ngân hàng tự động bắn Webhook về máy chủ Stuđiô AI trong **30 giây** để kích hoạt gói Pro ngay lập tức mà không cần duyệt tay.
* **Thành phần chức năng đảm nhiệm**:
  * Bán **Gói Pro Sinh Viên (49.000 VNĐ / tháng)** và **Vé Học Kỳ (199.000 VNĐ / kỳ)**.
  * Phục vụ ghi nhận doanh thu thực tế và xuất báo cáo tài chính cho môn học EXE201.

---

### 2.5. Nhóm Cơ sở Dữ liệu & Lưu trữ Đám mây (Cloud Database & Storage)
* **Đối tác cung cấp**: **Supabase / Neon** (PostgreSQL) & **Cloudflare R2**.
* **Phương thức liên kết**:
  * Chuỗi kết nối bảo mật: `DATABASE_URL=postgresql://user:password@pooler.supabase.com:6543/postgres?sslmode=require` (kết nối qua PgBouncer Transaction Pooling).
  * Lưu trữ tài liệu qua S3-compatible API của Cloudflare R2.
* **Thành phần chức năng đảm nhiệm**:
  * Lưu trữ toàn vẹn 11 bảng thực thể, hỗ trợ truy vấn đồng thời từ hàng trăm sinh viên campus.
  * Lưu trữ các tệp slide, giáo trình PDF lớn tải lên trợ lý cố vấn học thuật.

---

### 2.6. Nhóm Mạng Biên & Dự phòng Mạng (Edge CDN & Contingency)
* **Đối tác cung cấp**: **Cloudflare Edge Network** (DNS, SSL, Cloudflare Tunnel).
* **Phương thức liên kết**: Cấu hình Proxy DNS qua Cloudflare, áp dụng chứng chỉ bảo mật SSL/TLS tự động.
* **Thành phần chức năng đảm nhiệm**:
  * Tăng tốc độ tải trang tĩnh Frontend (CDN Caching).
  * **Kế hoạch Dự phòng Vượt tường lửa FPT Wi-Fi**: Sử dụng Cloudflare Tunnel (Quick Tunnel qua Port 443 HTTPS) kết nối với 4G cá nhân để trình diễn Live Demo tại lớp học mà không bị chặn cổng mạng trường.

---

### 2.7. Nhóm Đo lường & Giám sát Viễn trắc (Analytics & Telemetry)
* **Đối tác cung cấp**: **Google Analytics 4 (GA4)** & **Sentry**.
* **Phương thức liên kết**: Nhúng mã theo dõi `gtag.js` (`G-XXXXXXXXXX`) trên Frontend và Sentry SDK trên FastAPI Backend.
* **Thành phần chức năng đảm nhiệm**:
  * Đo lường thời gian học sâu thực tế, tỷ lệ chuyển đổi khi dùng tính năng bẻ khóa đồ án.
  * Bắt các lỗi crash ứng dụng thời gian thực để sửa lỗi kịp thời trước giờ thuyết trình.

---

## 3. TỔNG HỢP DANH SÁCH BIẾN MÔI TRƯỜNG CẦN THIẾT (`.env`)

```env
# --- 1. AI & LLM ---
GEMINI_API_KEY="your-google-gemini-api-key"
GEMINI_MODEL="gemini-1.5-flash"

# --- 2. Identity & OTP ---
GOOGLE_CLIENT_ID="your-google-oauth-client-id"
OTP_PROVIDER="resend" # 'resend' | 'smtp' | 'console'
RESEND_API_KEY="re_xxxxxxxxxxxxxxxxxxxxxxxxx"
RESEND_FROM_EMAIL="Stuđiô AI <onboarding@resend.dev>"

# --- 3. Database Cloud ---
DATABASE_URL="postgresql://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres?sslmode=require"

# --- 4. Payment Gateway (VietQR / PayOS) ---
PAYOS_CLIENT_ID="your-payos-client-id"
PAYOS_API_KEY="your-payos-api-key"
PAYOS_CHECKSUM_KEY="your-payos-checksum-key"

# --- 5. Telemetry & Analytics ---
VITE_GA_MEASUREMENT_ID="G-XXXXXXXXXX"
SENTRY_DSN="https://xxxx@sentry.io/yyyy"
```
