const authForm = document.getElementById('auth-form');
const tokenField = document.getElementById('admin-token');
const authCard = document.getElementById('auth-card');
const settingsCard = document.getElementById('settings-card');
const lettersCard = document.getElementById('letters-card');
const limitForm = document.getElementById('limit-form');
const dailyLimitInput = document.getElementById('daily-limit');
const limitStatus = document.getElementById('limit-status');
const lettersList = document.getElementById('letters-list');
const refreshBtn = document.getElementById('refresh-letters');

let adminToken = localStorage.getItem('treehole-admin-token') || '';

function toggleDashboard(visible) {
  settingsCard.classList.toggle('hidden', !visible);
  lettersCard.classList.toggle('hidden', !visible);
}

function setAuthError(message) {
  limitStatus.textContent = '';
  lettersList.innerHTML = `<p class="status error">${message}</p>`;
}

function authFetch(url, options = {}) {
  const headers = Object.assign({}, options.headers, {
    'x-admin-token': adminToken
  });
  return fetch(url, { ...options, headers });
}

async function loadSettings() {
  const res = await authFetch('/api/admin/settings');
  if (!res.ok) throw new Error('Unable to load settings');
  const data = await res.json();
  dailyLimitInput.value = data.dailyLimit;
}

async function loadLetters() {
  const res = await authFetch('/api/admin/letters');
  if (res.status === 401) throw new Error('unauthorized');
  if (!res.ok) throw new Error('Unable to load letters');
  const data = await res.json();
  renderLetters(data.letters || []);
}

function renderLetters(letters) {
  lettersList.innerHTML = '';
  if (!letters.length) {
    lettersList.innerHTML = '<p class="hint">No letters yet today. Refresh after new submissions arrive.</p>';
    return;
  }

  letters.forEach((letter) => {
    const card = document.createElement('article');
    card.className = 'letter-card';

    const content = document.createElement('p');
    content.textContent = letter.content;

    const meta = document.createElement('div');
    meta.className = 'letter-meta';
    meta.innerHTML = `
      <span>ID #${letter.id}</span>
      <span>IP: ${letter.ip_address || 'n/a'}</span>
      <span>${formatDate(letter.created_at)}</span>
    `;

    const replyArea = document.createElement('div');
    replyArea.className = 'reply-area';

    const replyLabel = document.createElement('label');
    replyLabel.textContent = 'Reply';

    const replyBox = document.createElement('textarea');
    replyBox.value = letter.reply_text || '';

    const actions = document.createElement('div');
    actions.className = 'actions';

    const saveBtn = document.createElement('button');
    saveBtn.className = 'primary';
    saveBtn.textContent = 'Save Reply';

    const clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.className = 'ghost';
    clearBtn.textContent = 'Clear';

    const replyStatus = document.createElement('p');
    replyStatus.className = 'status';
    replyStatus.textContent = letter.reply_text ? `Last replied ${formatDate(letter.reply_created_at)}` : '';

    saveBtn.addEventListener('click', async () => {
      await submitReply(letter.id, replyBox.value.trim(), replyStatus, saveBtn);
    });

    clearBtn.addEventListener('click', async () => {
      replyBox.value = '';
      await submitReply(letter.id, '', replyStatus, clearBtn);
    });

    actions.append(saveBtn, clearBtn);
    replyArea.append(replyLabel, replyBox, actions, replyStatus);
    card.append(content, meta, replyArea);
    lettersList.append(card);
  });
}

async function submitReply(id, replyText, statusNode, triggerBtn) {
  triggerBtn.disabled = true;
  statusNode.textContent = 'Saving...';
  statusNode.className = 'status';
  try {
    const res = await authFetch(`/api/admin/letters/${id}/reply`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ replyText })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Unable to save');
    statusNode.textContent = replyText ? 'Reply saved just now.' : 'Reply cleared.';
    statusNode.className = 'status success';
  } catch (err) {
    statusNode.textContent = err.message;
    statusNode.className = 'status error';
  } finally {
    triggerBtn.disabled = false;
    await loadLetters();
  }
}

limitForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const value = Number(dailyLimitInput.value);
  if (!value || value < 1) {
    limitStatus.textContent = 'Limit must be at least 1.';
    limitStatus.className = 'status error';
    return;
  }

  try {
    const res = await authFetch('/api/admin/settings/daily-limit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dailyLimit: value })
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || 'Unable to update limit');
    limitStatus.textContent = `Daily limit updated to ${data.dailyLimit}.`;
    limitStatus.className = 'status success';
  } catch (err) {
    limitStatus.textContent = err.message;
    limitStatus.className = 'status error';
  }
});

refreshBtn?.addEventListener('click', () => {
  loadLetters().catch(() => setAuthError('Unable to refresh letters.'));
});

authForm?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const token = tokenField.value.trim();
  if (!token) return;
  adminToken = token;
  localStorage.setItem('treehole-admin-token', token);
  await initializeDashboard();
});

function formatDate(value) {
  if (!value) return 'No reply yet';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

async function initializeDashboard() {
  if (!adminToken) {
    toggleDashboard(false);
    authCard.classList.remove('hidden');
    return;
  }

  try {
    await Promise.all([loadSettings(), loadLetters()]);
    toggleDashboard(true);
    authCard.classList.add('hidden');
  } catch (err) {
    if (err.message === 'unauthorized') {
      toggleDashboard(false);
      authCard.classList.remove('hidden');
      localStorage.removeItem('treehole-admin-token');
      lettersList.innerHTML = '<p class="status error">Token rejected. Please try again.</p>';
    } else {
      setAuthError(err.message || 'Unable to load data.');
    }
  }
}

initializeDashboard();
