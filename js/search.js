let plants = [];

fetch('data/plants.json')
  .then(r => r.json())
  .then(data => { plants = data.plants; });

const input = document.querySelector('.search-bar input');
const searchWrapper = document.querySelector('.search-wrapper');
const searchBar = document.querySelector('.search-bar');

const dropdown = document.createElement('div');
dropdown.className = 'search-dropdown';
searchBar.appendChild(dropdown);

function closeDropdown() {
  dropdown.innerHTML = '';
  dropdown.classList.remove('open');
}

function showResults(query) {
  const limit = query ? Infinity : 5

  const userMatches = (window.__userPlants || []).filter(up =>
    !query || up.nickname.toLowerCase().includes(query)
  ).slice(0, limit);

  const remainingSlots = limit - userMatches.length
  const plantMatches = plants.filter(p =>
    !query ||
    p.name.toLowerCase().includes(query) ||
    p.species.toLowerCase().includes(query)
  ).slice(0, remainingSlots);

  if (plantMatches.length === 0 && userMatches.length === 0) {
    dropdown.innerHTML = '<div class="search-empty">No plants found</div>';
    dropdown.classList.add('open');
    return;
  }

  const userHTML = userMatches.map(up => `
    <a href="myplant.html?id=${up.id}" class="search-result search-result--yours">
      <span class="search-result-icon">${up.icon}</span>
      <div class="search-result-text">
        <span class="search-result-name">${up.nickname}</span>
        <span class="search-result-species">${up.plantName}</span>
      </div>
      <span class="search-result-yours">yours</span>
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
}

input.addEventListener('focus', () => {
  showResults(input.value.trim().toLowerCase());
});

input.addEventListener('input', () => {
  showResults(input.value.trim().toLowerCase());
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
