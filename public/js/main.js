// ─── Preview photos avant upload ─────────────────────────────────
function previewPhotos(input) {
  const preview = document.getElementById('photosPreview');
  if (!preview) return;

  Array.from(input.files).forEach(file => {
    const reader = new FileReader();
    reader.onload = (e) => {
      const div = document.createElement('div');
      div.className = 'photo-preview-item';
      div.innerHTML = `<img src="${e.target.result}" alt="Aperçu">`;
      preview.appendChild(div);
    };
    reader.readAsDataURL(file);
  });
}

// ─── Fermeture automatique des alertes ───────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const alerts = document.querySelectorAll('.alert');
  alerts.forEach(alert => {
    setTimeout(() => {
      alert.style.transition = 'opacity 0.5s';
      alert.style.opacity = '0';
      setTimeout(() => alert.remove(), 500);
    }, 4000);
  });

  // Scroll automatique chat
  const chatBox = document.getElementById('chatBox');
  if (chatBox) chatBox.scrollTop = chatBox.scrollHeight;
});

// ─── Menu burger mobile ───────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const burgerBtn = document.getElementById('burgerBtn');
  const navbarLinks = document.getElementById('navbarLinks');
  if (burgerBtn && navbarLinks) {
    burgerBtn.addEventListener('click', () => {
      navbarLinks.classList.toggle('open');
      burgerBtn.classList.toggle('open');
    });
  }
});

// ─── Wizard formulaire création annonce ──────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('annonceForm');
  if (!form) return;

  const steps = Array.from(document.querySelectorAll('.form-step'));
  const stepperItems = Array.from(document.querySelectorAll('.stepper-item'));
  const btnPrev = document.getElementById('btnPrev');
  const btnNext = document.getElementById('btnNext');
  const btnSubmit = document.getElementById('btnSubmit');
  let current = 1;
  const total = steps.length;

  function showStep(n) {
    steps.forEach(s => s.classList.toggle('active', parseInt(s.dataset.step) === n));
    stepperItems.forEach(s => {
      const num = parseInt(s.dataset.step);
      s.classList.toggle('active', num === n);
      s.classList.toggle('done', num < n);
    });
    btnPrev.style.display = n === 1 ? 'none' : 'inline-flex';
    btnNext.style.display = n === total ? 'none' : 'inline-flex';
    btnSubmit.style.display = n === total ? 'inline-flex' : 'none';
    current = n;
    window.scrollTo({ top: form.offsetTop - 100, behavior: 'smooth' });
  }

  function validateStep(n) {
    const stepEl = steps[n - 1];
    const inputs = stepEl.querySelectorAll('input[required], select[required], textarea[required]');
    for (const input of inputs) {
      if (!input.value.trim()) {
        input.focus();
        input.reportValidity();
        return false;
      }
    }
    return true;
  }

  btnNext.addEventListener('click', () => {
    if (!validateStep(current)) return;
    if (current < total) showStep(current + 1);
  });

  btnPrev.addEventListener('click', () => {
    if (current > 1) showStep(current - 1);
  });

  // Permet de cliquer directement sur une étape déjà validée
  stepperItems.forEach(item => {
    item.addEventListener('click', () => {
      const target = parseInt(item.dataset.step);
      if (target < current) showStep(target);
    });
  });
});