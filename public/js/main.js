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
    // Validation standard des champs required
    if (!validateStep(current)) return;

    const esTerrain = steps[0].querySelector("#typeBien").value == "Terrain" ? true : false;

    // Validation spéciale étape 3 : au moins une pièce
    if (current === 3 && !esTerrain) {
      const nbPieces = parseInt(document.getElementById('nbPieces')?.value) || 0;
      if (nbPieces < 1) {
        // Afficher une erreur visuelle sous le champ nbPieces
        const el = document.getElementById('nbPieces');
        el.style.borderColor = '#dc3545';
        let msg = document.getElementById('nbPiecesError');
        if (!msg) {
          msg = document.createElement('p');
          msg.id = 'nbPiecesError';
          msg.style.cssText = 'color:#dc3545; font-size:0.82rem; margin-top:0.4rem;';
          el.parentNode.appendChild(msg);
        }
        msg.textContent = 'Au moins une pièce (chambre, salon, douche ou cuisine) est requise.';
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
        return;
      } else {
        // Reset style si valide
        const el = document.getElementById('nbPieces');
        el.style.borderColor = '';
        const msg = document.getElementById('nbPiecesError');
        if (msg) msg.remove();
      }
    }

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

// ─── Calcul automatique nbPieces ─────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const fields = ['nbChambres', 'nbSalons', 'nbDouches', 'nbCuisines'];
  const nbPiecesInput = document.getElementById('nbPieces');
  if (!nbPiecesInput) return;

  function calcPieces() {
    const total = fields.reduce((sum, id) => {
      const el = document.getElementById(id);
      return sum + (el ? parseInt(el.value) || 0 : 0);
    }, 0);
    nbPiecesInput.value = total > 0 ? total : '';

    // Reset l'erreur visuelle au fur et à mesure que l'utilisateur remplit
    if (total > 0) {
      nbPiecesInput.style.borderColor = '';
      const msg = document.getElementById('nbPiecesError');
      if (msg) msg.remove();
    }
  }

  fields.forEach(id => {
    const el = document.getElementById(id);
    if (el) el.addEventListener('input', calcPieces);
  });

  // Calcul initial au chargement (utile pour edit.ejs)
  calcPieces();
});

// ─── Validation nbPieces sur edit.ejs ────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
  const editForm = document.querySelector('form[action*="/edit"]');
  if (!editForm) return;

  editForm.addEventListener('submit', (e) => {
    const nbPieces = parseInt(document.getElementById('nbPieces')?.value) || 0;
    if (nbPieces < 1) {
      e.preventDefault();
      const el = document.getElementById('nbPieces');
      el.style.borderColor = '#dc3545';
      let msg = document.getElementById('nbPiecesError');
      if (!msg) {
        msg = document.createElement('p');
        msg.id = 'nbPiecesError';
        msg.style.cssText = 'color:#dc3545; font-size:0.82rem; margin-top:0.4rem;';
        el.parentNode.appendChild(msg);
      }
      msg.textContent = 'Au moins une pièce (chambre, salon, douche ou cuisine) est requise.';
      el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  });
});