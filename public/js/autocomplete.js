// ─── Composant Autocomplete (Ville / Quartier) ───────────────────
// Utilisation : data-autocomplete="ville" ou data-autocomplete="quartier" sur un <input>

(function () {
  let suggestionsData = null;

  async function loadSuggestions() {
    if (suggestionsData) return suggestionsData;
    try {
      const res = await fetch('/data/benin_suggestions.json');
      suggestionsData = await res.json();
    } catch (e) {
      console.error('Impossible de charger les suggestions Bénin:', e);
      suggestionsData = { villes: [], quartiers: [] };
    }
    return suggestionsData;
  }

  function normalize(str) {
    return str
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, ''); // enlève les accents pour matcher plus large
  }

  function filterSuggestions(list, query, max = 8) {
    const q = normalize(query);
    if (!q) return [];
    return list
      .filter(item => normalize(item).includes(q))
      .sort((a, b) => {
        // priorité aux résultats qui commencent par la recherche
        const aStarts = normalize(a).startsWith(q) ? 0 : 1;
        const bStarts = normalize(b).startsWith(q) ? 0 : 1;
        return aStarts - bStarts || a.length - b.length;
      })
      .slice(0, max);
  }

  function highlightMatch(text, query) {
    const idx = normalize(text).indexOf(normalize(query));
    if (idx === -1) return text;
    return (
      text.slice(0, idx) +
      '<strong>' + text.slice(idx, idx + query.length) + '</strong>' +
      text.slice(idx + query.length)
    );
  }

  function initAutocomplete(input) {
    const type = input.dataset.autocomplete; // "ville" ou "quartier"
    const wrapper = document.createElement('div');
    wrapper.className = 'autocomplete-wrapper';
    input.parentNode.insertBefore(wrapper, input);
    wrapper.appendChild(input);

    const dropdown = document.createElement('div');
    dropdown.className = 'autocomplete-dropdown';
    wrapper.appendChild(dropdown);

    let activeIndex = -1;
    let currentItems = [];

    function closeDropdown() {
      dropdown.classList.remove('open');
      dropdown.innerHTML = '';
      activeIndex = -1;
      currentItems = [];
    }

    function renderDropdown(items, query) {
      currentItems = items;
      activeIndex = -1;
      if (items.length === 0) {
        closeDropdown();
        return;
      }
      dropdown.innerHTML = items
        .map((item, i) => `<div class="autocomplete-item" data-index="${i}">${highlightMatch(item, query)}</div>`)
        .join('');
      dropdown.classList.add('open');
    }

    function selectItem(value) {
      input.value = value;
      closeDropdown();
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }

    input.addEventListener('input', async () => {
      const data = await loadSuggestions();
      const list = type === 'ville' ? data.villes : data.quartiers;
      const items = filterSuggestions(list, input.value);
      renderDropdown(items, input.value);
    });

    input.addEventListener('keydown', (e) => {
      if (!dropdown.classList.contains('open')) return;
      const itemEls = dropdown.querySelectorAll('.autocomplete-item');

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        activeIndex = Math.min(activeIndex + 1, itemEls.length - 1);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        activeIndex = Math.max(activeIndex - 1, 0);
      } else if (e.key === 'Enter') {
        if (activeIndex >= 0) {
          e.preventDefault();
          selectItem(currentItems[activeIndex]);
        }
        return;
      } else if (e.key === 'Escape') {
        closeDropdown();
        return;
      } else {
        return;
      }

      itemEls.forEach((el, i) => el.classList.toggle('active', i === activeIndex));
      if (itemEls[activeIndex]) {
        itemEls[activeIndex].scrollIntoView({ block: 'nearest' });
      }
    });

    dropdown.addEventListener('click', (e) => {
      const itemEl = e.target.closest('.autocomplete-item');
      if (itemEl) {
        const index = parseInt(itemEl.dataset.index);
        selectItem(currentItems[index]);
      }
    });

    document.addEventListener('click', (e) => {
      if (!wrapper.contains(e.target)) closeDropdown();
    });
  }

  document.addEventListener('DOMContentLoaded', () => {
    document.querySelectorAll('[data-autocomplete]').forEach(initAutocomplete);
  });
})();
