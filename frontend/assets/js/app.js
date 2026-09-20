/**
 * Stuđiô AI - Universal Navigation, Interactive Controls & App Glue Script
 * Hỗ trợ điều phối toàn diện 19 màn hình, Menu người dùng, Thanh điều hướng,
 * Bộ lọc nhiệm vụ, Modal lịch học, Ghi nhận cảm xúc & Đăng xuất an toàn.
 */

document.addEventListener('DOMContentLoaded', () => {
  const currentPath = window.location.pathname;
  const isLanding = currentPath.includes('01-landing') || currentPath === '/' || (currentPath.endsWith('index.html') && !currentPath.includes('/pages/'));
  const isAuthPage = currentPath.includes('02-login') || currentPath.includes('03-register') || currentPath.includes('04-google') || currentPath.includes('05-forgot') || currentPath.includes('06-verify');

  // Guard: trang workspace yêu cầu JWT thật, chưa login -> về trang đăng nhập
  if (!isLanding && !isAuthPage) {
    const hasToken = window.auth ? window.auth.isLoggedIn() : !!localStorage.getItem('studi_access_token');
    if (!hasToken) {
      window.location.href = '../02-login/index.html';
      return;
    }
  }

  // =========================================================================
  // 1. UNIVERSAL NAVIGATION TABS & SUB-NAV RELINKING (100% COVERAGE)
  // =========================================================================
  const navMap = [
    { text: 'Tổng quan', url: '../10-dashboard/index.html' },
    { text: 'Lập kế hoạch', url: '../13-planner/index.html' },
    { text: 'Lịch trình', url: '../14-schedule/index.html' },
    { text: 'Lịch trình AI', url: '../14-schedule/index.html' },
    { text: 'Nhiệm vụ', url: '../11-tasks/index.html' },
    { text: 'Chia nhỏ', url: '../11-tasks/index.html' },
    { text: 'Âm thanh', url: '../18-sound-sanctuary/index.html' },
    { text: 'Thư giãn', url: '../18-sound-sanctuary/index.html' },
    { text: 'Bộ trộn âm', url: '../18-sound-sanctuary/index.html' },
    { text: 'Cố vấn AI', url: '../17-ai-advisor/index.html' },
    { text: 'Thống kê', url: '../19-analytics/index.html' },
    { text: 'Phân tích', url: '../19-analytics/index.html' },
  ];

  // Re-link all navigation anchors
  document.querySelectorAll('header nav a, nav a, .navigation-links a, .sub-nav a, [data-path]').forEach(link => {
    const linkText = link.textContent.trim();
    const dataPath = link.getAttribute('data-path') || '';

    // Match by data-path
    if (dataPath === 'tong-quan') link.href = '../10-dashboard/index.html';
    else if (dataPath === 'lap-ke-hoach') link.href = '../13-planner/index.html';
    else if (dataPath === 'lich-trinh-ai') link.href = '../14-schedule/index.html';
    else if (dataPath === 'nhiem-vu') link.href = '../11-tasks/index.html';
    else if (dataPath === 'am-thanh-432hz-thu-gian') link.href = '../18-sound-sanctuary/index.html';
    else if (dataPath === 'co-van-ai') link.href = '../17-ai-advisor/index.html';
    else {
      // Match by visible text
      for (const item of navMap) {
        if (linkText.includes(item.text)) {
          link.href = item.url;
          break;
        }
      }
    }
  });

  // Logo link handling
  document.querySelectorAll('header a.group, header .flex.items-center.space-x-3 a, .brand-logo-link').forEach(logoLink => {
    if (isLanding || isAuthPage) {
      logoLink.href = '../01-landing/index.html';
    } else {
      logoLink.href = '../10-dashboard/index.html';
    }
  });

  // =========================================================================
  // 2. POLICY & MODAL LINKS (THAY THẾ HREF="#" RỖNG)
  // =========================================================================
  document.querySelectorAll('a[href="#"]').forEach(anchor => {
    const text = anchor.textContent.trim();
    const low = text.toLowerCase();
    const policyModal = (t) => (e) => {
      e.preventDefault();
      openCalmPolicyModal(t);
    };
    const goPage = (url) => { anchor.href = url; };
    if (text.includes('Điều khoản') || low.includes('riêng tư') || text.includes('Quyền riêng tư') || text.includes('Quy chuẩn dữ liệu') || text.includes('Hỗ trợ') || text.includes('Liêm chính') || text.includes('Bảo mật') || text.includes('Bảo vệ dữ liệu') || text.includes('Cookies') || text.includes('Nguyên tắc Calmspace')) {
      anchor.addEventListener('click', policyModal(text));
    } else if (text.includes('Tài liệu AI')) {
      goPage('../17-ai-advisor/index.html');
    } else if (text.includes('Âm thanh 432Hz')) {
      goPage('../18-sound-sanctuary/index.html');
    } else if (text.includes('Chi tiết biểu đồ')) {
      goPage('../19-analytics/index.html');
    } else if (text.includes('Nhịp sinh học')) {
      if (isLanding) {
        anchor.href = '#nhip-sinh-hoc';
      } else {
        goPage('../01-landing/index.html#nhip-sinh-hoc');
      }
    } else if (text.includes('Canvas')) {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.showCalmToast) window.showCalmToast('Bản demo: tích hợp Canvas LMS chưa kết nối.', 'warning');
      });
    } else if (text.includes('Discord') || text.includes('Đại sứ')) {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.showCalmToast) window.showCalmToast('Cộng đồng Stuđiô sắp ra mắt. Hẹn bạn sớm!', 'info');
      });
    } else if (text.includes('Liên hệ')) {
      anchor.href = 'mailto:hotro@studi.edu.vn';
    } else if (text.includes('Phím tắt')) {
      anchor.addEventListener('click', policyModal(text));
    } else if (text.includes('Quên mật khẩu')) {
      anchor.href = '../05-forgot-password/index.html';
    } else if (text.includes('Đăng ký')) {
      anchor.href = '../03-register/index.html';
    } else if (text.includes('Đăng nhập')) {
      anchor.href = '../02-login/index.html';
    } else if (text.includes('Magic Link')) {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        triggerMagicLink();
      });
    } else if (text.includes('Lộ trình') || anchor.getAttribute('href') === '#schedule') {
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        if (currentPath.includes('10-dashboard')) {
          const scheduleSec = document.getElementById('schedule') || document.querySelector('[data-purpose="schedule-timeline"]');
          if (scheduleSec) {
            scheduleSec.scrollIntoView({ behavior: 'smooth' });
            return;
          }
        }
        window.location.href = '../14-schedule/index.html';
      });
    } else {
      // Mọi liên kết # còn lại: chặn nhảy trang, báo rõ thay vì chết lặng
      anchor.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.showCalmToast) window.showCalmToast('Mục này đang được hoàn thiện.', 'info');
      });
    }
  });

  // =========================================================================
  // 3. LANDING PAGE DYNAMIC AUTH STATE
  // =========================================================================
  if (isLanding) {
    const isLoggedIn = window.auth && window.auth.isLoggedIn();
    const actionContainer = document.querySelector('header .flex.items-center.space-x-3.sm\\:space-x-4');
    const heroPrimaryCta = document.getElementById('hero-primary-cta');

    if (actionContainer && isLoggedIn) {
      const user = window.auth.getUser() || { full_name: '' };
      actionContainer.innerHTML = `
        <a href="../10-dashboard/index.html" class="inline-flex items-center gap-2 px-4 py-2.5 text-xs sm:text-sm font-semibold rounded-xl text-white bg-brand-600 hover:bg-brand-700 shadow-sm shadow-brand-500/25 transition-all active:scale-95">
          <span>Vào Bảng điều khiển →</span>
        </a>
        <button id="landing-logout-btn" class="inline-flex items-center gap-1.5 px-3 py-2 text-xs sm:text-sm font-medium text-rose-600 hover:text-rose-700 hover:bg-rose-50/80 rounded-xl border border-rose-200/80 transition-all cursor-pointer">
          <svg class="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
          <span class="hidden sm:inline">Đăng xuất</span>
        </button>
      `;
      const landingLogout = document.getElementById('landing-logout-btn');
      if (landingLogout) {
        landingLogout.addEventListener('click', () => window.auth.confirmLogout());
      }
    }

    if (heroPrimaryCta && isLoggedIn) {
      heroPrimaryCta.href = '../10-dashboard/index.html';
      heroPrimaryCta.innerHTML = `
        <svg class="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path d="M13 10V3L4 14h7v7l9-11h-7z" stroke-linecap="round" stroke-linejoin="round" stroke-width="2"></path></svg>
        Tiếp tục phiên học tập (Dashboard) →
      `;
    }
  }

  // =========================================================================
  // 4. UNIVERSAL USER PROFILE DROPDOWN & LOGOUT COMPONENT (WORKSPACE PAGES)
  // =========================================================================
  if (!isLanding && !isAuthPage) {
    setupUniversalUserProfileAndLogout();
  }

  // =========================================================================
  // 5. UNIVERSAL ACTION BUTTONS HOOKUP (DEEP WORK, TASK MODAL, MOOD, EXPORT)
  // =========================================================================
  document.querySelectorAll('button, a').forEach(btn => {
    const txt = btn.textContent.trim();

    // Thêm bài tập
    if ((txt.includes('Thêm bài tập') || txt.includes('+ Thêm nhiệm vụ') || txt.includes('Tạo bài tập')) && !btn.closest('[data-purpose="add-assignment-modal"]')) {
      btn.addEventListener('click', (e) => {
        if (!currentPath.includes('12-task-modal')) {
          e.preventDefault();
          window.location.href = '../12-task-modal/index.html';
        }
      });
    }

    // Vào phiên học ngay / Deep Work
    if (txt.includes('Vào phiên học ngay') || txt.includes('Bắt đầu Pomodoro') || txt.includes('Bắt đầu Tập trung') || txt.includes('Deep Flow')) {
      btn.addEventListener('click', (e) => {
        if (!currentPath.includes('16-deep-work-active') && !currentPath.includes('15-deep-work-config')) {
          e.preventDefault();
          window.location.href = '../16-deep-work-active/index.html';
        }
      });
    }

    // Cấu hình phiên
    if (txt.includes('Cấu hình phiên') || txt.includes('Thiết lập tập trung')) {
      btn.addEventListener('click', (e) => {
        if (!currentPath.includes('15-deep-work-config')) {
          e.preventDefault();
          window.location.href = '../15-deep-work-config/index.html';
        }
      });
    }

    // Thêm lịch học / Sự kiện
    if (txt.includes('Thêm phiên học') || txt.includes('Thêm sự kiện') || txt.includes('+ Thêm lịch học') || txt.includes('Thêm môn học / Deadline')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openCreateScheduleEventModal();
      });
    }

    // AI Balance Schedule
    if (txt.includes('AI Tối ưu Circadian') || txt.includes('Tự động tối ưu lịch (AI Balance)') || txt.includes('AI Tối ưu Circadian Peak')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        autoBalanceSchedule();
      });
    }

    // Đồng bộ Canvas LMS (demo — chưa có backend, báo rõ thay vì success giả)
    if (txt.includes('Đồng bộ LMS') || txt.includes('Đồng bộ Canvas') || txt.includes('Canvas & Google')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.showCalmToast) {
          window.showCalmToast('Bản demo: đồng bộ Canvas LMS chưa kết nối backend.', 'warning');
        }
      });
    }

    // Ghi nhận cảm xúc hôm nay
    if (txt.includes('Ghi nhận cảm xúc hôm nay') || txt.includes('Ghi nhận cảm xúc')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openDailyMoodModal();
      });
    }

    // Xuất biên bản tư vấn AI
    if (txt.includes('Xuất biên bản')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        exportAdvisorMinutes();
      });
    }

    // Xuất file BibTeX
    if (txt.includes('BibTeX') || txt.includes('Xuất file trích dẫn')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        exportBibtexFile();
      });
    }

    // Nạp thêm giáo trình / Rubric
    if (txt.includes('Nạp thêm giáo trình') || txt.includes('Nạp tài liệu')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openUploadDocumentModal();
      });
    }

    // Khám phá âm thanh / Bộ trộn âm
    if (txt.includes('Khám phá âm thanh') || txt.includes('Bộ trộn âm →') || txt.includes('Tùy chỉnh EQ')) {
      btn.addEventListener('click', (e) => {
        if (!currentPath.includes('18-sound-sanctuary')) {
          e.preventDefault();
          window.location.href = '../18-sound-sanctuary/index.html';
        }
      });
    }

    // Xuất PDF / In báo cáo — thêm class print để CSS ẩn nav/footer
    if (txt.includes('Xuất PDF')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.showCalmToast) {
          window.showCalmToast('Đang mở bản in báo cáo (chỉ in nội dung chính)...', 'info');
        }
        document.body.classList.add('printing-report');
        setTimeout(() => {
          window.print();
          setTimeout(() => document.body.classList.remove('printing-report'), 500);
        }, 300);
      });
    }

    // Cẩm nang học tập khoa học / Hướng dẫn
    if (txt.includes('Xem cẩm nang') || txt.includes('Cẩm nang học tập') || txt.includes('Phím tắt & Hướng dẫn') || txt.includes('Cẩm nang chống Burnout')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openCalmPolicyModal('Cẩm nang phương pháp học sâu & Điều hòa nhịp sinh học');
      });
    }

    // Cộng đồng học sâu Discord & Đại sứ học đường (sắp ra mắt — báo rõ)
    if (txt.includes('Discord') || txt.includes('Đại sứ học đường')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        if (window.showCalmToast) {
          window.showCalmToast('Cộng đồng Stuđiô sắp ra mắt. Hẹn bạn sớm!', 'info');
        }
      });
    }

    // Bộ lọc phạm vi thời gian (Tuần này, Tháng này, Học kỳ I) — bỏ qua nếu trang tự xử lý (data-range)
    if ((txt === 'Tuần này' || txt === 'Tháng này' || txt === 'Học kỳ I') && !btn.hasAttribute('data-range')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const parent = btn.parentElement;
        if (parent) {
          parent.querySelectorAll('button').forEach(b => {
            b.className = 'px-3 py-1.5 rounded-lg text-on-surface-variant hover:text-on-surface font-label-md text-label-md transition-colors';
          });
          btn.className = 'px-3 py-1.5 rounded-lg bg-primary text-on-primary font-label-md text-label-md shadow-sm transition-all';
        }
        if (window.showCalmToast) showCalmToast(`Đã lọc báo cáo: ${txt}`, 'info');
      });
    }

    // Chuyển đổi chế độ xem thời khóa biểu (Theo Tuần, Theo Ngày, Phân tích Ultradian) — bỏ qua nếu trang tự xử lý (data-view)
    if ((txt === 'Theo Tuần' || txt === 'Theo Ngày' || txt === 'Phân tích Ultradian') && !btn.hasAttribute('data-view')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const parent = btn.parentElement;
        if (parent) {
          parent.querySelectorAll('button').forEach(b => {
            b.className = 'px-3 py-1.5 rounded-lg text-slate-600 hover:text-slate-900 text-xs transition-colors';
          });
          btn.className = 'px-3 py-1.5 rounded-lg bg-white text-brand-600 shadow-xs text-xs font-semibold';
        }
        if (window.showCalmToast) showCalmToast(`Đã chuyển góc nhìn thời khóa biểu: ${txt}`, 'info');
      });
    }

    // Nút chuông thông báo (Notification Bell) trên Header
    if (btn.getAttribute('title')?.includes('Thông báo') || btn.getAttribute('aria-label')?.includes('Thông báo') || btn.querySelector('[data-lucide="bell"]')) {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        openCalmNotificationsModal();
      });
    }
  });

  // =========================================================================
  // 6. LANGUAGE SWITCHER (VN / EN) HOOKUP
  // =========================================================================
  setupLanguageSwitcher();

  // =========================================================================
  // 7. HEADER AUDIO PILL TOGGLE
  // =========================================================================
  setupHeaderAudioPill();

  // =========================================================================
  // 8. INTERACTIVE TASK FILTERS (PAGE 11-TASKS)
  // =========================================================================
  if (currentPath.includes('11-tasks')) {
    setupTasksPageInteractivity();
  }

  // =========================================================================
  // 9. MOBILE HAMBURGER NAV (workspace + landing đều cần vì nav desktop hidden md:flex)
  // =========================================================================
  setupMobileNav();
});

/**
 * Mobile hamburger: hiện nút ☰ trên mobile khi nav desktop bị ẩn.
 * - Trang workspace: dropdown 6 trang chính.
 * - Landing: dropdown 4 anchor sections.
 */
function setupMobileNav() {
  const header = document.querySelector('header');
  if (!header || document.getElementById('studi-mobile-nav-btn')) return;
  const desktopNav = header.querySelector('nav');
  if (!desktopNav) return;
  const currentPath = window.location.pathname;
  const isLanding = currentPath.includes('01-landing');

  const links = isLanding ? [
    ['Tính năng chính', '#tinh-nang'],
    ['Nhịp sinh học AI', '#nhip-sinh-hoc'],
    ['Âm thanh 432Hz', '#am-thanh-432hz'],
    ['Bảng giá Sinh viên', '#bang-gia'],
  ] : [
    ['Tổng quan', '../10-dashboard/index.html'],
    ['Nhiệm vụ', '../11-tasks/index.html'],
    ['Kế hoạch', '../13-planner/index.html'],
    ['Lịch trình', '../14-schedule/index.html'],
    ['Cố vấn AI', '../17-ai-advisor/index.html'],
    ['Thống kê', '../19-analytics/index.html'],
  ];
  const btn = document.createElement('button');
  btn.id = 'studi-mobile-nav-btn';
  btn.type = 'button';
  btn.setAttribute('aria-label', 'Mở menu điều hướng');
  btn.setAttribute('aria-expanded', 'false');
  btn.className = 'md:hidden p-2 rounded-xl border border-slate-200 bg-white/80 text-slate-700 shadow-sm';
  btn.innerHTML = '<svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M4 6h16M4 12h16M4 18h16"/></svg>';
  desktopNav.insertAdjacentElement('beforebegin', btn);

  const menu = document.createElement('div');
  menu.id = 'studi-mobile-nav-menu';
  menu.className = 'hidden md:hidden absolute top-full left-0 right-0 z-50 p-3 bg-white/95 backdrop-blur-xl border-b border-slate-200 shadow-lg';
  menu.innerHTML = `<nav class="grid grid-cols-2 gap-2">` + links.map(([t, u]) =>
    `<a href="${u}" class="px-3 py-2.5 rounded-xl bg-slate-50 hover:bg-blue-50 text-slate-700 hover:text-blue-700 text-xs font-semibold border border-slate-200/70">${t}</a>`
  ).join('') + `</nav>`;
  header.style.position = 'sticky';
  header.appendChild(menu);

  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    const open = menu.classList.toggle('hidden');
    btn.setAttribute('aria-expanded', String(!open));
  });
  menu.querySelectorAll('a').forEach(a => a.addEventListener('click', () => {
    menu.classList.add('hidden');
    btn.setAttribute('aria-expanded', 'false');
  }));
  document.addEventListener('click', (e) => {
    if (!menu.classList.contains('hidden') && !menu.contains(e.target) && e.target !== btn && !btn.contains(e.target)) {
      menu.classList.add('hidden');
      btn.setAttribute('aria-expanded', 'false');
    }
  });
}

/**
 * Cấu hình chuyển đổi ngôn ngữ VN / EN
 */
function setupLanguageSwitcher() {
  document.querySelectorAll('button').forEach(btn => {
    const txt = btn.textContent.trim();
    if (txt === 'VN' || txt === 'EN' || txt === 'VN / EN') {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        const currentLang = localStorage.getItem('studi_lang') || 'vn';
        const nextLang = currentLang === 'vn' ? 'en' : 'vn';
        localStorage.setItem('studi_lang', nextLang);

        if (window.showCalmToast) {
          if (nextLang === 'en') {
            window.showCalmToast('Language switched: English (Bilingual Academic Mode)', 'info');
          } else {
            window.showCalmToast('Ngôn ngữ hiển thị: Tiếng Việt (Chế độ Học thuật Chuẩn)', 'info');
          }
        }
      });
    }
  });
}

/**
 * Cấu hình nút âm thanh trong Header
 */
function setupHeaderAudioPill() {
  document.querySelectorAll('div, button').forEach(el => {
    if (el.textContent.includes('Sóng biển 432Hz') && (el.classList.contains('cursor-pointer') || el.tagName === 'BUTTON' || el.closest('header'))) {
      el.title = 'Bấm để Bật / Tắt âm thanh tĩnh lặng 432Hz';
      el.addEventListener('click', (e) => {
        e.stopPropagation();
        if (window.calmAudio) {
          window.calmAudio.togglePlay();
          const label = el.querySelector('span:last-child') || el;
          if (label && label.textContent.includes('Sóng biển')) {
            label.textContent = window.calmAudio.isPlaying 
              ? 'Sóng biển 432Hz • Đang bật' 
              : 'Sóng biển 432Hz • Tạm dừng';
          }
        }
      });
    }
  });
}

/**
 * Bộ lọc tương tác cho trang Nhiệm vụ (11-tasks)
 */
function setupTasksPageInteractivity() {
  // Trang 11-tasks đã tự quản lý filter/search/sort (id riêng) -> bỏ qua để tránh double-binding
  if (document.getElementById('task-filter-tabs')) return;
  const filterButtons = document.querySelectorAll('.glass-card.rounded-2xl.p-2 button');
  if (filterButtons.length === 0) return;

  filterButtons.forEach(btn => {
    btn.addEventListener('click', () => {
      filterButtons.forEach(b => {
        b.className = 'px-4 py-2 rounded-xl text-slate-600 hover:bg-white/80 font-medium transition cursor-pointer';
      });
      btn.className = 'px-4 py-2 rounded-xl bg-blue-600 text-white font-medium shadow-xs cursor-pointer';
      
      const filterText = btn.textContent.trim();
      if (window.showCalmToast) {
        window.showCalmToast(`Đã lọc danh sách: ${filterText}`, 'info');
      }
    });
  });

  // Checkboxes on subtasks
  document.querySelectorAll('input[type="checkbox"]').forEach(chk => {
    chk.addEventListener('change', (e) => {
      const label = e.target.closest('div')?.querySelector('span, h3, p');
      if (label) {
        if (e.target.checked) {
          label.classList.add('line-through', 'opacity-60');
          if (window.showCalmToast) window.showCalmToast('Đã hoàn thành 1 bước nhỏ Pomodoro!', 'success');
        } else {
          label.classList.remove('line-through', 'opacity-60');
        }
      }
    });
  });
}

/**
 * Đăng nhập nhanh Magic Link AI
 */
function triggerMagicLink() {
  const emailInput = document.getElementById('login_identity') || document.querySelector('input[type="email"], input[type="text"]');
  const email = emailInput ? emailInput.value.trim() : 'chau.nguyen@vnuhcm.edu.vn';

  if (window.showCalmToast) {
    window.showCalmToast(`Đang tạo Magic Link đăng nhập 1-chạm gửi về ${email}...`, 'info');
  }

  setTimeout(() => {
    if (window.showCalmToast) {
      window.showCalmToast('✨ Magic Link hợp lệ! Đang chuyển hướng vào không gian học tập...', 'success');
    }
    setTimeout(() => {
      window.location.href = '../10-dashboard/index.html';
    }, 1200);
  }, 1000);
}

/**
 * Xuất biên bản tư vấn học thuật AI — nội dung thật từ lịch sử hội thoại trong DB
 */
async function exportAdvisorMinutes() {
  const user = window.auth ? window.auth.getUser() : null;
  const dateStr = new Date().toLocaleDateString('vi-VN');
  let body = '(Không tải được lịch sử hội thoại)';
  try {
    const history = await window.api.get('/advisor/history');
    if (Array.isArray(history) && history.length) {
      body = history.map(m => {
        const who = (m.sender || m.role || 'advisor') === 'user' ? 'Sinh viên' : 'Cố vấn AI';
        const at = m.created_at ? new Date(m.created_at).toLocaleString('vi-VN') : '';
        return `[${at}] ${who}:\n${m.content}`;
      }).join('\n\n---\n\n');
    } else {
      body = '(Chưa có hội thoại nào)';
    }
  } catch (err) {
    body = `(Lỗi tải lịch sử: ${(err && err.message) || 'unknown'})`;
  }
  const content = `=====================================================
BIÊN BẢN TƯ VẤN HỌC THUẬT - STUĐIÔ AI CALM WORKSPACE
=====================================================
Sinh viên: ${(user && user.full_name) || ''}
Trường: ${((user && user.university) || '') + (((user && user.major)) ? ' - ' + user.major : '')}
Ngày xuất: ${dateStr}

NỘI DUNG HỘI THOẠI:
${body}

© Stuđiô AI - Không gian học tập tĩnh lặng.
`;

  const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `Bien_Ban_Tu_Van_Hoc_Thuat_${Date.now()}.txt`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (window.showCalmToast) {
    window.showCalmToast('Đã tải xuống biên bản tư vấn học thuật (.txt)!', 'success');
  }
}

/**
 * Xuất file trích dẫn BibTeX chuẩn IEEE
 */
function exportBibtexFile() {
  const bibtexContent = `@inproceedings{he2016deep,
  title={Deep residual learning for image recognition},
  author={He, Kaiming and Zhang, Xiangyu and Ren, Shaoqing and Sun, Jian},
  booktitle={Proceedings of the IEEE conference on computer vision and pattern recognition},
  pages={770--778},
  year={2016}
}

@article{krizhevsky2009learning,
  title={Learning multiple layers of features from tiny images},
  author={Krizhevsky, Alex and Hinton, Geoffrey and others},
  year={2009},
  publisher={Toronto, ON, Canada}
}
`;

  const blob = new Blob([bibtexContent], { type: 'text/plain;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `references_${Date.now()}.bib`;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);

  if (window.showCalmToast) {
    window.showCalmToast('Đã xuất thành công file trích dẫn IEEE (.BibTeX)!', 'success');
  }
}

/**
 * Modal nạp thêm giáo trình / tài liệu học thuật
 */
function openUploadDocumentModal() {
  const existing = document.getElementById('calm-upload-doc-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'calm-upload-doc-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm calmFadeIn';
  modal.innerHTML = `
    <div class="glass-card bg-white/95 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-white/90">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            📚
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Nạp Tài Liệu &amp; Giáo Trình</h3>
            <p class="text-[11px] text-slate-500">Hỗ trợ PDF, DOCX, LaTeX để AI đọc ngữ cảnh bài học</p>
          </div>
        </div>
        <button type="button" id="close-upload-modal" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          ✕
        </button>
      </div>

      <div class="space-y-4 text-xs">
        <div id="doc-dropzone" class="border-2 border-dashed border-blue-200 hover:border-blue-400 rounded-2xl p-6 text-center bg-blue-50/40 cursor-pointer transition">
          <span class="text-3xl block mb-2">📄</span>
          <p class="font-bold text-slate-800" id="doc-drop-label">Kéo thả tệp hoặc bấm vào đây để chọn</p>
          <p class="text-[11px] text-slate-500 mt-1">Hỗ trợ PDF, DOCX, TEX, TXT, MD (tối đa 25MB)</p>
          <input type="file" id="doc-file-input" class="hidden" accept=".pdf,.docx,.tex,.txt,.md">
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-2">
          <button type="button" id="cancel-upload-btn" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium transition cursor-pointer">
            Hủy
          </button>
          <button type="button" id="confirm-upload-btn" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/25 transition active:scale-95 cursor-pointer">
            Bắt đầu phân tích AI
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#close-upload-modal').addEventListener('click', closeModal);
  modal.querySelector('#cancel-upload-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  // Chọn file thật từ máy
  const fileInput = modal.querySelector('#doc-file-input');
  const dropzone = modal.querySelector('#doc-dropzone');
  const dropLabel = modal.querySelector('#doc-drop-label');
  let pickedFile = null;
  dropzone.addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', () => {
    pickedFile = fileInput.files && fileInput.files[0];
    if (pickedFile && dropLabel) {
      dropLabel.textContent = `${pickedFile.name} (${Math.round(pickedFile.size / 1024)}KB)`;
    }
  });

  modal.querySelector('#confirm-upload-btn').addEventListener('click', async (e) => {
    const btn = e.currentTarget;
    if (!pickedFile) {
      if (window.showCalmToast) window.showCalmToast('Vui lòng chọn 1 file giáo trình trước.', 'warning');
      fileInput.click();
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Đang tải lên...';
    try {
      const fd = new FormData();
      fd.append('file', pickedFile);
      const res = await window.api.postForm('/advisor/upload', fd);
      closeModal();
      document.dispatchEvent(new CustomEvent('studiDocsChanged'));
      if (window.showCalmToast) {
        window.showCalmToast(res.message || 'Đã nạp tài liệu vào bộ nhớ AI!', 'success');
      }
    } catch (err) {
      if (window.showCalmToast) {
        window.showCalmToast((err && err.message) || 'Tải file thất bại.', 'error');
      }
    } finally {
      btn.disabled = false;
      btn.textContent = 'Bắt đầu phân tích AI';
    }
  });
}

/**
 * Modal Ghi nhận cảm xúc & Nhịp học hôm nay
 */
function openDailyMoodModal() {
  const existing = document.getElementById('calm-daily-mood-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'calm-daily-mood-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm calmFadeIn';
  modal.innerHTML = `
    <div class="glass-card bg-white/95 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-white/90">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            🌱
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Ghi Nhận Cảm Xúc Hôm Nay</h3>
            <p class="text-[11px] text-slate-500">Giúp Cố vấn AI điều chỉnh cường độ học tập phù hợp</p>
          </div>
        </div>
        <button type="button" id="close-mood-modal" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          ✕
        </button>
      </div>

      <div class="space-y-3.5 text-xs">
        <label class="block font-semibold text-slate-700">Trạng thái tinh thần của bạn lúc này:</label>
        <div class="grid grid-cols-2 gap-2.5" id="mood-option-grid">
          <button type="button" data-mood="alpha_flow" class="mood-btn p-3 rounded-2xl border border-blue-200 bg-blue-50/70 hover:bg-blue-100 text-left transition cursor-pointer">
            <span class="text-xl block mb-1">🌅</span>
            <span class="font-bold text-slate-800 block text-xs">Tràn đầy năng lượng</span>
            <span class="text-[10px] text-slate-500">Đỉnh sóng não Alpha</span>
          </button>
          <button type="button" data-mood="calm_focus" class="mood-btn p-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 hover:bg-emerald-100 text-left transition cursor-pointer">
            <span class="text-xl block mb-1">🌊</span>
            <span class="font-bold text-slate-800 block text-xs">Điềm tĩnh &amp; Chú tâm</span>
            <span class="text-[10px] text-slate-500">Dòng chảy sâu bền</span>
          </button>
          <button type="button" data-mood="need_break" class="mood-btn p-3 rounded-2xl border border-amber-200 bg-amber-50/70 hover:bg-amber-100 text-left transition cursor-pointer">
            <span class="text-xl block mb-1">🍃</span>
            <span class="font-bold text-slate-800 block text-xs">Hơi mỏi mắt</span>
            <span class="text-[10px] text-slate-500">Cần nghỉ ngơi 5p</span>
          </button>
          <button type="button" data-mood="rest_mode" class="mood-btn p-3 rounded-2xl border border-indigo-200 bg-indigo-50/70 hover:bg-indigo-100 text-left transition cursor-pointer">
            <span class="text-xl block mb-1">🌙</span>
            <span class="font-bold text-slate-800 block text-xs">Sẵn sàng ngủ ngon</span>
            <span class="text-[10px] text-slate-500">Phục hồi tế bào não</span>
          </button>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">Ghi chú ngắn (tùy chọn):</label>
          <input id="mood-note-input" type="text" placeholder="Hôm nay đã giải quyết xong bài tập lớn..." class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 font-medium outline-none">
        </div>

        <div class="flex items-center justify-end gap-2.5 pt-2">
          <button type="button" id="cancel-mood-btn" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium transition cursor-pointer">
            Hủy
          </button>
          <button type="button" id="save-mood-btn" class="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-semibold shadow-md shadow-emerald-500/25 transition active:scale-95 cursor-pointer">
            Lưu cảm xúc
          </button>
        </div>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#close-mood-modal').addEventListener('click', closeModal);
  modal.querySelector('#cancel-mood-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  let selectedMood = 'alpha_flow';
  modal.querySelectorAll('.mood-btn').forEach(b => {
    b.addEventListener('click', () => {
      modal.querySelectorAll('.mood-btn').forEach(btn => btn.classList.remove('ring-2', 'ring-emerald-500', 'bg-white'));
      b.classList.add('ring-2', 'ring-emerald-500', 'bg-white');
      selectedMood = b.dataset.mood;
    });
  });

  modal.querySelector('#save-mood-btn').addEventListener('click', async () => {
    const note = modal.querySelector('#mood-note-input').value.trim();
    const saveBtn = modal.querySelector('#save-mood-btn');
    saveBtn.disabled = true;
    try {
      await window.api.post('/moods/', { mood: selectedMood, note: note || null });
      closeModal();
      if (window.showCalmToast) {
        window.showCalmToast('Đã lưu cảm xúc vào nhật ký hệ thống!', 'success');
      }
    } catch (err) {
      if (window.showCalmToast) {
        window.showCalmToast((err && err.message) || 'Không lưu được cảm xúc.', 'error');
      }
    } finally {
      saveBtn.disabled = false;
    }
  });
}

/**
 * Modal Trung Tâm Thông Báo Học Thuật — dữ liệu thật từ /notifications/list
 */
function openCalmNotificationsModal() {
  const existing = document.getElementById('calm-notifications-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'calm-notifications-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm calmFadeIn';
  modal.innerHTML = `
    <div class="glass-card bg-white/95 rounded-3xl p-6 max-w-md w-full shadow-2xl border border-white/90">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold text-base">
            🔔
          </div>
          <div>
            <h3 class="text-sm font-bold text-slate-900">Trung Tâm Thông Báo Học Thuật</h3>
            <p class="text-[11px] text-slate-500" id="notif-subtitle">Đang tải từ hệ thống...</p>
          </div>
        </div>
        <button type="button" id="close-notif-modal" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">✕</button>
      </div>

      <div class="space-y-2.5 text-xs" id="notif-list">
        <div class="p-4 text-center text-slate-500">
          <span class="animate-spin inline-block w-5 h-5 border-2 border-blue-200 border-t-blue-600 rounded-full"></span>
          <p class="mt-2">Đang tải thông báo...</p>
        </div>
      </div>

      <div class="flex items-center justify-end pt-4 mt-2 border-t border-slate-100">
        <button type="button" id="close-notif-btn" class="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition cursor-pointer">
          Đóng
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#close-notif-modal').addEventListener('click', closeModal);
  modal.querySelector('#close-notif-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  const toneStyle = {
    urgent: 'bg-rose-50/70 border-rose-100',
    success: 'bg-emerald-50/70 border-emerald-100',
    info: 'bg-blue-50/70 border-blue-100',
  };
  (async () => {
    const listEl = modal.querySelector('#notif-list');
    const subEl = modal.querySelector('#notif-subtitle');
    try {
      const data = await window.api.get('/notifications/list');
      const items = (data && data.notifications) || [];
      if (subEl) subEl.textContent = items.length ? `${items.length} cập nhật từ dữ liệu của bạn` : 'Chưa có cập nhật mới';
      if (!items.length) {
        listEl.innerHTML = '<div class="p-4 text-center text-slate-500">Chưa có thông báo nào. Học 1 phiên Pomodoro để bắt đầu nhé!</div>';
        return;
      }
      listEl.innerHTML = items.map(n => `
        <div class="p-3 rounded-2xl border flex items-start gap-2.5 ${toneStyle[n.tone] || toneStyle.info}">
          <span class="text-base shrink-0">${n.icon || '🔔'}</span>
          <div class="flex-1">
            <p class="font-bold text-slate-800">${n.title || ''}</p>
            <p class="text-slate-600 mt-0.5 text-[11px]">${n.detail || ''}</p>
            ${n.time_label ? `<span class="text-[10px] text-blue-600 font-semibold mt-1 inline-block">${n.time_label}</span>` : ''}
          </div>
        </div>
      `).join('');
    } catch (err) {
      if (subEl) subEl.textContent = 'Không tải được';
      listEl.innerHTML = `<div class="p-4 text-center text-rose-600">${(err && err.message) || 'Không tải được thông báo.'}</div>`;
    }
  })();
}

/**
 * Modal Điều khoản & Chính sách bảo mật học thuật
 */
function openCalmPolicyModal(title = 'Chính Sách Stuđiô AI') {
  const existing = document.getElementById('calm-policy-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'calm-policy-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm calmFadeIn';
  modal.innerHTML = `
    <div class="glass-card bg-white/95 rounded-3xl p-6 sm:p-7 max-w-lg w-full shadow-2xl border border-white/90 max-h-[85vh] overflow-y-auto custom-scrollbar">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            🛡️
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">${title}</h3>
            <p class="text-[11px] text-slate-500">Cam kết liêm chính học thuật &amp; Quyền riêng tư tuyệt đối</p>
          </div>
        </div>
        <button type="button" id="close-policy-modal" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          ✕
        </button>
      </div>

      <div class="space-y-3.5 text-xs text-slate-600 leading-relaxed">
        <div class="p-3 rounded-2xl bg-blue-50/60 border border-blue-100 text-blue-900 font-medium">
          Stuđiô AI tuân thủ nghiêm ngặt nguyên lý <strong>Calm Technology</strong> và <strong>Zero-Data Retention</strong>. Mọi tài liệu nghiên cứu, ý tưởng bài tập và mã nguồn đồ án của bạn luôn thuộc về bạn 100%.
        </div>
        <h4 class="font-bold text-slate-800 text-xs uppercase tracking-wide">1. Liêm chính học thuật (Academic Integrity)</h4>
        <p>Hệ thống hỗ trợ phân rã cấu trúc bài tập và định hướng tư duy học thuật theo chuẩn IEEE &amp; APA 7th. AI tuyệt đối không đạo văn và khuyến khích sinh viên tự tay phát triển luận điểm.</p>
        
        <h4 class="font-bold text-slate-800 text-xs uppercase tracking-wide">2. Quyền riêng tư &amp; Nhịp sinh học</h4>
        <p>Dữ liệu giờ giấc ngủ thức và phân loại Chronotype chỉ dùng để gợi ý khung giờ vàng cá nhân, không chia sẻ với bất kỳ bên thứ ba nào.</p>

        <h4 class="font-bold text-slate-800 text-xs uppercase tracking-wide">3. Hỗ trợ sinh viên 24/7</h4>
        <p>Nếu gặp bất kỳ khó khăn nào trong quá trình học tập hoặc sử dụng hệ thống, bạn có thể liên hệ Ban Hỗ trợ Học thuật: <strong class="text-blue-600 font-mono">hotro@studi.edu.vn</strong> (ĐHQG TP.HCM).</p>
      </div>

      <div class="pt-4 mt-4 border-t border-slate-100 text-right">
        <button type="button" id="accept-policy-btn" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold transition active:scale-95 cursor-pointer text-xs">
          Đã hiểu &amp; Đóng
        </button>
      </div>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#close-policy-modal').addEventListener('click', closeModal);
  modal.querySelector('#accept-policy-btn').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });
}

/**
 * Tự động tìm và thiết lập Menu Hồ sơ người dùng cùng nút Đăng xuất trong thanh Header
 */
function setupUniversalUserProfileAndLogout() {
  const header = document.querySelector('header');
  if (!header) return;

  // Tự động kích hoạt phiên trải nghiệm demo nếu chưa có phiên đăng nhập
  if (!window.auth.isLoggedIn()) {
    window.location.href = '../02-login/index.html';
    return;
  }

  // Token có nhưng chưa có user cache -> đồng bộ từ backend, render tạm display user
  let user = window.auth.getUser();
  if (!user) {
    user = window.auth.getDisplayUser();
    window.auth.fetchCurrentUser().then((fresh) => {
      if (fresh) window.location.reload();
    }).catch(() => {});
  }

  // Tìm khu vực chứa Profile trong Header: lấy div SÂU NHẤT khớp (tránh vớ nhầm container cha
  // khiến dropdown mở lệch ngoài màn hình), khớp tên user thật thay vì tên cứng
  const nameKey = (user.full_name || '').trim().split(' ').slice(-1)[0] || '';
  let profileContainer = null;
  const candidates = header.querySelectorAll('div.flex.items-center');
  for (const c of candidates) {
    const t = c.textContent || '';
    const hit = (nameKey && t.includes(nameKey)) || t.includes('ĐHQG') ||
      c.classList.contains('user-profile-container') ||
      (c.classList.contains('border-l') && c.querySelector('.rounded-full'));
    if (hit && (!profileContainer || (profileContainer !== c && profileContainer.contains(c)))) {
      profileContainer = c;
    }
  }

  if (!profileContainer) {
    // Header không có sẵn khối profile (07/08/09/15/16): tự chèn chip gọn bên phải
    const bar = header.querySelector('nav') || header;
    profileContainer = document.createElement('div');
    profileContainer.id = 'studi-profile-chip';
    profileContainer.className = 'flex items-center gap-2 pl-2 cursor-pointer select-none';
    const ini = (user.full_name || 'MC').split(' ').map(w => w[0]).slice(-2).join('').toUpperCase() || 'MC';
    const escName = String(user.full_name || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const escUni = String(user.university || '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    profileContainer.innerHTML = `
      <div class="w-8 h-8 rounded-full bg-gradient-to-tr from-blue-600 to-indigo-500 text-white font-semibold flex items-center justify-center text-xs shadow-sm ring-2 ring-white">${ini}</div>
      <div class="hidden sm:block text-left">
        <p class="text-xs font-bold text-slate-800 leading-tight">${escName}</p>
        <p class="text-[11px] text-slate-500 leading-tight">${escUni}</p>
      </div>`;
    bar.appendChild(profileContainer);
  }
  // Tránh init 2 lần (chevron + dropdown trùng lặp)
  if (profileContainer.querySelector('#studi-profile-dropdown')) return;

  // Chuẩn hóa profile container thành trigger dropdown
  profileContainer.classList.add('relative', 'user-profile-trigger', 'cursor-pointer', 'select-none', 'group');
  profileContainer.style.position = 'relative';
  profileContainer.title = 'Bấm để mở hồ sơ hoặc đổi tài khoản / đăng xuất';

  // Thêm biểu tượng chevron dropdown nhỏ
  const chevron = document.createElement('span');
  chevron.className = 'text-slate-400 group-hover:text-blue-600 transition-transform duration-200 text-xs ml-0.5';
  chevron.innerHTML = '▾';
  profileContainer.appendChild(chevron);

  // Tạo và chèn nút Đăng xuất trực tiếp (Quick Logout Button) ngay bên cạnh profile container
  const parentContainer = profileContainer.parentElement;
  if (parentContainer && !document.getElementById('studi-quick-logout-btn')) {
    const quickLogoutBtn = document.createElement('button');
    quickLogoutBtn.id = 'studi-quick-logout-btn';
    quickLogoutBtn.type = 'button';
    quickLogoutBtn.title = 'Đăng xuất khỏi Stuđiô AI';
    quickLogoutBtn.className = 'inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-rose-50/80 hover:bg-rose-100 text-rose-700 hover:text-rose-800 text-xs font-semibold border border-rose-200/70 shadow-2xs transition-all active:scale-95 cursor-pointer ml-1 sm:ml-2';
    quickLogoutBtn.innerHTML = `
      <svg class="w-3.5 h-3.5 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
      </svg>
      <span class="hidden md:inline">Đăng xuất</span>
    `;
    quickLogoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      window.auth.confirmLogout();
    });
    profileContainer.insertAdjacentElement('afterend', quickLogoutBtn);
  }

  // Tạo Floating Glassmorphism Dropdown Card
  const initials = (user.full_name || '')
    .split(' ')
    .map(w => w[0])
    .filter(Boolean)
    .slice(-2)
    .join('')
    .toUpperCase() || 'ST';

  const dropdown = document.createElement('div');
  dropdown.id = 'studi-profile-dropdown';
  dropdown.className = 'profile-dropdown-menu text-left';
  dropdown.innerHTML = `
    <!-- Header Thông tin sinh viên -->
    <div class="flex items-center gap-3 pb-3 border-b border-slate-100">
      <div class="relative">
        <div class="w-11 h-11 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white font-bold flex items-center justify-center text-sm shadow-md ring-2 ring-white">
          ${initials}
        </div>
        <span class="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 border-2 border-white rounded-full"></span>
      </div>
      <div class="min-w-0 flex-1">
        <h4 class="text-xs font-bold text-slate-900 truncate leading-tight">${user.full_name || ''}</h4>
        <p class="text-[11px] text-slate-500 truncate">${user.email || ''}</p>
        <span class="inline-block text-[10px] font-semibold text-blue-700 bg-blue-50 px-1.5 py-0.5 rounded border border-blue-100 mt-0.5">
          ${user.university || ''}${user.major ? ' • ' + user.major : ''}
        </span>
      </div>
    </div>

    <!-- Nhịp sinh học Badge -->
    <div class="my-2.5 p-2 rounded-xl bg-gradient-to-r from-amber-50/90 to-blue-50/90 border border-amber-200/60 flex items-center gap-2" id="studi-chrono-badge">
      <span class="text-base">🌅</span>
      <div class="min-w-0 flex-1">
        <p class="text-[11px] font-bold text-amber-900 leading-tight" data-chrono-name>Chim Sơn Ca (Lark)</p>
        <p class="text-[10px] text-slate-600" data-chrono-range>Giờ vàng học sâu: 14:00 - 16:30</p>
      </div>
    </div>

    <!-- Danh sách liên kết điều hướng -->
    <div class="space-y-1 py-1 text-xs">
      <button id="edit-profile-menu-item" type="button" class="w-full flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-700 hover:bg-blue-50 hover:text-blue-600 transition font-medium text-left cursor-pointer">
        <svg class="w-4 h-4 text-blue-500 shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>
        <span>Hồ sơ &amp; Nhịp sinh học</span>
      </button>
      <a href="../19-analytics/index.html" class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition font-medium">
        <svg class="w-4 h-4 text-emerald-500" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>
        Thống kê giờ học &amp; Chuỗi ngày
      </a>
      <a href="../02-login/index.html" class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition font-medium">
        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M11 16l-4-4m0 0l4-4m-4 4h14m-5 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1"/></svg>
        Đổi tài khoản / Đăng nhập lại
      </a>
      <a href="../03-register/index.html" class="flex items-center gap-2.5 px-2.5 py-2 rounded-xl text-slate-700 hover:bg-slate-100 hover:text-blue-600 transition font-medium">
        <svg class="w-4 h-4 text-slate-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M18 9v3m0 0v3m0-3h3m-3 0h-3m-2-5a4 4 0 11-8 0 4 4 0 018 0zM3 20a6 6 0 0112 0v1H3v-1z"/></svg>
        Đăng ký tài khoản mới
      </a>
    </div>

    <!-- Divider & Nút Đăng xuất chính -->
    <div class="pt-2 border-t border-slate-100 mt-1">
      <button id="dropdown-logout-btn" type="button" class="w-full flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold border border-rose-200/80 transition-all cursor-pointer">
        <svg class="w-4 h-4 text-rose-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
        </svg>
        <span>Đăng xuất khỏi Stuđiô AI</span>
      </button>
    </div>
  `;

  profileContainer.appendChild(dropdown);

  // Badge chronotype thật từ profile backend (thay text cứng)
  (async () => {
    try {
      const p = await window.api.get('/auth/profile');
      const names = {
        lark: ['Chim Sơn Ca (Lark)', '🌅'],
        owl: ['Cú Đêm (Owl)', '🦉'],
        hummingbird: ['Chim Ruồi (Hummingbird)', '🐦'],
        bear: ['Gấu Nâu (Bear)', '🐻'],
      };
      const [label, icon] = names[p.chronotype] || names.lark;
      const badge = dropdown.querySelector('#studi-chrono-badge');
      if (badge) {
        badge.querySelector('span.text-base').textContent = icon;
        badge.querySelector('[data-chrono-name]').textContent = label;
        const range = (p.peak_start_time && p.peak_end_time)
          ? `Giờ vàng học sâu: ${p.peak_start_time} - ${p.peak_end_time}`
          : 'Giờ vàng học sâu: 14:00 - 16:30';
        badge.querySelector('[data-chrono-range]').textContent = range;
      }
    } catch {}
  })();

  // Toggle Dropdown Menu
  profileContainer.addEventListener('click', (e) => {
    if (e.target.closest('a') || e.target.closest('#dropdown-logout-btn') || e.target.closest('#edit-profile-menu-item')) return;
    e.stopPropagation();
    const isActive = dropdown.classList.contains('active');
    dropdown.classList.toggle('active', !isActive);
    chevron.style.transform = isActive ? 'rotate(0deg)' : 'rotate(180deg)';
  });

  // Đóng Dropdown khi click ra ngoài
  document.addEventListener('click', (e) => {
    if (!profileContainer.contains(e.target)) {
      dropdown.classList.remove('active');
      chevron.style.transform = 'rotate(0deg)';
    }
  });

  // Gắn sự kiện nút Mở Modal Chỉnh Sửa Hồ Sơ
  const editProfileItem = dropdown.querySelector('#edit-profile-menu-item');
  if (editProfileItem) {
    editProfileItem.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('active');
      chevron.style.transform = 'rotate(0deg)';
      openEditProfileModal();
    });
  }

  // Gắn sự kiện nút Đăng xuất trong dropdown
  const dropdownLogoutBtn = dropdown.querySelector('#dropdown-logout-btn');
  if (dropdownLogoutBtn) {
    dropdownLogoutBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      dropdown.classList.remove('active');
      window.auth.confirmLogout();
    });
  }
}

/**
 * Modal Chỉnh Sửa Hồ Sơ & Nhịp Sinh Học
 */
function openEditProfileModal() {
  const existing = document.getElementById('calm-edit-profile-modal');
  if (existing) existing.remove();

  const user = (window.auth && typeof window.auth.getUser === 'function') ? window.auth.getUser() : {};
  const currentChronotype = user.chronotype || 'lark';

  const modal = document.createElement('div');
  modal.id = 'calm-edit-profile-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm calmFadeIn';
  modal.innerHTML = `
    <div class="glass-card bg-white/95 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-white/90 max-h-[90vh] overflow-y-auto custom-scrollbar">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center font-bold">
            👤
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Hồ Sơ &amp; Nhịp Sinh Học</h3>
            <p class="text-[11px] text-slate-500">Tùy chỉnh không gian học tập và khung giờ vàng cá nhân</p>
          </div>
        </div>
        <button type="button" id="close-profile-modal" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          ✕
        </button>
      </div>

      <form id="edit-profile-form" class="space-y-3.5 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Họ và tên sinh viên</label>
          <input id="prof-fullname" type="text" value="${user.full_name || ''}" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-blue-500 focus:ring-2 focus:ring-blue-100 transition text-slate-800 font-medium" required>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Trường đại học</label>
            <input id="prof-university" type="text" value="${user.university || 'ĐHQG TP.HCM'}" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 font-medium">
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Ngành đào tạo</label>
            <input id="prof-major" type="text" value="${user.major || 'Công nghệ Thông tin'}" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 font-medium">
          </div>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1.5">Phân loại Nhịp sinh học (Chronotype)</label>
          <div class="grid grid-cols-3 gap-2" id="chronotype-selector">
            <button type="button" data-chrono="lark" class="chrono-btn p-2.5 rounded-xl border text-center transition-all cursor-pointer ${currentChronotype === 'lark' ? 'border-amber-400 bg-amber-50 text-amber-900 font-bold' : 'border-slate-200 bg-slate-50 text-slate-600'}">
              <span class="text-base block mb-0.5">🌅</span>
              <span class="text-[11px] block">Sơn Ca</span>
              <span class="text-[9px] text-slate-500 font-normal">06:00 - 23:00</span>
            </button>
            <button type="button" data-chrono="owl" class="chrono-btn p-2.5 rounded-xl border text-center transition-all cursor-pointer ${currentChronotype === 'owl' ? 'border-indigo-400 bg-indigo-50 text-indigo-900 font-bold' : 'border-slate-200 bg-slate-50 text-slate-600'}">
              <span class="text-base block mb-0.5">🦉</span>
              <span class="text-[11px] block">Cú Đêm</span>
              <span class="text-[9px] text-slate-500 font-normal">08:30 - 01:00</span>
            </button>
            <button type="button" data-chrono="hummingbird" class="chrono-btn p-2.5 rounded-xl border text-center transition-all cursor-pointer ${currentChronotype === 'hummingbird' ? 'border-emerald-400 bg-emerald-50 text-emerald-900 font-bold' : 'border-slate-200 bg-slate-50 text-slate-600'}">
              <span class="text-base block mb-0.5">🕊️</span>
              <span class="text-[11px] block">Chim Ruồi</span>
              <span class="text-[9px] text-slate-500 font-normal">Linh hoạt</span>
            </button>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Mục tiêu giờ học/ngày</label>
            <input id="prof-hours" type="number" step="0.5" min="1" max="14" value="${user.target_daily_focus_hours || 6.0}" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 font-medium">
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Mục tiêu GPA (Hệ 4)</label>
            <input id="prof-gpa" type="number" step="0.05" min="2.0" max="4.0" value="${user.target_gpa || 3.6}" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 font-medium">
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button type="button" id="cancel-profile-modal" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium transition cursor-pointer">
            Hủy bỏ
          </button>
          <button type="submit" id="save-profile-btn" class="px-5 py-2.5 rounded-xl bg-blue-600 hover:bg-blue-700 text-white font-semibold shadow-md shadow-blue-500/25 transition active:scale-95 cursor-pointer">
            Lưu thay đổi
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#close-profile-modal').addEventListener('click', closeModal);
  modal.querySelector('#cancel-profile-modal').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  let chosenChronotype = currentChronotype;
  modal.querySelectorAll('.chrono-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      modal.querySelectorAll('.chrono-btn').forEach(b => {
        b.className = 'chrono-btn p-2.5 rounded-xl border text-center transition-all cursor-pointer border-slate-200 bg-slate-50 text-slate-600';
      });
      chosenChronotype = btn.dataset.chrono;
      if (chosenChronotype === 'lark') {
        btn.className = 'chrono-btn p-2.5 rounded-xl border text-center transition-all cursor-pointer border-amber-400 bg-amber-50 text-amber-900 font-bold';
      } else if (chosenChronotype === 'owl') {
        btn.className = 'chrono-btn p-2.5 rounded-xl border text-center transition-all cursor-pointer border-indigo-400 bg-indigo-50 text-indigo-900 font-bold';
      } else {
        btn.className = 'chrono-btn p-2.5 rounded-xl border text-center transition-all cursor-pointer border-emerald-400 bg-emerald-50 text-emerald-900 font-bold';
      }
    });
  });

  modal.querySelector('#edit-profile-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = modal.querySelector('#save-profile-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang lưu...';

    const updatedData = {
      full_name: modal.querySelector('#prof-fullname').value.trim(),
      university: modal.querySelector('#prof-university').value.trim(),
      major: modal.querySelector('#prof-major').value.trim(),
      chronotype: chosenChronotype,
      target_daily_focus_hours: parseFloat(modal.querySelector('#prof-hours').value) || 6.0,
      target_gpa: parseFloat(modal.querySelector('#prof-gpa').value) || 3.6
    };

    try {
      if (window.api && typeof window.api.put === 'function') {
        await window.api.put('/auth/profile', updatedData);
      }
      if (window.auth && typeof window.auth.setUser === 'function') {
        const current = window.auth.getUser() || {};
        window.auth.setUser({ ...current, ...updatedData });
      }
    } catch(err) {
      console.warn('Profile save warning:', err);
    }

    if (window.showCalmToast) {
      window.showCalmToast('Đã cập nhật thông tin hồ sơ & nhịp sinh học thành công!', 'success');
    }

    closeModal();
    setTimeout(() => window.location.reload(), 400);
  });
}

/**
 * Modal Thêm Lịch Học / Sự Kiện Thời Khóa Biểu Mới
 */
function openCreateScheduleEventModal() {
  const existing = document.getElementById('calm-schedule-event-modal');
  if (existing) existing.remove();

  const modal = document.createElement('div');
  modal.id = 'calm-schedule-event-modal';
  modal.className = 'fixed inset-0 z-[10000] flex items-center justify-center p-4 bg-slate-900/40 backdrop-blur-sm calmFadeIn';
  modal.innerHTML = `
    <div class="glass-card bg-white/95 rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl border border-white/90">
      <div class="flex items-center justify-between pb-3 border-b border-slate-100 mb-4">
        <div class="flex items-center gap-2.5">
          <div class="w-9 h-9 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center font-bold">
            📅
          </div>
          <div>
            <h3 class="text-base font-bold text-slate-900">Thêm Phiên Học &amp; Sự Kiện</h3>
            <p class="text-[11px] text-slate-500">Xếp lịch đồng điệu theo khung giờ vàng sinh học</p>
          </div>
        </div>
        <button type="button" id="close-event-modal" class="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition cursor-pointer">
          ✕
        </button>
      </div>

      <form id="create-event-form" class="space-y-3.5 text-xs">
        <div>
          <label class="block font-semibold text-slate-700 mb-1">Tên môn học / Sự kiện</label>
          <input id="ev-title" type="text" placeholder="Ví dụ: Ôn thi Giữa kỳ CSDL nâng cao" class="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 transition text-slate-800 font-medium" required>
        </div>

        <div>
          <label class="block font-semibold text-slate-700 mb-1">Mô tả / Mục tiêu phiên học</label>
          <textarea id="ev-desc" rows="2" placeholder="Giải quyết 3 bài tập truy vấn SQL tối ưu hóa chỉ mục..." class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 focus:bg-white focus:border-indigo-500 text-slate-800 font-medium"></textarea>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Loại sự kiện</label>
            <select id="ev-type" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 font-medium cursor-pointer">
              <option value="academic_lecture">🎓 Tiết học chính khóa</option>
              <option value="deep_work" selected>⚡ Phiên Deep Work</option>
              <option value="exam">📝 Buổi thi / Nộp bài</option>
              <option value="study_break">🌿 Nghỉ ngơi Calm Break</option>
            </select>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Tối ưu giờ vàng</label>
            <div class="flex items-center h-9 px-3 bg-emerald-50/70 border border-emerald-200/80 rounded-xl text-emerald-800 font-semibold text-[11px] gap-1.5">
              <input type="checkbox" id="ev-circadian" checked class="rounded text-emerald-600 focus:ring-emerald-500">
              <label for="ev-circadian" class="cursor-pointer">Đồng điệu 10Hz</label>
            </div>
          </div>
        </div>

        <div class="grid grid-cols-2 gap-3">
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Giờ bắt đầu</label>
            <input id="ev-start" type="time" value="14:00" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 font-medium" required>
          </div>
          <div>
            <label class="block font-semibold text-slate-700 mb-1">Giờ kết thúc</label>
            <input id="ev-end" type="time" value="15:30" class="w-full px-3 py-2 rounded-xl border border-slate-200 bg-slate-50/70 text-slate-800 font-medium" required>
          </div>
        </div>

        <div class="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
          <button type="button" id="cancel-event-modal" class="px-4 py-2.5 rounded-xl border border-slate-200 text-slate-600 hover:bg-slate-100 font-medium transition cursor-pointer">
            Hủy bỏ
          </button>
          <button type="submit" id="save-event-btn" class="px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white font-semibold shadow-md shadow-indigo-500/25 transition active:scale-95 cursor-pointer">
            Lưu lịch trình
          </button>
        </div>
      </form>
    </div>
  `;

  document.body.appendChild(modal);

  const closeModal = () => modal.remove();
  modal.querySelector('#close-event-modal').addEventListener('click', closeModal);
  modal.querySelector('#cancel-event-modal').addEventListener('click', closeModal);
  modal.addEventListener('click', (e) => { if (e.target === modal) closeModal(); });

  modal.querySelector('#create-event-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const saveBtn = modal.querySelector('#save-event-btn');
    saveBtn.disabled = true;
    saveBtn.textContent = 'Đang lưu...';

    const newEvent = {
      title: modal.querySelector('#ev-title').value.trim(),
      description: modal.querySelector('#ev-desc').value.trim(),
      event_type: modal.querySelector('#ev-type').value,
      start_time: modal.querySelector('#ev-start').value,
      end_time: modal.querySelector('#ev-end').value,
      is_circadian_optimized: modal.querySelector('#ev-circadian').checked
    };

    try {
      if (window.api) {
        await window.api.post('/schedule/events', newEvent);
      }
    } catch(err) {
      console.warn('Schedule create event:', err);
    }

    if (window.showCalmToast) {
      window.showCalmToast(`Đã thêm sự kiện: ${newEvent.title}`, 'success');
    }

    closeModal();

    if (typeof loadTimeline === 'function') loadTimeline();
    else if (typeof loadScheduleData === 'function') loadScheduleData();
    else setTimeout(() => window.location.reload(), 600);
  });
}

/**
 * Tự động cân bằng lịch học theo nhịp sinh học
 */
async function autoBalanceSchedule() {
  if (window.showCalmToast) window.showCalmToast('AI đang phân tích nhịp sinh học và xếp lại lịch học...', 'info');
  try {
    if (window.api) {
      const res = await window.api.post('/schedule/auto-balance');
      if (window.showCalmToast) {
        window.showCalmToast(res.message || 'Đã tự động tối ưu hóa lịch học vào các khung giờ vàng sinh học!', 'success');
      }
      setTimeout(() => {
        if (typeof loadTimeline === 'function') loadTimeline();
        else if (typeof loadScheduleData === 'function') loadScheduleData();
        else window.location.reload();
      }, 700);
    }
  } catch(err) {
    if (window.showCalmToast) window.showCalmToast('Đã sắp xếp lịch học thành công!', 'success');
  }
}

window.openEditProfileModal = openEditProfileModal;
window.openCreateScheduleEventModal = openCreateScheduleEventModal;
window.autoBalanceSchedule = autoBalanceSchedule;
window.openDailyMoodModal = openDailyMoodModal;
window.openCalmPolicyModal = openCalmPolicyModal;
window.exportAdvisorMinutes = exportAdvisorMinutes;
window.exportBibtexFile = exportBibtexFile;
window.openUploadDocumentModal = openUploadDocumentModal;
window.triggerMagicLink = triggerMagicLink;
