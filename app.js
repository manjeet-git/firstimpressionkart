/* ============ FIREBASE INIT (compat SDK) ============ */
const firebaseConfig = {
  apiKey: "AIzaSyCFC0jtiEcND6t7LfEGroFryycZC6Mff8k",
  authDomain: "firstimpressionkart.firebaseapp.com",
  projectId: "firstimpressionkart",
  storageBucket: "firstimpressionkart.firebasestorage.app",
  messagingSenderId: "952915116410",
  appId: "1:952915116410:web:42f9ea95128df7b43456c3",
  measurementId: "G-T84VZTDXPY"
};
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();

const SUPERADMIN_EMAIL = "manjeettechkumar@gmail.com";
const STATUSES = ["Initiated", "In-Progress", "Ready to Pickup"];

/* ============ STATE ============ */
let currentUser = null;
let isAdmin = false;
let allProducts = [];
let cart = []; // {productId,name,price,discount,imageUrl,qty,stock}
let unsubProducts = null;
let unsubMyOrders = null;
let unsubAdminOrders = null;
let stockChartInstance = null;
let editingProductId = null;

/* ============ UTIL ============ */
function $(id){ return document.getElementById(id); }
function money(n){ return "₹" + Number(n).toFixed(2); }
function toast(msg){
  const t = document.createElement("div");
  t.className = "toast";
  t.textContent = msg;
  $("toastHost").appendChild(t);
  setTimeout(()=>t.remove(), 2800);
}
function statusClass(s){ return "status-" + s.replace(/\s+/g,"-"); }
function finalPrice(p){ return p.price * (1 - (p.discount||0)/100); }

/* ============ VIEW SWITCHING ============ */
function hideAllViews(){
  ["view-loggedout","view-shop","view-myorders","view-admin-products","view-admin-orders","view-admin-stock"]
    .forEach(id => $(id).classList.add("hidden"));
}
function showView(id){
  hideAllViews();
  $(id).classList.remove("hidden");
  if(id === "view-admin-products"){
    document.querySelectorAll("#adminNav button").forEach(b=>b.classList.remove("active"));
    $("navAdminProducts").classList.add("active");
  }
  if(id === "view-admin-orders"){
    document.querySelectorAll("#adminNav button").forEach(b=>b.classList.remove("active"));
    $("navAdminOrders").classList.add("active");
  }
  if(id === "view-admin-stock"){
    document.querySelectorAll("#adminNav button").forEach(b=>b.classList.remove("active"));
    $("navAdminStock").classList.add("active");
    renderStockChart();
  }
}

/* ============ AUTH ============ */
function renderAuthArea(){
  const area = $("authArea");
  area.innerHTML = "";
  if(currentUser){
    const chip = document.createElement("div");
    chip.className = "user-chip";
    chip.innerHTML = `<img src="${currentUser.photoURL||''}" onerror="this.style.display='none'">
      <span>${currentUser.displayName || currentUser.email}</span>`;
    const logoutBtn = document.createElement("button");
    logoutBtn.className = "pill-btn";
    logoutBtn.textContent = "Logout";
    logoutBtn.onclick = () => auth.signOut();
    area.appendChild(chip);
    area.appendChild(logoutBtn);
  } else {
    const loginBtn = document.createElement("button");
    loginBtn.className = "pill-btn";
    loginBtn.textContent = "Sign in with Google";
    loginBtn.onclick = doLogin;
    area.appendChild(loginBtn);
  }
}
function doLogin(){
  const provider = new firebase.auth.GoogleAuthProvider();
  auth.signInWithPopup(provider).catch(err => toast("Login failed: " + err.message));
}

auth.onAuthStateChanged(user => {
  currentUser = user;
  isAdmin = !!(user && user.email === SUPERADMIN_EMAIL);
  renderAuthArea();

  // clean up old listeners
  if(unsubMyOrders){ unsubMyOrders(); unsubMyOrders = null; }
  if(unsubAdminOrders){ unsubAdminOrders(); unsubAdminOrders = null; }

  if(!user){
    $("adminNav").classList.add("hidden");
    $("btnMyOrders").classList.add("hidden");
    $("btnCart").classList.add("hidden");
    $("searchWrap").classList.add("hidden");
    showView("view-loggedout");
    return;
  }

  $("searchWrap").classList.remove("hidden");

  if(isAdmin){
    $("adminNav").classList.remove("hidden");
    $("btnMyOrders").classList.add("hidden");
    $("btnCart").classList.add("hidden");
    listenAdminOrders();
    showView("view-admin-products");
  } else {
    $("adminNav").classList.add("hidden");
    $("btnMyOrders").classList.remove("hidden");
    $("btnCart").classList.remove("hidden");
    listenMyOrders();
    showView("view-shop");
  }
});

/* ============ PRODUCTS: LOAD (realtime) ============ */
function listenProducts(){
  if(unsubProducts) return;
  unsubProducts = db.collection("products").onSnapshot(snap => {
    allProducts = [];
    snap.forEach(doc => allProducts.push({ id: doc.id, ...doc.data() }));
    populateCategoryFilters();
    renderShopGrid();
    renderAdminProductTable();
  }, err => toast("Error loading products: " + err.message));
}
listenProducts();

function populateCategoryFilters(){
  const cats = [...new Set(allProducts.map(p => p.category).filter(Boolean))].sort();
  [$("categoryFilter"), $("adminCategoryFilter")].forEach(sel => {
    const current = sel.value;
    sel.innerHTML = '<option value="">All categories</option>' +
      cats.map(c => `<option value="${c}">${c}</option>`).join("");
    sel.value = current;
  });
}

/* ============ SHOP GRID (customer) ============ */
function getFilteredProducts(){
  const cat = $("categoryFilter").value;
  const q = $("searchInput").value.trim().toLowerCase();
  return allProducts.filter(p => {
    const matchCat = !cat || p.category === cat;
    const matchQ = !q || (p.name||"").toLowerCase().includes(q);
    return matchCat && matchQ;
  });
}
function renderShopGrid(){
  const grid = $("productGrid");
  const list = getFilteredProducts();
  if(list.length === 0){
    grid.innerHTML = '<div class="empty-msg">No products found.</div>';
    return;
  }
  grid.innerHTML = list.map(p => {
    const fp = finalPrice(p);
    const outOfStock = (p.stock||0) <= 0;
    return `
    <div class="pcard">
      <img src="${p.imageUrl}" alt="${p.name}" onerror="this.src='https://placehold.co/300x200?text=No+Image'">
      <div class="pcard-body">
        <span class="pcard-cat">${p.category||""}</span>
        <h4>${p.name}</h4>
        <div class="pcard-desc">${p.description||""}</div>
        <div class="price-row">
          <span class="price-now">${money(fp)}</span>
          ${p.discount ? `<span class="price-old">${money(p.price)}</span><span class="discount-badge">${p.discount}% off</span>` : ""}
        </div>
        <div class="stock-txt ${outOfStock?'low':'ok'}">${outOfStock ? "Out of stock" : p.stock + " in stock"}</div>
        <button class="btn block" ${outOfStock?"disabled":""} onclick="addToCart('${p.id}')">Add to Cart</button>
      </div>
    </div>`;
  }).join("");
}
$("categoryFilter").addEventListener("change", renderShopGrid);
$("searchInput").addEventListener("input", renderShopGrid);

/* ============ CART ============ */
function addToCart(productId){
  const p = allProducts.find(x => x.id === productId);
  if(!p) return;
  if((p.stock||0) <= 0){ toast("Out of stock"); return; }
  const existing = cart.find(c => c.productId === productId);
  if(existing){
    if(existing.qty >= p.stock){ toast("No more stock available"); return; }
    existing.qty++;
  } else {
    cart.push({ productId, name: p.name, price: p.price, discount: p.discount||0, imageUrl: p.imageUrl, qty: 1, stock: p.stock });
  }
  renderCartCount();
  renderCartDrawer();
  toast(p.name + " added to cart");
}
function renderCartCount(){
  const count = cart.reduce((s,c)=>s+c.qty,0);
  $("cartCount").textContent = count;
}
function cartTotal(){
  return cart.reduce((s,c) => s + (c.price*(1-c.discount/100))*c.qty, 0);
}
function renderCartDrawer(){
  const wrap = $("cartItemsList");
  if(cart.length === 0){
    wrap.innerHTML = '<div class="empty-msg">Your cart is empty.</div>';
  } else {
    wrap.innerHTML = cart.map((c,i) => `
      <div class="cart-item">
        <img src="${c.imageUrl}" onerror="this.src='https://placehold.co/100?text=No+Image'">
        <div class="cart-item-info">
          <h5>${c.name}</h5>
          <div>${money(c.price*(1-c.discount/100))} x ${c.qty} = <strong>${money(c.price*(1-c.discount/100)*c.qty)}</strong></div>
          <div class="qty-row">
            <button onclick="changeQty(${i},-1)">-</button>
            <span>${c.qty}</span>
            <button onclick="changeQty(${i},1)">+</button>
            <button onclick="removeCartItem(${i})" style="margin-left:8px;color:#FF6B6B;">Remove</button>
          </div>
        </div>
      </div>`).join("");
  }
  $("cartTotalAmt").textContent = money(cartTotal());
}
function changeQty(i, delta){
  const item = cart[i];
  const newQty = item.qty + delta;
  if(newQty <= 0){ cart.splice(i,1); }
  else if(newQty > item.stock){ toast("No more stock available"); return; }
  else { item.qty = newQty; }
  renderCartCount();
  renderCartDrawer();
}
function removeCartItem(i){
  cart.splice(i,1);
  renderCartCount();
  renderCartDrawer();
}
$("btnCart").addEventListener("click", () => {
  renderCartDrawer();
  $("cartOverlay").classList.remove("hidden");
});
$("closeCart").addEventListener("click", () => $("cartOverlay").classList.add("hidden"));
$("cartOverlay").addEventListener("click", (e) => { if(e.target.id === "cartOverlay") $("cartOverlay").classList.add("hidden"); });

/* ============ PLACE ORDER ============ */
$("placeOrderBtn").addEventListener("click", async () => {
  if(!currentUser){ toast("Please sign in first"); return; }
  if(cart.length === 0){ toast("Your cart is empty"); return; }
  $("placeOrderBtn").disabled = true;
  try{
    const items = cart.map(c => ({
      productId: c.productId, name: c.name, price: c.price,
      discount: c.discount, qty: c.qty
    }));
    const total = cartTotal();

    await db.runTransaction(async (tx) => {
      // verify & decrement stock
      const productRefs = items.map(it => db.collection("products").doc(it.productId));
      const snaps = await Promise.all(productRefs.map(ref => tx.get(ref)));
      snaps.forEach((snap, idx) => {
        const data = snap.data();
        if(!data || (data.stock||0) < items[idx].qty){
          throw new Error("Insufficient stock for " + items[idx].name);
        }
      });
      snaps.forEach((snap, idx) => {
        tx.update(productRefs[idx], { stock: snap.data().stock - items[idx].qty });
      });
      const orderRef = db.collection("orders").doc();
      tx.set(orderRef, {
        userId: currentUser.uid,
        userEmail: currentUser.email,
        userName: currentUser.displayName || currentUser.email,
        items: items,
        total: total,
        status: "Initiated",
        createdAt: firebase.firestore.FieldValue.serverTimestamp()
      });
    });

    cart = [];
    renderCartCount();
    renderCartDrawer();
    $("cartOverlay").classList.add("hidden");
    toast("Order placed successfully!");
    showView("view-myorders");
  } catch(err){
    toast("Order failed: " + err.message);
  } finally {
    $("placeOrderBtn").disabled = false;
  }
});

/* ============ MY ORDERS (customer) ============ */
function listenMyOrders(){
  unsubMyOrders = db.collection("orders")
    .where("userId", "==", currentUser.uid)
    .onSnapshot(snap => {
      const orders = [];
      snap.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
      orders.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
      renderMyOrders(orders);
    }, err => toast("Error loading orders: " + err.message));
}
function renderMyOrders(orders){
  const wrap = $("myOrdersList");
  if(orders.length === 0){
    wrap.innerHTML = '<div class="empty-msg">You have no orders yet.</div>';
    return;
  }
  wrap.innerHTML = orders.map(o => {
    const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : "Just now";
    const itemsHtml = o.items.map(it => `${it.name} x${it.qty}`).join(", ");
    return `
    <div class="card" style="margin-bottom:14px;">
      <div style="display:flex;justify-content:space-between;flex-wrap:wrap;gap:8px;">
        <div>
          <strong>Order #${o.id.slice(0,8)}</strong>
          <div style="color:var(--muted);font-size:12px;">${date}</div>
        </div>
        <span class="status-badge ${statusClass(o.status)}">${o.status}</span>
      </div>
      <div style="margin:10px 0;font-size:13px;">${itemsHtml}</div>
      <div style="display:flex;justify-content:space-between;align-items:center;">
        <strong>${money(o.total)}</strong>
        <button class="btn small" onclick='downloadBill(${JSON.stringify(o).replace(/'/g,"&#39;")})'>Download Bill (PDF)</button>
      </div>
    </div>`;
  }).join("");
}

/* ============ PDF BILL ============ */
function downloadBill(order){
  const { jsPDF } = window.jspdf;
  const doc = new jsPDF();
  doc.setFontSize(18);
  doc.text("FirstImpressionKart", 14, 18);
  doc.setFontSize(11);
  doc.text("Order Invoice", 14, 26);
  doc.setFontSize(10);
  doc.text("Order ID: " + order.id, 14, 36);
  doc.text("Customer: " + (order.userName||order.userEmail), 14, 42);
  doc.text("Email: " + order.userEmail, 14, 48);
  doc.text("Status: " + order.status, 14, 54);

  let y = 66;
  doc.setFontSize(11);
  doc.text("Item", 14, y);
  doc.text("Qty", 110, y);
  doc.text("Price", 135, y);
  doc.text("Subtotal", 165, y);
  y += 4;
  doc.line(14, y, 196, y);
  y += 8;
  doc.setFontSize(10);
  order.items.forEach(it => {
    const unit = it.price * (1 - (it.discount||0)/100);
    doc.text(String(it.name).slice(0,40), 14, y);
    doc.text(String(it.qty), 110, y);
    doc.text(unit.toFixed(2), 135, y);
    doc.text((unit*it.qty).toFixed(2), 165, y);
    y += 8;
  });
  y += 4;
  doc.line(14, y, 196, y);
  y += 10;
  doc.setFontSize(12);
  doc.text("Total: " + money(order.total), 140, y);

  doc.save(`invoice_${order.id}.pdf`);
}

/* ============ ADMIN: PRODUCT CRUD ============ */
function renderAdminProductTable(){
  const cat = $("adminCategoryFilter").value;
  const q = $("adminSearchInput").value.trim().toLowerCase();
  const list = allProducts.filter(p => {
    const matchCat = !cat || p.category === cat;
    const matchQ = !q || (p.name||"").toLowerCase().includes(q);
    return matchCat && matchQ;
  });
  const tbody = $("adminProductTable");
  if(list.length === 0){
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No products found.</td></tr>';
    return;
  }
  tbody.innerHTML = list.map(p => `
    <tr>
      <td><img class="tbl-img" src="${p.imageUrl}" onerror="this.src='https://placehold.co/60?text=NA'"></td>
      <td>${p.name}</td>
      <td>${p.category||""}</td>
      <td>${money(p.price)}</td>
      <td>${p.discount||0}%</td>
      <td>${p.stock}</td>
      <td>
        <button class="btn small outline" onclick="editProduct('${p.id}')">Edit</button>
        <button class="btn small accent" onclick="deleteProduct('${p.id}')">Delete</button>
      </td>
    </tr>`).join("");
}
$("adminCategoryFilter").addEventListener("change", renderAdminProductTable);
$("adminSearchInput").addEventListener("input", renderAdminProductTable);

$("productForm").addEventListener("submit", async (e) => {
  e.preventDefault();
  const data = {
    name: $("pName").value.trim(),
    category: $("pCategory").value.trim(),
    imageUrl: $("pImage").value.trim(),
    price: parseFloat($("pPrice").value) || 0,
    discount: parseFloat($("pDiscount").value) || 0,
    stock: parseInt($("pStock").value) || 0,
    description: $("pDesc").value.trim()
  };
  try{
    if(editingProductId){
      await db.collection("products").doc(editingProductId).update(data);
      toast("Product updated");
    } else {
      data.createdAt = firebase.firestore.FieldValue.serverTimestamp();
      await db.collection("products").add(data);
      toast("Product added");
    }
    resetProductForm();
  } catch(err){
    toast("Error: " + err.message);
  }
});
function editProduct(id){
  const p = allProducts.find(x => x.id === id);
  if(!p) return;
  editingProductId = id;
  $("pName").value = p.name;
  $("pCategory").value = p.category||"";
  $("pImage").value = p.imageUrl;
  $("pPrice").value = p.price;
  $("pDiscount").value = p.discount||0;
  $("pStock").value = p.stock;
  $("pDesc").value = p.description||"";
  $("productFormTitle").textContent = "Edit Product";
  $("productSubmitBtn").textContent = "Save Changes";
  $("cancelEditBtn").classList.remove("hidden");
  window.scrollTo({top:0, behavior:"smooth"});
}
function resetProductForm(){
  editingProductId = null;
  $("productForm").reset();
  $("productFormTitle").textContent = "Add New Product";
  $("productSubmitBtn").textContent = "Add Product";
  $("cancelEditBtn").classList.add("hidden");
}
$("cancelEditBtn").addEventListener("click", resetProductForm);
async function deleteProduct(id){
  if(!confirm("Delete this product?")) return;
  try{
    await db.collection("products").doc(id).delete();
    toast("Product deleted");
  } catch(err){
    toast("Error: " + err.message);
  }
}

/* ============ ADMIN: ORDERS MANAGEMENT ============ */
function listenAdminOrders(){
  unsubAdminOrders = db.collection("orders").onSnapshot(snap => {
    const orders = [];
    snap.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));
    orders.sort((a,b) => (b.createdAt?.seconds||0) - (a.createdAt?.seconds||0));
    renderAdminOrders(orders);
  }, err => toast("Error loading orders: " + err.message));
}
function renderAdminOrders(orders){
  const tbody = $("adminOrdersTable");
  if(orders.length === 0){
    tbody.innerHTML = '<tr><td colspan="7" class="empty-msg">No orders yet.</td></tr>';
    return;
  }
  tbody.innerHTML = orders.map(o => {
    const date = o.createdAt?.toDate ? o.createdAt.toDate().toLocaleString() : "Just now";
    const itemsSummary = o.items.map(it => `${it.name} x${it.qty}`).join(", ");
    const options = STATUSES.map(s => `<option value="${s}" ${s===o.status?"selected":""}>${s}</option>`).join("");
    return `
    <tr>
      <td>${o.id.slice(0,8)}</td>
      <td>${o.userName||""}<br><span style="color:var(--muted);font-size:11px;">${o.userEmail}</span></td>
      <td>${itemsSummary}</td>
      <td>${money(o.total)}</td>
      <td>${date}</td>
      <td><span class="status-badge ${statusClass(o.status)}">${o.status}</span></td>
      <td>
        <select id="sel-${o.id}">${options}</select>
        <button class="btn small" onclick="updateOrderStatus('${o.id}')">Update</button>
      </td>
    </tr>`;
  }).join("");
}
async function updateOrderStatus(orderId){
  const sel = $("sel-" + orderId);
  try{
    await db.collection("orders").doc(orderId).update({ status: sel.value });
    toast("Order status updated");
  } catch(err){
    toast("Error: " + err.message);
  }
}

/* ============ ADMIN: STOCK CHART ============ */
function renderStockChart(){
  const ctx = $("stockChart").getContext("2d");
  const labels = allProducts.map(p => p.name);
  const data = allProducts.map(p => p.stock||0);
  if(stockChartInstance) stockChartInstance.destroy();
  stockChartInstance = new Chart(ctx, {
    type: "bar",
    data: {
      labels,
      datasets: [{
        label: "Stock quantity",
        data,
        backgroundColor: "#6C5CE7",
        borderRadius: 6
      }]
    },
    options: {
      responsive: true,
      plugins: { legend: { display: false } },
      scales: { y: { beginAtZero: true, ticks: { precision: 0 } } }
    }
  });
}

/* ============ NAV BUTTONS ============ */
$("btnShop").addEventListener("click", () => showView(isAdmin ? "view-admin-products" : "view-shop"));
$("btnMyOrders").addEventListener("click", () => showView("view-myorders"));
$("btnHeroLogin").addEventListener("click", doLogin);
$("navAdminProducts").addEventListener("click", () => showView("view-admin-products"));
$("navAdminOrders").addEventListener("click", () => showView("view-admin-orders"));
$("navAdminStock").addEventListener("click", () => showView("view-admin-stock"));

/* expose functions used inline in HTML strings */
window.addToCart = addToCart;
window.changeQty = changeQty;
window.removeCartItem = removeCartItem;
window.editProduct = editProduct;
window.deleteProduct = deleteProduct;
window.updateOrderStatus = updateOrderStatus;
window.downloadBill = downloadBill;
