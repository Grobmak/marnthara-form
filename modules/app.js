import DOM from './dom.js';
import State from './state.js';
import Calculations from './calculations.js';

const App = {
    init() {
        DOM.init();
        this.bindEvents();
        State.load();
    },

    bindEvents() {
        DOM.elements.addRoomHeaderBtn.addEventListener('click', () => State.addRoom());
        DOM.elements.lockBtn.addEventListener('click', () => State.toggleLock());
        DOM.elements.clearAllBtn.addEventListener('click', () => State.clearAll());
        DOM.elements.summaryToggleBtn.addEventListener('click', (e) => this.toggleSummary(e));

        document.addEventListener('click', e => {
            const deleteBtn = e.target.closest('.delete-btn');
            if (deleteBtn) {
                const targetEl = deleteBtn.closest('.room-card, .item-card, .deco-card');
                const deleteType = deleteBtn.dataset.deleteType;
                if (targetEl && deleteType) {
                    State.deleteElement(targetEl, deleteType);
                }
            }
        });

        document.addEventListener('click', e => {
            const suspendBtn = e.target.closest('[data-suspend-type]');
            if (suspendBtn) {
                const suspendType = suspendBtn.dataset.suspendType;
                State.toggleSuspend(suspendBtn, suspendType);
            }
        });

        document.addEventListener('click', e => {
            const addBtn = e.target.closest('.add-item-btn');
            if (addBtn) {
                const roomCard = DOM.findRoomCard(addBtn);
                const itemCard = DOM.findItemCard(addBtn);

                if (addBtn.classList.contains('room-btn')) {
                    State.addItem(roomCard);
                } else if (addBtn.classList.contains('deco-btn')) {
                    State.addDeco(itemCard);
                }
            }
        });

        document.addEventListener('input', e => {
            const target = e.target;
            if (target.matches('#orderForm input, #orderForm select, #orderForm textarea')) {
                State.syncStateFromDOM();
                Calculations.updateTotalSummary();
            }
        });
    },

    toggleSummary(e) {
        const popup = DOM.elements.summaryToggleBtn.nextElementSibling;
        const toggleBtn = e.target.closest('.summary-toggle-btn');
        if (popup && toggleBtn) {
            popup.style.display = (popup.style.display === 'block') ? 'none' : 'block';
            toggleBtn.textContent = (popup.style.display === 'block') ? '▲' : '▼';
        }
    }
};

export default App;