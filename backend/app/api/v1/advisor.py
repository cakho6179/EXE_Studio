from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from sqlalchemy.orm import Session
from typing import List, Optional
from datetime import datetime
from pathlib import Path
from pydantic import BaseModel
from app.core.database import get_db
from app.core.cache import cached_response
from app.models.entities import User, UserProfile, Task, ChatSession, ChatMessage
from app.api.v1.auth import get_current_user
from app.services.ai_service import AIService
from app.schemas.all_schemas import ChatMessageCreate, ChatMessageOut

router = APIRouter()

class ChatSessionOut(BaseModel):
    id: str
    title: str
    created_at: datetime
    message_count: int = 0


@router.post("/chat")
async def chat_with_advisor(
    msg_in: ChatMessageCreate,
    session_id: Optional[str] = None,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    # Dùng session được chọn, fallback phiên mới nhất
    session = None
    if session_id:
        session = db.query(ChatSession).filter(
            ChatSession.id == session_id, ChatSession.user_id == current_user.id
        ).first()
    if not session:
        session = db.query(ChatSession).filter(
            ChatSession.user_id == current_user.id
        ).order_by(ChatSession.created_at.desc()).first()
    if not session:
        session = ChatSession(user_id=current_user.id, title="Cố vấn Học thuật AI")
        db.add(session)
        db.commit()
        db.refresh(session)

    content_text = (msg_in.content or msg_in.message or "").strip()
    if not content_text:
        raise HTTPException(status_code=422, detail="Nội dung tin nhắn không được để trống.")

    # Save user message
    user_msg = ChatMessage(session_id=session.id, sender="user", content=content_text)
    db.add(user_msg)
    db.commit()

    # Query student profile and active tasks to enrich user_context
    profile = db.query(UserProfile).filter(UserProfile.user_id == current_user.id).first() if msg_in.include_profile else None
    active_tasks = db.query(Task).filter(Task.user_id == current_user.id, Task.status != "completed").limit(5).all() if msg_in.include_tasks else []
    tasks_summary = [f"- {t.title} ({t.subject_name or t.subject_code}, hạn chót: {t.deadline or 'Trong tuần'})" for t in active_tasks]

    # FIX: nạp ngữ cảnh giáo trình user đã upload (tính năng "bộ nhớ AI" giờ hoạt động thật)
    doc_context = ""
    try:
        from app.models.entities import Document
        docs = db.query(Document).filter(
            Document.user_id == current_user.id,
            Document.extracted_text.isnot(None),
        ).order_by(Document.created_at.desc()).limit(3).all()
        chunks = []
        for d in docs:
            txt = (d.extracted_text or "").strip()
            if txt:
                chunks.append(f"--- Tài liệu: {d.filename} ---\n{txt[:4000]}")
        if chunks:
            doc_context = "\n\nNGỮ CẢNH GIÁO TRÌNH sinh viên đã nạp (dùng để trả lời câu hỏi liên quan):\n" + "\n".join(chunks)
    except Exception as doc_err:
        print(f"[Advisor] Không nạp được ngữ cảnh tài liệu: {doc_err}")

    user_context = {
        "full_name": current_user.full_name,
        "major": current_user.major,
        "university": current_user.university,
        "chronotype": profile.chronotype if profile else "bear",
        "wake_time": profile.wake_up_time if profile else "06:30",
        "sleep_time": profile.bed_time if profile else "23:00",
        "active_tasks": tasks_summary,
        "context_type": msg_in.context_type or "general",
    }
    advisor_reply = await AIService.chat_with_advisor(content_text, user_context, document_context=doc_context)

    # Save advisor message
    adv_msg = ChatMessage(session_id=session.id, sender="advisor", content=advisor_reply)
    db.add(adv_msg)
    db.commit()
    db.refresh(adv_msg)

    return {
        "reply": advisor_reply,
        "message_id": adv_msg.id,
        "session_id": session.id,
        "created_at": adv_msg.created_at
    }


@router.get("/sessions", response_model=List[ChatSessionOut])
@cached_response(ttl=30)
def list_sessions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # FIX N+1: 1 query gộp lấy cả message_count (trước đây: 1 query sessions +
    # N query COUNT cho từng session -> 1+N round-trip mỗi lần mở trang cố vấn)
    from sqlalchemy import func
    counts = dict(
        db.query(ChatMessage.session_id, func.count(ChatMessage.id))
        .join(ChatSession, ChatMessage.session_id == ChatSession.id)
        .filter(ChatSession.user_id == current_user.id)
        .group_by(ChatMessage.session_id)
        .all()
    )
    sessions = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.created_at.desc()).all()
    return [
        {"id": s.id, "title": s.title, "created_at": s.created_at, "message_count": counts.get(s.id, 0)}
        for s in sessions
    ]


@router.post("/new-session", response_model=ChatSessionOut)
def new_session(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    count = db.query(ChatSession).filter(ChatSession.user_id == current_user.id).count()
    session = ChatSession(user_id=current_user.id, title=f"Phiên tham vấn {count + 1}")
    db.add(session)
    db.commit()
    db.refresh(session)
    return {"id": session.id, "title": session.title, "created_at": session.created_at, "message_count": 0}


class ChatSessionUpdate(BaseModel):
    title: str


@router.patch("/sessions/{session_id}", response_model=ChatSessionOut)
def rename_session(
    session_id: str,
    payload: ChatSessionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên.")
    title = (payload.title or "").strip()
    if len(title) < 2:
        raise HTTPException(status_code=400, detail="Tên phiên quá ngắn.")
    session.title = title[:255]
    db.commit()
    db.refresh(session)
    count = db.query(ChatMessage).filter(ChatMessage.session_id == session.id).count()
    return {"id": session.id, "title": session.title, "created_at": session.created_at, "message_count": count}


@router.delete("/sessions/{session_id}")
def delete_session(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên.")
    db.query(ChatMessage).filter(ChatMessage.session_id == session.id).delete()
    db.delete(session)
    db.commit()
    return {"status": "success", "message": "Đã xóa phiên tham vấn."}


@router.get("/sessions/{session_id}/messages", response_model=List[ChatMessageOut])
def get_session_messages(
    session_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    session = db.query(ChatSession).filter(
        ChatSession.id == session_id, ChatSession.user_id == current_user.id
    ).first()
    if not session:
        raise HTTPException(status_code=404, detail="Không tìm thấy phiên.")
    return db.query(ChatMessage).filter(
        ChatMessage.session_id == session.id
    ).order_by(ChatMessage.created_at.asc()).all()

@router.get("/history", response_model=List[ChatMessageOut])
def get_chat_history(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user)
):
    """Lịch sử chat của phiên MỚI NHẤT (ổn định: luôn ORDER BY created_at DESC trước khi lấy)."""
    session = db.query(ChatSession).filter(
        ChatSession.user_id == current_user.id
    ).order_by(ChatSession.created_at.desc()).first()
    if not session:
        return []
    return db.query(ChatMessage).filter(ChatMessage.session_id == session.id).order_by(ChatMessage.created_at.asc()).all()


ALLOWED_DOC_EXTS = {".pdf", ".docx", ".tex", ".txt", ".md"}
MAX_DOC_BYTES = 25 * 1024 * 1024


def _extract_document_text(suffix: str, content: bytes) -> str:
    """Trích xuất text thật từ PDF/DOCX/TXT để AI có ngữ cảnh giáo trình.
    Thư viện chưa cài -> trả chuỗi rỗng, không làm sập luồng upload."""
    try:
        if suffix == ".pdf":
            from pypdf import PdfReader
            import io
            reader = PdfReader(io.BytesIO(content))
            return "\n".join((page.extract_text() or "") for page in reader.pages[:40])
        if suffix == ".docx":
            import docx
            import io
            doc = docx.Document(io.BytesIO(content))
            return "\n".join(p.text for p in doc.paragraphs[:500])
    except ImportError:
        print("[Studio AI] Cài 'pypdf' và 'python-docx' để đọc được nội dung PDF/DOCX.")
    except Exception as e:
        print(f"[Studio AI] Trích text tài liệu thất bại: {e}")
    return ""


@router.post("/upload")
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Nhận giáo trình thật từ sinh viên, lưu vào server và trả metadata thật."""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_DOC_EXTS:
        raise HTTPException(status_code=400, detail="Chỉ hỗ trợ PDF, DOCX, TEX, TXT, MD.")
    content = await file.read()
    if len(content) > MAX_DOC_BYTES:
        raise HTTPException(status_code=400, detail="File vượt quá 25MB.")
    if not content:
        raise HTTPException(status_code=400, detail="File rỗng.")
    upload_dir = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
    upload_dir.mkdir(exist_ok=True)
    # Chống path traversal: chỉ giữ tên gốc, loại ../, ký tự nguy hiểm và giới hạn 120 ký tự
    from app.core.constants import SAFE_FILENAME_RE
    original_name = Path(file.filename or "tai-lieu").name
    safe_name = SAFE_FILENAME_RE.sub("_", original_name)[:120]
    if not safe_name:
        safe_name = "tai-lieu"
    unique_name = f"{current_user.id}_{int(datetime.utcnow().timestamp())}_{safe_name}"
    (upload_dir / unique_name).write_bytes(content)

    # Trích text thật cho mọi định dạng (txt/md/tex decode UTF-8; PDF/DOCX qua thư viện)
    if suffix in {".txt", ".md", ".tex"}:
        try:
            text_preview = content.decode("utf-8", errors="ignore")
        except Exception:
            text_preview = ""
    else:
        text_preview = _extract_document_text(suffix, content)
    # Lưu metadata vào DB để trang Knowledge liệt kê thật
    from app.models.entities import Document
    doc = Document(
        user_id=current_user.id,
        filename=file.filename or "tai-lieu",
        stored_name=unique_name,
        size_bytes=len(content),
        text_chars=len(text_preview),
        # FIX: lưu text thật để AI advisor đọc được khi chat (trước đây chỉ đếm rồi vứt)
        extracted_text=(text_preview or None) or None,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return {
        "status": "success",
        "message": f"Đã nạp {file.filename} ({len(content) // 1024}KB) vào bộ nhớ AI.",
        "id": doc.id,
        "filename": file.filename,
        "size_kb": len(content) // 1024,
        "text_chars": len(text_preview),
        "text_preview": text_preview[:500],
    }


@router.get("/documents")
def    list_documents(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.entities import Document
    docs = db.query(Document).filter(
        Document.user_id == current_user.id
    ).order_by(Document.created_at.desc()).all()
    return {
        "documents": [
            {
                "id": d.id,
                "filename": d.filename,
                "size_kb": (d.size_bytes or 0) // 1024,
                "created_at": d.created_at,
            }
            for d in docs
        ]
    }


@router.delete("/documents/{doc_id}")
def delete_document(
    doc_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    from app.models.entities import Document
    doc = db.query(Document).filter(
        Document.id == doc_id,
        Document.user_id == current_user.id
    ).first()
    if not doc:
        raise HTTPException(status_code=404, detail="Không tìm thấy tài liệu.")

    if doc.stored_name:
        upload_dir = Path(__file__).resolve().parent.parent.parent.parent / "uploads"
        target_file = upload_dir / doc.stored_name
        if target_file.exists():
            try:
                target_file.unlink()
            except Exception:
                pass

    db.delete(doc)
    db.commit()
    return {"status": "success", "message": "Đã xóa tài liệu khỏi bộ nhớ AI."}
