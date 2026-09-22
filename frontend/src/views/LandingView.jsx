import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext.jsx';
import { useToast } from '../contexts/ToastContext.jsx';

const PILLARS = [
  {
    iconBg: 'bg-brand-100 text-brand-600',
    title: '1. Nhịp sinh học thông minh',
    desc: 'Tự động nhận diện khung giờ não bộ đạt phong độ cao nhất (Chronotype) để xếp lịch cho môn khó, tránh học dồn lúc mệt mỏi.',
    foot: 'Học đúng thời điểm',
    footColor: 'text-brand-700',
    path: 'M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z',
  },
  {
    iconBg: 'bg-teal-100 text-teal-600',
    title: '2. Không gian tĩnh lặng 432Hz',
    desc: 'Tích hợp âm thanh sóng biển ngọn hải đăng tần số 432Hz kết hợp Lofi thư thái, kích hoạt sóng não Alpha giúp định tâm tuyệt đối.',
    foot: 'Giảm căng thẳng tức thì',
    footColor: 'text-teal-700',
    path: 'M9 19V6l12-3v13M9 19c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zm12-3c0 1.105-1.343 2-3 2s-3-.895-3-2 1.343-2 3-2 3 .895 3 2zM9 10l12-3',
  },
  {
    iconBg: 'bg-amber-100 text-amber-600',
    title: '3. Chia nhỏ đồ án AI',
    desc: 'Nhập tên đề tài lớn hoặc luận văn, AI sẽ rã nhỏ thành từng đầu việc vi mô khả thi (Micro-tasks) có thời lượng rõ ràng và deadline vừa sức.',
    foot: 'Nói không với quá tải',
    footColor: 'text-amber-700',
    path: 'M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10',
  },
  {
    iconBg: 'bg-indigo-100 text-indigo-600',
    title: '4. Đồng bộ Canvas & LMS',
    desc: 'Đồng bộ tự động thời khóa biểu, hạn nộp bài từ Canvas LMS, Moodle, Google Classroom mà không mất thời gian nhập thủ công.',
    foot: 'Đồng bộ 1 chạm',
    footColor: 'text-indigo-700',
    path: 'M13.828 10.172a4 4 0 00-5.656 0l-4 4a4 4 0 105.656 5.656l1.102-1.101m-.758-4.899a4 4 0 005.656 0l4-4a4 4 0 00-5.656-5.656l-1.1 1.1',
  },
];

export default function LandingView() {
  const { isLoggedIn, guestLogin } = useAuth();
  const { showToast } = useToast();
  const navigate = useNavigate();
  const [guestLoading, setGuestLoading] = useState(false);

  async function oneTouch() {
    if (isLoggedIn) {
      navigate('/dashboard');
      return;
    }
    setGuestLoading(true);
    try {
      await guestLogin();
      showToast('Chào mừng đến Stuđiô AI! Đây là tài khoản demo.', 'success');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      showToast(err?.message || 'Không vào được demo.', 'error');
    } finally {
      setGuestLoading(false);
    }
  }

  // Nút "Bắt đầu bản Miễn Phí": đã login -> vào app, chưa -> sang đăng ký
  function goRegister() {
    navigate(isLoggedIn ? '/dashboard' : '/register');
  }

  async function goDeepWork() {
    if (!isLoggedIn) {
      try {
        await guestLogin();
      } catch {
        /* nếu lỗi thì vẫn navigate để router xử lý */
      }
    }
    navigate('/deepwork?duration=50&sound=ocean&title=' + encodeURIComponent('Phiên tập trung sâu 50m'));
  }

  return (
    <div
      className="bg-lighthouse-scenery text-slate-800 antialiased min-h-screen flex flex-col font-sans selection:bg-brand-500 selection:text-white"
      style={{
        backgroundImage: "url('/assets/images/lighthouse-wide.png')",
        backgroundSize: 'cover',
        backgroundPosition: 'center top',
        backgroundAttachment: 'fixed',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* BEGIN: MainHeader */}
      <header className="sticky top-0 z-50 glass-nav transition-all duration-300">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-20 flex items-center justify-between">
          <div className="flex items-center space-x-3">
            <Link to="/" className="flex items-center space-x-3 group">
              <div className="relative w-11 h-11 flex-shrink-0">
                <img
                  alt="Stuđiô AI Logo"
                  className="w-full h-full object-contain filter drop-shadow-sm group-hover:scale-105 transition-transform"
                  src="/assets/images/logo.png"
                />
              </div>
              <div>
                <div className="flex items-center space-x-2">
                  <span className="text-xl font-bold tracking-tight text-slate-900">
                    Stuđiô <span className="text-brand-600">AI</span>
                  </span>
                  <span className="text-[10px] uppercase font-semibold px-2 py-0.5 rounded-full bg-brand-50 text-brand-700 border border-brand-200">
                    Calm Workspace
                  </span>
                </div>
                <p className="text-[11px] text-slate-500 hidden sm:block">Nhịp sinh học &amp; Tĩnh tâm học tập</p>
              </div>
            </Link>
          </div>
          <nav className="hidden md:flex items-center space-x-8 text-sm font-medium text-slate-700">
            <a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Tính năng chính</a>
            <a className="hover:text-brand-600 transition-colors" href="#nhip-sinh-hoc">Nhịp sinh học AI</a>
            <a className="hover:text-brand-600 transition-colors" href="#am-thanh-432hz">Âm thanh 432Hz</a>
            <a className="hover:text-brand-600 transition-colors" href="#bang-gia">Bảng giá Sinh viên</a>
          </nav>
          <div className="flex items-center space-x-3 sm:space-x-4">
            {isLoggedIn ? (
              <Link
                to="/dashboard"
                className="inline-flex items-center justify-center px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 shadow-md shadow-brand-500/25 transition-all hover:shadow-lg active:scale-95"
              >
                Vào học →
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="text-xs sm:text-sm font-medium text-slate-700 hover:text-brand-600 transition-colors px-2 py-1.5"
                >
                  Đăng nhập
                </Link>
                <button
                  type="button"
                  onClick={oneTouch}
                  disabled={guestLoading}
                  className="inline-flex items-center justify-center px-4 py-2.5 text-xs sm:text-sm font-bold rounded-xl text-white bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 shadow-md shadow-brand-500/25 transition-all hover:shadow-lg active:scale-95 disabled:opacity-60"
                >
                  🚀 {guestLoading ? 'Đang vào…' : 'Trải nghiệm ngay'}
                </button>
              </>
            )}
          </div>
        </div>
      </header>
      {/* END: MainHeader */}

      <main className="flex-grow">
        {/* BEGIN: HeroSection */}
        <section className="relative pt-12 pb-20 md:pt-20 md:pb-28 overflow-hidden">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-12">
              <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full glass-card border border-brand-200/80 mb-6 text-xs font-semibold text-brand-800">
                <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                Được thiết kế nhằm giảm 82% tình trạng kiệt sức học đường (Burnout)
              </div>
              <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-6">
                Học tập sâu trong{' '}
                <span className="text-transparent bg-clip-text bg-gradient-to-r from-brand-600 to-indigo-600">
                  sự tĩnh lặng
                </span>
                . <br className="hidden sm:inline" />
                Điều phối theo nhịp sinh học.
              </h1>
              <p className="text-base sm:text-lg text-slate-600 leading-relaxed max-w-2xl mx-auto mb-8 font-normal">
                Stuđiô AI kết hợp trí tuệ nhân tạo điều phối chu kỳ năng lượng tự nhiên với âm hưởng sóng não 432Hz
                ven bờ biển, giúp sinh viên tự tin làm chủ đồ án mà không cần thức trắng đêm.
              </p>
              <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5">
                <button
                  type="button"
                  id="hero-primary-cta"
                  onClick={oneTouch}
                  disabled={guestLoading}
                  className="w-full sm:w-auto inline-flex items-center justify-center px-7 py-3.5 rounded-xl bg-gradient-to-r from-brand-600 to-indigo-600 hover:from-brand-700 hover:to-indigo-700 text-white font-bold shadow-lg shadow-brand-500/30 hover:shadow-xl transition-all active:scale-98 disabled:opacity-60"
                >
                  <span className="mr-2 text-lg">🚀</span>
                  {guestLoading ? 'Đang mở không gian…' : 'Trải nghiệm ngay 1-chạm (Vào Dashboard)'}
                </button>
                <Link
                  to="/login"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-6 py-3.5 rounded-xl glass-card text-slate-700 hover:text-brand-700 hover:bg-white/95 font-medium transition-all"
                >
                  <svg className="w-5 h-5 mr-2 text-slate-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth="2"
                      d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"
                    />
                  </svg>
                  Đăng nhập tài khoản
                </Link>
                <Link
                  to="/sound"
                  className="w-full sm:w-auto inline-flex items-center justify-center px-5 py-3.5 rounded-xl glass-card text-slate-700 hover:text-brand-700 hover:bg-white/95 font-medium transition-all"
                >
                  <svg className="w-5 h-5 mr-2 text-brand-600" fill="currentColor" viewBox="0 0 24 24">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                  Thử âm thanh 432Hz
                </Link>
              </div>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600">
              <div className="flex items-center space-x-1.5">
                <svg className="w-4 h-4 text-amber-500" fill="currentColor" viewBox="0 0 20 20">
                  <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
                </svg>
                <span className="font-medium text-slate-800">4.9/5</span> từ 50,000+ sinh viên Đại học
              </div>
              <span className="text-slate-300">•</span>
              <div>Tương thích Canvas, Notion &amp; Google Classroom</div>
            </div>
          </div>

          {/* Interactive Dashboard Mockup */}
          <div className="relative max-w-5xl mx-auto mt-12 px-4 sm:px-6 lg:px-8" data-purpose="mockup-showcase">
            <div className="absolute -inset-1 bg-gradient-to-r from-amber-200/50 via-brand-300/40 to-indigo-300/50 rounded-3xl blur-xl opacity-75" />
            <div className="relative glass-card rounded-2xl p-4 sm:p-6 shadow-2xl border border-white/80">
              <div className="flex flex-wrap items-center justify-between pb-4 mb-4 border-b border-slate-200/60 gap-3">
                <div className="flex items-center space-x-2">
                  <span className="w-3 h-3 rounded-full bg-rose-400 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-amber-400 inline-block" />
                  <span className="w-3 h-3 rounded-full bg-emerald-400 inline-block" />
                  <span className="ml-2 text-xs font-semibold text-slate-600 bg-white/70 px-2.5 py-1 rounded-md">
                    Không gian tập trung: Chiều hoàng hôn ngọn hải đăng
                  </span>
                </div>
                <div className="flex items-center space-x-3 text-xs text-slate-600">
                  <span className="flex items-center gap-1.5 bg-emerald-50 text-emerald-700 font-medium px-2.5 py-1 rounded-lg border border-emerald-200">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-ping" />
                    Nhịp năng lượng cao (14:00 - 16:30)
                  </span>
                  <button
                    onClick={goDeepWork}
                    className="bg-brand-500 hover:bg-brand-600 text-white font-medium px-3 py-1 rounded-lg transition-colors"
                    type="button"
                  >
                    Bắt đầu phiên sâu (50m)
                  </button>
                </div>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
                <div className="md:col-span-3 bg-white/60 p-3 rounded-xl border border-white/70 flex flex-col justify-between space-y-4">
                  <div className="space-y-2">
                    <p className="text-[11px] font-bold text-slate-400 uppercase tracking-wider">Lịch trình hôm nay</p>
                    <div className="p-2.5 bg-white/90 rounded-lg border border-brand-200 text-xs shadow-sm">
                      <div className="font-semibold text-brand-900">Phân tích dữ liệu đồ án</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">14:00 - 15:30 • Nhịp Alpha tối ưu</div>
                    </div>
                    <div className="p-2.5 bg-white/50 rounded-lg text-xs hover:bg-white/80 transition-colors">
                      <div className="font-medium text-slate-700">Ôn tập Triết học Mác-Lênin</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">16:45 - 17:30 • Ghi nhớ ngắt quãng</div>
                    </div>
                    <div className="p-2.5 bg-white/50 rounded-lg text-xs hover:bg-white/80 transition-colors">
                      <div className="font-medium text-slate-700">Tĩnh tâm &amp; Phục hồi não bộ</div>
                      <div className="text-[11px] text-slate-500 mt-0.5">21:00 • Sóng biển hoàng hôn</div>
                    </div>
                  </div>
                  <div className="bg-gradient-to-br from-slate-900 to-brand-950 text-white p-3 rounded-xl shadow">
                    <div className="flex items-center justify-between text-xs mb-1.5">
                      <span className="font-medium text-brand-200 text-[11px]">Sóng ngọn hải đăng</span>
                      <span className="text-[10px] bg-brand-500/30 px-1.5 py-0.5 rounded text-brand-200">432Hz</span>
                    </div>
                    <p className="text-[11px] text-slate-300">Gió biển &amp; Lofi dịu êm</p>
                    <div className="w-full bg-slate-700 h-1 rounded-full mt-2 overflow-hidden">
                      <div className="bg-brand-400 h-full w-2/3" />
                    </div>
                  </div>
                </div>
                <div className="md:col-span-9 space-y-3">
                  <div className="p-3 bg-gradient-to-r from-amber-50 to-orange-50/80 rounded-xl border border-amber-200/80 flex items-start space-x-3">
                    <div className="w-7 h-7 rounded-lg bg-amber-500 text-white flex items-center justify-center flex-shrink-0 font-bold text-xs mt-0.5">
                      AI
                    </div>
                    <div className="text-xs">
                      <span className="font-semibold text-amber-900">Gợi ý sinh học cho bạn:</span>
                      <span className="text-amber-800">
                        {' '}Khả năng tập trung logic của bạn đang đạt đỉnh điểm (14:30). Đã tự động chia nhỏ{' '}
                        <b>Đề tài Tốt nghiệp</b> thành 3 phần việc nhỏ để giảm áp lực thần kinh.
                      </span>
                    </div>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="bg-white/70 p-3 rounded-xl border border-white/80">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2.5">
                        <span>Cần làm ngay</span>
                        <span className="bg-slate-200 text-slate-600 text-[10px] px-1.5 py-0.5 rounded">2</span>
                      </div>
                      <div className="space-y-2">
                        <div className="p-2.5 bg-white rounded-lg shadow-2xs border border-slate-100 text-xs">
                          <span className="text-[10px] font-semibold text-brand-600 uppercase">Chương 2</span>
                          <p className="font-medium text-slate-800 mt-1">Đọc 3 bài báo khoa học về NLP</p>
                          <p className="text-[10px] text-slate-400 mt-1">Ước tính: 45 phút • Không quá sức</p>
                        </div>
                      </div>
                    </div>
                    <div className="bg-brand-50/70 p-3 rounded-xl border border-brand-100">
                      <div className="flex items-center justify-between text-xs font-semibold text-brand-800 mb-2.5">
                        <span>Đang giải quyết</span>
                        <span className="bg-brand-200 text-brand-800 text-[10px] px-1.5 py-0.5 rounded">1</span>
                      </div>
                      <div className="p-2.5 bg-white rounded-lg shadow-sm border border-brand-200 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] font-semibold text-indigo-600 uppercase">Coding Sprint</span>
                          <span className="text-[10px] text-emerald-600 font-bold">25:00</span>
                        </div>
                        <p className="font-medium text-slate-900 mt-1">Viết hàm chuẩn hóa văn bản</p>
                        <div className="mt-2 flex items-center justify-between text-[10px] text-slate-500">
                          <span>Nhạc nền: Sóng biển 432Hz</span>
                          <span className="text-brand-600 font-medium">Bật</span>
                        </div>
                      </div>
                    </div>
                    <div className="bg-white/70 p-3 rounded-xl border border-white/80">
                      <div className="flex items-center justify-between text-xs font-semibold text-slate-700 mb-2.5">
                        <span>Hoàn thành (Hôm nay)</span>
                        <span className="bg-emerald-100 text-emerald-700 text-[10px] px-1.5 py-0.5 rounded">3</span>
                      </div>
                      <div className="space-y-2">
                        <div className="p-2.5 bg-white/90 rounded-lg text-xs opacity-80 line-through text-slate-400 border border-slate-100">
                          Nộp dàn ý tuần 4 lên LMS Canvas
                        </div>
                        <div className="p-2.5 bg-white/90 rounded-lg text-xs opacity-80 line-through text-slate-400 border border-slate-100">
                          Duyệt slide thuyết trình nhóm
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* END: HeroSection */}

        {/* BEGIN: PillarsFeatures */}
        <section className="py-16 md:py-24 relative" id="tinh-nang">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-3xl mx-auto mb-16">
              <h2 className="text-xs font-bold tracking-widest text-brand-700 uppercase mb-2">
                Trụ cột phát triển bản thân
              </h2>
              <p className="text-3xl sm:text-4xl font-extrabold text-slate-900 tracking-tight">
                Tại sao lại thúc ép bản thân đến kiệt sức khi bạn có thể học theo nhịp sinh học?
              </p>
              <p className="text-slate-600 mt-4 text-base">
                Phương pháp học tập khoa học kết hợp công nghệ AI giúp bạn cân bằng hoàn hảo giữa hiệu suất tối đa và
                sức khỏe tinh thần bền vững.
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
              {PILLARS.map((p) => (
                <div
                  key={p.title}
                  id={p.title.includes('432Hz') ? 'am-thanh-432hz' : undefined}
                  className="glass-card glass-card-hover rounded-2xl p-6 flex flex-col justify-between scroll-mt-24"
                >
                  <div>
                    <div className={`w-12 h-12 rounded-xl ${p.iconBg} flex items-center justify-center mb-5`}>
                      <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path d={p.path} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-bold text-slate-900 mb-2">{p.title}</h3>
                    <p className="text-sm text-slate-600 leading-relaxed">{p.desc}</p>
                  </div>
                  <div className={`mt-6 pt-4 border-t border-slate-200/50 text-xs ${p.footColor} font-semibold flex items-center`}>
                    <span>{p.foot}</span>
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path d="M9 5l7 7-7 7" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" />
                    </svg>
                  </div>
                </div>
              ))}
            </div>
            <div id="nhip-sinh-hoc" className="scroll-mt-24" />
          </div>
        </section>
        {/* END: PillarsFeatures */}

        {/* BEGIN: PricingSection */}
        <section className="py-16 md:py-24 relative" id="bang-gia">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="text-center max-w-2xl mx-auto mb-14">
              <span className="text-xs font-bold text-brand-700 uppercase tracking-widest">Đầu tư cho sự an tâm</span>
              <h2 className="text-3xl sm:text-4xl font-extrabold text-slate-900 mt-2">
                Bảng giá thiết kế riêng cho Sinh viên
              </h2>
              <p className="text-slate-600 mt-3 text-sm sm:text-base">
                Ưu đãi giảm giá 50% trọn đời khi đăng ký bằng email có đuôi <b>.edu.vn</b>
              </p>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-8 max-w-4xl mx-auto">
              <div className="glass-card rounded-2xl p-8 flex flex-col justify-between border-slate-200/80">
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-900">Bản Miễn Phí (Cơ bản)</h3>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-slate-100 text-slate-700 rounded-full">
                      Trọn đời
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-6">
                    Thích hợp cho sinh viên bắt đầu rèn luyện sự tập trung nhẹ nhàng.
                  </p>
                  <div className="text-4xl font-extrabold text-slate-900 mb-6">
                    0đ <span className="text-sm font-normal text-slate-500">/ tháng</span>
                  </div>
                  <ul className="space-y-3.5 text-xs text-slate-700 mb-8">
                    {[
                      'Bộ đếm nhịp sinh học cá nhân cơ bản',
                      '2 không gian âm thanh thư giãn (Sóng biển & Mưa nhẹ)',
                      'Chia nhỏ tối đa 3 đồ án / tháng bằng AI',
                    ].map((f) => (
                      <li key={f} className="flex items-center">
                        <svg className="w-4 h-4 text-emerald-500 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            clipRule="evenodd"
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          />
                        </svg>
                        {f}
                      </li>
                    ))}
                    <li className="flex items-center text-slate-400">
                      <svg className="w-4 h-4 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                        <path
                          clipRule="evenodd"
                          fillRule="evenodd"
                          d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z"
                        />
                      </svg>
                      Tích hợp tự động Canvas LMS
                    </li>
                  </ul>
                </div>
                <button
                  onClick={goRegister}
                  className="w-full py-3 px-4 rounded-xl border border-slate-300 text-slate-700 font-semibold hover:bg-slate-50 transition-colors text-xs"
                  type="button"
                >
                  Bắt đầu bản Miễn Phí
                </button>
              </div>
              <div className="glass-card rounded-2xl p-8 flex flex-col justify-between border-2 border-brand-500 shadow-xl relative overflow-hidden bg-white/95">
                <div className="absolute top-0 right-0 bg-brand-600 text-white text-[10px] font-bold px-3 py-1 rounded-bl-xl uppercase tracking-wider">
                  Khuyên dùng
                </div>
                <div>
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="text-xl font-bold text-slate-900">Stuđiô Pro Sinh Viên</h3>
                    <span className="text-xs font-semibold px-2.5 py-1 bg-brand-100 text-brand-800 rounded-full">
                      Email .edu
                    </span>
                  </div>
                  <p className="text-xs text-slate-500 mb-6">
                    Trợ thủ đắc lực cho sinh viên làm đồ án, ôn thi học kỳ và rèn luyện lối sống cân bằng.
                  </p>
                  <div className="flex items-baseline mb-6">
                    <span className="text-4xl font-extrabold text-brand-700">39.000đ</span>
                    <span className="text-sm text-slate-500 ml-2">/ tháng</span>
                    <span className="text-xs text-slate-400 line-through ml-2">79.000đ</span>
                  </div>
                  <ul className="space-y-3.5 text-xs text-slate-700 mb-8">
                    {[
                      'Toàn bộ tính năng phân tích nhịp sinh học nâng cao',
                      'Kho thư viện âm thanh 432Hz & Lofi ngọn hải đăng không giới hạn',
                      'Không giới hạn chia nhỏ đồ án và lập kế hoạch AI',
                      'Đồng bộ tức thời Canvas LMS, Notion, Google Calendar',
                    ].map((f) => (
                      <li key={f} className="flex items-center">
                        <svg className="w-4 h-4 text-brand-600 mr-2 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            clipRule="evenodd"
                            fillRule="evenodd"
                            d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z"
                          />
                        </svg>
                        {f}
                      </li>
                    ))}
                  </ul>
                </div>
                <Link
                  to="/register"
                  id="dung-thu"
                  className="block text-center w-full py-3.5 px-4 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold shadow-md shadow-brand-500/25 transition-all text-xs"
                >
                  Kích hoạt Stuđiô Pro (.edu.vn)
                </Link>
              </div>
            </div>
          </div>
        </section>
        {/* END: PricingSection */}

        {/* BEGIN: CallToActionBanner */}
        <section className="py-12 pb-24 relative">
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="glass-card rounded-3xl p-8 sm:p-12 text-center relative overflow-hidden border border-white/90">
              <div className="relative z-10 max-w-2xl mx-auto">
                <h3 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
                  Sẵn sàng học tập hiệu quả trong sự an yên?
                </h3>
                <p className="text-sm sm:text-base text-slate-600 mb-8">
                  Tham gia cộng đồng hơn 50,000 bạn sinh viên xóa tan nỗi sợ deadline và tái tạo lại nhịp sống cân
                  bằng cùng Stuđiô AI.
                </p>
                <div className="flex flex-col sm:flex-row justify-center gap-3">
                  <Link
                    to="/register"
                    className="px-6 py-3.5 rounded-xl bg-brand-600 hover:bg-brand-700 text-white font-semibold text-sm shadow transition-all"
                  >
                    Đăng ký tài khoản sinh viên miễn phí
                  </Link>
                  <a
                    className="px-6 py-3.5 rounded-xl glass-card text-slate-700 hover:text-brand-700 font-semibold text-sm transition-all"
                    href="#tinh-nang"
                  >
                    Xem cẩm nang học tập khoa học
                  </a>
                </div>
              </div>
            </div>
          </div>
        </section>
        {/* END: CallToActionBanner */}
      </main>

      {/* BEGIN: MainFooter */}
      <footer className="glass-nav border-t border-white/80 py-12 text-slate-600 text-xs">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid grid-cols-2 md:grid-cols-5 gap-8 mb-8">
            <div className="col-span-2 space-y-3">
              <div className="flex items-center space-x-2.5">
                <img alt="Stuđiô AI" className="w-7 h-7 object-contain" src="/assets/images/logo.png" />
                <span className="text-base font-bold text-slate-900">Stuđiô AI</span>
              </div>
              <p className="text-slate-500 pr-6 leading-relaxed">
                Không gian học tập tĩnh lặng và trợ lý điều phối nhịp sinh học thông minh dành cho sinh viên thế hệ
                mới. Nuôi dưỡng tri thức và bảo vệ sức khỏe tâm lý.
              </p>
              <div className="text-[11px] text-slate-400 pt-2">© 2025 Stuđiô AI Inc. Bảo lưu toàn bộ quyền.</div>
            </div>
            <div className="space-y-2.5">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Sản phẩm</h4>
              <ul className="space-y-2">
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Bộ điều phối nhịp sinh học</a></li>
                <li><a className="hover:text-brand-600 transition-colors" href="#am-thanh-432hz">Âm thanh 432Hz ngọn hải đăng</a></li>
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">AI chia nhỏ đồ án</a></li>
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Tích hợp Canvas LMS</a></li>
              </ul>
            </div>
            <div className="space-y-2.5">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Dành cho Sinh viên</h4>
              <ul className="space-y-2">
                <li><a className="hover:text-brand-600 transition-colors" href="#bang-gia">Gói sinh viên .edu.vn</a></li>
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Cẩm nang chống Burnout</a></li>
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Cộng đồng học sâu Discord</a></li>
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Đại sứ học đường Stuđiô</a></li>
              </ul>
            </div>
            <div className="space-y-2.5">
              <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">Chính sách &amp; Học thuật</h4>
              <ul className="space-y-2">
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Bảo vệ dữ liệu học thuật</a></li>
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Điều khoản dịch vụ</a></li>
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Cam kết liêm chính học thuật</a></li>
                <li><a className="hover:text-brand-600 transition-colors" href="#tinh-nang">Liên hệ hỗ trợ</a></li>
              </ul>
            </div>
          </div>
          <div className="pt-6 border-t border-slate-200/60 flex flex-col sm:flex-row items-center justify-between text-slate-400 gap-4 text-[11px]">
            <div>Thiết kế với cảm hứng hòa mình vào thiên nhiên và nhịp sống thanh bình ven biển.</div>
            <div className="flex space-x-4">
              <a className="hover:underline" href="#tinh-nang">Bảo mật</a>
              <span>•</span>
              <a className="hover:underline" href="#tinh-nang">Quyền riêng tư</a>
              <span>•</span>
              <a className="hover:underline" href="#tinh-nang">Cookies</a>
            </div>
          </div>
        </div>
      </footer>
      {/* END: MainFooter */}
    </div>
  );
}
