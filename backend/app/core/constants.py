"""
Hằng số dùng chung của backend — tránh định nghĩa trùng lặp ở nhiều router.
"""
import re

# Thứ tự ưu tiên thật của priority dạng string ("high" > "medium" > "low").
# Trước đây schedule.py và tasks.py mỗi nơi định nghĩa một bản (DRY violation).
PRIORITY_RANK = {"high": 3, "medium": 2, "low": 1}

# Ký tự an toàn cho tên file lưu trên đĩa (chống path traversal khi upload).
# Mọi ký tự khác sẽ bị thay bằng "_" ở advisor.py.
SAFE_FILENAME_RE = re.compile(r"[^A-Za-z0-9._\- ]")
