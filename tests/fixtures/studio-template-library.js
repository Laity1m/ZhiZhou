const select = document.querySelector('#resume-template');
const preview = document.querySelector('#resume-preview');
const cards = [...document.querySelectorAll('[data-template-card]')];

function selectTemplate(template) {
  select.value = template;
  preview.className = `resume-preview template-${template} accent-indigo font-clean density-balanced`;
  cards.forEach((card) => card.classList.toggle('active', card.dataset.templateCard === template));
}

cards.forEach((card) => card.addEventListener('click', () => selectTemplate(card.dataset.templateCard)));
select.addEventListener('change', () => selectTemplate(select.value));
