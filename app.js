const firebaseConfig = {
    apiKey:"AIzaSyBoGxX4SvH6dqvS1_D07GmHliTlrfaJTw8",
    authDomain:"store-754c5.firebaseapp.com",
    projectId:"store-754c5",
    storageBucket:"store-754c5.firebasestorage.app",
    messagingSenderId:"392118549414",
    appId:"1:392118549414:web:5abc5e61f041518f8ced67",
    measurementId:"G-WRW47QYCJ4"
};

firebase.initializeApp(firebaseConfig);

const auth = firebase.auth();
const db = firebase.firestore();
const storeRef = db.collection("store").doc("store_v_final_v4");

let onlineOrders = [];
let currentUser = null;
let editingOrderId = null;
let branchesList = [];

const ADMIN_EMAILS = [
    "himamax31@gmail.com",
    "ahmedemad@gmail.com"
];

const FOLLOW_STATUSES = ["جديد","قيد التجهيز","تم الشحن","تم التسليم"];
const DEFAULT_BRANCHES = ["دمياط","رأس البر","جمصة","بورسعيد","المنصورة","طلخا","نبروه"];

/* =========================
   LOGIN
========================= */

function showLoginError(message){
    document.getElementById("login-error").textContent = message || "";
}

async function loginUser(){
    const email = document.getElementById("login-email").value.trim().toLowerCase();
    const password = document.getElementById("login-password").value;
    showLoginError("");

    if(!email || !password){
        showLoginError("من فضلك أدخل البريد الإلكتروني وكلمة المرور.");
        return;
    }

    try{
        const result = await auth.signInWithEmailAndPassword(email, password);
        const loggedEmail = (result.user.email || "").trim().toLowerCase();

        if(!ADMIN_EMAILS.includes(loggedEmail)){
            await auth.signOut();
            showLoginError("هذا الحساب ليس لديه صلاحية الدخول.");
            return;
        }

        currentUser = result.user;
        document.getElementById("login-screen").style.display = "none";
        await loadOrders();

    }catch(error){
        console.error(error);
        showLoginError("البريد الإلكتروني أو كلمة المرور غير صحيحة.");
    }
}

async function logoutUser(){
    await auth.signOut();
    currentUser = null;
    onlineOrders = [];
    document.getElementById("login-screen").style.display = "flex";
    renderOrders();
    renderTracking();
    renderMonthlySales();
}

/* ================= TABS ================= */

function switchTab(tab){
    ["orders","tracking","import"].forEach(name => {
        const btn = document.getElementById("tab-"+name+"-btn");
        const page = document.getElementById("page-"+name);
        if(btn) btn.classList.toggle("active", name === tab);
        if(page) page.classList.toggle("active", name === tab);
    });

    if(tab === "tracking") renderTracking();
    if(tab === "import" && typeof importRows !== 'undefined' && importRows.length) renderImportPreview();
}

/* ================= LOAD / SAVE ================= */

async function loadOrders(){
    try{
        const doc = await storeRef.get();

        if(doc.exists){
            const data = doc.data() || {};
            onlineOrders = Array.isArray(data.onlineOrders) ? data.onlineOrders : [];
            branchesList = Array.isArray(data.branches) && data.branches.length ? data.branches : [...DEFAULT_BRANCHES];
        }else{
            onlineOrders = [];
            branchesList = [...DEFAULT_BRANCHES];
        }

        prepareMonthlyYears();
        setCurrentYear();
        populateBranchSelects();
        renderOrders();
        renderTracking();
        renderMonthlySales();

    }catch(error){
        console.error("Firebase Load Error:", error);
        alert("حدث خطأ أثناء تحميل الأوردرات:\n" + error.message);
    }
}

async function saveOrders(){
    if(!currentUser){
        alert("يجب تسجيل الدخول أولاً.");
        return false;
    }

    try{
        await storeRef.set({onlineOrders: onlineOrders, branches: branchesList}, {merge: true});
        return true;
    }catch(error){
        console.error("Firebase Save Error:", error);
        alert("حدث خطأ أثناء حفظ البيانات:\n" + error.message);
        return false;
    }
}

/* ================= BRANCHES ================= */

function populateBranchSelects(){
    const selects = [
        {id:"order-branch", keep:true},
        {id:"edit-branch", keep:true},
        {id:"branch-filter", keep:true, allLabel:"كل المدن"},
        {id:"track-branch-filter", keep:true, allLabel:"كل المدن"}
    ];

    selects.forEach(cfg => {
        const select = document.getElementById(cfg.id);
        if(!select) return;
        const oldValue = select.value;

        select.innerHTML = "";

        if(cfg.allLabel){
            const allOpt = document.createElement("option");
            allOpt.value = "all";
            allOpt.textContent = cfg.allLabel;
            select.appendChild(allOpt);
        }

        branchesList.forEach(branch => {
            const option = document.createElement("option");
            option.value = branch;
            option.textContent = "🏪 " + branch;
            select.appendChild(option);
        });

        if(oldValue && (oldValue === "all" || branchesList.includes(oldValue))){
            select.value = oldValue;
        }
    });
}

async function addBranch(){
    const name = prompt("اكتب اسم المدينة / المركز الجديد:");
    if(!name) return;

    const clean = name.trim();
    if(!clean) return;

    if(branchesList.includes(clean)){
        alert("هذه المدينة موجودة بالفعل.");
        return;
    }

    branchesList.push(clean);

    const saved = await saveOrders();
    if(saved){
        populateBranchSelects();
        document.getElementById("order-branch").value = clean;
        alert("تم إضافة المركز بنجاح ✅");
    }
}

/* ================= CALCULATIONS ================= */

function calculateNet(){
    const total = parseFloat(document.getElementById("total-amount").value) || 0;
    const delivery = parseFloat(document.getElementById("delivery-price").value) || 0;
    document.getElementById("net-amount").value = Math.max(total - delivery, 0).toFixed(2);
}

function calculateEditNet(){
    const total = parseFloat(document.getElementById("edit-total").value) || 0;
    const delivery = parseFloat(document.getElementById("edit-delivery").value) || 0;
    document.getElementById("edit-net").value = Math.max(total - delivery, 0).toFixed(2);
}

function getCurrentDateTimeLocal(){
    const now = new Date();
    const offset = now.getTimezoneOffset();
    const localDate = new Date(now.getTime() - offset * 60000);
    return localDate.toISOString().slice(0, 16);
}

function setCurrentYear(){
    const yearSelect = document.getElementById("monthly-year");
    if(yearSelect) yearSelect.value = new Date().getFullYear();
}

document.addEventListener("DOMContentLoaded", () => {
    const orderDateInput = document.getElementById("order-date");
    if(orderDateInput) orderDateInput.value = getCurrentDateTimeLocal();
});

/* ================= HELPERS ================= */

function money(value){
    const number = Number(value) || 0;
    return number.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " EGP";
}

function formatDate(value){
    if(!value) return "-";
    const date = new Date(value);
    if(isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
    }) + " " + date.toLocaleTimeString("en-US", {
        hour: "2-digit",
        minute: "2-digit"
    });
}

function escapeHtml(value){
    return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function getOrderDateValue(order){
    if(order && order.orderDate) return order.orderDate;
    if(order && order.createdAt) return order.createdAt;
    return null;
}

function getOrderDate(order){
    const value = getOrderDateValue(order);
    if(!value) return null;
    const date = new Date(value);
    if(isNaN(date.getTime())) return null;
    return date;
}

function getOrderNet(order){
    return Number(order.net !== undefined ? order.net : Math.max(Number(order.total || 0) - Number(order.delivery || 0), 0)) || 0;
}

function normalizeDateTimeLocal(value){
    if(!value) return getCurrentDateTimeLocal();
    const date = new Date(value);
    if(isNaN(date.getTime())) return getCurrentDateTimeLocal();
    const offset = date.getTimezoneOffset();
    const localDate = new Date(date.getTime() - offset * 60000);
    return localDate.toISOString().slice(0, 16);
}

function followBadgeClass(status){
    if(status === "قيد التجهيز") return "fs-prep";
    if(status === "تم الشحن") return "fs-ship";
    if(status === "تم التسليم") return "fs-done";
    return "fs-new";
}

function followIcon(status){
    if(status === "قيد التجهيز") return "⚙️";
    if(status === "تم الشحن") return "🚚";
    if(status === "تم التسليم") return "✅";
    return "🆕";
}

/* ================= ADD ORDER ================= */

document.getElementById("order-form").addEventListener("submit", async function(event){
    event.preventDefault();

    const booking = document.getElementById("booking-number").value.trim();
    const phone = document.getElementById("customer-phone").value.trim();
    const branch = document.getElementById("order-branch").value;
    const specs = document.getElementById("order-specs").value.trim();
    const orderDate = document.getElementById("order-date").value;
    const total = parseFloat(document.getElementById("total-amount").value) || 0;
    const payment = document.getElementById("payment-method").value;
    const delivery = parseFloat(document.getElementById("delivery-price").value) || 0;

    if(!booking || !phone || !branch || !orderDate || !payment || total < 0 || delivery < 0){
        alert("من فضلك أكمل بيانات الأوردر (رقم الحجز، الهاتف، المركز إلزامية).");
        return;
    }

    if(!/^[0-9+\s-]{8,15}$/.test(phone)){
        alert("من فضلك أدخل رقم هاتف صحيح.");
        return;
    }

    const duplicate = onlineOrders.find(order => String(order.booking) === String(booking));

    if(duplicate){
        alert("رقم الحجز موجود بالفعل في النظام.");
        return;
    }

    const now = new Date();

    const order = {
        id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 8),
        booking: booking,
        phone: phone,
        branch: branch,
        specs: specs,
        payment: payment,
        total: total,
        delivery: delivery,
        net: Math.max(total - delivery, 0),
        cancelled: false,
        followStatus: "جديد",
        orderDate: orderDate,
        createdAt: now.toISOString(),
        createdTimestamp: Date.now()
    };

    onlineOrders.unshift(order);

    const saved = await saveOrders();

    if(saved){
        clearOrderForm();
        prepareMonthlyYears();
        renderOrders();
        renderTracking();
        renderMonthlySales();
        alert("تم إضافة الأوردر بنجاح ✅");
    }
});

function clearOrderForm(){
    document.getElementById("order-form").reset();
    document.getElementById("delivery-price").value = "0";
    document.getElementById("net-amount").value = "";
    document.getElementById("order-date").value = getCurrentDateTimeLocal();
}

/* ================= RENDER: ORDERS ================= */

function renderOrders(){
    const body = document.getElementById("orders-body");
    const search = (document.getElementById("search-input")?.value || "").trim().toLowerCase();
    const statusFilter = document.getElementById("status-filter")?.value || "all";
    const branchFilter = document.getElementById("branch-filter")?.value || "all";

    let filtered = [...onlineOrders];

    if(search){
        filtered = filtered.filter(order =>
            String(order.booking || "").toLowerCase().includes(search) ||
            String(order.phone || "").toLowerCase().includes(search)
        );
    }

    if(statusFilter === "active"){
        filtered = filtered.filter(order => !order.cancelled);
    }

    if(statusFilter === "cancelled"){
        filtered = filtered.filter(order => order.cancelled);
    }

    if(branchFilter !== "all"){
        filtered = filtered.filter(order => String(order.branch || "") === branchFilter);
    }

    filtered.sort((a, b) => {
        const dateA = getOrderDate(a);
        const dateB = getOrderDate(b);
        const timeA = dateA ? dateA.getTime() : 0;
        const timeB = dateB ? dateB.getTime() : 0;
        return timeB - timeA;
    });

    body.innerHTML = "";

    if(filtered.length === 0){
        body.innerHTML = '<tr><td colspan="11" class="empty">📭 لا توجد أوردرات مطابقة للبحث</td></tr>';
    }else{
        filtered.forEach((order, index) => {
            const date = formatDate(getOrderDateValue(order));
            const netValue = getOrderNet(order);
            const branchBadge = order.branch ? '<span class="branch-badge">🏪 ' + escapeHtml(order.branch) + '</span>' : '<span style="color:#64748b">—</span>';
            const phoneCell = order.phone ? '<span class="phone-cell"><a href="tel:' + escapeHtml(order.phone) + '">' + escapeHtml(order.phone) + '</a></span>' : '<span style="color:#64748b">—</span>';

            const status = order.cancelled
            ? '<span class="badge cancelled">❌ ملغي</span>'
            : '<span class="badge active-order">✅ مؤكد</span>';

            const action = order.cancelled
            ? `<button class="action-btn restore" onclick="restoreOrder('${order.id}')">إعادة</button>`
            : `<button class="action-btn cancel" onclick="cancelOrder('${order.id}')">إلغاء</button>`;

            body.innerHTML += `
            <tr>
            <td>${index+1}</td>
            <td class="booking">${escapeHtml(order.booking)}</td>
            <td>${phoneCell}</td>
            <td>${branchBadge}</td>
            <td class="amount">${money(order.total)}</td>
            <td><span class="badge ${order.payment === "فيزا" ? "visa" : order.payment === "كاش" ? "cash" : ""}">${order.payment === "فيزا" ? "💳 فيزا" : order.payment === "كاش" ? "💵 كاش" : "— غير محدد"}</span></td>
            <td class="delivery">${money(order.delivery)}</td>
            <td class="net">${money(netValue)}</td>
            <td dir="ltr">${date}</td>
            <td>${status}</td>
            <td>
            <button class="action-btn view" onclick="viewOrderDetails('${order.id}')">عرض</button>
            <button class="action-btn edit" onclick="editOrder('${order.id}')">تعديل</button>
            ${action}
            <button class="action-btn delete" onclick="deleteOrder('${order.id}')">حذف</button>
            </td>
            </tr>
            `;
        });
    }

    updateStats();

    let visibleTotal = 0;
    let visibleNet = 0;

    filtered.forEach(order => {
        visibleTotal += Number(order.total) || 0;
        visibleNet += getOrderNet(order);
    });

    document.getElementById("footer-orders").textContent = filtered.length;
    document.getElementById("footer-total").textContent = money(filtered.length ? visibleTotal : 0);
    document.getElementById("footer-net").textContent = money(filtered.length ? visibleNet : 0);
}

function updateStats(){
    const active = onlineOrders.filter(order => !order.cancelled);
    let total = 0;
    let delivery = 0;
    let net = 0;

    active.forEach(order => {
        total += Number(order.total) || 0;
        delivery += Number(order.delivery) || 0;
        net += getOrderNet(order);
    });

    document.getElementById("stat-orders").textContent = active.length;
    document.getElementById("stat-total").textContent = money(total);
    document.getElementById("stat-delivery").textContent = money(delivery);
    document.getElementById("stat-net").textContent = money(net);
}

/* ================= RENDER: TRACKING ================= */

function renderTracking(){
    const body = document.getElementById("tracking-body");
    if(!body) return;

    const search = (document.getElementById("track-search")?.value || "").trim().toLowerCase();
    const branchFilter = document.getElementById("track-branch-filter")?.value || "all";
    const followFilter = document.getElementById("track-follow-filter")?.value || "all";
    const statusFilter = document.getElementById("track-status-filter")?.value || "all";

    let filtered = [...onlineOrders];

    if(search){
        filtered = filtered.filter(order =>
            String(order.booking || "").toLowerCase().includes(search) ||
            String(order.phone || "").toLowerCase().includes(search)
        );
    }

    if(branchFilter !== "all"){
        filtered = filtered.filter(order => String(order.branch || "") === branchFilter);
    }

    if(followFilter !== "all"){
        filtered = filtered.filter(order => String(order.followStatus || "جديد") === followFilter);
    }

    if(statusFilter === "active"){
        filtered = filtered.filter(order => !order.cancelled);
    }

    if(statusFilter === "cancelled"){
        filtered = filtered.filter(order => order.cancelled);
    }

    filtered.sort((a, b) => {
        const dateA = getOrderDate(a);
        const dateB = getOrderDate(b);
        const timeA = dateA ? dateA.getTime() : 0;
        const timeB = dateB ? dateB.getTime() : 0;
        return timeB - timeA;
    });

    let totalCount = 0;
    let newCount = 0;
    let progressCount = 0;
    let doneCount = 0;

    onlineOrders.forEach(order => {
        if(order.cancelled) return;
        totalCount++;
        const fs = order.followStatus || "جديد";
        if(fs === "تم التسليم") doneCount++;
        else if(fs === "جديد") newCount++;
        else progressCount++;
    });

    document.getElementById("track-stat-total").textContent = totalCount;
    document.getElementById("track-stat-new").textContent = newCount;
    document.getElementById("track-stat-progress").textContent = progressCount;
    document.getElementById("track-stat-done").textContent = doneCount;

    body.innerHTML = "";

    if(filtered.length === 0){
        body.innerHTML = '<tr><td colspan="10" class="empty">📭 لا توجد أوردرات مطابقة</td></tr>';
    }else{
        filtered.forEach((order, index) => {
            const date = formatDate(getOrderDateValue(order));
            const netValue = getOrderNet(order);
            const branchBadge = order.branch ? '<span class="branch-badge">🏪 ' + escapeHtml(order.branch) + '</span>' : '<span style="color:#64748b">—</span>';
            const phoneCell = order.phone ? '<span class="phone-cell"><a href="tel:' + escapeHtml(order.phone) + '">' + escapeHtml(order.phone) + '</a></span>' : '<span style="color:#64748b">—</span>';
            const specsText = order.specs ? escapeHtml(order.specs) : '<span style="color:#64748b">—</span>';
            const followStatus = order.followStatus || "جديد";

            let followSelect = `<select class="follow-select" onchange="updateFollowStatus('${order.id}', this.value)">`;
            FOLLOW_STATUSES.forEach(st => {
                followSelect += `<option value="${st}" ${st === followStatus ? "selected" : ""}>${followIcon(st)} ${st}</option>`;
            });
            followSelect += '</select>';

            const orderStatus = order.cancelled
            ? '<span class="badge cancelled">❌ ملغي</span>'
            : '<span class="badge active-order">✅ مؤكد</span>';

            body.innerHTML += `
            <tr>
            <td>${index+1}</td>
            <td class="booking">${escapeHtml(order.booking)}</td>
            <td>${phoneCell}</td>
            <td>${branchBadge}</td>
            <td><div class="spec-cell">${specsText}</div></td>
            <td class="net">${money(netValue)}</td>
            <td dir="ltr">${date}</td>
            <td>${followSelect}</td>
            <td>${orderStatus}</td>
            <td>
            <button class="action-btn view" onclick="viewOrderDetails('${order.id}')">عرض</button>
            <button class="action-btn edit" onclick="editOrder('${order.id}')">تعديل</button>
            </td>
            </tr>
            `;
        });
    }

    let visibleCount = filtered.length;
    let visibleProgress = 0;
    let visibleDone = 0;

    filtered.forEach(order => {
        if(order.cancelled) return;
        const fs = order.followStatus || "جديد";
        if(fs === "تم التسليم") visibleDone++;
        else if(fs !== "جديد") visibleProgress++;
    });

    document.getElementById("track-footer-orders").textContent = visibleCount;
    document.getElementById("track-footer-progress").textContent = visibleProgress;
    document.getElementById("track-footer-done").textContent = visibleDone;
}

async function updateFollowStatus(id, value){
    const order = onlineOrders.find(item => item.id === id);
    if(!order) return;

    order.followStatus = value;

    const saved = await saveOrders();

    if(saved){
        renderTracking();
        renderOrders();
    }else{
        renderTracking();
    }
}

/* ================= MONTHLY SALES ================= */

const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function prepareMonthlyYears(){
    const select = document.getElementById("monthly-year");
    if(!select) return;

    const years = new Set();

    onlineOrders.forEach(order => {
        const date = getOrderDate(order);
        if(date) years.add(date.getFullYear());
    });

    const currentYear = new Date().getFullYear();
    years.add(currentYear);

    const sortedYears = [...years].sort((a, b) => b - a);
    const oldValue = select.value;
    select.innerHTML = "";

    sortedYears.forEach(year => {
        const option = document.createElement("option");
        option.value = year;
        option.textContent = year;
        select.appendChild(option);
    });

    if(sortedYears.includes(Number(oldValue))){
        select.value = oldValue;
    }else{
        select.value = currentYear;
    }
}

function renderMonthlySales(){
    const body = document.getElementById("monthly-sales-body");
    const yearSelect = document.getElementById("monthly-year");

    if(!body || !yearSelect) return;

    const selectedYear = Number(yearSelect.value);
    if(!selectedYear) return;

    let yearOrders = 0;
    let yearTotal = 0;
    let yearDelivery = 0;
    let yearNet = 0;
    let rows = "";

    for(let month=0; month<12; month++){
        let orders = 0;
        let total = 0;
        let delivery = 0;
        let net = 0;

        onlineOrders.forEach(order => {
            if(order.cancelled) return;

            const date = getOrderDate(order);
            if(!date) return;
            if(date.getFullYear() !== selectedYear) return;
            if(date.getMonth() !== month) return;

            orders++;
            total += Number(order.total) || 0;
            delivery += Number(order.delivery) || 0;
            net += getOrderNet(order);
        });

        yearOrders += orders;
        yearTotal += total;
        yearDelivery += delivery;
        yearNet += net;

        rows += `
        <tr>
        <td class="${orders > 0 ? "month-name" : "month-zero"}">${monthNames[month]}</td>
        <td class="${orders > 0 ? "month-orders" : "month-zero"}">${orders}</td>
        <td class="${orders > 0 ? "month-total" : "month-zero"}">${money(total)}</td>
        <td class="${orders > 0 ? "month-delivery" : "month-zero"}">${money(delivery)}</td>
        <td class="${orders > 0 ? "month-net" : "month-zero"}">${money(net)}</td>
        </tr>
        `;
    }

    body.innerHTML = rows;
    document.getElementById("year-orders").textContent = yearOrders;
    document.getElementById("year-total").textContent = money(yearTotal);
    document.getElementById("year-delivery").textContent = money(yearDelivery);
    document.getElementById("year-net").textContent = money(yearNet);
}

/* ================= EDIT ================= */

function editOrder(id){
    const order = onlineOrders.find(item => item.id === id);
    if(!order) return;

    editingOrderId = id;

    populateBranchSelects();

    document.getElementById("edit-booking").value = order.booking || "";
    document.getElementById("edit-phone").value = order.phone || "";
    document.getElementById("edit-branch").value = order.branch || (branchesList[0] || "");
    document.getElementById("edit-date").value = normalizeDateTimeLocal(getOrderDateValue(order));
    document.getElementById("edit-total").value = order.total || 0;
    document.getElementById("edit-payment").value = order.payment || "كاش";
    document.getElementById("edit-delivery").value = order.delivery || 0;
    document.getElementById("edit-specs").value = order.specs || "";

    calculateEditNet();
    document.getElementById("edit-modal").classList.add("show");
}

function closeEditModal(){
    editingOrderId = null;
    document.getElementById("edit-modal").classList.remove("show");
}

async function saveEditedOrder(){
    if(!editingOrderId) return;

    const order = onlineOrders.find(item => item.id === editingOrderId);
    if(!order) return;

    const booking = document.getElementById("edit-booking").value.trim();
    const phone = document.getElementById("edit-phone").value.trim();
    const branch = document.getElementById("edit-branch").value;
    const specs = document.getElementById("edit-specs").value.trim();
    const orderDate = document.getElementById("edit-date").value;
    const total = parseFloat(document.getElementById("edit-total").value) || 0;
    const payment = document.getElementById("edit-payment").value;
    const delivery = parseFloat(document.getElementById("edit-delivery").value) || 0;

    if(!booking || !phone || !branch || !orderDate || !payment || total < 0 || delivery < 0){
        alert("من فضلك أكمل البيانات.");
        return;
    }

    if(!/^[0-9+\s-]{8,15}$/.test(phone)){
        alert("من فضلك أدخل رقم هاتف صحيح.");
        return;
    }

    const duplicate = onlineOrders.find(x =>
        x.id !== editingOrderId &&
        String(x.booking) === String(booking)
    );

    if(duplicate){
        alert("رقم الحجز مستخدم بالفعل.");
        return;
    }

    order.booking = booking;
    order.phone = phone;
    order.branch = branch;
    order.specs = specs;
    order.orderDate = orderDate;
    order.payment = payment;
    order.total = total;
    order.delivery = delivery;
    order.net = Math.max(total - delivery, 0);

    const saved = await saveOrders();

    if(saved){
        closeEditModal();
        prepareMonthlyYears();
        populateBranchSelects();
        renderOrders();
        renderTracking();
        renderMonthlySales();
        alert("تم تعديل الأوردر بنجاح ✅");
    }
}

/* ================= DETAILS ================= */

function viewOrderDetails(id){
    const order = onlineOrders.find(item => item.id === id);
    if(!order) return;

    const date = formatDate(getOrderDateValue(order));
    const netValue = getOrderNet(order);
    const followStatus = order.followStatus || "جديد";

    document.getElementById("details-content").innerHTML = `
    <div class="detail-row"><span>🔢 رقم الحجز</span><strong>${escapeHtml(order.booking || "—")}</strong></div>
    <div class="detail-row"><span>📞 رقم الهاتف</span><strong dir="ltr">${escapeHtml(order.phone || "—")}</strong></div>
    <div class="detail-row"><span>📍 المدينة</span><strong>${escapeHtml(order.branch || "—")}</strong></div>
    <div class="detail-row"><span>📅 تاريخ الأوردر</span><strong dir="ltr">${date}</strong></div>
    <div class="detail-row"><span>💰 المبلغ الإجمالي</span><strong>${money(order.total)}</strong></div>
    <div class="detail-row"><span>💳 طريقة الدفع</span><strong>${order.payment === "فيزا" ? "💳 فيزا" : order.payment === "كاش" ? "💵 كاش" : "—"}</strong></div>
    <div class="detail-row"><span>🚚 مبلغ التوصيل</span><strong>${money(order.delivery)}</strong></div>
    <div class="detail-row"><span>💵 الصافي بعد التوصيل</span><strong>${money(netValue)}</strong></div>
    <div class="detail-row"><span>🚦 حالة المتابعة</span><strong><span class="badge ${followBadgeClass(followStatus)}">${followIcon(followStatus)} ${followStatus}</span></strong></div>
    <div class="detail-row"><span>📌 حالة الأوردر</span><strong>${order.cancelled ? '<span class="badge cancelled">❌ ملغي</span>' : '<span class="badge active-order">✅ مؤكد</span>'}</strong></div>
    <div class="detail-row full-row"><span>📝 مواصفات الأوردر</span><div class="spec-text">${order.specs ? escapeHtml(order.specs) : "لا توجد مواصفات مسجلة"}</div></div>
    `;

    document.getElementById("details-modal").classList.add("show");
}

function closeDetailsModal(){
    document.getElementById("details-modal").classList.remove("show");
}

/* ================= CANCEL / RESTORE / DELETE ================= */

async function cancelOrder(id){
    const order = onlineOrders.find(item => item.id === id);
    if(!order) return;

    const confirmCancel = confirm("هل أنت متأكد من إلغاء هذا الأوردر؟\n\nرقم الحجز: " + order.booking);

    if(!confirmCancel) return;

    order.cancelled = true;
    order.cancelledAt = new Date().toISOString();

    const saved = await saveOrders();

    if(saved){
        renderOrders();
        renderTracking();
        renderMonthlySales();
    }
}

async function restoreOrder(id){
    const order = onlineOrders.find(item => item.id === id);
    if(!order) return;

    order.cancelled = false;
    order.cancelledAt = null;

    const saved = await saveOrders();

    if(saved){
        renderOrders();
        renderTracking();
        renderMonthlySales();
    }
}

async function deleteOrder(id){
    const order = onlineOrders.find(item => item.id === id);
    if(!order) return;

    const confirmed = confirm("⚠ هل تريد حذف الأوردر نهائياً؟\n\nرقم الحجز: " + order.booking + "\n\nالحذف النهائي لا يمكن التراجع عنه.");

    if(!confirmed) return;

    onlineOrders = onlineOrders.filter(item => item.id !== id);

    const saved = await saveOrders();

    if(saved){
        prepareMonthlyYears();
        renderOrders();
        renderTracking();
        renderMonthlySales();
    }
}

/* ================= IMPORT ================= */

let importRows = [];
let importHeaders = [];
let importMapping = {};

const IMPORT_FIELDS = [
    {key:"booking", label:"رقم الحجز *"},
    {key:"phone", label:"رقم الهاتف *"},
    {key:"total", label:"المبلغ الإجمالي *"},
    {key:"delivery", label:"مبلغ التوصيل"},
    {key:"payment", label:"طريقة الدفع"},
    {key:"orderDate", label:"تاريخ الأوردر"},
    {key:"cityText", label:"المدينة / العنوان"},
    {key:"specs", label:"مواصفات الأوردر"}
];

const HEADER_KEYWORDS = {
    booking:["حجز","booking","order no","order","رقم"],
    phone:["هاتف","phone","موبايل","mobile","جوال"],
    total:["اجمالي","إجمالي","total","مبلغ","قيمة","مبيعات"],
    delivery:["توصيل","delivery","شحن","shipping"],
    payment:["دفع","payment","كاش","cash","فيزا","visa","card"],
    orderDate:["تاريخ","date","وقت","time"],
    cityText:["مدينه","مدينة","عنوان","address","فرع","branch","منطقه","منطقة"],
    specs:["مواصفات","تفاصيل","details","وصف","منتجات","اصناف","أصناف","صنف","بيان","ملاحظات"]
};

function normalizeHeaderText(value){
    return String(value || "")
    .replace(/[ً-ْٰـ]/g,"")
    .replace(/[^\p{L}\p{N} ]/gu," ")
    .replace(/\s+/g," ")
    .trim()
    .toLowerCase();
}

function guessColumnKey(header){
    const h = normalizeHeaderText(header);
    if(!h) return null;
    for(const field of IMPORT_FIELDS){
        const keywords = HEADER_KEYWORDS[field.key] || [];
        for(const kw of keywords){
            if(h.includes(kw)) return field.key;
        }
    }
    return null;
}

function handleImportFile(event){
    const file = event.target.files[0];
    if(!file) return;

    const reader = new FileReader();
    reader.onload = function(e){
        try{
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type:"array"});
            const sheet = workbook.Sheets[workbook.SheetNames[0]];
            importRows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:"", raw:false});
            prepareImport();
        }catch(err){
            console.error(err);
            alert("تعذر قراءة الملف. تأكد أنه ملف Excel أو CSV صحيح.");
        }
    };
    reader.readAsArrayBuffer(file);
}

function parsePastedText(){
    const text = document.getElementById("import-paste").value.trim();
    if(!text){
        alert("الصق الجدول أولاً في المربع.");
        return;
    }
    try{
        const workbook = XLSX.read(text, {type:"string"});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        importRows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:"", raw:false});
        prepareImport();
    }catch(err){
        console.error(err);
        alert("تعذر تحليل البيانات الملصوقة. جرب نسخها من Excel مرة أخرى.");
    }
}

function prepareImport(){
    importRows = importRows.filter(row => row.some(cell => String(cell).trim() !== ""));

    if(importRows.length < 2){
        alert("لم يتم العثور على بيانات كافية.");
        return;
    }

    importHeaders = importRows[0].map(cell => String(cell).trim());
    importMapping = {};

    importHeaders.forEach((header, index) => {
        if(header === "") return;
        const key = guessColumnKey(header);
        if(key && importMapping[key] === undefined){
            importMapping[key] = index;
        }
    });

    if(importMapping.booking === undefined) importMapping.booking = 0;
    if(importMapping.phone === undefined && importHeaders.length > 1) importMapping.phone = 1;
    if(importMapping.total === undefined && importHeaders.length > 2) importMapping.total = 2;

    const defaultCitySelect = document.getElementById("import-city-default");
    defaultCitySelect.innerHTML = '<option value="">بدون مدينة افتراضية</option>';
    branchesList.forEach(city => {
        const option = document.createElement("option");
        option.value = city;
        option.textContent = "📍 " + city + " (افتراضي)";
        defaultCitySelect.appendChild(option);
    });

    renderMappingGrid();
    renderImportPreview();
    document.getElementById("import-preview-card").style.display = "block";
    document.getElementById("import-preview-card").scrollIntoView({behavior:"smooth", block:"start"});
}

function renderMappingGrid(){
    const grid = document.getElementById("mapping-grid");
    grid.innerHTML = "";

    IMPORT_FIELDS.forEach(field => {
        const item = document.createElement("div");
        item.className = "mapping-item";

        let options = '<option value="">— بدون —</option>';
        importHeaders.forEach((header, index) => {
            const selected = importMapping[field.key] === index ? "selected" : "";
            options += `<option value="${index}" ${selected}>${escapeHtml(header || ("عمود "+(index+1)))}</option>`;
        });

        item.innerHTML = `<label>${field.label}</label><select onchange="setImportMapping('${field.key}', this.value)">${options}</select>`;
        grid.appendChild(item);
    });
}

function setImportMapping(key, value){
    if(value === ""){
        delete importMapping[key];
    }else{
        importMapping[key] = Number(value);
    }
    renderImportPreview();
}

function getRowValue(row, key){
    const index = importMapping[key];
    if(index === undefined || index === null) return "";
    return row[index] !== undefined ? String(row[index]).trim() : "";
}

function parseNumberValue(value){
    if(value === null || value === undefined) return 0;
    const clean = String(value).replace(/[,EGPegpجنيه]/g,"").replace(/[^0-9.\-]/g,"");
    const num = parseFloat(clean);
    return isNaN(num) ? 0 : num;
}

function parseAnyDate(value){
    if(!value) return null;
    if(value instanceof Date){
        return isNaN(value.getTime()) ? null : value;
    }
    const s = String(value).trim();
    if(/^[0-9]+(\.[0-9]+)?$/.test(s)){
        const serial = Number(s);
        if(serial > 20000 && serial < 100000){
            const date = new Date(Math.round((serial - 25569) * 86400 * 1000));
            return isNaN(date.getTime()) ? null : date;
        }
    }
    const date = new Date(s);
    return isNaN(date.getTime()) ? null : date;
}

function autoDetectCity(text){
    if(!text) return "";
    const t = String(text).toLowerCase();
    for(const city of branchesList){
        if(t.includes(String(city).toLowerCase())) return city;
    }
    return "";
}

function hasHeadersRow(){
    const checkbox = document.getElementById("import-has-headers");
    return checkbox ? checkbox.checked : true;
}

function renderImportPreview(){
    const head = document.getElementById("import-preview-head");
    const body = document.getElementById("import-preview-body");
    if(!importRows.length) return;

    const startRow = hasHeadersRow() ? 1 : 0;

    head.innerHTML = "<tr><th>#</th><th>رقم الحجز</th><th>الهاتف</th><th>المدينة المكتشفة</th><th>المبلغ</th><th>التوصيل</th><th>التاريخ</th><th>الحالة</th></tr>";
    body.innerHTML = "";

    const existingBookings = new Set(onlineOrders.map(o => String(o.booking).trim()));
    let shown = 0;
    let newCount = 0;
    let dupCount = 0;

    for(let i = startRow; i < importRows.length && shown < 50; i++){
        const row = importRows[i];
        const booking = getRowValue(row, "booking");
        if(!booking) continue;

        shown++;
        const city = autoDetectCity(getRowValue(row, "cityText") + " " + getRowValue(row, "specs"));
        const total = parseNumberValue(getRowValue(row, "total"));
        const delivery = parseNumberValue(getRowValue(row, "delivery"));
        const date = parseAnyDate(getRowValue(row, "orderDate"));

        let status;
        if(existingBookings.has(booking)){
            status = '<span class="badge cancelled">مكرر - سيتم تخطيه</span>';
            dupCount++;
        }else{
            status = '<span class="badge active-order">جديد</span>';
            newCount++;
        }

        body.innerHTML += `<tr>
        <td>${shown}</td>
        <td class="booking">${escapeHtml(booking)}</td>
        <td><span class="phone-cell">${escapeHtml(getRowValue(row, "phone"))}</span></td>
        <td>${city ? '<span class="city-detected">📍 '+escapeHtml(city)+'</span>' : '<span class="city-missing">غير محدد</span>'}</td>
        <td class="amount">${money(total)}</td>
        <td class="delivery">${money(delivery)}</td>
        <td dir="ltr">${date ? formatDate(date.toISOString()) : "—"}</td>
        <td>${status}</td>
        </tr>`;
    }

    const totalRows = importRows.length - startRow;
    document.getElementById("import-summary").innerHTML =
    "إجمالي الصفوف: <strong style='color:#fbbf24'>" + Math.max(totalRows, 0) + "</strong> &nbsp;|&nbsp; " +
    "جديد: <strong style='color:#4ade80'>" + newCount + "</strong> &nbsp;|&nbsp; " +
    "مكرر: <strong style='color:#f87171'>" + dupCount + "</strong>" +
    (shown < Math.max(totalRows, 0) ? " &nbsp;(معاينة أول " + shown + " صف فقط)" : "");
}

async function runImport(){
    if(!importRows.length){
        alert("قم بتحميل ملف أو لصق بيانات أولاً.");
        return;
    }

    if(importMapping.booking === undefined || importMapping.total === undefined){
        alert("يجب تحديد عمود رقم الحجز وعمود المبلغ الإجمالي على الأقل.");
        return;
    }

    const startRow = hasHeadersRow() ? 1 : 0;
    const existingBookings = new Set(onlineOrders.map(o => String(o.booking).trim()));
    const batchBookings = new Set();
    const defaultCity = document.getElementById("import-city-default").value;

    let addedCount = 0;
    let skippedCount = 0;

    for(let i = startRow; i < importRows.length; i++){
        const row = importRows[i];
        const booking = getRowValue(row, "booking");
        if(!booking) continue;

        if(existingBookings.has(booking) || batchBookings.has(booking)){
            skippedCount++;
            continue;
        }

        batchBookings.add(booking);

        const phone = getRowValue(row, "phone") || "01000000000";
        const total = parseNumberValue(getRowValue(row, "total"));
        const delivery = parseNumberValue(getRowValue(row, "delivery"));
        const paymentInput = getRowValue(row, "payment").toLowerCase();
        const payment = paymentInput.includes("فيزا") || paymentInput.includes("visa") ? "فيزا" : "كاش";
        const specs = getRowValue(row, "specs");
        const dateObj = parseAnyDate(getRowValue(row, "orderDate")) || new Date();

        let city = autoDetectCity(getRowValue(row, "cityText") + " " + specs);
        if(!city) city = defaultCity || branchesList[0] || "دمياط";

        const order = {
            id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 8) + "_" + i,
            booking: booking,
            phone: phone,
            branch: city,
            specs: specs,
            payment: payment,
            total: total,
            delivery: delivery,
            net: Math.max(total - delivery, 0),
            cancelled: false,
            followStatus: "جديد",
            orderDate: toDateTimeLocal(dateObj),
            createdAt: new Date().toISOString(),
            createdTimestamp: Date.now()
        };

        onlineOrders.unshift(order);
        addedCount++;
    }

    if(addedCount > 0){
        const saved = await saveOrders();
        if(saved){
            prepareMonthlyYears();
            renderOrders();
            renderTracking();
            renderMonthlySales();
            document.getElementById("import-preview-card").style.display = "none";
            importRows = [];
            document.getElementById("import-paste").value = "";
            document.getElementById("import-file").value = "";
            alert(`تم استيراد ${addedCount} أوردر بنجاح ✅\n(تم تخطي ${skippedCount} أوردر مكرر)`);
            switchTab("orders");
        }
    }else{
        alert("لم يتم إضافة أي أوردر جديد (جميع الأوردرات مكررة أو غير صالحة).");
    }
}
