"""
Hằng số dùng chung của backend — tránh định nghĩa trùng lặp ở nhiều router.
"""

# Thứ tự ưu tiên thật của priority dạng string ("high" > "medium" > "low").
# Trước đây schedule.py và tasks.py mỗi nơi định nghĩa một bản (DRY violation).
PRIORITY_RANK = {"high": 3, "medium": 2, "low": 1}
