"""
Test suite cho các fix TÍNH NĂNG (đợt review sâu 3):
- Task không chọn môn -> nhóm "Chung" (không gán cứng môn AI)
- Thêm subtask sau khi xóa -> order_index không trùng
- PATCH status "pending" được giữ nguyên (không bị ép về in_progress)
- Subtask của user khác -> 404 (không lộ tồn tại)
- /analytics/correlations tính thật từ ambient_sound_used (không còn số hardcode)
- /analytics/certificate điểm sinh học thật trong 0-100
Chạy: python test_features.py
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
    print("=== KIỂM THỬ CÁC FIX TÍNH NĂNG ===\n")

    # ---- Đăng nhập user test ----
    res = client.post('/api/v1/auth/register', json={
        'email': f'feat_test_{os.urandom(3).hex()}@vnuhcm.edu.vn',
        'password': 'password123', 'full_name': 'Test Tính Năng'
    })
    check("0a. Đăng ký user test", res.status_code in (200, 201), f"(got {res.status_code})")
    headers = {'Authorization': f"Bearer {res.json()['access_token']}"}

    # ---- 1. Task không chọn môn -> "Chung" ----
    res = client.post('/api/v1/tasks/', json={'title': 'Ôn Giải tích cuối kỳ'}, headers=headers)
    check("1a. Tạo task không chọn môn (201)", res.status_code == 201, f"(got {res.status_code})")
    task = res.json()
    check("1b. subject_name = 'Chung' (không gán cứng môn AI)",
          task['subject_name'] == 'Chung', f"(got {task['subject_name']})")
    check("1c. subject_code trống (không gán cứng CS301)", not task['subject_code'])

    # ---- 2. PATCH status "pending" được giữ nguyên ----
    tid = task['id']
    res = client.patch(f'/api/v1/tasks/{tid}', json={'status': 'pending'}, headers=headers)
    check("2a. PATCH status pending", res.status_code == 200, f"(got {res.status_code})")
    check("2b. Status giữ nguyên 'pending' (không bị ép về in_progress)",
          res.json()['status'] == 'pending', f"(got {res.json()['status']})")

    res = client.patch(f'/api/v1/tasks/{tid}', json={'status': 'completed'}, headers=headers)
    check("2c. PATCH status completed OK", res.status_code == 200 and res.json()['status'] == 'completed')

    # ---- 3. Subtask order_index không trùng sau khi xóa giữa danh sách ----
    res = client.post('/api/v1/tasks/', json={
        'title': 'Task test order', 'priority': 'medium',
        'subtasks': [{'title': 'A'}, {'title': 'B'}, {'title': 'C'}]
    }, headers=headers)
    tid2 = res.json()['id']
    subs = res.json()['subtasks']  # order: A(0), B(1), C(2)
    sub_b = next(s for s in subs if s['title'] == 'B')
    res = client.delete(f"/api/v1/tasks/subtasks/{sub_b['id']}", headers=headers)
    check("3a. Xóa subtask giữa danh sách", res.status_code == 200)

    res = client.post(f'/api/v1/tasks/{tid2}/subtasks', json={'title': 'D (mới)'}, headers=headers)
    check("3b. Thêm subtask mới", res.status_code == 200)
    orders = [s['order_index'] for s in res.json()]
    check("3c. order_index không trùng sau xóa+thêm", len(orders) == len(set(orders)), str(orders))
    new_last = res.json()[-1]
    check("3d. Subtask mới ở cuối (order_index = max+1)",
          new_last['title'] == 'D (mới)' and new_last['order_index'] == max(orders), str(new_last))

    # ---- 4. Subtask của user khác -> 404 ----
    res = client.post('/api/v1/auth/register', json={
        'email': f'feat_other_{os.urandom(3).hex()}@vnuhcm.edu.vn',
        'password': 'password123', 'full_name': 'Người Khác'
    })
    other_headers = {'Authorization': f"Bearer {res.json()['access_token']}"}
    sub_a = next(s for s in subs if s['title'] == 'A')
    res = client.patch(f"/api/v1/tasks/subtasks/{sub_a['id']}/toggle", headers=other_headers)
    check("4a. Toggle subtask người khác -> 404 (không lộ tồn tại)", res.status_code == 404, f"(got {res.status_code})")

    # ---- 5. Correlations tính thật từ ambient_sound_used ----
    # 2 phiên có nhạc vs 1 phiên không nhạc (ambient rỗng)
    client.post('/api/v1/focus/session/complete', json={
        'planned_minutes': 25, 'actual_minutes': 50, 'distractions_count': 0,
        'ambient_sound_used': 'Sóng Biển 432Hz', 'complete_next_subtask': False
    }, headers=headers)
    client.post('/api/v1/focus/session/complete', json={
        'planned_minutes': 25, 'actual_minutes': 40, 'distractions_count': 0,
        'ambient_sound_used': 'Mưa Rào Hiên Gỗ', 'complete_next_subtask': False
    }, headers=headers)
    client.post('/api/v1/focus/session/complete', json={
        'planned_minutes': 25, 'actual_minutes': 20, 'distractions_count': 3,
        'ambient_sound_used': '', 'complete_next_subtask': False
    }, headers=headers)

    res = client.get('/api/v1/analytics/correlations?days=7', headers=headers)
    check("5a. GET correlations", res.status_code == 200, f"(got {res.status_code})")
    corr_text = str(res.json().get('correlations', []))
    check("5b. Không còn số hardcode +24%/-35%", '+24%' not in corr_text and '-35%' not in corr_text)
    ambient_corr = [c for c in res.json().get('correlations', []) if 'ambient' in c.get('factor', '')]
    check("5c. Có tương quan ambient thật (so sánh có/không nhạc)",
          len(ambient_corr) == 1 and 'phút/phiên' in ambient_corr[0]['description'],
          str(ambient_corr))
    check("5d. Impact là delta thật (không phải +24% cố định)",
          len(ambient_corr) == 1 and ambient_corr[0]['impact'].startswith(('+', '-')),
          ambient_corr[0]['impact'] if ambient_corr else "")

    # ---- 6. Certificate: điểm sinh học thật ----
    res = client.get('/api/v1/analytics/certificate', headers=headers)
    check("6a. GET certificate", res.status_code == 200, f"(got {res.status_code})")
    cscore = res.json().get('metrics', {}).get('circadian_score')
    check("6b. circadian_score từ dữ liệu thật (0-100, không hardcode 88)",
          isinstance(cscore, int) and 0 <= cscore <= 100 and cscore != 88 or cscore == 0,
          f"(got {cscore})")

    # ---- 7. Từ vựng chronotype: intermediate/bear phải ra khung giờ vàng đúng ----
    res = client.post('/api/v1/auth/register', json={
        'email': f'chrono_test_{os.urandom(3).hex()}@vnuhcm.edu.vn',
        'password': 'password123', 'full_name': 'Test Chronotype'
    })
    chrono_headers = {'Authorization': f"Bearer {res.json()['access_token']}"}

    # Wizard gửi "evening" -> owl -> khung giờ vàng tối 20:30-23:30
    res = client.post('/api/v1/onboarding/complete', json={
        'answers': {'chronotype': 'evening', 'wake_up_time': '07:30'}
    }, headers=chrono_headers)
    check("7a. Onboarding complete", res.status_code == 200, f"(got {res.status_code})")
    res = client.get('/api/v1/circadian/pulse', headers=chrono_headers)
    golden = res.json().get('golden_hour_range', '')
    check("7b. 'evening' -> owl có khung giờ tối 20:30 (không bị về khung lark)",
          '20:30' in golden, f"(got {golden})")

    # Wizard gửi "peak_afternoon" -> hummingbird -> có khung 15:00-17:30
    res = client.post('/api/v1/auth/register', json={
        'email': f'chrono2_test_{os.urandom(3).hex()}@vnuhcm.edu.vn',
        'password': 'password123', 'full_name': 'Test Chronotype 2'
    })
    h2 = {'Authorization': f"Bearer {res.json()['access_token']}"}
    client.post('/api/v1/onboarding/complete', json={
        'answers': {'chronotype': 'peak_afternoon'}
    }, headers=h2)
    res = client.get('/api/v1/circadian/pulse', headers=h2)
    golden2 = res.json().get('golden_hour_range', '')
    check("7c. 'peak_afternoon' -> khung 15:00-17:30 (trước đây bị về lark)",
          '15:00' in golden2, f"(got {golden2})")

    # ---- Dọn dẹp ----
    client.delete(f'/api/v1/tasks/{tid}', headers=headers)
    client.delete(f'/api/v1/tasks/{tid2}', headers=headers)

    print(f"\n{'='*60}")
    print(f"KẾT QUẢ: {PASS} PASS / {FAIL} FAIL")
    sys.exit(1 if FAIL else 0)


if __name__ == '__main__':
    main()
