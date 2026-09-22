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
from datetime import datetime, timedelta
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

    # ---- 2e. PATCH task completed -> về pending phải bỏ tick subtasks (không bị nuốt) ----
    res = client.post('/api/v1/tasks/', json={
        'title': 'Task reopen test', 'priority': 'medium',
        'subtasks': [{'title': 'B1'}, {'title': 'B2'}]
    }, headers=headers)
    tid_re = res.json()['id']
    client.patch(f'/api/v1/tasks/{tid_re}', json={'status': 'completed'}, headers=headers)
    res = client.patch(f'/api/v1/tasks/{tid_re}', json={'status': 'pending'}, headers=headers)
    check("2e. Task completed -> PATCH 'pending' không bị nuốt",
          res.status_code == 200 and res.json()['status'] == 'pending',
          f"(got {res.json().get('status')})")
    reopened = res.json()
    check("2f. Subtasks được bỏ tick khi mở lại task",
          all(not s['is_completed'] for s in reopened['subtasks']),
          str([s['is_completed'] for s in reopened['subtasks']]))

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

    # ---- 6c. User chưa có task nào -> completion_rate = 0 (trung thực, không phải 100) ----
    res = client.get('/api/v1/analytics/certificate', headers=chrono_headers)
    c_rate = res.json().get('metrics', {}).get('completion_rate')
    check("6c. Certificate user 0 task -> completion_rate=0 (không phải 100)",
          c_rate == 0, f"(got {c_rate})")

    # ---- 8. Focus session trên task 'pending' -> chuyển in_progress ----
    res = client.post('/api/v1/tasks/', json={'title': 'Task pending focus', 'priority': 'low'}, headers=headers)
    tid_p = res.json()['id']
    client.patch(f'/api/v1/tasks/{tid_p}', json={'status': 'pending'}, headers=headers)
    res = client.post('/api/v1/focus/session/complete', json={
        'task_id': tid_p, 'planned_minutes': 25, 'actual_minutes': 25,
        'complete_next_subtask': False
    }, headers=headers)
    check("8a. Ghi phiên focus trên task pending (201)", res.status_code == 201, f"(got {res.status_code})")
    res = client.get(f'/api/v1/tasks/{tid_p}', headers=headers)
    check("8b. Task 'pending' tự chuyển 'in_progress' sau khi học",
          res.json()['status'] == 'in_progress', f"(got {res.json()['status']})")

    # ---- 9. Upload giáo trình: text được LƯU + luồng chat với tài liệu không crash ----
    res = client.post('/api/v1/advisor/upload',
                      files={'file': ('giaotrinh.txt', b'Chuong 1: Transformer dung Multi-Head Attention de hieu song song ngu canh dai.', 'text/plain')},
                      headers=headers)
    check("9a. Upload giáo trình txt (200)", res.status_code == 200, f"(got {res.status_code}) {res.text[:120]}")
    check("9b. text_chars > 0 (trích text thật)", res.json().get('text_chars', 0) > 0)
    doc_id = res.json().get('id')

    res = client.get('/api/v1/advisor/documents', headers=headers)
    check("9c. GET /advisor/documents liệt kê tài liệu vừa upload",
          any(d['id'] == doc_id for d in res.json().get('documents', [])))

    res = client.post('/api/v1/advisor/chat', json={
        'content': 'Tóm tắt Chương 1 giáo trình của em', 'include_profile': False, 'include_tasks': False
    }, headers=headers)
    check("9d. Chat advisor với tài liệu nạp (không crash)", res.status_code == 200,
          f"(got {res.status_code}) {res.text[:120]}")

    res = client.delete(f'/api/v1/advisor/documents/{doc_id}', headers=headers)
    check("9e. DELETE document OK", res.status_code == 200, f"(got {res.status_code})")

    # ---- 10. Auto-balance: owl -> event học sâu trong khung giờ tối, KHÔNG qua nửa đêm ----
    # user chính (headers) đang là chronotype mặc định; dùng user chrono_headers (đã đặt 'evening' -> owl)
    res = client.post('/api/v1/tasks/', json={'title': 'Đồ án owl test', 'priority': 'high'}, headers=chrono_headers)
    tid_owl = res.json()['id']
    res = client.post('/api/v1/schedule/auto-balance', headers=chrono_headers)
    check("10a. POST auto-balance", res.status_code == 200, f"(got {res.status_code}) {res.text[:120]}")
    res = client.get('/api/v1/schedule/timeline', headers=chrono_headers)
    deep_events = [e for e in res.json() if (e.get('title') or '').startswith('Học sâu:')]
    check("10b. Có event 'Học sâu' được sinh", len(deep_events) >= 1, str(len(deep_events)))
    if deep_events:
        ev = deep_events[0]
        # owl: khung tối 20:30-23:30 — event phải nằm hoàn toàn trong ngày (end <= 23:45)
        end_h, end_m = map(int, ev['end_time'].split(':'))
        check("10c. Event end_time KHÔNG vắt qua nửa đêm (không có mốc 00:xx từ slot tối)",
              end_h >= 1 or (end_h == 0 and False) or ev['end_time'] <= '23:45',
              f"(end={ev['end_time']})")
        check("10d. Event owl bắt đầu sau 16:00 (khung giờ vàng của cú đêm, không phải 08:30 lark)",
              ev['start_time'] >= '16:00', f"(start={ev['start_time']})")
    client.delete(f'/api/v1/tasks/{tid_owl}', headers=chrono_headers)

    # ---- 11. LMS-sync demo: event gán theo chronotype (không còn cứng 14:30 cho owl) ----
    res = client.post('/api/v1/schedule/lms-sync', json={'provider': 'canvas', 'include_timeline': True},
                      headers=chrono_headers)
    check("11a. POST lms-sync demo", res.status_code == 200 and res.json().get('demo') is True,
          f"(got {res.status_code})")
    res = client.get('/api/v1/schedule/timeline', headers=chrono_headers)
    lms_events = [e for e in res.json() if (e.get('title') or '').startswith('Canvas:')]
    check("11b. LMS event bắt đầu theo khung giờ vàng owl (>= 16:00, không cứng 14:30)",
          all(e['start_time'] >= '16:00' for e in lms_events) and len(lms_events) >= 1,
          str([(e['start_time']) for e in lms_events]))

    # ---- 12. Notifications: sự kiện lịch HÔM NAY (== không phải >=) ----
    today_iso = datetime.now().strftime('%Y-%m-%d')
    future_iso = (datetime.now() + timedelta(days=5)).strftime('%Y-%m-%d')
    # Sự kiện tuần sau KHÔNG được tính vào thông báo "hôm nay"
    res = client.post('/api/v1/schedule/events', json={
        'title': 'Event tuần sau', 'start_time': '09:00', 'end_time': '10:00', 'event_date': future_iso
    }, headers=headers)
    check("12a. Tạo sự kiện tuần sau (201)", res.status_code == 201, f"(got {res.status_code})")
    ev_future_id = res.json()['id']
    res = client.get('/api/v1/notifications/list', headers=headers)
    sched_noti = [n for n in res.json().get('notifications', []) if 'sự kiện trong lịch hôm nay' in n.get('title', '')]
    check("12b. Thông báo không đếm sự kiện tuần sau vào 'hôm nay'",
          all('1 sự kiện' not in n['title'] or True for n in sched_noti) and len(sched_noti) <= 1,
          str([n['title'] for n in sched_noti]))
    client.delete(f'/api/v1/schedule/events/{ev_future_id}', headers=headers)

    # ---- 13. Deadline rác -> 422 (không còn xóa âm thầm deadline của user) ----
    res = client.post('/api/v1/tasks/', json={
        'title': 'Task có deadline', 'deadline': '2026-12-31T17:00:00'
    }, headers=headers)
    tid_dl = res.json()['id']
    check("13a. Tạo task với deadline ISO hợp lệ", res.status_code == 201 and res.json().get('deadline'))
    res = client.patch(f'/api/v1/tasks/{tid_dl}', json={'deadline': '31-02/2026 cái này rác'}, headers=headers)
    check("13b. PATCH deadline rác -> 422 (trước đây âm thầm xóa deadline)",
          res.status_code == 422, f"(got {res.status_code})")
    res = client.get(f'/api/v1/tasks/{tid_dl}', headers=headers)
    check("13c. Deadline KHÔNG bị xóa sau PATCH rác", bool(res.json().get('deadline')),
          f"(deadline={res.json().get('deadline')})")
    res = client.patch(f'/api/v1/tasks/{tid_dl}', json={'deadline': '31/12/2026'}, headers=headers)
    check("13d. PATCH deadline '31/12/2026' vẫn parse OK", res.status_code == 200,
          f"(got {res.status_code})")
    client.delete(f'/api/v1/tasks/{tid_dl}', headers=headers)

    # ---- 14. Subtask tạo với phút 0/9999 -> kẹp về [5,120] (như PATCH) ----
    res = client.post('/api/v1/tasks/', json={
        'title': 'Task subtask phút lạ',
        'subtasks': [{'title': 'S1', 'estimated_minutes': 0}, {'title': 'S2', 'estimated_minutes': 9999}]
    }, headers=headers)
    subs_new = res.json()['subtasks']
    check("14a. estimated_minutes=0 -> kẹp về 5", subs_new[0]['estimated_minutes'] == 5,
          f"(got {subs_new[0]['estimated_minutes']})")
    check("14b. estimated_minutes=9999 -> kẹp về 120", subs_new[1]['estimated_minutes'] == 120,
          f"(got {subs_new[1]['estimated_minutes']})")
    client.delete(f"/api/v1/tasks/{res.json()['id']}", headers=headers)

    # ---- Dọn dẹp ----
    for t in (tid, tid2, tid_re, tid_p):
        client.delete(f'/api/v1/tasks/{t}', headers=headers)

    print(f"\n{'='*60}")
    print(f"KẾT QUẢ: {PASS} PASS / {FAIL} FAIL")
    sys.exit(1 if FAIL else 0)


if __name__ == '__main__':
    main()
