(() => {
  'use strict';

  const TODAY_ISO = '2026-10-25';
  const PAGE_SIZE = 5;

  const ICON_EDIT = '<path d="M12.9 3.3a1.5 1.5 0 0 1 2.1 0l1.7 1.7a1.5 1.5 0 0 1 0 2.1L7 16.8l-4 .9.9-4L12.9 3.3Z"/><path d="M11.3 4.9l3.8 3.8"/>';
  const ICON_DELETE = '<path d="M4 6h12M8 6V4.5A1 1 0 0 1 9 3.5h2a1 1 0 0 1 1 1V6M6 6l.7 10a1 1 0 0 0 1 1h4.6a1 1 0 0 0 1-1L14 6"/>';
  const ICON_INBOX = '<path d="M3 10.5 5.5 4h9L17 10.5"/><path d="M3 10.5V15a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4.5"/><path d="M3 10.5h4.2a.5.5 0 0 1 .47.33L8.3 12.5h3.4l.63-1.67a.5.5 0 0 1 .47-.33H17"/>';
  const ICON_SEARCH_OFF = '<circle cx="8.5" cy="8.5" r="5.5"/><path d="M16.5 16.5 13 13"/>';
  const ICON_HAMBURGER = '<path d="M3 5h14M3 10h14M3 15h14"/>';
  const ICON_CLOSE = '<path d="M5 5l10 10M15 5 5 15"/>';

  let nextId = 9;
  let records = [
    { id: 1, descricao: 'Cálculo I — Limites e derivadas', pasta: 'Matemática', dataInicial: '2026-08-04', dataAtualizacao: '2026-09-25' },
    { id: 2, descricao: 'Anatomia — Sistema nervoso', pasta: 'Medicina', dataInicial: '2026-08-11', dataAtualizacao: '2026-10-20' },
    { id: 3, descricao: 'Química Orgânica — Funções e nomenclatura', pasta: 'Química', dataInicial: '2026-08-18', dataAtualizacao: '2026-08-18' },
    { id: 4, descricao: 'Física II — Eletromagnetismo', pasta: 'Física', dataInicial: '2026-09-01', dataAtualizacao: '2026-10-14' },
    { id: 5, descricao: 'Programação — Estruturas de dados', pasta: 'Ciência da Computação', dataInicial: '2026-09-08', dataAtualizacao: '2026-10-23' },
    { id: 6, descricao: 'Direito Constitucional — Direitos fundamentais', pasta: 'Direito', dataInicial: '2026-09-15', dataAtualizacao: '2026-09-15' },
    { id: 7, descricao: 'História do Brasil — Era Vargas', pasta: 'História', dataInicial: '2026-09-22', dataAtualizacao: '2026-10-05' },
    { id: 8, descricao: 'Inglês — Phrasal verbs essenciais', pasta: 'Idiomas', dataInicial: '2026-09-29', dataAtualizacao: '2026-10-12' },
  ];

  let searchQuery = '';
  let currentPage = 1;
  let editingId = null;
  let pendingDeleteId = null;
  let undoState = null;
  let toastTimer = null;
  let lastFocusedEl = null;

  const el = (id) => document.getElementById(id);

  const appShell = el('appShell');
  const sidebar = el('sidebar');
  const sidebarOverlay = el('sidebarOverlay');
  const menuToggle = el('menuToggle');
  const menuIcon = el('menuIcon');

  const searchField = el('searchField');
  const searchInput = el('searchInput');
  const searchClear = el('searchClear');

  const tableBody = el('tableBody');
  const cardList = el('cardList');
  const emptyState = el('emptyState');
  const dataFooter = el('dataFooter');
  const recordCount = el('recordCount');
  const pagination = el('pagination');

  const btnNovo = el('btnNovo');
  const modalOverlay = el('modalOverlay');
  const modalTitle = el('modalTitle');
  const recordForm = el('recordForm');
  const fieldDescricao = el('fieldDescricao');
  const fieldPasta = el('fieldPasta');
  const fieldData = el('fieldData');
  const btnCancelModal = el('btnCancelModal');

  const confirmOverlay = el('confirmOverlay');
  const confirmDesc = el('confirmDesc');
  const btnCancelConfirm = el('btnCancelConfirm');
  const btnConfirmDelete = el('btnConfirmDelete');

  const toast = el('toast');
  const toastMessage = el('toastMessage');
  const toastUndo = el('toastUndo');

  function escapeHtml(str) {
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function formatDateBR(iso) {
    const [y, m, d] = iso.split('-');
    return `${d}/${m}/${y}`;
  }

  function normalize(str) {
    return str.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  }

  function getFilteredSorted() {
    let list = records.slice();
    if (searchQuery) {
      const q = normalize(searchQuery);
      list = list.filter((r) => normalize(r.descricao).includes(q) || normalize(r.pasta).includes(q));
    }
    list.sort((a, b) => (a.dataAtualizacao < b.dataAtualizacao ? 1 : a.dataAtualizacao > b.dataAtualizacao ? -1 : 0));
    return list;
  }

  function rowActionsHtml(id) {
    return `
      <div class="row-actions">
        <button class="action-icon-btn" type="button" data-action="edit" data-id="${id}" title="Editar" aria-label="Editar registro">
          <svg class="icon" viewBox="0 0 20 20">${ICON_EDIT}</svg>
          <span>Editar</span>
        </button>
        <button class="action-icon-btn is-danger" type="button" data-action="delete" data-id="${id}" title="Excluir" aria-label="Excluir registro">
          <svg class="icon" viewBox="0 0 20 20">${ICON_DELETE}</svg>
          <span>Excluir</span>
        </button>
      </div>`;
  }

  function renderEmptyState(kind) {
    if (kind === 'no-records') {
      emptyState.innerHTML = `
        <span class="empty-state__icon" aria-hidden="true"><svg class="icon" viewBox="0 0 20 20">${ICON_INBOX}</svg></span>
        <h2 class="empty-state__title">Nenhum registro de estudo ainda</h2>
        <p class="empty-state__desc">Crie o primeiro tema para começar a organizar seus estudos.</p>
        <button class="btn btn-primary" type="button" id="emptyStateNovo">
          <svg class="icon" viewBox="0 0 20 20"><path d="M10 4v12M4 10h12"/></svg>
          Novo
        </button>`;
      el('emptyStateNovo').addEventListener('click', () => openModal(null));
    } else {
      emptyState.innerHTML = `
        <span class="empty-state__icon" aria-hidden="true"><svg class="icon" viewBox="0 0 20 20">${ICON_SEARCH_OFF}</svg></span>
        <h2 class="empty-state__title">Nenhum resultado encontrado</h2>
        <p class="empty-state__desc">Não encontramos registros para “${escapeHtml(searchQuery)}”. Tente outro termo.</p>
        <button class="btn btn-secondary" type="button" id="emptyStateClear">Limpar pesquisa</button>`;
      el('emptyStateClear').addEventListener('click', clearSearch);
    }
  }

  function render() {
    const filtered = getFilteredSorted();
    const total = filtered.length;
    const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
    currentPage = Math.min(Math.max(1, currentPage), totalPages);

    if (records.length === 0) {
      el('tableWrap').style.display = 'none';
      cardList.style.display = 'none';
      dataFooter.style.display = 'none';
      emptyState.hidden = false;
      renderEmptyState('no-records');
      return;
    }
    if (total === 0) {
      el('tableWrap').style.display = 'none';
      cardList.style.display = 'none';
      dataFooter.style.display = 'none';
      emptyState.hidden = false;
      renderEmptyState('no-results');
      return;
    }

    emptyState.hidden = true;
    el('tableWrap').style.display = '';
    cardList.style.display = '';
    dataFooter.style.display = '';

    const start = (currentPage - 1) * PAGE_SIZE;
    const pageItems = filtered.slice(start, start + PAGE_SIZE);

    tableBody.innerHTML = pageItems.map((r) => `
      <tr>
        <td class="col-descricao"><span class="od-truncate">${escapeHtml(r.descricao)}</span></td>
        <td class="col-pasta"><span class="od-truncate">${escapeHtml(r.pasta)}</span></td>
        <td class="col-data"><span class="od-nowrap">${formatDateBR(r.dataInicial)}</span></td>
        <td class="col-data"><span class="od-nowrap">${formatDateBR(r.dataAtualizacao)}</span></td>
        <td>${rowActionsHtml(r.id)}</td>
      </tr>`).join('');

    cardList.innerHTML = pageItems.map((r) => `
      <li class="record-card">
        <p class="record-card__title od-clamp-2">${escapeHtml(r.descricao)}</p>
        <div class="record-card__meta">
          <div class="record-card__field record-card__field--full od-field">
            <span class="record-card__field-label">Pasta</span>
            <span class="record-card__field-value od-truncate">${escapeHtml(r.pasta)}</span>
          </div>
          <div class="record-card__field od-field">
            <span class="record-card__field-label">Data inicial</span>
            <span class="record-card__field-value od-nowrap">${formatDateBR(r.dataInicial)}</span>
          </div>
          <div class="record-card__field od-field">
            <span class="record-card__field-label">Atualização</span>
            <span class="record-card__field-value od-nowrap">${formatDateBR(r.dataAtualizacao)}</span>
          </div>
        </div>
        ${rowActionsHtml(r.id).replace('row-actions', 'row-actions record-card__actions')}
      </li>`).join('');

    if (searchQuery) {
      recordCount.textContent = `${total} resultado${total === 1 ? '' : 's'} para “${searchQuery}”`;
    } else {
      recordCount.textContent = `Mostrando ${start + 1}–${Math.min(start + PAGE_SIZE, total)} de ${total} registros`;
    }

    if (totalPages > 1) {
      pagination.innerHTML = `
        <button class="pagination__btn" id="pagePrev" type="button" aria-label="Página anterior" ${currentPage === 1 ? 'disabled' : ''}>
          <svg class="icon" viewBox="0 0 20 20"><path d="M12 5l-5 5 5 5"/></svg>
        </button>
        <span class="pagination__page">Página ${currentPage} de ${totalPages}</span>
        <button class="pagination__btn" id="pageNext" type="button" aria-label="Próxima página" ${currentPage === totalPages ? 'disabled' : ''}>
          <svg class="icon" viewBox="0 0 20 20"><path d="M8 5l5 5-5 5"/></svg>
        </button>`;
      el('pagePrev').addEventListener('click', () => { currentPage -= 1; render(); });
      el('pageNext').addEventListener('click', () => { currentPage += 1; render(); });
    } else {
      pagination.innerHTML = '';
    }

    bindRowActions();
  }

  function bindRowActions() {
    document.querySelectorAll('[data-action="edit"]').forEach((btn) => {
      btn.addEventListener('click', () => openModal(Number(btn.dataset.id)));
    });
    document.querySelectorAll('[data-action="delete"]').forEach((btn) => {
      btn.addEventListener('click', () => openConfirm(Number(btn.dataset.id)));
    });
  }

  // ---------- Search ----------
  function clearSearch() {
    searchQuery = '';
    searchInput.value = '';
    searchField.classList.remove('has-value');
    currentPage = 1;
    searchInput.focus();
    render();
  }

  searchInput.addEventListener('input', () => {
    searchQuery = searchInput.value.trim();
    searchField.classList.toggle('has-value', searchInput.value.length > 0);
    currentPage = 1;
    render();
  });
  searchClear.addEventListener('click', clearSearch);

  // ---------- Create / Edit modal ----------
  function clearFieldErrors() {
    ['fieldDescricaoWrap', 'fieldPastaWrap', 'fieldDataWrap'].forEach((id) => el(id).classList.remove('has-error'));
  }

  function openModal(id) {
    editingId = id;
    clearFieldErrors();
    lastFocusedEl = document.activeElement;
    if (id === null) {
      modalTitle.textContent = 'Novo registro';
      fieldDescricao.value = '';
      fieldPasta.value = '';
      fieldData.value = TODAY_ISO;
    } else {
      const r = records.find((rec) => rec.id === id);
      modalTitle.textContent = 'Editar registro';
      fieldDescricao.value = r.descricao;
      fieldPasta.value = r.pasta;
      fieldData.value = r.dataInicial;
    }
    modalOverlay.hidden = false;
    fieldDescricao.focus();
  }

  function closeModal() {
    modalOverlay.hidden = true;
    editingId = null;
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  btnNovo.addEventListener('click', () => openModal(null));
  btnCancelModal.addEventListener('click', closeModal);
  modalOverlay.addEventListener('click', (e) => { if (e.target === modalOverlay) closeModal(); });

  recordForm.addEventListener('submit', (e) => {
    e.preventDefault();
    clearFieldErrors();
    let valid = true;
    if (!fieldDescricao.value.trim()) { el('fieldDescricaoWrap').classList.add('has-error'); valid = false; }
    if (!fieldPasta.value.trim()) { el('fieldPastaWrap').classList.add('has-error'); valid = false; }
    if (!fieldData.value) { el('fieldDataWrap').classList.add('has-error'); valid = false; }
    if (!valid) return;

    if (editingId === null) {
      records.push({
        id: nextId++,
        descricao: fieldDescricao.value.trim(),
        pasta: fieldPasta.value.trim(),
        dataInicial: fieldData.value,
        dataAtualizacao: TODAY_ISO,
      });
      currentPage = 1;
      closeModal();
      showToast('Registro criado.');
    } else {
      const r = records.find((rec) => rec.id === editingId);
      r.descricao = fieldDescricao.value.trim();
      r.pasta = fieldPasta.value.trim();
      r.dataInicial = fieldData.value;
      r.dataAtualizacao = TODAY_ISO;
      currentPage = 1;
      closeModal();
      showToast('Registro atualizado.');
    }
    render();
  });

  // ---------- Delete + undo ----------
  function openConfirm(id) {
    pendingDeleteId = id;
    const r = records.find((rec) => rec.id === id);
    confirmDesc.textContent = `Excluir “${r.descricao}”? Essa ação não pode ser desfeita.`;
    lastFocusedEl = document.activeElement;
    confirmOverlay.hidden = false;
    btnConfirmDelete.focus();
  }

  function closeConfirm() {
    confirmOverlay.hidden = true;
    pendingDeleteId = null;
    if (lastFocusedEl) lastFocusedEl.focus();
  }

  btnCancelConfirm.addEventListener('click', closeConfirm);
  confirmOverlay.addEventListener('click', (e) => { if (e.target === confirmOverlay) closeConfirm(); });

  btnConfirmDelete.addEventListener('click', () => {
    const index = records.findIndex((r) => r.id === pendingDeleteId);
    const [removed] = records.splice(index, 1);
    undoState = { record: removed, index };
    closeConfirm();
    render();
    showToast('Registro excluído.', true);
  });

  function showToast(message, allowUndo) {
    clearTimeout(toastTimer);
    toastMessage.textContent = message;
    toastUndo.hidden = !allowUndo;
    toast.classList.add('is-visible');
    toastTimer = setTimeout(hideToast, 5000);
  }

  function hideToast() {
    toast.classList.remove('is-visible');
    undoState = null;
  }

  toastUndo.addEventListener('click', () => {
    if (!undoState) return;
    records.splice(undoState.index, 0, undoState.record);
    undoState = null;
    hideToast();
    render();
  });

  // ---------- Mobile drawer ----------
  function setDrawer(open) {
    appShell.classList.toggle('is-drawer-open', open);
    menuToggle.setAttribute('aria-expanded', String(open));
    menuIcon.innerHTML = open ? ICON_CLOSE : ICON_HAMBURGER;
    menuToggle.setAttribute('aria-label', open ? 'Fechar menu' : 'Abrir menu');
    document.body.style.overflow = open ? 'hidden' : '';
  }

  menuToggle.addEventListener('click', () => setDrawer(!appShell.classList.contains('is-drawer-open')));
  sidebarOverlay.addEventListener('click', () => setDrawer(false));
  sidebar.querySelectorAll('.nav-item').forEach((item) => {
    item.addEventListener('click', (e) => {
      e.preventDefault();
      setDrawer(false);
    });
  });
  window.addEventListener('resize', () => {
    if (window.innerWidth >= 768) setDrawer(false);
  });

  document.addEventListener('keydown', (e) => {
    if (e.key !== 'Escape') return;
    if (!modalOverlay.hidden) closeModal();
    else if (!confirmOverlay.hidden) closeConfirm();
    else if (appShell.classList.contains('is-drawer-open')) setDrawer(false);
  });

  render();
})();
