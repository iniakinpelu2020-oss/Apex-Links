/* Apex Links — offline bookmarks and self-hosted short links.
 * Everything lives in localStorage; the only navigation is the one you click.
 * Short links are resolved by this page: #/s/<alias> (or ?s=<alias>).
 */
(function () {
  'use strict';

  var KEY = 'apex.links.v1';
  var links = [];
  var view = { mode: 'all', tag: '' };
  var editingId = null;
  var toastTimer = 0;

  var el = {
    list: document.getElementById('linkList'),
    count: document.getElementById('count'),
    allCount: document.getElementById('allCount'),
    pinCount: document.getElementById('pinCount'),
    tagList: document.getElementById('tagList'),
    noTags: document.getElementById('noTags'),
    search: document.getElementById('search'),
    viewTitle: document.getElementById('viewTitle'),
    viewSub: document.getElementById('viewSub'),
    shortNote: document.getElementById('shortNote'),
    emptyState: document.getElementById('emptyState'),
    emptyFilter: document.getElementById('emptyFilter'),
    toast: document.getElementById('toast'),
    editor: document.getElementById('editor'),
    editorTitle: document.getElementById('editorTitle'),
    form: document.getElementById('editorForm'),
    fUrl: document.getElementById('fUrl'),
    fTitle: document.getElementById('fTitle'),
    fAlias: document.getElementById('fAlias'),
    fTags: document.getElementById('fTags'),
    fNote: document.getElementById('fNote'),
    fPin: document.getElementById('fPin'),
    err: document.getElementById('editorErr'),
    saveBtn: document.getElementById('saveBtn'),
    redirectDialog: document.getElementById('redirectDialog'),
    redirectTitle: document.getElementById('redirectTitle'),
    redirectNote: document.getElementById('redirectNote'),
    redirectUrl: document.getElementById('redirectUrl'),
    redirectOpen: document.getElementById('redirectOpen'),
    copyDialog: document.getElementById('copyDialog'),
    copyValue: document.getElementById('copyValue'),
    importFile: document.getElementById('importFile')
  };

  /* ---------- small helpers ---------- */

  function uid() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function byId(id) {
    for (var i = 0; i < links.length; i++) if (links[i].id === id) return links[i];
    return null;
  }

  function normalizeUrl(raw) {
    var s = String(raw == null ? '' : raw).trim();
    if (!s) return null;
    if (!/^[a-z][a-z0-9+.-]*:/i.test(s)) s = 'https://' + s;
    var u;
    try { u = new URL(s); } catch (err) { return null; }
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (!u.hostname) return null;
    var ip = /^\d{1,3}(\.\d{1,3}){3}$/.test(u.hostname);
    if (u.hostname !== 'localhost' && !ip && u.hostname.indexOf('.') === -1) return null;
    return u.href;
  }

  function hostOf(url) {
    try { return new URL(url).hostname.replace(/^www\./, ''); } catch (err) { return String(url); }
  }

  function parseTags(raw) {
    var out = [];
    String(raw || '').split(',').forEach(function (part) {
      part.split(/\s+/).forEach(function (word) {
        var tag = word.toLowerCase().replace(/^#/, '').replace(/[^a-z0-9._-]/g, '');
        if (tag && tag.length <= 24 && out.indexOf(tag) === -1) out.push(tag);
      });
    });
    return out.slice(0, 8);
  }

  function slugify(text) {
    return String(text || '').toLowerCase()
      .replace(/^https?:\/\//, '')
      .replace(/^www\./, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
  }

  function cleanAlias(raw) {
    return String(raw || '').toLowerCase().trim()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 32);
  }

  function uniqueAlias(base, exceptId) {
    var start = cleanAlias(base) || 'link';
    var candidate = start;
    var n = 2;
    while (links.some(function (l) { return l.alias === candidate && l.id !== exceptId; })) {
      candidate = start + '-' + n;
      n += 1;
    }
    return candidate;
  }

  function initials(link) {
    var name = link.title || hostOf(link.url);
    var words = String(name).replace(/[^a-zA-Z0-9]+/g, ' ').trim().split(/\s+/).filter(Boolean);
    if (!words.length) return '//';
    if (words.length === 1) return words[0].slice(0, 2);
    return words[0].charAt(0) + words[1].charAt(0);
  }

  function hueOf(text) {
    var h = 0;
    for (var i = 0; i < text.length; i++) h = (h * 31 + text.charCodeAt(i)) % 360;
    return h;
  }

  function toast(message) {
    el.toast.textContent = message;
    el.toast.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = window.setTimeout(function () { el.toast.hidden = true; }, 2200);
  }

  function showErr(message) {
    el.err.textContent = message;
    el.err.hidden = false;
  }

  /* ---------- storage ---------- */

  function load() {
    var raw = null;
    try { raw = localStorage.getItem(KEY); } catch (err) { raw = null; }
    var parsed = null;
    try { parsed = raw ? JSON.parse(raw) : []; } catch (err) { parsed = []; }
    if (!Array.isArray(parsed)) parsed = [];

    links = [];
    parsed.forEach(function (item) {
      if (!item) return;
      var url = normalizeUrl(item.url);
      if (!url) return;
      var title = typeof item.title === 'string' ? item.title.trim() : '';
      links.push({
        id: typeof item.id === 'string' && item.id ? item.id : uid(),
        url: url,
        title: title || hostOf(url),
        note: typeof item.note === 'string' ? item.note : '',
        tags: parseTags(Array.isArray(item.tags) ? item.tags.join(',') : (item.tags || '')),
        alias: cleanAlias(item.alias) || '',
        pinned: !!item.pinned,
        hits: Number(item.hits) || 0,
        created: Number(item.created) || Date.now(),
        updated: Number(item.updated) || Date.now()
      });
    });

    links.forEach(function (link) {
      link.alias = uniqueAlias(link.alias || slugify(link.title) || hostOf(link.url), link.id);
    });

    persist();
  }

  function persist() {
    try {
      localStorage.setItem(KEY, JSON.stringify(links));
      return true;
    } catch (err) {
      toast('Could not save on this device');
      return false;
    }
  }

  /* ---------- short links ---------- */

  function shortBase() {
    return location.origin + location.pathname.replace(/index\.html?$/i, '') + '#/s/';
  }

  function shortUrl(alias) {
    return shortBase() + alias;
  }

  function shortTarget() {
    var hash = String(location.hash || '').replace(/^#/, '');
    var match = hash.match(/^\/?s\/([^/?#]+)/i);
    if (match) {
      try { return decodeURIComponent(match[1]); } catch (err) { return match[1]; }
    }
    try {
      var q = new URLSearchParams(location.search).get('s');
      if (q) return q;
    } catch (err) { /* ignore */ }
    return null;
  }

  function launch(url) {
    if (window.top !== window.self) {
      // Inside the ApexOS shell the app is an iframe: a new tab is the only
      // reliable way out, since most sites refuse to be framed.
      var win = window.open(url, '_blank');
      if (win) {
        try { win.opener = null; } catch (err) { /* cross-origin */ }
        return true;
      }
      return false;
    }
    location.assign(url);
    return true;
  }

  function showRedirect() {
    if (typeof el.redirectDialog.showModal === 'function') {
      if (!el.redirectDialog.open) el.redirectDialog.showModal();
    } else {
      el.redirectDialog.setAttribute('open', '');
    }
  }

  function handleShortLink() {
    var alias = shortTarget();
    if (!alias) return;
    alias = cleanAlias(alias);
    var hit = null;
    links.forEach(function (link) { if (link.alias === alias) hit = link; });

    if (!hit) {
      el.redirectTitle.textContent = 'Link not found';
      el.redirectNote.textContent = 'Nothing here uses the alias /s/' + alias + '.';
      el.redirectUrl.textContent = shortUrl(alias);
      el.redirectOpen.hidden = true;
      el.redirectOpen.setAttribute('href', '#');
      showRedirect();
      return;
    }

    hit.hits += 1;
    persist();

    el.redirectTitle.textContent = 'Opening “' + hit.title + '”';
    el.redirectNote.textContent = 'Saved on this device · /s/' + hit.alias;
    el.redirectUrl.textContent = hit.url;
    el.redirectOpen.hidden = false;
    el.redirectOpen.setAttribute('href', hit.url);
    showRedirect();

    window.setTimeout(function () { launch(hit.url); }, 350);
  }

  function clearShortRoute() {
    try {
      var params = new URLSearchParams(location.search);
      params.delete('s');
      var qs = params.toString();
      history.replaceState(null, '', location.pathname + (qs ? '?' + qs : ''));
    } catch (err) {
      try { history.replaceState(null, '', location.pathname); } catch (err2) { /* ignore */ }
    }
  }

  /* ---------- clipboard ---------- */

  function fallbackCopy(text) {
    try {
      var box = document.createElement('textarea');
      box.value = text;
      box.setAttribute('readonly', '');
      box.style.position = 'fixed';
      box.style.top = '0';
      box.style.opacity = '0';
      document.body.appendChild(box);
      box.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(box);
      return ok;
    } catch (err) {
      return false;
    }
  }

  function copyText(text) {
    return new Promise(function (resolve) {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(
          function () { resolve(true); },
          function () { resolve(fallbackCopy(text)); }
        );
        return;
      }
      resolve(fallbackCopy(text));
    });
  }

  function copyShort(id) {
    var link = byId(id);
    if (!link) return;
    var text = shortUrl(link.alias);
    copyText(text).then(function (ok) {
      if (ok) {
        toast('Short link copied · /s/' + link.alias);
        return;
      }
      el.copyValue.value = text;
      if (typeof el.copyDialog.showModal === 'function') {
        if (!el.copyDialog.open) el.copyDialog.showModal();
      } else {
        el.copyDialog.setAttribute('open', '');
      }
      el.copyValue.focus();
      el.copyValue.select();
    });
  }

  /* ---------- rendering ---------- */

  function sortedAll() {
    return links.slice().sort(function (a, b) {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.updated - a.updated;
    });
  }

  function visibleRows() {
    var q = el.search.value.trim().toLowerCase();
    return sortedAll().filter(function (link) {
      if (view.mode === 'pinned' && !link.pinned) return false;
      if (view.mode === 'tag' && link.tags.indexOf(view.tag) === -1) return false;
      if (!q) return true;
      var hay = link.title + ' ' + link.url + ' ' + link.alias + ' ' + link.note + ' ' + link.tags.join(' ');
      return hay.toLowerCase().indexOf(q) !== -1;
    });
  }

  function tagCounts() {
    var map = {};
    links.forEach(function (link) {
      link.tags.forEach(function (tag) { map[tag] = (map[tag] || 0) + 1; });
    });
    return Object.keys(map).sort(function (a, b) {
      if (map[b] !== map[a]) return map[b] - map[a];
      return a.localeCompare(b);
    }).map(function (tag) { return { tag: tag, count: map[tag] }; });
  }

  function renderTags() {
    var tags = tagCounts();
    el.tagList.textContent = '';
    el.noTags.hidden = tags.length > 0;
    tags.forEach(function (row) {
      var button = document.createElement('button');
      button.type = 'button';
      button.className = 'filter';
      button.dataset.tag = row.tag;
      button.setAttribute('aria-current', view.mode === 'tag' && view.tag === row.tag ? 'true' : 'false');

      var name = document.createElement('span');
      name.textContent = '#' + row.tag;
      var count = document.createElement('b');
      count.textContent = String(row.count);
      button.append(name, count);
      el.tagList.appendChild(button);
    });
  }

  function buildCard(link) {
    var card = document.createElement('li');
    card.className = 'card' + (link.pinned ? ' pinned' : '');
    card.dataset.id = link.id;

    var head = document.createElement('div');
    head.className = 'card-head';

    var tile = document.createElement('span');
    tile.className = 'tile';
    tile.setAttribute('aria-hidden', 'true');
    tile.textContent = initials(link);
    tile.style.background = 'hsl(' + hueOf(hostOf(link.url)) + ' 72% 74%)';

    var who = document.createElement('div');
    who.className = 'who';

    var title = document.createElement('a');
    title.className = 'card-title';
    title.href = link.url;
    title.target = '_blank';
    title.rel = 'noopener noreferrer';
    title.textContent = link.title;
    title.title = link.title;

    var host = document.createElement('span');
    host.className = 'host';
    host.textContent = hostOf(link.url);
    host.title = link.url;

    who.append(title, host);

    var pin = document.createElement('button');
    pin.type = 'button';
    pin.className = 'pin';
    pin.dataset.act = 'pin';
    pin.dataset.id = link.id;
    pin.setAttribute('aria-pressed', link.pinned ? 'true' : 'false');
    pin.setAttribute('aria-label', (link.pinned ? 'Unpin ' : 'Pin ') + link.title);
    pin.title = link.pinned ? 'Unpin' : 'Pin to top';
    pin.textContent = link.pinned ? '★' : '☆';

    head.append(tile, who, pin);
    card.appendChild(head);

    if (link.note) {
      var note = document.createElement('p');
      note.className = 'note';
      note.textContent = link.note;
      card.appendChild(note);
    }

    if (link.tags.length) {
      var tags = document.createElement('div');
      tags.className = 'tags';
      link.tags.forEach(function (tag) {
        var chip = document.createElement('button');
        chip.type = 'button';
        chip.className = 'tag';
        chip.dataset.tag = tag;
        chip.textContent = '#' + tag;
        tags.appendChild(chip);
      });
      card.appendChild(tags);
    }

    var foot = document.createElement('div');
    foot.className = 'card-foot';

    var pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'alias-pill';
    pill.dataset.act = 'copy';
    pill.dataset.id = link.id;
    pill.textContent = '#/s/' + link.alias;
    pill.title = 'Copy short link: ' + shortUrl(link.alias);

    foot.appendChild(pill);

    if (link.hits > 0) {
      var hits = document.createElement('span');
      hits.className = 'hits';
      hits.textContent = link.hits + (link.hits === 1 ? ' open' : ' opens');
      foot.appendChild(hits);
    }

    var actions = document.createElement('div');
    actions.className = 'card-actions';

    var edit = document.createElement('button');
    edit.type = 'button';
    edit.className = 'ghost';
    edit.dataset.act = 'edit';
    edit.dataset.id = link.id;
    edit.textContent = 'Edit';

    var del = document.createElement('button');
    del.type = 'button';
    del.className = 'ghost danger';
    del.dataset.act = 'del';
    del.dataset.id = link.id;
    del.textContent = 'Delete';

    actions.append(edit, del);
    foot.appendChild(actions);
    card.appendChild(foot);

    return card;
  }

  function render() {
    var rows = visibleRows();

    el.count.textContent = links.length + (links.length === 1 ? ' link' : ' links');
    el.allCount.textContent = String(links.length);
    el.pinCount.textContent = String(links.filter(function (l) { return l.pinned; }).length);

    document.querySelectorAll('.filters [data-mode]').forEach(function (button) {
      var active = view.mode === button.dataset.mode;
      button.setAttribute('aria-current', active ? 'true' : 'false');
    });

    renderTags();

    el.viewTitle.textContent = view.mode === 'pinned' ? 'Pinned'
      : view.mode === 'tag' ? '#' + view.tag
      : 'All links';
    el.viewSub.textContent = links.length
      ? rows.length + ' shown · saved in this browser'
      : 'Everything you saved, on this device.';

    el.list.textContent = '';
    rows.forEach(function (link) { el.list.appendChild(buildCard(link)); });

    el.emptyState.hidden = links.length > 0;
    el.emptyFilter.hidden = !(links.length > 0 && rows.length === 0);
    el.list.hidden = rows.length === 0;
  }

  function renderShortBase() {
    el.shortNote.textContent = '';
    var label = document.createElement('span');
    label.textContent = 'Short links: ';
    var code = document.createElement('code');
    code.textContent = shortBase().replace(/^https?:\/\//, '') + '<alias>';
    el.shortNote.append(label, code);
    el.shortNote.title = shortBase() + '<alias>';
    el.shortNote.hidden = false;
  }

  /* ---------- editor ---------- */

  function openEditor(id) {
    editingId = id || null;
    var link = editingId ? byId(editingId) : null;

    el.editorTitle.textContent = link ? 'Edit link' : 'Add link';
    el.saveBtn.textContent = link ? 'Save changes' : 'Save link';
    el.err.hidden = true;
    el.err.textContent = '';

    el.fUrl.value = link ? link.url : '';
    el.fTitle.value = link ? link.title : '';
    el.fAlias.value = link ? link.alias : '';
    el.fTags.value = link ? link.tags.join(', ') : '';
    el.fNote.value = link ? link.note : '';
    el.fPin.checked = link ? link.pinned : false;

    if (typeof el.editor.showModal === 'function') {
      if (!el.editor.open) el.editor.showModal();
    } else {
      el.editor.setAttribute('open', '');
    }
    (link ? el.fTitle : el.fUrl).focus();
  }

  function closeEditor() {
    if (typeof el.editor.close === 'function') el.editor.close();
    else el.editor.removeAttribute('open');
    editingId = null;
  }

  function saveEditor() {
    var url = normalizeUrl(el.fUrl.value);
    if (!url) {
      showErr('Enter a web address like example.com/page.');
      el.fUrl.focus();
      return;
    }
    var existing = editingId ? byId(editingId) : null;
    var dupe = links.filter(function (l) { return l.url === url && l.id !== editingId; })[0];
    if (dupe) {
      showErr('Already saved as “' + dupe.title + '”.');
      return;
    }

    var title = el.fTitle.value.trim() || hostOf(url);
    if (title.length > 120) title = title.slice(0, 120);
    var alias = uniqueAlias(cleanAlias(el.fAlias.value) || slugify(title) || 'link', editingId);
    var tags = parseTags(el.fTags.value);
    var note = el.fNote.value.trim().slice(0, 400);
    var now = Date.now();

    if (existing) {
      existing.url = url;
      existing.title = title;
      existing.alias = alias;
      existing.tags = tags;
      existing.note = note;
      existing.pinned = el.fPin.checked;
      existing.updated = now;
    } else {
      links.push({
        id: uid(), url: url, title: title, alias: alias, tags: tags, note: note,
        pinned: el.fPin.checked, hits: 0, created: now, updated: now
      });
    }

    persist();
    var wasEdit = !!existing;
    closeEditor();
    render();
    toast(wasEdit ? 'Saved' : 'Saved · short link /s/' + alias);
  }

  /* ---------- item actions ---------- */

  function togglePin(id) {
    var link = byId(id);
    if (!link) return;
    link.pinned = !link.pinned;
    persist();
    render();
    toast(link.pinned ? 'Pinned to the top' : 'Unpinned');
  }

  function removeLink(id) {
    var link = byId(id);
    if (!link) return;
    if (!window.confirm('Delete “' + link.title + '”?')) return;
    links = links.filter(function (l) { return l.id !== id; });
    persist();
    render();
    toast('Deleted');
  }

  function setView(mode, tag) {
    view.mode = mode;
    view.tag = tag || '';
    render();
  }

  /* ---------- import / export ---------- */

  function download(name, text) {
    var blob = new Blob([text], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  }

  function exportAll() {
    if (!links.length) {
      toast('Nothing to export yet');
      return;
    }
    var payload = {
      app: 'apex-links',
      version: 1,
      exported: new Date().toISOString(),
      links: links.map(function (l) {
        return {
          url: l.url, title: l.title, note: l.note, tags: l.tags,
          alias: l.alias, pinned: l.pinned, hits: l.hits, created: l.created, updated: l.updated
        };
      })
    };
    var stamp = new Date().toISOString().slice(0, 10);
    download('apex-links-' + stamp + '.json', JSON.stringify(payload, null, 2));
    toast('Exported ' + links.length + (links.length === 1 ? ' link' : ' links'));
  }

  function importPayload(text) {
    var trimmed = String(text || '').trim();
    var list = null;
    var parsed = false;

    if (trimmed.charAt(0) === '[' || trimmed.charAt(0) === '{') {
      try {
        var data = JSON.parse(trimmed);
        if (Array.isArray(data)) {
          list = data;
          parsed = true;
        } else if (data && Array.isArray(data.links)) {
          list = data.links;
          parsed = true;
        }
      } catch (err) {
        parsed = false;
      }
    }

    if (!parsed) {
      try {
        var doc = new DOMParser().parseFromString(text, 'text/html');
        var anchors = doc.querySelectorAll('a[href]');
        list = [];
        Array.prototype.forEach.call(anchors, function (a) {
          list.push({ url: a.getAttribute('href'), title: (a.textContent || '').trim() });
        });
      } catch (err) {
        list = [];
      }
    }

    if (!list || !list.length) return { added: 0, skipped: 0, empty: true };

    var added = 0;
    var skipped = 0;
    list.forEach(function (raw) {
      var src = typeof raw === 'string' ? { url: raw } : (raw || {});
      var url = normalizeUrl(src.url || src.href || '');
      if (!url) { skipped += 1; return; }
      if (links.some(function (l) { return l.url === url; })) { skipped += 1; return; }

      var title = String(src.title || src.name || '').trim() || hostOf(url);
      if (title.length > 120) title = title.slice(0, 120);
      var tags = parseTags(Array.isArray(src.tags) ? src.tags.join(',') : (src.tags || ''));
      var now = Date.now();

      links.push({
        id: uid(), url: url, title: title, alias: uniqueAlias(slugify(title) || hostOf(url), null),
        tags: tags, note: '', pinned: false, hits: 0, created: now, updated: now
      });
      added += 1;
    });

    return { added: added, skipped: skipped, empty: false };
  }

  function readImportFile(file) {
    if (!file) return;
    var reader = new FileReader();
    reader.onload = function () {
      var result = importPayload(String(reader.result || ''));
      if (result.empty) {
        toast('No links found in that file');
        return;
      }
      persist();
      render();
      toast(result.added + ' imported' + (result.skipped ? ' · ' + result.skipped + ' skipped' : ''));
    };
    reader.onerror = function () { toast('Could not read that file'); };
    reader.readAsText(file);
  }

  /* ---------- wiring ---------- */

  document.getElementById('addBtn').addEventListener('click', function () { openEditor(null); });
  document.getElementById('exportBtn').addEventListener('click', exportAll);
  document.getElementById('importBtn').addEventListener('click', function () { el.importFile.click(); });

  document.querySelectorAll('[data-add]').forEach(function (button) {
    button.addEventListener('click', function () { openEditor(null); });
  });
  document.querySelectorAll('[data-import]').forEach(function (button) {
    button.addEventListener('click', function () { el.importFile.click(); });
  });

  el.importFile.addEventListener('change', function () {
    readImportFile(el.importFile.files && el.importFile.files[0]);
    el.importFile.value = '';
  });

  el.form.addEventListener('submit', function (event) {
    event.preventDefault();
    saveEditor();
  });

  document.querySelectorAll('.filters [data-mode]').forEach(function (button) {
    button.addEventListener('click', function () { setView(button.dataset.mode, ''); });
  });

  el.tagList.addEventListener('click', function (event) {
    var button = event.target.closest('[data-tag]');
    if (button) setView('tag', button.dataset.tag);
  });

  el.search.addEventListener('input', render);

  el.list.addEventListener('click', function (event) {
    var tagChip = event.target.closest('.tag[data-tag]');
    if (tagChip) {
      setView('tag', tagChip.dataset.tag);
      return;
    }
    var action = event.target.closest('[data-act]');
    if (!action) return;
    var id = action.dataset.id;
    var act = action.dataset.act;
    if (act === 'copy') copyShort(id);
    else if (act === 'edit') openEditor(id);
    else if (act === 'del') removeLink(id);
    else if (act === 'pin') togglePin(id);
  });

  document.querySelectorAll('dialog [data-close]').forEach(function (button) {
    button.addEventListener('click', function () {
      var dialog = button.closest('dialog');
      if (dialog) dialog.close();
    });
  });

  el.redirectDialog.addEventListener('close', clearShortRoute);
  document.getElementById('redirectClose').addEventListener('click', function () {
    el.redirectDialog.close();
  });

  window.addEventListener('hashchange', handleShortLink);

  document.addEventListener('keydown', function (event) {
    if (el.editor.open || el.redirectDialog.open || el.copyDialog.open) return;
    var tag = (event.target.tagName || '').toLowerCase();
    var typing = tag === 'input' || tag === 'textarea' || event.target.isContentEditable;
    if (typing) return;
    if (event.key === '/' && !event.ctrlKey && !event.metaKey) {
      event.preventDefault();
      el.search.focus();
    } else if ((event.key === 'n' || event.key === 'N') && !event.ctrlKey && !event.metaKey && !event.altKey) {
      event.preventDefault();
      openEditor(null);
    }
  });

  window.addEventListener('beforeunload', function () {
    if (editingId) closeEditor();
  });

  load();
  render();
  renderShortBase();
  handleShortLink();

  if ('serviceWorker' in navigator) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('./sw.js').catch(function () {});
    });
  }
})();
