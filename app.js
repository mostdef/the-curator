const grid = document.getElementById('grid');
const backdrop = document.getElementById('modal-backdrop');
const modalImage = document.getElementById('modal-image');
const modalName = document.getElementById('modal-name');
const modalTrade = document.getElementById('modal-trade');
const modalBio = document.getElementById('modal-bio');
const modalWorks = document.getElementById('modal-works');
const galleryStrip = document.getElementById('gallery-strip');
const galleryTrack = document.getElementById('gallery-track');
const galleryPrev = document.getElementById('gallery-prev');
const galleryNext = document.getElementById('gallery-next');

function openModal(person) {
  modalImage.src = person.image;
  modalImage.alt = person.name;
  modalName.textContent = person.name;
  modalTrade.textContent = person.trade;
  modalBio.textContent = person.bio || '';

  const works = person.works || [];

  // Mobile: grid inside modal
  modalWorks.innerHTML = '';
  works.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    modalWorks.appendChild(img);
  });

  // Desktop: gallery strip at bottom
  galleryTrack.innerHTML = '';
  works.forEach(src => {
    const img = document.createElement('img');
    img.src = src;
    img.alt = '';
    galleryTrack.appendChild(img);
  });
  galleryTrack.scrollLeft = 0;

  backdrop.classList.add('open');
  galleryStrip.classList.add('open');
  document.body.style.overflow = 'hidden';
}

function closeModal() {
  backdrop.classList.remove('open');
  galleryStrip.classList.remove('open');
  document.body.style.overflow = '';
}

backdrop.addEventListener('click', (e) => {
  if (e.target === backdrop) closeModal();
});

document.getElementById('modal-close').addEventListener('click', closeModal);

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') closeModal();
  if (e.key === 'ArrowRight') scrollGallery(1);
  if (e.key === 'ArrowLeft') scrollGallery(-1);
});

function scrollGallery(direction) {
  galleryTrack.scrollBy({ left: direction * 520, behavior: 'smooth' });
}

galleryPrev.addEventListener('click', () => scrollGallery(-1));
galleryNext.addEventListener('click', () => scrollGallery(1));

function render(list) {
  grid.innerHTML = '';
  list.forEach(person => {
    const card = document.createElement('div');
    card.className = 'card';
    card.addEventListener('click', () => openModal(person));

    const img = document.createElement('img');
    img.className = 'card-image';
    img.src = person.image;
    img.alt = person.name;

    const info = document.createElement('div');
    info.className = 'card-info';

    const name = document.createElement('span');
    name.className = 'card-name';
    name.textContent = person.name;

    const trade = document.createElement('span');
    trade.className = 'card-trade';
    trade.textContent = person.trade;

    info.appendChild(name);
    info.appendChild(trade);
    card.appendChild(img);
    card.appendChild(info);
    grid.appendChild(card);
  });
}

render(people);
