// ================================================
// BILLKEEPER - Mobile-First Bill Tracker App
// ================================================

// API Base URL
const API_URL = 'http://localhost:8000';

// Global state
let bills = [];
let categoryChart = null;
let trendChart = null;
let currentImagePath = null;
let deleteTargetId = null;

// Category configuration
const CATEGORIES = {
    food: { icon: '🍔', color: '#e07a5f' },
    travel: { icon: '✈️', color: '#457b9d' },
    shopping: { icon: '🛍️', color: '#9c6644' },
    utilities: { icon: '💡', color: '#e9c46a' },
    healthcare: { icon: '💊', color: '#81b29a' },
    entertainment: { icon: '🎬', color: '#d4a5a5' },
    other: { icon: '📦', color: '#9c958a' }
};

// DOM Elements
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const reviewSection = document.getElementById('review-section');
const uploadSection = document.getElementById('upload-section');
const imagePreview = document.getElementById('image-preview');
const retakeBtn = document.getElementById('retake-btn');
const billForm = document.getElementById('bill-form');
const extractionWarning = document.getElementById('extraction-warning');
const billsList = document.getElementById('bills-list');
const noBills = document.getElementById('no-bills');
const exportBtn = document.getElementById('export-btn');
const loadingOverlay = document.getElementById('loading-overlay');
const toast = document.getElementById('toast');
const navItems = document.querySelectorAll('.nav-item[data-tab]');
const addBtn = document.getElementById('add-btn');
const billsSection = document.getElementById('bills-section');
const insightsSection = document.getElementById('insights-section');
const deleteModal = document.getElementById('delete-modal');
const quickTotal = document.getElementById('quick-total');
const imageConfirmModal = document.getElementById('image-confirm-modal');
const confirmPreviewImg = document.getElementById('confirm-preview-img');
let pendingFile = null;

// Initialize app
document.addEventListener('DOMContentLoaded', () => {
    initNavigation();
    initDropZone();
    initForm();
    initExport();
    initModal();
    initImageConfirmModal();
    fetchBills();
    fetchInsights();
});

// ================================================
// NAVIGATION
// ================================================
function initNavigation() {
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const tab = item.dataset.tab;
            switchTab(tab);
        });
    });

    // Add button triggers upload
    addBtn.addEventListener('click', () => {
        switchTab('bills');
        // Scroll to top and trigger file input
        window.scrollTo({ top: 0, behavior: 'smooth' });
        setTimeout(() => {
            dropZone.click();
        }, 300);
    });
}

function switchTab(tab) {
    // Update nav active state
    navItems.forEach(item => {
        item.classList.toggle('active', item.dataset.tab === tab);
    });

    // Show/hide sections
    if (tab === 'bills') {
        uploadSection.classList.remove('hidden-tab');
        billsSection.classList.remove('hidden-tab');
        insightsSection.classList.remove('active');
    } else if (tab === 'insights') {
        uploadSection.classList.add('hidden-tab');
        billsSection.classList.add('hidden-tab');
        insightsSection.classList.add('active');
        fetchInsights();
    }
}

// ================================================
// DROP ZONE / FILE UPLOAD
// ================================================
function initDropZone() {
    dropZone.addEventListener('click', () => fileInput.click());

    dropZone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('dragover');
    });

    dropZone.addEventListener('dragleave', () => {
        dropZone.classList.remove('dragover');
    });

    dropZone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('dragover');
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            handleFile(files[0]);
        }
    });

    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleFile(e.target.files[0]);
        }
    });

    retakeBtn.addEventListener('click', () => {
        resetUpload();
        fileInput.click();
    });
}

function handleFile(file) {
    if (!file.type.startsWith('image/')) {
        showToast('Please select an image file', 'error');
        return;
    }

    // Store pending file
    pendingFile = file;

    // Show confirmation modal with preview
    const reader = new FileReader();
    reader.onload = (e) => {
        confirmPreviewImg.src = e.target.result;
        imageConfirmModal.classList.remove('hidden');
    };
    reader.readAsDataURL(file);
}

function createFileList(file) {
    const dt = new DataTransfer();
    dt.items.add(file);
    return dt.files;
}

function resetUpload() {
    uploadSection.classList.remove('hidden');
    reviewSection.classList.add('hidden');
    extractionWarning.classList.add('hidden');
    billForm.reset();
    currentImagePath = null;
    pendingFile = null;
    fileInput.value = '';
    // Reset to default category
    document.getElementById('cat-food').checked = true;
}

// ================================================
// BILL EXTRACTION
// ================================================
async function extractBill(file) {
    showLoading(true);

    try {
        const formData = new FormData();
        formData.append('file', file || fileInput.files[0]);

        const response = await fetch(`${API_URL}/upload`, {
            method: 'POST',
            body: formData
        });

        if (!response.ok) {
            throw new Error('Failed to upload image');
        }

        const data = await response.json();

        // Store image path
        currentImagePath = data.image_path;
        document.getElementById('image-path').value = data.image_path;

        // Show warning if extraction failed
        if (!data.extraction_success) {
            extractionWarning.classList.remove('hidden');
        } else {
            extractionWarning.classList.add('hidden');
        }

        // Populate form with extracted data
        document.getElementById('vendor').value = data.vendor_name || '';

        // Set category radio button
        const category = data.category || 'other';
        const categoryRadio = document.getElementById(`cat-${category}`);
        if (categoryRadio) {
            categoryRadio.checked = true;
        }

        document.getElementById('date').value = data.date || getTodayDate();
        document.getElementById('amount').value = data.total_amount || '';

        showToast('Bill scanned', 'success');
    } catch (error) {
        console.error('Extract error:', error);
        extractionWarning.classList.remove('hidden');
        // Set today's date as default
        document.getElementById('date').value = getTodayDate();
        showToast('Could not read bill automatically', 'error');
    } finally {
        showLoading(false);
    }
}

function getTodayDate() {
    return new Date().toISOString().split('T')[0];
}

// ================================================
// FORM HANDLING
// ================================================
function initForm() {
    billForm.addEventListener('submit', async (e) => {
        e.preventDefault();

        const amount = parseFloat(document.getElementById('amount').value);
        if (amount <= 0) {
            showToast('Enter a valid amount', 'error');
            return;
        }

        await saveBill();
    });
}

async function saveBill() {
    showLoading(true);

    try {
        // Get selected category from radio buttons
        const categoryRadio = document.querySelector('input[name="category"]:checked');
        const category = categoryRadio ? categoryRadio.value : 'other';

        const billData = {
            vendor: document.getElementById('vendor').value,
            category: category,
            date: document.getElementById('date').value,
            amount: parseFloat(document.getElementById('amount').value),
            image_path: document.getElementById('image-path').value
        };

        const response = await fetch(`${API_URL}/bills`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(billData)
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.detail || 'Failed to save bill');
        }

        // Reset and refresh
        resetUpload();
        await fetchBills();
        await fetchInsights();

        showToast('Bill saved!', 'success');
    } catch (error) {
        console.error('Save error:', error);
        showToast('Failed to save bill', 'error');
    } finally {
        showLoading(false);
    }
}

// ================================================
// BILLS LIST
// ================================================
async function fetchBills() {
    try {
        const response = await fetch(`${API_URL}/bills`);
        if (!response.ok) {
            throw new Error('Failed to fetch bills');
        }

        bills = await response.json();
        renderBillsList(bills);
    } catch (error) {
        console.error('Fetch bills error:', error);
    }
}

function renderBillsList(bills) {
    billsList.innerHTML = '';

    if (bills.length === 0) {
        noBills.classList.remove('hidden');
        return;
    }

    noBills.classList.add('hidden');

    bills.forEach((bill, index) => {
        const cat = CATEGORIES[bill.category] || CATEGORIES.other;

        const item = document.createElement('div');
        item.className = 'bill-item';
        item.style.setProperty('--cat-color', cat.color);
        item.style.animationDelay = `${index * 0.05}s`;

        item.innerHTML = `
            <div class="bill-category-icon" style="background: ${cat.color}20;">
                ${cat.icon}
            </div>
            <div class="bill-details">
                <div class="bill-vendor">${escapeHtml(bill.vendor)}</div>
                <div class="bill-meta">
                    <span>${formatDate(bill.date)}</span>
                    <span class="bill-category-tag">${bill.category}</span>
                </div>
            </div>
            <div class="bill-amount">${formatCurrency(bill.amount)}</div>
            <button class="bill-delete" data-id="${bill.id}" aria-label="Delete bill">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                    <path d="M3 6h18M19 6v14a2 2 0 01-2 2H7a2 2 0 01-2-2V6m3 0V4a2 2 0 012-2h4a2 2 0 012 2v2"/>
                </svg>
            </button>
        `;

        // Add delete handler
        const deleteBtn = item.querySelector('.bill-delete');
        deleteBtn.addEventListener('click', (e) => {
            e.stopPropagation();
            showDeleteModal(bill.id);
        });

        billsList.appendChild(item);
    });
}

// ================================================
// DELETE MODAL
// ================================================
function initModal() {
    const backdrop = deleteModal.querySelector('.modal-backdrop');
    const cancelBtn = deleteModal.querySelector('.modal-cancel');
    const confirmBtn = deleteModal.querySelector('.modal-confirm');

    backdrop.addEventListener('click', hideDeleteModal);
    cancelBtn.addEventListener('click', hideDeleteModal);
    confirmBtn.addEventListener('click', confirmDelete);
}

function showDeleteModal(id) {
    deleteTargetId = id;
    deleteModal.classList.remove('hidden');
}

function hideDeleteModal() {
    deleteModal.classList.add('hidden');
    deleteTargetId = null;
}

// ================================================
// IMAGE CONFIRMATION MODAL
// ================================================
function initImageConfirmModal() {
    const backdrop = imageConfirmModal.querySelector('.modal-backdrop');
    const retakeBtn = document.getElementById('image-retake');
    const confirmBtn = document.getElementById('image-confirm');

    backdrop.addEventListener('click', hideImageConfirmModal);
    retakeBtn.addEventListener('click', () => {
        hideImageConfirmModal();
        // Trigger file input again
        setTimeout(() => fileInput.click(), 100);
    });
    confirmBtn.addEventListener('click', confirmImageSelection);
}

function hideImageConfirmModal() {
    imageConfirmModal.classList.add('hidden');
    pendingFile = null;
    fileInput.value = '';
}

function confirmImageSelection() {
    if (!pendingFile) return;

    // Hide modal
    imageConfirmModal.classList.add('hidden');

    // Show review section with preview
    imagePreview.src = confirmPreviewImg.src;
    uploadSection.classList.add('hidden');
    reviewSection.classList.remove('hidden');

    // Store the file for upload
    fileInput.files = createFileList(pendingFile);

    // Extract bill data
    extractBill(pendingFile);
    pendingFile = null;
}

async function confirmDelete() {
    if (!deleteTargetId) return;

    const idToDelete = deleteTargetId;
    hideDeleteModal();
    await deleteBill(idToDelete);
}

async function deleteBill(id) {
    showLoading(true);

    try {
        const response = await fetch(`${API_URL}/bills/${id}`, {
            method: 'DELETE'
        });

        if (!response.ok) {
            throw new Error('Failed to delete bill');
        }

        await fetchBills();
        await fetchInsights();

        showToast('Bill deleted', 'success');
    } catch (error) {
        console.error('Delete error:', error);
        showToast('Failed to delete bill', 'error');
    } finally {
        showLoading(false);
    }
}

// ================================================
// INSIGHTS
// ================================================
async function fetchInsights() {
    try {
        const response = await fetch(`${API_URL}/insights`);
        if (!response.ok) {
            throw new Error('Failed to fetch insights');
        }

        const data = await response.json();
        renderInsights(data);
    } catch (error) {
        console.error('Fetch insights error:', error);
    }
}

function renderInsights(data) {
    // Update stat cards
    const monthTotal = data.total_this_month || 0;
    document.getElementById('total-month').textContent = formatCurrency(monthTotal);
    document.getElementById('total-year').textContent = formatCurrency(data.total_this_year || 0);

    // Update header quick total
    quickTotal.textContent = formatCurrencyShort(monthTotal);

    // Render charts - use yearly data if monthly is empty
    const categoryData = (data.spending_by_category && data.spending_by_category.length > 0)
        ? data.spending_by_category
        : (data.spending_by_category_year || []);

    const isYearlyData = data.spending_by_category?.length === 0 && categoryData.length > 0;

    renderCategoryChart(categoryData, isYearlyData);
    renderTrendChart(data.monthly_trend || []);
    renderMonthlyBreakdown(data.monthly_breakdown || []);
}

function renderCategoryChart(data, isYearlyData = false) {
    const ctx = document.getElementById('category-chart').getContext('2d');
    const legendContainer = document.getElementById('category-legend');
    const chartCard = document.querySelector('.chart-card h3');

    // Update chart title based on data period
    if (chartCard) {
        chartCard.textContent = isYearlyData ? 'By Category (This Year)' : 'By Category';
    }

    // Destroy existing chart
    if (categoryChart) {
        categoryChart.destroy();
    }

    if (data.length === 0) {
        legendContainer.innerHTML = '<span style="color: var(--text-muted); font-size: 0.85rem;">No data yet</span>';
        return;
    }

    const labels = data.map(d => capitalizeFirst(d.category));
    const values = data.map(d => d.total);
    const colors = data.map(d => CATEGORIES[d.category]?.color || CATEGORIES.other.color);

    categoryChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                backgroundColor: colors,
                borderWidth: 0,
                cutout: '65%'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1a1612',
                    titleFont: { family: "'DM Sans', sans-serif", size: 12 },
                    bodyFont: { family: "'DM Sans', sans-serif", size: 14 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: (context) => ` ${formatCurrency(context.raw)}`
                    }
                }
            }
        }
    });

    // Custom legend
    legendContainer.innerHTML = data.map(d => `
        <div class="legend-item">
            <span class="legend-dot" style="background: ${CATEGORIES[d.category]?.color || CATEGORIES.other.color}"></span>
            <span>${capitalizeFirst(d.category)}</span>
        </div>
    `).join('');
}

function renderTrendChart(data) {
    const ctx = document.getElementById('trend-chart').getContext('2d');

    // Destroy existing chart
    if (trendChart) {
        trendChart.destroy();
    }

    if (data.length === 0) {
        return;
    }

    const labels = data.map(d => formatMonth(d.month));
    const values = data.map(d => d.total);

    // Create gradient
    const gradient = ctx.createLinearGradient(0, 0, 0, 180);
    gradient.addColorStop(0, 'rgba(198, 93, 59, 0.3)');
    gradient.addColorStop(1, 'rgba(198, 93, 59, 0)');

    trendChart = new Chart(ctx, {
        type: 'line',
        data: {
            labels: labels,
            datasets: [{
                data: values,
                borderColor: '#c65d3b',
                backgroundColor: gradient,
                fill: true,
                tension: 0.4,
                pointBackgroundColor: '#c65d3b',
                pointBorderColor: '#fff',
                pointBorderWidth: 2,
                pointRadius: 4,
                pointHoverRadius: 6
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: '#1a1612',
                    titleFont: { family: "'DM Sans', sans-serif", size: 12 },
                    bodyFont: { family: "'DM Sans', sans-serif", size: 14 },
                    padding: 12,
                    cornerRadius: 8,
                    callbacks: {
                        label: (context) => ` ${formatCurrency(context.raw)}`
                    }
                }
            },
            scales: {
                x: {
                    grid: {
                        display: false
                    },
                    ticks: {
                        font: { family: "'DM Sans', sans-serif", size: 11 },
                        color: '#9c958a'
                    }
                },
                y: {
                    beginAtZero: true,
                    grid: {
                        color: 'rgba(156, 149, 138, 0.1)'
                    },
                    ticks: {
                        font: { family: "'DM Sans', sans-serif", size: 11 },
                        color: '#9c958a',
                        callback: value => '₹' + formatNumberShort(value)
                    }
                }
            }
        }
    });
}

function renderMonthlyBreakdown(data) {
    const container = document.getElementById('monthly-breakdown');
    const noData = document.getElementById('no-monthly-data');

    container.innerHTML = '';

    if (!data || data.length === 0) {
        noData.classList.remove('hidden');
        return;
    }

    noData.classList.add('hidden');

    data.forEach((monthData, index) => {
        const isCurrentMonth = index === 0;
        const monthItem = document.createElement('div');
        monthItem.className = `month-item${isCurrentMonth ? ' expanded' : ''}`;

        const monthLabel = formatMonthYear(monthData.month);

        // Create category bars HTML
        const categoryBarsHtml = monthData.categories.map(cat => {
            const catConfig = CATEGORIES[cat.category] || CATEGORIES.other;
            const percentage = (cat.total / monthData.total) * 100;
            return `
                <div class="category-bar-row">
                    <div class="category-bar-info">
                        <span class="category-bar-icon">${catConfig.icon}</span>
                        <span class="category-bar-name">${capitalizeFirst(cat.category)}</span>
                        <span class="category-bar-count">${cat.count} bill${cat.count > 1 ? 's' : ''}</span>
                    </div>
                    <div class="category-bar-right">
                        <div class="category-bar-track">
                            <div class="category-bar-fill" style="width: ${percentage}%; background: ${catConfig.color}"></div>
                        </div>
                        <span class="category-bar-amount">${formatCurrency(cat.total)}</span>
                    </div>
                </div>
            `;
        }).join('');

        monthItem.innerHTML = `
            <div class="month-header" onclick="toggleMonthItem(this)">
                <div class="month-info">
                    <span class="month-name">${monthLabel}</span>
                    <span class="month-category-count">${monthData.categories.length} categor${monthData.categories.length === 1 ? 'y' : 'ies'}</span>
                </div>
                <div class="month-total-wrap">
                    <span class="month-total">${formatCurrency(monthData.total)}</span>
                    <svg class="month-chevron" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                        <path d="M6 9l6 6 6-6"/>
                    </svg>
                </div>
            </div>
            <div class="month-details">
                <div class="category-bars">
                    ${categoryBarsHtml}
                </div>
            </div>
        `;

        container.appendChild(monthItem);
    });
}

function toggleMonthItem(header) {
    const monthItem = header.parentElement;
    monthItem.classList.toggle('expanded');
}

function formatMonthYear(monthStr) {
    if (!monthStr) return '-';
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-IN', {
        month: 'long',
        year: 'numeric'
    });
}

// ================================================
// EXPORT
// ================================================
function initExport() {
    exportBtn.addEventListener('click', exportCSV);
}

function exportCSV() {
    if (bills.length === 0) {
        showToast('No bills to export', 'error');
        return;
    }

    const headers = ['Date', 'Vendor', 'Category', 'Amount'];
    const rows = bills.map(bill => [
        bill.date,
        `"${bill.vendor.replace(/"/g, '""')}"`,
        bill.category,
        bill.amount.toFixed(2)
    ]);

    const csvContent = [
        headers.join(','),
        ...rows.map(row => row.join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);

    link.setAttribute('href', url);
    link.setAttribute('download', `billkeeper_${new Date().toISOString().split('T')[0]}.csv`);
    link.style.visibility = 'hidden';

    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);

    showToast('Bills exported', 'success');
}

// ================================================
// UTILITY FUNCTIONS
// ================================================
function formatCurrency(amount) {
    return '₹' + parseFloat(amount).toLocaleString('en-IN', {
        minimumFractionDigits: 0,
        maximumFractionDigits: 0
    });
}

function formatCurrencyShort(amount) {
    if (amount >= 100000) {
        return '₹' + (amount / 100000).toFixed(1) + 'L';
    } else if (amount >= 1000) {
        return '₹' + (amount / 1000).toFixed(1) + 'K';
    }
    return '₹' + Math.round(amount);
}

function formatNumberShort(num) {
    if (num >= 100000) {
        return (num / 100000).toFixed(1) + 'L';
    } else if (num >= 1000) {
        return (num / 1000).toFixed(0) + 'K';
    }
    return num;
}

function formatDate(dateStr) {
    if (!dateStr) return '-';
    const date = new Date(dateStr);
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    if (date.toDateString() === today.toDateString()) {
        return 'Today';
    } else if (date.toDateString() === yesterday.toDateString()) {
        return 'Yesterday';
    }

    return date.toLocaleDateString('en-IN', {
        day: 'numeric',
        month: 'short'
    });
}

function formatMonth(monthStr) {
    if (!monthStr) return '-';
    const [year, month] = monthStr.split('-');
    const date = new Date(year, month - 1);
    return date.toLocaleDateString('en-IN', {
        month: 'short'
    });
}

function capitalizeFirst(str) {
    return str.charAt(0).toUpperCase() + str.slice(1);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(show) {
    if (show) {
        loadingOverlay.classList.remove('hidden');
    } else {
        loadingOverlay.classList.add('hidden');
    }
}

function showToast(message, type = 'success') {
    toast.textContent = message;
    toast.className = `toast ${type}`;

    setTimeout(() => {
        toast.classList.add('hidden');
    }, 2500);
}

// Make functions available globally for debugging
window.fetchBills = fetchBills;
window.fetchInsights = fetchInsights;
window.toggleMonthItem = toggleMonthItem;
