# Stuđiô AI (Calm Workspace)

> **Không gian học tập tĩnh lặng & Trợ lý điều phối nhịp sinh học thông minh dành cho sinh viên đại học**

---

## 1. Giới Thiệu Dự Án

**Stuđiô AI** là nền tảng SaaS EdTech kết hợp công nghệ **Calm Tech** và **AI Sinh học (Circadian Rhythm AI)**, giúp sinh viên đại học giảm tải áp lực, tránh tình trạng kiệt sức (*burnout*), phân rã các đồ án lớn thành các bước nhỏ 25 phút Pomodoro và học tập sâu trong sự tĩnh lặng với âm hưởng 432Hz.

---

## 2. Cấu Trúc Dự Án Đã Hoàn Thiện (Lựa Chọn 1B)

```
EXE_Of_Chau/
├── backend/                              # Máy chủ FastAPI & Dịch vụ AI
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── auth.py                  # Đăng ký, đăng nhập JWT, Google OAuth, Profile
│   │   │   ├── circadian.py             # Thuật toán nhịp sinh học & năng lượng Alpha
│   │   │   ├── tasks.py                 # Quản lý bài tập & AI Deconstructor v3.2
│   │   │   ├── focus.py                 # Ghi nhận phiên Pomodoro & Deep Work
│   │   │   ├── schedule.py              # Dòng thời gian thời khóa biểu hôm nay
│   │   │   ├── advisor.py               # Cố vấn học thuật AI (Chat & Tra cứu)
│   │   │   ├── audio.py                 # Danh mục âm thanh thư giãn 432Hz
│   │   │   └── analytics.py             # Thống kê tăng trưởng, năng lực sinh viên
│   │   ├── core/                        # Config, Database SQLAlchemy, Security JWT
│   │   ├── models/                      # Bảng cơ sở dữ liệu ORM
│   │   ├── schemas/                     # Pydantic Schemas xác thực dữ liệu
│   │   ├── services/                    # Dịch vụ Gemini AI & Thuật toán Circadian
│   │   └── main.py                      # FastAPI App, CORS & Static Server
│   ├── requirements.txt
│   ├── .env                             # Cấu hình JWT, DB và GEMINI_API_KEY
│   └── studi_ai.db                      # Cơ sở dữ liệu SQLite khởi tạo sẵn
│
├── frontend/                            # Giao diện Calm Tech hoàn chỉnh
│   ├── assets/
│   │   ├── js/
│   │   │   ├── api.js                   # Client fetch API & Thông báo Toast Calm Tech
│   │   │   ├── auth.js                  # Quản lý session đăng nhập & Profile
│   │   │   ├── audio.js                 # Bộ phát sóng âm 432Hz & Tiếng sóng biển (Web Audio API)
│   │   │   ├── timer.js                 # Bộ đếm Pomodoro & Vòng cung tiến độ SVG
│   │   │   └── app.js                   # Điều hướng toàn trang & liên kết nút bấm
│   │   └── images/                      # Logo & Hình nền tranh màu nước ngọn hải đăng
│   │
│   ├── pages/                           # 19 Màn hình đã chuẩn hóa tên thư mục
│   │   ├── 01-landing/                  # Trang giới thiệu sản phẩm (Landing Page)
│   │   ├── 02-login/                    # Đăng nhập hệ thống (hỗ trợ SSO .edu.vn)
│   │   ├── 03-register/                 # Đăng ký tài khoản sinh viên
│   │   ├── 04-google-auth/              # Modal chọn tài khoản Google OAuth
│   │   ├── 05-forgot-password/          # Khôi phục mật khẩu qua email OTP
│   │   ├── 06-verify-email/             # Xác thực email trường đại học
│   │   ├── 07-onboarding-major/         # Bước 1: Chọn trường & chuyên ngành
│   │   ├── 08-onboarding-goals/         # Bước 2: Thiết lập mục tiêu giờ học & GPA
│   │   ├── 09-onboarding-circadian/     # Bước 3: Cấu hình chu kỳ nhịp sinh học
│   │   ├── 10-dashboard/                # Dashboard sinh viên trung tâm
│   │   ├── 11-tasks/                    # Quản lý nhiệm vụ & Micro-subtasks
│   │   ├── 12-task-modal/               # Modal "AI Deconstructor v3.2" bẻ khóa bài tập
│   │   ├── 13-planner/                  # Lập kế hoạch học tập theo tuần/tháng
│   │   ├── 14-schedule/                 # Lịch trình & Biểu đồ năng lượng sinh học
│   │   ├── 15-deep-work-config/         # Cấu hình phiên học tập trung sâu
│   │   ├── 16-deep-work-active/         # Phiên tập trung tương tác (Pomodoro dial)
│   │   ├── 17-ai-advisor/               # Cố vấn học thuật AI tương tác trực tiếp
│   │   ├── 18-sound-sanctuary/          # Bộ trộn âm thanh thư giãn & 432Hz
│   │   └── 19-analytics/                # Thống kê giờ học, streak & radar năng lực
│   └── index.html                       # File chuyển hướng thông minh
│
├── start_server.bat                     # File 1-click khởi chạy toàn bộ hệ thống
└── calm_intelligent_workspace/DESIGN.md # Hướng dẫn phong cách thiết kế Calm Tech
```

---

## 3. Hướng Dẫn Khởi Chạy

### Cách 1: Chạy 1-Click (Tiện lợi nhất)
Chỉ cần nhấp đúp vào file:
👉 `start_server.bat`

Trình duyệt sẽ tự động mở trang web tại địa chỉ: `http://localhost:8000`

### Cách 2: Chạy Bằng Dòng Lệnh
1. Mở PowerShell hoặc Terminal:
```bash
cd backend
python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```
2. Mở trình duyệt truy cập:
- **Ứng dụng Stuđiô AI:** [http://localhost:8000](http://localhost:8000)
- **Tài liệu API Swagger:** [http://localhost:8000/docs](http://localhost:8000/docs)

---

## 4. Tài Khoản Thử Nghiệm Sẵn Có (Seed Data)

Hệ thống đã tự động nạp sẵn tài khoản mẫu sinh viên ĐHQG TP.HCM:
- **Email:** `chau.nguyen@vnuhcm.edu.vn`
- **Mật khẩu:** `password123`
- **Họ tên:** Nguyễn Minh Châu
- **Chuyên ngành:** Công nghệ Thông tin (Năm 3)
- *(Bạn cũng có thể bấm nút "Đăng nhập SSO Sinh viên" trên trang Login hoặc chọn tài khoản trên trang Google Auth để đăng nhập tức thì mà không cần gõ phím).*

---

## 5. Các Điểm Nổi Bật Kỹ Thuật

1. **AI Deconstructor v3.2:** Nhận đề bài tập từ sinh viên, gọi AI phân tích và tự động bẻ khóa thành 4-6 micro-sprints Pomodoro 25 phút, tự động gắn nhãn khung giờ vàng Alpha tối ưu.
2. **Cố vấn học thuật AI:** Trò chuyện tương tác giải đáp thắc mắc chuyên ngành (Machine Learning, CSDL, Lập trình, Phương pháp học) phong cách điềm đạm, hỗ trợ học thuật chuẩn mực.
3. **Bộ phát âm thanh 432Hz & Sóng biển Web Audio API:** Hoạt động 100% offline, không phụ thuộc file mp3 ngoài, tạo sóng não Alpha 10Hz thật bằng thuật toán toán học.
4. **Chu kỳ nhịp sinh học thời gian thực (Circadian Pulse):** Tự động tính toán mức năng lượng và khung giờ vàng dựa trên Chronotype và thời gian thực trong ngày.
