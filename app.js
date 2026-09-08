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

/* LOGIN */
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

/* TABS */
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

/* LOAD / SAVE */
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

/* BRANCHES */
function populateBranchSelects(){
    const selects = [
        {id:"order-branch"},
        {id:"edit-branch"},
        {id:"branch-filter", allLabel:"كل المدن"},
        {id:"track-branch-filter", allLabel:"كل المدن"}
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

/* CALCULATIONS */
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

/* HELPERS */
function money(value){
    const number = Number(value) || 0;
    return number.toLocaleString("en-US", {minimumFractionDigits: 2, maximumFractionDigits: 2}) + " EGP";
}

function formatDate(value){
    if(!value) return "-";
    const date = new Date(value);
    if(isNaN(date.getTime())) return "-";
    return date.toLocaleDateString("en-GB", { year: "numeric", month: "2-digit", day: "2-digit" }) + " " + date.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" });
}

function escapeHtml(value){
    return String(value ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
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
    return isNaN(date.getTime()) ? null : date;
}

function getOrderNet(order){
    return Number(order.net !== undefined ? order.net : Math.max(Number(order.total || 0) - Number(order.delivery || 0), 0)) || 0;
}

function normalizeDateTimeLocal(value){
    if(!value) return getCurrentDateTimeLocal();
    const date = new Date(value);
    if(isNaN(date.getTime())) return getCurrentDateTimeLocal();
    const offset = date.getTimezoneOffset();
    return new Date(date.getTime() - offset * 60000).toISOString().slice(0, 16);
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

/* ADD ORDER */
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
        alert("من فضلك أكمل بيانات الأوردر الأساسية.");
        return;
    }

    if(onlineOrders.some(order => String(order.booking) === String(booking))){
        alert("رقم الحجز موجود بالفعل في النظام.");
        return;
    }

    const order = {
        id: Date.now().toString() + "_" + Math.random().toString(36).substring(2, 8),
        booking, phone, branch, specs, payment, total, delivery,
        net: Math.max(total - delivery, 0),
        cancelled: false,
        followStatus: "جديد",
        orderDate,
        createdAt: new Date().toISOString()
    };

    onlineOrders.unshift(order);
    if(await saveOrders()){
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

/* RENDER ORDERS */
function renderOrders(){
    const body = document.getElementById("orders-body");
    const search = (document.getElementById("search-input")?.value || "").trim().toLowerCase();
    const statusFilter = document.getElementById("status-filter")?.value || "all";
    const branchFilter = document.getElementById("branch-filter")?.value || "all";

    let filtered = [...onlineOrders];
    if(search) filtered = filtered.filter(o => String(o.booking).toLowerCase().includes(search) || String(o.phone).toLowerCase().includes(search));
    if(statusFilter === "active") filtered = filtered.filter(o => !o.cancelled);
    if(statusFilter === "cancelled") filtered = filtered.filter(o => o.cancelled);
    if(branchFilter !== "all") filtered = filtered.filter(o => String(o.branch) === branchFilter);

    filtered.sort((a, b) => (getOrderDate(b)?.getTime() || 0) - (getOrderDate(a)?.getTime() || 0));

    body.innerHTML = "";
    if(filtered.length === 0){
        body.innerHTML = '<tr><td colspan="11" class="empty">📭 لا توجد أوردرات مطابقة للبحث</td></tr>';
    }else{
        filtered.forEach((order, index) => {
            const date = formatDate(getOrderDateValue(order));
            const netValue = getOrderNet(order);
            const status = order.cancelled ? '<span class="badge cancelled">❌ ملغي</span>' : '<span class="badge active-order">✅ مؤكد</span>';
            const action = order.cancelled ? `<button class="action-btn restore" onclick="restoreOrder('${order.id}')">إعادة</button>` : `<button class="action-btn cancel" onclick="cancelOrder('${order.id}')">إلغاء</button>`;

            body.innerHTML += `<tr>
            <td>${index+1}</td>
            <td class="booking">${escapeHtml(order.booking)}</td>
            <td><span class="phone-cell"><a href="tel:${escapeHtml(order.phone)}">${escapeHtml(order.phone)}</a></span></td>
            <td><span class="branch-badge">🏪 ${escapeHtml(order.branch)}</span></td>
            <td class="amount">${money(order.total)}</td>
            <td><span class="badge ${order.payment === "فيزا" ? "visa" : "cash"}">${order.payment}</span></td>
            <td class="delivery">${money(order.delivery)}</td>
            <td class="net">${money(netValue)}</td>
            <td dir="ltr">${date}</td>
            <td>${status}</td>
            <td>
            <button class="action-btn view" onclick="viewOrderDetails('${order.id}')">عرض</button>
            <button class="action-btn edit" onclick="editOrder('${order.id}')">تعديل</button>
            ${action}
            <button class="action-btn delete" onclick="deleteOrder('${order.id}')">حذف</button>
            </td></tr>`;
        });
    }

    updateStats();
    let visibleTotal = 0, visibleNet = 0;
    filtered.forEach(o => { visibleTotal += Number(o.total) || 0; visibleNet += getOrderNet(o); });
    document.getElementById("footer-orders").textContent = filtered.length;
    document.getElementById("footer-total").textContent = money(visibleTotal);
    document.getElementById("footer-net").textContent = money(visibleNet);
}

function updateStats(){
    const active = onlineOrders.filter(o => !o.cancelled);
    let total = 0, delivery = 0, net = 0;
    active.forEach(o => { total += Number(o.total) || 0; delivery += Number(o.delivery) || 0; net += getOrderNet(o); });
    document.getElementById("stat-orders").textContent = active.length;
    document.getElementById("stat-total").textContent = money(total);
    document.getElementById("stat-delivery").textContent = money(delivery);
    document.getElementById("stat-net").textContent = money(net);
}

/* TRACKING */
function renderTracking(){
    const body = document.getElementById("tracking-body");
    if(!body) return;

    const search = (document.getElementById("track-search")?.value || "").trim().toLowerCase();
    const branchFilter = document.getElementById("track-branch-filter")?.value || "all";
    const followFilter = document.getElementById("track-follow-filter")?.value || "all";
    const statusFilter = document.getElementById("track-status-filter")?.value || "all";

    let filtered = [...onlineOrders];
    if(search) filtered = filtered.filter(o => String(o.booking).toLowerCase().includes(search) || String(o.phone).toLowerCase().includes(search));
    if(branchFilter !== "all") filtered = filtered.filter(o => String(o.branch) === branchFilter);
    if(followFilter !== "all") filtered = filtered.filter(o => String(o.followStatus || "جديد") === followFilter);
    if(statusFilter === "active") filtered = filtered.filter(o => !o.cancelled);
    if(statusFilter === "cancelled") filtered = filtered.filter(o => o.cancelled);

    filtered.sort((a, b) => (getOrderDate(b)?.getTime() || 0) - (getOrderDate(a)?.getTime() || 0));

    let totalCount = 0, newCount = 0, progressCount = 0, doneCount = 0;
    onlineOrders.forEach(o => {
        if(o.cancelled) return;
        totalCount++;
        const fs = o.followStatus || "جديد";
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
            const followStatus = order.followStatus || "جديد";
            let followSelect = `<select class="follow-select" onchange="updateFollowStatus('${order.id}', this.value)">`;
            FOLLOW_STATUSES.forEach(st => {
                followSelect += `<option value="${st}" ${st === followStatus ? "selected" : ""}>${followIcon(st)} ${st}</option>`;
            });
            followSelect += '</select>';

            body.innerHTML += `<tr>
            <td>${index+1}</td>
            <td class="booking">${escapeHtml(order.booking)}</td>
            <td><span class="phone-cell"><a href="tel:${escapeHtml(order.phone)}">${escapeHtml(order.phone)}</a></span></td>
            <td><span class="branch-badge">🏪 ${escapeHtml(order.branch)}</span></td>
            <td><div class="spec-cell">${escapeHtml(order.specs || "—")}</div></td>
            <td class="net">${money(getOrderNet(order))}</td>
            <td dir="ltr">${date}</td>
            <td>${followSelect}</td>
            <td>${order.cancelled ? '<span class="badge cancelled">❌ ملغي</span>' : '<span class="badge active-order">✅ مؤكد</span>'}</td>
            <td>
            <button class="action-btn view" onclick="viewOrderDetails('${order.id}')">عرض</button>
            <button class="action-btn edit" onclick="editOrder('${order.id}')">تعديل</button>
            </td></tr>`;
        });
    }

    let visibleProgress = 0, visibleDone = 0;
    filtered.forEach(o => {
        if(o.cancelled) return;
        const fs = o.followStatus || "جديد";
        if(fs === "تم التسليم") visibleDone++;
        else if(fs !== "جديد") visibleProgress++;
    });

    document.getElementById("track-footer-orders").textContent = filtered.length;
    document.getElementById("track-footer-progress").textContent = visibleProgress;
    document.getElementById("track-footer-done").textContent = visibleDone;
}

async function updateFollowStatus(id, value){
    const order = onlineOrders.find(o => o.id === id);
    if(!order) return;
    order.followStatus = value;
    if(await saveOrders()){ renderTracking(); renderOrders(); }
}

/* MONTHLY SALES */
const monthNames = ["يناير","فبراير","مارس","أبريل","مايو","يونيو","يوليو","أغسطس","سبتمبر","أكتوبر","نوفمبر","ديسمبر"];

function prepareMonthlyYears(){
    const select = document.getElementById("monthly-year");
    if(!select) return;
    const years = new Set();
    onlineOrders.forEach(o => { const d = getOrderDate(o); if(d) years.add(d.getFullYear()); });
    const currentYear = new Date().getFullYear();
    years.add(currentYear);
    const sortedYears = [...years].sort((a, b) => b - a);
    const oldValue = select.value;
    select.innerHTML = "";
    sortedYears.forEach(y => {
        const opt = document.createElement("option");
        opt.value = y; opt.textContent = y;
        select.appendChild(opt);
    });
    select.value = sortedYears.includes(Number(oldValue)) ? oldValue : currentYear;
}

function renderMonthlySales(){
    const body = document.getElementById("monthly-sales-body");
    const yearSelect = document.getElementById("monthly-year");
    if(!body || !yearSelect) return;
    const selectedYear = Number(yearSelect.value);

    let yearOrders = 0, yearTotal = 0, yearDelivery = 0, yearNet = 0, rows = "";

    for(let month=0; month<12; month++){
        let orders = 0, total = 0, delivery = 0, net = 0;
        onlineOrders.forEach(o => {
            if(o.cancelled) return;
            const d = getOrderDate(o);
            if(!d || d.getFullYear() !== selectedYear || d.getMonth() !== month) return;
            orders++;
            total += Number(o.total) || 0;
            delivery += Number(o.delivery) || 0;
            net += getOrderNet(o);
        });

        yearOrders += orders; yearTotal += total; yearDelivery += delivery; yearNet += net;

        rows += `<tr>
        <td class="${orders > 0 ? "month-name" : "month-zero"}">${monthNames[month]}</td>
        <td class="${orders > 0 ? "month-orders" : "month-zero"}">${orders}</td>
        <td class="${orders > 0 ? "month-total" : "month-zero"}">${money(total)}</td>
        <td class="${orders > 0 ? "month-delivery" : "month-zero"}">${money(delivery)}</td>
        <td class="${orders > 0 ? "month-net" : "month-zero"}">${money(net)}</td></tr>`;
    }

    body.innerHTML = rows;
    document.getElementById("year-orders").textContent = yearOrders;
    document.getElementById("year-total").textContent = money(yearTotal);
    document.getElementById("year-delivery").textContent = money(yearDelivery);
    document.getElementById("year-net").textContent = money(yearNet);
}

/* EDIT */
function editOrder(id){
    const order = onlineOrders.find(o => o.id === id);
    if(!order) return;
    editingOrderId = id;
    populateBranchSelects();
    document.getElementById("edit-booking").value = order.booking || "";
    document.getElementById("edit-phone").value = order.phone || "";
    document.getElementById("edit-branch").value = order.branch || branchesList[0];
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
    const order = onlineOrders.find(o => o.id === editingOrderId);
    if(!order) return;

    const booking = document.getElementById("edit-booking").value.trim();
    const phone = document.getElementById("edit-phone").value.trim();
    const branch = document.getElementById("edit-branch").value;
    const total = parseFloat(document.getElementById("edit-total").value) || 0;
    const delivery = parseFloat(document.getElementById("edit-delivery").value) || 0;

    if(!booking || !phone || total < 0 || delivery < 0){ alert("أكمل البيانات المطلوبة."); return; }

    order.booking = booking;
    order.phone = phone;
    order.branch = branch;
    order.specs = document.getElementById("edit-specs").value.trim();
    order.orderDate = document.getElementById("edit-date").value;
    order.payment = document.getElementById("edit-payment").value;
    order.total = total;
    order.delivery = delivery;
    order.net = Math.max(total - delivery, 0);

    if(await saveOrders()){
        closeEditModal();
        prepareMonthlyYears();
        renderOrders();
        renderTracking();
        renderMonthlySales();
        alert("تم التعديل بنجاح ✅");
    }
}

/* DETAILS */
function viewOrderDetails(id){
    const order = onlineOrders.find(o => o.id === id);
    if(!order) return;
    document.getElementById("details-content").innerHTML = `
    <div class="detail-row"><span>🔢 رقم الحجز</span><strong>${escapeHtml(order.booking)}</strong></div>
    <div class="detail-row"><span>📞 الهاتف</span><strong dir="ltr">${escapeHtml(order.phone)}</strong></div>
    <div class="detail-row"><span>📍 المدينة</span><strong>${escapeHtml(order.branch)}</strong></div>
    <div class="detail-row"><span>📅 التاريخ</span><strong dir="ltr">${formatDate(getOrderDateValue(order))}</strong></div>
    <div class="detail-row"><span>💰 الإجمالي</span><strong>${money(order.total)}</strong></div>
    <div class="detail-row"><span>💳 الدفع</span><strong>${order.payment}</strong></div>
    <div class="detail-row"><span>🚚 التوصيل</span><strong>${money(order.delivery)}</strong></div>
    <div class="detail-row"><span>💵 الصافي</span><strong>${money(getOrderNet(order))}</strong></div>
    <div class="detail-row full-row"><span>📝 المواصفات</span><div class="spec-text">${escapeHtml(order.specs || "لا توجد مواصفات")}</div></div>`;
    document.getElementById("details-modal").classList.add("show");
}

function closeDetailsModal(){ document.getElementById("details-modal").classList.remove("show"); }

async function cancelOrder(id){
    const order = onlineOrders.find(o => o.id === id);
    if(order && confirm("هل تريد إلغاء الأوردر؟")){ order.cancelled = true; if(await saveOrders()){ renderOrders(); renderTracking(); renderMonthlySales(); } }
}

async function restoreOrder(id){
    const order = onlineOrders.find(o => o.id === id);
    if(order){ order.cancelled = false; if(await saveOrders()){ renderOrders(); renderTracking(); renderMonthlySales(); } }
}

async function deleteOrder(id){
    if(confirm("هل تريد الحذف النهائي؟")){
        onlineOrders = onlineOrders.filter(o => o.id !== id);
        if(await saveOrders()){ prepareMonthlyYears(); renderOrders(); renderTracking(); renderMonthlySales(); }
    }
}

/* IMPORT */
let importRows = [], importHeaders = [], importMapping = {};
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
    total:["اجمالي","إجمالي","total","مبلغ","قيمة"],
    delivery:["توصيل","delivery","شحن"],
    payment:["دفع","payment","كاش","فيزا"],
    orderDate:["تاريخ","date","وقت"],
    cityText:["مدينه","مدينة","عنوان","address","فرع","branch"],
    specs:["مواصفات","تفاصيل","details","وصف","ملاحظات"]
};

function normalizeHeaderText(value){
    return String(value || "").replace(/[ً-ْٰـ]/g,"").replace(/[^\p{L}\p{N} ]/gu," ").replace(/\s+/g," ").trim().toLowerCase();
}

function guessColumnKey(header){
    const h = normalizeHeaderText(header);
    for(const field of IMPORT_FIELDS){
        for(const kw of (HEADER_KEYWORDS[field.key] || [])){ if(h.includes(kw)) return field.key; }
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
            importRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header:1, defval:"", raw:false});
            prepareImport();
        }catch(err){ alert("تعذر قراءة الملف."); }
    };
    reader.readAsArrayBuffer(file);
}

function parsePastedText(){
    const text = document.getElementById("import-paste").value.trim();
    if(!text){ alert("الصق الجدول أولاً."); return; }
    try{
        const workbook = XLSX.read(text, {type:"string"});
        importRows = XLSX.utils.sheet_to_json(workbook.Sheets[workbook.SheetNames[0]], {header:1, defval:"", raw:false});
        prepareImport();
    }catch(err){ alert("تعذر تحليل البيانات."); }
}

function prepareImport(){
    importRows = importRows.filter(row => row.some(cell => String(cell).trim() !== ""));
    if(importRows.length < 2){ alert("بيانات غير كافية."); return; }
    importHeaders = importRows[0].map(c => String(c).trim());
    importMapping = {};
    importHeaders.forEach((h, i) => { const k = guessColumnKey(h); if(k && !importMapping[k]) importMapping[k] = i; });
    if(importMapping.booking === undefined) importMapping.booking = 0;
    if(importMapping.phone === undefined) importMapping.phone = 1;
    if(importMapping.total === undefined) importMapping.total = 2;

    const defCity = document.getElementById("import-city-default");
    defCity.innerHTML = '<option value="">بدون مدينة افتراضية</option>';
    branchesList.forEach(c => defCity.innerHTML += `<option value="${c}">📍 ${c}</option>`);

    renderMappingGrid();
    renderImportPreview();
    document.getElementById("import-preview-card").style.display = "block";
}

function renderMappingGrid(){
    const grid = document.getElementById("mapping-grid");
    grid.innerHTML = "";
    IMPORT_FIELDS.forEach(field => {
        let opts = '<option value="">— بدون —</option>';
        importHeaders.forEach((h, i) => { opts += `<option value="${i}" ${importMapping[field.key] === i ? "selected" : ""}>${h || ("عمود "+(i+1))}</option>`; });
        grid.innerHTML += `<div class="mapping-item"><label>${field.label}</label><select onchange="importMapping['${field.key}'] = this.value === '' ? undefined : Number(this.value); renderImportPreview();">${opts}</select></div>`;
    });
}

function getRowValue(row, key){
    const idx = importMapping[key];
    return idx !== undefined && row[idx] !== undefined ? String(row[idx]).trim() : "";
}

function autoDetectCity(text){
    const t = String(text).toLowerCase();
    for(const c of branchesList){ if(t.includes(c.toLowerCase())) return c; }
    return "";
}

function renderImportPreview(){
    const body = document.getElementById("import-preview-body");
    const startRow = document.getElementById("import-has-headers").checked ? 1 : 0;
    body.innerHTML = "";
    let shown = 0, newC = 0, dupC = 0;
    const existing = new Set(onlineOrders.map(o => String(o.booking)));

    for(let i = startRow; i < importRows.length && shown < 50; i++){
        const row = importRows[i];
        const booking = getRowValue(row, "booking");
        if(!booking) continue;
        shown++;
        const city = autoDetectCity(getRowValue(row, "cityText") + " " + getRowValue(row, "specs"));
        const isDup = existing.has(booking);
        if(isDup) dupC++; else newC++;

        body.innerHTML += `<tr><td>${shown}</td><td class="booking">${escapeHtml(booking)}</td><td>${escapeHtml(getRowValue(row, "phone"))}</td><td>${city || "غير محدد"}</td><td class="amount">${money(getRowValue(row, "total"))}</td><td>${isDup ? "مكرر" : "جديد"}</td></tr>`;
    }
    document.getElementById("import-summary").innerHTML = `الإجمالي: ${importRows.length - startRow} | جديد: ${newC} | مكرر: ${dupC}`;
}

async function runImport(){
    const startRow = document.getElementById("import-has-headers").checked ? 1 : 0;
    const existing = new Set(onlineOrders.map(o => String(o.booking)));
    const defCity = document.getElementById("import-city-default").value;
    let added = 0;

    for(let i = startRow; i < importRows.length; i++){
        const row = importRows[i];
        const booking = getRowValue(row, "booking");
        if(!booking || existing.has(booking)) continue;

        const total = parseFloat(getRowValue(row, "total")) || 0;
        const delivery = parseFloat(getRowValue(row, "delivery")) || 0;
        const specs = getRowValue(row, "specs");
        let city = autoDetectCity(getRowValue(row, "cityText") + " " + specs) || defCity || branchesList[0];

        onlineOrders.unshift({
            id: Date.now() + "_" + Math.random().toString(36).substring(2, 6) + "_" + i,
            booking,
            phone: getRowValue(row, "phone") || "01000000000",
            branch: city,
            specs,
            payment: getRowValue(row, "payment").includes("فيزا") ? "فيزا" : "كاش",
            total,
            delivery,
            net: Math.max(total - delivery, 0),
            cancelled: false,
            followStatus: "جديد",
            orderDate: getCurrentDateTimeLocal(),
            createdAt: new Date().toISOString()
        });
        added++;
    }

    if(added > 0 && await saveOrders()){
        prepareMonthlyYears();
        renderOrders();
        renderTracking();
        renderMonthlySales();
        document.getElementById("import-preview-card").style.display = "none";
        alert(`تم استيراد ${added} أوردر بنجاح ✅`);
    }
}
