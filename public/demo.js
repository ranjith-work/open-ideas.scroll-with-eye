import { EyeScroll } from '/plugin/eye-scroll.js';

const row = document.querySelector('[data-eye-section="Card row"]');
const tones = ['#e2f08a', '#ffb087', '#f3efe4', '#9fd7c8', '#e7c56a', '#d7b4f3', '#f0a3a3', '#c9d6a3'];
const titles = [
  'North gallery',
  'River room',
  'Night market',
  'Reading hall',
  'Courtyard',
  'Map desk',
  'Quiet wing',
  'Roof garden',
];

titles.forEach((title, index) => {
  const card = document.createElement('article');
  card.className = 'card';
  card.style.background = tones[index % tones.length];
  card.innerHTML = `<em>0${index + 1}</em><strong>${title}</strong>`;
  row.append(card);
});

const board = document.querySelector('.board-canvas');
const cols = 12;
const rows = 7;
for (let r = 0; r < rows; r += 1) {
  for (let c = 0; c < cols; c += 1) {
    const cell = document.createElement('div');
    cell.className = 'cell';
    const label = `${String.fromCharCode(65 + c)}${r + 1}`;
    cell.textContent = label;
    if (label === 'A1' || label === 'L7' || label === 'F4') cell.classList.add('mark');
    board.append(cell);
  }
}

EyeScroll.start({ sectionSelector: '[data-eye-section]' });
