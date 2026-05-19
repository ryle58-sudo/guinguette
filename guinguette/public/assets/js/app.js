let db = {};
let currentImgIndex = 0;

// 1. Charger les données
fetch('assets/data/db.json')
    .then(response => response.json())
    .then(data => {
        db = data;
        renderSite();
    });

function renderSite() {
    // Config de base
    document.getElementById('nav-logo').innerText = db.config.nom;
    document.getElementById('hero-img').src = db.config.banniere;
    document.getElementById('main-footer').innerHTML = db.config.footer;

    // Rendu Menu
    const menuSec = document.getElementById('menu');
    menuSec.innerHTML = `
        <h2 class="text-3xl md:text-5xl italic text-emerald-900 text-center font-serif">${db.sections.menu}</h2>
        <div class="w-16 h-1 bg-emerald-700 mx-auto mt-4 mb-10"></div>
        <div id="tab-container" class="flex flex-wrap justify-center gap-2 mb-8"></div>
        <div id="menu-display" class="bg-white p-8 shadow-xl rounded-2xl border text-center min-h-[200px]"></div>
    `;
    initMenuTabs();

    // Rendu Évènements
    const evSec = document.getElementById('evenements');
    evSec.innerHTML = `<h2 class="text-3xl md:text-5xl font-serif italic text-amber-500 mb-10">${db.sections.evenements}</h2>
        <div class="grid md:grid-cols-2 gap-6 max-w-6xl mx-auto">
            ${db.evenements.map(e => `<div class="border border-stone-700 p-6 rounded-xl"><span class="text-amber-600 font-bold text-xs uppercase">${e.badge}</span><h3 class="text-xl mt-1 mb-2 font-serif">${e.titre}</h3><p class="text-stone-400 text-sm">${e.desc}</p></div>`).join('')}
        </div>`;

    // Rendu Services
    const servSec = document.getElementById('services');
    servSec.innerHTML = `<h2 class="text-3xl md:text-4xl text-emerald-900 font-serif italic mb-10">${db.sections.services}</h2>
        <div class="grid grid-cols-2 md:grid-cols-5 gap-8 max-w-6xl mx-auto">
            ${db.services.map(s => `<div><div class="text-4xl mb-2">${s.icone}</div><p class="font-bold text-[10px] uppercase">${s.label}</p></div>`).join('')}
        </div>`;

    // Rendu Activités
    const actSec = document.getElementById('activites');
    actSec.innerHTML = `<h2 class="text-3xl md:text-4xl text-emerald-900 font-serif italic mb-12">${db.sections.activites}</h2>
        <div class="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
            ${db.activites.map(a => `<div class="bg-white p-6 rounded-2xl shadow-sm"><div class="text-4xl mb-3">${a.icone}</div><h3 class="font-bold">${a.titre}</h3></div>`).join('')}
        </div>`;

    // Rendu Galerie
    const galSec = document.getElementById('galerie');
    galSec.innerHTML = `<h2 class="text-3xl md:text-4xl font-serif italic text-emerald-900 mb-10">${db.sections.galerie}</h2>
        <div id="gallery-grid" class="grid grid-cols-2 md:grid-cols-4 gap-3 max-w-6xl mx-auto"></div>`;
    
    const grid = document.getElementById('gallery-grid');
    db.galerie.forEach((src, idx) => {
        const img = document.createElement('img');
        img.src = src;
        img.className = "w-full h-40 md:h-64 object-cover rounded-xl cursor-pointer hover:opacity-80 transition";
        img.onclick = () => openLightbox(idx);
        grid.appendChild(img);
    });

    // Rendu Infos
    const infoSec = document.getElementById('infos-pratiques');
    infoSec.innerHTML = `
        <div class="max-w-6xl mx-auto grid md:grid-cols-2 gap-12 items-start">
            <div class="space-y-6">
                <h2 class="text-3xl text-emerald-900 font-serif italic">${db.sections.infos}</h2>
                <div><h4 class="font-bold text-amber-600 text-xs uppercase mb-1">Horaires</h4><p>${db.infos.horaires}</p></div>
                <div><h4 class="font-bold text-amber-600 text-xs uppercase mb-1">Contact</h4><p>${db.infos.contact}</p></div>
                <div><h4 class="font-bold text-amber-600 text-xs uppercase mb-1">Note</h4><p class="italic">"${db.infos.note}"</p></div>
            </div>
            <div class="bg-white p-4 rounded-3xl shadow-xl">
                <iframe src="${db.infos.mapUrl}" class="w-full h-64 rounded-2xl" style="border:0;" allowfullscreen="" loading="lazy"></iframe>
                <div class="mt-4 text-center">
                    <p class="text-[10px] text-stone-500 mb-4 uppercase">${db.infos.adresse}</p>
                    <a href="${db.infos.itineraire}" target="_blank" class="inline-block bg-emerald-800 text-white px-6 py-2 rounded-xl font-bold uppercase text-[10px]">Créer un itinéraire</a>
                </div>
            </div>
        </div>`;
}

// Logique Menu Tabs
function initMenuTabs() {
    const container = document.getElementById('tab-container');
    Object.keys(db.menus).forEach((jour, idx) => {
        const btn = document.createElement('button');
        btn.innerText = jour;
        btn.className = `px-4 py-2 text-xs font-bold border-b-2 transition ${idx === 0 ? 'border-emerald-700 text-emerald-700' : 'border-transparent'}`;
        btn.onclick = (e) => {
            document.querySelectorAll('#tab-container button').forEach(b => b.classList.replace('border-emerald-700', 'border-transparent'));
            e.target.classList.replace('border-transparent', 'border-emerald-700');
            showMenu(jour);
        };
        container.appendChild(btn);
        if(idx === 0) showMenu(jour);
    });
}

function showMenu(jour) {
    const m = db.menus[jour];
    const prixDisplay = m.prix ? ` - ${m.prix}` : '';
    document.getElementById('menu-display').innerHTML = `
        <p class="text-amber-600 font-bold text-[10px] mb-4 uppercase tracking-widest italic">Menu du ${jour}${prixDisplay}</p>
        <div class="space-y-4">
            <div><p class="text-xs text-stone-400 uppercase">Entrée</p><p class="text-lg font-serif italic">${m.entree}</p></div>
            <div class="w-8 h-[1px] bg-stone-100 mx-auto"></div>
            <div><p class="text-xs text-stone-400 uppercase">Plat</p><p class="text-lg font-serif italic">${m.plat}</p></div>
        </div>`;
}

// Logique Lightbox
function openLightbox(idx) {
    currentImgIndex = idx;
    document.getElementById('lightbox-img').src = db.galerie[idx];
    document.getElementById('lightbox').classList.replace('hidden', 'flex');
}
function closeLightbox() { document.getElementById('lightbox').classList.replace('flex', 'hidden'); }
function nextImg() { currentImgIndex = (currentImgIndex + 1) % db.galerie.length; openLightbox(currentImgIndex); }
function prevImg() { currentImgIndex = (currentImgIndex - 1 + db.galerie.length) % db.galerie.length; openLightbox(currentImgIndex); }