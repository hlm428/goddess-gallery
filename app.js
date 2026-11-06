/* 每日图鉴 — 页面逻辑
   所有人物与照片数据都来自 data/people.json，本文件不含任何人物资料。 */
(function () {
  'use strict';

  var BASE = document.currentScript ? new URL('.', document.currentScript.src).href : location.href;
  var $ = function (s, r) { return (r || document).querySelector(s); };
  var PAGE_SIZE = 8;

  var state = {
    data: null,
    people: [],
    category: 'all',
    country: 'all',
    query: '',
    shown: PAGE_SIZE,
    filtered: [],
    lb: { id: null, idx: 0 }
  };

  /* ---------- utils ---------- */
  function esc(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  function localISO(d) {
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function prettyDate(s) {
    var p = String(s || '').split('-');
    return p.length === 3 ? (p[0] + ' 年 ' + Number(p[1]) + ' 月 ' + Number(p[2]) + ' 日') : s;
  }
  function ageOf(birth) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(birth || '')) return null;
    var p = birth.split('-').map(Number), now = new Date();
    var a = now.getFullYear() - p[0];
    if (now.getMonth() + 1 < p[1] || (now.getMonth() + 1 === p[1] && now.getDate() < p[2])) a--;
    return a >= 0 && a < 130 ? a : null;
  }
  function photoURL(ph) { return new URL(ph.file, BASE).href; }
  function norm(s) { return String(s || '').toLowerCase().replace(/[\s·・,，.。、/\\-]/g, ''); }
  function searchBlob(p) {
    return norm([p.name, p.originalName, p.alias, p.group, p.role, (p.countries || []).join(''),
      (p.works || []).join(''), p.bio].join(''));
  }

  /* ---------- init ---------- */
  function init() {
    var d = new Date();
    $('#headerDate').innerHTML = '<b>' + (d.getMonth() + 1) + ' 月 ' + d.getDate() + ' 日</b>' +
      d.getFullYear() + ' · 星期' + '日一二三四五六'.charAt(d.getDay());

    fetch(new URL('data/people.json', BASE), { cache: 'no-cache' })
      .then(function (r) {
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
      })
      .then(function (json) {
        state.data = json;
        state.people = json.people || [];
        state.people.forEach(function (p) { p._blob = searchBlob(p); });
        buildChips();
        renderToday();
        renderAll();
        bindEvents();
        renderFooter();
      })
      .catch(function (e) {
        var box = $('#errorBox');
        box.hidden = false;
        box.innerHTML = '<strong>数据加载失败：</strong>' + esc(e.message) +
          '<br>如果是直接双击打开的本地文件，浏览器会拦截本地 JSON 读取。请在项目目录运行 ' +
          '<code>python -m http.server 8000</code>，再访问 <code>http://localhost:8000</code>；' +
          '或者直接用 GitHub Pages 的网址打开。';
        document.querySelector('main').insertBefore(box, document.querySelector('main').firstChild);
      });
  }

  /* ---------- filters ---------- */
  function buildChips() {
    var cats = [
      { v: 'all', t: '全部' }, { v: 'kpop', t: '韩团' }, { v: 'drama', t: '剧集女星' }
    ];
    $('#categoryChips').innerHTML = cats.map(function (c) {
      return '<button class="chip' + (state.category === c.v ? ' active' : '') +
        '" type="button" data-cat="' + c.v + '">' + c.t + '</button>';
    }).join('');

    var order = ['韩国', '日本', '中国台湾', '澳大利亚', '加拿大', '美国', '英国', '意大利'];
    var set = {};
    state.people.forEach(function (p) { (p.countries || []).forEach(function (c) { set[c] = 1; }); });
    var countries = Object.keys(set).sort(function (a, b) {
      var ia = order.indexOf(a), ib = order.indexOf(b);
      return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
    });
    var row = $('#countryChips');
    row.className = 'chip-row country';
    row.innerHTML = ['<button class="chip' + (state.country === 'all' ? ' active' : '') +
      '" type="button" data-country="all">全部国家</button>'].concat(
      countries.map(function (c) {
        return '<button class="chip' + (state.country === c ? ' active' : '') +
          '" type="button" data-country="' + esc(c) + '">' + esc(c) + '</button>';
      })).join('');
  }

  function applyFilters() {
    var q = norm(state.query);
    state.filtered = state.people.filter(function (p) {
      if (state.category !== 'all' && p.category !== state.category) return false;
      if (state.country !== 'all' && (p.countries || []).indexOf(state.country) < 0) return false;
      if (q && p._blob.indexOf(q) < 0) return false;
      return true;
    });
  }

  /* ---------- today ---------- */
  function renderToday() {
    var today = localISO(new Date());
    var photos = [];
    state.people.forEach(function (p) { (p.photos || []).forEach(function (ph) { photos.push(ph); }); });

    var list = state.people.filter(function (p) {
      return p.addedAt === today || (p.photos || []).some(function (ph) { return ph.addedAt === today; });
    });
    var newPhotos = photos.filter(function (ph) { return ph.addedAt === today; }).length;
    var label = '今日更新', dateLabel = prettyDate(today), extra = '';

    if (!list.length) {
      var dates = {};
      state.people.forEach(function (p) { if (p.addedAt) dates[p.addedAt] = 1; });
      photos.forEach(function (ph) { if (ph.addedAt) dates[ph.addedAt] = 1; });
      var keys = Object.keys(dates).sort().reverse();
      var latest = keys[0];
      if (latest) {
        list = state.people.filter(function (p) {
          return p.addedAt === latest || (p.photos || []).some(function (ph) { return ph.addedAt === latest; });
        });
        newPhotos = photos.filter(function (ph) { return ph.addedAt === latest; }).length;
        label = '最近更新';
        dateLabel = prettyDate(latest);
        extra = '今天还没有新照片，先看看最近一次更新 · ' + prettyDate(latest);
      }
    }

    $('#todayTitle').textContent = label;
    $('#todayDateLabel').textContent = dateLabel;
    $('#todayCount').textContent = list.length + ' 位人物 · ' + newPhotos + ' 张照片';
    $('#todayDesc').textContent = extra || '今天新加入图鉴的人物与照片，点一下可以跳到完整卡片。';

    $('#todayStrip').innerHTML = list.map(function (p) {
      var ph = (p.photos || [])[0];
      if (!ph) return '';
      return '<button class="today-card" type="button" data-jump="' + esc(p.id) + '">' +
        '<img src="' + esc(photoURL(ph)) + '" alt="' + esc(p.name) + '" loading="lazy" decoding="async">' +
        '<span class="today-new">NEW</span>' +
        '<span class="t-body"><span class="today-name">' + esc(p.name) + '</span>' +
        '<span class="today-group">' + esc(p.group) + '</span></span></button>';
    }).join('');
  }

  /* ---------- cards ---------- */
  function cardHTML(p) {
    var photos = p.photos || [];
    var isNew = p.addedAt === localISO(new Date());
    var a = ageOf(p.birthDate);
    var birth = esc(p.birthDate) + (a !== null ? ' · ' + a + ' 岁' : '');
    var catName = p.category === 'drama' ? '剧集女星' : '韩团';
    var groupLabel = p.category === 'drama' ? '代表剧' : '所属';

    var track = photos.map(function (ph, i) {
      return '<img src="' + esc(photoURL(ph)) + '" alt="' + esc(p.name) + ' — ' + esc(ph.caption) +
        '" loading="' + (i === 0 ? 'eager' : 'lazy') + '" decoding="async" ' +
        'style="object-position:' + esc(ph.focus || '50% 22%') + '">';
    }).join('');

    var controls = photos.length > 1
      ? '<button class="photo-nav prev" type="button" data-action="prev" aria-label="上一张照片">&#8249;</button>' +
        '<button class="photo-nav next" type="button" data-action="next" aria-label="下一张照片">&#8250;</button>' +
        '<span class="photo-dots">' + photos.map(function (_, i) {
          return '<i class="' + (i === 0 ? 'on' : '') + '" data-go="' + i + '"></i>';
        }).join('') + '</span>' +
        '<span class="photo-index">1 / ' + photos.length + '</span>'
      : '';

    var first = photos[0] || {};
    var credit = '<div class="credit">图源：<a href="' + esc(first.source || '#') +
      '" target="_blank" rel="noopener noreferrer">' + esc(first.credit || '见原图') + '</a>' +
      '<span class="sep">·</span>' + esc(first.license || '') +
      '<span class="sep">·</span>' + esc(first.caption || '') +
      (first.note ? '<span class="sep">·</span>' + esc(first.note) : '') + '</div>';

    var facts = [
      ['身份', p.role], ['出生', birth], ['身高', p.height], ['体重', p.weight || '未公开'],
      ['国家', (p.countries || []).join(' / ')]
    ].map(function (f, i) {
      return '<div class="fact' + (i === 4 ? ' wide' : '') + '"><span class="k">' + f[0] +
        '</span><span class="v" title="' + esc(f[1]) + '">' + esc(f[1]) + '</span></div>';
    }).join('');

    return '<article class="card" id="p-' + esc(p.id) + '" data-id="' + esc(p.id) + '" data-pi="0" data-total="' + photos.length + '">' +
      '<div class="card-photo"><div class="photo-track">' + track + '</div>' +
      (isNew ? '<span class="card-new">NEW</span>' : '') + controls +
      '<button class="photo-zoom" type="button" data-action="zoom" aria-label="放大查看照片">&#10530;</button></div>' +
      '<div class="card-body">' +
      '<div class="name-row"><h3>' + esc(p.name) + '</h3><span class="cat-tag' + (p.category === 'drama' ? ' drama' : '') + '">' + catName + '</span></div>' +
      '<p class="original-name">' + esc(p.originalName) + (p.alias ? '　' + esc(p.alias) : '') + '</p>' +
      '<p class="group-line"><span>' + groupLabel + '</span>' + esc(p.group) + '</p>' +
      '<div class="facts">' + facts + '</div>' +
      '<p class="bio">' + esc(p.bio) + '</p>' +
      '<div class="works"><span class="works-label">代表作</span>' +
      (p.works || []).map(function (w) { return '<span class="work">' + esc(w) + '</span>'; }).join('') + '</div>' +
      (p.note ? '<p class="note">注：' + esc(p.note) + '</p>' : '') +
      credit + '</div></article>';
  }

  function renderAll() {
    applyFilters();
    var total = state.filtered.length;
    var slice = state.filtered.slice(0, state.shown);
    $('#cardGrid').innerHTML = slice.map(cardHTML).join('');
    $('#resultCount').textContent = '共 ' + total + ' 位 · ' +
      state.filtered.reduce(function (n, p) { return n + (p.photos || []).length; }, 0) + ' 张照片';
    $('#emptyState').hidden = total !== 0;
    $('#loadMore').hidden = total <= state.shown;
    $('#endNote').hidden = total > state.shown || total === 0;
  }

  function renderFooter() {
    var n = state.people.length;
    var m = state.people.reduce(function (s, p) { return s + (p.photos || []).length; }, 0);
    $('#footerStats').textContent = '收录 ' + n + ' 位人物 · ' + m + ' 张真实照片 · 数据更新于 ' +
      prettyDate((state.data.meta && state.data.meta.updatedAt) || '');
  }

  /* ---------- carousel ---------- */
  function setPhoto(card, idx) {
    var total = Number(card.dataset.total) || 1;
    if (total < 2) return;
    idx = (idx + total) % total;
    card.dataset.pi = idx;
    card.querySelector('.photo-track').style.transform = 'translateX(' + (-idx * 100) + '%)';
    var dots = card.querySelectorAll('.photo-dots i');
    for (var i = 0; i < dots.length; i++) dots[i].classList.toggle('on', i === idx);
    var idxEl = card.querySelector('.photo-index');
    if (idxEl) idxEl.textContent = (idx + 1) + ' / ' + total;
  }

  function findPerson(id) {
    for (var i = 0; i < state.people.length; i++) if (state.people[i].id === id) return state.people[i];
    return null;
  }

  /* ---------- lightbox ---------- */
  function openLB(id, idx) {
    var p = findPerson(id);
    if (!p || !(p.photos || []).length) return;
    state.lb = { id: id, idx: idx || 0 };
    updateLB();
    $('#lightbox').hidden = false;
    document.body.style.overflow = 'hidden';
  }
  function updateLB() {
    var p = findPerson(state.lb.id), ph = p.photos[state.lb.idx];
    $('#lbImg').src = photoURL(ph);
    $('#lbImg').alt = p.name + ' — ' + (ph.caption || '');
    $('#lbName').textContent = p.name + '　' + (state.lb.idx + 1) + ' / ' + p.photos.length;
    $('#lbCaption').textContent = ph.caption || '';
    $('#lbCredit').textContent = (ph.credit || '') + ' · ' + (ph.license || '');
    $('#lbSource').href = ph.source || '#';
    var one = p.photos.length < 2;
    $('#lbPrev').hidden = one; $('#lbNext').hidden = one;
  }
  function closeLB() { $('#lightbox').hidden = true; document.body.style.overflow = ''; }
  function shiftLB(n) {
    var p = findPerson(state.lb.id);
    if (!p) return;
    state.lb.idx = (state.lb.idx + n + p.photos.length) % p.photos.length;
    updateLB();
  }

  /* ---------- jump from today strip ---------- */
  function jumpTo(id) {
    var idx = -1;
    for (var i = 0; i < state.filtered.length; i++) if (state.filtered[i].id === id) { idx = i; break; }
    if (idx < 0) {
      // 当前筛选下看不到这个人：重置筛选后再找
      state.category = 'all'; state.country = 'all'; state.query = '';
      $('#searchInput').value = ''; $('#clearSearch').hidden = true;
      buildChips(); applyFilters();
      for (var j = 0; j < state.filtered.length; j++) if (state.filtered[j].id === id) { idx = j; break; }
    }
    if (idx < 0) return;
    if (idx >= state.shown) { state.shown = idx + 1; renderAll(); }
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        var el = document.getElementById('p-' + id);
        if (!el) return;
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        el.classList.add('flash');
        setTimeout(function () { el.classList.remove('flash'); }, 1700);
      });
    });
  }

  /* ---------- events ---------- */
  function bindEvents() {
    $('#categoryChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-cat]'); if (!b) return;
      state.category = b.dataset.cat; state.shown = PAGE_SIZE; buildChips(); renderAll();
    });
    $('#countryChips').addEventListener('click', function (e) {
      var b = e.target.closest('[data-country]'); if (!b) return;
      state.country = b.dataset.country; state.shown = PAGE_SIZE; buildChips(); renderAll();
    });

    var si = $('#searchInput');
    si.addEventListener('input', function () {
      state.query = si.value.trim();
      $('#clearSearch').hidden = !si.value;
      state.shown = PAGE_SIZE;
      renderAll();
    });
    $('#clearSearch').addEventListener('click', function () {
      si.value = ''; state.query = ''; state.shown = PAGE_SIZE;
      $('#clearSearch').hidden = true; renderAll(); si.focus();
    });

    $('#todayStrip').addEventListener('click', function (e) {
      var b = e.target.closest('[data-jump]'); if (b) jumpTo(b.dataset.jump);
    });

    var grid = $('#cardGrid');
    grid.addEventListener('click', function (e) {
      var card = e.target.closest('.card'); if (!card) return;
      var go = e.target.closest('[data-go]');
      if (go) { setPhoto(card, Number(go.dataset.go)); return; }
      var act = e.target.closest('[data-action]');
      if (!act) return;
      var a = act.dataset.action;
      if (a === 'prev') setPhoto(card, Number(card.dataset.pi) - 1);
      else if (a === 'next') setPhoto(card, Number(card.dataset.pi) + 1);
      else if (a === 'zoom') openLB(card.dataset.id, Number(card.dataset.pi) || 0);
    });

    // 手机左右滑动切换照片
    var sx = 0, sy = 0, scard = null;
    grid.addEventListener('touchstart', function (e) {
      var c = e.target.closest('.card-photo'); if (!c) return;
      scard = c.closest('.card'); sx = e.touches[0].clientX; sy = e.touches[0].clientY;
    }, { passive: true });
    grid.addEventListener('touchend', function (e) {
      if (!scard || Number(scard.dataset.total) < 2) { scard = null; return; }
      var dx = e.changedTouches[0].clientX - sx, dy = e.changedTouches[0].clientY - sy;
      if (Math.abs(dx) > 36 && Math.abs(dx) > Math.abs(dy) * 1.3) {
        setPhoto(scard, Number(scard.dataset.pi) + (dx < 0 ? 1 : -1));
      }
      scard = null;
    }, { passive: true });

    $('#loadMore').addEventListener('click', function () {
      state.shown += PAGE_SIZE; renderAll();
    });
    if ('IntersectionObserver' in window) {
      new IntersectionObserver(function (entries) {
        if (entries[0].isIntersecting && state.filtered.length > state.shown) {
          state.shown += PAGE_SIZE; renderAll();
        }
      }, { rootMargin: '160px' }).observe($('#sentinel'));
    }

    $('#lbClose').addEventListener('click', closeLB);
    $('#lbPrev').addEventListener('click', function () { shiftLB(-1); });
    $('#lbNext').addEventListener('click', function () { shiftLB(1); });
    $('#lightbox').addEventListener('click', function (e) { if (e.target === this) closeLB(); });
    document.addEventListener('keydown', function (e) {
      if ($('#lightbox').hidden) return;
      if (e.key === 'Escape') closeLB();
      else if (e.key === 'ArrowLeft') shiftLB(-1);
      else if (e.key === 'ArrowRight') shiftLB(1);
    });
    var lx = 0;
    $('#lbImg').addEventListener('touchstart', function (e) { lx = e.touches[0].clientX; }, { passive: true });
    $('#lbImg').addEventListener('touchend', function (e) {
      var dx = e.changedTouches[0].clientX - lx;
      if (Math.abs(dx) > 45) shiftLB(dx < 0 ? 1 : -1);
    }, { passive: true });
  }

  init();
})();
