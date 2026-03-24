document.addEventListener('DOMContentLoaded', () => {
    // --- Firebase Init ---
    const firebaseConfig = {
      apiKey: "AIzaSyA5nK3OTekNKeonjNWIVeOk9jUxK2YLhc8",
      authDomain: "kassa-aparat-76ed5.firebaseapp.com",
      projectId: "kassa-aparat-76ed5",
      storageBucket: "kassa-aparat-76ed5.firebasestorage.app",
      messagingSenderId: "497385672835",
      appId: "1:497385672835:web:809dbae5374cf516e38bb6",
      measurementId: "G-JRETPDXJCE",
      databaseURL: "https://kassa-aparat-76ed5-default-rtdb.firebaseio.com/"
    };
    
    firebase.initializeApp(firebaseConfig);
    const db = firebase.database();

    // --- State ---
    let orderItems = []; 
    
    const getStorage = (key, def) => {
        const val = localStorage.getItem(key);
        return val ? JSON.parse(val) : def;
    };
    
    const setStorage = (key, val) => {
        localStorage.setItem(key, JSON.stringify(val));
        if (db) {
            db.ref(key).set(val); // Sync to firebase
        }
    };

    let productsList = getStorage('pos_prod', [
        { id: '1', name: "Jo'ja (1 kg / portsiya)", price: null, icon: "🍗" },
        { id: '2', name: "Fastfood", price: 30000, icon: "🍔" },
        { id: '3', name: "Ichimlik", price: 10000, icon: "🥤" },
        { id: '4', name: "Mayda-chuyda", price: 5000, icon: "🍟" }
    ]);
    let usersList = getStorage('pos_usr', [
        { id: 'u1', name: "Admin", role: "admin", pin: "05284" },
        { id: 'u2', name: "Kassir", role: "cashier", pin: "1234" }
    ]);
    
    const defaultAdm = usersList.find(u => u.role === "admin" && u.pin === "1111");
    if(defaultAdm) {
        defaultAdm.pin = "05284";
        setStorage('pos_usr', usersList);
    }
    let expensesList = getStorage('pos_exp', []);
    let printerConfig = getStorage('pos_print', { ip: '192.168.1.100', port: '9100', paper: '80mm' });
    let currentUser = null;
    let pastOrders = getStorage('pos_ord', []);

    // --- Auth Logic ---
    const authOverlay = document.getElementById('auth-overlay');
    const pinDots = document.querySelectorAll('.pin-dot');
    const pinBtns = document.querySelectorAll('.pin-btn[data-val]');
    const pinDel = document.getElementById('pin-del');
    const pinSubmit = document.getElementById('pin-submit');
    let currentPin = '';

    const updatePinDisplay = () => {
        pinDots.forEach((dot, i) => {
            if(i < currentPin.length) dot.classList.add('filled');
            else dot.classList.remove('filled', 'error');
        });
    };

    pinBtns.forEach(btn => {
        btn.addEventListener('click', () => {
            if(currentPin.length < 5) currentPin += btn.getAttribute('data-val');
            updatePinDisplay();
        });
    });

    pinDel.addEventListener('click', () => {
        currentPin = currentPin.slice(0, -1);
        updatePinDisplay();
    });

    pinSubmit.addEventListener('click', () => {
        if(currentPin.length < 4) return;
        const user = usersList.find(u => u.pin === currentPin);
        if(user) {
            currentUser = user;
            authOverlay.classList.remove('show');
            currentPin = ''; updatePinDisplay();
            notify(`Xush kelibsiz, ${user.name}`);
        } else {
            pinDots.forEach(d => d.classList.add('error'));
            document.querySelector('.pin-display').classList.add('shake');
            setTimeout(() => {
                document.querySelector('.pin-display').classList.remove('shake');
                currentPin = ''; updatePinDisplay();
            }, 400);
        }
    });

    document.getElementById('set-logout').addEventListener('click', () => {
        currentUser = null;
        authOverlay.classList.add('show');
        document.querySelector('.nav-item[data-target="tab-home"]').click(); 
    });

    // --- Formatters ---
    const formatMoney = (sum) => (sum != null ? sum : 0).toLocaleString('uz-UZ') + ' UZS';

    // --- DOM Elements ---
    const orderContainer = document.getElementById('inline-orders-container');
    const totalAmount = document.getElementById('inline-total');
    const inlineActions = document.getElementById('inline-actions');
    const toast = document.getElementById('toast');
    const toastText = document.getElementById('toast-text');

    const historyModal = {
        sheet: document.getElementById('history-modal'),
        backdrop: document.getElementById('components-backdrop'),
        container: document.getElementById('history-detail-content')
    };

    // --- Logic ---
    const playTap = () => {}; 

    // Variable Price Prompt Logic
    const closePricePrompt = () => {
        const backdrop = document.getElementById('price-prompt-backdrop');
        const modal = document.getElementById('price-prompt-modal');
        backdrop.classList.remove('show');
        modal.style.opacity = '0';
        modal.style.transform = 'translate(-50%, -50%) scale(0.9)';
        setTimeout(() => modal.style.visibility = 'hidden', 300);
        window.currentOpenPriceProduct = null;
    };

    document.getElementById('btn-price-cancel')?.addEventListener('click', closePricePrompt);
    document.getElementById('price-prompt-backdrop')?.addEventListener('click', closePricePrompt);

    document.getElementById('btn-price-submit')?.addEventListener('click', () => {
        const input = document.getElementById('price-prompt-input');
        const val = parseInt(input.value);
        if(!isNaN(val) && val > 0 && window.currentOpenPriceProduct) {
            const p = window.currentOpenPriceProduct;
            const existing = orderItems.find(i => i.id === p.id && i.price === val);
            if(existing) existing.qty++;
            else orderItems.unshift({ id: p.id, name: p.name, price: val, qty: 1, openPrice: true });
            updateUI();
            closePricePrompt();
        } else {
            notify("To'g'ri summa kiriting", "warning");
        }
    });

    const notify = (msg, icon = 'checkmark-circle') => {
        document.getElementById('toast-icon').setAttribute('name', icon);
        toastText.textContent = msg;
        toast.classList.remove('show');
        void toast.offsetWidth;
        toast.classList.add('show');
        setTimeout(() => toast.classList.remove('show'), 3000);
    };

    const updateUI = () => {
        orderContainer.innerHTML = '';
        let total = 0;
        let count = 0;

        if(orderItems.length === 0) {
            orderContainer.innerHTML = "<div class='empty-state'>Hozircha bo'sh...</div>";
            inlineActions.classList.add('hidden');
            totalAmount.classList.remove('show');
            totalAmount.textContent = '0 UZS';
            return;
        }

        inlineActions.classList.remove('hidden');
        totalAmount.classList.add('show');

        orderItems.forEach((item, index) => {
            total += item.price * item.qty;
            count += item.qty;

            const el = document.createElement('div');
            el.className = 'inline-order-item';
            
            el.innerHTML = `
                <div class="inline-item-info">
                    <div class="inline-item-name">${item.name}</div>
                    <div class="inline-item-price">${formatMoney(item.price * item.qty)} (${item.qty}x ${item.price})</div>
                </div>
                <div class="inline-item-qty">
                    <button class="qty-btn dec"><ion-icon name="remove"></ion-icon></button>
                    <span class="qty-val">${item.qty}</span>
                    <button class="qty-btn inc"><ion-icon name="add"></ion-icon></button>
                </div>
            `;

            el.querySelector('.dec').addEventListener('click', () => {
                playTap();
                item.qty--;
                if(item.qty <= 0) {
                    orderItems = orderItems.filter(i => !(i.id === item.id && i.price === item.price));
                }
                updateUI();
            });
            el.querySelector('.inc').addEventListener('click', () => {
                playTap();
                item.qty++;
                updateUI();
            });

            orderContainer.appendChild(el);
        });

        totalAmount.style.transform = 'scale(1.15)';
        setTimeout(() => {
            totalAmount.textContent = formatMoney(total);
            totalAmount.style.transform = '';
        }, 150);
    };

    // --- Dynamic Home Grid ---
    const renderHomeGrid = () => {
        const grid = document.getElementById('products-grid');
        grid.innerHTML = '';
        productsList.forEach((p, index) => {
            const btn = document.createElement('button');
            btn.className = 'quick-btn';
            btn.style.animationDelay = `${index * 0.05}s`;
            btn.innerHTML = `
                <span class="btn-icon">${p.icon}</span>
                <div class="btn-meta">
                    <span class="btn-name">${p.name}</span>
                    <span class="btn-price">${p.price != null ? formatMoney(p.price) : 'Maxsus summa'}</span>
                </div>
            `;
            btn.addEventListener('click', () => {
                playTap();
                const icon = btn.querySelector('.btn-icon');
                icon.style.transform = 'scale(1.2) translateY(-4px)';
                setTimeout(() => icon.style.transform = '', 150);

                if(p.price === null) {
                    window.currentOpenPriceProduct = p;
                    document.getElementById('price-prompt-title').textContent = p.name;
                    document.getElementById('price-prompt-input').value = '';
                    const backdrop = document.getElementById('price-prompt-backdrop');
                    const modal = document.getElementById('price-prompt-modal');
                    backdrop.classList.add('show');
                    modal.style.visibility = 'visible';
                    modal.style.opacity = '1';
                    modal.style.transform = 'translate(-50%, -50%) scale(1)';
                    setTimeout(() => document.getElementById('price-prompt-input').focus(), 100);
                } else {
                    const existing = orderItems.find(i => i.id === p.id && i.price === p.price);
                    if(existing) existing.qty++;
                    else orderItems.unshift({ id: p.id, name: p.name, price: p.price, qty: 1 });
                    updateUI();
                }
            });
            grid.appendChild(btn);
        });
    };
    renderHomeGrid();

    // Save and Clear Actions
    const performClearAnimation = (callback) => {
        const items = document.querySelectorAll('.inline-order-item');
        if(items.length === 0) { callback(); return; }
        
        items.forEach((item, i) => {
            item.style.animationDelay = `${i * 0.05}s`;
            item.classList.add('slide-out-fade');
        });

        totalAmount.style.transform = 'scale(0.8)';
        totalAmount.style.opacity = '0';
        
        setTimeout(() => {
            totalAmount.style.transform = '';
            totalAmount.style.opacity = '';
            callback();
        }, 300 + (items.length * 50));
    };

    document.getElementById('btn-reset-order').addEventListener('click', () => {
        playTap();
        const btn = document.getElementById('btn-reset-order');
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => btn.style.transform = '', 150);
        
        performClearAnimation(() => {
            orderItems = [];
            updateUI();
            notify("Ro'yxat tozalandi");
        });
    });

    document.getElementById('btn-save-order').addEventListener('click', () => {
        if(orderItems.length === 0) return;
        
        playTap();
        const btn = document.getElementById('btn-save-order');
        btn.style.transform = 'scale(0.9)';
        setTimeout(() => btn.style.transform = '', 150);
        
        let total = 0; let count = 0;
        orderItems.forEach(i => { total += i.price * i.qty; count += i.qty; });

        const now = new Date();
        const time = `${now.getHours()}:${String(now.getMinutes()).padStart(2,'0')}`;
        
        const itemsCopy = JSON.parse(JSON.stringify(orderItems));
        
        performClearAnimation(() => {
            pastOrders.unshift({
                id: `#00${pastOrders.length + 10}`, time, date: new Date().toISOString(), total, items: count, products: itemsCopy
            });
            setStorage('pos_ord', pastOrders);
            orderItems = [];
            updateUI();
            notify('Buyurtma saqlandi!');
            renderHistory();
            if(typeof updateAnalytics === 'function') updateAnalytics();
        });
    });

    // --- Analytics Logic ---
    let revenueChartInstance = null;
    let productsChartInstance = null;
    let currentFilter = 'today';

    const getFilteredOrders = (filter) => {
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        return pastOrders.filter(o => {
            if(!o.date) return false;
            const date = new Date(o.date);
            if(filter === 'today') return date >= startOfDay;
            if(filter === 'week') {
                const startOfWeek = new Date(startOfDay);
                startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() === 0 ? 6 : startOfWeek.getDay() - 1));
                return date >= startOfWeek;
            }
            if(filter === 'month') {
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                return date >= startOfMonth;
            }
            return true;
        });
    };

    const updateAnalytics = () => {
        const filtered = getFilteredOrders(currentFilter);
        
        // Filter expenses
        const now = new Date();
        const startOfDay = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        
        const filteredExpenses = expensesList.filter(e => {
            if(!e.date) return false;
            const d = new Date(e.date);
            if(currentFilter === 'today') return d >= startOfDay;
            if(currentFilter === 'week') {
                const startOfWeek = new Date(startOfDay);
                startOfWeek.setDate(startOfWeek.getDate() - (startOfWeek.getDay() === 0 ? 6 : startOfWeek.getDay() - 1));
                return d >= startOfWeek;
            }
            if(currentFilter === 'month') {
                const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
                return d >= startOfMonth;
            }
            return true;
        });

        let totalRevenue = 0;
        let totalOrders = filtered.length;
        let productCounts = {};

        filtered.forEach(o => {
            totalRevenue += o.total;
            if(o.products) {
                o.products.forEach(p => {
                    if(!productCounts[p.name]) productCounts[p.name] = { count: 0, revenue: 0 };
                    productCounts[p.name].count += p.qty;
                    productCounts[p.name].revenue += (p.price * p.qty);
                });
            }
        });

        let totalExpense = 0;
        filteredExpenses.forEach(e => totalExpense += e.amount);
        let netProfit = totalRevenue - totalExpense;

        const avgTicket = totalOrders > 0 ? totalRevenue / totalOrders : 0;

        document.getElementById('stat-revenue').textContent = formatMoney(totalRevenue);
        document.getElementById('stat-expense').textContent = formatMoney(totalExpense);
        document.getElementById('stat-profit').textContent = formatMoney(netProfit);
        document.getElementById('stat-count').textContent = totalOrders;
        document.getElementById('stat-avg').textContent = formatMoney(avgTicket);

        const sortedProducts = Object.entries(productCounts).sort((a,b) => b[1].count - a[1].count);
        const tpContainer = document.getElementById('top-products');
        tpContainer.innerHTML = '';
        
        if(sortedProducts.length === 0) {
            tpContainer.innerHTML = `<div style="padding: 30px; text-align: center; color: var(--text-secondary);">Ma'lumot yo'q</div>`;
        } else {
            sortedProducts.slice(0, 5).forEach(([name, data], i) => {
                tpContainer.innerHTML += `
                    <div class="top-product-item">
                        <div class="tp-rank">#${i+1}</div>
                        <div class="tp-name">${name}</div>
                        <div class="tp-count" style="text-align: right;">
                            <div>${data.count} ta</div>
                            <div style="font-size: 12px; color: var(--text-secondary); font-weight: 500;">${formatMoney(data.revenue)}</div>
                        </div>
                    </div>
                `;
            });
        }

        updateCharts(filtered, productCounts);
    };

    const updateCharts = (filteredOrders, productCounts) => {
        const classStr = document.body.className;
        const isDark = classStr.includes('theme-dark') || classStr.includes('theme-dim') || classStr.includes('theme-ocean');
        const textColor = isDark ? '#ffffff' : '#000000';
        const gridColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)';

        let labels = [];
        let data = [];

        if(currentFilter === 'today') {
            const hData = {};
            filteredOrders.forEach(o => {
                const hour = new Date(o.date).getHours() + ':00';
                hData[hour] = (hData[hour] || 0) + o.total;
            });
            labels = Object.keys(hData).sort();
            data = labels.map(l => hData[l]);
        } else {
            const dData = {};
            filteredOrders.forEach(o => {
                const d = new Date(o.date);
                const dayStr = d.getDate() + '/' + (d.getMonth()+1);
                dData[dayStr] = (dData[dayStr] || 0) + o.total;
            });
            labels = Object.keys(dData).sort((a,b) => {
                const [d1, m1] = a.split('/'); const [d2, m2] = b.split('/');
                return (new Date(new Date().getFullYear(), m1-1, d1)) - (new Date(new Date().getFullYear(), m2-1, d2));
            });
            data = labels.map(l => dData[l]);
        }

        const revCtx = document.getElementById('revenueChart');
        if(revCtx && window.Chart) {
            if(revenueChartInstance) revenueChartInstance.destroy();
            revenueChartInstance = new Chart(revCtx, {
                type: 'bar',
                data: {
                    labels: labels,
                    datasets: [{
                        label: 'Daromad (UZS)',
                        data: data,
                        backgroundColor: '#007aff',
                        borderRadius: 6,
                        barThickness: 'flex',
                        maxBarThickness: 40
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { duration: 800, easing: 'easeOutQuart' },
                    plugins: { legend: { display: false } },
                    scales: {
                        y: { beginAtZero: true, ticks: { color: textColor, maxTicksLimit: 5, callback: (v) => (v>=1000 ? (v/1000)+'k' : v) }, grid: { color: gridColor } },
                        x: { ticks: { color: textColor }, grid: { display: false } }
                    }
                }
            });
        }

        const prodCtx = document.getElementById('productsChart');
        const sortedProds = Object.entries(productCounts).sort((a,b) => b[1].revenue - a[1].revenue).slice(0, 5);
        if(prodCtx && window.Chart) {
            if(productsChartInstance) productsChartInstance.destroy();
            productsChartInstance = new Chart(prodCtx, {
                type: 'doughnut',
                data: {
                    labels: sortedProds.map(p => p[0]),
                    datasets: [{
                        data: sortedProds.map(p => p[1].revenue),
                        backgroundColor: ['#007aff', '#34c759', '#ff9500', '#ff3b30', '#af52de'],
                        borderWidth: 2,
                        borderColor: isDark ? '#1c1c1e' : '#ffffff'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    animation: { animateScale: true, animateRotate: true, duration: 800 },
                    plugins: {
                        legend: { position: 'right', labels: { color: textColor, font: { size: 11 }, boxWidth: 12 } }
                    },
                    cutout: '65%'
                }
            });
        }
    };

    const segmentBtns = document.querySelectorAll('.segment-btn');
    const segmentIndicator = document.querySelector('.segment-indicator');
    
    segmentBtns.forEach((btn, i) => {
        btn.addEventListener('click', () => {
            segmentBtns.forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
            segmentIndicator.style.transform = `translateX(${i * 100}%)`;
            
            currentFilter = btn.getAttribute('data-filter');
            
            const analyticsContent = document.querySelector('.analytics-content');
            analyticsContent.style.opacity = '0';
            analyticsContent.style.transform = 'scale(0.98)';
            setTimeout(() => {
                updateAnalytics();
                analyticsContent.style.transition = 'opacity 0.4s var(--spring-soft), transform 0.4s var(--spring-soft)';
                analyticsContent.style.opacity = '1';
                analyticsContent.style.transform = 'scale(1)';
                
                // Remove inline transition after animation to not interfere with tab switching
                setTimeout(() => {
                    analyticsContent.style.transition = '';
                    analyticsContent.style.opacity = '';
                    analyticsContent.style.transform = '';
                }, 400);
            }, 150);
        });
    });

    // --- History & Nav ---
    const renderHistory = () => {
        const hContainer = document.getElementById('history-container');
        hContainer.innerHTML = '';
        pastOrders.forEach((o, i) => {
            const el = document.createElement('div');
            el.className = 'history-item';
            el.style.animationDelay = `${i * 0.06}s`;
            
            // Format product names for subtitle
            const pNames = o.products ? o.products.map(p => p.name).join(', ') : 'Tarkibi saqlanmagan';
            
            el.innerHTML = `
                <div style="flex:1; padding-right:12px; overflow:hidden;">
                    <span class="history-id">${o.id}</span>
                    <span style="color:var(--text-secondary); font-size:13px; margin-left:8px;">${o.time}</span>
                    <span class="history-time" style="display:block; margin-top:6px; color:var(--text-secondary); font-size:13px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">
                        ${pNames}
                    </span>
                </div>
                <div class="history-total" style="text-align:right;">
                    <div>${formatMoney(o.total)}</div>
                    <div style="font-size:12px; font-weight:500; color:var(--text-secondary); margin-top:4px;">${o.items} ta</div>
                </div>
            `;
            el.addEventListener('click', () => {
                let productsHtml = o.products ? o.products.map(p => `
                    <div style="display:flex; justify-content:space-between; margin-bottom: 12px; font-size: 15px; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;">
                        <span style="color:var(--text-secondary); font-weight:600;">${p.qty}x</span>
                        <span style="flex:1; margin:0 12px; font-weight:500;">${p.name}</span>
                        <span style="font-weight:600; color:var(--accent-blue);">${formatMoney(p.price * p.qty)}</span>
                    </div>
                `).join('') : "<p style='color:var(--text-secondary)'>Tarkibi no'malum</p>";

                historyModal.container.innerHTML = `
                    <div style="margin-bottom:16px;">
                        <h3 style="display:inline-block;">${o.id}</h3>
                        <span style="float:right; font-weight:500; color:var(--text-secondary);">${o.time}</span>
                    </div>
                    
                    <div style="background:var(--bg-color); padding:16px 16px 4px; border-radius:12px; margin-bottom:20px; max-height: 50vh; overflow-y:auto;">
                        ${productsHtml}
                    </div>
                    
                    <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom: 16px;">
                        <span style="font-size:16px; font-weight:500;">Jami summa:</span>
                        <strong style="font-size:24px; color:var(--text-primary); letter-spacing:-0.5px;">${formatMoney(o.total)}</strong>
                    </div>

                    ${currentUser?.role === 'admin' ? `
                    <button class="btn btn-secondary" style="width: 100%; color: var(--accent-red); font-weight: 600; padding: 14px; display: flex; align-items: center; justify-content: center; border: 1.5px solid rgba(255, 59, 48, 0.2); margin-top: 16px;" onclick="window.delOrder('${o.id}')">
                        <ion-icon name="trash" style="margin-right: 8px; font-size: 20px;"></ion-icon> Buyurtmani bekor qilish
                    </button>` : ''}
                `;
                historyModal.backdrop.classList.add('show');
                historyModal.sheet.classList.add('show');
            });
            hContainer.appendChild(el);
        });
    };

    window.delOrder = (id) => {
        if(currentUser?.role !== 'admin') { notify("Faqat admin o'chira oladi", "warning"); return; }
        if(confirm("Haqiqatan ham bu buyurtmani bekor qilasizmi? Barcha hisobotlar va tushumlar o'zgaradi.")) {
            pastOrders = pastOrders.filter(o => o.id !== id);
            setStorage('pos_ord', pastOrders);
            renderHistory();
            if(typeof updateAnalytics === 'function') updateAnalytics();
            historyModal.backdrop.classList.remove('show');
            historyModal.sheet.classList.remove('show');
            notify("Buyurtma bekor qilindi", "trash-outline");
        }
    };

    document.getElementById('btn-close-history').addEventListener('click', () => {
        historyModal.backdrop.classList.remove('show');
        historyModal.sheet.classList.remove('show');
    });
    historyModal.backdrop.addEventListener('click', () => {
        historyModal.backdrop.classList.remove('show');
        historyModal.sheet.classList.remove('show');
    });

    // --- Tab Navigation Fluid Transition ---
    const tabs = document.querySelectorAll('.tab-content');
    const navItems = document.querySelectorAll('.nav-item');

    navItems.forEach((btn, index) => {
        btn.addEventListener('click', () => {
            const currentActive = document.querySelector('.nav-item.active');
            const currentIndex = Array.from(navItems).indexOf(currentActive);
            
            if(currentIndex === index) return;
            
            navItems.forEach(n => {
                n.classList.remove('active');
                let ic = n.querySelector('ion-icon');
                let name = ic.getAttribute('name');
                if(!name.includes('-outline') && name !== 'home') ic.setAttribute('name', name + '-outline');
            });
            
            btn.classList.add('active');
            let icon = btn.querySelector('ion-icon');
            let nm = icon.getAttribute('name');
            icon.setAttribute('name', nm.replace('-outline', ''));
            if(btn.getAttribute('data-target')==='tab-home') icon.setAttribute('name','home');

            const targetId = btn.getAttribute('data-target');
            const direction = index > currentIndex ? 1 : -1;

            tabs.forEach(t => {
                if(t.classList.contains('active')) {
                    t.classList.remove('active');
                    t.style.transform = `scale(0.98)`;
                    t.style.opacity = '0';
                }
            });

            const target = document.getElementById(targetId);
            target.style.transition = 'none';
            target.style.transform = `scale(0.98)`;
            
            void target.offsetWidth; // reflow
            
            target.style.transition = 'opacity 0.35s var(--spring-soft), transform 0.4s var(--spring-soft), visibility 0.4s';
            target.classList.add('active');
            target.style.transform = 'scale(1)';
            target.style.opacity = '1';

            if(targetId === 'tab-orders') renderHistory();
            if(targetId === 'tab-analytics') {
                if(typeof updateAnalytics === 'function') updateAnalytics();
            }
        });
    });

    // --- Settings Modals Logic ---
    const setModal = document.getElementById('settings-modal');
    const setContent = document.getElementById('settings-detail-content');
    const setTitle = document.getElementById('settings-modal-title');
    const settingsBackdrop = document.getElementById('components-backdrop');

    const openSettings = (title, renderFunc) => {
        setTitle.textContent = title;
        setContent.innerHTML = '';
        renderFunc();
        settingsBackdrop.classList.add('show');
        setModal.classList.add('show');
    };

    const closeSettings = () => {
        settingsBackdrop.classList.remove('show');
        setModal.classList.remove('show');
    };

    document.getElementById('btn-close-settings').addEventListener('click', closeSettings);
    settingsBackdrop.addEventListener('click', closeSettings);

    // Products Manage
    document.getElementById('set-products').addEventListener('click', () => {
        openSettings('Mahsulotlar', renderProductsSettings);
    });

    const renderProductsSettings = () => {
        let html = '<div style="margin-bottom: 24px;">';
        productsList.forEach((p, i) => {
            html += `
                <div class="list-row" style="animation: slideUpFade 0.4s var(--spring-soft) backwards; animation-delay: ${i * 0.05}s;">
                    <div class="row-icon">${p.icon}</div>
                    <div class="row-content">
                        <div class="row-title">${p.name}</div>
                        <div class="row-sub">${p.price != null ? formatMoney(p.price) : 'Maxsus narx / Tarozida'}</div>
                    </div>
                    <button class="icon-btn-text text-danger" onclick="window.delProduct('${p.id}')">O'chirish</button>
                </div>
            `;
        });
        html += '</div>';
        
        html += `
            <div class="form-group">
                <div class="list-row"><div class="row-title">Nomi</div><input type="text" id="n-p-name" class="row-input" placeholder="Masalan: Kofe"></div>
                <div class="list-row"><div class="row-title">Narxi</div><input type="number" id="n-p-price" class="row-input" placeholder="(Ixtiyoriy yozmaslik mumkin)"></div>
                <div class="list-row"><div class="row-title">Ikonka</div><input type="text" id="n-p-icon" class="row-input" placeholder="☕"></div>
            </div>
            <div style="padding: 0 16px 24px;"><button class="btn btn-primary" style="width:100%" id="btn-add-product">Qo'shish</button></div>
        `;
        setContent.innerHTML = html;

        document.getElementById('btn-add-product').addEventListener('click', () => {
            const n = document.getElementById('n-p-name').value;
            const pVal = document.getElementById('n-p-price').value;
            const p = pVal ? parseInt(pVal) : null;
            const ic = document.getElementById('n-p-icon').value || '🛍️';
            if(n) {
                productsList.push({ id: Date.now().toString(), name: n, price: p, icon: ic });
                setStorage('pos_prod', productsList);
                renderHomeGrid();
                renderProductsSettings();
                notify("Mahsulot qo'shildi");
                if(typeof updateAnalytics === 'function') updateAnalytics();
            } else { notify("Kamida Nomini kiriting", "warning"); }
        });
    };
    
    window.delProduct = (id) => {
        productsList = productsList.filter(p => p.id !== id);
        setStorage('pos_prod', productsList);
        renderHomeGrid();
        renderProductsSettings();
        notify("O'chirildi", "trash-outline");
        if(typeof updateAnalytics === 'function') updateAnalytics();
    };

    // Users Manage
    document.getElementById('set-users').addEventListener('click', () => {
        if(currentUser?.role !== 'admin') { notify("Faqat admin kira oladi", "warning"); return; }
        openSettings('Foydalanuvchilar', renderUsersSettings);
    });

    const renderUsersSettings = () => {
        let html = '<div style="margin-bottom: 24px;">';
        usersList.forEach((u, i) => {
            html += `
                <div class="list-row" style="animation: slideUpFade 0.4s var(--spring-soft) backwards; animation-delay: ${i * 0.05}s;">
                    <div class="row-icon"><ion-icon name="person-circle"></ion-icon></div>
                    <div class="row-content">
                        <div class="row-title">${u.name}</div>
                        <div class="row-sub">PIN: ${u.pin} | Role: ${u.role}</div>
                    </div>
                    <button class="icon-btn-text text-danger" onclick="window.delUser('${u.id}')">O'chirish</button>
                </div>
            `;
        });
        html += '</div>';

        html += `
            <div class="form-group">
                <div class="list-row"><div class="row-title">Ism</div><input type="text" id="n-u-name" class="row-input" placeholder="Masalan: Ali"></div>
                <div class="list-row"><div class="row-title">PIN kod</div><input type="number" id="n-u-pin" class="row-input" placeholder="Parol"></div>
                <div class="list-row">
                    <div class="row-title">Rol</div>
                    <select id="n-u-role" class="row-input" style="appearance:none; direction:rtl;"><option value="cashier">Kassir</option><option value="admin">Admin</option></select>
                </div>
            </div>
            <div style="padding: 0 16px 24px;"><button class="btn btn-primary" style="width:100%" id="btn-add-user">Qo'shish</button></div>
        `;
        setContent.innerHTML = html;

        document.getElementById('btn-add-user').addEventListener('click', () => {
            const n = document.getElementById('n-u-name').value;
            const p = document.getElementById('n-u-pin').value;
            const r = document.getElementById('n-u-role').value;
            if(n && p.length >= 4) {
                usersList.push({ id: 'u'+Date.now(), name: n, pin: p, role: r });
                setStorage('pos_usr', usersList);
                renderUsersSettings();
                notify("Foydalanuvchi qo'shildi");
            } else notify("Noto'g'ri moslama", "warning");
        });
    };

    window.delUser = (id) => {
        if(usersList.length <= 1) { notify("Oxirgi admin o'chirilmaydi", "warning"); return; }
        if(currentUser?.id === id) { notify("O'zingizni o'chirolmaysiz", "warning"); return; }
        usersList = usersList.filter(u => u.id !== id);
        setStorage('pos_usr', usersList);
        renderUsersSettings();
        notify("Foydalanuvchi o'chirildi", "trash-outline");
    };

    // Expenses Manage
    document.getElementById('set-expenses').addEventListener('click', () => {
        if(currentUser?.role !== 'admin') { notify("Faqat admin kira oladi", "warning"); return; }
        openSettings('Chiqimlar / Xarajatlar', renderExpensesSettings);
    });

    const renderExpensesSettings = () => {
        let html = '<div style="margin-bottom: 24px;">';
        expensesList.forEach((e, i) => {
            html += `
                <div class="list-row" style="animation: slideUpFade 0.4s var(--spring-soft) backwards; animation-delay: ${i * 0.05}s;">
                    <div class="row-icon"><ion-icon name="cash-outline"></ion-icon></div>
                    <div class="row-content">
                        <div class="row-title">${e.name}</div>
                        <div class="row-sub">${formatMoney(e.amount)} <span style="font-size:11px; margin-left:6px; color:var(--text-secondary);">${new Date(e.date).toLocaleDateString('uz-UZ')}</span></div>
                    </div>
                    <button class="icon-btn-text text-danger" onclick="window.delExpense('${e.id}')">O'chirish</button>
                </div>
            `;
        });
        html += '</div>';

        html += `
            <div class="form-group">
                <div class="list-row"><div class="row-title">Nomi</div><input type="text" id="n-e-name" class="row-input" placeholder="Limonad, Chiroq puli"></div>
                <div class="list-row"><div class="row-title">Summa</div><input type="number" id="n-e-amount" class="row-input" placeholder="50000"></div>
            </div>
            <div style="padding: 0 16px 24px;"><button class="btn btn-primary" style="width:100%" id="btn-add-expense">Qo'shish</button></div>
        `;
        setContent.innerHTML = html;

        document.getElementById('btn-add-expense').addEventListener('click', () => {
            const n = document.getElementById('n-e-name').value;
            const a = parseInt(document.getElementById('n-e-amount').value);
            if(n && !isNaN(a)) {
                expensesList.unshift({ id: 'e'+Date.now(), name: n, amount: a, date: new Date().toISOString() });
                setStorage('pos_exp', expensesList);
                renderExpensesSettings();
                notify("Xarajat qo'shildi");
                if(typeof updateAnalytics === 'function') updateAnalytics();
            } else notify("Noto'g'ri ma'lumot", "warning");
        });
    };

    window.delExpense = (id) => {
        expensesList = expensesList.filter(e => e.id !== id);
        setStorage('pos_exp', expensesList);
        renderExpensesSettings();
        notify("O'chirildi", "trash-outline");
        if(typeof updateAnalytics === 'function') updateAnalytics();
    };

    // Printer settings
    document.getElementById('set-printer').addEventListener('click', () => {
        openSettings('Printer Sozlamalari', () => {
            setContent.innerHTML = `
                <div class="form-group">
                    <div class="list-row"><div class="row-title">IP Manzil</div><input type="text" id="pr-ip" class="row-input" value="${printerConfig.ip}"></div>
                    <div class="list-row"><div class="row-title">Port</div><input type="number" id="pr-port" class="row-input" value="${printerConfig.port}"></div>
                    <div class="list-row">
                        <div class="row-title">Qog'oz o'lchami</div>
                        <select id="pr-size" class="row-input" style="appearance:none; direction:rtl;">
                            <option value="58mm" ${printerConfig.paper==='58mm'?'selected':''}>58mm</option>
                            <option value="80mm" ${printerConfig.paper==='80mm'?'selected':''}>80mm</option>
                        </select>
                    </div>
                </div>
                <div style="padding: 0 16px 24px;"><button class="btn btn-primary" style="width:100%" id="btn-save-printer">Saqlash</button></div>
            `;
            document.getElementById('btn-save-printer').addEventListener('click', () => {
                printerConfig.ip = document.getElementById('pr-ip').value;
                printerConfig.port = document.getElementById('pr-port').value;
                printerConfig.paper = document.getElementById('pr-size').value;
                setStorage('pos_print', printerConfig);
                closeSettings();
                notify("Printer saqlandi", "print");
            });
        });
    });

    // Themes Management
    const appThemes = [
        { id: 'theme-auto', name: 'Avtomatik (Tizim)', icon: 'phone-portrait-outline', color: 'linear-gradient(135deg, #f2f2f7, #1c1c1e)' },
        { id: 'theme-light', name: 'Kunduzgi (Och)', icon: 'sunny-outline', color: '#f2f2f7' },
        { id: 'theme-sepia', name: 'Kitobiy (Sepia)', icon: 'book-outline', color: '#f4ecdf' },
        { id: 'theme-dim', name: "Kechki (Sokin ko'k)", icon: 'moon-outline', color: '#15202B' },
        { id: 'theme-ocean', name: "Okean qa'ri", icon: 'water-outline', color: '#0f172a' },
        { id: 'theme-dark', name: 'Tungi (Qora)', icon: 'moon', color: '#000000' }
    ];

    let currentThemeId = getStorage('pos_theme', 'theme-auto');

    const applyTheme = (themeId) => {
        document.body.className = '';
        if (themeId === 'theme-light') {
            document.body.classList.add('light-mode');
        } else if (themeId === 'theme-auto') {
            if (window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches) {
                document.body.classList.add('theme-dark');
            } else {
                document.body.classList.add('light-mode');
            }
        } else {
            document.body.classList.add(themeId);
        }
        
        const themeLabel = document.getElementById('current-theme-label');
        if (themeLabel) {
            const t = appThemes.find(x => x.id === themeId);
            themeLabel.textContent = t ? `Mavzu: ${t.name.split(' ')[0]}` : 'Mavzular';
        }
        
        setTimeout(() => {
            if(typeof updateAnalytics === 'function' && document.getElementById('tab-analytics')?.classList.contains('active')) {
                updateAnalytics();
            }
        }, 300);
    };

    // Listen for system theme changes if auto is selected
    window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
        if (currentThemeId === 'theme-auto') applyTheme('theme-auto');
    });

    // Apply on load
    applyTheme(currentThemeId);

    const setThemesBtn = document.getElementById('set-themes');
    if (setThemesBtn) {
        setThemesBtn.addEventListener('click', () => {
            openSettings('Mavzular (Temalar)', () => {
                let html = '<div style="margin-bottom: 24px;">';
                appThemes.forEach((t, i) => {
                    const isActive = currentThemeId === t.id;
                    const bgStyle = t.color.startsWith('linear') ? `background:${t.color};` : `background:${t.color};`;
                    const innerColor = (t.id === 'theme-light' || t.id === 'theme-sepia' || t.id === 'theme-auto') ? '#000' : '#ffffff';
                    
                    html += `
                        <div class="list-row" style="animation: slideUpFade 0.4s var(--spring-soft) backwards; animation-delay: ${i * 0.05}s;" onclick="window.setAppTheme('${t.id}')">
                            <div class="row-icon" style="${bgStyle} width:36px; height:36px; border-radius:50%; border:1px solid var(--border-color); display:flex; align-items:center; justify-content:center; color:${innerColor}; font-size:18px;">
                                <ion-icon name="${t.icon}"></ion-icon>
                            </div>
                            <div class="row-content">
                                <div class="row-title" style="font-weight: ${isActive ? '700' : '500'};">${t.name}</div>
                            </div>
                            ${isActive ? '<ion-icon name="checkmark-circle" style="color:var(--accent-blue); font-size:24px;"></ion-icon>' : ''}
                        </div>
                    `;
                });
                html += '</div>';
                setContent.innerHTML = html;
            });
        });
    }

    window.setAppTheme = (themeId) => {
        currentThemeId = themeId;
        setStorage('pos_theme', themeId);
        applyTheme(themeId);
        notify("Mavzu o'zgardi", "color-palette");
        const bs = document.getElementById('settings-modal');
        if(bs.classList.contains('show')) {
            document.getElementById('set-themes').click(); 
        }
    };

    // --- Firebase Real-time Sync Listeners ---
    const syncNode = (key, fallbackArray, updateCallback) => {
        db.ref(key).on('value', snapshot => {
            const data = snapshot.val();
            if (data) {
                // Firebase ba'zida massivni Object qilib qaytaradi, uni massivga aylantiramiz
                const arrayData = Array.isArray(data) ? data : Object.values(data);
                updateCallback(arrayData);
            } else {
                // Seed Firebase if empty
                db.ref(key).set(fallbackArray);
            }
        });
    };

    // 1. Products Sync
    syncNode('pos_prod', [
        { id: '1', name: "Jo'ja (1 kg / portsiya)", price: null, icon: "🍗" },
        { id: '2', name: "Fastfood", price: 30000, icon: "🍔" },
        { id: '3', name: "Ichimlik", price: 10000, icon: "🥤" },
        { id: '4', name: "Mayda-chuyda", price: 5000, icon: "🍟" }
    ], (data) => {
        productsList = data;
        if (typeof renderHomeGrid === 'function') renderHomeGrid();
        const setModal = document.getElementById('settings-modal');
        if (setModal && setModal.classList.contains('show') && document.getElementById('settings-modal-title')?.textContent === 'Mahsulotlar') {
            if (typeof renderProductsSettings === 'function') renderProductsSettings();
        }
    });

    // 2. Users Sync
    syncNode('pos_usr', [
        { id: 'u1', name: "Admin", role: "admin", pin: "05284" },
        { id: 'u2', name: "Kassir", role: "cashier", pin: "1234" }
    ], (data) => {
        usersList = data;
        const defaultAdm = usersList.find(u => u.role === "admin" && u.pin === "1111");
        if(defaultAdm) {
            defaultAdm.pin = "05284";
            setStorage('pos_usr', usersList);
        }
        const setModal = document.getElementById('settings-modal');
        if (setModal && setModal.classList.contains('show') && document.getElementById('settings-modal-title')?.textContent === 'Foydalanuvchilar') {
            if (typeof renderUsersSettings === 'function') renderUsersSettings();
        }
    });

    // 3. Expenses Sync
    syncNode('pos_exp', [], (data) => {
        expensesList = data;
        if (typeof updateAnalytics === 'function') updateAnalytics();
        const setModal = document.getElementById('settings-modal');
        if (setModal && setModal.classList.contains('show') && document.getElementById('settings-modal-title')?.textContent === 'Chiqimlar / Xarajatlar') {
            if (typeof renderExpensesSettings === 'function') renderExpensesSettings();
        }
    });

    // 4. Orders Sync
    syncNode('pos_ord', [], (data) => {
        pastOrders = data;
        if (typeof renderHistory === 'function') renderHistory();
        if (typeof updateAnalytics === 'function') updateAnalytics();
    });

    renderHistory();
    updateUI();
    setTimeout(() => {
        if(typeof updateAnalytics === 'function') updateAnalytics();
    }, 100);
});
