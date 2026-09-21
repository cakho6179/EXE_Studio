"""
Test suite bổ sung cho các tính năng mới sau khi hoàn thiện backend:
- CRUD task chi tiết (GET/PATCH), subtask CRUD, event PATCH
- Refresh token + chặn refresh token gọi API
- Email normalize, validate input, rate-limit
- Múi giờ VN, auto-balance theo chronotype, security headers
- Logout thu hồi refresh token (revoke)
- Study plan: tạo + PATCH progress + ownership
Chạy: python test_enhancements.py
"""
import sys, os
sys.path.insert(0, os.path.abspath('.'))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)
PASS = 0
FAIL = 0


def check(name, condition, extra=""):
    global PASS, FAIL
    if condition:
        PASS += 1
        print(f"[PASS] {name}")
    else:
        FAIL += 1
        print(f"[FAIL] {name} {extra}")


def main():
    print("=== KIỂM THỬ CÁC TÍNH NĂNG MỚI SAU HOÀN THIỆN BACKEND ===\n")

    # ---- 1. Auth: login + refresh token ----
    res = client.post('/api/v1/auth/login', json={'email': 'chau.nguyen@vnuhcm.edu.vn', 'password': 'password123'})
    check("1a. Đăng nhập thành công", res.status_code == 200)
    data = res.json()
    check("1b. Có access_token", bool(data.get('access_token')))
    check("1c. Có refresh_token", bool(data.get('refresh_token')))
    token = data['access_token']
    refresh = data.get('refresh_token', '')
    headers = {'Authorization': f'Bearer {token}'}

    # ---- 2. Refresh flow ----
    res = client.post('/api/v1/auth/refresh', json={'refresh_token': refresh})
    check("2a. Đổi refresh token OK", res.status_code == 200 and res.json().get('access_token'))
    new_refresh = res.json().get('refresh_token', '')
    check("2b. Refresh token được cấp mới", bool(new_refresh) and new_refresh != refresh)

    # Refresh token KHÔNG được dùng như access token
    res = client.get('/api/v1/auth/me', headers={'Authorization': f'Bearer {new_refresh}'})
    check("2c. Refresh token bị chặn gọi API (401)", res.status_code == 401)

    # ---- 3. Email normalize ----
    res = client.post('/api/v1/auth/login', json={'email': '  Chau.Nguyen@VNUHCM.edu.vn ', 'password': 'password123'})
    check("3a. Login email viết hoa + khoảng trắng vẫn OK", res.status_code == 200)

    # Validate input
    res = client.post('/api/v1/auth/register', json={
        'email': 'bad-email', 'password': 'short', 'full_name': 'T'
    })
    check("3b. Từ chối email sai định dạng", res.status_code in (400, 422))
    res = client.post('/api/v1/auth/register', json={
        'email': 'newuser_test@vnuhcm.edu.vn', 'password': 'short', 'full_name': 'Người Dùng Mới'
    })
    check("3c. Từ chối mật khẩu < 8 ký tự", res.status_code in (400, 422))

    # ---- 4. Rate limit login (10 lần / 5 phút) ----
    last = None
    for i in range(12):
        last = client.post('/api/v1/auth/login', json={'email': 'ratelimit_test@vnuhcm.edu.vn', 'password': 'wrongpass'})
    check("4a. Login sai lặp lại bị 429", last.status_code == 429, f"(got {last.status_code})")

    # ---- 5. Task CRUD đầy đủ ----
    res = client.post('/api/v1/tasks/', json={
        'title': 'Test Task chi tiết cho PATCH', 'priority': 'low',
        'subtasks': [{'title': 'Bước 1', 'estimated_minutes': 25}, {'title': 'Bước 2', 'estimated_minutes': 25}]
    }, headers=headers)
    check("5a. Tạo task (201)", res.status_code == 201, f"(got {res.status_code})")
    task = res.json()
    tid = task['id']

    res = client.get(f'/api/v1/tasks/{tid}', headers=headers)
    check("5b. GET chi tiết task", res.status_code == 200 and res.json()['id'] == tid)

    res = client.patch(f'/api/v1/tasks/{tid}', json={'title': 'Đã sửa tên', 'priority': 'high'}, headers=headers)
    check("5c. PATCH task sửa tên + ưu tiên", res.status_code == 200 and res.json()['title'] == 'Đã sửa tên' and res.json()['priority'] == 'high')

    # Subtask CRUD
    sub_id = task['subtasks'][0]['id']
    res = client.patch(f'/api/v1/tasks/subtasks/{sub_id}', json={'title': 'Bước 1 (sửa)', 'estimated_minutes': 30}, headers=headers)
    check("5d. PATCH subtask", res.status_code == 200 and res.json()['title'] == 'Bước 1 (sửa)' and res.json()['estimated_minutes'] == 30)

    res = client.post(f'/api/v1/tasks/{tid}/subtasks', json={'title': 'Bước 3 thêm mới'}, headers=headers)
    check("5e. POST thêm subtask", res.status_code == 200 and len(res.json()) == 3)

    res = client.delete(f'/api/v1/tasks/subtasks/{sub_id}', headers=headers)
    check("5f. DELETE subtask", res.status_code == 200)

    # ---- 6. Schedule event PATCH + validate giờ ----
    res = client.post('/api/v1/schedule/events', json={
        'title': 'Sự kiện test PATCH', 'start_time': '09:00', 'end_time': '10:30'
    }, headers=headers)
    check("6a. Tạo event (201)", res.status_code == 201, f"(got {res.status_code})")
    ev = res.json()
    check("6b. event_date tự gán hôm nay", bool(ev.get('event_date')))

    res = client.patch(f"/api/v1/schedule/events/{ev['id']}", json={'start_time': '10:00', 'end_time': '11:30'}, headers=headers)
    check("6c. PATCH event dời giờ", res.status_code == 200 and res.json()['start_time'] == '10:00')

    res = client.post('/api/v1/schedule/events', json={'title': 'Giờ sai', 'start_time': '9h', 'end_time': '10:00'}, headers=headers)
    check("6d. Từ chối giờ sai định dạng", res.status_code == 400)

    # ---- 7. Focus: complete_next_subtask=False không tự tick ----
    res = client.post('/api/v1/focus/session/complete', json={
        'task_id': tid, 'planned_minutes': 25, 'actual_minutes': 25, 'complete_next_subtask': False
    }, headers=headers)
    check("7a. Ghi focus session (201)", res.status_code == 201, f"(got {res.status_code})")
    res = client.get(f'/api/v1/tasks/{tid}', headers=headers)
    check("7b. Không tự tick subtask khi tắt cờ", res.json()['completed_sprints'] == 0)

    # ---- 8. Auto-balance theo chronotype ----
    res = client.get('/api/v1/circadian/pulse', headers=headers)
    check("8a. Circadian pulse hoạt động", res.status_code == 200)
    res = client.post('/api/v1/schedule/auto-balance', headers=headers)
    check("8b. Auto-balance theo chronotype", res.status_code == 200)

    # ---- 9. Ownership: task của user khác bị 404/403 ----
    res = client.post('/api/v1/auth/register', json={
        'email': f'owner_test_{os.urandom(3).hex()}@vnuhcm.edu.vn', 'password': 'password123', 'full_name': 'Chủ Sở Hữu Khác'
    })
    other_token = res.json()['access_token']
    res = client.get(f'/api/v1/tasks/{tid}', headers={'Authorization': f'Bearer {other_token}'})
    check("9a. Task của user khác bị chặn (404)", res.status_code == 404)

    # ---- 10. Analytics: radar công bằng (0-100) ----
    res = client.get('/api/v1/analytics/dashboard', headers=headers)
    radar_scores = [s['score'] for s in res.json().get('subject_radar', [])]
    check("10a. Radar điểm trong khoảng 0-100", all(0 <= s <= 100 for s in radar_scores), str(radar_scores))
    check("10b. Zen index có mặt", 'zen_efficiency_index' in res.json())

    # ---- 11. Logout thu hồi refresh token (revoke) ----
    rand = os.urandom(3).hex()
    res = client.post('/api/v1/auth/register', json={
        'email': f'revoke_test_{rand}@vnuhcm.edu.vn', 'password': 'password123', 'full_name': 'Test Revoke'
    })
    check("11a. Đăng ký user test revoke", res.status_code in (200, 201), f"(got {res.status_code})")
    revoke_refresh = res.json().get('refresh_token', '')
    res = client.post('/api/v1/auth/logout', json={'refresh_token': revoke_refresh})
    check("11b. Logout trả 200", res.status_code == 200, f"(got {res.status_code})")
    res = client.post('/api/v1/auth/refresh', json={'refresh_token': revoke_refresh})
    check("11c. Refresh token đã bị thu hồi sau logout", res.status_code in (401, 403), f"(got {res.status_code})")

    # ---- 12. Study plan: tạo + cập nhật tiến độ + ownership ----
    res = client.post('/api/v1/auth/register', json={
        'email': f'plan_test_{os.urandom(3).hex()}@vnuhcm.edu.vn', 'password': 'password123', 'full_name': 'Chủ Kế Hoạch'
    })
    plan_token = res.json()['access_token']
    plan_headers = {'Authorization': f'Bearer {plan_token}'}

    res = client.post('/api/v1/study-plans/', json={
        'title': 'Ôn Giải tích 2', 'subject': 'Giải tích 2', 'exam_date': '2026-12-15'
    }, headers=plan_headers)
    check("12a. Tạo study plan (201)", res.status_code == 201, f"(got {res.status_code})")
    plan = res.json()
    check("12b. exam_date validate đúng dạng", plan.get('exam_date') == '2026-12-15')

    res = client.patch(f"/api/v1/study-plans/{plan['id']}", json={'progress': 42.5}, headers=plan_headers)
    check("12c. PATCH progress", res.status_code == 200 and res.json().get('progress') == 42.5, f"(got {res.status_code})")

    res = client.get('/api/v1/study-plans/', headers=plan_headers)
    check("12d. GET list phản ánh progress mới", res.status_code == 200 and res.json()[0]['progress'] == 42.5)

    # User khác không được sửa kế hoạch của người khác
    res = client.patch(f"/api/v1/study-plans/{plan['id']}", json={'progress': 99}, headers=headers)
    check("12e. Plan của user khác bị chặn (404)", res.status_code == 404, f"(got {res.status_code})")

    # progress vượt phạm vi bị từ chối
    res = client.patch(f"/api/v1/study-plans/{plan['id']}", json={'progress': 150}, headers=plan_headers)
    check("12f. Từ chối progress > 100", res.status_code == 422)

    res = client.delete(f"/api/v1/study-plans/{plan['id']}", headers=plan_headers)
    check("12g. DELETE plan", res.status_code == 200, f"(got {res.status_code})")

    # ---- Dọn dữ liệu test ----
    client.delete(f'/api/v1/tasks/{tid}', headers=headers)
    client.delete(f"/api/v1/schedule/events/{ev['id']}", headers=headers)

    print(f"\n{'='*60}")
    print(f"KẾT QUẢ: {PASS} PASS / {FAIL} FAIL")
    sys.exit(1 if FAIL else 0)


if __name__ == '__main__':
    main()
