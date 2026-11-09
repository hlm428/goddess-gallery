/** 每日图鉴 · 管理后台逻辑（独立页面，不改主站） */

const LS_KEY = 'gallery-admin-data';
let data = null; // { meta, people }
let editingId = null; // null = 新建
let draftPhotos = []; // 表单里的照片（含已有 + 新传）

const $ = (id) => document.getElementById(id);

function toast(msg) {
  const t = $('toast');
  t.textContent = msg;
  t.style.display = 'block';
  setTimeout(() => (t.style.display = 'none'), 2200);
}

function today() {
  // 本地日期（toISOString 是 UTC，中国时区凌晨会落到昨天）
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/* ---------- 数据加载 ---------- */

async function loadFromSite() {
  try {
    const res = await fetch('data/people.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    setData(json);
    toast('已读取本站 data/people.json（' + json.people.length + ' 人）');
    return true;
  } catch {
    return false;
  }
}

function setData(json) {
  if (!json || !Array.isArray(json.people)) {
    alert('json 格式不对：需要 { meta, people: [...] }');
    return;
  }
  data = { meta: json.meta || {}, people: json.people };
  saveLocal();
  renderList();
}

function saveLocal() {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(data));
  } catch {
    /* 数据太大时忽略 */
  }
}

function restoreLocal() {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return false;
    const json = JSON.parse(raw);
    if (json && Array.isArray(json.people)) {
      data = json;
      return true;
    }
  } catch {
    /* ignore */
  }
  return false;
}

/* ---------- 列表 ---------- */

function renderList() {
  const kw = $('search').value.trim().toLowerCase();
  const list = $('list');
  list.innerHTML = '';
  const people = (data ? data.people : []).filter(
    (p) =>
      !kw ||
      p.name.toLowerCase().includes(kw) ||
      (p.alias || '').toLowerCase().includes(kw) ||
      (p.group || '').toLowerCase().includes(kw) ||
      (p.originalName || '').toLowerCase().includes(kw),
  );
  $('count').textContent = data ? `共 ${data.people.length} 人 · 显示 ${people.length}` : '';
  $('downloadBtn').disabled = !data;
  for (const p of people) {
    const row = document.createElement('div');
    row.className = 'row';
    const firstPhoto = (p.photos || [])[0];
    const thumb = firstPhoto ? firstPhoto.file : '';
    row.innerHTML = `
      ${thumb ? `<img src="${thumb}" alt="${p.name}" />` : '<img alt="" />'}
      <div class="info">
        <div class="nm">${p.name} <span style="font-size:11px;color:var(--sub)">${p.originalName || ''}</span></div>
        <div class="grp">${p.group || ''} · ${p.role || ''} · ${(p.countries || []).join('、')}</div>
        <div class="ph">${(p.photos || []).length} 张照片 · 生日 ${p.birthDate || '—'} · 身高 ${p.height || '—'}</div>
      </div>
      <button class="btn danger delBtn" data-del="${p.id}">删除</button>`;
    row.onclick = (e) => {
      if (e.target.closest('.delBtn')) return;
      openForm(p.id);
    };
    list.appendChild(row);
  }
  for (const b of list.querySelectorAll('[data-del]')) {
    b.onclick = (e) => {
      e.stopPropagation();
      askDelete(b.dataset.del);
    };
  }
}

/* ---------- 删除（确认框） ---------- */

let pendingDeleteId = null;

function askDelete(id) {
  const p = data.people.find((x) => x.id === id);
  if (!p) return;
  pendingDeleteId = id;
  $('confirmTitle').textContent = '确认删除';
  $('confirmText').innerHTML = `确定删除 <b>${p.name}</b>（${p.group || ''}，${(p.photos || []).length} 张照片）？<br/>删除后要重新下载 people.json 才会生效，主站下次部署后此人消失。`;
  $('confirmMask').classList.add('open');
}

$('confirmCancel').onclick = () => {
  pendingDeleteId = null;
  $('confirmMask').classList.remove('open');
};
$('confirmOk').onclick = () => {
  if (!pendingDeleteId) return;
  data.people = data.people.filter((x) => x.id !== pendingDeleteId);
  pendingDeleteId = null;
  $('confirmMask').classList.remove('open');
  saveLocal();
  renderList();
  toast('已删除（记得下载新的 people.json 替换仓库文件）');
};

/* ---------- 表单（加人 / 编辑） ---------- */

function slugify(name) {
  const pinyinish = name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase();
  return (pinyinish && pinyinish !== '-') ? pinyinish : 'person-' + Date.now().toString(36);
}

function openForm(id) {
  editingId = id || null;
  const p = id ? data.people.find((x) => x.id === id) : null;
  $('formTitle').textContent = p ? '编辑 · ' + p.name : '加新人';
  $('fName').value = p ? p.name : '';
  $('fOriginal').value = p ? p.originalName || '' : '';
  $('fGroup').value = p ? p.group || '' : '';
  $('fRole').value = p ? p.role || '' : '';
  $('fCountries').value = p ? (p.countries || []).join('、') : '';
  $('fCategory').value = p ? p.category || 'kpop' : 'kpop';
  $('fBirth').value = p ? p.birthDate || '' : '';
  $('fHeight').value = p ? p.height || '' : '';
  $('fWeight').value = p ? p.weight || '未公开' : '未公开';
  $('fAlias').value = p ? p.alias || '' : '';
  $('fBio').value = p ? p.bio || '' : '';
  $('fWorks').value = p ? (p.works || []).join('\n') : '';
  $('fNote').value = p ? p.note || '' : '';
  draftPhotos = p ? JSON.parse(JSON.stringify(p.photos || [])) : [];
  $('phCaption').value = '';
  $('phStatus').textContent = '';
  $('formErr').textContent = '';
  renderPhotos();
  $('formMask').classList.add('open');
}

function renderPhotos() {
  const wrap = $('phList');
  wrap.innerHTML = '';
  draftPhotos.forEach((ph, i) => {
    const item = document.createElement('div');
    item.className = 'photoItem';
    item.innerHTML = `
      <img src="${ph.file}" alt="" />
      <div class="cap">${ph.caption || '(无说明)'}</div>
      <button class="delPh" title="删除这张照片">✕</button>`;
    item.querySelector('.delPh').onclick = () => {
      askDeletePhoto(i);
    };
    wrap.appendChild(item);
  });
  if (draftPhotos.length === 0) {
    wrap.innerHTML = '<span class="hint">还没有照片。选一张图片，自动压缩到 700–900px 宽、JPG、&lt;300KB。</span>';
  }
}

/** 删照片也要确认（误删照片同样难恢复） */
let pendingPhotoIdx = -1;
function askDeletePhoto(idx) {
  pendingPhotoIdx = idx;
  $('confirmTitle').textContent = '确认删除照片';
  $('confirmText').textContent = `确定删除第 ${idx + 1} 张照片（${draftPhotos[idx].caption || '无说明'}）？`;
  $('confirmMask').classList.add('open');
  // 复用确认框：改写确认按钮行为
  $('confirmOk').onclick = () => {
    if (pendingPhotoIdx >= 0) {
      draftPhotos.splice(pendingPhotoIdx, 1);
      pendingPhotoIdx = -1;
      renderPhotos();
    }
    $('confirmMask').classList.remove('open');
    // 恢复删除人按钮行为
    $('confirmOk').onclick = confirmDeletePerson;
  };
}

function confirmDeletePerson() {
  if (!pendingDeleteId) return;
  data.people = data.people.filter((x) => x.id !== pendingDeleteId);
  pendingDeleteId = null;
  $('confirmMask').classList.remove('open');
  saveLocal();
  renderList();
  toast('已删除（记得下载新的 people.json 替换仓库文件）');
}
$('confirmOk').onclick = confirmDeletePerson;

/** 照片压缩：宽 700–900px、JPG、<300KB（超了就降质量重压） */
async function compressImage(file) {
  const img = await new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const im = new Image();
    im.onload = () => {
      URL.revokeObjectURL(url);
      resolve(im);
    };
    im.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('图片读取失败'));
    };
    im.src = url;
  });
  const targetW = Math.min(900, Math.max(700, img.width));
  const scale = Math.min(1, targetW / img.width);
  const w = Math.round(img.width * scale);
  const h = Math.round(img.height * scale);
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  canvas.getContext('2d').drawImage(img, 0, 0, w, h);
  let quality = 0.82;
  let dataUrl = canvas.toDataURL('image/jpeg', quality);
  while (dataUrl.length * 0.75 > 300 * 1024 && quality > 0.4) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL('image/jpeg', quality);
  }
  return { dataUrl, width: w, height: h, kb: Math.round(dataUrl.length * 0.75 / 1024) };
}

$('phInput').onchange = async (e) => {
  const file = e.target.files[0];
  e.target.value = '';
  if (!file) return;
  $('phStatus').textContent = '压缩中…';
  try {
    const r = await compressImage(file);
    draftPhotos.push({
      caption: $('phCaption').value.trim(),
      addedAt: today(),
      file: r.dataUrl,
      credit: '',
      license: '',
      source: '',
    });
    $('phStatus').textContent = `✓ ${r.width}×${r.height}px · ${r.kb}KB JPG（已压好）`;
    $('phCaption').value = '';
    renderPhotos();
  } catch (err) {
    $('phStatus').textContent = '❌ ' + (err.message || '处理失败');
  }
};

$('formClose').onclick = $('formCancel').onclick = () => $('formMask').classList.remove('open');

$('formSave').onclick = () => {
  const name = $('fName').value.trim();
  const group = $('fGroup').value.trim();
  if (!name || !group) {
    $('formErr').textContent = '名字和所属团必填。';
    return;
  }
  const person = {
    id: editingId || slugify(name) + '-' + Date.now().toString(36).slice(-4),
    name,
    originalName: $('fOriginal').value.trim(),
    group,
    role: $('fRole').value.trim(),
    countries: $('fCountries').value.split(/[,，、\s]+/).filter(Boolean),
    category: $('fCategory').value,
    birthDate: $('fBirth').value,
    height: $('fHeight').value.trim(),
    weight: $('fWeight').value.trim() || '未公开',
    bio: $('fBio').value.trim(),
    works: $('fWorks').value.split('\n').map((s) => s.trim()).filter(Boolean),
    alias: $('fAlias').value.trim(),
    note: $('fNote').value.trim(),
    photos: draftPhotos,
    addedAt: editingId ? (data.people.find((x) => x.id === editingId).addedAt || today()) : today(),
  };
  if (editingId) {
    const i = data.people.findIndex((x) => x.id === editingId);
    data.people[i] = person;
    toast('已保存「' + name + '」的修改');
  } else {
    data.people.unshift(person);
    toast('已添加「' + name + '」');
  }
  saveLocal();
  $('formMask').classList.remove('open');
  renderList();
};

/* ---------- 导入 / 下载 ---------- */

$('importBtn').onclick = () => $('importInput').click();
$('importInput').onchange = async (e) => {
  const f = e.target.files[0];
  e.target.value = '';
  if (!f) return;
  try {
    const json = JSON.parse(await f.text());
    setData(json);
    toast('导入成功：' + json.people.length + ' 人');
  } catch (err) {
    alert('导入失败：' + err.message);
  }
};

$('downloadBtn').onclick = () => {
  if (!data) return;
  const out = {
    meta: { ...data.meta, updatedAt: today() },
    people: data.people,
  };
  const blob = new Blob([JSON.stringify(out, null, 2)], { type: 'application/json' });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(blob);
  a.download = 'people.json';
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 3000);
  toast('people.json 已下载——替换仓库 data/people.json 并提交');
};

/* ---------- 启动 ---------- */

$('search').oninput = renderList;
$('addBtn').onclick = () => openForm(null);

(async () => {
  const ok = await loadFromSite();
  if (!ok) {
    if (!restoreLocal()) {
      $('footNote').textContent = '⚠️ 未能自动读取 data/people.json（本地 file:// 打开会这样）。点「📥 导入 people.json」载入仓库里的文件，或部署后从网站访问本页。';
    } else {
      toast('已恢复上次未提交的编辑');
    }
  }
  renderList();
})();
