import state from './state.js';

const ui = {
    // Sekme değiştirme mantığı
    initTabEventListeners() {
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const tabId = link.getAttribute('data-tab');
                this.switchTab(tabId);
            });
        });
    },

    switchTab(tabId) {
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));
        document.querySelectorAll('.nav-link').forEach(link => link.classList.remove('active'));

        const targetTab = document.getElementById(tabId);
        const targetLink = document.querySelector(`[data-tab="${tabId}"]`);

        if (targetTab) targetTab.classList.add('active');
        if (targetLink) targetLink.classList.add('active');
    },

    // Hisse Kartlarını Oluşturma (YENİ MODERN GRID YAPISI)
    renderHisseler(hisseler) {
        const container = document.getElementById('hisse-listesi');
        if (!container) return;

        if (hisseler.length === 0) {
            container.innerHTML = `
                <div class="col-12 text-center p-5">
                    <div class="alert alert-info">Takip edilen hisse bulunamadı. Lütfen "Hisseler" sekmesinden ekleme yapın.</div>
                </div>`;
            return;
        }

        container.innerHTML = hisseler.map(h => {
            const signalClass = h.sinyal === 'AL' ? 'bg-success' : (h.sinyal === 'SAT' ? 'bg-danger' : 'bg-secondary');
            const rsiClass = h.rsi > 70 ? 'text-danger' : (h.rsi < 30 ? 'text-success' : '');

            return `
            <div class="col-md-6 col-lg-4 mb-4">
                <div class="card h-100 stock-card shadow-sm">
                    <div class="card-header d-flex justify-content-between align-items-center">
                        <h5 class="mb-0 fw-bold">${h.symbol}</h5>
                        <span class="badge ${signalClass}">${h.sinyal}</span>
                    </div>
                    <div class="card-body">
                        <div class="d-flex justify-content-between mb-2">
                            <span class="text-muted">Fiyat:</span>
                            <span class="fw-bold">${h.fiyat.toFixed(2)} TL</span>
                        </div>
                        <div class="row g-2 text-center mb-3">
                            <div class="col-4">
                                <div class="p-2 border rounded bg-light">
                                    <small class="d-block text-muted">RSI</small>
                                    <span class="fw-bold ${rsiClass}">${h.rsi.toFixed(1)}</span>
                                </div>
                            </div>
                            <div class="col-4">
                                <div class="p-2 border rounded bg-light">
                                    <small class="d-block text-muted">MACD</small>
                                    <span class="fw-bold text-primary">${h.macd?.toFixed(2) || '-'}</span>
                                </div>
                            </div>
                            <div class="col-4">
                                <div class="p-2 border rounded bg-light">
                                    <small class="d-block text-muted">Değişim</small>
                                    <span class="fw-bold">${h.degisim?.toFixed(2) || 0}%</span>
                                </div>
                            </div>
                        </div>
                        <div class="ai-box p-2 rounded bg-dark text-white shadow-inner">
                            <small class="d-block opacity-75"><i class="fas fa-robot"></i> AI Analizi:</small>
                            <p class="small mb-0" style="font-size: 0.85rem;">${h.aiAnaliz || 'Analiz hazırlanıyor...'}</p>
                        </div>
                    </div>
                </div>
            </div>`;
        }).join('');
    },

    showLoading(show) {
        const btn = document.getElementById('update-btn');
        if (btn) {
            btn.disabled = show;
            btn.innerHTML = show ? '<span class="spinner-border spinner-border-sm"></span> Güncelleniyor...' : 'Verileri Güncelle';
        }
    }
};

export default ui;
