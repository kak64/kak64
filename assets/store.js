// Store page: cart drawer + add/remove items.
// Language strings come from window.STORE_I18N (set inline per page); defaults to English.
(function () {
    const I18N = Object.assign({
        empty: 'Your cart is currently empty. Go grab some loot!',
        added: (name) => `Added ${name} to cart!`,
        emptyIcon: 'shopping_cart_off'
    }, window.STORE_I18N || {});

    let cart = [];

    window.toggleCart = function toggleCart() {
        document.getElementById('cart-drawer').classList.toggle('open');
        document.getElementById('cart-overlay').classList.toggle('hidden');
    };

    window.addToCart = function addToCart(name, price) {
        cart.push({ name, price, id: Date.now() });
        updateCartUI();

        const toast = document.createElement('div');
        toast.className = 'fixed bottom-8 left-1/2 -translate-x-1/2 bg-primary text-on-primary px-lg py-sm rounded-full font-bold shadow-xl z-[100] animate-bounce';
        toast.innerText = I18N.added(name);
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 2000);

        if (!document.getElementById('cart-drawer').classList.contains('open')) {
            window.toggleCart();
        }
    };

    window.removeFromCart = function removeFromCart(id) {
        cart = cart.filter((item) => item.id !== id);
        updateCartUI();
    };

    function updateCartUI() {
        const container = document.getElementById('cart-items');
        const totalEl = document.getElementById('cart-total');
        const countEl = document.getElementById('cart-count');

        countEl.innerText = cart.length;

        if (cart.length === 0) {
            container.innerHTML = `
                <div class="flex flex-col items-center justify-center h-full text-center space-y-md py-xl" id="empty-cart">
                    <span class="material-symbols-outlined text-6xl text-outline-variant">${I18N.emptyIcon}</span>
                    <p class="text-on-surface-variant">${I18N.empty}</p>
                </div>`;
            totalEl.innerText = '$0.00';
            return;
        }

        container.innerHTML = cart.map((item) => `
            <div class="flex justify-between items-center p-sm bg-surface-container rounded border border-outline-variant/30 group">
                <div class="flex flex-col">
                    <span class="font-bold text-on-surface">${item.name}</span>
                    <span class="text-primary font-label-caps">$${item.price.toFixed(2)}</span>
                </div>
                <button onclick="removeFromCart(${item.id})" class="text-on-surface-variant hover:text-error transition-colors p-1">
                    <span class="material-symbols-outlined text-sm">delete</span>
                </button>
            </div>`).join('');

        const total = cart.reduce((sum, item) => sum + item.price, 0);
        totalEl.innerText = `$${total.toFixed(2)}`;
    }
})();
