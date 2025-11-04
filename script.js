// Firebase configuration
const firebaseConfig = {
  apiKey: "AIzaSyBNs0xDtFR97iFgDQlxn8ueLxFJA4L60Gc",
  authDomain: "point-of-sale-2cc64.firebaseapp.com",
  databaseURL: "https://point-of-sale-2cc64-default-rtdb.firebaseio.com/",
  projectId: "point-of-sale-2cc64",
  storageBucket: "point-of-sale-2cc64.firebasestorage.app",
  messagingSenderId: "365581311369",
  appId: "1:365581311369:web:688fb59bffae277a6ed558",
  measurementId: "G-VGS89T5DSF"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);
const auth = firebase.auth();
const db = firebase.firestore();
const rtdb = firebase.database();

// Enable offline persistence
db.enablePersistence()
  .catch((err) => {
      if (err.code == 'failed-precondition') {
          console.warn('Persistence failed: Multiple tabs open');
      } else if (err.code == 'unimplemented') {
          console.warn('Persistence is not available');
      }
  });

// Global state
let products = [];
let cart = [];
let sales = [];
let deletedSales = [];
let users = [];
let expenses = [];
let analysisAlerts = [];
let currentUser = null;
let currentPage = "pos";
let editingProductId = null;
let syncQueue = [];
let isOnline = navigator.onLine;

// Settings
let settings = {
  storeName: "Pa Gerrys Mart",
  storeAddress: "Alatishe, Ibeju Lekki, Lagos State, Nigeria",
  storePhone: "+2347037850121",
  storeEmail: "",
  currency: "₦",
  lowStockThreshold: 10,
  expiryWarningDays: 90,
  enableAutoBackup: true,
  discrepancyThreshold: 10,
  highValueThreshold: 5000,
  enableNotifications: true
};

// Local storage keys
const STORAGE_KEYS = {
  PRODUCTS: 'pagerrysmart_products',
  SALES: 'pagerrysmart_sales',
  DELETED_SALES: 'pagerrysmart_deleted_sales',
  USERS: 'pagerrysmart_users',
  SETTINGS: 'pagerrysmart_settings',
  CURRENT_USER: 'pagerrysmart_current_user',
  EXPENSES: 'pagerrysmart_expenses',
  ANALYSIS_ALERTS: 'pagerrysmart_analysis_alerts'
};

// Utility functions
function showNotification(message, type = 'success') {
  const notification = document.getElementById('notification');
  const notificationMessage = document.getElementById('notification-message');
  if (!notification || !notificationMessage) return;

  notificationMessage.textContent = message;
  notification.className = `notification ${type} show`;

  const icon = notification.querySelector('i');
  icon.className = type === 'success' ? 'fas fa-check-circle' :
      type === 'error' ? 'fas fa-exclamation-circle' :
      type === 'warning' ? 'fas fa-exclamation-triangle' :
      'fas fa-info-circle';

  setTimeout(() => notification.classList.remove('show'), 3000);
}

function formatCurrency(amount) {
  return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 2
  }).format(amount);
}

function formatDate(date) {
  if (!date) return '-';

  if (date && typeof date.toDate === 'function') {
      const d = date.toDate();
      return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }

  const d = date instanceof Date ? date : new Date(date);
  if (isNaN(d.getTime())) return '-';

  return d.toLocaleDateString() + ' ' + d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

function generateReceiptNumber() {
  const date = new Date();
  const year = date.getFullYear().toString().substr(-2);
  const month = (date.getMonth() + 1).toString().padStart(2, '0');
  const day = date.getDate().toString().padStart(2, '0');
  const random = Math.floor(Math.random() * 1000).toString().padStart(3, '0');

  return `R${year}${month}${day}${random}`;
}

// Authentication
const AuthModule = {
  async signUp(email, password, name, role = 'cashier') {
      try {
          const adminUser = auth.currentUser;
          if (!adminUser) {
              showNotification("You must be logged in as an admin to create users.", "error");
              return { success: false };
          }

          const adminEmail = adminUser.email;
          const adminPassword = prompt("Please confirm your admin password to continue:");

          await auth.signOut();
          const userCredential = await auth.createUserWithEmailAndPassword(email, password);
          const newUser = userCredential.user;

          await newUser.updateProfile({ displayName: name });

          await db.collection("users").doc(newUser.uid).set({
              uid: newUser.uid,
              name,
              email,
              role,
              createdAt: firebase.firestore.FieldValue.serverTimestamp(),
              lastLogin: firebase.firestore.FieldValue.serverTimestamp(),
              createdBy: adminUser.uid
          });

          await auth.signOut();
          await auth.signInWithEmailAndPassword(adminEmail, adminPassword);

          showNotification(`✅ User "${name}" (${role}) created successfully!`, "success");
          return { success: true };
      } catch (error) {
          console.error("Signup error:", error);
          showNotification("❌ Error creating user: " + error.message, "error");
          return { success: false, error: error.message };
      }
  },

  async signIn(email, password) {
      const loginSubmitBtn = document.getElementById('login-submit-btn');
      if (loginSubmitBtn) {
          loginSubmitBtn.classList.add('loading');
          loginSubmitBtn.disabled = true;
      }

      try {
          const userCredential = await auth.signInWithEmailAndPassword(email, password);
          const user = userCredential.user;

          await db.collection('users').doc(user.uid).update({
              lastLogin: firebase.firestore.FieldValue.serverTimestamp()
          });

          const userDoc = await db.collection('users').doc(user.uid).get();
          const userData = userDoc.data();

          currentUser = {
              uid: user.uid,
              ...userData
          };

          localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
          showApp();
          showNotification('Login successful!', 'success');
          return { success: true };
      } catch (error) {
          console.error('Signin error:', error);
          showNotification(error.message, 'error');
          return { success: false, error: error.message };
      } finally {
          if (loginSubmitBtn) {
              loginSubmitBtn.classList.remove('loading');
              loginSubmitBtn.disabled = false;
          }
      }
  },

  async signOut() {
      try {
          await auth.signOut();
          currentUser = null;
          localStorage.removeItem(STORAGE_KEYS.CURRENT_USER);
          showLogin();
          showNotification('Logged out successfully', 'info');
      } catch (error) {
          console.error('Signout error:', error);
          showNotification(error.message, 'error');
      }
  },

  isAdmin() {
      return currentUser && currentUser.role === 'admin';
  }
};

// UI Functions
function showLogin() {
  const loginPage = document.getElementById('login-page');
  const appContainer = document.getElementById('app-container');

  if (loginPage) loginPage.style.display = 'flex';
  if (appContainer) appContainer.style.display = 'none';
}

async function showApp() {
  const loginPage = document.getElementById('login-page');
  const appContainer = document.getElementById('app-container');

  if (loginPage) loginPage.style.display = 'none';
  if (appContainer) appContainer.style.display = 'flex';

  if (currentUser) {
      const currentUserEl = document.getElementById('current-user');
      const userRoleEl = document.getElementById('user-role');

      if (currentUserEl) currentUserEl.textContent = currentUser.name;
      if (userRoleEl) userRoleEl.textContent = currentUser.role;

      const usersContainer = document.getElementById('user-management-nav');
      if (usersContainer) {
          usersContainer.style.display = AuthModule.isAdmin() ? 'block' : 'none';
      }
  }

  try {
      await DataModule.fetchProducts();
      await DataModule.fetchSales();
      await DataModule.fetchDeletedSales();
      await DataModule.fetchExpenses();
      await DataModule.fetchAnalysisAlerts();

      loadProducts();
      loadSales();
      setupRealtimeListeners();
  } catch (error) {
      console.error('Error loading initial data:', error);
      showNotification('Error loading data. Using offline cache.', 'warning');

      loadProducts();
      loadSales();
      setupRealtimeListeners();
  }
}

function showPage(pageName) {
  const pageContents = document.querySelectorAll('.page-content');
  const navLinks = document.querySelectorAll('.nav-link');
  const pageTitle = document.getElementById('page-title');

  pageContents.forEach(page => page.style.display = 'none');

  const selectedPage = document.getElementById(`${pageName}-page`);
  if (selectedPage) {
      selectedPage.style.display = 'block';
  } else {
      console.warn(`Page element with id "${pageName}-page" not found.`);
  }

  navLinks.forEach(link => {
      link.classList.remove('active');
      if (link.getAttribute('data-page') === pageName) {
          link.classList.add('active');
      }
  });

  const titles = {
      'dashboard': 'Dashboard',
      'pos': 'Point of Sale',
      'inventory': 'Inventory Management',
      'sales-tracker': 'Sales Tracker',
      'sales-reports': 'Sales Reports',
      'expenses': 'Expense Management',
      'analysis': 'Inventory Analysis',
      'settings': 'Settings',
      'user-management': 'User Management'
  };

  if (pageTitle) pageTitle.textContent = titles[pageName] || 'Pa Gerrys Mart';
  currentPage = pageName;

  if (pageName === 'dashboard') {
      loadDashboard();
  } else if (pageName === 'pos') {
      loadPOSPage();
  } else if (pageName === 'inventory') {
      loadInventoryPage();
  } else if (pageName === 'sales-reports') {
      loadReportsPage();
  }
}

// Data Module
const DataModule = {
  async fetchProducts() {
      try {
          if (isOnline) {
              const snapshot = await db.collection('products').get();
              const fetchedProducts = [];
              snapshot.forEach((doc) => {
                  fetchedProducts.push({ id: doc.id, ...doc.data() });
              });

              products = fetchedProducts;
              saveToLocalStorage();

              return products;
          } else {
              return products;
          }
      } catch (error) {
          console.error('Error fetching products:', error);
          return products;
      }
  },

  async fetchSales() {
      try {
          if (isOnline) {
              const snapshot = await db.collection('sales').get();
              const fetchedSales = [];
              snapshot.forEach((doc) => {
                  fetchedSales.push({ id: doc.id, ...doc.data() });
              });

              sales = fetchedSales;
              saveToLocalStorage();

              return sales;
          } else {
              return sales;
          }
      } catch (error) {
          console.error('Error fetching sales:', error);
          return sales;
      }
  },

  async fetchDeletedSales() {
      try {
          if (isOnline) {
              const snapshot = await db.collection('deletedSales').get();
              const fetchedDeletedSales = [];
              snapshot.forEach((doc) => {
                  fetchedDeletedSales.push({ id: doc.id, ...doc.data() });
              });

              deletedSales = fetchedDeletedSales;
              saveToLocalStorage();

              return deletedSales;
          } else {
              return deletedSales;
          }
      } catch (error) {
          console.error('Error fetching deleted sales:', error);
          return deletedSales;
      }
  },

  async fetchExpenses() {
      try {
          if (isOnline) {
              const snapshot = await db.collection('expenses').get();
              const fetchedExpenses = [];
              snapshot.forEach((doc) => {
                  fetchedExpenses.push({ id: doc.id, ...doc.data() });
              });

              expenses = fetchedExpenses;
              saveToLocalStorage();

              return expenses;
          } else {
              return expenses;
          }
      } catch (error) {
          console.error('Error fetching expenses:', error);
          return expenses;
      }
  },

  async fetchAnalysisAlerts() {
      try {
          if (isOnline) {
              const snapshot = await db.collection('analysisAlerts').get();
              const fetchedAlerts = [];
              snapshot.forEach((doc) => {
                  fetchedAlerts.push({ id: doc.id, ...doc.data() });
              });

              analysisAlerts = fetchedAlerts;
              saveToLocalStorage();

              return analysisAlerts;
          } else {
              return analysisAlerts;
          }
      } catch (error) {
          console.error('Error fetching analysis alerts:', error);
          return analysisAlerts;
      }
  },

  async saveProduct(product) {
      const productModalLoading = document.getElementById('product-modal-loading');
      const saveProductBtn = document.getElementById('save-product-btn');

      if (productModalLoading) productModalLoading.style.display = 'flex';
      if (saveProductBtn) saveProductBtn.disabled = true;

      try {
          if (isOnline) {
              if (product.id && !product.id.startsWith('temp_')) {
                  await db.collection('products').doc(product.id).update(product);
              } else {
                  const docRef = await db.collection('products').add(product);
                  product.id = docRef.id;
              }

              // FIX: Find the index and REPLACE the entire product object
              const index = products.findIndex(p => p.id === product.id);
              if (index !== -1) {
                  products[index] = product; // Full replacement, not a merge
              } else {
                  products.push(product);
              }

              saveToLocalStorage();
              return { success: true, product };
          } else {
              if (!product.id || product.id.startsWith('temp_')) {
                  product.id = 'temp_' + Date.now();
              }

              // FIX: Find the index and REPLACE the entire product object for offline mode too
              const index = products.findIndex(p => p.id === product.id);
              if (index !== -1) {
                  products[index] = product; // Full replacement
              } else {
                  products.push(product);
              }

              saveToLocalStorage();
              showNotification('Saved locally. Will sync when connection is restored.', 'warning');
              return { success: true, product };
          }
      } catch (error) {
          console.error('Error saving product:', error);
          showNotification('Error saving product: ' + error.message, 'error');
          return { success: false, error };
      } finally {
          if (productModalLoading) productModalLoading.style.display = 'none';
          if (saveProductBtn) saveProductBtn.disabled = false;
      }
  },

  async updateProductStock(productId, newStock) {
      try {
          if (isOnline) {
              await db.collection('products').doc(productId).update({ stock: newStock });
          }

          const product = products.find(p => p.id === productId);
          if (product) {
              product.stock = newStock;
              saveToLocalStorage();
          }

          return { success: true };
      } catch (error) {
          console.error('Error updating product stock:', error);
          showNotification('Error updating product stock: ' + error.message, 'error');
          return { success: false, error };
      }
  }
};

// Local storage functions
function saveToLocalStorage() {
  try {
      localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
      localStorage.setItem(STORAGE_KEYS.DELETED_SALES, JSON.stringify(deletedSales));
      localStorage.setItem(STORAGE_KEYS.USERS, JSON.stringify(users));
      localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
      localStorage.setItem(STORAGE_KEYS.ANALYSIS_ALERTS, JSON.stringify(analysisAlerts));

      if (currentUser) {
          localStorage.setItem(STORAGE_KEYS.CURRENT_USER, JSON.stringify(currentUser));
      }
  } catch (e) {
      console.error('Error saving data to localStorage:', e);
  }
}

function loadFromLocalStorage() {
  try {
      const savedProducts = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      if (savedProducts) products = JSON.parse(savedProducts);

      const savedSales = localStorage.getItem(STORAGE_KEYS.SALES);
      if (savedSales) sales = JSON.parse(savedSales);

      const savedDeletedSales = localStorage.getItem(STORAGE_KEYS.DELETED_SALES);
      if (savedDeletedSales) deletedSales = JSON.parse(savedDeletedSales);

      const savedUsers = localStorage.getItem(STORAGE_KEYS.USERS);
      if (savedUsers) users = JSON.parse(savedUsers);

      const savedSettings = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (savedSettings) settings = JSON.parse(savedSettings);

      const savedCurrentUser = localStorage.getItem(STORAGE_KEYS.CURRENT_USER);
      if (savedCurrentUser) currentUser = JSON.parse(savedCurrentUser);

      const savedExpenses = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      if (savedExpenses) expenses = JSON.parse(savedExpenses);

      const savedAnalysisAlerts = localStorage.getItem(STORAGE_KEYS.ANALYSIS_ALERTS);
      if (savedAnalysisAlerts) analysisAlerts = JSON.parse(savedAnalysisAlerts);
  } catch (e) {
      console.error('Error loading data from localStorage:', e);
  }
}

// Dashboard functions
function loadDashboard() {
  const dashboardPage = document.getElementById('dashboard-page');
  if (!dashboardPage) return;

  const today = new Date();
  const todayString = today.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
  const todayDateEl = document.getElementById('dashboard-today-date');
  if (todayDateEl) todayDateEl.textContent = todayString;

  updateDashboardMetrics();
  loadTopSellingItems('today');
  setupDashboardListeners();
}

function updateDashboardMetrics() {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);

  const todaySales = sales.filter(sale => {
      const saleDate = sale.createdAt && typeof sale.createdAt.toDate === 'function'
          ? sale.createdAt.toDate()
          : new Date(sale.createdAt);
      return saleDate >= today && saleDate < tomorrow;
  });

  const todayExpenses = expenses.filter(expense => {
      const expenseDate = expense.date && typeof expense.date.toDate === 'function'
          ? expense.date.toDate()
          : new Date(expense.date);
      return expenseDate >= today && expenseDate < tomorrow;
  });

  const dailySales = todaySales.reduce((sum, sale) => sum + (sale.total || 0), 0);
  const dailyTransactions = todaySales.length;
  const dailyExpensesSum = todayExpenses.reduce((sum, expense) => sum + (expense.amount || 0), 0);
  const netProfit = dailySales - dailyExpensesSum;

  const itemsSold = todaySales.reduce((sum, sale) => {
      return sum + (sale.items ? sale.items.reduce((itemSum, item) => itemSum + (item.quantity || 0), 0) : 0);
  }, 0);

  const avgTransaction = dailyTransactions > 0 ? dailySales / dailyTransactions : 0;

  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdaySales = sales.filter(sale => {
      const saleDate = sale.createdAt && typeof sale.createdAt.toDate === 'function'
          ? sale.createdAt.toDate()
          : new Date(sale.createdAt);
      return saleDate >= yesterday && saleDate < today;
  });

  const yesterdayTotal = yesterdaySales.reduce((sum, sale) => sum + (sale.total || 0), 0);
  let trendIcon = 'fa-minus';
  let trendText = 'No change from yesterday';

  if (dailySales > yesterdayTotal) {
      trendIcon = 'fa-arrow-up';
      trendText = `Up ${formatCurrency(dailySales - yesterdayTotal)} from yesterday`;
  } else if (dailySales < yesterdayTotal) {
      trendIcon = 'fa-arrow-down';
      trendText = `Down ${formatCurrency(yesterdayTotal - dailySales)} from yesterday`;
  }

  const totalProducts = products.length;
  const inStock = products.filter(p => p.stock > 0).length;
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= settings.lowStockThreshold).length;
  const outOfStock = products.filter(p => p.stock <= 0).length;

  const highRiskItems = products.filter(p => {
      if (!p.expiryDate) return false;
      const expiryDate = new Date(p.expiryDate);
      const warningDate = new Date();
      warningDate.setDate(warningDate.getDate() + settings.expiryWarningDays);
      return expiryDate < warningDate;
  }).length;

  const unusualDiscrepancies = analysisAlerts.filter(alert =>
      alert.type === 'discrepancy' && alert.severity === 'high'
  ).length;

  const potentialLoss = analysisAlerts.reduce((sum, alert) => {
      if (alert.type === 'discrepancy' && alert.potentialLoss) {
          return sum + alert.potentialLoss;
      }
      return sum;
  }, 0);

  const lastAlert = analysisAlerts.length > 0
      ? formatDate(analysisAlerts[analysisAlerts.length - 1].createdAt)
      : 'None';

  document.getElementById('dashboard-daily-sales').textContent = formatCurrency(dailySales);
  document.getElementById('dashboard-daily-transactions').textContent = dailyTransactions;
  document.getElementById('dashboard-daily-expenses').textContent = formatCurrency(dailyExpensesSum);
  document.getElementById('dashboard-net-profit').textContent = formatCurrency(netProfit);

  document.getElementById('dashboard-today-items-sold').textContent = itemsSold;
  document.getElementById('dashboard-today-revenue').textContent = formatCurrency(dailySales);
  document.getElementById('dashboard-today-transactions').textContent = dailyTransactions;
  document.getElementById('dashboard-today-avg-transaction').textContent = formatCurrency(avgTransaction);

  const trendEl = document.getElementById('dashboard-today-trend');
  if (trendEl) {
      trendEl.innerHTML = `<i class="fas ${trendIcon}"></i> ${trendText}`;
  }

  document.getElementById('dashboard-total-products').textContent = totalProducts;
  document.getElementById('dashboard-in-stock').textContent = inStock;
  document.getElementById('dashboard-low-stock').textContent = lowStock;
  document.getElementById('dashboard-out-of-stock').textContent = outOfStock;

  document.getElementById('dashboard-high-risk-items').textContent = highRiskItems;
  document.getElementById('dashboard-unusual-discrepancies').textContent = unusualDiscrepancies;
  document.getElementById('dashboard-potential-loss').textContent = formatCurrency(potentialLoss);
  document.getElementById('dashboard-last-alert').textContent = lastAlert;
}

function loadTopSellingItems(period = 'today') {
  const topItemsList = document.getElementById('dashboard-top-items-list');
  if (!topItemsList) return;

  const now = new Date();
  let startDate = new Date();

  switch (period) {
      case 'today':
          startDate.setHours(0, 0, 0, 0);
          break;
      case 'week':
          startDate.setDate(now.getDate() - 7);
          break;
      case 'month':
          startDate.setMonth(now.getMonth() - 1);
          break;
      case 'year':
          startDate.setFullYear(now.getFullYear() - 1);
          break;
  }

  const periodSales = sales.filter(sale => {
      const saleDate = sale.createdAt && typeof sale.createdAt.toDate === 'function'
          ? sale.createdAt.toDate()
          : new Date(sale.createdAt);
      return saleDate >= startDate;
  });

  const itemSales = {};

  periodSales.forEach(sale => {
      if (sale.items) {
          sale.items.forEach(item => {
              if (!itemSales[item.id]) {
                  itemSales[item.id] = {
                      id: item.id,
                      name: item.name,
                      quantity: 0,
                      revenue: 0
                  };
              }

              itemSales[item.id].quantity += item.quantity || 0;
              itemSales[item.id].revenue += (item.price || 0) * (item.quantity || 0);
          });
      }
  });

  const sortedItems = Object.values(itemSales).sort((a, b) => b.revenue - a.revenue);

  if (sortedItems.length === 0) {
      topItemsList.innerHTML = `
          <div class="empty-state">
              <i class="fas fa-chart-bar"></i>
              <h3>No Sales Data</h3>
              <p>Start making sales to see your top selling items.</p>
          </div>
      `;
      return;
  }

  topItemsList.innerHTML = '';

  sortedItems.slice(0, 5).forEach((item, index) => {
      const itemEl = document.createElement('div');
      itemEl.className = 'top-item';

      itemEl.innerHTML = `
          <div class="top-item-rank">${index + 1}</div>
          <div class="top-item-info">
              <div class="top-item-name">${item.name}</div>
              <div class="top-item-details">
                  <span>${item.quantity} sold</span>
                  <span>${formatCurrency(item.revenue)}</span>
              </div>
          </div>
      `;

      topItemsList.appendChild(itemEl);
  });
}

function setupDashboardListeners() {
  const periodSelector = document.getElementById('dashboard-top-items-period');
  if (periodSelector) {
      periodSelector.addEventListener('change', (e) => {
          loadTopSellingItems(e.target.value);
      });
  }

  const viewDetailsBtns = document.querySelectorAll('.view-details-btn');
  viewDetailsBtns.forEach(btn => {
      btn.addEventListener('click', (e) => {
          const page = e.currentTarget.getAttribute('data-page');
          if (page) {
              showPage(page);
          }
      });
  });
}

// Page loaders
function loadPOSPage() {
  const posPage = document.getElementById('pos-page');
  if (!posPage) return;

  posPage.innerHTML = `
      <div class="pos-container">
          <div class="products-section">
              <div class="section-header">
                  <h3>Products</h3>
                  <button class="btn btn-primary" id="add-product-btn">Add Product</button>
              </div>
              <div class="search-bar">
                  <input type="text" id="product-search" placeholder="Search products...">
                  <button><i class="fas fa-search"></i></button>
              </div>
              <div class="products-grid" id="products-grid"></div>
          </div>
          <div class="cart-section">
              <h3>Current Sale</h3>
              <div class="cart-items" id="cart-items"></div>
              <div class="cart-summary">
                  <div class="summary-row total">
                      <span>Total:</span>
                      <span id="total">₦0.00</span>
                  </div>
              </div>
              <div class="cart-actions">
                  <button class="btn btn-outline" id="clear-cart-btn">Clear</button>
                  <button class="btn btn-success" id="complete-sale-btn">Complete Sale</button>
              </div>
          </div>
      </div>
  `;

  setupPOSListeners();
  renderProducts();
  updateCart();
}

function loadInventoryPage() {
  const inventoryPage = document.getElementById('inventory-page');
  if (!inventoryPage) return;

  inventoryPage.innerHTML = `
      <div class="inventory-container">
          <div class="inventory-header">
              <h3>Inventory Management</h3>
              <button class="btn btn-primary" id="add-inventory-btn">Add New Product</button>
          </div>
          <div class="search-bar">
              <input type="text" id="inventory-search" placeholder="Search products by name or category...">
              <button id="inventory-search-btn"><i class="fas fa-search"></i></button>
          </div>
          <div class="inventory-value">
              <h3>Total Inventory Value</h3>
              <div class="value" id="inventory-total-value">₦0.00</div>
          </div>
          <table class="inventory-table">
              <thead>
                  <tr>
                      <th>Name</th>
                      <th>Category</th>
                      <th>Price</th>
                      <th>Stock</th>
                      <th>Actions</th>
                  </tr>
              </thead>
              <tbody id="inventory-table-body"></tbody>
          </table>
      </div>
  `;

  setupInventoryListeners();
  renderInventoryTable();
}

function loadReportsPage() {
  const reportsPage = document.getElementById('sales-reports-page');
  if (!reportsPage) return;

  let totalSales = 0, totalTransactions = sales.length;
  sales.forEach(sale => totalSales += sale.total || 0);
  const salesTableBody = sales.map(sale => `
      <tr>
          <td>${sale.id}</td>
          <td>${formatDate(sale.createdAt)}</td>
          <td>${sale.items ? sale.items.length : 0} items</td>
          <td>${formatCurrency(sale.total || 0)}</td>
      </tr>
  `).join('');

  reportsPage.innerHTML = `
      <div class="inventory-container">
          <h3>Sales Reports</h3>
          <div class="report-section">
              <h3>Overall Summary</h3>
              <div class="sales-summary">
                  <div class="summary-card">
                      <div class="value">${formatCurrency(totalSales)}</div>
                      <div class="label">Total Sales</div>
                  </div>
                  <div class="summary-card">
                      <div class="value">${totalTransactions}</div>
                      <div class="label">Transactions</div>
                  </div>
              </div>
          </div>
          <div class="report-section">
              <h3>Recent Sales</h3>
              <table class="inventory-table">
                  <thead>
                      <tr>
                          <th>Sale ID</th>
                          <th>Date/Time</th>
                          <th>Items</th>
                          <th>Total</th>
                      </tr>
                  </thead>
                  <tbody>
                      ${salesTableBody || '<tr><td colspan="4" style="text-align:center;">No sales data available</td></tr>'}
                  </tbody>
              </table>
          </div>
      </div>
  `;
}

// Product functions
function renderProducts() {
  const productsGrid = document.getElementById('products-grid');
  if (!productsGrid) return;

  if (products.length === 0) {
      productsGrid.innerHTML = `
          <div class="empty-state">
              <i class="fas fa-box-open"></i>
              <h3>No Products Added Yet</h3>
              <p>Click "Add Product" to start adding your inventory</p>
          </div>
      `;
      return;
  }

  productsGrid.innerHTML = '';

  products.forEach(product => {
      if (product.deleted) return;

      const productCard = document.createElement('div');
      productCard.className = 'product-card';

      let stockClass = 'stock-high';
      if (product.stock <= 0) {
          stockClass = 'stock-low';
      } else if (product.stock <= settings.lowStockThreshold) {
          stockClass = 'stock-medium';
      }

      productCard.innerHTML = `
          <div class="product-img">
              <i class="fas fa-box"></i>
          </div>
          <h4>${product.name}</h4>
          <div class="price">${formatCurrency(product.price)}</div>
          <div class="stock ${stockClass}">Stock: ${product.stock}</div>
      `;

      productCard.addEventListener('click', () => addToCart(product));
      productsGrid.appendChild(productCard);
  });
}

function renderInventoryTable(searchTerm = '') {
  const tbody = document.getElementById('inventory-table-body');
  const totalValueEl = document.getElementById('inventory-total-value');

  if (!tbody) return;

  let filteredProducts = products;
  if (searchTerm) {
      filteredProducts = products.filter(product => {
          if (product.deleted) return false;
          return product.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
              product.category.toLowerCase().includes(searchTerm.toLowerCase());
      });
  }

  if (filteredProducts.length === 0) {
      tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;">No products found</td></tr>';
      if (totalValueEl) totalValueEl.textContent = formatCurrency(0);
      return;
  }

  let totalValue = 0;
  tbody.innerHTML = '';

  filteredProducts.forEach(product => {
      if (product.deleted) return;

      totalValue += product.price * product.stock;
      const row = document.createElement('tr');
      row.innerHTML = `
          <td>${product.name}</td>
          <td>${product.category}</td>
          <td>${formatCurrency(product.price)}</td>
          <td>${product.stock}</td>
          <td>
              <button class="btn btn-sm btn-primary" data-id="${product.id}" data-action="edit">Edit</button>
              <button class="btn btn-sm btn-danger" data-id="${product.id}" data-action="delete">Delete</button>
          </td>
      `;
      tbody.appendChild(row);
  });

  if (totalValueEl) totalValueEl.textContent = formatCurrency(totalValue);

  tbody.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', (e) => {
          const productId = e.target.getAttribute('data-id');
          const action = e.target.getAttribute('data-action');

          if (action === 'edit') {
              openProductModal(productId);
          } else if (action === 'delete') {
              deleteProduct(productId);
          }
      });
  });
}

// Cart functions
function addToCart(product) {
  if (product.stock <= 0) {
      showNotification('Product is out of stock', 'error');
      return;
  }

  const existingItem = cart.find(item => item.id === product.id);

  if (existingItem) {
      if (existingItem.quantity >= product.stock) {
          showNotification('Not enough stock available', 'error');
          return;
      }
      existingItem.quantity++;
  } else {
      cart.push({
          id: product.id,
          name: product.name,
          price: product.price,
          quantity: 1
      });
  }

  updateCart();
}

function updateCart() {
  const cartItemsEl = document.getElementById('cart-items');
  const totalEl = document.getElementById('total');

  if (!cartItemsEl) return;

  if (cart.length === 0) {
      cartItemsEl.innerHTML = '<p style="text-align:center; color:#999;">Cart is empty</p>';
      if (totalEl) totalEl.textContent = formatCurrency(0);
      return;
  }

  cartItemsEl.innerHTML = '';
  let total = 0;

  cart.forEach(item => {
      total += item.price * item.quantity;
      const itemEl = document.createElement('div');
      itemEl.className = 'cart-item';
      itemEl.innerHTML = `
          <div class="cart-item-info">
              <div class="cart-item-name">${item.name}</div>
              <div class="cart-item-qty">
                  <button data-id="${item.id}" data-action="decrease">-</button>
                  <span>${item.quantity}</span>
                  <button data-id="${item.id}" data-action="increase">+</button>
              </div>
          </div>
          <div class="cart-item-total">${formatCurrency(item.price * item.quantity)}</div>
      `;
      cartItemsEl.appendChild(itemEl);
  });

  if (totalEl) totalEl.textContent = formatCurrency(total);

  cartItemsEl.querySelectorAll('button').forEach(button => {
      button.addEventListener('click', (e) => {
          const productId = e.target.getAttribute('data-id');
          const action = e.target.getAttribute('data-action');

          if (action === 'increase') {
              changeQuantity(productId, 1);
          } else if (action === 'decrease') {
              changeQuantity(productId, -1);
          }
      });
  });
}

function changeQuantity(productId, delta) {
  const item = cart.find(i => i.id === productId);
  if (item) {
      item.quantity += delta;
      if (item.quantity <= 0) {
          cart = cart.filter(i => i.id !== productId);
      }
      updateCart();
  }
}

function clearCart() {
  cart = [];
  updateCart();
}

// Modal functions
async function openProductModal(productId = null) {
  const modal = document.getElementById('product-modal');
  const modalTitle = document.getElementById('modal-title');
  const form = document.getElementById('product-form');

  if (!modal || !modalTitle || !form) return;

  // Reset form and clear any previous product ID
  form.reset();
  delete form.dataset.productId;

  if (productId) {
      try {
          let product;

          // Try to get the latest product data from Firebase
          if (isOnline) {
              const productDoc = await db.collection('products').doc(productId).get();
              if (productDoc.exists) {
                  product = { id: productDoc.id, ...productDoc.data() };
              } else {
                  showNotification('Product not found', 'error');
                  return;
              }
          } else {
              // If offline, use the local data
              product = products.find(p => p.id === productId);
              if (!product) {
                  showNotification('Product not found', 'error');
                  return;
              }
          }

          modalTitle.textContent = 'Edit Product';
          // Populate form fields with the latest product data
          document.getElementById('product-name').value = product.name || '';
          document.getElementById('product-price').value = product.price || '';
          document.getElementById('product-stock').value = product.stock || '';
          document.getElementById('product-category').value = product.category || '';
          document.getElementById('product-expiry').value = product.expiryDate || '';
          document.getElementById('product-barcode').value = product.barcode || '';

          // Store the product ID for the save operation
          form.dataset.productId = productId;
      } catch (error) {
          console.error('Error fetching product:', error);
          showNotification('Error fetching product: ' + error.message, 'error');
          return;
      }
  } else {
      modalTitle.textContent = 'Add New Product';
  }

  modal.style.display = 'flex';
}

function closeProductModal() {
  const modal = document.getElementById('product-modal');
  if (modal) modal.style.display = 'none';
}

async function saveProduct() {
  const form = document.getElementById('product-form');
  if (!form) return;

  const name = document.getElementById('product-name').value.trim();
  const price = parseFloat(document.getElementById('product-price').value);
  const stock = parseInt(document.getElementById('product-stock').value);
  const category = document.getElementById('product-category').value;

  if (!name) {
      showNotification('Product name is required', 'error');
      return;
  }

  if (isNaN(price) || price <= 0) {
      showNotification('Please enter a valid price', 'error');
      return;
  }

  if (isNaN(stock) || stock < 0) {
      showNotification('Please enter a valid stock quantity', 'error');
      return;
  }

  if (!category) {
      showNotification('Please select a category', 'error');
      return;
  }

  const productId = form.dataset.productId;

  const productData = {
      name: name,
      category: category,
      price: price,
      stock: stock,
      expiryDate: document.getElementById('product-expiry').value,
      barcode: document.getElementById('product-barcode').value,
      updatedAt: new Date()
  };

  if (productId) {
      productData.id = productId;
  }

  const result = await DataModule.saveProduct(productData);

  if (result.success) {
      closeProductModal();
      renderProducts();
      // Ensure the inventory table is updated regardless of the current page
      renderInventoryTable();
      showNotification(productId ? 'Product updated successfully' : 'Product added successfully', 'success');
  } else {
      showNotification('Failed to save product', 'error');
  }
}

async function deleteProduct(productId) {
  if (!confirm('Are you sure you want to delete this product?')) {
      return;
  }

  try {
      const productToDelete = products.find(p => p.id === productId);
      if (!productToDelete) {
          showNotification('Product not found', 'error');
          return;
      }

      if (isOnline) {
          await db.collection('products').doc(productId).delete();
          products = products.filter(p => p.id !== productId);
          saveToLocalStorage();
          showNotification('Product deleted successfully', 'success');
      } else {
          const index = products.findIndex(p => p.id === productId);
          if (index !== -1) {
              products[index].deleted = true;
              products[index].deletedAt = new Date();
              saveToLocalStorage();
              showNotification('Product marked for deletion. Will sync when online.', 'warning');
          }
      }

      renderProducts();
      if (currentPage === 'inventory') {
          renderInventoryTable();
      }

  } catch (error) {
      console.error('Error deleting product:', error);
      showNotification('Error deleting product: ' + error.message, 'error');
  }
}

// Event listeners
function setupPOSListeners() {
  const addBtn = document.getElementById('add-product-btn');
  if (addBtn) {
      addBtn.addEventListener('click', () => openProductModal());
  }

  const clearBtn = document.getElementById('clear-cart-btn');
  if (clearBtn) {
      clearBtn.addEventListener('click', clearCart);
  }

  const completeBtn = document.getElementById('complete-sale-btn');
  if (completeBtn) {
      completeBtn.addEventListener('click', completeSale);
  }
}

function setupInventoryListeners() {
  const addBtn = document.getElementById('add-inventory-btn');
  if (addBtn) {
      addBtn.addEventListener('click', () => openProductModal());
  }

  const searchInput = document.getElementById('inventory-search');
  const searchBtn = document.getElementById('inventory-search-btn');

  if (searchInput && searchBtn) {
      searchBtn.addEventListener('click', () => {
          renderInventoryTable(searchInput.value);
      });

      searchInput.addEventListener('input', () => {
          renderInventoryTable(searchInput.value);
      });

      searchInput.addEventListener('keypress', (e) => {
          if (e.key === 'Enter') {
              renderInventoryTable(searchInput.value);
          }
      });
  }
}

async function completeSale() {
  if (cart.length === 0) {
      showNotification('Cart is empty', 'error');
      return;
  }

  try {
      const sale = {
          receiptNumber: generateReceiptNumber(),
          items: [...cart],
          total: cart.reduce((sum, item) => sum + (item.price * item.quantity), 0),
          createdAt: new Date(),
          cashier: currentUser.name,
          cashierId: currentUser.uid
      };

      await db.collection('sales').add(sale);

      for (const cartItem of cart) {
          const product = products.find(p => p.id === cartItem.id);
          if (product) {
              const newStock = product.stock - cartItem.quantity;
              if (newStock < 0) {
                  showNotification(`Not enough stock for ${product.name}`, 'error');
                  throw new Error(`Not enough stock for ${product.name}`);
              }

              await DataModule.updateProductStock(product.id, newStock);
          }
      }

      showNotification('Sale completed successfully', 'success');
      cart = [];
      updateCart();
      renderProducts();

      if (currentPage === 'dashboard') {
          updateDashboardMetrics();
      }
  } catch (error) {
      console.error('Error completing sale:', error);
      showNotification('Error completing sale: ' + error.message, 'error');
  }
}

function loadProducts() {
  renderProducts();
}

function loadSales() {
  // Update sales tables if needed
}

function setupRealtimeListeners() {
  if (isOnline) {
      db.collection('products').onSnapshot((snapshot) => {
          let hasChanges = false;

          snapshot.docChanges().forEach((change) => {
              const productData = { id: change.doc.id, ...change.doc.data() };
              const index = products.findIndex(p => p.id === productData.id);

              if (change.type === 'added') {
                  if (index === -1) {
                      products.push(productData);
                      hasChanges = true;
                  }
              } else if (change.type === 'modified') {
                  if (index !== -1) {
                      products[index] = productData;
                      hasChanges = true;
                  }
              } else if (change.type === 'removed') {
                  if (index !== -1) {
                      products.splice(index, 1);
                      hasChanges = true;
                  }
              }
          });

          if (hasChanges) {
              saveToLocalStorage();
              renderProducts();
              // Ensure the inventory table is always updated
              renderInventoryTable();

              if (currentPage === 'dashboard') {
                  updateDashboardMetrics();
              }
          }
      });

      db.collection('sales').onSnapshot((snapshot) => {
          let hasChanges = false;

          snapshot.docChanges().forEach((change) => {
              const saleData = { id: change.doc.id, ...change.doc.data() };
              const index = sales.findIndex(s => s.id === saleData.id);

              if (change.type === 'added' && index === -1) {
                  sales.push(saleData);
                  hasChanges = true;
              } else if (change.type === 'modified' && index !== -1) {
                  sales[index] = saleData;
                  hasChanges = true;
              } else if (change.type === 'removed' && index !== -1) {
                  sales.splice(index, 1);
                  hasChanges = true;
              }
          });

          if (hasChanges) {
              saveToLocalStorage();
              loadSales();

              if (currentPage === 'dashboard') {
                  updateDashboardMetrics();
                  loadTopSellingItems(document.getElementById('dashboard-top-items-period')?.value || 'today');
              }
          }
      });

      db.collection('expenses').onSnapshot((snapshot) => {
          let hasChanges = false;

          snapshot.docChanges().forEach((change) => {
              const expenseData = { id: change.doc.id, ...change.doc.data() };
              const index = expenses.findIndex(e => e.id === expenseData.id);

              if (change.type === 'added' && index === -1) {
                  expenses.push(expenseData);
                  hasChanges = true;
              } else if (change.type === 'modified' && index !== -1) {
                  expenses[index] = expenseData;
                  hasChanges = true;
              } else if (change.type === 'removed' && index !== -1) {
                  expenses.splice(index, 1);
                  hasChanges = true;
              }
          });

          if (hasChanges) {
              saveToLocalStorage();

              if (currentPage === 'dashboard') {
                  updateDashboardMetrics();
              }
          }
      });

      db.collection('analysisAlerts').onSnapshot((snapshot) => {
          let hasChanges = false;

          snapshot.docChanges().forEach((change) => {
              const alertData = { id: change.doc.id, ...change.doc.data() };
              const index = analysisAlerts.findIndex(a => a.id === alertData.id);

              if (change.type === 'added' && index === -1) {
                  analysisAlerts.push(alertData);
                  hasChanges = true;
              } else if (change.type === 'modified' && index !== -1) {
                  analysisAlerts[index] = alertData;
                  hasChanges = true;
              } else if (change.type === 'removed' && index !== -1) {
                  analysisAlerts.splice(index, 1);
                  hasChanges = true;
              }
          });

          if (hasChanges) {
              saveToLocalStorage();

              if (currentPage === 'dashboard') {
                  updateDashboardMetrics();
              }
          }
      });
  }
}

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
  loadFromLocalStorage();

  window.addEventListener('online', () => {
      isOnline = true;
      showNotification('You are back online!', 'success');
  });

  window.addEventListener('offline', () => {
      isOnline = false;
      showNotification('You are offline. Changes will be saved locally.', 'warning');
  });

  auth.onAuthStateChanged((user) => {
      if (user) {
          showApp();
      } else {
          showLogin();
      }
  });

  const loginForm = document.getElementById('login-form');
  if (loginForm) {
      loginForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const email = document.getElementById('login-email').value;
          const password = document.getElementById('login-password').value;
          AuthModule.signIn(email, password);
      });
  }

  const registerForm = document.getElementById('register-form');
  if (registerForm) {
      registerForm.addEventListener('submit', (e) => {
          e.preventDefault();
          const name = document.getElementById('register-name').value;
          const email = document.getElementById('register-email').value;
          const password = document.getElementById('register-password').value;
          const confirmPassword = document.getElementById('register-confirm-password').value;
          const role = document.getElementById('register-role').value;

          if (password !== confirmPassword) {
              showNotification("Passwords do not match!", "error");
              return;
          }

          AuthModule.signUp(email, password, name, role);
      });
  }

  const loginTabs = document.querySelectorAll('.login-tab');
  loginTabs.forEach(tab => {
      tab.addEventListener('click', () => {
          const tabName = tab.getAttribute('data-tab');

          loginTabs.forEach(t => t.classList.remove('active'));
          tab.classList.add('active');

          const tabContents = document.querySelectorAll('.tab-content');
          tabContents.forEach(content => {
              content.classList.remove('active');
              if (content.id === `${tabName}-form` || content.id === `${tabName}-content`) {
                  content.classList.add('active');
              }
          });
      });
  });

  const navLinks = document.querySelectorAll('.nav-link');
  navLinks.forEach(link => {
      link.addEventListener('click', (e) => {
          e.preventDefault();
          const pageName = link.getAttribute('data-page');
          showPage(pageName);
      });
  });

  const logoutBtn = document.getElementById('logout-btn');
  if (logoutBtn) {
      logoutBtn.addEventListener('click', AuthModule.signOut);
  }

  const closeProductModalBtn = document.getElementById('close-product-modal');
  if (closeProductModalBtn) {
      closeProductModalBtn.addEventListener('click', closeProductModal);
  }

  const cancelProductBtn = document.getElementById('cancel-product');
  if (cancelProductBtn) {
      cancelProductBtn.addEventListener('click', closeProductModal);
  }

  const saveProductBtn = document.getElementById('save-product-btn');
  if (saveProductBtn) {
      saveProductBtn.addEventListener('click', saveProduct);
  }

  if (currentUser && currentUser.role === 'admin') {
      const registerTab = document.getElementById('register-tab');
      if (registerTab) {
          registerTab.style.display = 'block';
      }
  }
});