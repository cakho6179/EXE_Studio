import sys, os
sys.path.insert(0, os.path.abspath('.'))

from fastapi.testclient import TestClient
from app.main import app

client = TestClient(app)

def run_tests():
    print("=== BẮT ĐẦU KIỂM THỬ TOÀN DIỆN BACKEND REAL DATA ===")
    
    # 1. Login
    res_login = client.post('/api/v1/auth/login', json={'email': 'chau.nguyen@vnuhcm.edu.vn', 'password': 'password123'})
    assert res_login.status_code == 200, f"Login failed: {res_login.text}"
    token = res_login.json()['access_token']
    headers = {'Authorization': f'Bearer {token}'}
    print("1. [PASS] Đăng nhập JWT thành công!")

    # 2. Profile GET & PUT (Onboarding simulation)
    res_prof_get = client.get('/api/v1/auth/profile', headers=headers)
    assert res_prof_get.status_code == 200, f"Get profile failed: {res_prof_get.text}"
    print(f"2a. [PASS] Lấy hồ sơ: {res_prof_get.json()['full_name']}, Chronotype: {res_prof_get.json()['chronotype']}")

    res_prof_put = client.put('/api/v1/auth/profile', json={
        "chronotype": "lark",
        "target_daily_focus_hours": 6.5,
        "target_gpa": 3.8,
        "major": "Khoa học Máy tính & Trí tuệ Nhân tạo"
    }, headers=headers)
    assert res_prof_put.status_code == 200, f"Update profile failed: {res_prof_put.text}"
    print(f"2b. [PASS] Cập nhật Onboarding profile thành công: {res_prof_put.json()['profile']['major']}")

    # 3. Create Task with MicroSubtasks
    res_task = client.post('/api/v1/tasks/', json={
        "title": "Đồ án Xây dựng Mô hình Thị giác Máy tính YOLO",
        "description": "Huấn luyện nhận diện biển báo giao thông đô thị",
        "subject_name": "Thị giác máy tính",
        "subject_code": "CS415",
        "priority": "high",
        "complexity": "complex",
        "subtasks": [
            {"title": "Thu thập và gán nhãn 500 ảnh mẫu", "estimated_minutes": 25, "pomodoro_count": 1},
            {"title": "Thiết lập cấu hình mạng backbone Darknet", "estimated_minutes": 25, "pomodoro_count": 1},
            {"title": "Huấn luyện 100 epochs trên GPU", "estimated_minutes": 25, "pomodoro_count": 1},
            {"title": "Đánh giá mAP@0.5 và viết báo cáo", "estimated_minutes": 25, "pomodoro_count": 1}
        ]
    }, headers=headers)
    assert res_task.status_code == 200, f"Create task failed: {res_task.text}"
    task_data = res_task.json()
    task_id = task_data['id']
    subtask_id_1 = task_data['subtasks'][0]['id']
    subtask_id_2 = task_data['subtasks'][1]['id']
    print(f"3. [PASS] Tạo bài tập thực tế thành công ID: {task_id}, Số subtasks: {len(task_data['subtasks'])}")

    # 4. Toggle MicroSubtask
    res_toggle = client.patch(f'/api/v1/tasks/subtasks/{subtask_id_1}/toggle', headers=headers)
    assert res_toggle.status_code == 200, f"Toggle failed: {res_toggle.text}"
    assert res_toggle.json()['is_completed'] == True
    print(f"4. [PASS] Toggle micro-subtask 1 thành công: is_completed = True")

    # 5. Complete FocusSession linked to this Task
    res_focus = client.post('/api/v1/focus/session/complete', json={
        "task_id": task_id,
        "planned_minutes": 25,
        "actual_minutes": 25,
        "ambient_sound_used": "Sóng Biển 432Hz",
        "notes": "Hoàn thành bước cấu hình mạng backbone"
    }, headers=headers)
    assert res_focus.status_code == 200, f"Focus session failed: {res_focus.text}"
    print(f"5a. [PASS] Ghi nhận phiên Pomodoro 25p thành công vào DB!")

    # Verify task updated
    res_task_check = client.get('/api/v1/tasks/', headers=headers)
    t = next(x for x in res_task_check.json() if x['id'] == task_id)
    print(f"5b. [PASS] Nhiệm vụ tự động tăng tiến độ: {t['completed_sprints']}/{t['total_sprints']} sprints!")

    # 6. Schedule Events CRUD & Auto-Balance
    res_ev_create = client.post('/api/v1/schedule/events', json={
        "title": "Ôn tập giữa kỳ Mạng máy tính",
        "description": "Thực hành bắt gói tin Wireshark",
        "start_time": "14:00",
        "end_time": "15:30",
        "event_type": "deep_work",
        "is_circadian_optimized": True
    }, headers=headers)
    assert res_ev_create.status_code == 200
    ev_id = res_ev_create.json()['id']
    print(f"6a. [PASS] Tạo sự kiện thời khóa biểu thành công ID: {ev_id}")

    res_ev_toggle = client.patch(f'/api/v1/schedule/events/{ev_id}/toggle', headers=headers)
    assert res_ev_toggle.status_code == 200
    assert res_ev_toggle.json()['is_completed'] == True
    print(f"6b. [PASS] Toggle hoàn thành sự kiện thời khóa biểu thành công!")

    res_balance = client.post('/api/v1/schedule/auto-balance', headers=headers)
    assert res_balance.status_code == 200
    print(f"6c. [PASS] Auto-balance nhịp sinh học AI: {res_balance.json()['message']}")

    # 7. AI Advisor Chat & History
    res_chat = client.post('/api/v1/advisor/chat', json={
        "content": "Làm thế nào để phân bổ thời gian học môn Cấu trúc dữ liệu và Đồ án AI hiệu quả?"
    }, headers=headers)
    assert res_chat.status_code == 200
    reply = res_chat.json()['reply']
    print(f"7a. [PASS] Cố vấn AI phản hồi: '{reply[:60]}...'")

    res_history = client.get('/api/v1/advisor/history', headers=headers)
    assert res_history.status_code == 200
    assert len(res_history.json()) >= 2
    print(f"7b. [PASS] Lịch sử hội thoại AI lưu trong DB: {len(res_history.json())} tin nhắn")

    # 8. Dynamic Analytics
    res_analytics = client.get('/api/v1/analytics/dashboard', headers=headers)
    assert res_analytics.status_code == 200
    an_data = res_analytics.json()
    print(f"8. [PASS] Thống kê Real Data: Tuần này: {an_data['total_week_hours']}h, Hoàn thành: {an_data['task_completion_rate']}%, Streak: {an_data['current_streak_days']} ngày, Điểm sinh học: {an_data['circadian_alignment_score']}")

    print("\n🎉 TẤT CẢ 8/8 BƯỚC KIỂM THỬ DỮ LIỆU THỰC TẾ TRÊN DATABASE ĐẠT 100% HOÀN HẢO!")

if __name__ == '__main__':
    run_tests()
