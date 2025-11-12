const form = document.getElementById('letter-form');
const textarea = document.getElementById('letter');
const statusEl = document.getElementById('status');
const submitBtn = form?.querySelector('button');
const limitNote = document.getElementById('daily-limit-note');
const flightLayer = document.getElementById('letter-flight');

async function fetchDailyLimit() {
  if (!limitNote) return;
  try {
    const res = await fetch('/api/settings/public');
    if (!res.ok) throw new Error('Failed');
    const data = await res.json();
    const limit = data?.dailyLimit ?? 1;
    limitNote.textContent = `Each visitor may place ${limit} letter${limit > 1 ? 's' : ''} into the Tree Hole every day.`;
  } catch (err) {
    limitNote.textContent = 'The Tree Hole is checking today\'s limit. Please try again soon.';
  }
}

function showStatus(message, type = 'success') {
  if (!statusEl) return;
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;
}

function launchLetterAnimation() {
  if (!flightLayer) return;
  const token = document.createElement('div');
  token.className = 'letter-token';
  flightLayer.appendChild(token);
  setTimeout(() => token.remove(), 1900);
}

form?.addEventListener('submit', async (event) => {
  event.preventDefault();
  const content = textarea.value.trim();
  if (content.length < 10) {
    showStatus('Please share at least 10 characters.', 'error');
    return;
  }

  submitBtn.disabled = true;
  showStatus('Sending your words into the Tree Hole...', 'success');

  try {
    const res = await fetch('/api/letters', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ content })
    });
    const data = await res.json();
    if (!res.ok) {
      throw new Error(data?.error || 'Unable to send letter.');
    }
    textarea.value = '';
    showStatus(data.message || 'Your letter is safely stored.', 'success');
    launchLetterAnimation();
  } catch (error) {
    showStatus(error.message, 'error');
  } finally {
    submitBtn.disabled = false;
  }
});

fetchDailyLimit();
