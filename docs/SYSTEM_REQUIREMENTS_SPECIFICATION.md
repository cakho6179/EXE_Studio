# ĐẶC TẢ YÊU CẦU HỆ THỐNG (SOFTWARE REQUIREMENTS SPECIFICATION - SRS)
## DỰ ÁN: STUĐIÔ AI — AI NEURO-STUDY COMPANION FOR UNIVERSITY STUDENTS
**Môn học**: EXE201 — Khởi nghiệp và Đổi mới sáng tạo  
**Giai đoạn đánh giá**: OUTCOME 1 (Tuần 3)  
**Tiêu chuẩn tài liệu**: Phỏng theo chuẩn IEEE Std 830-1998 tinh gọn cho khởi nghiệp công nghệ  
**Ngày phát hành**: 24/09/2026  

---

## 1. GIỚI THIỆU & PHẠM VI HỆ THỐNG

### 1.1. Mục đích (Purpose)
Tài liệu Đặc tả Yêu cầu Hệ thống (SRS) này xác định đầy đủ các yêu cầu chức năng (Functional Requirements), yêu cầu phi chức năng (Non-Functional Requirements) và các ràng buộc kỹ thuật của nền tảng **Stuđiô AI**. Tài liệu đóng vai trò là hợp đồng kỹ thuật và căn cứ nghiệm thu sản phẩm giữa đội ngũ phát triển với Giảng viên và Hội đồng đánh giá môn học EXE201.

### 1.2. Đối tượng Người dùng Mục tiêu (User Personas)
* **Persona 1 - Bạn Nam (Sinh viên IT/Kỹ thuật - Tuýp Owl - Cú Đêm)**: Thường xuyên làm đồ án lớn (Machine Learning, Lập trình Web), có thói quen thức khuya nhưng hay bị tê liệt nhận thức khi đọc đề bài dài 10 trang, dễ bị xao nhãng bởi Facebook/YouTube.
* **Persona 2 - Bạn Linh (Sinh viên Kinh tế/Quản trị - Tuýp Lark - Sơn Ca)**: Dậy sớm học bài, có lịch thi cử dày đặc, cần một công cụ ma trận để phân bổ thời gian học đều các môn tránh học lệch và chống kiệt sức trước tuần thi cuối kỳ.
* **Persona 3 - Hội đồng Học thuật / Nhà tuyển dụng**: Cần một cơ chế xác thực minh bạch chứng minh năng lực kỷ luật tự học thực tế của sinh viên thông qua chữ ký số.

---

## 2. LỘ TRÌNH 3 PHIÊN BẢN THEO CHUẨN LEAN STARTUP (3-PHASE ROADMAP)

Để đảm bảo nguyên lý khởi nghiệp tinh gọn và tính khả thi trong 7 tuần còn lại của môn học EXE201, các yêu cầu chức năng được phân bổ chặt chẽ theo 3 phiên bản:

```text
+----------------------------------------------------------------------------------------------------+
|                                    LEAN 3-PHASE ROADMAP OVERVIEW                                    |
+--------------------------------+-----------------------------------+-------------------------------+
|  PHASE 1: VERSION 1.0 (W1-W3)  |   PHASE 2: VERSION 2.0 (W4-W6)    |  PHASE 3: VERSION 3.0 (W7-W8) |
|    Lean Core MVP (Current)     |  Smart AI & Commercial Launch     |    Academic Ecosystem Final   |
+--------------------------------+-----------------------------------+-------------------------------+
| • FR-01: Auth & User Security  | • FR-04: AI Task Deconstructor    | • FR-08: Academic Advisor RAG |
| • FR-02: Chronotype Profile    | • FR-05: 1-Click Chrono-Scheduler | • FR-09: Tamper-Proof Cert    |
| • FR-03: Task & Micro-Sprints  | • FR-06: Neuro-Acoustic Sound     | • FR-10: Academic Analytics   |
| • FR-07: Deep Work Focus Timer |                                   |                               |
+--------------------------------+-----------------------------------+-------------------------------+
| Outcome 1 Live Demo Validation | Campus Pro Sales Launch (49k VND) | Final Pitch & Revenue Consol. |
+--------------------------------+-----------------------------------+-------------------------------+
```

---

## 3. YÊU CẦU CHỨC NĂNG CHI TIẾT (FUNCTIONAL REQUIREMENTS)

### GIAI ĐOẠN 1: PHIÊN BẢN 1.0 (LEAN CORE MVP — TUẦN 3)

#### FR-01: Xác thực Người dùng & An toàn Tài khoản (Auth & User Security)
* **Mô tả**: Cho phép sinh viên đăng ký, đăng nhập tài khoản bằng email sinh viên và quản lý mật khẩu bảo mật.
* **Yêu cầu chi tiết**:
  * `FR-01.1`: Đăng ký tài khoản với email hợp lệ, họ tên, trường đại học (`university`), chuyên ngành (`major`) và mật khẩu.
  * `FR-01.2`: Mật khẩu được mã hóa một chiều bằng thuật toán `bcrypt` trước khi lưu vào DB.
  * `FR-01.3`: Đăng nhập cấp phát cặp JWT token (`access_token` hết hạn sau 60 phút, `refresh_token` hết hạn sau 7 ngày).
  * `FR-01.4`: Hỗ trợ đổi mật khẩu bảo mật tại `ProfileView.jsx`: xác thực mật khẩu cũ, yêu cầu mật khẩu mới $\ge 6$ ký tự, có thanh đo độ mạnh (Password Strength Bar).
  * `FR-01.5`: Tự động làm mới phiên đăng nhập (Silent 401 Refresh) trong background, không làm gián đoạn việc học của sinh viên.
* **Tiêu chí nghiệm thu (Acceptance Criteria)**:
  * Không cho phép đăng ký trùng email (trả về HTTP 400).
  * Request không có token truy cập vào route bảo vệ bị từ chối bằng HTTP 401.

#### FR-02: Khảo sát Nhịp sinh học Onboarding (Chronotype Assessment)
* **Mô tả**: Giúp sinh viên xác định tuýp sinh học cá nhân sau khi đăng ký tài khoản lần đầu.
* **Yêu cầu chi tiết**:
  * `FR-02.1`: Cung cấp bộ câu hỏi trắc nghiệm hành vi ngắn (giờ thức dậy tự nhiên, giờ buồn ngủ, thời điểm tỉnh táo nhất).
  * `FR-02.2`: Phân loại chính xác người dùng vào 1 trong 4 nhóm Chronotype:
    * `lark` (Chim Sơn Ca): Khung giờ vàng 08:30 - 11:30 & 14:00 - 16:30.
    * `owl` (Cú Đêm): Khung giờ vàng 16:00 - 18:30 & 20:30 - 23:30.
    * `hummingbird` (Chim Ruồi): Khung giờ vàng 10:00 - 12:00 & 15:00 - 17:30.
    * `bear` (Gấu): Khung giờ vàng 10:00 - 12:00 & 14:00 - 16:30.
  * `FR-02.3`: Lưu hồ sơ sinh học vào bảng `user_profiles`, tự động hiển thị mức năng lượng và khung giờ vàng trên Dashboard.
* **Tiêu chí nghiệm thu**:
  * Sinh viên hoàn thành onboarding được tự động chuyển hướng về `/dashboard` với cờ `is_onboarded = true`.

#### FR-03: Quản lý Đồ án & Micro-Sprints (Task & Sprint Architecture)
* **Mô tả**: Giải quyết nỗi sợ đồ án lớn bằng cách chia nhỏ thành các đơn vị công việc 25 phút.
* **Yêu cầu chi tiết**:
  * `FR-03.1`: Tạo, sửa, xóa nhiệm vụ học tập với các trường: Tên đề tài, Môn học, Hạn chót, Mức độ ưu tiên (`high`, `medium`, `low`), Độ phức tạp (`simple`, `medium`, `complex`).
  * `FR-03.2`: Cho phép tạo thủ công danh sách các `MicroSubtask` con trực thuộc (tiêu đề, thời lượng dự kiến mặc định 25 phút, số lượng Pomodoro).
  * `FR-03.3`: **Cơ chế Cascade Completion**:
    * Khi người dùng tick hoàn thành nhiệm vụ cha -> Hệ thống tự động đánh dấu toàn bộ các subtasks con là hoàn thành (`is_completed = true`).
    * Khi người dùng mở lại nhiệm vụ cha (`status = in_progress`) -> Hệ thống tự động mở lại các subtasks con để tiếp tục học.
  * `FR-03.4`: Bộ lọc Ma trận Eisenhower: Lọc nhiệm vụ khẩn cấp (< 48 giờ) và quan trọng.
* **Tiêu chí nghiệm thu**:
  * 100% các mutation thêm/xóa/sửa task đều tự động kích hoạt cập nhật cache trên trang Bảng điều khiển và Phân tích.

#### FR-07: Đồng hồ Tập trung Deep Work Pomodoro (Focus Timer)
* **Mô tả**: Môi trường đếm giờ tối giản triệt tiêu xao nhãng.
* **Yêu cầu chi tiết**:
  * `FR-07.1`: Hỗ trợ 2 chế độ đếm ngược: Chu kỳ ngắn 25 phút (1 sprint) và Chu kỳ sâu 50 phút (2 sprints).
  * `FR-07.2`: Nút ghi nhận xao nhãng (Distraction Counter) giúp sinh viên tự đánh giá mức độ phân tâm trong phiên.
  * `FR-07.3`: Khi kết thúc phiên: Ghi nhận số phút tập trung thực tế vào bảng `focus_sessions` và tự động tick hoàn thành micro-sprint tiếp theo của đồ án đang chọn.
* **Tiêu chí nghiệm thu**:
  * Ghi nhận chính xác số phút học thực tế, không bị mất dữ liệu khi người dùng chuyển đổi tab trình duyệt.

---

### GIAI ĐOẠN 2: PHIÊN BẢN 2.0 (COMMERCIAL LAUNCH & AI EXPANSION — TUẦN 4 ĐẾN TUẦN 6)

#### FR-04: AI Bẻ khóa Nhiệm vụ Tự động (AI Task Deconstructor v3.2)
* **Mô tả**: Tự động hóa quá trình chia nhỏ bài tập bằng Google Gemini LLM.
* **Yêu cầu chi tiết**:
  * `FR-04.1`: Sinh viên nhập tên đề bài hoặc dán mô tả đề tài -> Gửi đến `POST /api/v1/tasks/ai-decompose`.
  * `FR-04.2`: AI tự động phân tích độ phức tạp và trả về cấu trúc JSON gồm: Tên chuẩn hóa, Lời khuyên học thuật, và mảng các micro-sprints 25 phút.
  * `FR-04.3`: Quy tắc số lượng sprints theo độ phức tạp:
    * `simple`: 1 - 2 sprints.
    * `medium`: 2 - 4 sprints.
    * `complex`: 3 - 6 sprints.
  * `FR-04.4`: Tách biệt 2 bước: Bước 1 xem trước (Preview) -> Bước 2 sinh viên bấm xác nhận mới lưu vào Database.
  * `FR-04.5`: Hạn mức (Billing Quota): Gói miễn phí giới hạn 3 lượt bẻ khóa/tháng; Gói Pro không giới hạn.
* **Tiêu chí nghiệm thu**:
  * Thời gian phản hồi của AI dưới 3 giây. Nếu AI timeout, tự động kích hoạt thuật toán Heuristic Fallback không để sinh viên chờ đợi.

#### FR-05: Tự động Cân bằng Lịch theo Nhịp Sinh học (AI Chrono-Balance)
* **Mô tả**: Tự động xếp các micro-sprints vào khung giờ vàng của sinh viên trên thời khóa biểu.
* **Yêu cầu chi tiết**:
  * `FR-05.1`: Nút bấm 1-Click `Auto-Balance` tại màn hình Lập kế hoạch và Lịch trình.
  * `FR-05.2`: Quét tối đa 3 bài tập ưu tiên cao nhất chưa hoàn thành, xếp lần lượt vào khung giờ vàng của 3 ngày liên tiếp.
  * `FR-05.3`: Tự động áp dụng đúng khung giờ vàng theo Chronotype của chính người dùng (`Lark` xếp sáng 08:30, `Owl` xếp tối 20:30).
  * `FR-05.4`: Bảo vệ giấc ngủ: Giờ kết thúc luôn được kẹp $\le \text{23:45}$.
* **Tiêu chí nghiệm thu**:
  * Sự kiện lịch không bị chồng chéo thời gian và tự động gắn cờ `is_circadian_optimized = true`.

#### FR-06: Không gian Âm thanh Sóng não 432Hz (Neuro-Acoustic Soundscapes)
* **Mô tả**: Máy phát âm thanh tĩnh lặng trực tiếp trên Web Audio API giúp chống ồn phòng trọ/quán café.
* **Yêu cầu chi tiết**:
  * `FR-06.1`: Phát âm thanh sóng não Solfeggio 432Hz kết hợp tiếng ồn trắng (White/Pink/Brown Noise) và âm thanh thiên nhiên (tiếng mưa, sóng biển).
  * `FR-06.2`: Mô phỏng **Âm thanh Vòm Không gian 3D (Spatial Audio)** qua PannerNode tạo cảm giác thư thái cho màng nhĩ.
  * `FR-06.3`: Hỗ trợ lưu preset phối âm cá nhân (tên preset được nhập trực tiếp qua inline text input, không dùng native prompt).
  * `FR-06.4`: Hẹn giờ tắt nhạc tự động (15, 30, 45, 60 phút) giúp sinh viên yên tâm đi ngủ sau buổi học.
* **Tiêu chí nghiệm thu**:
  * Âm thanh phát mượt mà, không bị giật lag khi chuyển đổi giữa các tab trong ứng dụng.

---

### GIAI ĐOẠN 3: PHIÊN BẢN 3.0 (ACADEMIC ECOSYSTEM & CERTIFICATION — TUẦN 7 ĐẾN TUẦN 8)

#### FR-08: Trợ lý Cố vấn Học thuật Nạp Tài liệu RAG (Academic Advisor RAG)
* **Mô tả**: Hỏi đáp bài tập theo ngữ cảnh giáo trình của giảng viên.
* **Yêu cầu chi tiết**:
  * `FR-08.1`: Cho phép sinh viên tải lên tài liệu tham khảo, slide môn học, rubric điểm dạng PDF, Word (`.docx`), LaTeX (`.tex`), Markdown (`.md`) tối đa 25MB.
  * `FR-08.2`: Phòng chống lỗ hổng Path Traversal khi upload tài liệu, lưu trữ metadata trong bảng `Document`.
  * `FR-08.3`: Hỗ trợ xuất danh mục tài liệu trích dẫn chuẩn quốc tế **BibTeX (.bib)** phục vụ viết báo cáo khoa học.
  * `FR-08.4`: Hỗ trợ xuất toàn bộ biên bản trao đổi với AI ra định dạng ghi chú **Obsidian Markdown (.md)**.
* **Tiêu chí nghiệm thu**:
  * Trả lời chính xác dựa trên ngữ cảnh tài liệu nạp vào, trích xuất BibTeX hợp lệ không lỗi cú pháp.

#### FR-09: Chứng nhận Kỷ luật Học thuật Mã hóa (Tamper-Proof SHA-256 Certificate)
* **Mô tả**: Tôn vinh kỷ luật học tập của sinh viên bằng chứng chỉ số chống làm giả.
* **Yêu cầu chi tiết**:
  * `FR-09.1`: Tự động tính toán tổng số giờ Deep Work thực tế, chuỗi ngày liên tục (streak) và điểm đồng bộ sinh học.
  * `FR-09.2`: Tạo mã chứng chỉ độc nhất định dạng `STU-CERT-2026-XXXXXXXX` và chữ ký băm bảo mật SHA-256.
  * `FR-09.3`: Tạo mã QR xác thực công khai trỏ về đường link:  
    `https://studio-ai.edu.vn/verify-cert?id=...&hash=...`
  * `FR-09.4`: Trang xác thực công khai đối chiếu mã băm và hiển thị dấu chứng nhận hợp lệ.
* **Tiêu chí nghiệm thu**:
  * Nếu bất kỳ thông số nào (tên, số giờ) bị sửa đổi trái phép, trang xác minh sẽ cảnh báo chứng chỉ không hợp lệ.

---

## 4. YÊU CẦU PHI CHỨC NĂNG (NON-FUNCTIONAL REQUIREMENTS)

### NFR-01: Hiệu năng & Tốc độ Phản hồi (Performance)
* Thời gian tải trang ban đầu (First Contentful Paint) $< 1.2$ giây.
* Kích thước gói nén Frontend Production (Gzip) $< 100$ KB (thực tế hiện tại đạt 94.3 KB).
* Thời gian phản hồi của các API đọc dữ liệu được cache $< 50$ mili-giây.
* Thời gian xử lý bẻ khóa bài tập qua AI $< 3$ giây.

### NFR-02: Độ Tin cậy & Kiểm thử Hệ thống (Reliability & Testing)
* Hệ thống phải đạt tỷ lệ vượt qua kiểm thử tự động **100% (60/60 Integration Tests PASS)** trên tệp kiểm thử `test_isolated_fresh.py`.
* Cơ chế tự phục hồi: Khi mất kết nối internet hoặc API AI quá tải, hệ thống tự động kích hoạt tầng fallback nội bộ không làm treo trình duyệt.

### NFR-03: Bảo mật & Toàn vẹn Dữ liệu (Security & Data Integrity)
* Mật khẩu người dùng được băm bằng `bcrypt` với `cost factor = 12`.
* Xác thực định tuyến bằng JSON Web Token (JWT) theo chuẩn OAuth2 Bearer.
* Toàn bộ các thao tác xóa nhiệm vụ mẹ (`Task`) phải đảm bảo an toàn khóa ngoại (`SET NULL` tại bảng Schedule và Focus) trước khi thực thi xóa thực thể.
* Kiểm tra chặt chẽ tên file tải lên (Path Traversal Protection), chỉ cho phép các định dạng tài liệu được phê duyệt: `.pdf`, `.docx`, `.tex`, `.txt`, `.md`.

### NFR-04: Tính Khả dụng & Thiết kế (Usability & Design)
* **Zero Native Dialogs**: Tuyệt đối không sử dụng `window.alert` hoặc `window.prompt`. Toàn bộ thông báo dùng Toast Component hiện đại, nhập liệu dùng Inline Form.
* Responsive Design: Tương thích hoàn toàn trên máy tính để bàn, máy tính bảng và màn hình điện thoại thông minh.

---

## 5. RÀNG BUỘC KỸ THUẬT & HẠ TẦNG TRIỂN KHAI

* **Môi trường Phát triển**: Node.js 18+, Python 3.11+, SQLite 3.
* **Môi trường Sản xuất**: Docker Container, PostgreSQL 15, Nginx / Cloudflare Edge Proxy.
* **Quy chuẩn Múi giờ**: Mọi thời điểm tính toán sinh học được quy chuẩn theo múi giờ Việt Nam (`UTC+7`).
* **Kế hoạch Dự phòng Mạng FPT (Campus Wi-Fi Fallback)**:
  * *Cấp 1*: Cloudflare Edge SSL Proxy (Cổng 443 tiêu chuẩn).
  * *Cấp 2*: Đường hầm 4G Hotspot cá nhân (Cloudflare Tunnel / Ngrok).
  * *Cấp 3*: Localhost Standalone Engine nạp sẵn 60 tests pass + Video Demo 4K dự phòng (2m50s).

---
*Tài liệu Đặc tả Yêu cầu Hệ thống này được phê duyệt làm cơ sở kiểm tra và đánh giá kết quả Outcome 1.*
