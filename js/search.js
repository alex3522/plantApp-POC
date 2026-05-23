let plants = [];

fetch('data/plants.json')
  .then(r => r.json())
  .then(data => { plants = data.plants; });

const input = document.querySelector('.search-bar input');
const searchWrapper = document.querySelector('.search-wrapper');

const dropdown = document.createElement('div');
dropdown.className = 'search-dropdown';
searchWrapper.appendChild(dropdown);

function closeDropdown() {
  dropdown.innerHTML = '';
  dropdown.classList.remove('open');
}

input.addEventListener('input', () => {
  const query = input.value.trim().toLowerCase();

  if (!query) { closeDropdown(); return; }

  const plantMatches = plants.filter(p =>
    p.name.toLowerCase().includes(query) ||
    p.species.toLowerCase().includes(query)
  );

  const userMatches = (window.__userPlants || []).filter(up =>
    up.nickname.toLowerCase().includes(query)
  );

  if (plantMatches.length === 0 && userMatches.length === 0) {
    dropdown.innerHTML = '<div class="search-empty">No plants found</div>';
    dropdown.classList.add('open');
    return;
  }

  const userHTML = userMatches.map(up => `
    <a href="myplant.html?id=${up.id}" class="search-result">
      <span class="search-result-icon">${up.icon}</span>
      <div class="search-result-text">
        <span class="search-result-name">${up.nickname}</span>
        <span class="search-result-species">${up.plantName} · yours</span>
      </div>
    </a>
  `).join('');

  const plantHTML = plantMatches.map(p => `
    <a href="plant.html?id=${p.id}" class="search-result">
      <span class="search-result-icon">${p.icon}</span>
      <div class="search-result-text">
        <span class="search-result-name">${p.name}</span>
        <span class="search-result-species">${p.species}</span>
      </div>
    </a>
  `).join('');

  dropdown.innerHTML = userHTML + plantHTML;
  dropdown.classList.add('open');
});

input.addEventListener('keydown', e => {
  if (e.key === 'Escape') { closeDropdown(); input.blur(); }
  if (e.key === 'Enter') {
    const first = dropdown.querySelector('.search-result');
    if (first) first.click();
  }
});

document.addEventListener('click', e => {
  if (!searchWrapper.contains(e.target)) closeDropdown();
});
