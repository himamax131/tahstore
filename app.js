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
    if(tab === "import"){
        if(importMode === "report" && reportOrders.length) renderReportPreview();
        else if(typeof importRows !== 'undefined' && importRows.length) renderImportPreview();
        loadGsheetSettings();
        const autosync = document.getElementById("gsheet-autosync");
        const url = document.getElementById("gsheet-url");
        if(autosync && autosync.checked && url && url.value.trim()){
            syncFromGoogleSheet(true);
        }
    }
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

function toDateTimeLocal(dateObj){
    if(!(dateObj instanceof Date) || isNaN(dateObj.getTime())) return getCurrentDateTimeLocal();
    const offset = dateObj.getTimezoneOffset();
    const localDate = new Date(dateObj.getTime() - offset * 60000);
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
    const customer = document.getElementById("customer-name").value.trim();
    const address = document.getElementById("order-address").value.trim();
    const branch = document.getElementById("order-branch").value;
    const specs = document.getElementById("order-specs").value.trim();
    const orderDate = document.getElementById("order-date").value;
    const total = parseFloat(document.getElementById("total-amount").value) || 0;
    const payment = document.getElementById("payment-method").value;
    const delivery = parseFloat(document.getElementById("delivery-price").value) || 0;

    if(!booking || !branch || !orderDate || !payment || total < 0 || delivery < 0){
        alert("من فضلك أكمل بيانات الأوردر (رقم الحجز، المركز، التاريخ، المبلغ، طريقة الدفع إلزامية).");
        return;
    }

    if(phone && !/^[0-9+\s\/-]{8,30}$/.test(phone)){
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
        customer: customer,
        address: address,
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
        body.innerHTML = '<tr><td colspan="12" class="empty">📭 لا توجد أوردرات مطابقة للبحث</td></tr>';
    }else{
        filtered.forEach((order, index) => {
            const date = formatDate(getOrderDateValue(order));
            const netValue = getOrderNet(order);
            const branchBadge = order.branch ? '<span class="branch-badge">🏪 ' + escapeHtml(order.branch) + '</span>' : '<span style="color:#64748b">—</span>';
            const phoneCell = order.phone ? '<span class="phone-cell"><a href="tel:' + escapeHtml(order.phone) + '">' + escapeHtml(order.phone) + '</a></span>' : '<span style="color:#64748b">—</span>';
            const customerCell = order.customer ? escapeHtml(order.customer) : '<span style="color:#64748b">—</span>';

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
            <td>${customerCell}</td>
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
    let cashTotal = 0;
    let visaTotal = 0;

    active.forEach(order => {
        total += Number(order.total) || 0;
        delivery += Number(order.delivery) || 0;
        net += getOrderNet(order);
        if(order.payment === "فيزا") visaTotal += Number(order.total) || 0;
        else cashTotal += Number(order.total) || 0;
    });

    document.getElementById("stat-orders").textContent = active.length;
    document.getElementById("stat-total").textContent = money(total);
    document.getElementById("stat-cash").textContent = money(cashTotal);
    document.getElementById("stat-visa").textContent = money(visaTotal);
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
        body.innerHTML = '<tr><td colspan="12" class="empty">📭 لا توجد أوردرات مطابقة</td></tr>';
    }else{
        filtered.forEach((order, index) => {
            const date = formatDate(getOrderDateValue(order));
            const netValue = getOrderNet(order);
            const branchBadge = order.branch ? '<span class="branch-badge">🏪 ' + escapeHtml(order.branch) + '</span>' : '<span style="color:#64748b">—</span>';
            const phoneCell = order.phone ? '<span class="phone-cell"><a href="tel:' + escapeHtml(order.phone) + '">' + escapeHtml(order.phone) + '</a></span>' : '<span style="color:#64748b">—</span>';
            const customerCell = order.customer ? escapeHtml(order.customer) : '<span style="color:#64748b">—</span>';
            const addressText = order.address ? escapeHtml(order.address) : '<span style="color:#64748b">—</span>';
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
            <td>${customerCell}</td>
            <td>${phoneCell}</td>
            <td>${branchBadge}</td>
            <td><div class="spec-cell" title="${order.address ? escapeHtml(order.address) : ''}">${addressText}</div></td>
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
    document.getElementById("edit-customer").value = order.customer || "";
    document.getElementById("edit-address").value = order.address || "";
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
    const customer = document.getElementById("edit-customer").value.trim();
    const address = document.getElementById("edit-address").value.trim();
    const branch = document.getElementById("edit-branch").value;
    const specs = document.getElementById("edit-specs").value.trim();
    const orderDate = document.getElementById("edit-date").value;
    const total = parseFloat(document.getElementById("edit-total").value) || 0;
    const payment = document.getElementById("edit-payment").value;
    const delivery = parseFloat(document.getElementById("edit-delivery").value) || 0;

    if(!booking || !branch || !orderDate || !payment || total < 0 || delivery < 0){
        alert("من فضلك أكمل البيانات (رقم الحجز، المركز، التاريخ، المبلغ، طريقة الدفع إلزامية).");
        return;
    }

    if(phone && !/^[0-9+\s\/-]{8,30}$/.test(phone)){
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
    order.customer = customer;
    order.address = address;
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
    <div class="detail-row"><span>👤 اسم العميل</span><strong>${escapeHtml(order.customer || "—")}</strong></div>
    <div class="detail-row"><span>📞 رقم الهاتف</span><strong dir="ltr">${escapeHtml(order.phone || "—")}</strong></div>
    <div class="detail-row"><span>📍 المدينة</span><strong>${escapeHtml(order.branch || "—")}</strong></div>
    <div class="detail-row"><span>📅 تاريخ الأوردر</span><strong dir="ltr">${date}</strong></div>
    <div class="detail-row"><span>💰 المبلغ الإجمالي</span><strong>${money(order.total)}</strong></div>
    <div class="detail-row"><span>💳 طريقة الدفع</span><strong>${order.payment === "فيزا" ? "💳 فيزا" : order.payment === "كاش" ? "💵 كاش" : "—"}</strong></div>
    <div class="detail-row"><span>🚚 مبلغ التوصيل</span><strong>${money(order.delivery)}</strong></div>
    <div class="detail-row"><span>💵 الصافي بعد التوصيل</span><strong>${money(netValue)}</strong></div>
    <div class="detail-row"><span>🚦 حالة المتابعة</span><strong><span class="badge ${followBadgeClass(followStatus)}">${followIcon(followStatus)} ${followStatus}</span></strong></div>
    <div class="detail-row"><span>📌 حالة الأوردر</span><strong>${order.cancelled ? '<span class="badge cancelled">❌ ملغي</span>' : '<span class="badge active-order">✅ مؤكد</span>'}</strong></div>
    <div class="detail-row full-row"><span>🏠 العنوان بالتفصيل</span><div class="spec-text">${order.address ? escapeHtml(order.address) : "لا يوجد عنوان مسجل"}</div></div>
    <div class="detail-row full-row"><span>📝 اسم الصنف / مواصفات الأوردر</span><div class="spec-text">${order.specs ? escapeHtml(order.specs) : "لا توجد مواصفات مسجلة"}</div></div>
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
let importMode = "table"; // "table" (normal spreadsheet) | "report" (تقرير حجوزات)
let reportOrders = [];

const IMPORT_FIELDS = [
    {key:"cityText", label:"المنطقة / المدينة"},
    {key:"booking", label:"رقم الحجز *"},
    {key:"phone", label:"رقم الهاتف"},
    {key:"address", label:"العنوان"},
    {key:"total", label:"المبلغ الإجمالي *"},
    {key:"delivery", label:"مبلغ التوصيل"},
    {key:"payment", label:"طريقة الدفع"},
    {key:"orderDate", label:"تاريخ الأوردر"},
    {key:"specs", label:"اسم الصنف / مواصفات الأوردر"},
    {key:"customerName", label:"اسم العميل"}
];

const HEADER_KEYWORDS = {
    booking:["حجز","booking","order no","order","رقم"],
    phone:["هاتف","phone","موبايل","mobile","جوال"],
    total:["اجمالي","إجمالي","total","قيمة","مبيعات"],
    delivery:["توصيل","delivery","شحن","shipping"],
    payment:["دفع","payment","كاش","cash","فيزا","visa","card"],
    orderDate:["تاريخ","date","وقت","time"],
    cityText:["مدينه","مدينة","فرع","branch","منطقه","منطقة"],
    address:["عنوان","address"],
    specs:["مواصفات","تفاصيل","details","وصف","منتجات","اصناف","أصناف","صنف","بيان","ملاحظات"],
    customerName:["اسم العميل","العميل","customer","اسم الزبون","الزبون"]
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

/* ================= REPORT-STYLE IMPORT (تقرير بالحجوزات) ================= */
/*
   بعض شيتات الحجوزات المُصدَّرة من برنامج الكاشير/المحاسبة بتبقى "تقرير"
   مش جدول عادي: كل صف فيه عشرات الخانات (تاريخ التقرير، بيانات الحجز،
   بيانات الصنف، إجماليات اليوم...) بدل عمود واحد لكل بيانة. الكود ده
   بيكتشف الشكل ده تلقائياً وبيسحب منه: رقم الحجز، اسم العميل، الهاتف،
   المدينة، العنوان، الصنف والكمية والسعر، مصاريف الشحن، والإجمالي —
   وبيبني منها "مواصفات الأوردر" بتنسيق كبير ومنظم بدل ما تتلخبط في خانة واحدة.
*/

const CITY_ALIASES = {
    "mansoura":"المنصورة", "el mansoura":"المنصورة", "almansoura":"المنصورة", "al mansoura":"المنصورة",
    "damietta":"دمياط", "dumyat":"دمياط", "dumiat":"دمياط", "damyat":"دمياط",
    "ras el bar":"رأس البر", "ras al bar":"رأس البر", "raselbar":"رأس البر",
    "gamsa":"جمصة", "gamasa":"جمصة",
    "port said":"بورسعيد", "portsaid":"بورسعيد",
    "talkha":"طلخا",
    "nabaroh":"نبروه", "nabarouh":"نبروه", "nabarwa":"نبروه"
};

function findExactIndex(row, needle, fromIndex){
    const start = fromIndex || 0;
    for(let i = start; i < row.length; i++){
        if(String(row[i] ?? "").trim() === needle) return i;
    }
    return -1;
}

function findIncludesIndex(row, needle, fromIndex){
    const start = fromIndex || 0;
    for(let i = start; i < row.length; i++){
        if(String(row[i] ?? "").trim().includes(needle)) return i;
    }
    return -1;
}

function normalizeCityToken(text){
    if(!text) return "";
    const t = String(text).trim();
    if(!t) return "";
    const lower = t.toLowerCase();
    if(CITY_ALIASES[lower]) return CITY_ALIASES[lower];
    const noSpace = t.replace(/\s+/g, "");
    for(const city of branchesList){
        if(String(city).replace(/\s+/g, "") === noSpace) return city;
    }
    return "";
}

function detectCityFromTokens(tokens){
    for(const tok of tokens){
        const hit = normalizeCityToken(tok);
        if(hit) return hit;
    }
    return autoDetectCity(tokens.filter(Boolean).join(" "));
}

const REPORT_DATE_REGEX = /^\d{1,2}\/\d{1,2}\/\d{4}\s+\d{1,2}:\d{2}:\d{2}\s*(AM|PM)$/i;

function findReportOrderDate(row){
    for(const cell of row){
        const s = String(cell ?? "").trim();
        if(REPORT_DATE_REGEX.test(s)) return parseAnyDate(s);
    }
    return null;
}

// يحاول يستخرج بيانات حجز واحد من صف "تقرير الحجوزات". يرجع null لو الصف مش من النوع ده.
function parseBookingsReportRow(row){
    if(!Array.isArray(row) || row.length < 25) return null;

    const bookingLabelIdx = findExactIndex(row, "رقم الحجز");
    if(bookingLabelIdx < 1) return null;
    const booking = String(row[bookingLabelIdx - 1] ?? "").replace(/,/g, "").trim();
    if(!booking) return null;

    const customerLabelIdx = findExactIndex(row, "/ العميل", bookingLabelIdx);
    if(customerLabelIdx < 2) return null;

    const name = String(row[customerLabelIdx - 1] ?? "").trim();
    const phone = String(row[customerLabelIdx - 2] ?? "").replace(/\D/g, "").trim();

    const city1 = row[customerLabelIdx + 1];
    const city2 = row[customerLabelIdx + 2];
    const city3 = row[customerLabelIdx + 3];
    const address = String(row[customerLabelIdx + 4] ?? "").trim();
    const rep = String(row[customerLabelIdx + 6] ?? "").replace(/\s+/g, " ").trim();

    const city = detectCityFromTokens([city3, city1, city2, address]);

    let itemName = "", qty = "", price = "";
    const itemLabelIdx = findExactIndex(row, "الصنف", customerLabelIdx);
    if(itemLabelIdx > -1){
        itemName = String(row[itemLabelIdx + 6] ?? "").trim();
        qty = row[itemLabelIdx + 5];
        price = row[itemLabelIdx + 3];
    }

    const anchorForTotals = itemLabelIdx > -1 ? itemLabelIdx : customerLabelIdx;
    const shipIdx = findIncludesIndex(row, "مصاريف الشحن", anchorForTotals);
    const delivery = shipIdx > 0 ? parseNumberValue(row[shipIdx - 1]) : 0;

    const totalIdx = findIncludesIndex(row, "الإجمالى", shipIdx > -1 ? shipIdx : anchorForTotals);
    const qtyNum = parseNumberValue(qty);
    const priceNum = parseNumberValue(price);
    const total = totalIdx > 0 ? parseNumberValue(row[totalIdx - 1]) : (qtyNum * priceNum);

    const orderDate = findReportOrderDate(row) || new Date();

    return {
        booking, phone, name, city, address, rep,
        itemName, qty: qtyNum, price: priceNum,
        delivery, total, orderDate
    };
}

// بيفحص أول شوية صفوف يشوف لو ده شكل "تقرير حجوزات" ولا شيت عادي بعناوين أعمدة.
function detectReportMode(rows){
    const sample = rows.slice(0, Math.min(rows.length, 15));
    if(!sample.length) return false;
    let hits = 0;
    sample.forEach(row => {
        if(findExactIndex(row, "رقم الحجز") > -1 && findExactIndex(row, "/ العميل") > -1){
            hits++;
        }
    });
    return (hits / sample.length) >= 0.5;
}

// نفس رقم الحجز ممكن يتكرر في أكتر من صف لو الأوردر فيه أكتر من صنف
// (كل صنف بياخد صف كامل لكنه بيكرر بيانات العميل والإجمالي). الدالة دي
// بتجمع كل الأصناف اللي ليها نفس رقم الحجز في أوردر واحد بدل ما تتكرر.
function groupReportLines(lines){
    const map = new Map();
    const ordered = [];

    lines.forEach(line => {
        let group = map.get(line.booking);
        if(!group){
            group = {
                booking: line.booking,
                phone: line.phone,
                name: line.name,
                city: line.city,
                address: line.address,
                rep: line.rep,
                orderDate: line.orderDate,
                delivery: line.delivery,
                total: line.total,
                items: []
            };
            map.set(line.booking, group);
            ordered.push(group);
        }else{
            if(!group.city && line.city) group.city = line.city;
            if(!group.address && line.address) group.address = line.address;
            if(!group.phone && line.phone) group.phone = line.phone;
        }
        if(line.itemName){
            group.items.push({name: line.itemName, qty: line.qty, price: line.price});
        }
    });

    return ordered;
}

function startReportModeImport(){
    importMode = "report";

    const parsedLines = [];
    importRows.forEach(row => {
        const parsed = parseBookingsReportRow(row);
        if(parsed && parsed.booking) parsedLines.push(parsed);
    });

    reportOrders = groupReportLines(parsedLines);

    const existingBookings = new Set(onlineOrders.map(o => String(o.booking).trim()));
    reportOrders.forEach(o => { o.isDuplicate = existingBookings.has(o.booking); });

    const headersRow = document.getElementById("import-headers-row");
    if(headersRow) headersRow.style.display = "none";

    document.getElementById("mapping-grid").innerHTML =
        '<div class="import-hint" style="grid-column:1/-1;margin:0">📄 تم التعرف تلقائياً على أن هذا "تقرير حجوزات" — تم استخراج بيانات كل حجز (العميل، الهاتف، المدينة، الصنف، الإجمالي، التوصيل) تلقائياً بدون الحاجة لمطابقة الأعمدة يدوياً. مواصفات كل أوردر هتتضاف بشكل منظم يشمل اسم العميل والعنوان والصنف.</div>';

    const defaultCitySelect = document.getElementById("import-city-default");
    defaultCitySelect.innerHTML = '<option value="">بدون مدينة افتراضية</option>';
    branchesList.forEach(city => {
        const option = document.createElement("option");
        option.value = city;
        option.textContent = "📍 " + city + " (افتراضي)";
        defaultCitySelect.appendChild(option);
    });

    renderReportPreview();
    document.getElementById("import-preview-card").style.display = "block";
    document.getElementById("import-preview-card").scrollIntoView({behavior:"smooth", block:"start"});
}

function renderReportPreview(){
    const head = document.getElementById("import-preview-head");
    const body = document.getElementById("import-preview-body");

    head.innerHTML = "<tr><th>#</th><th>رقم الحجز</th><th>العميل</th><th>الهاتف</th><th>المدينة</th><th>الأصناف</th><th>الإجمالي</th><th>التوصيل</th><th>التاريخ</th><th>الحالة</th></tr>";
    body.innerHTML = "";

    if(!reportOrders.length){
        body.innerHTML = '<tr><td colspan="10" class="empty">📭 لم يتم العثور على حجوزات صالحة في الملف</td></tr>';
        document.getElementById("import-summary").innerHTML = "";
        return;
    }

    const shown = Math.min(reportOrders.length, 50);
    let totalNew = 0, totalDup = 0;

    reportOrders.forEach(o => { if(o.isDuplicate) totalDup++; else totalNew++; });

    for(let i = 0; i < shown; i++){
        const o = reportOrders[i];
        const status = o.isDuplicate
            ? '<span class="badge cancelled">مكرر - سيتم تخطيه</span>'
            : '<span class="badge active-order">جديد</span>';

        let itemsCell = "—";
        if(o.items && o.items.length){
            itemsCell = escapeHtml(o.items[0].name);
            if(o.items.length > 1){
                itemsCell += ' <span style="opacity:.7">+' + (o.items.length - 1) + ' صنف آخر</span>';
            }
        }

        body.innerHTML += `<tr>
        <td>${i+1}</td>
        <td class="booking">${escapeHtml(o.booking)}</td>
        <td>${escapeHtml(o.name || "—")}</td>
        <td><span class="phone-cell">${escapeHtml(o.phone || "—")}</span></td>
        <td>${o.city ? '<span class="city-detected">📍 '+escapeHtml(o.city)+'</span>' : '<span class="city-missing">غير محدد</span>'}</td>
        <td>${itemsCell}</td>
        <td class="amount">${money(o.total)}</td>
        <td class="delivery">${money(o.delivery)}</td>
        <td dir="ltr">${o.orderDate ? formatDate(o.orderDate.toISOString()) : "—"}</td>
        <td>${status}</td>
        </tr>`;
    }

    document.getElementById("import-summary").innerHTML =
        "إجمالي الحجوزات المكتشفة: <strong style='color:#fbbf24'>" + reportOrders.length + "</strong> &nbsp;|&nbsp; " +
        "جديد: <strong style='color:#4ade80'>" + totalNew + "</strong> &nbsp;|&nbsp; " +
        "مكرر: <strong style='color:#f87171'>" + totalDup + "</strong>" +
        (shown < reportOrders.length ? " &nbsp;(معاينة أول " + shown + " فقط)" : "");
}

async function runReportImport(){
    if(!reportOrders.length){
        alert("لم يتم العثور على حجوزات صالحة في الملف.");
        return;
    }

    const defaultCity = document.getElementById("import-city-default").value;
    let addedCount = 0;
    let skippedCount = 0;

    reportOrders.forEach((o, i) => {
        if(o.isDuplicate){
            skippedCount++;
            return;
        }

        const city = o.city || defaultCity || branchesList[0] || "دمياط";

        const specsLines = [];
        if(o.items && o.items.length){
            specsLines.push("📦 الأصناف:");
            o.items.forEach(item => {
                let line = "  • " + item.name;
                const extras = [];
                if(item.qty) extras.push("الكمية: " + item.qty);
                if(item.price) extras.push("السعر: " + money(item.price));
                if(extras.length) line += " (" + extras.join("، ") + ")";
                specsLines.push(line);
            });
        }
        if(o.rep) specsLines.push("🧑‍💼 المندوب: " + o.rep);

        const order = {
            id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 8) + "_" + i,
            booking: o.booking,
            phone: o.phone || "",
            customer: o.name || "",
            address: o.address || "",
            branch: city,
            specs: specsLines.join("\n"),
            payment: detectImportPayment("", o.address),
            total: o.total,
            delivery: o.delivery,
            net: Math.max(o.total - o.delivery, 0),
            cancelled: false,
            followStatus: "جديد",
            orderDate: toDateTimeLocal(o.orderDate),
            createdAt: new Date().toISOString(),
            createdTimestamp: Date.now()
        };

        onlineOrders.unshift(order);
        addedCount++;
    });

    if(addedCount > 0){
        const saved = await saveOrders();
        if(saved){
            prepareMonthlyYears();
            renderOrders();
            renderTracking();
            renderMonthlySales();
            resetImportState();
            alert(`تم استيراد ${addedCount} أوردر بنجاح ✅\n(تم تخطي ${skippedCount} أوردر مكرر)`);
            switchTab("orders");
        }
    }else{
        alert("لم يتم إضافة أي أوردر جديد (جميع الحجوزات مكررة).");
    }
}

function resetImportState(){
    document.getElementById("import-preview-card").style.display = "none";
    importRows = [];
    reportOrders = [];
    importMode = "table";
    const headersRow = document.getElementById("import-headers-row");
    if(headersRow) headersRow.style.display = "";
    document.getElementById("import-paste").value = "";
    document.getElementById("import-file").value = "";
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

/* ================= GOOGLE SHEET SYNC ================= */

const GSHEET_SETTINGS_KEY = "tahstore_gsheet_settings";

function extractSheetIdAndGid(url){
    if(!url) return null;
    const idMatch = url.match(/\/d\/([a-zA-Z0-9-_]+)/);
    if(!idMatch) return null;
    const gidMatch = url.match(/[?#&]gid=(\d+)/);
    return { id: idMatch[1], gid: gidMatch ? gidMatch[1] : "0" };
}

function buildCsvExportUrl(id, gid){
    return `https://docs.google.com/spreadsheets/d/${id}/export?format=csv&gid=${gid}`;
}

function saveGsheetSettings(){
    const url = document.getElementById("gsheet-url").value.trim();
    const autosync = document.getElementById("gsheet-autosync").checked;
    try{
        localStorage.setItem(GSHEET_SETTINGS_KEY, JSON.stringify({url, autosync}));
    }catch(err){
        console.warn("تعذر حفظ إعدادات المزامنة محلياً", err);
    }
}

function loadGsheetSettings(){
    try{
        const raw = localStorage.getItem(GSHEET_SETTINGS_KEY);
        if(!raw) return;
        const settings = JSON.parse(raw);
        const urlInput = document.getElementById("gsheet-url");
        const autosyncInput = document.getElementById("gsheet-autosync");
        if(urlInput && settings.url && !urlInput.value) urlInput.value = settings.url;
        if(autosyncInput) autosyncInput.checked = !!settings.autosync;
    }catch(err){
        console.warn("تعذر تحميل إعدادات المزامنة", err);
    }
}

async function syncFromGoogleSheet(silent){
    const urlInput = document.getElementById("gsheet-url");
    const statusBox = document.getElementById("gsheet-status");
    const url = urlInput.value.trim();

    if(!url){
        if(!silent) alert("الصق رابط شيت جوجل أولاً.");
        return;
    }

    const parsed = extractSheetIdAndGid(url);
    if(!parsed){
        statusBox.textContent = "❌ الرابط مش شكله رابط جوجل شيت صحيح.";
        statusBox.style.color = "#ef4444";
        return;
    }

    saveGsheetSettings();

    const csvUrl = buildCsvExportUrl(parsed.id, parsed.gid);
    statusBox.textContent = "⏳ جاري السحب من جوجل شيت...";
    statusBox.style.color = "";

    try{
        const response = await fetch(csvUrl);
        if(!response.ok) throw new Error("HTTP " + response.status);
        const csvText = await response.text();

        if(csvText.trim().startsWith("<") || csvText.includes("<!DOCTYPE html")){
            throw new Error("NOT_PUBLIC");
        }

        const workbook = XLSX.read(csvText, {type:"string"});
        const sheet = workbook.Sheets[workbook.SheetNames[0]];
        importRows = XLSX.utils.sheet_to_json(sheet, {header:1, defval:"", raw:false});
        prepareImport();

        const now = new Date();
        statusBox.textContent = "✅ تمت المزامنة بنجاح - آخر تحديث: " + now.toLocaleString("ar-EG");
        statusBox.style.color = "#16a34a";
    }catch(err){
        console.error(err);
        if(String(err.message).includes("NOT_PUBLIC")){
            statusBox.textContent = "❌ الشيت مش متاح للعرض العام. من جوجل شيت: مشاركة ← Anyone with the link ← Viewer، وجرب تاني.";
        }else{
            statusBox.textContent = "❌ تعذرت المزامنة (مشكلة اتصال أو صلاحيات). جرب تتأكد من مشاركة الشيت أو جرب تاني بعد شوية.";
        }
        statusBox.style.color = "#ef4444";
    }
}

function prepareImport(){
    importRows = importRows.filter(row => row.some(cell => String(cell).trim() !== ""));

    if(importRows.length < 1){
        alert("لم يتم العثور على بيانات كافية.");
        return;
    }

    if(detectReportMode(importRows)){
        startReportModeImport();
        return;
    }

    importMode = "table";
    const headersRowEl = document.getElementById("import-headers-row");
    if(headersRowEl) headersRowEl.style.display = "";

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

// بيحاول يحدد مدينة الأوردر من عمود "المنطقة/المدينة" أو من العنوان/المواصفات.
// لو المدينة المكتشفة مش موجودة في قائمة المراكز الحالية، بيرجعها زي ما هي
// عشان تتضاف تلقائياً كمركز جديد بدل ما الأوردر يضيع بدون مدينة صحيحة.
function resolveImportCity(cityRaw, extraText){
    const known = autoDetectCity((cityRaw || "") + " " + (extraText || ""));
    if(known) return known;
    let raw = String(cityRaw || "").trim();
    // شيل كلمة "وقُراها" ونحوها من آخر اسم المنطقة عشان اسم المركز الجديد يطلع نضيف
    raw = raw.replace(/[ً-ْٰ]/g, "").replace(/\s*(و\s*قراها)\s*$/, "").trim();
    return raw;
}

function detectImportPayment(paymentRaw, extraText){
    const t = (String(paymentRaw || "") + " " + String(extraText || "")).toLowerCase();
    return (t.includes("فيزا") || t.includes("visa")) ? "فيزا" : "كاش";
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

    head.innerHTML = "<tr><th>#</th><th>رقم الحجز</th><th>العميل</th><th>الهاتف</th><th>المدينة</th><th>العنوان</th><th>المبلغ</th><th>التوصيل</th><th>التاريخ</th><th>الحالة</th></tr>";
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
        const cityRaw = getRowValue(row, "cityText");
        const address = getRowValue(row, "address");
        const city = resolveImportCity(cityRaw, address + " " + getRowValue(row, "specs"));
        const isNewCity = city && !branchesList.includes(city);
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
        <td>${escapeHtml(getRowValue(row, "customerName")) || "—"}</td>
        <td><span class="phone-cell">${escapeHtml(getRowValue(row, "phone"))}</span></td>
        <td>${city ? '<span class="city-detected">📍 '+escapeHtml(city)+(isNewCity ? " 🆕" : "")+'</span>' : '<span class="city-missing">غير محدد</span>'}</td>
        <td><div class="spec-cell" title="${escapeHtml(address)}">${escapeHtml(address) || "—"}</div></td>
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
    if(importMode === "report"){
        await runReportImport();
        return;
    }

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
    const newCitiesAdded = new Set();

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

        const phone = getRowValue(row, "phone");
        const customer = getRowValue(row, "customerName");
        const address = getRowValue(row, "address");
        const total = parseNumberValue(getRowValue(row, "total"));
        const delivery = parseNumberValue(getRowValue(row, "delivery"));
        const specs = getRowValue(row, "specs");
        const payment = detectImportPayment(getRowValue(row, "payment"), address);
        const dateObj = parseAnyDate(getRowValue(row, "orderDate")) || new Date();

        const cityRaw = getRowValue(row, "cityText");
        let city = resolveImportCity(cityRaw, address + " " + specs);
        if(!city) city = defaultCity || branchesList[0] || "دمياط";
        if(city && !branchesList.includes(city)){
            branchesList.push(city);
            newCitiesAdded.add(city);
        }

        const order = {
            id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 8) + "_" + i,
            booking: booking,
            phone: phone,
            customer: customer,
            address: address,
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
            populateBranchSelects();
            renderOrders();
            renderTracking();
            renderMonthlySales();
            resetImportState();
            const newCitiesMsg = newCitiesAdded.size ? `\n(تم إضافة ${newCitiesAdded.size} مركز جديد تلقائياً: ${[...newCitiesAdded].join("، ")})` : "";
            alert(`تم استيراد ${addedCount} أوردر بنجاح ✅\n(تم تخطي ${skippedCount} أوردر مكرر)${newCitiesMsg}`);
            switchTab("orders");
        }
    }else{
        alert("لم يتم إضافة أي أوردر جديد (جميع الأوردرات مكررة أو غير صالحة).");
    }
}
